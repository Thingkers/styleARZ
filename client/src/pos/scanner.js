// After a hit, keep ignoring that same code until it leaves the frame for CLEAR_MS.
const CLEAR_MS = 1200;
const MIN_GAP_MS = 900;
const NATIVE_FORMATS = ["code_128", "code_39", "ean_13", "ean_8", "upc_a", "upc_e", "qr_code", "itf"];
const CAPTURE_HELP = "No barcode found. Hold the label flat inside the orange frame, fill most of the box, then tap Capture again.";

function isBenignScanError(error) {
  if (!error) return true;
  const name = String(error.name || "");
  const message = String(error.message || error || "").toLowerCase();
  return (
    name === "NotFoundException" ||
    message.includes("no multiformat readers") ||
    message.includes("notfoundexception") ||
    message.includes("not found")
  );
}

async function zxingHints() {
  const { BarcodeFormat, DecodeHintType } = await import("@zxing/library");
  const hints = new Map();
  hints.set(DecodeHintType.TRY_HARDER, true);
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.CODE_128,
    BarcodeFormat.CODE_39,
    BarcodeFormat.EAN_13,
    BarcodeFormat.EAN_8,
    BarcodeFormat.UPC_A,
    BarcodeFormat.UPC_E,
    BarcodeFormat.ITF,
    BarcodeFormat.QR_CODE,
  ]);
  return hints;
}

function createScanGate(onDetected) {
  let lockedCode = "";
  let lastSeenLocked = 0;
  let lastEmitAt = 0;
  let lastEmitted = "";

  function unlockIfClear(now = Date.now()) {
    if (lockedCode && now - lastSeenLocked >= CLEAR_MS) lockedCode = "";
  }

  function lock(barcode) {
    const value = String(barcode || "").trim();
    if (!value) return;
    const now = Date.now();
    lockedCode = value;
    lastSeenLocked = now;
    lastEmitAt = now;
    lastEmitted = value;
  }

  return {
    /** Continuous camera detection — one hit until the code leaves the frame */
    seen(value) {
      const barcode = String(value || "").trim();
      if (!barcode) {
        unlockIfClear();
        return;
      }
      const now = Date.now();
      unlockIfClear(now);
      if (barcode === lockedCode) {
        lastSeenLocked = now;
        return;
      }
      if (barcode === lastEmitted && now - lastEmitAt < MIN_GAP_MS) return;
      lock(barcode);
      try {
        navigator.vibrate?.(40);
      } catch {
        /* ignore */
      }
      onDetected(barcode);
    },
    /** No barcode in this frame — eventually re-arm the locked code */
    miss() {
      unlockIfClear();
    },
    /** After Capture/manual add: block continuous re-adds of the same code */
    lock,
  };
}

function videoConstraints() {
  return {
    audio: false,
    video: {
      facingMode: { ideal: "environment" },
      width: { ideal: 1920 },
      height: { ideal: 1080 },
    },
  };
}

async function createNativeDetector() {
  if (!("BarcodeDetector" in window)) return null;
  try {
    if (typeof window.BarcodeDetector.getSupportedFormats === "function") {
      const supported = await window.BarcodeDetector.getSupportedFormats();
      const formats = NATIVE_FORMATS.filter((format) => supported.includes(format));
      if (!formats.length) return null;
      return new window.BarcodeDetector({ formats });
    }
    return new window.BarcodeDetector({ formats: NATIVE_FORMATS });
  } catch {
    return null;
  }
}

function enhanceCanvas(source) {
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.filter = "contrast(1.35) brightness(1.08) grayscale(1)";
  context.drawImage(source, 0, 0);
  context.filter = "none";
  return canvas;
}

function cropCenter(source, widthRatio = 0.78, heightRatio = 0.38) {
  const width = Math.max(32, Math.round(source.width * widthRatio));
  const height = Math.max(32, Math.round(source.height * heightRatio));
  const x = Math.max(0, Math.round((source.width - width) / 2));
  const y = Math.max(0, Math.round((source.height - height) / 2));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(source, x, y, width, height, 0, 0, width, height);
  return canvas;
}

