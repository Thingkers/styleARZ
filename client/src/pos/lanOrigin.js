/** Prefer a LAN origin so phone QR codes work (127.0.0.1 is useless on another device). */

function isLoopback(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

async function discoverLanHost() {
  if (!window.RTCPeerConnection) return "";
  const pc = new RTCPeerConnection({ iceServers: [] });
  pc.createDataChannel("lan");
  const found = new Promise((resolve) => {
    const timer = setTimeout(() => resolve(""), 1500);
    pc.onicecandidate = (event) => {
      const candidate = event.candidate?.candidate || "";
      const match = candidate.match(/ ([0-9]{1,3}(?:\.[0-9]{1,3}){3}) /);
      if (match && !match[1].startsWith("127.")) {
        clearTimeout(timer);
        resolve(match[1]);
      }
      if (!event.candidate) {
        clearTimeout(timer);
        resolve("");
      }
    };
  });
  try {
    await pc.setLocalDescription(await pc.createOffer());
  } catch {
    pc.close();
    return "";
  }
  const host = await found;
  pc.close();
  return host;
}

let cached = "";

export async function getShareOrigin() {
  if (!isLoopback(window.location.hostname)) return window.location.origin;
  if (cached) return cached;
  const host = await discoverLanHost();
  if (host) {
    cached = `${window.location.protocol}//${host}:${window.location.port || "5173"}`;
    return cached;
  }
  return window.location.origin;
}
