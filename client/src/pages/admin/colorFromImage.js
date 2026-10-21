/** Sample a photo and return a suggested colour name + hex. */

const NAMED = [
  { name: "White", hex: "#f5f5f5", r: 245, g: 245, b: 245 },
  { name: "Ivory", hex: "#f3efe6", r: 243, g: 239, b: 230 },
  { name: "Black", hex: "#1a1a1a", r: 26, g: 26, b: 26 },
  { name: "Charcoal", hex: "#3a3a3a", r: 58, g: 58, b: 58 },
  { name: "Grey", hex: "#8a8a8a", r: 138, g: 138, b: 138 },
  { name: "Navy", hex: "#1f2a44", r: 31, g: 42, b: 68 },
  { name: "Blue", hex: "#3b6ea5", r: 59, g: 110, b: 165 },
  { name: "Sky", hex: "#8eafc6", r: 142, g: 175, b: 198 },
  { name: "Teal", hex: "#2f6f6a", r: 47, g: 111, b: 106 },
  { name: "Green", hex: "#3f6b4a", r: 63, g: 107, b: 74 },
  { name: "Olive", hex: "#6b6b3a", r: 107, g: 107, b: 58 },
  { name: "Yellow", hex: "#d6b84e", r: 214, g: 184, b: 78 },
  { name: "Orange", hex: "#d6672a", r: 214, g: 103, b: 42 },
  { name: "Red", hex: "#b33a3a", r: 179, g: 58, b: 58 },
  { name: "Burgundy", hex: "#6b2430", r: 107, g: 36, b: 48 },
  { name: "Pink", hex: "#d9a0b0", r: 217, g: 160, b: 176 },
  { name: "Purple", hex: "#6a4c8a", r: 106, g: 76, b: 138 },
  { name: "Brown", hex: "#6b4a2f", r: 107, g: 74, b: 47 },
  { name: "Tan", hex: "#c2a07a", r: 194, g: 160, b: 122 },
  { name: "Beige", hex: "#d8cdb8", r: 216, g: 205, b: 184 },
];

function dist(a, b) {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return dr * dr + dg * dg + db * db;
}

function toHex(r, g, b) {
  return `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}

function nearestName(r, g, b) {
  let best = NAMED[0];
  let bestD = Infinity;
  for (const entry of NAMED) {
    const d = dist({ r, g, b }, entry);
    if (d < bestD) {
      bestD = d;
      best = entry;
    }
  }
  return best.name;
}

export async function colourFromImage(dataUrl) {
  if (!dataUrl) return null;
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  const size = 48;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(image, 0, 0, size, size);
  const { data } = ctx.getImageData(0, 0, size, size);

  // Ignore near-white / near-black edges (background) when possible.
  const buckets = new Map();
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];
    if (a < 200) continue;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (max > 245 && min > 230) continue; // white-ish
    if (max < 18) continue; // pure black noise
    const key = `${r >> 4},${g >> 4},${b >> 4}`;
    const prev = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0 };
    prev.n += 1;
    prev.r += r;
    prev.g += g;
    prev.b += b;
    buckets.set(key, prev);
  }

  let pick = null;
  for (const entry of buckets.values()) {
    if (!pick || entry.n > pick.n) pick = entry;
  }
  if (!pick) {
    // Fallback: centre pixel average
    const cx = Math.floor(size / 2);
    const cy = Math.floor(size / 2);
    const i = (cy * size + cx) * 4;
    pick = { n: 1, r: data[i], g: data[i + 1], b: data[i + 2] };
  }

  const r = Math.round(pick.r / pick.n);
  const g = Math.round(pick.g / pick.n);
  const b = Math.round(pick.b / pick.n);
  return { name: nearestName(r, g, b), hex: toHex(r, g, b) };
}
