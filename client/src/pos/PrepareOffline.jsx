import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { OFFLINE_PHONE_LINK_ENABLED } from "./features";
import { isPreparedToday, prepareOfflinePos, readOfflinePrepared } from "./offlinePrep";

function formatWhen(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function localDay() {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
}

export default function PrepareOffline({ role = "counter", auto = false }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [prepared, setPrepared] = useState(() => readOfflinePrepared());
  const [readyToday, setReadyToday] = useState(() => isPreparedToday());
  // Hidden by default; only open automatically for ?prepare=1 phone flow.
  const [open, setOpen] = useState(() => Boolean(auto));
  const qrRef = useRef(null);
  const prepareInFlightRef = useRef(false);
  const readyToday = prepared?.day === today;
  const phonePrepareUrl = `${window.location.origin}/pos/scan?prepare=1`;

  useEffect(() => {
    if (!OFFLINE_PHONE_LINK_ENABLED || !open || role !== "counter" || !qrRef.current) return undefined;
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

  const runPrepare = useCallback(async () => {
    if (prepareInFlightRef.current) return;
    prepareInFlightRef.current = true;
    setBusy(true);
    setError("");
    try {
      const next = await prepareOfflinePos();
      setPrepared(next);
      setOpen(false);
    } catch (err) {
      setError(err.message || "Could not prepare offline POS.");
      setOpen(true);
    } finally {
      prepareInFlightRef.current = false;
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!OFFLINE_PHONE_LINK_ENABLED || !auto || !navigator.onLine || readyToday) return undefined;
    runPrepare();
    // One auto-run when opened with ?prepare=1
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto]);

  const statusLine = readyToday
    ? `Offline ready${prepared?.at ? ` · ${formatWhen(prepared.at)}` : ""}`
    : "Not prepared on this device today yet";

  // Feature kept in repo; UI disabled until OFFLINE_PHONE_LINK_ENABLED is flipped on.
  if (!OFFLINE_PHONE_LINK_ENABLED) return null;

  return (
    <div className={`pos-prepare-wrap${open ? " is-open" : " is-collapsed"}`}>
      <button
        type="button"
        className="pos-prepare-toggle"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span>
          <strong>Prepare offline</strong>
          <em className="muted">{statusLine}</em>
        </span>
        <span className="pos-prepare-chevron" aria-hidden>
          {open ? "▾" : "▸"}
        </span>
      </button>

      {open && (
        <section className="pos-prepare">
          <div className="pos-prepare-copy">
            <p className="kicker light">Morning checklist</p>
            <p>
              While the internet works, tap once on <strong>this device</strong> so POS still opens if the net drops
              later.
              {role === "counter"
                ? " Then scan the QR on the phone and tap Prepare there too."
                : " Do the same on the counter."}
            </p>
            {readyToday ? (
              <p className="notice">
                Ready for offline today{prepared?.at ? ` · last prep ${formatWhen(prepared.at)}` : ""}.
              </p>
            ) : (
              <p className="muted">Not prepared on this device today yet.</p>
            )}
            {error && <p className="error">{error}</p>}
            <div className="pos-prepare-actions">
              <button
                className="btn solid pos-tap"
                type="button"
                disabled={busy || !navigator.onLine}
                onClick={runPrepare}
              >
                {busy ? "Preparing…" : readyToday ? "Prepare again" : "Prepare offline"}
              </button>
              <button className="text-link" type="button" onClick={() => setOpen(false)}>
                Collapse
              </button>
            </div>
            {!navigator.onLine && (
              <p className="error">Go online to prepare. Offline mode needs one successful prep first.</p>
            )}
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
      )}
    </div>
  );
}
