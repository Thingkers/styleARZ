import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api";
import { useDocumentTitle } from "../../hooks";
import { PageHeader } from "../../components/ui";

function normalizeCode(value) {
  return String(value || "").trim().toUpperCase();
}

export default function UsbScanner() {
  useDocumentTitle("USB barcode scanner");
  const inputRef = useRef(null);
  const sendingRef = useRef(false);
  const [sessions, setSessions] = useState([]);
  const [session, setSession] = useState(null);
  const [code, setCode] = useState("");
  const [buffer, setBuffer] = useState("");
  const [busy, setBusy] = useState(false);
  const [armed, setArmed] = useState(true);
  const [error, setError] = useState("");
  const [last, setLast] = useState(null); // { barcode, found, item, message }
  const [log, setLog] = useState([]);

  const focusInput = useCallback(() => {
    if (!armed) return;
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }, [armed]);

  const refreshSessions = useCallback(async () => {
    try {
      const data = await api("/api/pos/sessions");
      setSessions(Array.isArray(data.sessions) ? data.sessions : []);
    } catch (requestError) {
      setError(requestError.message);
    }
  }, []);

  useEffect(() => {
    refreshSessions();
    const timer = window.setInterval(refreshSessions, 8000);
    return () => window.clearInterval(timer);
  }, [refreshSessions]);

  useEffect(() => {
    focusInput();
  }, [session, armed, last, focusInput]);

  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === "visible") focusInput();
    }
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", focusInput);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", focusInput);
    };
  }, [focusInput]);

  async function join(value = code) {
    const normalized = normalizeCode(value);
    if (!normalized) return;
    setBusy(true);
    setError("");
    try {
      const result = await api(`/api/pos/sessions/${encodeURIComponent(normalized)}`);
      setCode(normalized);
      setSession(result.session);
      setLast(null);
      focusInput();
    } catch (requestError) {
      setSession(null);
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function submitBarcode(raw) {
    const barcode = String(raw || "").trim();
    if (!barcode || !session || sendingRef.current) return;
    sendingRef.current = true;
    setBusy(true);
    setError("");
    setBuffer("");
    try {
      const result = await api(`/api/pos/sessions/${session.id}/scans`, {
        method: "POST",
        body: { barcode },
      });
      const entry = {
        barcode: result.barcode || barcode,
        found: Boolean(result.found),
        item: result.item || null,
        message: result.message || (result.found ? "Sent to register." : "Not in database."),
        at: new Date().toISOString(),
      };
      setLast(entry);
      setLog((current) => [entry, ...current].slice(0, 12));
    } catch (requestError) {
      setError(requestError.message);
      if (requestError.status === 404 || requestError.status === 409) {
        setSession(null);
      }
    } finally {
      sendingRef.current = false;
      setBusy(false);
      focusInput();
    }
  }

  function disconnect() {
    setSession(null);
    setLast(null);
    setError("");
  }

  return (
    <div className="usb-scanner">
      <PageHeader
        kicker="POS"
        title="USB barcode scanner"
        lede="Plug in the SUNLUX XL-3600 (USB). Join the open Dual POS register, keep this page focused, then scan. Your colleague’s cart receives the barcode automatically."
      />

      {!session ? (
        <section className="usb-scanner-card">
          <h2>Connect to a register</h2>
          <p className="muted">
            On the POS computer, open Dual mode and use the six-character code shown there (or pick an open session below).
          </p>
          <form
            className="usb-scanner-join"
            onSubmit={(event) => {
              event.preventDefault();
              join();
            }}
          >
            <label>
              Register code
              <input
                value={code}
                onChange={(event) => setCode(normalizeCode(event.target.value))}
                maxLength={6}
                autoCapitalize="characters"
                autoComplete="off"
                placeholder="ABC123"
              />
            </label>
            <button className="btn solid" type="submit" disabled={busy || normalizeCode(code).length !== 6}>
              {busy ? "Connecting…" : "Connect"}
            </button>
          </form>

          <div className="usb-scanner-sessions">
            <div className="usb-scanner-sessions-head">
              <h3>Open POS sessions</h3>
              <button className="text-link" type="button" onClick={refreshSessions}>
                Refresh
              </button>
            </div>
            {!sessions.filter((entry) => entry.mode === "dual").length ? (
              <p className="muted">No open Dual sessions. On the register, open POS and switch to Dual mode first.</p>
            ) : (
              <ul>
                {sessions
                  .filter((entry) => entry.mode === "dual")
                  .map((entry) => (
                    <li key={entry.id}>
                      <button type="button" className="usb-session-pick" onClick={() => join(entry.code)} disabled={busy}>
                        <strong>{entry.code}</strong>
                        <span>cart {entry.cartCount}</span>
                      </button>
                    </li>
                  ))}
              </ul>
            )}
          </div>
        </section>
      ) : (
        <section className="usb-scanner-card usb-scanner-live">
          <div className="usb-scanner-status">
            <div>
              <p className="kicker">Connected</p>
              <h2>{session.code}</h2>
            </div>
            <div className="usb-scanner-actions">
              <label className="usb-arm">
                <input type="checkbox" checked={armed} onChange={(event) => setArmed(event.target.checked)} />
                Ready to scan
              </label>
              <button className="btn line" type="button" onClick={disconnect}>
                Disconnect
              </button>
              <Link className="text-link" to="/pos">
                Open POS
              </Link>
            </div>
          </div>

          <p className="muted">
            Click the scan box once so it stays focused. The USB scanner types the barcode and presses Enter — we look it up and push it to the register cart when it exists.
          </p>

          <form
            className="usb-scanner-capture"
            onSubmit={(event) => {
              event.preventDefault();
              submitBarcode(buffer);
            }}
          >
            <label>
              Scan here
              <input
                ref={inputRef}
                value={buffer}
                onChange={(event) => setBuffer(event.target.value)}
                onBlur={() => {
                  if (armed) window.setTimeout(focusInput, 40);
                }}
                disabled={!armed || busy}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                placeholder={armed ? "Waiting for USB scan…" : "Uncheck Ready to scan to type elsewhere"}
              />
            </label>
            <button className="btn solid" type="submit" disabled={busy || !buffer.trim()}>
              {busy ? "Sending…" : "Send"}
            </button>
          </form>

          {last && (
            <div className={`usb-scanner-result ${last.found ? "is-found" : "is-missing"}`} role="status">
              <p className="kicker">{last.found ? "In database — sent to cart" : "Not in database"}</p>
              <p>
                <strong>{last.barcode}</strong>
              </p>
              <p>{last.message}</p>
              {last.item && (
                <p className="muted">
                  {[last.item.name, last.item.color, last.item.size, last.item.sku].filter(Boolean).join(" · ")}
                </p>
              )}
            </div>
          )}

          {log.length > 1 && (
            <ul className="usb-scanner-log">
              {log.slice(1).map((entry) => (
                <li key={`${entry.at}-${entry.barcode}`}>
                  <code>{entry.barcode}</code>
                  <span className={entry.found ? "ok" : "miss"}>{entry.found ? "added" : "missing"}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {error && <p className="error">{error}</p>}
    </div>
  );
}
