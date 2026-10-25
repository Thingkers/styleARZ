import { useEffect, useRef, useState } from "react";
import { Modal } from "../../components/ui";

const MAX_EDGE = 1600;
// The API rejects images larger than 2 MB once decoded.
const MAX_BYTES = 1.9 * 1024 * 1024;

function canUseLiveCamera() {
  return Boolean(navigator.mediaDevices?.getUserMedia);
}

function toJpeg(source, width, height) {
  if (!width || !height) throw new Error("Couldn't read the image dimensions. Try another photo.");
  const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Your browser couldn't prepare this photo. Try another browser or image.");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingQuality = "high";
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  for (const quality of [0.86, 0.74, 0.6, 0.45]) {
    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    if (dataUrl.length * 0.75 <= MAX_BYTES) return dataUrl;
  }
  throw new Error("That photo is too large. Try a smaller image.");
}

async function photoFromFile(file) {
  if (file.type && !file.type.startsWith("image/")) throw new Error("Choose an image file.");
  if (typeof createImageBitmap === "function") {
    let image;
    try {
      image = await createImageBitmap(file, {
        resizeWidth: MAX_EDGE,
        resizeHeight: MAX_EDGE,
        resizeQuality: "high",
        resizeMode: "max",
      });
    } catch {
      throw new Error("Couldn't read that image. Try a JPEG or PNG photo.");
    }
    try {
      return toJpeg(image, image.width, image.height);
    } finally {
      image.close();
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode().catch(() => {
      throw new Error("Couldn't read that image. Try a JPEG or PNG photo.");
    });
    return toJpeg(image, image.naturalWidth, image.naturalHeight);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function cameraMessage(error) {
  switch (error?.name) {
    case "NotAllowedError":
    case "SecurityError":
      return "Camera access was blocked. Allow it in your browser settings, or use Take photo instead.";
    case "NotFoundError":
    case "OverconstrainedError":
      return "No camera was found on this device.";
    case "NotReadableError":
      return "The camera is busy in another app.";
    default:
      return error?.message || "Could not start the camera.";
  }
}

function LiveCamera({ onCapture, onClose }) {
  const videoRef = useRef(null);
  const [facing, setFacing] = useState("environment");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let stream = null;
    let cancelled = false;
    setReady(false);
    setError("");
    navigator.mediaDevices
      .getUserMedia({
        audio: false,
        video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1440 } },
      })
      .then((media) => {
        if (cancelled) {
          media.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = media;
        const video = videoRef.current;
        if (!video) {
          media.getTracks().forEach((track) => track.stop());
          return;
        }
        video.srcObject = media;
        video.play().catch(() => {
          if (!cancelled) {
            setReady(false);
            setError("The camera preview couldn't start. Close it and try again, or use Take photo instead.");
          }
        });
      })
      .catch((err) => {
        if (!cancelled) setError(cameraMessage(err));
      });
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((track) => track.stop());
      if (videoRef.current?.srcObject === stream) videoRef.current.srcObject = null;
    };
  }, [facing]);

  function capture() {
    const video = videoRef.current;
    if (!video?.videoWidth) return;
    try {
      onCapture(toJpeg(video, video.videoWidth, video.videoHeight));
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <Modal title="Live camera" onClose={onClose}>
      <div className="inv-camera-body">
        <div className="inv-camera">
          <video ref={videoRef} autoPlay playsInline muted onPlaying={() => setReady(true)} />
          {!ready && !error && <p>Starting camera…</p>}
        </div>
        {error && <p className="error">{error}</p>}
        <div className="inv-camera-actions">
          <button type="button" className="btn solid" disabled={!ready} onClick={capture}>
            Capture
          </button>
          <button
            type="button"
            className="btn line"
            onClick={() => setFacing((current) => (current === "environment" ? "user" : "environment"))}
          >
            Flip camera
          </button>
          <button type="button" className="text-link" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default function ItemPhoto({ src, onChange, onRemove, note }) {
  const [camera, setCamera] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const operationRef = useRef(0);

  useEffect(() => () => {
    operationRef.current += 1;
  }, []);

  async function onFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const operation = ++operationRef.current;
    setError("");
    setWorking(true);
    try {
      const dataUrl = await photoFromFile(file);
      if (operation === operationRef.current) onChange(dataUrl);
    } catch (err) {
      if (operation === operationRef.current) setError(err.message);
    } finally {
      if (operation === operationRef.current) setWorking(false);
    }
  }

  function removePhoto() {
    operationRef.current += 1;
    setWorking(false);
    setError("");
    onRemove();
  }

  function capturePhoto(dataUrl) {
    operationRef.current += 1;
    setWorking(false);
    setError("");
    onChange(dataUrl);
    setCamera(false);
  }

  return (
    <div className="inv-photo">
      {src ? (
        <div className="inv-photo-frame has-photo">
          <img src={src} alt="Item photo" />
        </div>
      ) : (
        <label className="inv-photo-frame inv-file">
          {working ? (
            <span>Preparing photo…</span>
          ) : (
            <>
              <span className="inv-frame-touch">Tap to take a photo</span>
              <span className="inv-frame-pointer">Choose a photo</span>
            </>
          )}
          <input type="file" accept="image/*" capture="environment" onChange={onFile} disabled={working} />
        </label>
      )}
      {note && <p className="muted inv-photo-note">{note}</p>}
      {error && <p className="error">{error}</p>}
      <div className="inv-photo-actions">
        <label className="btn dark inv-file inv-file-capture">
          Take photo
          <input type="file" accept="image/*" capture="environment" onChange={onFile} disabled={working} />
        </label>
        <label className="btn line inv-file">
          {src ? "Replace photo" : "Upload photo"}
          <input type="file" accept="image/*" onChange={onFile} disabled={working} />
        </label>
        {canUseLiveCamera() && (
          <button type="button" className="btn line" disabled={working} onClick={() => setCamera(true)}>
            Live camera
          </button>
        )}
        {src && onRemove && (
          <button type="button" className="text-link" disabled={working} onClick={removePhoto}>
            Remove photo
          </button>
        )}
      </div>
      {camera && (
        <LiveCamera
          onClose={() => setCamera(false)}
          onCapture={capturePhoto}
        />
      )}
    </div>
  );
}
