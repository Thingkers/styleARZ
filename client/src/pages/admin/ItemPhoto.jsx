import { useEffect, useRef, useState } from "react";
import { Modal } from "../../components/ui";
import { compressPhoto, MAX_BYTES, MAX_EDGE, preparePhotoPair } from "./enhancePhoto";

function canUseLiveCamera() {
  return Boolean(navigator.mediaDevices?.getUserMedia);
}

const MAX_PHOTOS = 8;

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
  throw new Error("That photo is too large. Try a smaller image.");
}

async function pairFromSource(source, width, height) {
  const raw = toJpeg(source, width, height);
  try {
    return await preparePhotoPair(raw);
  } catch {
    const original = await compressPhoto(raw);
    return { original, enhanced: original };
  }
}

async function pairFromFile(file) {
  if (file.type && !file.type.startsWith("image/")) throw new Error("Choose an image file.");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode().catch(() => {
      throw new Error("Couldn't read that image. Try a JPEG or PNG photo.");
    });
    return pairFromSource(image, image.naturalWidth, image.naturalHeight);
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
  const [busy, setBusy] = useState(false);

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
        video.srcObject = media;
        video.play().catch(() => {});
      })
      .catch((err) => {
        if (!cancelled) setError(cameraMessage(err));
      });
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [facing]);

  async function capture() {
    const video = videoRef.current;
    if (!video?.videoWidth || busy) return;
    setBusy(true);
    setError("");
    try {
      const pair = await pairFromSource(video, video.videoWidth, video.videoHeight);
      onCapture(pair);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <Modal title="Live camera" onClose={onClose}>
      <div className="inv-camera-body">
        <div className="inv-camera">
          <video ref={videoRef} autoPlay playsInline muted onLoadedMetadata={() => setReady(true)} />
          {!ready && !error && <p>Starting camera…</p>}
        </div>
        {error && <p className="error">{error}</p>}
        <div className="inv-camera-actions">
          <button type="button" className="btn solid" disabled={!ready || busy} onClick={capture}>
            {busy ? "Cleaning…" : "Capture"}
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

function StageToggle({ stage, onChange, disabled }) {
  return (
    <div className="pills inv-photo-stage" role="group" aria-label="Photo stage">
      <button type="button" className={stage === "enhanced" ? "on" : ""} aria-pressed={stage === "enhanced"} disabled={disabled} onClick={() => onChange("enhanced")}>
        Beautified
      </button>
      <button type="button" className={stage === "original" ? "on" : ""} aria-pressed={stage === "original"} disabled={disabled} onClick={() => onChange("original")}>
        Original
      </button>
    </div>
  );
}

/** Single-photo API kept for create wizard; multi via `images` + onAdd/onRemoveAt. */
export default function ItemPhoto({
  src,
  images,
  onChange,
  onAdd,
  onRemove,
  onRemoveAt,
  note,
  max = MAX_PHOTOS,
  canRestoreOriginal = false,
  onRestoreOriginal,
  restoringOriginal = false,
}) {
  const gallery = Array.isArray(images) && images.length ? images : src ? [src] : [];
  const multi = Boolean(onAdd || onRemoveAt);
  const [camera, setCamera] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [active, setActive] = useState(0);
  const [draft, setDraft] = useState(null); // { original, enhanced, stage }

  useEffect(() => {
    if (active >= gallery.length) setActive(Math.max(0, gallery.length - 1));
  }, [gallery.length, active]);

  useEffect(() => {
    // Clear local draft when parent gallery replaces it (saved / removed).
    if (!draft) return;
    const activeUrl = draft.stage === "original" ? draft.original : draft.enhanced;
    if (src === activeUrl || (gallery.length && gallery.includes(activeUrl))) return;
    if (!src && !gallery.length) setDraft(null);
  }, [src, gallery, draft]);

  function commitDraft(next) {
    setDraft(next);
    const url = next.stage === "original" ? next.original : next.enhanced;
    if (multi && onAdd) {
      /* multi adds happen once via applyDraftAdd */
    } else if (onChange) {
      onChange(url, { original: next.original, enhanced: next.enhanced, stage: next.stage });
    }
  }

  async function applyDraftAdd(next) {
    if (!onAdd) return;
    if (gallery.length >= max) throw new Error(`You can add up to ${max} photos.`);
    const url = next.stage === "original" ? next.original : next.enhanced;
    await onAdd(url, { original: next.original, enhanced: next.enhanced, stage: next.stage });
    setDraft(null);
  }

  async function ingest(file) {
    if (!file) return;
    setError("");
    setWorking(true);
    try {
      const pair = await pairFromFile(file);
      const next = { ...pair, stage: "enhanced" };
      if (multi && onAdd) {
        setDraft(next);
      } else {
        commitDraft(next);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setWorking(false);
    }
  }

  async function onFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    await ingest(file);
  }

  function setStage(stage) {
    if (!draft) return;
    const next = { ...draft, stage };
    if (multi && onAdd) {
      setDraft(next);
    } else {
      commitDraft(next);
    }
  }

  const preview = draft
    ? draft.stage === "original"
      ? draft.original
      : draft.enhanced
    : gallery[active] || gallery[0] || "";
  const autoNote = "Beautify cleans light and background only — it does not rotate the photo. Switch to Original anytime before saving.";

  return (
    <div className="inv-photo">
      {preview ? (
        <div className="inv-photo-frame has-photo">
          <img src={preview} alt="Item photo" />
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

      {draft && <StageToggle stage={draft.stage} onChange={setStage} disabled={working} />}

      {draft && multi && onAdd && (
        <div className="inv-photo-actions">
          <button type="button" className="btn solid" disabled={working} onClick={() => applyDraftAdd(draft).catch((err) => setError(err.message))}>
            Use {draft.stage === "original" ? "original" : "beautified"} photo
          </button>
          <button type="button" className="text-link" onClick={() => setDraft(null)}>
            Cancel
          </button>
        </div>
      )}

      {!draft && gallery.length > 1 && (
        <div className="inv-photo-thumbs" role="list">
          {gallery.map((entry, index) => (
            <button
              key={`${entry}-${index}`}
              type="button"
              className={`inv-photo-thumb${index === active ? " is-active" : ""}`}
              onClick={() => setActive(index)}
            >
              <img src={entry} alt="" />
            </button>
          ))}
        </div>
      )}

      <p className="muted inv-photo-note">{note || autoNote}</p>
      {note && <p className="muted inv-photo-note">{autoNote}</p>}
      {error && <p className="error">{error}</p>}
      <div className="inv-photo-actions">
        <label className="btn dark inv-file inv-file-capture">
          {working ? "Preparing…" : "Take photo"}
          <input type="file" accept="image/*" capture="environment" onChange={onFile} disabled={working || gallery.length >= max} />
        </label>
        <label className="btn line inv-file">
          {working ? "Preparing…" : multi ? (gallery.length ? "Add photo" : "Upload photo") : src ? "Replace photo" : "Upload photo"}
          <input type="file" accept="image/*" onChange={onFile} disabled={working || gallery.length >= max} />
        </label>
        {canUseLiveCamera() && (
          <button type="button" className="btn line" onClick={() => setCamera(true)} disabled={gallery.length >= max || working}>
            Live camera
          </button>
        )}
        {canRestoreOriginal && onRestoreOriginal && (
          <button type="button" className="btn line" disabled={restoringOriginal || working} onClick={onRestoreOriginal}>
            {restoringOriginal ? "Restoring…" : "Restore original"}
          </button>
        )}
        {multi && gallery.length > 0 && onRemoveAt && !draft && (
          <button type="button" className="text-link" onClick={() => onRemoveAt(active)}>
            Remove this photo
          </button>
        )}
        {!multi && src && onRemove && (
          <button type="button" className="text-link" onClick={onRemove}>
            Remove photo
          </button>
        )}
      </div>
      {camera && (
        <LiveCamera
          onClose={() => setCamera(false)}
          onCapture={async (pair) => {
            setError("");
            try {
              const next = { ...pair, stage: "enhanced" };
              if (multi && onAdd) {
                setDraft(next);
              } else {
                commitDraft(next);
              }
              setCamera(false);
            } catch (err) {
              setError(err.message);
            }
          }}
        />
      )}
    </div>
  );
}
