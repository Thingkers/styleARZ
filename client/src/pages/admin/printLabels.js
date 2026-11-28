/**
 * Shared paper/label size presets and isolated iframe printing for
 * both /admin/barcodes and /admin/labels (Quick Labels).
 * Guarantees only the selected labels print (never the admin dashboard/sidebar)
 * and applies exact @page dimensions for thermal rolls or A4 sheets.
 */

export const LABEL_PAPER_PRESETS = [
  { id: "t-38x25", label: "Thermal 38×25 mm (DT barcode roll)", kind: "thermal", w: 38, h: 25, shape: "wide" },
  { id: "a4-65", label: "A4 · 65-up (38.1×21.2 mm)", kind: "a4", cols: 5, rows: 13, w: 38.1, h: 21.2 },
  { id: "a4-40", label: "A4 · 40-up (50×28 mm)", kind: "a4", cols: 4, rows: 10, w: 50, h: 28 },
  { id: "a4-24", label: "A4 · 24-up (70×36 mm)", kind: "a4", cols: 3, rows: 8, w: 70, h: 36 },
  { id: "t-40x30", label: "Thermal 40×30 mm", kind: "thermal", w: 40, h: 30, shape: "wide" },
  { id: "t-50x30", label: "Thermal 50×30 mm", kind: "thermal", w: 50, h: 30, shape: "wide" },
  { id: "t-58x40", label: "Thermal 58×40 mm", kind: "thermal", w: 58, h: 40, shape: "wide" },
  { id: "t-40x60", label: "Thermal 40×60 mm (narrow hang tag)", kind: "thermal", w: 40, h: 60, shape: "tall" },
  { id: "t-60x40", label: "Thermal 60×40 mm", kind: "thermal", w: 60, h: 40, shape: "wide" },
  { id: "t-80x50", label: "Thermal 80×50 mm", kind: "thermal", w: 80, h: 50, shape: "wide" },
];

export const DEFAULT_LABEL_PRESET_ID = "t-38x25";

export const CUSTOM_PRESET_ID = "custom";

/** Resolve a preset id, including a user-entered custom roll size (mm). */
export function resolveLabelPreset(id, custom) {
  if (id === CUSTOM_PRESET_ID) {
    const w = Math.min(200, Math.max(20, Number(custom?.w) || 38));
    const h = Math.min(200, Math.max(15, Number(custom?.h) || 25));
    return { id: CUSTOM_PRESET_ID, label: `Custom ${w}×${h} mm`, kind: "thermal", w, h, shape: h > w ? "tall" : "wide" };
  }
  return (
    LABEL_PAPER_PRESETS.find((entry) => entry.id === id) ||
    LABEL_PAPER_PRESETS.find((entry) => entry.id === DEFAULT_LABEL_PRESET_ID)
  );
}

export function presetShape(preset) {
  if (!preset) return "wide";
  return preset.shape || (preset.h > preset.w ? "tall" : "wide");
}

/** Landscape is the wide way on the sticker; portrait turns the text the other way. */
export function labelOrientation(preset, orientation) {
  const natural = Number(preset?.h) > Number(preset?.w) ? "portrait" : "landscape";
  const chosen = orientation === "portrait" ? "portrait" : "landscape";
  const thermal = preset?.kind === "thermal";
  return {
    chosen: thermal ? chosen : natural,
    natural,
    turned: thermal && chosen !== natural,
    shape: chosen === "portrait" ? "tall" : "wide",
  };
}

function openPrintFrame(html) {
  const existing = document.getElementById("sa-label-print-frame");
  if (existing) existing.remove();

  const frame = document.createElement("iframe");
  frame.id = "sa-label-print-frame";
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;left:-9999px;top:0;width:800px;height:600px;border:0;opacity:0;pointer-events:none;";
  document.body.appendChild(frame);

  const doc = frame.contentDocument;
  const win = frame.contentWindow;
  if (!doc || !win) {
    frame.remove();
    return;
  }

  doc.open();
  doc.write(html);
  doc.close();

  const waitForImages = () => {
    const imgs = [...doc.querySelectorAll("img")];
    return Promise.all(
      imgs.map((img) =>
        img.complete
          ? Promise.resolve()
          : new Promise((resolve) => {
              img.addEventListener("load", resolve, { once: true });
              img.addEventListener("error", resolve, { once: true });
            })
      )
    );
  };

  const cleanup = () => {
    window.setTimeout(() => frame.remove(), 500);
  };

  const trigger = () => {
    try {
      win.addEventListener("afterprint", cleanup, { once: true });
      win.focus();
      win.print();
    } finally {
      window.setTimeout(() => {
        if (frame.isConnected) frame.remove();
      }, 60000);
    }
  };

  Promise.all([waitForImages(), doc.fonts?.ready || Promise.resolve()])
    .catch(() => {})
    .finally(() => window.setTimeout(trigger, 60));
}

