import { deflateSync, inflateSync } from "fflate";

// Prefer LAN host candidates for shop Wi‑Fi. Optional STUN only when the browser reports online
// (helps some networks; ignored when the WAN is down).
function iceConfig() {
  if (typeof navigator !== "undefined" && navigator.onLine) {
    return { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };
  }
  return { iceServers: [] };
}

function toUrlSafeB64(bytes) {
  let binary = "";
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromUrlSafeB64(text) {
  const b64 = text.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

function parsePayload(json) {
  const parsed = JSON.parse(json);
  if (!parsed.sdp || !["offer", "answer"].includes(parsed.type)) {
    throw new Error("Invalid pairing payload.");
  }
  return parsed;
}

export async function encodePayload(desc) {
  const json = JSON.stringify({ type: desc.type, sdp: desc.sdp });
  const bytes = new TextEncoder().encode(json);
  const compressed = deflateSync(bytes);
  if (compressed.length && compressed.length < bytes.length) {
    return `z.${toUrlSafeB64(compressed)}`;
  }
  return toUrlSafeB64(bytes);
}

export async function decodePayload(raw) {
  const text = String(raw || "").trim();
  if (!text) throw new Error("Scan or paste the pairing code from the other device.");
  if (text.startsWith("{")) {
    return parsePayload(text);
  }

  let bytes;
  if (text.startsWith("z.")) {
    bytes = inflateSync(fromUrlSafeB64(text.slice(2)));
  } else {
    bytes = fromUrlSafeB64(text);
  }

  return parsePayload(new TextDecoder().decode(bytes));
}

function sdpHasCandidate(sdp) {
  return /a=candidate:/i.test(String(sdp || ""));
}

/**
 * Wait until ICE has at least one candidate (or gathering completes).
 * Avoids encoding an offer/answer with zero candidates — that hangs on “connecting…”.
 */
function waitForIce(pc, { maxMs = 8000 } = {}) {
  if (pc.iceGatheringState === "complete" && sdpHasCandidate(pc.localDescription?.sdp)) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (error) => {
      if (done) return;
      done = true;
      pc.removeEventListener("icegatheringstatechange", onGather);
      pc.removeEventListener("icecandidate", onCandidate);
      window.clearTimeout(timer);
      if (error) reject(error);
      else resolve();
    };
    const onGather = () => {
      if (pc.iceGatheringState === "complete") {
        if (sdpHasCandidate(pc.localDescription?.sdp)) finish();
        else finish(new Error("No local network address found. Join both devices to the same Wi‑Fi, then try again."));
      }
    };
    const onCandidate = (event) => {
      if (event.candidate && sdpHasCandidate(pc.localDescription?.sdp)) {
        // Keep gathering briefly for a few more candidates, but don't wait forever.
        window.setTimeout(() => {
          if (!done && sdpHasCandidate(pc.localDescription?.sdp)) finish();
        }, 400);
      }
      if (!event.candidate && sdpHasCandidate(pc.localDescription?.sdp)) finish();
    };
    pc.addEventListener("icegatheringstatechange", onGather);
    pc.addEventListener("icecandidate", onCandidate);
    const timer = window.setTimeout(() => {
      if (sdpHasCandidate(pc.localDescription?.sdp)) finish();
      else finish(new Error("Network setup timed out. Same Wi‑Fi on both devices, then Start offline pair again."));
    }, maxMs);
    onGather();
  });
}

function closePeer(pc, channel) {
  try {
    channel?.close();
  } catch {
    /* already closed */
  }
  try {
    pc?.close();
  } catch {
    /* already closed */
  }
}

function waitForPeerConnected(pc, { maxMs = 15000 } = {}) {
  if (pc.connectionState === "connected" || pc.iceConnectionState === "connected" || pc.iceConnectionState === "completed") {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (error) => {
      if (done) return;
      done = true;
      pc.removeEventListener("connectionstatechange", onState);
      pc.removeEventListener("iceconnectionstatechange", onIce);
      window.clearTimeout(timer);
      if (error) reject(error);
      else resolve();
    };
    const onState = () => {
      if (pc.connectionState === "connected") finish();
      if (pc.connectionState === "failed" || pc.connectionState === "closed") {
        finish(new Error("Could not link the phone. Same Wi‑Fi, then pair again from the start."));
      }
    };
    const onIce = () => {
      if (pc.iceConnectionState === "connected" || pc.iceConnectionState === "completed") finish();
      if (pc.iceConnectionState === "failed") {
        finish(new Error("Could not link the phone. Same Wi‑Fi, then pair again from the start."));
      }
    };
    pc.addEventListener("connectionstatechange", onState);
    pc.addEventListener("iceconnectionstatechange", onIce);
    const timer = window.setTimeout(() => {
      finish(new Error("Still connecting after 15s. Confirm both devices are on the same Wi‑Fi (not mobile data), then Start offline pair again."));
    }, maxMs);
    onState();
    onIce();
  });
}

