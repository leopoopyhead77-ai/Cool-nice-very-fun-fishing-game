// ---------------------------------------------------------------------------
// Reading the QR code.
//
// Two paths, because on a phone you often cannot point the camera at the
// screen showing the code: a live camera scan, and decoding a saved
// screenshot. Both end at the same jsQR call over raw pixels.
// ---------------------------------------------------------------------------

import jsQR from "jsqr";

/** Runs the decoder over one frame. Returns the payload string or null. */
export function decodeImageData(imageData) {
  const found = jsQR(imageData.data, imageData.width, imageData.height, {
    inversionAttempts: "attemptBoth", // light-on-dark codes show up in dark mode
  });
  return found && found.data ? found.data : null;
}

function drawToCanvas(source, width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, width, height);
  return ctx.getImageData(0, 0, width, height);
}

/** Decodes a QR out of an image file (a screenshot of the setup page). */
export function decodeImageFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      // Big screenshots are downscaled first; past ~1600px the decode costs
      // far more than it gains, but very small ones must not be blown up.
      const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      try {
        let data = decodeImageData(drawToCanvas(img, w, h));
        // A code photographed inside a larger page can survive at full size
        // when the downscale blurs its modules together.
        if (!data && scale < 1) data = decodeImageData(drawToCanvas(img, img.width, img.height));
        data ? resolve(data) : reject(new Error("No QR code found in that image."));
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That file could not be opened as an image."));
    };
    img.src = url;
  });
}

/** Why the camera is unavailable, or null when it should work. */
export function cameraProblem() {
  if (typeof navigator === "undefined" || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    return window.isSecureContext === false
      ? "The camera needs a secure page (https). Use an image or type the key instead."
      : "This browser will not give the page a camera. Use an image or type the key instead.";
  }
  return null;
}

/**
 * Starts a scan into a <video> element and polls frames until a QR turns up.
 * Returns a handle with stop(); call it on unmount or the camera stays lit.
 */
export function startScanner(video, { onResult, onError }) {
  let stream = null;
  let raf = 0;
  let stopped = false;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  const stop = () => {
    stopped = true;
    if (raf) cancelAnimationFrame(raf);
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
  };

  const tick = () => {
    if (stopped) return;
    if (video.readyState === video.HAVE_ENOUGH_DATA && video.videoWidth) {
      // Scan a downscaled frame: 480px on the long edge decodes a phone-held
      // code reliably and leaves the preview smooth on cheap hardware.
      const scale = Math.min(1, 480 / Math.max(video.videoWidth, video.videoHeight));
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      try {
        const data = decodeImageData(ctx.getImageData(0, 0, canvas.width, canvas.height));
        if (data) {
          stop();
          onResult(data);
          return;
        }
      } catch { /* a frame that cannot be read is not worth reporting */ }
    }
    raf = requestAnimationFrame(tick);
  };

  const problem = cameraProblem();
  if (problem) {
    onError(new Error(problem));
    return { stop };
  }

  navigator.mediaDevices
    .getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false })
    .then((s) => {
      if (stopped) {
        s.getTracks().forEach((t) => t.stop());
        return;
      }
      stream = s;
      video.srcObject = s;
      video.setAttribute("playsinline", "true");
      video.muted = true;
      return video.play().then(() => { raf = requestAnimationFrame(tick); });
    })
    .catch((err) => {
      const denied = err && (err.name === "NotAllowedError" || err.name === "SecurityError");
      onError(new Error(denied
        ? "Camera access was refused. Allow it in the app's permissions, or add the account another way."
        : "The camera could not be started: " + (err && err.message ? err.message : String(err))));
    });

  return { stop };
}
