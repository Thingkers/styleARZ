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

function initialMode() {
  const saved = localStorage.getItem("sa-pos-mode");
  if (saved === "solo" || saved === "dual") return saved;
  return window.innerWidth < 900 ? "solo" : "dual";
}

function newClientId() {
  return globalThis.crypto?.randomUUID?.() || `pos-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function ScannerPanel({ onBarcode, busy }) {
  const videoRef = useRef(null);
  const sessionRef = useRef(null);
  const callbackRef = useRef(onBarcode);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [scanHint, setScanHint] = useState("");
  const [capturing, setCapturing] = useState(false);
  const [manual, setManual] = useState("");
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

  function submit(event) {
    event.preventDefault();
    const barcode = manual.trim();
    if (!barcode) return;
    callbackRef.current(barcode);
    setManual("");
  }

  return (
    <section className="pos-scan-panel">
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
      <form className="pos-manual" onSubmit={submit}>
        <label>
          Manual barcode
          <input
            value={manual}
            onChange={(event) => setManual(event.target.value)}
            placeholder="Type or paste barcode"
            autoComplete="off"
            inputMode="text"
          />
        </label>
        <button className="btn solid pos-tap" type="submit" disabled={busy || !manual.trim()}>
          Add item
        </button>
      </form>
    </section>
  );
}

function Cart({ cart, setQty, remove }) {
  if (!cart.length) return <p className="pos-empty">Scan an item to begin this sale.</p>;
  return (
    <ul className="pos-cart-list">
      {cart.map((line) => (
        <li key={line.itemId}>
          <div>
            <strong>{line.name}</strong>
            <small>{[line.color, line.size, line.barcode].filter(Boolean).join(" · ")}</small>
          </div>
          <div className="pos-line-actions">
            <button type="button" aria-label={`Decrease ${line.name}`} onClick={() => setQty(line.itemId, line.qty - 1)}>
              −
            </button>
            <b>{line.qty}</b>
            <button type="button" aria-label={`Increase ${line.name}`} onClick={() => setQty(line.itemId, line.qty + 1)}>
              +
            </button>
            <strong>{money(line.price * line.qty)}</strong>
            <button className="pos-remove" type="button" onClick={() => remove(line.itemId)}>
              Remove
            </button>
          </div>
        </li>
      ))}
    </ul>
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
            On the phone (same Wi‑Fi), open:
            <br />
            <a href={scanUrl} target="_blank" rel="noreferrer">
              {scanUrl}
            </a>
          </p>
          <p>Or scan the QR, or type the code at /pos/scan after signing in as admin on the phone.</p>
          {/127\.0\.0\.1|localhost/.test(scanUrl) && (
            <p className="pos-webrtc-hint">
              Tip: open this POS page via your Mac’s LAN URL first (e.g. http://192.168.x.x:5173/pos) so the QR works on a phone.
            </p>
          )}
        </>
      ) : (
        <p className="pos-webrtc-hint">Internet is offline. Use WebRTC pairing so a phone can still push scans.</p>
      )}
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
  const [scanFlash, setScanFlash] = useState(null);
  const qrRef = useRef(null);
  const creatingRef = useRef(false);
  const sessionRequestRef = useRef(0);
  const processedEventIdsRef = useRef(new Set());
  const cartSyncTokenRef = useRef(0);
  const hostPeerRef = useRef(null);
  const addBarcodeRef = useRef(null);
  const flashTimerRef = useRef(0);
  const addingRef = useRef(false);

  const cartCount = cart.reduce((sum, line) => sum + line.qty, 0);
  const subtotal = cart.reduce((sum, line) => sum + line.price * line.qty, 0);
  const discountNumber = Math.max(0, Number(discount) || 0);
  const total = Math.max(0, subtotal - discountNumber);

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
    if (summary.error && !isNetworkError(summary.error)) {
      setError(summary.error.message);
    }
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
    const requestId = ++sessionRequestRef.current;
    creatingRef.current = true;
    setError("");
    try {
      const result = await api("/api/pos/sessions", { method: "POST", body: { mode: nextMode } });
      if (requestId !== sessionRequestRef.current) return;
      setSession(result.session);
    } catch (requestError) {
      if (requestId !== sessionRequestRef.current) return;
      setError(requestError.message);
    } finally {
      if (requestId === sessionRequestRef.current) creatingRef.current = false;
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("sa-pos-mode", mode);
    if (!session) {
      createSession(mode);
      return;
    }
    if (session.mode !== mode) {
      const updateId = ++sessionRequestRef.current;
      api(`/api/pos/sessions/${session.id}`, { method: "PATCH", body: { mode } })
        .then(({ session: updated }) => {
          if (updateId !== sessionRequestRef.current) return;
          setSession(updated);
        })
        .catch((requestError) => {
          if (updateId !== sessionRequestRef.current) return;
          setError(requestError.message);
        });
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
    const token = ++cartSyncTokenRef.current;
    const timer = window.setTimeout(() => {
      api(`/api/pos/sessions/${session.id}`, {
        method: "PATCH",
        body: { cart: cart.map(({ itemId, qty }) => ({ itemId, qty })) },
      })
        .then((result) => {
          if (token !== cartSyncTokenRef.current || !result?.session) return;
          setSession((current) => current && current.id === result.session.id ? result.session : current);
        })
        .catch((requestError) => {
          if (token !== cartSyncTokenRef.current) return;
          setError(requestError.message);
        });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [cart, session, online]);

  const addItem = useCallback((item) => {
    if (!item || !item.id) return;
    rememberCatalogItems([item]);
    setCart((current) => {
      const found = current.find((line) => line.itemId === item.id);
      if (found) return current.map((line) => line.itemId === item.id ? { ...line, qty: line.qty + 1 } : line);
      return [...current, { ...item, itemId: item.id, qty: 1 }];
    });
    const label = [item.name, item.size].filter(Boolean).join(" · ");
    setNotice(`${label} added.`);
    setScanFlash(label);
    window.clearTimeout(flashTimerRef.current);
    flashTimerRef.current = window.setTimeout(() => setScanFlash(null), 900);
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
    setNotice("");
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
          const eventKey = event?.id ?? `${event?.type ?? "event"}-${event?.createdAt ?? event?.timestamp ?? "unknown"}`;
          if (!eventKey || processedEventIdsRef.current.has(eventKey)) continue;
          processedEventIdsRef.current.add(eventKey);
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
      processedEventIdsRef.current.clear();
    };
  }, [mode, session, online, addItem, addBarcode]);

  function setQty(itemId, qty) {
    if (qty < 1) setCart((current) => current.filter((line) => line.itemId !== itemId));
    else setCart((current) => current.map((line) => line.itemId === itemId ? { ...line, qty: Math.max(1, qty) } : line));
  }

  async function completeSale() {
    if (!cart.length || discountNumber > subtotal) return;
    setBusy(true);
    setError("");
    setNotice("");
    const clientId = newClientId();
    const createdAt = new Date().toISOString();
    const saleItems = cart.map(({ itemId, qty }) => ({ itemId, qty }));

    async function saveOffline() {
      await queueSale({ clientId, items: cart, paymentMethod, discount: discountNumber, createdAt });
      setCart([]);
      setDiscount("");
      setTab("scan");
      setNotice("Sale saved offline · will sync");
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
          items: saleItems,
          paymentMethod,
          clientId,
          discount: discountNumber,
        },
      });
      setCart([]);
      setDiscount("");
      setSession(null);
      setTab("scan");
      setNotice(`Sale complete · ${result.sale.receiptNo}`);
    } catch (requestError) {
      if (isNetworkError(requestError)) {
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
        <span>{cart.reduce((sum, line) => sum + line.qty, 0)} items</span>
      </div>
      <Cart cart={cart} setQty={setQty} remove={(itemId) => setCart((current) => current.filter((line) => line.itemId !== itemId))} />
    </section>
  );

  const payPanel = (
    <section className="pos-card pos-pay">
      <h2>Payment</h2>
      <label>
        Payment method
        <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}>
          <option value="cash">Cash</option>
          <option value="card">Card</option>
          <option value="other">Other</option>
        </select>
      </label>
      <label>
        Discount
        <input type="number" min="0" max={subtotal} value={discount} onChange={(event) => setDiscount(event.target.value)} />
      </label>
      <div className="pos-totals">
        <p><span>Subtotal</span><strong>{money(subtotal)}</strong></p>
        <p><span>Discount</span><strong>−{money(discountNumber)}</strong></p>
        <p className="pos-total"><span>Total</span><strong>{money(total)}</strong></p>
      </div>
      {discountNumber > subtotal && <p className="error">Discount cannot exceed the subtotal.</p>}
      <button className="btn solid pos-complete" type="button" disabled={busy || !cart.length || discountNumber > subtotal} onClick={completeSale}>
        {busy ? "Processing…" : "Complete sale"}
      </button>
    </section>
  );

  return (
    <div className={`pos-shell ${scanFlash ? "is-scan-flash" : ""}`}>
      {scanFlash && (
        <div className="pos-scan-flash" role="status" aria-live="polite">
          <p>Scanned</p>
          <strong>{scanFlash}</strong>
        </div>
      )}
      <header className="pos-header">
        <div>
          <p className="kicker light">StyleARZ</p>
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
          <Link to="/admin">Exit POS</Link>
        </div>
      </header>

      {(error || notice) && (
        <div className="pos-messages">
          {error && <p className="error">{error}</p>}
          {notice && <p className="notice">{notice}</p>}
          {!session && online && <button className="text-link" type="button" onClick={() => createSession(mode)}>Retry session</button>}
        </div>
      )}

      <PrepareOffline role="counter" />

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
          />
          <div className="pos-register">
            {cartPanel}
            {payPanel}
          </div>
        </div>
      ) : (
        <div className="pos-solo">
          <div className={tab === "scan" ? "" : "pos-tab-hidden"}><ScannerPanel onBarcode={addBarcode} busy={busy} /></div>
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