function escapeTitle(title) {
  return String(title || "Labels").replace(/[<>&"]/g, "");
}

/** Print Quick Labels or Barcodes at the exact selected thermal roll or A4 sheet preset. */
export function printLabelSheet(sheetEl, preset, title = "StyleARZ Labels", orientation = "landscape", topMm = 2.5) {
  if (!sheetEl || !preset) return;
  const isThermal = preset.kind === "thermal";
  const w = Number(preset.w) || 40;
  const h = Number(preset.h) || 60;
  const turned = labelOrientation(preset, orientation).turned;
  const cols = Number(preset.cols) || 3;
  const compact = h <= 30 || w <= 45;
  const top = isThermal ? Math.min(6, Math.max(0, Number(topMm) || 0)) : compact ? 1 : 1.6;
  const side = compact ? 1.5 : 1.8;
  const bottom = compact ? 1.2 : 1.6;
  const pad = `${top}mm ${side}mm ${bottom}mm`;
  const innerH = Math.max(8, h - top - bottom);
  const barcodeMax = isThermal && h > w ? "14mm" : compact ? `${Math.max(4.5, Math.min(7.5, Math.round(innerH * 0.32)))}mm` : "9mm";
  const faceW = Math.max(10, +(h - top - bottom - 0.4).toFixed(2));
  const faceH = Math.max(10, +(w - side * 2 - 0.4).toFixed(2));

  const pageCss = isThermal
    ? `@page { size: ${w}mm ${h}mm; margin: 0; }`
    : `@page { size: A4; margin: 3mm; }`;

  const sheetCss = isThermal
    ? `
      .ql-sheet {
        display: block;
        width: ${w}mm;
        margin: 0;
        padding: 0;
      }
      .ql-label {
        width: ${w}mm !important;
        height: ${h - 0.3}mm !important;
        border: 0 !important;
        page-break-after: always;
        break-after: page;
      }
      .ql-label:last-child {
        page-break-after: auto;
        break-after: auto;
      }
    `
    : `
      .ql-sheet {
        display: grid;
        width: ${cols * w}mm;
        margin: 0 auto;
        padding: 0;
        grid-template-columns: repeat(${cols}, ${w}mm);
        grid-auto-rows: ${h}mm;
        justify-content: center;
        align-content: start;
        gap: 0;
      }
      .ql-label {
        width: ${w}mm !important;
        height: ${h}mm !important;
        border: 0.25mm solid #111 !important;
      }
    `;

  const css = `
    ${pageCss}
    * { box-sizing: border-box; }
    html, body {
      margin: 0 !important;
      padding: 0 !important;
      background: #fff !important;
      color: #000 !important;
      ${isThermal ? `width: ${w}mm !important; height: auto !important; overflow: hidden !important;` : ""}
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    ${sheetCss}
    .ql-label {
      display: grid;
      grid-template-rows: auto auto auto 1fr;
      gap: 0.8mm;
      padding: ${pad};
      background: #fff;
      color: #000;
      overflow: hidden;
      min-width: 0;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .ql-label.is-tall { text-align: center; }
    .ql-label header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 1.5mm;
      min-width: 0;
    }
    .ql-label.is-tall header {
      flex-direction: column;
      align-items: center;
      gap: 0.4mm;
    }
    .ql-label.is-wide header { flex-direction: row; }
    .ql-brand-text {
      min-width: 0;
      font-size: ${compact ? "6.5pt" : "7pt"};
      font-weight: 700;
      letter-spacing: 0.03em;
      line-height: 1;
      color: #000;
      white-space: nowrap;
    }
    .ql-label header strong {
      font-size: ${compact ? "7.5pt" : "9pt"};
      font-weight: 700;
      line-height: 1;
      flex: 0 0 auto;
    }
    .ql-label-face { display: contents; }
    .ql-label.is-turned {
      display: flex !important;
      align-items: center;
      justify-content: center;
      padding: 0 !important;
    }
    .ql-label.is-turned .ql-label-face {
      display: grid;
      grid-template-rows: auto auto auto 1fr;
      flex: 0 0 auto;
      gap: 0.6mm;
      width: ${faceW}mm;
      height: ${faceH}mm;
      max-width: none;
      padding: ${pad};
      transform: rotate(90deg);
      overflow: hidden;
    }
    .ql-label-name {
      margin: 0;
      ${compact ? "display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 1; overflow: hidden;" : ""}
      font-size: ${compact ? "6pt" : "6.5pt"};
      font-weight: 700;
      line-height: 1.2;
      overflow-wrap: anywhere;
      word-break: break-word;
      white-space: normal;
      max-width: 100%;
    }
    .ql-label.is-tall .ql-label-name { font-size: 7pt; }
    .ql-label-size {
      margin: 0;
      font-size: 5.5pt;
      letter-spacing: 0.02em;
      overflow-wrap: anywhere;
      word-break: break-word;
    }
    .ql-label-barcode {
      width: 100%;
      max-height: ${barcodeMax};
      min-height: 0;
      object-fit: contain;
      justify-self: stretch;
      align-self: end;
      display: block;
    }
    .ql-label.ql-test {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 1mm;
      border: 0.4mm solid #000 !important;
      text-align: center;
      font-size: ${compact ? "6pt" : "8pt"};
    }
    .ql-label.ql-test strong { font-size: ${compact ? "9pt" : "12pt"}; }
    @media print {
      html, body, .ql-label {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
    }
  `;

  openPrintFrame(
    `<!doctype html><html><head><meta charset="utf-8"><title>${escapeTitle(title)}</title><style>${css}</style></head><body>${sheetEl.outerHTML}</body></html>`
  );
}

/** One outlined page at the selected size, to check paper size, gap calibration and scale. */
export function printAlignmentTest(preset, orientation = "landscape", topMm = 2.5) {
  if (!preset) return;
  const turned = labelOrientation(preset, orientation).turned;
  const sheet = document.createElement("div");
  sheet.className = "ql-sheet";
  const label = document.createElement("article");
  label.className = `ql-label ql-test${turned ? " is-turned" : ""}`;
  const face = document.createElement("div");
  face.className = "ql-label-face";
  face.innerHTML = `<strong>${preset.w}×${preset.h} mm</strong><span>${turned ? "Portrait" : "Landscape"} — border should sit just inside the label edge</span>`;
  label.appendChild(face);
  sheet.appendChild(label);
  printLabelSheet(sheet, preset, "StyleARZ alignment test", orientation, topMm);
}

export const printQuickLabels = printLabelSheet;
export const printBarcodeSheet = printLabelSheet;
