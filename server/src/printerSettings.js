const DEFAULT_PRINTER = {
  label: {
    name: "38x25",
    w: 38,
    h: 25,
    orientation: "portrait",
    media: "gaps",
    topGap: 2.5,
  },
  invoice: {
    // 56 mm POS thermal paper, roll 153.08.761.224 (40 mm outside diameter, not a page size).
    name: "56mm POS roll 153.08.761.224",
    w: 56,
    h: 200,
    orientation: "portrait",
    media: "continuous",
    topGap: 3,
  },
};

function clamp(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function normalizeJob(input, fallback) {
  const source = input && typeof input === "object" ? input : {};
  const name = String(source.name || fallback.name).trim().slice(0, 40);
  return {
    name: name || fallback.name,
    w: clamp(source.w, 20, 200, fallback.w),
    h: clamp(source.h, 15, 400, fallback.h),
    orientation: source.orientation === "landscape" ? "landscape" : "portrait",
    media: source.media === "continuous" ? "continuous" : source.media === "gaps" ? "gaps" : fallback.media,
    topGap: clamp(source.topGap, 0, 8, fallback.topGap),
  };
}

function normalizePrinter(input) {
  const source = input && typeof input === "object" ? input : {};
  return {
    label: normalizeJob(source.label, DEFAULT_PRINTER.label),
    invoice: normalizeJob(source.invoice, DEFAULT_PRINTER.invoice),
  };
}

module.exports = { DEFAULT_PRINTER, normalizePrinter };