function wireChannel(channel, { onBarcode, onStatus }) {
  channel.onopen = () => onStatus?.("connected");
  channel.onclose = () => onStatus?.("closed");
  channel.onerror = () => onStatus?.("error");
  channel.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === "scan" && msg.barcode) onBarcode?.(String(msg.barcode));
      if (msg.type === "hello") onStatus?.("connected");
    } catch {
      /* ignore non-JSON */
    }
  };
}

/** Counter (host): creates offer; phone scans/answers. */
export async function createHostPeer({ onBarcode, onStatus }) {
  onStatus?.("warming");
  const pc = new RTCPeerConnection(iceConfig());
  const channel = pc.createDataChannel("stylearz-scan", { ordered: true });
  wireChannel(channel, { onBarcode, onStatus });
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === "failed" || pc.connectionState === "disconnected") onStatus?.(pc.connectionState);
    if (pc.connectionState === "connected") onStatus?.("connected");
  };
  pc.oniceconnectionstatechange = () => {
    if (pc.iceConnectionState === "failed") onStatus?.("failed");
    if (pc.iceConnectionState === "connected" || pc.iceConnectionState === "completed") onStatus?.("connected");
  };

  try {
    onStatus?.("gathering");
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await waitForIce(pc);
    const local = pc.localDescription;
    if (!sdpHasCandidate(local?.sdp)) {
      throw new Error("No local network address found. Join the shop Wi‑Fi on this computer, then try again.");
    }

    return {
      peerConnection: pc,
      dataChannel: channel,
      offerPayload: await encodePayload(local),
      async acceptAnswer(raw) {
        const answer = await decodePayload(raw);
        onStatus?.("connecting");
        try {
          await pc.setRemoteDescription(answer);
          await waitForPeerConnected(pc);
          onStatus?.("connected");
        } catch (error) {
          closePeer(pc, channel);
          throw error;
        }
      },
      close() {
        closePeer(pc, channel);
      },
    };
  } catch (error) {
    closePeer(pc, channel);
    throw error;
  }
}

/** Phone (scanner): takes host offer; returns answer for counter to scan. */
export async function createScannerPeer({ onStatus }) {
  const pc = new RTCPeerConnection(iceConfig());
  let channel = null;

  pc.ondatachannel = (event) => {
    channel = event.channel;
    wireChannel(channel, {
      onStatus,
      onBarcode: () => {},
    });
    channel.onopen = () => {
      onStatus?.("connected");
      try {
        channel.send(JSON.stringify({ type: "hello" }));
      } catch {
        /* ignore */
      }
    };
  };
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === "connected") onStatus?.("connected");
    if (pc.connectionState === "failed" || pc.connectionState === "disconnected") onStatus?.(pc.connectionState);
  };
  pc.oniceconnectionstatechange = () => {
    if (pc.iceConnectionState === "failed") onStatus?.("failed");
    if (pc.iceConnectionState === "connected" || pc.iceConnectionState === "completed") onStatus?.("connected");
  };

  return {
    peerConnection: pc,
    async answerFromOffer(raw) {
      try {
        const offer = await decodePayload(raw);
        onStatus?.("answering");
        await pc.setRemoteDescription(offer);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await waitForIce(pc);
        if (!sdpHasCandidate(pc.localDescription?.sdp)) {
          throw new Error("No local network address on this phone. Join the same shop Wi‑Fi, then scan the offer again.");
        }
        return encodePayload(pc.localDescription);
      } catch (error) {
        closePeer(pc, channel);
        throw error;
      }
    },
    sendBarcode(barcode) {
      if (!channel || channel.readyState !== "open") {
        throw new Error("Offline link is not connected yet.");
      }
      channel.send(JSON.stringify({ type: "scan", barcode: String(barcode).trim() }));
    },
    get connected() {
      return channel?.readyState === "open";
    },
    close() {
      closePeer(pc, channel);
    },
  };
}
