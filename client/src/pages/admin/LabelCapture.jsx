import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api";
import { money } from "../../format";
import { QUICK_SIZES } from "./inventoryUtils";

const MAX_EDGE = 1600;
const MAX_BYTES = 1.9 * 1024 * 1024;
const SIZE_CHIPS = [...QUICK_SIZES.filter((size) => size !== "One"), "Custom"];

function toJpeg(source, width, height) {
  const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext("2d");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingQuality = "high";
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  for (const quality of [0.86, 0.74, 0.6, 0.45]) {
    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    if (dataUrl.length * 0.75 <= MAX_BYTES) return dataUrl;
  }
  throw new Error("That photo is too large. Try again a bit farther away.");
}

function cameraMessage(error) {
  switch (error?.name) {
    case "NotAllowedError":
    case "SecurityError":
      return "Camera access was blocked. Allow it in browser settings.";
    case "NotFoundError":
    case "OverconstrainedError":
      return "No camera was found on this phone.";
    case "NotReadableError":
      return "The camera is busy in another app.";
    default:
      return error?.message || "Could not start the camera.";
  }
}

export default function LabelCapture() {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [facing, setFacing] = useState("environment");
  const [ready, setReady] = useState(false);
  const [photo, setPhoto] = useState("");
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [size, setSize] = useState("");
  const [customSize, setCustomSize] = useState("");
  const [sizeMode, setSizeMode] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(null);
  const [sessionCount, setSessionCount] = useState(0);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  useEffect(() => {
    let wake = null;
    if (navigator.wakeLock?.request) {
      navigator.wakeLock.request("screen").then((lock) => {
        wake = lock;
      }).catch(() => {});
    }
    return () => {
      wake?.release?.().catch(() => {});
    };
  }, []);

  useEffect(() => {
    if (photo) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setReady(false);
      return undefined;
    }

    let cancelled = false;
    setReady(false);
    setError("");
    navigator.mediaDevices
      ?.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1440 } },
      })
      .then((media) => {
        if (cancelled) {
          media.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = media;
        const video = videoRef.current;
        if (video) {
          video.srcObject = media;
          video.play().catch(() => {});
        }
      })
      .catch((err) => {
        if (!cancelled) setError(cameraMessage(err));
      });

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [facing, photo]);

  useEffect(() => {
    if (!saved) return undefined;
    const timer = window.setTimeout(() => setSaved(null), 1200);
    return () => window.clearTimeout(timer);
  }, [saved]);

  function capture() {
    const video = videoRef.current;
    if (!video?.videoWidth) return;
    try {
      setError("");
      setPhoto(toJpeg(video, video.videoWidth, video.videoHeight));
    } catch (err) {
      setError(err.message);
    }
  }

  function resetForNext() {
    setPhoto("");
    setName("");
    setPrice("");
    setSize("");
    setCustomSize("");
    setSizeMode("");
    setNote("");
    setError("");
  }

  function pickSize(chip) {
    if (chip === "Custom") {
      setSizeMode("Custom");
      setSize(customSize);
      return;
    }
    setSizeMode(chip);
    setSize(chip);
    setCustomSize("");
  }

  async function save() {
    if (!online) {
      setError("You are offline. Connect to save barcodes.");
      return;
    }
    if (!photo) {
      setError("Take a photo first.");
      return;
    }
    const amount = Number(price);
    if (!Number.isFinite(amount) || amount < 0) {
      setError("Enter a price.");
      return;
    }
    const finalSize = sizeMode === "Custom" ? customSize.trim() : size;
    setBusy(true);
    setError("");
    try {
      const data = await api("/api/labels", {
        method: "POST",
        body: {
          image: photo,
          name: name.trim(),
          price: amount,
          size: finalSize,
          note: note.trim(),
        },
      });
      setSessionCount((count) => count + 1);
      setSaved(data.item);
      resetForNext();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ql-capture">
      <header className="ql-capture-bar no-print">
        <Link to="/admin/labels" className="text-link">
          ← Labels
        </Link>
        <strong>
          Quick capture
          {sessionCount ? <em className="muted"> · {sessionCount} saved</em> : null}
        </strong>
        <Link to="/admin" className="text-link">
          Admin home
        </Link>
      </header>

      {!online && <p className="ql-offline">Offline — connect to the network to save barcodes.</p>}

      {saved && (
        <div className="ql-saved" role="status">
          <strong>Saved {saved.barcode}</strong>
          <span>{money(saved.price)}{saved.size ? ` · ${saved.size}` : ""}</span>
        </div>
      )}

      {!photo ? (
        <div className="ql-camera">
          <video ref={videoRef} autoPlay playsInline muted onLoadedMetadata={() => setReady(true)} />
          {!ready && !error && <p className="ql-camera-hint">Starting camera…</p>}
          <div className="ql-camera-controls">
            <button type="button" className="btn line" onClick={() => setFacing((f) => (f === "environment" ? "user" : "environment"))}>
              Flip
            </button>
            <button type="button" className="ql-shutter" disabled={!ready || busy} onClick={capture} aria-label="Take photo">
              <span />
            </button>
            <span className="ql-camera-spacer" aria-hidden />
          </div>
        </div>
      ) : (
        <div className="ql-review">
          <img src={photo} alt="Garment preview" />
          <div className="ql-form">
            <label>
              Product name <em className="muted">(optional — skip OK)</em>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Add now or edit later"
                maxLength={120}
                autoFocus
              />
            </label>
            <label>
              Price (৳)
              <input
                type="number"
                inputMode="numeric"
                min="0"
                step="1"
                value={price}
                placeholder="0"
                onChange={(event) => setPrice(event.target.value)}
              />
            </label>
            <div className="ql-sizes" role="group" aria-label="Size">
              {SIZE_CHIPS.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  className={sizeMode === chip ? "on" : ""}
                  onClick={() => pickSize(chip)}
                >
                  {chip}
                </button>
              ))}
            </div>
            {sizeMode === "Custom" && (
              <label>
                Custom size
                <input
                  value={customSize}
                  onChange={(event) => {
                    setCustomSize(event.target.value);
                    setSize(event.target.value);
                  }}
                  placeholder="e.g. 32, Free size"
                  maxLength={20}
                />
              </label>
            )}
            <label>
              Note <em className="muted">(optional)</em>
              <input
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Rack, colour hint…"
                maxLength={120}
              />
            </label>
            <div className="ql-form-actions">
              <button type="button" className="btn line" disabled={busy} onClick={resetForNext}>
                Retake
              </button>
              <button type="button" className="btn solid" disabled={busy || !online} onClick={save}>
                {busy ? "Saving…" : "Save & next"}
              </button>
            </div>
          </div>
        </div>
      )}

      {error && <p className="error ql-error">{error}</p>}
    </div>
  );
}
