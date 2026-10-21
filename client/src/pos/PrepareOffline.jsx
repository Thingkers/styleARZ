import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { isPreparedToday, prepareOfflinePos, readOfflinePrepared } from "./offlinePrep";

function formatWhen(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function PrepareOffline({ role = "counter", auto = false }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [prepared, setPrepared] = useState(() => readOfflinePrepared());
  const [readyToday, setReadyToday] = useState(() => isPreparedToday());
  const [open, setOpen] = useState(() => !isPreparedToday());
  const qrRef = useRef(null);
  const phonePrepareUrl = `${window.location.origin}/pos/scan?prepare=1`;

  useEffect(() => {
    if (!open || role !== "counter" || !qrRef.current) return undefined;
    let cancelled = false;
    QRCode.toCanvas(qrRef.current, phonePrepareUrl, {
      width: 168,
      margin: 1,
      color: { dark: "#0a0a0a", light: "#ffffff" },
    }).catch(() => {
      if (!cancelled) setError("Could not draw the phone prepare QR.");
    });
    return () => {
      cancelled = true;
    };
  }, [open, role, phonePrepareUrl]);

  async function runPrepare() {
    setBusy(true);
    setError("");
    try {
      const next = await prepareOfflinePos();
      setPrepared(next);
      setReadyToday(true);
      setOpen(false);
    } catch (err) {
      setError(err.message || "Could not prepare offline POS.");
      setReadyToday(false);
      setOpen(true);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!auto || !navigator.onLine || readyToday) return undefined;
    runPrepare();
    // One auto-run when opened with ?prepare=1
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto]);

  if (readyToday && !open) {
    return (
      <div className="pos-prepare-collapsed">
        <span className="muted">
          Offline ready{prepared?.at ? ` · ${formatWhen(prepared.at)}` : ""}
        </span>
        <button className="text-link" type="button" onClick={() => setOpen(true)}>
          Prepare again
        </button>
      </div>
    );
  }

  return (
    <div className="pos-prepare-wrap">
      <section className="pos-prepare">
        <div className="pos-prepare-copy">
          <p className="kicker light">Morning checklist</p>
          <h2>Prepare offline</h2>
          <p>
            While the internet works, tap once on <strong>this device</strong> so POS still opens if the net drops later.
            {role === "counter" ? " Then scan the QR on the phone and tap Prepare there too." : " Do the same on the counter."}
          </p>
          {readyToday ? (
            <p className="notice">Ready for offline today{prepared?.at ? ` · last prep ${formatWhen(prepared.at)}` : ""}.</p>
          ) : (
            <p className="muted">Not prepared on this device today yet.</p>
          )}
          {error && <p className="error">{error}</p>}
          <div className="pos-prepare-actions">
            <button className="btn solid pos-tap" type="button" disabled={busy || !navigator.onLine} onClick={runPrepare}>
              {busy ? "Preparing…" : readyToday ? "Prepare again" : "Prepare offline"}
            </button>
            {readyToday && (
              <button className="text-link" type="button" onClick={() => setOpen(false)}>
                Hide
              </button>
            )}
          </div>
          {!navigator.onLine && <p className="error">Go online to prepare. Offline mode needs one successful prep first.</p>}
        </div>
        {role === "counter" && (
          <div className="pos-prepare-phone">
            <p className="kicker light">Phone</p>
            <canvas ref={qrRef} aria-label="QR code to prepare the phone scanner offline" />
            <p className="pos-scan-url">
              Or open on the phone:
              <br />
              <a href={phonePrepareUrl}>{phonePrepareUrl}</a>
            </p>
            <p className="muted">Opens the scanner page and can auto-prepare offline there.</p>
          </div>
        )}
      </section>
    </div>
  );
}
