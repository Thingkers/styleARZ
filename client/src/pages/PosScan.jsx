import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { useDocumentTitle } from "../hooks";
import { canUseCameraScanner, startCameraScanner } from "../pos/scanner";
import { canUsePairingQrScanner, copyPairingText, drawPairingQr, startPairingQrScanner } from "../pos/pairQr";
import { createScannerPeer } from "../pos/webrtc";
import PrepareOffline from "../pos/PrepareOffline";

export default function PosScan() {
  useDocumentTitle("POS Scanner");
  const [params] = useSearchParams();
  const autoPrepare = params.get("prepare") === "1";
  const [code, setCode] = useState(() => String(params.get("c") || "").trim().toUpperCase());
  const [session, setSession] = useState(null);
  const [manual, setManual] = useState("");
  const [cameraOn, setCameraOn] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [offlineMode, setOfflineMode] = useState(!navigator.onLine);
  const [offerDraft, setOfferDraft] = useState("");
  const [answerPayload, setAnswerPayload] = useState("");
  const [rtcStatus, setRtcStatus] = useState("idle");
  const [showText, setShowText] = useState(false);
  const [scanningOffer, setScanningOffer] = useState(false);
  const [pairHint, setPairHint] = useState("");
  const [copyNotice, setCopyNotice] = useState("");
  const videoRef = useRef(null);
  const sessionRef = useRef(null);
  const submitRef = useRef(null);
  const scannerPeerRef = useRef(null);
  const offerScanRef = useRef(null);
  const offerVideoRef = useRef(null);
  const answerQrRef = useRef(null);
  const sendingRef = useRef(false);
  const [capturing, setCapturing] = useState(false);
  const [scanHint, setScanHint] = useState("");

  function stopCameraScanner() {
    sessionRef.current?.stop();
    sessionRef.current = null;
    setCameraOn(false);
  }

  function resetPairingState({ keepDraft = false } = {}) {
    if (offerScanRef.current) {
      offerScanRef.current.stop();
      offerScanRef.current = null;
    }
    if (scannerPeerRef.current) {
      scannerPeerRef.current.close();
      scannerPeerRef.current = null;
    }
    setAnswerPayload("");
    setPairHint("");
    setCopyNotice("");
    setShowText(false);
    setScanningOffer(false);
    if (!keepDraft) setOfferDraft("");
    setRtcStatus("idle");
  }

  const peerConnected = Boolean(scannerPeerRef.current?.connected) || rtcStatus === "connected";

  useEffect(() => {
    const update = () => {
      const next = navigator.onLine;
      setOnline(next);
      if (!next) setOfflineMode(true);
    };
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  useEffect(() => () => {
    stopCameraScanner();
    resetPairingState();
  }, []);

  useEffect(() => {
    if (!answerPayload || !answerQrRef.current) return undefined;
    let cancelled = false;
    drawPairingQr(answerQrRef.current, answerPayload).catch(() => {
      if (!cancelled) setError("Could not draw the answer QR. Use Show text instead.");
    });
    return () => {
      cancelled = true;
    };
  }, [answerPayload]);

  async function join(value = code) {
    const normalized = String(value || "").trim().toUpperCase();
    if (!normalized || normalized.length !== 6) return;
    setBusy(true);
    setError("");
    stopCameraScanner();
    resetPairingState({ keepDraft: false });
    try {
      const result = await api(`/api/pos/sessions/${encodeURIComponent(normalized)}`);
      setCode(normalized);
      setSession(result.session);
      setOfflineMode(false);
      setMessage(`Connected to register ${normalized}.`);
    } catch (requestError) {
      setSession(null);
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    const queryCode = String(params.get("c") || "").trim();
    if (queryCode && queryCode.length === 6 && navigator.onLine) join(queryCode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startOfflineFromOffer(raw) {
    const payload = String(raw ?? offerDraft).trim();
    if (!payload) {
      setError("Scan or paste the offer from the register.");
      return;
    }
    setBusy(true);
    setError("");
    setAnswerPayload("");
    setOfferDraft(payload);
    try {
      resetPairingState({ keepDraft: true });
      setScanningOffer(false);
      setRtcStatus("answering");
      const peer = await createScannerPeer({ onStatus: setRtcStatus });
      scannerPeerRef.current = peer;
      const answer = await peer.answerFromOffer(payload);
      setAnswerPayload(answer);
      setMessage("Show this answer QR to the register, then start scanning when connected.");
      setSession({ id: "webrtc", code: "OFFLINE" });
    } catch (err) {
      setRtcStatus("failed");
      setError(err.message || "Could not build offline answer.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!scanningOffer) return undefined;
    if (!canUsePairingQrScanner()) {
      setError("This phone cannot open a camera to scan the offer QR.");
      setScanningOffer(false);
      return undefined;
    }
    let cancelled = false;
    setCameraOn(false);
    setError("");
    setPairHint("Point at the offer QR on the register.");
    startPairingQrScanner({
      video: offerVideoRef.current,
      onPayload: (payload) => {
        if (cancelled) return;
        setScanningOffer(false);
        setPairHint("Offer scanned — creating answer…");
        startOfflineFromOffer(payload);
      },
      onError: (scanError) => {
        if (!cancelled) setError(scanError?.message || "Could not read the offer QR.");
      },
    })
      .then((scan) => {
        if (cancelled) {
          scan.stop();
          return;
        }
        offerScanRef.current = scan;
        if (scan.hint) setPairHint(scan.hint);
      })
      .catch((scanError) => {
        if (!cancelled) {
          setScanningOffer(false);
          setError(scanError?.message || "Could not start offer scanning.");
        }
      });
    return () => {
      cancelled = true;
      offerScanRef.current?.stop();
      offerScanRef.current = null;
    };
    // startOfflineFromOffer is stable enough for this one-shot scan effect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanningOffer]);

  function startOfferScan() {
    setScanningOffer(true);
  }

  function stopOfferScan() {
    setScanningOffer(false);
    setPairHint("");
  }

  async function copyAnswer() {
    setCopyNotice("");
    setError("");
    try {
      await copyPairingText(answerPayload);
      setCopyNotice("Answer copied. On the register: Paste answer → Connect phone.");
    } catch (copyError) {
      setShowText(true);
      setError(copyError?.message || "Could not copy. Select the answer text and copy manually.");
    }
  }

  async function shareAnswer() {
    setError("");
    try {
      if (!navigator.share) {
        await copyAnswer();
        return;
      }
      await navigator.share({ title: "StyleARZ POS answer", text: answerPayload });
      setCopyNotice("Shared. Paste into the register’s Paste answer box, then Connect.");
    } catch (shareError) {
      if (shareError?.name === "AbortError") return;
      await copyAnswer();
    }
  }

  async function submitBarcode(barcode) {
    const value = String(barcode || "").trim();
    if (!value || busy || sendingRef.current) return;
    sendingRef.current = true;

    if (offlineMode || peerConnected) {
      setBusy(true);
      setError("");
      try {
        if (!scannerPeerRef.current?.connected && rtcStatus !== "connected") {
          throw new Error("Offline link is not connected yet. Scan the answer QR on the register.");
        }
        scannerPeerRef.current.sendBarcode(value);
        setMessage(`${value} sent over WebRTC.`);
        setManual("");
      } catch (err) {
        setError(err.message);
      } finally {
        sendingRef.current = false;
        setBusy(false);
      }
      return;
    }

    if (!session) {
      sendingRef.current = false;
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await api(`/api/pos/sessions/${session.id}/scans`, {
        method: "POST",
        body: { barcode: value },
      });
      setMessage(result.item ? `${result.item.name} sent to register.` : `${value} sent; item was not found.`);
      setManual("");
    } catch (requestError) {
      setError(requestError.message);
      if (requestError.status === 409 || requestError.status === 404) {
        setSession(null);
        setCameraOn(false);
      }
    } finally {
      sendingRef.current = false;
      setBusy(false);
    }
  }
  submitRef.current = submitBarcode;

  const canScan = Boolean(session) || peerConnected;

  useEffect(() => {
    if (!cameraOn || !canScan) return undefined;
    let cancelled = false;
    setError("");
    setScanHint("Point at the barcode — it scans automatically, or tap Capture.");
    startCameraScanner({
      video: videoRef.current,
      onDetected: (barcode) => {
        setScanHint(`Scanned ${barcode}`);
        submitRef.current(barcode);
      },
      onError: (scannerError) => setError(scannerError?.message || "Could not read the camera."),
    })
      .then((session) => {
        if (cancelled) {
          session.stop();
          return;
        }
        sessionRef.current = session;
      })
      .catch((scannerError) => {
        if (!cancelled) {
          setError(scannerError?.message || "Camera permission was not granted.");
          setCameraOn(false);
        }
      });
    return () => {
      cancelled = true;
      sessionRef.current?.stop();
      sessionRef.current = null;
    };
  }, [cameraOn, canScan, rtcStatus, session]);

  async function captureFrame() {
    if (!sessionRef.current || capturing || busy) return;
    setCapturing(true);
    setError("");
    setScanHint("Reading barcode…");
    try {
      const barcode = await sessionRef.current.capture();
      setScanHint(`Scanned ${barcode}`);
      await submitRef.current(barcode);
    } catch (captureError) {
      setError(captureError?.message || "Could not read a barcode from this frame.");
      setScanHint("Hold the label inside the orange frame, then Capture again.");
    } finally {
      setCapturing(false);
    }
  }

  function checkoutHere() {
    localStorage.setItem("sa-pos-mode", "solo");
  }

  return (
    <div className="pos-scan-page">
      <header>
        <div>
          <p className="kicker light">StyleARZ POS</p>
          <h1>Remote scanner</h1>
        </div>
        <span className={`pos-online ${online ? "is-online" : ""}`}>{online ? "Online" : "Offline"}</span>
      </header>

      <PrepareOffline role="phone" auto={autoPrepare} />

      <div className="pos-scan-mode-toggle">
        <button
          type="button"
          className={!offlineMode ? "active" : ""}
          onClick={() => {
            setOfflineMode(false);
            stopCameraScanner();
            resetPairingState();
            setSession(null);
            setMessage("");
          }}
          disabled={!online}
        >
          Online code
        </button>
        <button
          type="button"
          className={offlineMode ? "active" : ""}
          onClick={() => {
            setOfflineMode(true);
            stopCameraScanner();
            resetPairingState();
            setSession(null);
            setMessage("");
          }}
        >
          Offline WebRTC
        </button>
      </div>

      {offlineMode ? (
        <section className="pos-card pos-webrtc">
          <h2>Offline pair</h2>
          <p className="muted">
            Scan the register’s offer QR. Then either show the answer QR (if the register has a camera) or tap Copy answer and paste on the desktop.
          </p>
          <p>
            Status: <strong className={`pos-webrtc-status is-${rtcStatus}`}>{rtcStatus}</strong>
          </p>
          {!answerPayload && (
            <div className="pos-pair-offer-scan">
              <div className="pos-webrtc-actions">
                {!scanningOffer ? (
                  <button className="btn solid pos-tap" type="button" disabled={busy} onClick={startOfferScan}>
                    Scan offer QR
                  </button>
                ) : (
                  <button className="btn line light pos-tap" type="button" onClick={stopOfferScan}>
                    Stop offer scan
                  </button>
                )}
                <button className="text-link" type="button" onClick={() => setShowText((value) => !value)}>
                  {showText ? "Hide text" : "Show text / paste"}
                </button>
              </div>
              {scanningOffer && (
                <div className="pos-pair-scan-camera">
                  <video ref={offerVideoRef} muted playsInline aria-label="Scan offer QR from register" />
                </div>
              )}
              {pairHint && <p className="notice">{pairHint}</p>}
              {showText && (
                <>
                  <label>
                    Offer from register
                    <textarea
                      value={offerDraft}
                      rows={3}
                      onChange={(e) => setOfferDraft(e.target.value)}
                      placeholder="Paste offer payload"
                    />
                  </label>
                  <button
                    className="btn solid pos-tap"
                    type="button"
                    disabled={busy || !offerDraft.trim()}
                    onClick={() => startOfflineFromOffer()}
                  >
                    {busy ? "Creating answer…" : "Create answer"}
                  </button>
                </>
              )}
            </div>
          )}
          {answerPayload && (
            <div className="pos-pair-qr">
              <p className="pos-webrtc-hint">
                Desktop register (no camera): tap <strong>Copy answer</strong>, paste on the register, Connect.
                <br />
                Tablet with camera: point the register at this QR.
              </p>
              <div className="pos-webrtc-actions">
                <button className="btn solid pos-tap" type="button" onClick={copyAnswer}>
                  Copy answer
                </button>
                {typeof navigator.share === "function" && (
                  <button className="btn line light pos-tap" type="button" onClick={shareAnswer}>
                    Share answer
                  </button>
                )}
              </div>
              {copyNotice && <p className="notice">{copyNotice}</p>}
              <canvas ref={answerQrRef} aria-label="Answer QR for the register" />
              <button className="text-link" type="button" onClick={() => setShowText((value) => !value)}>
                {showText ? "Hide answer text" : "Show answer text"}
              </button>
              {showText && (
                <label>
                  Answer for register
                  <textarea readOnly value={answerPayload} rows={3} onFocus={(e) => e.target.select()} />
                </label>
              )}
            </div>
          )}
        </section>
      ) : !session ? (
        <form
          className="pos-join pos-card"
          onSubmit={(event) => {
            event.preventDefault();
            join();
          }}
        >
          <h2>Join a register</h2>
          <label>
            Six-character code
            <input
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              maxLength={6}
              autoCapitalize="characters"
              autoComplete="off"
              placeholder="ABC123"
            />
          </label>
          <button className="btn solid pos-tap" type="submit" disabled={busy || !online || code.trim().length !== 6}>
            {busy ? "Connecting…" : "Connect"}
          </button>
        </form>
      ) : null}

      {(session || rtcStatus === "connected") && (
        <main>
          <div className="pos-scanner-code">
            <span>{offlineMode ? "WebRTC" : "Connected"}</span>
            <strong>{session?.code || "OFFLINE"}</strong>
          </div>
          <div className={`pos-camera pos-camera-phone ${cameraOn ? "is-on" : ""}`}>
            <video ref={videoRef} muted playsInline aria-label="Barcode camera preview" />
            {!cameraOn && <p>Point the rear camera at a barcode</p>}
          </div>
          {cameraOn && scanHint && !error && <p className="notice">{scanHint}</p>}
          <div className="pos-camera-actions">
            <button
              className="btn dark pos-tap"
              type="button"
              disabled={!canUseCameraScanner()}
              onClick={() => setCameraOn((on) => !on)}
            >
              {cameraOn ? "Stop camera" : "Start camera"}
            </button>
            <button className="btn solid pos-tap" type="button" disabled={!cameraOn || capturing || busy} onClick={captureFrame}>
              {capturing ? "Reading…" : "Capture barcode"}
            </button>
          </div>
          <form
            className="pos-manual"
            onSubmit={(event) => {
              event.preventDefault();
              submitBarcode(manual);
            }}
          >
            <label>
              Manual barcode
              <input value={manual} onChange={(event) => setManual(event.target.value)} placeholder="Type barcode" autoComplete="off" />
            </label>
            <button
              className="btn solid pos-tap"
              type="submit"
              disabled={busy || !manual.trim() || (offlineMode ? rtcStatus !== "connected" : !online)}
            >
              {busy ? "Sending…" : "Send to register"}
            </button>
          </form>
        </main>
      )}

      {error && <p className="error">{error}</p>}
      {message && <p className="notice" role="status">{message}</p>}
      <Link className="pos-checkout-link" to="/pos" onClick={checkoutHere}>
        Checkout on this phone
      </Link>
    </div>
  );
}
