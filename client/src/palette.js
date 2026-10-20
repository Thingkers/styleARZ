export const PALETTE = [
  { name: "Ink", hex: "#161616" },
  { name: "Charcoal", hex: "#3d3d3d" },
  { name: "Stone", hex: "#cfc6ba" },
  { name: "Ivory", hex: "#f3efe6" },
  { name: "White", hex: "#f7f7f5" },
  { name: "Camel", hex: "#c4a574" },
  { name: "Cognac", hex: "#8a4b2f" },
  { name: "Rust", hex: "#b85c38" },
  { name: "Forest", hex: "#2f4f3e" },
  { name: "Sky", hex: "#8eafc6" },
  { name: "Midnight", hex: "#1c2433" },
  { name: "Sand", hex: "#d9c7a6" },
];

function hexToHsl(hex) {
  const raw = hex.replace("#", "");
  const r = parseInt(raw.slice(0, 2), 16) / 255;
  const g = parseInt(raw.slice(2, 4), 16) / 255;
  const b = parseInt(raw.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case r:
        h = ((g - b) / d) % 6;
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
    }
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: s * 100, l: l * 100 };
}

export function compareColours(a, b) {
  const ha = hexToHsl(a.hex);
  const hb = hexToHsl(b.hex);
  const neutral = (item) => item.s < 18 || item.l > 90 || item.l < 14;
  if (neutral(ha) && neutral(hb)) {
    return {
      verdict: "Harmonious",
      note: "Both tones sit in the neutral range. The outfit will read as one cloth family. Add a single accent only if you want more presence.",
    };
  }
  if (neutral(ha) || neutral(hb)) {
    return {
      verdict: "Harmonious",
      note: "A neutral ground lets the other colour speak. Keep the stronger tone to one piece — a scarf, a shoe, or a knit.",
    };
  }
  let diff = Math.abs(ha.h - hb.h);
  if (diff > 180) diff = 360 - diff;
  if (diff < 28) {
    return {
      verdict: "Tonal",
      note: "These colours sit close together. Use them in different textures so the look does not flatten.",
    };
  }
  if (diff < 55) {
    return {
      verdict: "Adjacent",
      note: "A close pairing. It feels considered when the rest of the outfit stays quieter than these two.",
    };
  }
  if (diff >= 150) {
    return {
      verdict: "Complementary",
      note: "These oppose each other on the wheel. Let one lead and keep the second to a smaller piece.",
    };
  }
  return {
    verdict: "High contrast",
    note: "The gap is wide enough to compete. Wear one as the accent and hold the rest of the look to ink, ivory, or stone.",
  };
}
