import QRCode from "qrcode";

const PAIR_HINT = "Hold steady on the QR until it beeps.";

function videoConstraints() {
  return {
    audio: false,
    video: {
      facingMode: { ideal: "environment" },
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
  };
}

/** Draw a pairing payload as a large, low-ECC QR for in-shop screen scanning. */
export async function drawPairingQr(canvas, payload) {
  if (!canvas || !payload) return;
  await QRCode.toCanvas(canvas, payload, {
    width: 280,
    margin: 1,
    errorCorrectionLevel: "L",
    color: { dark: "#0a0a0a", light: "#ffffff" },
  });
}

async function createQrDetector() {
  if (!("BarcodeDetector" in window)) return null;
  try {
    if (typeof window.BarcodeDetector.getSupportedFormats === "function") {
      const supported = await window.BarcodeDetector.getSupportedFormats();
      if (!supported.includes("qr_code")) return null;
    }
    return new window.BarcodeDetector({ formats: ["qr_code"] });
  } catch {
    return null;
  }
}

/**
 * Open the camera and call onPayload once a QR is read, then stop.
 * Used for offline WebRTC offer/answer exchange with no internet.
 */
export async function startPairingQrScanner({ video, onPayload, onError }) {
  if (!video || !navigator.mediaDevices?.getUserMedia) {
    throw new Error("Camera is unavailable for QR pairing.");
  }

  let stopped = false;
  let emitted = false;
  let timer = 0;
  let controls = null;
  let stream = null;

  const cleanup = () => {
    stopped = true;
    window.clearTimeout(timer);
    try {
      controls?.stop?.();
    } catch {
      /* ignore */
    }
    stream?.getTracks?.().forEach((track) => track.stop());
    if (video) video.srcObject = null;
  };

  const finish = (value) => {
    const text = String(value || "").trim();
    if (!text || emitted || stopped) return;
    emitted = true;
    try {
      navigator.vibrate?.(40);
    } catch {
      /* ignore */
    }
    cleanup();
    onPayload?.(text);
  };

  const detector = await createQrDetector();
  if (detector) {
    stream = await navigator.mediaDevices.getUserMedia(videoConstraints());
    video.srcObject = stream;
    video.setAttribute("playsinline", "true");
    video.muted = true;
    await video.play();

    const inspect = async () => {
      if (stopped) return;
      try {
        if (video.readyState >= 2) {
          const results = await detector.detect(video);
          const value = results[0]?.rawValue && String(results[0].rawValue).trim();
          if (value) {
            finish(value);
            return;
          }
        }
      } catch (error) {
        onError?.(error);
      }
      if (!stopped) timer = window.setTimeout(inspect, 220);
    };
    inspect();
    return { stop: cleanup, hint: PAIR_HINT };
  }

  const { BrowserMultiFormatReader } = await import("@zxing/browser");
  const { BarcodeFormat, DecodeHintType } = await import("@zxing/library");
  const hints = new Map();
  hints.set(DecodeHintType.TRY_HARDER, true);
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE]);
  const reader = new BrowserMultiFormatReader(hints, {
    delayBetweenScanAttempts: 200,
    delayBetweenScanSuccess: 1200,
  });

  controls = await reader.decodeFromConstraints(videoConstraints(), video, (result, error) => {
    if (result) finish(result.getText());
    else if (error && error.name !== "NotFoundException") onError?.(error);
  });
  stream = video.srcObject;

  return { stop: cleanup, hint: PAIR_HINT };
}

export function canUsePairingQrScanner() {
  return Boolean(navigator.mediaDevices?.getUserMedia);
}

/** True when this device likely has a camera (desktops often do not). */
export async function hasPairingCamera() {
  if (!canUsePairingQrScanner()) return false;
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    if (devices.some((device) => device.kind === "videoinput")) return true;
    // Some browsers hide devices until permission; assume possible if API exists on mobile-ish UAs.
    if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) return true;
    return false;
  } catch {
    return false;
  }
}

export async function copyPairingText(text) {
  const value = String(text || "").trim();
  if (!value) throw new Error("Nothing to copy.");
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const area = document.createElement("textarea");
  area.value = value;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.left = "-9999px";
  document.body.appendChild(area);
  area.select();
  const ok = document.execCommand("copy");
  area.remove();
  if (!ok) throw new Error("Could not copy. Long-press the text and copy manually.");
}
