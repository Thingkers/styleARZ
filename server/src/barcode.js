const PREFIX = "SA";
const BODY_MIN = 7;

// Code 128 bar/space widths for symbol values 0..105 (start A/B/C = 103/104/105), then stop (106).
const CODE128_PATTERNS = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312",
  "132212", "221213", "221312", "231212", "112232", "122132", "122231", "113222",
  "123122", "123221", "223211", "221132", "221231", "213212", "223112", "312131",
  "311222", "321122", "321221", "312212", "322112", "322211", "212123", "212321",
  "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121",
  "313121", "211331", "231131", "213113", "213311", "213131", "311123", "311321",
  "331121", "312113", "312311", "332111", "314111", "221411", "431111", "111224",
  "111422", "121124", "121421", "141122", "141221", "112214", "112412", "122114",
  "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112",
  "421211", "212141", "214121", "412121", "111143", "111341", "131141", "114113",
  "114311", "411113", "411311", "113141", "114131", "311141", "411131", "211412",
  "211214", "211232",
];
const CODE128_STOP = "2331112";
const START_B = 104;

function checkDigit(body) {
  const digits = String(body).replace(/\D/g, "");
  let sum = 0;
  for (let i = 0; i < digits.length; i += 1) {
    const fromRight = digits.length - 1 - i;
    sum += Number(digits[i]) * (fromRight % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10;
}

function makeBarcode(seq) {
  const body = String(Math.max(0, Math.floor(Number(seq) || 0))).padStart(BODY_MIN, "0");
  return `${PREFIX}${body}${checkDigit(body)}`;
}

function isValidStyleBarcode(code) {
  const match = /^SA(\d{4,})$/.exec(String(code || ""));
  if (!match) return false;
  const digits = match[1];
  const body = digits.slice(0, -1);
  return checkDigit(body) === Number(digits.slice(-1));
}

function isTaken(db, code) {
  const upper = code.toUpperCase();
  return (db.inventoryItems || []).some((item) => String(item.barcode || "").toUpperCase() === upper);
}

// Allocates the next unique SA barcode and advances db.inventorySeq.
function allocateBarcode(db) {
  if (!Number.isFinite(db.inventorySeq)) db.inventorySeq = 1000;
  let code;
  do {
    db.inventorySeq += 1;
    code = makeBarcode(db.inventorySeq);
  } while (isTaken(db, code));
  return code;
}

function escapeXml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[ch]);
}

function code128Symbols(text) {
  const value = String(text);
  if (!value.length) throw new Error("Nothing to encode.");
  const symbols = [START_B];
  for (const ch of value) {
    const code = ch.charCodeAt(0);
    if (code < 32 || code > 126) throw new Error("Barcode contains characters Code 128 cannot print.");
    symbols.push(code - 32);
  }
  let sum = START_B;
  for (let i = 1; i < symbols.length; i += 1) sum += symbols[i] * i;
  symbols.push(sum % 103);
  return symbols;
}

// Returns a standalone Code 128 (set B) SVG with human-readable text below the bars.
function code128Svg(text, options = {}) {
  const moduleWidth = Math.min(6, Math.max(1, Number(options.scale) || 2));
  const barHeight = Math.min(300, Math.max(20, Number(options.height) || 70));
  const showText = options.text !== false;
  const quiet = 10 * moduleWidth;
  const symbols = code128Symbols(text);
  const widths = [];
  symbols.forEach((symbol) => {
    CODE128_PATTERNS[symbol].split("").forEach((w) => widths.push(Number(w)));
  });
  CODE128_STOP.split("").forEach((w) => widths.push(Number(w)));

  const totalModules = widths.reduce((sum, w) => sum + w, 0);
  const width = totalModules * moduleWidth + quiet * 2;
  const textHeight = showText ? 18 : 0;
  const height = barHeight + textHeight + 8;

  let x = quiet;
  const bars = [];
  widths.forEach((w, index) => {
    const span = w * moduleWidth;
    if (index % 2 === 0) bars.push(`<rect x="${x}" y="4" width="${span}" height="${barHeight}"/>`);
    x += span;
  });

  const label = showText
    ? `<text x="${width / 2}" y="${barHeight + 18}" text-anchor="middle" font-family="Menlo, Consolas, monospace" font-size="13" fill="#000">${escapeXml(text)}</text>`
    : "";

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Barcode ${escapeXml(text)}">` +
    `<rect width="100%" height="100%" fill="#fff"/><g fill="#000">${bars.join("")}</g>${label}</svg>`
  );
}

module.exports = {
  PREFIX,
  checkDigit,
  makeBarcode,
  isValidStyleBarcode,
  allocateBarcode,
  code128Svg,
  code128Symbols,
  CODE128_PATTERNS,
};