function drawVideoFrame(video) {
  if (!video?.videoWidth || !video?.videoHeight) {
    throw new Error("Camera is not ready yet. Wait a moment, then try again.");
  }
  const maxEdge = 1800;
  const scale = Math.min(2, maxEdge / Math.max(video.videoWidth, video.videoHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
  canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas;
}

async function decodeWithZxing(canvas) {
  const { BrowserMultiFormatReader, BrowserMultiFormatOneDReader } = await import("@zxing/browser");
  const hints = await zxingHints();
  const readers = [new BrowserMultiFormatOneDReader(hints), new BrowserMultiFormatReader(hints)];
  for (const reader of readers) {
    try {
      const result = await reader.decodeFromCanvas(canvas);
      const text = String(result.getText() || "").trim();
      if (text) return text;
    } catch (error) {
      if (!isBenignScanError(error)) throw error;
    }
  }
  return "";
}

async function decodeCanvas(canvas) {
  const detector = await createNativeDetector();
  if (detector) {
    try {
      const results = await detector.detect(canvas);
      const value = results[0]?.rawValue && String(results[0].rawValue).trim();
      if (value) return value;
    } catch {
      /* try ZXing */
    }
  }
  return decodeWithZxing(canvas);
}

async function decodeCandidates(canvases) {
  for (const canvas of canvases) {
    const value = await decodeCanvas(canvas);
    if (value) return value;
    const boosted = await decodeCanvas(enhanceCanvas(canvas));
    if (boosted) return boosted;
  }
  return "";
}

export async function captureBarcodeFromVideo(video) {
  const full = drawVideoFrame(video);
  const center = cropCenter(full, 0.8, 0.42);
  const tight = cropCenter(full, 0.68, 0.28);
  const value = await decodeCandidates([center, tight, full]);
  if (!value) throw new Error(CAPTURE_HELP);
  return value;
}

async function nativeScanner(video, gate) {
  const detector = await createNativeDetector();
  if (!detector) throw new Error("Native barcode detector unavailable.");

  const stream = await navigator.mediaDevices.getUserMedia(videoConstraints());
  video.srcObject = stream;
  video.setAttribute("playsinline", "true");
  video.muted = true;
  await video.play();

  let stopped = false;
  let timer;
  const inspect = async () => {
    if (stopped) return;
    try {
      if (video.readyState >= 2) {
        const results = await detector.detect(video);
        if (results[0]?.rawValue) gate.seen(results[0].rawValue);
        else gate.miss();
      }
    } catch {
      gate.miss();
    }
    if (!stopped) timer = window.setTimeout(inspect, 280);
  };
  inspect();

  return {
    stop: () => {
      stopped = true;
      window.clearTimeout(timer);
      stream.getTracks().forEach((track) => track.stop());
      video.srcObject = null;
    },
    capture: async () => {
      const value = await captureBarcodeFromVideo(video);
      gate.lock(value);
      return value;
    },
  };
}

async function zxingScanner(video, gate, onError) {
  const { BrowserMultiFormatOneDReader } = await import("@zxing/browser");
  const reader = new BrowserMultiFormatOneDReader(await zxingHints(), {
    delayBetweenScanAttempts: 220,
    delayBetweenScanSuccess: 1800,
  });
  const controls = await reader.decodeFromConstraints(videoConstraints(), video, (result, error) => {
    if (result) gate.seen(result.getText());
    else if (isBenignScanError(error)) gate.miss();
    // Normal while aiming — never show "No MultiFormat Readers were able to detect the code".
    if (error && !isBenignScanError(error)) onError?.(error);
  });

  return {
    stop: () => {
      try {
        controls.stop();
      } catch {
        /* ignore */
      }
      video.srcObject?.getTracks?.().forEach((track) => track.stop());
      video.srcObject = null;
    },
    capture: async () => {
      const value = await captureBarcodeFromVideo(video);
      gate.lock(value);
      return value;
    },
  };
}

export function canUseCameraScanner() {
  return Boolean(navigator.mediaDevices?.getUserMedia);
}

export async function startCameraScanner({ video, onDetected, onError }) {
  if (!video || !canUseCameraScanner()) throw new Error("Camera scanning is unavailable in this browser.");
  const gate = createScanGate(onDetected);

  try {
    const detector = await createNativeDetector();
    if (detector) return await nativeScanner(video, gate);
  } catch {
    /* fall through */
  }

  try {
    return await zxingScanner(video, gate, onError);
  } catch (zxingError) {
    onError?.(zxingError);
    throw zxingError;
  }
}
