/**
 * Local inventory photo polish — Canvas only, no third-party APIs.
 * Levels + mild white-balance, light deskew, plain-background cleanup when corners look light.
 */

export const MAX_EDGE = 1600;
export const MAX_BYTES = 1.9 * 1024 * 1024;

const WORK_EDGE = 900;
const FRAME_RATIO = 4 / 5; // width / height → portrait product frame
const PAD_RATIO = 0.08;

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function toJpeg(canvas) {
  for (const quality of [0.86, 0.74, 0.6, 0.45]) {
    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    if (dataUrl.length * 0.75 <= MAX_BYTES) return dataUrl;
  }
  throw new Error("That photo is too large. Try a smaller image.");
}

function createCanvas(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingQuality = "high";
  return { canvas, ctx };
}

function drawCoverWhite(source, width, height) {
  const { canvas, ctx } = createCanvas(width, height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(source, 0, 0, width, height);
  return { canvas, ctx };
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Couldn't read that image."));
    image.src = src;
  });
}

function resizeToWork(image) {
  const scale = Math.min(1, WORK_EDGE / Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height));
  const width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale));
  const height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale));
  return drawCoverWhite(image, width, height);
}

function luminance(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Auto levels + mild white-balance from mid-tone histogram. */
function applyLevelsAndWb(ctx, width, height) {
  const imageData = ctx.getImageData(0, 0, width, height);
  const { data } = imageData;
  const hist = new Uint32Array(256);
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let count = 0;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const y = luminance(r, g, b);
    hist[y | 0]++;
    if (y > 18 && y < 240) {
      sumR += r;
      sumG += g;
      sumB += b;
      count++;
    }
  }

  const total = width * height;
  let low = 0;
  let high = 255;
  let seen = 0;
  const loCut = total * 0.01;
  const hiCut = total * 0.99;
  for (let i = 0; i < 256; i++) {
    seen += hist[i];
    if (seen >= loCut && low === 0) low = i;
    if (seen >= hiCut) {
      high = i;
      break;
    }
  }
  if (high <= low + 8) {
    low = 0;
    high = 255;
  }
  const range = high - low || 1;

  const avgR = count ? sumR / count : 128;
  const avgG = count ? sumG / count : 128;
  const avgB = count ? sumB / count : 128;
  const gray = (avgR + avgG + avgB) / 3 || 1;
  // Mild WB — don't overshoot coloured garments
  const gainR = clamp(gray / avgR, 0.92, 1.08);
  const gainG = clamp(gray / avgG, 0.92, 1.08);
  const gainB = clamp(gray / avgB, 0.92, 1.08);

  for (let i = 0; i < data.length; i += 4) {
    let r = ((data[i] - low) / range) * 255;
    let g = ((data[i + 1] - low) / range) * 255;
    let b = ((data[i + 2] - low) / range) * 255;
    r = clamp(r * gainR, 0, 255);
    g = clamp(g * gainG, 0, 255);
    b = clamp(b * gainB, 0, 255);
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }
  ctx.putImageData(imageData, 0, 0);
}

function cornerStats(data, width, height, size) {
  const patches = [
    [0, 0],
    [width - size, 0],
    [0, height - size],
    [width - size, height - size],
  ];
  const samples = [];
  for (const [ox, oy] of patches) {
    let r = 0;
    let g = 0;
    let b = 0;
    let n = 0;
    for (let y = oy; y < oy + size; y++) {
      for (let x = ox; x < ox + size; x++) {
        const i = (y * width + x) * 4;
        r += data[i];
        g += data[i + 1];
        b += data[i + 2];
        n++;
      }
    }
    samples.push({ r: r / n, g: g / n, b: b / n, y: luminance(r / n, g / n, b / n) });
  }
  return samples;
}

function isPlainLightBackground(samples) {
  const light = samples.filter((s) => s.y >= 175);
  if (light.length < 3) return false;
  let maxDist = 0;
  for (let i = 0; i < samples.length; i++) {
    for (let j = i + 1; j < samples.length; j++) {
      const dr = samples[i].r - samples[j].r;
      const dg = samples[i].g - samples[j].g;
      const db = samples[i].b - samples[j].b;
      maxDist = Math.max(maxDist, Math.sqrt(dr * dr + dg * dg + db * db));
    }
  }
  return maxDist < 45;
}

function colourClose(r, g, b, seed, tol) {
  const dr = r - seed.r;
  const dg = g - seed.g;
  const db = b - seed.b;
  return dr * dr + dg * dg + db * db <= tol * tol;
}

