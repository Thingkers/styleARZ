import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Link } from "react-router-dom";
import { api } from "../api";
import { money } from "../format";
import { useDocumentTitle } from "../hooks";
import { rememberCatalogItems, resolveBarcode } from "../pos/catalog";
import { loadCart, saveCart } from "../pos/db";
import { canUseCameraScanner, startCameraScanner } from "../pos/scanner";
import { canUsePairingQrScanner, drawPairingQr, hasPairingCamera, startPairingQrScanner } from "../pos/pairQr";
import { flushOutbox, initOfflineCatalog, isNetworkError, queueSale, subscribeOutbox } from "../pos/sync";
import { getShareOrigin } from "../pos/lanOrigin";
import { createHostPeer } from "../pos/webrtc";
import PrepareOffline from "../pos/PrepareOffline";
import ProductSearch from "../pos/ProductSearch";
import InvoicePanel from "../pos/InvoicePanel";
import { OFFLINE_PHONE_LINK_ENABLED } from "../pos/features";

function initialMode() {
  const saved = localStorage.getItem("sa-pos-mode");
  if (saved === "solo" || saved === "dual") return saved;
  return window.innerWidth < 900 ? "solo" : "dual";
}

function newClientId() {
  return globalThis.crypto?.randomUUID?.() || `pos-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * USB barcode scanner (HID keyboard mode) listener.
 *
 * Works anywhere on the POS page — no pairing, no connector page.
 * - Scanners type very fast (a few ms between keys) and usually end with Enter.
 *   If Enter is missing, the code is submitted after a short pause.
 * - Works even when the product search box is focused: the scan is intercepted,
 *   added to the cart, and the characters are removed from the search box.
 * - Ignored in number / tel / textarea / select fields (discount, customer phone).
 */
function useUsbScanner(onScan) {
  const cbRef = useRef(onScan);
  cbRef.current = onScan;

  useEffect(() => {
    let buffer = "";
    let last = 0;
    let timer;
    let field = null; // text input that received the scanned characters

    const clearField = () => {
      if (!field) return;
      const code = buffer;
      const value = field.value || "";
      const next = value.endsWith(code) ? value.slice(0, value.length - code.length) : value;
      if (next !== value) {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
        setter?.call(field, next);
        field.dispatchEvent(new Event("input", { bubbles: true }));
      }
    };

    const reset = () => {
      buffer = "";
      field = null;
    };

    const flush = () => {
      clearTimeout(timer);
      const code = buffer.trim();
      if (code.length >= 4) {
        clearField();
        reset();
        cbRef.current(code);
      } else {
        reset();
      }
    };

    const onKey = (e) => {
      const el = e.target;
      const tag = el?.tagName;
      const type = (el?.type || "").toLowerCase();
      if (tag === "TEXTAREA" || tag === "SELECT" || el?.isContentEditable) return;
      if (tag === "INPUT" && (type === "number" || type === "tel" || type === "password")) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (e.key === "Enter") {
        if (buffer.length >= 4) {
          e.preventDefault();
          e.stopPropagation(); // stop the search box / buttons from also reacting to this Enter
          flush();
        } else {
          reset();
        }
        return;
      }
      if (e.key.length !== 1) return;

      const now = Date.now();
      if (now - last > 50) reset(); // humans type slowly, scanners type fast
      last = now;
      buffer += e.key;
      field = tag === "INPUT" ? el : null;
      clearTimeout(timer);
      timer = setTimeout(flush, 120); // works even if the scanner sends no Enter
    };

    // capture phase so we see the keys before the focused input handles them
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      clearTimeout(timer);
    };
  }, []);
}

function ScannerPanel({ onBarcode, onPick, busy, cart, onOpenCart }) {
  const videoRef = useRef(null);
  const sessionRef = useRef(null);
  const callbackRef = useRef(onBarcode);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [scanHint, setScanHint] = useState("");
  const [capturing, setCapturing] = useState(false);
  callbackRef.current = onBarcode;

  useEffect(() => {
    if (!cameraOn) return undefined;
    let cancelled = false;
    setCameraError("");
    setScanHint("Point at the barcode — it scans automatically, or tap Capture.");
    startCameraScanner({
      video: videoRef.current,
      onDetected: (barcode) => {
        setScanHint(`Scanned ${barcode}`);
        callbackRef.current(barcode);
      },
      onError: (error) => setCameraError(error?.message || "Could not read the camera."),
    })
      .then((session) => {
        if (cancelled) {
          session.stop();
          return;
        }
        sessionRef.current = session;
      })
      .catch((error) => {
        if (!cancelled) {
          setCameraError(error?.message || "Camera permission was not granted.");
          setCameraOn(false);
        }
      });
    return () => {
      cancelled = true;
      sessionRef.current?.stop();
      sessionRef.current = null;
    };
  }, [cameraOn]);

  async function captureFrame() {
    if (!sessionRef.current || capturing || busy) return;
    setCapturing(true);
    setCameraError("");
    setScanHint("Reading barcode…");
    try {
      const barcode = await sessionRef.current.capture();
      setScanHint(`Scanned ${barcode}`);
      callbackRef.current(barcode);
    } catch (error) {
      setCameraError(error?.message || "Could not read a barcode from this frame.");
      setScanHint("Hold the label inside the orange frame, then Capture again.");
    } finally {
      setCapturing(false);
    }
  }

  return (
    <section className="pos-scan-panel">
      <ProductSearch onPick={onPick} busy={busy} autofocus />
      <AddedItems cart={cart || []} onOpenCart={onOpenCart} />
      <div className={`pos-camera ${cameraOn ? "is-on" : ""}`}>
        <video ref={videoRef} muted playsInline aria-label="Barcode camera preview" />
        {!cameraOn && <p>Camera scanning is off</p>}
      </div>
      {cameraError && <p className="error">{cameraError}</p>}
      {cameraOn && scanHint && !cameraError && <p className="notice">{scanHint}</p>}
      <div className="pos-camera-actions">
        <button
          className="btn dark pos-tap"
          type="button"
          disabled={!canUseCameraScanner()}
          onClick={() => setCameraOn((on) => !on)}
        >
          {cameraOn ? "Stop camera" : "Start camera"}
        </button>
        <button
          className="btn solid pos-tap"
          type="button"
          disabled={!cameraOn || capturing || busy}
          onClick={captureFrame}
        >
          {capturing ? "Reading…" : "Capture barcode"}
        </button>
      </div>
    </section>
  );
}

function itemThumb(item) {
  return item?.image || "/images/studio-table.jpg";
}

function availableStock(line) {
  const raw = line?.stock;
  const value = typeof raw === "string" ? Number.parseInt(raw, 10) : Number(raw);
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

function isBlockedLine(line) {
  const stock = availableStock(line);
  return stock < 1 || Number(line.qty) > stock;
}

function splitCart(cart) {
  const ready = [];
  const blocked = [];
  (cart || []).forEach((line) => {
    if (isBlockedLine(line)) blocked.push(line);
    else ready.push(line);
  });
  return { ready, blocked };
}

function CartLine({ line, setQty, remove, blocked = false }) {
  const stock = availableStock(line);
  return (
    <li className={blocked ? "is-blocked" : ""}>
      <img className="pos-cart-thumb" src={itemThumb(line)} alt="" width={56} height={56} loading="lazy" />
      <div className="pos-cart-copy">
        <strong>{line.name}</strong>
        <small>{[line.color, line.size, line.sku, line.barcode].filter(Boolean).join(" · ")}</small>
        <em>
          {money(line.price)} each
          {blocked
            ? stock < 1
              ? " · Out of stock"
              : ` · Only ${stock} in stock (cart has ${line.qty})`
            : ` · ${stock} in stock`}
        </em>
      </div>
      <div className="pos-line-actions">
        {!blocked && (
          <>
            <button type="button" aria-label={`Decrease ${line.name}`} onClick={() => setQty(line.itemId, line.qty - 1)}>
              −
            </button>
            <b>{line.qty}</b>
            <button
              type="button"
              aria-label={`Increase ${line.name}`}
              disabled={line.qty >= stock}
              onClick={() => setQty(line.itemId, line.qty + 1)}
            >
              +
            </button>
            <strong>{money(line.price * line.qty)}</strong>
          </>
        )}
        {blocked && stock > 0 && (
          <>
            <button type="button" aria-label={`Set ${line.name} quantity to stock`} onClick={() => setQty(line.itemId, stock)}>
              Fix to {stock}
            </button>
            <b>{line.qty}</b>
          </>
        )}
        <button className="pos-remove" type="button" onClick={() => remove(line.itemId)}>
          Remove
        </button>
      </div>
    </li>
  );
}

function Cart({ cart, setQty, remove }) {
  if (!cart.length) return <p className="pos-empty">Scan or search for an item to begin this sale.</p>;
  const { ready, blocked } = splitCart(cart);
  return (
    <div className="pos-cart-sections">
      <div className="pos-cart-section">
        <h3>Ready to sell</h3>
        {ready.length ? (
          <ul className="pos-cart-list">
            {ready.map((line) => (
              <CartLine key={line.itemId} line={line} setQty={setQty} remove={remove} />
            ))}
          </ul>
        ) : (
          <p className="muted pos-cart-empty-note">No sellable items yet.</p>
        )}
      </div>
      {blocked.length > 0 && (
        <div className="pos-cart-section is-blocked">
          <h3>Out of stock / not enough stock</h3>
          <p className="muted">Remove these or lower qty before paying. They are not included in the sale total.</p>
          <ul className="pos-cart-list">
            {blocked.map((line) => (
              <CartLine key={line.itemId} line={line} setQty={setQty} remove={remove} blocked />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function AddedItems({ cart, onOpenCart }) {
  if (!cart.length) {
    return (
      <div className="pos-added-panel is-empty">
        <p className="muted">No items in this sale yet. Search or scan to add.</p>
      </div>
    );
  }
  const { ready, blocked } = splitCart(cart);
  const units = ready.reduce((sum, line) => sum + line.qty, 0);
  return (
    <section className="pos-added-panel" aria-live="polite">
      <div className="pos-added-head">
        <h2>In this sale</h2>
        <span>
          {ready.length} ready · {units} unit{units === 1 ? "" : "s"}
          {blocked.length ? ` · ${blocked.length} blocked` : ""}
        </span>
        {onOpenCart && (
          <button type="button" className="text-link" onClick={onOpenCart}>
            Edit cart
          </button>
        )}
      </div>
      {ready.length > 0 && (
        <ul className="pos-added-list">
          {ready.map((line) => (
            <li key={line.itemId}>
              <img src={itemThumb(line)} alt="" width={52} height={52} loading="lazy" />
              <div>
                <strong>
                  {line.qty} × {line.name}
                </strong>
                <small>{[line.color, line.size, line.barcode].filter(Boolean).join(" · ")} · stock {availableStock(line)}</small>
              </div>
              <b>{money(line.price * line.qty)}</b>
            </li>
          ))}
        </ul>
      )}
      {blocked.length > 0 && (
        <>
          <h3 className="pos-added-blocked-title">Out of stock</h3>
          <ul className="pos-added-list is-blocked">
            {blocked.map((line) => (
              <li key={line.itemId}>
                <img src={itemThumb(line)} alt="" width={52} height={52} loading="lazy" />
                <div>
                  <strong>{line.name}</strong>
                  <small>
                    {availableStock(line) < 1
                      ? "Out of stock — cannot sell"
                      : `Need ${line.qty}, only ${availableStock(line)} left`}
                  </small>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function Pairing({
  session,
  qrRef,
  scanUrl,
  onSolo,
  online,
  webrtcStatus,
  offerPayload,
  answerDraft,
  setAnswerDraft,
  onStartOffline,
  onAcceptAnswer,
  onStopOffline,
  offlinePhoneLinkEnabled = false,
}) {
  const offerQrRef = useRef(null);
  const answerVideoRef = useRef(null);
  const answerScanRef = useRef(null);
  const acceptAnswerRef = useRef(onAcceptAnswer);
  acceptAnswerRef.current = onAcceptAnswer;
  const [hasCamera, setHasCamera] = useState(() => canUsePairingQrScanner());
  const [showText, setShowText] = useState(false);
  const [scanningAnswer, setScanningAnswer] = useState(false);
  const [pairScanHint, setPairScanHint] = useState("");
  const [pairScanError, setPairScanError] = useState("");

  useEffect(() => {
    let cancelled = false;
    hasPairingCamera().then((ok) => {
      if (!cancelled) {
        setHasCamera(ok);
        if (!ok) setShowText(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!offerPayload || !offerQrRef.current) return undefined;
    let cancelled = false;
    drawPairingQr(offerQrRef.current, offerPayload).catch(() => {
      if (!cancelled) setPairScanError("Could not draw the offer QR. Use paste fallback on the phone if needed.");
    });
    return () => {
      cancelled = true;
    };
  }, [offerPayload]);

  useEffect(() => {
    if (webrtcStatus === "connected") {
      setPairScanHint("Phone linked.");
      setPairScanError("");
    } else if (webrtcStatus === "failed" || webrtcStatus === "disconnected") {
      setPairScanHint("");
    } else if (webrtcStatus === "connecting") {
      setPairScanHint("Answer set — linking over Wi‑Fi…");
    }
  }, [webrtcStatus]);

  useEffect(() => {
    if (!scanningAnswer) return undefined;
    if (!canUsePairingQrScanner() || !hasCamera) {
      setPairScanError("No camera on this computer — use Paste answer below (Copy answer on the phone).");
      setScanningAnswer(false);
      setShowText(true);
      return undefined;
    }
    let cancelled = false;
    setPairScanError("");
    setPairScanHint("Point at the answer QR on the phone.");
    startPairingQrScanner({
      video: answerVideoRef.current,
      onPayload: (payload) => {
        if (cancelled) return;
        setAnswerDraft(payload);
        setScanningAnswer(false);
        setPairScanHint("Answer scanned — connecting…");
        acceptAnswerRef.current?.(payload);
      },
      onError: (error) => {
        if (!cancelled) setPairScanError(error?.message || "Could not read the answer QR.");
      },
    })
      .then((session) => {
        if (cancelled) {
          session.stop();
          return;
        }
        answerScanRef.current = session;
        if (session.hint) setPairScanHint(session.hint);
      })
      .catch((error) => {
        if (!cancelled) {
          setScanningAnswer(false);
          setPairScanError(error?.message || "Could not start answer scanning.");
        }
      });
    return () => {
      cancelled = true;
      answerScanRef.current?.stop();
      answerScanRef.current = null;
    };
  }, [scanningAnswer, setAnswerDraft]);

  function startAnswerScan() {
    setScanningAnswer(true);
  }

  function stopAnswerScan() {
    setScanningAnswer(false);
    setPairScanHint("");
  }

  return (
    <section className="pos-pairing">
      <p className="kicker light">Pair a scanner</p>
      {online && session ? (
        <>
          <h2>{session.code}</h2>
          <canvas ref={qrRef} aria-label={`QR code for session ${session.code}`} />
          <p className="pos-scan-url">
            USB scanner: just plug it in and scan on this page. No pairing needed.
          </p>
          <p className="pos-scan-url">
            Phone camera scanner:
            <br />
            <a href={scanUrl} target="_blank" rel="noreferrer">
              {scanUrl}
            </a>
          </p>
          <p>Or scan the QR / type the code at /pos/scan after signing in as admin.</p>
          {/127\.0\.0\.1|localhost/.test(scanUrl) && (
            <p className="pos-webrtc-hint">
              Tip: open this POS page via your Mac’s LAN URL first (e.g. http://192.168.x.x:5173/pos) so the QR works on a phone.
            </p>
          )}
        </>
      ) : (
        <p className="pos-webrtc-hint">
          {offlinePhoneLinkEnabled
            ? "Internet is offline. Use WebRTC pairing so a phone can still push scans."
            : "Internet is offline. Reconnect to pair a phone scanner, or use this device only."}
        </p>
      )}
      {offlinePhoneLinkEnabled ? (
        <div className="pos-webrtc">
          <div className="pos-webrtc-head">
            <strong>Offline phone link</strong>
            <span className={`pos-webrtc-status is-${webrtcStatus}`}>{webrtcStatus}</span>
          </div>
          {webrtcStatus === "idle" || webrtcStatus === "closed" || webrtcStatus === "failed" || webrtcStatus === "disconnected" ? (
            <button className="btn solid pos-tap" type="button" onClick={onStartOffline}>
              Start offline pair
            </button>
          ) : (
            <>
              {offerPayload && webrtcStatus !== "connected" && (
                <div className="pos-pair-qr">
                  <p className="pos-webrtc-hint">Point the phone camera at this offer QR (Offline WebRTC → Scan offer QR).</p>
                  <canvas ref={offerQrRef} aria-label="Offer QR for the phone scanner" />
                </div>
              )}
              {webrtcStatus !== "connected" && (
                <div className="pos-pair-answer">
                  {!hasCamera && (
                    <p className="pos-webrtc-hint">
                      This computer has no camera. On the phone tap <strong>Copy answer</strong>, then paste it here and Connect.
                    </p>
                  )}
                  <div className="pos-webrtc-actions">
                    {hasCamera && (
                      !scanningAnswer ? (
                        <button className="btn solid pos-tap" type="button" onClick={startAnswerScan}>
                          Scan answer QR
                        </button>
                      ) : (
                        <button className="btn line light pos-tap" type="button" onClick={stopAnswerScan}>
                          Stop answer scan
                        </button>
                      )
                    )}
                    <button
                      className={hasCamera ? "btn line light pos-tap" : "btn solid pos-tap"}
                      type="button"
                      onClick={() => setShowText(true)}
                    >
                      Paste answer
                    </button>
                    {showText && hasCamera && (
                      <button className="text-link" type="button" onClick={() => setShowText(false)}>
                        Hide paste
                      </button>
                    )}
                  </div>
                  {scanningAnswer && (
                    <div className="pos-pair-scan-camera">
                      <video ref={answerVideoRef} muted playsInline aria-label="Scan answer QR from phone" />
                    </div>
                  )}
                  {pairScanHint && <p className="notice">{pairScanHint}</p>}
                  {pairScanError && <p className="error">{pairScanError}</p>}
                  {(showText || !hasCamera) && (
                    <>
                      <label>
                        Paste answer from phone
                        <textarea
                          value={answerDraft}
                          rows={4}
                          onChange={(e) => setAnswerDraft(e.target.value)}
                          placeholder="Paste the answer the phone copied"
                          autoComplete="off"
                          spellCheck={false}
                        />
                      </label>
                      <button className="btn solid pos-tap" type="button" disabled={!answerDraft.trim()} onClick={() => onAcceptAnswer()}>
                        Connect phone
                      </button>
                      <details className="pos-pair-details">
                        <summary>Offer text (rare fallback)</summary>
                        {offerPayload && (
                          <textarea readOnly value={offerPayload} rows={3} onFocus={(e) => e.target.select()} />
                        )}
                      </details>
                    </>
                  )}
                </div>
              )}
              <div className="pos-webrtc-actions">
                <button className="btn line light pos-tap" type="button" onClick={onStopOffline}>
                  Stop offline link
                </button>
              </div>
              {webrtcStatus === "connected" && <p className="notice">Phone linked over WebRTC. Scans appear in the cart.</p>}
            </>
          )}
        </div>
      ) : null}
      <button className="btn line light pos-tap" type="button" onClick={onSolo}>
        Use this phone only
      </button>
    </section>
  );
}

export default function Pos() {
  useDocumentTitle("POS");
  const [mode, setMode] = useState(initialMode);
  const [session, setSession] = useState(null);
  const [cart, setCart] = useState([]);
  const [tab, setTab] = useState("scan");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [discount, setDiscount] = useState("");
  const [discountMode, setDiscountMode] = useState("amount"); // amount | percent
  const [discountManual, setDiscountManual] = useState(false);
  const [customerPhone, setCustomerPhone] = useState("");
  const [offerPreview, setOfferPreview] = useState(null);
  const [lastSale, setLastSale] = useState(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [cartLoaded, setCartLoaded] = useState(false);
  const [outbox, setOutbox] = useState({ pending: 0, conflicts: 0, total: 0 });
  const [webrtcStatus, setWebrtcStatus] = useState("idle");
  const [offerPayload, setOfferPayload] = useState("");
  const [answerDraft, setAnswerDraft] = useState("");
  const [scanUrl, setScanUrl] = useState("");
  const [scanFlash, setScanFlash] = useState(null); // { name, detail, image }
  const qrRef = useRef(null);
  const creatingRef = useRef(false);
  const hostPeerRef = useRef(null);
  const addBarcodeRef = useRef(null);
  const flashTimerRef = useRef(0);
  const addingRef = useRef(false);

  const { ready: sellableCart, blocked: blockedCart } = splitCart(cart);
  const cartCount = sellableCart.reduce((sum, line) => sum + line.qty, 0);
  const subtotal = sellableCart.reduce((sum, line) => sum + line.price * line.qty, 0);
  const discountInputNumber = Math.max(0, Number(discount) || 0);
  const discountNumber =
    discountMode === "percent"
      ? Math.min(subtotal, Math.round(((subtotal * Math.min(100, discountInputNumber)) / 100) * 100) / 100)
      : discountInputNumber;
  const discountPercentValue = discountMode === "percent" ? Math.min(100, discountInputNumber) : null;
  const total = Math.max(0, subtotal - discountNumber);
  const hasStockBlocks = blockedCart.length > 0;

  function applyOfferDiscount(offer) {
    const percent = Number(offer?.salePercent);
    if (Number.isFinite(percent) && percent > 0) {
      setDiscountMode("percent");
      setDiscount(String(percent));
      return;
    }
    const amount = Number(offer?.discountAmount);
    if (Number.isFinite(amount) && amount > 0) {
      setDiscountMode("amount");
      setDiscount(String(amount));
    }
  }

  useEffect(() => {
    if (!online) {
      setOfferPreview(null);
      return undefined;
    }
    const phone = customerPhone.trim();
    const timer = window.setTimeout(() => {
      const query = new URLSearchParams();
      if (phone) query.set("phone", phone);
      query.set("subtotal", String(subtotal));
      api(`/api/pos/offers/preview?${query.toString()}`)
        .then((data) => {
          const offer = data.offer || null;
          setOfferPreview(offer);
          if (!discountManual && offer?.eligible && (Number(offer.salePercent) > 0 || Number(offer.discountAmount) > 0)) {
            applyOfferDiscount(offer);
          } else if (!discountManual && (!offer || !offer.eligible)) {
            setDiscount("");
          }
        })
        .catch(() => setOfferPreview(null));
    }, 280);
    return () => window.clearTimeout(timer);
  }, [customerPhone, subtotal, online, discountManual]);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  const reportFlush = useCallback((summary) => {
    const synced = summary.accepted.length;
    const conflicts = summary.conflicts.length;
    if (synced) setNotice(`${synced} offline ${synced === 1 ? "sale" : "sales"} synced.`);
    if (conflicts) {
      const reasons = [...new Set(summary.conflicts.map((conflict) => conflict.reason.replace(/_/g, " ")))].join(", ");
      setError(`${conflicts} offline ${conflicts === 1 ? "sale needs" : "sales need"} review (${reasons}). Kept on this device.`);
    }
    // Network drops retry on the next online event; only surface real server/auth errors.
    if (summary.error && !isNetworkError(summary.error)) setError(summary.error.message);
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeOutbox(setOutbox);
    const cleanup = initOfflineCatalog({ onFlush: reportFlush });
    return () => {
      unsubscribe();
      cleanup();
    };
  }, [reportFlush]);

  useEffect(() => {
    let cancelled = false;
    loadCart()
      .then((saved) => {
        if (!cancelled) setCart((current) => current.length ? current : saved);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setCartLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (cartLoaded) saveCart(cart).catch(() => {});
  }, [cart, cartLoaded]);

  const createSession = useCallback(async (nextMode) => {
    if (creatingRef.current || !navigator.onLine) return;
    creatingRef.current = true;
    setError("");
    try {
      const result = await api("/api/pos/sessions", { method: "POST", body: { mode: nextMode } });
      setSession(result.session);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      creatingRef.current = false;
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("sa-pos-mode", mode);
    if (!session) {
      createSession(mode);
      return;
    }
    if (session.mode !== mode) {
      api(`/api/pos/sessions/${session.id}`, { method: "PATCH", body: { mode } })
        .then(({ session: updated }) => setSession(updated))
        .catch((requestError) => setError(requestError.message));
    }
  }, [mode, session, online, createSession]);

  useEffect(() => {
    if (!session || mode !== "dual") return undefined;
    let cancelled = false;
    getShareOrigin()
      .then((origin) => {
        if (cancelled) return;
        const url = `${origin}/pos/scan?c=${encodeURIComponent(session.code)}`;
        setScanUrl(url);
        if (!qrRef.current) return;
        return QRCode.toCanvas(qrRef.current, url, {
          width: 220,
          margin: 1,
          color: { dark: "#0a0a0a", light: "#ffffff" },
        });
      })
      .catch(() => {
        if (!cancelled) setError("Could not draw the pairing QR code.");
      });
    return () => {
      cancelled = true;
    };
  }, [session, mode]);

  useEffect(() => {
    if (!session || !online) return undefined;
    const timer = window.setTimeout(() => {
      api(`/api/pos/sessions/${session.id}`, {
        method: "PATCH",
        body: { cart: cart.map(({ itemId, qty }) => ({ itemId, qty })) },
      }).catch((requestError) => setError(requestError.message));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [cart, session, online]);

  const addItem = useCallback((item) => {
    rememberCatalogItems([item]);
    const stock = availableStock(item);
    const detail = [item.color, item.size, item.sku || item.barcode].filter(Boolean).join(" · ");

    if (stock < 1) {
      // Never add zero-stock items to the sale cart.
      setError(`Out of stock — not added: ${item.name}${detail ? ` · ${detail}` : ""}.`);
      setNotice("");
      setScanFlash({
        name: item.name,
        detail: "Out of stock — not added",
        image: itemThumb(item),
      });
      window.clearTimeout(flashTimerRef.current);
      flashTimerRef.current = window.setTimeout(() => setScanFlash(null), 1400);
      return;
    }

    setError("");
    let blockedIncrease = false;
    setCart((current) => {
      const found = current.find((line) => line.itemId === item.id);
      if (found) {
        if (found.qty >= stock) {
          blockedIncrease = true;
          return current.map((line) => (line.itemId === item.id ? { ...line, stock } : line));
        }
        return current.map((line) =>
          line.itemId === item.id ? { ...line, ...item, itemId: item.id, stock, qty: line.qty + 1 } : line
        );
      }
      return [...current, { ...item, itemId: item.id, qty: 1, stock }];
    });

    if (blockedIncrease) {
      setError(`Only ${stock} in stock for ${item.name}. Cannot add more.`);
      return;
    }

    setNotice(`${item.name}${detail ? ` · ${detail}` : ""} added · ${stock} in stock.`);
    setScanFlash({
      name: item.name,
      detail: detail ? `${detail} · stock ${stock}` : `stock ${stock}`,
      image: itemThumb(item),
    });
    window.clearTimeout(flashTimerRef.current);
    flashTimerRef.current = window.setTimeout(() => setScanFlash(null), 1400);
    try {
      navigator.vibrate?.([30, 40, 30]);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(
    () => () => {
      window.clearTimeout(flashTimerRef.current);
    },
    []
  );

  const addBarcode = useCallback(async (barcode) => {
    if (addingRef.current) return;
    addingRef.current = true;
    setBusy(true);
    setError("");
    try {
      addItem(await resolveBarcode(barcode));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      addingRef.current = false;
      setBusy(false);
    }
  }, [addItem]);

  addBarcodeRef.current = addBarcode;

  // USB barcode scanner: scan anywhere on this page, the item goes straight to the cart.
  useUsbScanner((code) => addBarcodeRef.current?.(code));

  async function startOfflinePair() {
    setError("");
    setAnswerDraft("");
    try {
      hostPeerRef.current?.close();
      setWebrtcStatus("gathering");
      const host = await createHostPeer({
        onBarcode: (code) => addBarcodeRef.current?.(code),
        onStatus: setWebrtcStatus,
      });
      hostPeerRef.current = host;
      setOfferPayload(host.offerPayload);
      setWebrtcStatus("waiting-answer");
      setNotice("Point the phone at the offer QR, then scan the phone’s answer QR here.");
    } catch (err) {
      setWebrtcStatus("failed");
      setError(err.message || "Could not start offline pairing.");
    }
  }

  async function acceptOfflineAnswer(raw) {
    setError("");
    const payload = String(raw ?? answerDraft).trim();
    try {
      if (!hostPeerRef.current) throw new Error("Start offline pair first.");
      if (!payload) throw new Error("Scan or paste the answer from the phone.");
      setAnswerDraft(payload);
      setWebrtcStatus("connecting");
      await hostPeerRef.current.acceptAnswer(payload);
      setWebrtcStatus("connected");
      setNotice("Phone linked. Scans will appear in the cart.");
    } catch (err) {
      setWebrtcStatus("failed");
      setError(err.message || "Could not accept the phone answer.");
    }
  }

  function stopOfflinePair() {
    hostPeerRef.current?.close();
    hostPeerRef.current = null;
    setOfferPayload("");
    setAnswerDraft("");
    setWebrtcStatus("idle");
  }

  useEffect(() => () => {
    hostPeerRef.current?.close();
  }, []);

  useEffect(() => {
    if (mode !== "dual") stopOfflinePair();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  useEffect(() => {
    if (mode !== "dual" || !session || !online) return undefined;
    let stopped = false;
    let cursor = 0;
    let timer;
    const poll = async () => {
      try {
        const result = await api(`/api/pos/sessions/${session.id}/events?since=${cursor}`);
        cursor = result.cursor;
        for (const event of result.events) {
          if (event.found === false || (!event.item && event.barcode)) {
            setNotice("");
            setError(`Not in database: ${event.barcode}`);
            setScanFlash({
              name: event.barcode,
              detail: "Not in database",
              image: "",
            });
            window.clearTimeout(flashTimerRef.current);
            flashTimerRef.current = window.setTimeout(() => setScanFlash(null), 1600);
            continue;
          }
          if (event.item) addItem(event.item);
          else if (event.barcode) await addBarcode(event.barcode);
        }
      } catch (requestError) {
        if (requestError.status !== 404) setError(requestError.message);
      } finally {
        if (!stopped) timer = window.setTimeout(poll, 600);
      }
    };
    poll();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [mode, session, online, addItem, addBarcode]);

  function setQty(itemId, qty) {
    setCart((current) => {
      const line = current.find((entry) => entry.itemId === itemId);
      if (!line) return current;
      const stock = availableStock(line);
      if (qty < 1) return current.filter((entry) => entry.itemId !== itemId);
      if (qty > stock && stock >= 1) {
        setError(`Only ${stock} in stock for ${line.name}.`);
        return current.map((entry) => (entry.itemId === itemId ? { ...entry, qty: stock } : entry));
      }
      setError("");
      return current.map((entry) => (entry.itemId === itemId ? { ...entry, qty } : entry));
    });
  }

  async function completeSale() {
    if (!sellableCart.length || discountNumber > subtotal || hasStockBlocks) return;
    setBusy(true);
    setError("");
    setNotice("");
    const clientId = newClientId();
    const createdAt = new Date().toISOString();
    const phone = customerPhone.trim();
    const saleLines = sellableCart;

    async function saveOffline() {
      const offlineSale = {
        id: `offline_${clientId}`,
        receiptNo: `OFFLINE-${createdAt.slice(0, 10).replace(/-/g, "")}`,
        clientId,
        items: saleLines.map((line) => ({
          itemId: line.itemId,
          name: line.name,
          color: line.color,
          size: line.size,
          barcode: line.barcode,
          image: line.image,
          price: line.price,
          qty: line.qty,
          lineTotal: line.price * line.qty,
        })),
        subtotal,
        discount: discountNumber,
        total,
        paymentMethod,
        customerPhone: phone,
        createdAt,
        source: "offline",
      };
      await queueSale({
        clientId,
        items: saleLines,
        paymentMethod,
        discount: discountNumber,
        discountPercent: discountPercentValue,
        customerPhone: phone,
        createdAt,
      });
      setCart([]);
      setDiscount("");
      setDiscountMode("amount");
      setDiscountManual(false);
      setCustomerPhone("");
      setOfferPreview(null);
      setTab("scan");
      setLastSale({
        ...offlineSale,
        discountPercent: discountPercentValue,
      });
      setNotice("Sale saved offline · will sync. You can still print this invoice.");
    }

    try {
      if (!navigator.onLine) {
        await saveOffline();
        return;
      }
      const result = await api("/api/pos/sales", {
        method: "POST",
        body: {
          sessionId: session?.id,
          items: saleLines.map(({ itemId, qty }) => ({ itemId, qty })),
          paymentMethod,
          clientId,
          discount: discountNumber,
          discountPercent: discountPercentValue,
          customerPhone: phone,
        },
      });
      setCart([]);
      setDiscount("");
      setDiscountMode("amount");
      setDiscountManual(false);
      setCustomerPhone("");
      setOfferPreview(null);
      setSession(null);
      setTab("scan");
      setLastSale(result.sale);
      const giftNote = result.sale.giftEligible ? " · hand over special gift" : "";
      const offerNote =
        result.sale.offerKind === "inaugural"
          ? ` · inauguration #${result.sale.offerSlot} (${result.sale.offerPercent}%)`
          : result.sale.offerKind === "lifetime"
            ? ` · lifetime ${result.sale.lifetimePercent}%`
            : "";
      setNotice(`Sale complete · ${result.sale.receiptNo}${offerNote}${giftNote}`);
    } catch (requestError) {
      if (isNetworkError(requestError)) {
        // Connection dropped mid-request; the same clientId lets the server dedupe if it did go through.
        try {
          await saveOffline();
        } catch (queueError) {
          setError("Could not save this sale offline. Keep the cart open and try again.");
        }
      } else {
        setError(requestError.message);
      }
    } finally {
      setBusy(false);
    }
  }

  function retryConflicts() {
    flushOutbox({ includeConflicts: true }).then(reportFlush);
  }

  const cartPanel = (
    <section className="pos-card">
      <div className="pos-section-title">
        <h2>Cart</h2>
        <span>
          {cartCount} sellable
          {hasStockBlocks ? ` · ${blockedCart.length} blocked` : ""}
        </span>
      </div>
      {mode === "dual" && <ProductSearch onPick={addItem} busy={busy} />}
      <Cart cart={cart} setQty={setQty} remove={(itemId) => setCart((current) => current.filter((line) => line.itemId !== itemId))} />
    </section>
  );

  const payPanel = (
    <section className="pos-card pos-pay">
      <h2>Payment</h2>
      {hasStockBlocks && (
        <p className="error">
          Remove or fix {blockedCart.length} out-of-stock item{blockedCart.length === 1 ? "" : "s"} in the cart before paying.
        </p>
      )}
      <label>
        Payment method
        <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}>
          <option value="cash">Cash</option>
          <option value="card">Card</option>
          <option value="mobile">Mobile banking</option>
          <option value="other">Other</option>
        </select>
      </label>
      <label>
        Customer phone (for SMS + offers)
        <input
          value={customerPhone}
          onChange={(event) => setCustomerPhone(event.target.value)}
          placeholder="01XXXXXXXXX"
          inputMode="tel"
          autoComplete="tel"
        />
      </label>
      {offerPreview?.message ? (
        <p className={`pos-offer-banner ${offerPreview.eligible ? "is-eligible" : ""}`} role="status">
          {offerPreview.message}
        </p>
      ) : null}
      {offerPreview?.giftEligible ? (
        <p className="pos-gift-alert" role="status">
          Special gift — hand over gift (৳{offerPreview.giftMinSubtotal || 5000}+)
        </p>
      ) : null}
      <div className="pos-discount-field">
        <div className="pos-discount-head">
          <span>Discount</span>
          <div className="pos-discount-mode" role="group" aria-label="Discount mode">
            <button
              type="button"
              className={discountMode === "amount" ? "is-active" : ""}
              onClick={() => {
                setDiscountManual(true);
                setDiscountMode("amount");
                setDiscount(discountNumber ? String(discountNumber) : "");
              }}
            >
              ৳
            </button>
            <button
              type="button"
              className={discountMode === "percent" ? "is-active" : ""}
              onClick={() => {
                setDiscountManual(true);
                setDiscountMode("percent");
                const pct =
                  subtotal > 0 && discountNumber > 0
                    ? Math.round((discountNumber / subtotal) * 1000) / 10
                    : discountInputNumber;
                setDiscount(pct ? String(pct) : "");
              }}
            >
              %
            </button>
          </div>
        </div>
        <input
          type="number"
          min="0"
          max={discountMode === "percent" ? 100 : subtotal}
          step={discountMode === "percent" ? "0.1" : "1"}
          value={discount}
          onChange={(event) => {
            setDiscountManual(true);
            setDiscount(event.target.value);
          }}
          placeholder={discountMode === "percent" ? "e.g. 15" : "e.g. 500"}
        />
        {discountMode === "percent" && discountInputNumber > 0 ? (
          <small className="pos-discount-hint">= {money(discountNumber)} off</small>
        ) : null}
      </div>
      {discountManual && offerPreview?.eligible ? (
        <button
          className="text-link"
          type="button"
          onClick={() => {
            setDiscountManual(false);
            applyOfferDiscount(offerPreview);
          }}
        >
          Reset to offer discount
          {offerPreview.salePercent
            ? ` (${offerPreview.salePercent}% · ${money(offerPreview.discountAmount || 0)})`
            : ` (${money(offerPreview.discountAmount || 0)})`}
        </button>
      ) : null}
      <div className="pos-totals">
        <p><span>Subtotal</span><strong>{money(subtotal)}</strong></p>
        <p>
          <span>Discount{discountPercentValue != null && discountPercentValue > 0 ? ` (${discountPercentValue}%)` : ""}</span>
          <strong>−{money(discountNumber)}</strong>
        </p>
        <p className="pos-total"><span>Total</span><strong>{money(total)}</strong></p>
      </div>
      {discountNumber > subtotal && <p className="error">Discount cannot exceed the subtotal.</p>}
      <button
        className="btn solid pos-complete"
        type="button"
        disabled={busy || !sellableCart.length || hasStockBlocks || discountNumber > subtotal}
        onClick={completeSale}
      >
        {busy ? "Processing…" : "Complete sale"}
      </button>
    </section>
  );

  return (
    <div className={`pos-shell ${scanFlash ? "is-scan-flash" : ""}`}>
      {scanFlash && (
        <div className="pos-scan-flash" role="status" aria-live="polite">
          <img src={scanFlash.image} alt="" width={96} height={96} />
          <div>
            <p>Added</p>
            <strong>{scanFlash.name}</strong>
            {scanFlash.detail ? <small>{scanFlash.detail}</small> : null}
          </div>
        </div>
      )}
      <header className="pos-header">
        <div>
          <p className="kicker light">
            <Link to="/admin" className="pos-brand-link">
              StyleARZ
            </Link>
          </p>
          <h1>Point of sale</h1>
        </div>
        <div className="pos-header-actions">
          <span className={`pos-online ${online ? "is-online" : ""}`}>{online ? "Online" : "Offline"}</span>
          {outbox.total > 0 && (
            <span className={`pos-outbox ${outbox.conflicts ? "has-conflicts" : ""}`}>
              {outbox.pending > 0 && `${outbox.pending} to sync`}
              {outbox.pending > 0 && outbox.conflicts > 0 && " · "}
              {outbox.conflicts > 0 && `${outbox.conflicts} to review`}
            </span>
          )}
          {outbox.conflicts > 0 && online && (
            <button type="button" className="pos-mode" onClick={retryConflicts}>Retry conflicts</button>
          )}
          <button type="button" className="pos-mode" onClick={() => setMode((current) => current === "solo" ? "dual" : "solo")}>
            {mode === "solo" ? "Switch to Dual" : "Switch to Solo"}
          </button>
          <Link to="/admin">Admin home</Link>
        </div>
      </header>

      {(error || notice) && (
        <div className="pos-messages">
          {error && <p className="error">{error}</p>}
          {notice && <p className="notice">{notice}</p>}
          {!session && online && <button className="text-link" type="button" onClick={() => createSession(mode)}>Retry session</button>}
        </div>
      )}

      {OFFLINE_PHONE_LINK_ENABLED ? <PrepareOffline role="counter" /> : null}

      {lastSale ? (
        <InvoicePanel sale={lastSale} onClose={() => setLastSale(null)} autoFocusPhone={!lastSale.customerPhone} />
      ) : null}

      {mode === "dual" ? (
        <div className="pos-dual">
          <Pairing
            session={session}
            qrRef={qrRef}
            scanUrl={scanUrl || `${window.location.origin}/pos/scan?c=${encodeURIComponent(session?.code || "")}`}
            online={online}
            webrtcStatus={webrtcStatus}
            offerPayload={offerPayload}
            answerDraft={answerDraft}
            setAnswerDraft={setAnswerDraft}
            onStartOffline={startOfflinePair}
            onAcceptAnswer={acceptOfflineAnswer}
            onStopOffline={stopOfflinePair}
            onSolo={() => setMode("solo")}
            offlinePhoneLinkEnabled={OFFLINE_PHONE_LINK_ENABLED}
          />
          <div className="pos-register">
            {cartPanel}
            {payPanel}
          </div>
        </div>
      ) : (
        <div className="pos-solo">
          <div className={tab === "scan" ? "" : "pos-tab-hidden"}>
            <ScannerPanel
              onBarcode={addBarcode}
              onPick={addItem}
              busy={busy}
              cart={cart}
              onOpenCart={() => setTab("cart")}
            />
          </div>
          <div className={tab === "cart" ? "" : "pos-tab-hidden"}>{cartPanel}</div>
          <div className={tab === "pay" ? "" : "pos-tab-hidden"}>{payPanel}</div>
          <nav className="pos-tabs" aria-label="Point of sale steps">
            {[
              { id: "scan", label: "Scan" },
              { id: "cart", label: "Cart" },
              { id: "pay", label: "Pay" },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                className={`${tab === item.id ? "active" : ""} ${item.id === "cart" && cartCount ? "has-badge" : ""}`}
                onClick={() => setTab(item.id)}
              >
                <span className="pos-tab-label">{item.label}</span>
                {item.id === "cart" && cartCount > 0 && <em className="pos-tab-badge">{cartCount > 99 ? "99+" : cartCount}</em>}
              </button>
            ))}
          </nav>
        </div>
      )}
    </div>
  );
}