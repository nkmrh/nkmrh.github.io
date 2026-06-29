// Diptych Offline Link — serverless WebRTC signaling via QR / copy-paste.
//
// No PeerJS, no broker, no STUN: the two devices exchange their WebRTC
// offer/answer descriptions directly (shown as a QR the other device scans,
// or as text to copy-paste). Once exchanged, a DataChannel carries the same
// vj-state / vj-audio messages the normal Display Link uses. On the same Wi-Fi
// the host ICE candidates connect peer-to-peer with zero external dependency.
window.OfflineLink = (function () {
  // No iceServers: on a LAN, host candidates are enough. (Cross-subnet would
  // need a STUN server; offline mode targets same-Wi-Fi by design.)
  const RTC_CONFIG = { iceServers: [] };

  // Shrink the SDP so it fits a comfortably-scannable QR: keep only UDP host /
  // srflx candidates (drop TCP and relay), which is all a same-Wi-Fi link uses.
  function filterSdp(sdp) {
    return sdp
      .split(/\r?\n/)
      .filter((line) => {
        if (line.indexOf("a=candidate:") === 0) {
          return /typ (host|srflx)/.test(line) && / udp /i.test(line);
        }
        return true;
      })
      .filter((line) => line.length > 0)
      .join("\r\n");
  }

  function pack(desc) {
    return JSON.stringify({ t: desc.type, s: filterSdp(desc.sdp) });
  }
  function unpack(blob) {
    const o = JSON.parse(blob);
    return { type: o.t, sdp: o.s.endsWith("\r\n") ? o.s : o.s + "\r\n" };
  }

  // Wait for ICE gathering to finish (non-trickle) so the single description we
  // hand off already contains every candidate. Bounded so a stuck gather still
  // yields whatever candidates we have.
  function gatherComplete(pc, timeoutMs) {
    return new Promise((resolve) => {
      if (pc.iceGatheringState === "complete") return resolve();
      let done = false;
      const finish = () => { if (!done) { done = true; resolve(); } };
      const to = setTimeout(finish, timeoutMs || 3000);
      pc.addEventListener("icegatheringstatechange", () => {
        if (pc.iceGatheringState === "complete") { clearTimeout(to); finish(); }
      });
    });
  }

  function wireChannel(dc, onOpen, onData) {
    dc.onopen = () => onOpen && onOpen(dc);
    dc.onmessage = (e) => {
      try { onData && onData(JSON.parse(e.data)); } catch (err) { /* ignore */ }
    };
  }

  // Offerer (the control side).
  async function makeOffer(onOpen, onData) {
    const pc = new RTCPeerConnection(RTC_CONFIG);
    const dc = pc.createDataChannel("vj", { ordered: true });
    wireChannel(dc, onOpen, onData);
    await pc.setLocalDescription(await pc.createOffer());
    await gatherComplete(pc);
    return { pc, dc, blob: pack(pc.localDescription) };
  }
  async function acceptAnswer(pc, answerBlob) {
    await pc.setRemoteDescription(unpack(answerBlob));
  }

  // Answerer (the display side).
  async function makeAnswer(offerBlob, onOpen, onData) {
    const pc = new RTCPeerConnection(RTC_CONFIG);
    pc.ondatachannel = (ev) => wireChannel(ev.channel, onOpen, onData);
    await pc.setRemoteDescription(unpack(offerBlob));
    await pc.setLocalDescription(await pc.createAnswer());
    await gatherComplete(pc);
    return { pc, blob: pack(pc.localDescription) };
  }

  // Render a string into a QR inside boxEl (uses vendored qrcodejs). Low error
  // correction = max data capacity for these ~700-byte descriptions.
  function showQR(boxEl, text) {
    boxEl.innerHTML = "";
    try {
      new window.QRCode(boxEl, {
        text, width: 240, height: 240,
        colorDark: "#000000", colorLight: "#ffffff",
        correctLevel: window.QRCode.CorrectLevel.L,
      });
      return true;
    } catch (e) {
      return false; // too long for a QR — caller should fall back to copy-paste
    }
  }

  // Scan QRs from the device camera (uses vendored jsQR). Calls onText(data) on
  // the first decode, or onText(null, error) if the camera can't start.
  function startScanner(videoEl, onText) {
    let stream = null, raf = null, stopped = false;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    function stop() {
      stopped = true;
      if (raf) cancelAnimationFrame(raf);
      if (stream) stream.getTracks().forEach((t) => t.stop());
    }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
      .then((s) => {
        stream = s;
        videoEl.srcObject = s;
        videoEl.setAttribute("playsinline", "");
        videoEl.muted = true;
        videoEl.play();
        const tick = () => {
          if (stopped) return;
          if (videoEl.readyState === videoEl.HAVE_ENOUGH_DATA && videoEl.videoWidth) {
            canvas.width = videoEl.videoWidth;
            canvas.height = videoEl.videoHeight;
            ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
            const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = window.jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
            if (code && code.data) { stop(); onText(code.data); return; }
          }
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      })
      .catch((e) => onText(null, e));
    return { stop };
  }

  return { makeOffer, acceptAnswer, makeAnswer, showQR, startScanner, pack, unpack };
})();