/** Flood-fill near-white corners → alpha 0. Returns whether fill ran. */
function floodClearBackground(ctx, width, height) {
  const imageData = ctx.getImageData(0, 0, width, height);
  const { data } = imageData;
  const patch = Math.max(4, Math.floor(Math.min(width, height) * 0.06));
  const samples = cornerStats(data, width, height, patch);
  if (!isPlainLightBackground(samples)) return false;

  const seed = samples.reduce(
    (acc, s) => ({
      r: acc.r + s.r / samples.length,
      g: acc.g + s.g / samples.length,
      b: acc.b + s.b / samples.length,
    }),
    { r: 0, g: 0, b: 0 }
  );
  const tol = 38;
  const visited = new Uint8Array(width * height);
  const stack = [];

  function tryPush(x, y) {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const idx = y * width + x;
    if (visited[idx]) return;
    const i = idx * 4;
    if (!colourClose(data[i], data[i + 1], data[i + 2], seed, tol)) return;
    // Don't eat mid-tone garment interiors from edges only — seed from borders
    visited[idx] = 1;
    stack.push(idx);
  }

  for (let x = 0; x < width; x++) {
    tryPush(x, 0);
    tryPush(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    tryPush(0, y);
    tryPush(width - 1, y);
  }

  while (stack.length) {
    const idx = stack.pop();
    const i = idx * 4;
    data[i + 3] = 0;
    const x = idx % width;
    const y = (idx / width) | 0;
    tryPush(x + 1, y);
    tryPush(x - 1, y);
    tryPush(x, y + 1);
    tryPush(x, y - 1);
  }

  ctx.putImageData(imageData, 0, 0);
  return true;
}

function contentBounds(ctx, width, height) {
  const { data } = ctx.getImageData(0, 0, width, height);
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = data[(y * width + x) * 4 + 3];
      if (a < 16) continue;
      const r = data[(y * width + x) * 4];
      const g = data[(y * width + x) * 4 + 1];
      const b = data[(y * width + x) * 4 + 2];
      // Treat near-white opaque as background leftover
      if (luminance(r, g, b) > 248 && Math.abs(r - g) < 8 && Math.abs(g - b) < 8) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < minX || maxY < minY) {
    return { minX: 0, minY: 0, maxX: width - 1, maxY: height - 1 };
  }
  return { minX, minY, maxX, maxY };
}

function frameOnWhite(sourceCanvas, cleared) {
  const width = sourceCanvas.width;
  const height = sourceCanvas.height;
  const srcCtx = sourceCanvas.getContext("2d");
  const bounds = cleared
    ? contentBounds(srcCtx, width, height)
    : { minX: 0, minY: 0, maxX: width - 1, maxY: height - 1 };

  const contentW = bounds.maxX - bounds.minX + 1;
  const contentH = bounds.maxY - bounds.minY + 1;
  const pad = Math.round(Math.max(contentW, contentH) * PAD_RATIO);
  const boxW = contentW + pad * 2;
  const boxH = contentH + pad * 2;

  // Target portrait 4:5 frame containing the content box
  let frameH = Math.max(boxH, Math.round(boxW / FRAME_RATIO));
  let frameW = Math.round(frameH * FRAME_RATIO);
  if (frameW < boxW) {
    frameW = boxW;
    frameH = Math.round(frameW / FRAME_RATIO);
  }

  const outScale = Math.min(1, MAX_EDGE / Math.max(frameW, frameH));
  const outW = Math.max(1, Math.round(frameW * outScale));
  const outH = Math.max(1, Math.round(frameH * outScale));
  const { canvas, ctx } = createCanvas(outW, outH);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, outW, outH);

  const scale = outScale;
  const dx = Math.round((outW - contentW * scale) / 2);
  const dy = Math.round((outH - contentH * scale) / 2);
  ctx.drawImage(
    sourceCanvas,
    bounds.minX,
    bounds.minY,
    contentW,
    contentH,
    dx,
    dy,
    Math.round(contentW * scale),
    Math.round(contentH * scale)
  );
  return canvas;
}

/**
 * Enhance a photo data URL or blob URL. Falls through caller responsibility on throw.
 * @param {string} src
 * @returns {Promise<string>} JPEG data URL
 */
export async function enhancePhoto(src) {
  const image = await loadImage(src);
  let { canvas, ctx } = resizeToWork(image);

  applyLevelsAndWb(ctx, canvas.width, canvas.height);

  // Alpha layer for plain-background flood fill (orientation is never changed).
  {
    const { canvas: alphaCanvas, ctx: alphaCtx } = createCanvas(canvas.width, canvas.height);
    alphaCtx.clearRect(0, 0, alphaCanvas.width, alphaCanvas.height);
    alphaCtx.drawImage(canvas, 0, 0);
    canvas = alphaCanvas;
    ctx = alphaCtx;
  }

  const cleared = floodClearBackground(ctx, canvas.width, canvas.height);
  const framed = frameOnWhite(canvas, cleared);
  return toJpeg(framed);
}

/** Returns both the compressed original and the beautified version. */
export async function preparePhotoPair(src) {
  const original = await compressPhoto(src);
  let enhanced = original;
  try {
    enhanced = await enhancePhoto(original);
  } catch {
    /* keep original */
  }
  return { original, enhanced };
}

/** Resize-only JPEG (legacy path / enhance fallback). */
export async function compressPhoto(src) {
  const image = await loadImage(src);
  const scale = Math.min(1, MAX_EDGE / Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height));
  const width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale));
  const height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale));
  const { canvas } = drawCoverWhite(image, width, height);
  return toJpeg(canvas);
}

export async function enhancePhotoSafe(src) {
  try {
    return await enhancePhoto(src);
  } catch {
    return compressPhoto(src);
  }
}

export function isUploadsInventoryImage(url) {
  const path = String(url || "").split("?")[0];
  return path.includes("/uploads/inventory/");
}

export async function urlToDataUrl(url) {
  const response = await fetch(url, { credentials: "same-origin" });
  if (!response.ok) throw new Error(`Could not load photo (${response.status}).`);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read photo."));
    reader.readAsDataURL(blob);
  });
}
