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
  if (typeof hex !== "string" || !/^#?[0-9a-f]{6}$/i.test(hex.trim())) {
    throw new TypeError("Colour hex must be a 6-digit hex value, such as #c4a574.");
  }
  const raw = hex.trim().replace(/^#/, "");
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
  if (!a || typeof a !== "object" || !b || typeof b !== "object") {
    throw new TypeError("Both colours must be objects with a hex value.");
  }
  const ha = hexToHsl(a.hex);
  const hb = hexToHsl(b.hex);
  const neutral = (item) =>
    item.s < 22 || (item.l >= 90 && item.s < 45) || (item.l <= 12 && item.s < 45);
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
  const lightnessGap = Math.abs(ha.l - hb.l);
  const saturationGap = Math.abs(ha.s - hb.s);
  const noticeableToneContrast = lightnessGap >= 30 || saturationGap >= 35;
  if (diff < 28) {
    return {
      verdict: noticeableToneContrast ? "Tonal contrast" : "Tonal",
      note: noticeableToneContrast
        ? "These colours share a close hue but differ in brightness or intensity. Let the stronger tone lead and use the other as support."
        : "These colours sit close together. Use them in different textures so the look does not flatten.",
    };
  }
  if (diff < 55) {
    return {
      verdict: noticeableToneContrast ? "Adjacent contrast" : "Adjacent",
      note: noticeableToneContrast
        ? "These neighbouring hues differ in brightness or intensity. Keep the more vivid or lighter tone as the accent."
        : "A close pairing. It feels considered when the rest of the outfit stays quieter than these two.",
    };
  }
  if (diff >= 150) {
    return {
      verdict: "Complementary",
      note: noticeableToneContrast
        ? "These oppose each other on the wheel and differ in brightness or intensity. Let the stronger tone lead and keep the second to a smaller piece."
        : "These oppose each other on the wheel. Let one lead and keep the second to a smaller piece.",
    };
  }
  return {
    verdict: "High contrast",
    note: noticeableToneContrast
      ? "The hue gap and difference in brightness or intensity can compete. Wear one as the accent and hold the rest of the look to ink, ivory, or stone."
      : "The gap is wide enough to compete. Wear one as the accent and hold the rest of the look to ink, ivory, or stone.",
  };
}
