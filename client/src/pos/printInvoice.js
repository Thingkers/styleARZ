/** Isolated invoice print — avoids blank A4 pages from the admin layout. */

function pageRule(preset, heightMm) {
  // Rolls get zero page margin (padding lives inside the receipt) so Chrome has no room for headers/footers.
  const margin = preset.kind === "thermal" ? "0" : preset.id === "letter" ? "0.4in" : preset.id === "a5" ? "8mm" : "10mm";
  if (preset.kind === "thermal") {
    const h = Math.max(25, Math.min(600, Math.ceil(heightMm || 120)));
    return `@page { size: ${preset.w}mm ${h}mm; margin: ${margin}; }`;
  }
  if (preset.id === "letter") return `@page { size: letter; margin: ${margin}; }`;
  if (preset.id === "a5") return `@page { size: A5; margin: ${margin}; }`;
  return `@page { size: A4; margin: ${margin}; }`;
}

function printWidthMm(preset) {
  if (preset.kind === "thermal") return Math.max(28, preset.w);
  if (preset.id === "a5") return 132;
  if (preset.id === "letter") return 196;
  return 190;
}

function invoicePrintCss(preset, heightMm, topMm) {
  const width = printWidthMm(preset);
  const thermal = preset.kind === "thermal";
  const narrow = thermal && preset.w < 50;
  const top = thermal ? Math.min(8, Math.max(2, Number(topMm) || 3)) : 0;
  return `
    ${pageRule(preset, heightMm)}
    html, body {
      margin: 0 !important;
      padding: 0 !important;
      background: #fff !important;
      color: #111 !important;
      width: ${width}mm !important;
      max-width: ${width}mm !important;
      ${thermal ? "overflow: hidden !important;" : ""}
    }
    * { box-sizing: border-box; }
    .pos-invoice {
      width: ${width}mm !important;
      max-width: ${width}mm !important;
      margin: 0 !important;
      padding: ${thermal ? `${top}mm 3.5mm 3mm` : "4mm"} !important;
      border: 0 !important;
      border-radius: 0 !important;
      box-shadow: none !important;
      background: #fff !important;
      color: #111 !important;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: ${narrow ? "8px" : thermal ? "10px" : "12px"} !important;
      line-height: 1.35;
    }
    .pos-invoice-head {
      display: flex;
      justify-content: space-between;
      gap: 0.5rem;
      flex-wrap: wrap;
      border-bottom: 1px solid #ddd;
      padding-bottom: 0.5rem;
      margin-bottom: 0.5rem;
    }
    .pos-invoice-brand {
      display: block;
      font-size: ${thermal ? "14px" : "18px"};
      letter-spacing: 0.04em;
      color: #ff6600;
      font-weight: 700;
    }
    .pos-invoice-head p { margin: 0.15rem 0 0; color: #555; }
    .pos-invoice-meta p {
      display: flex;
      gap: 0.4rem;
      justify-content: space-between;
      margin: 0.1rem 0;
      font-size: inherit;
    }
    .pos-invoice-meta span { color: #777; min-width: 3.5rem; }
    .pos-invoice-table { width: 100%; border-collapse: collapse; }
    .pos-invoice-table th, .pos-invoice-table td {
      padding: ${thermal ? "0.2rem 0.1rem" : "0.35rem 0.2rem"};
      border-bottom: 1px solid #eee;
      vertical-align: top;
      text-align: left;
      font-size: inherit;
    }
    .pos-invoice-table th:nth-child(2),
    .pos-invoice-table td:nth-child(2),
    .pos-invoice-table th:nth-child(3),
    .pos-invoice-table td:nth-child(3),
    .pos-invoice-table th:nth-child(4),
    .pos-invoice-table td:nth-child(4) {
      text-align: right;
      white-space: nowrap;
    }
    .pos-invoice-table thead { display: table-header-group; }
    .pos-invoice-table tr { break-inside: avoid; page-break-inside: avoid; }
    .pos-invoice-totals, .pos-invoice-grand { break-inside: avoid; page-break-inside: avoid; }
    .pos-invoice-item { display: block; }
    .pos-invoice-item img { display: none !important; }
    .pos-invoice-table small { display: block; color: #777; margin-top: 0.1rem; }
    .pos-invoice-totals { margin-top: 0.55rem; display: grid; gap: 0.15rem; }
    .pos-invoice-totals p { display: flex; justify-content: space-between; margin: 0; }
    .pos-invoice-grand {
      margin-top: 0.25rem !important;
      padding-top: 0.35rem;
      border-top: 1px solid #ddd;
      font-size: 1.05em;
    }
    .pos-invoice-note, .pos-invoice-thanks {
      margin: 0.55rem 0 0;
      color: #555;
      font-size: 0.95em;
    }
    @media print {
      html, body, .pos-invoice {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
    }
  `;
}

function pxToMm(px) {
  return (Number(px) || 0) * 0.264583;
}

/**
 * Print only the invoice article at the selected paper/roll size.
 * @param {HTMLElement} sourceEl
 * @param {{ id: string, kind: string, w?: number, h?: number, label?: string }} preset
 * @param {string} [title]
 */
export function printInvoiceElement(sourceEl, preset, title = "Invoice", topMm = 3) {
  if (!sourceEl || !preset) return;

  const existing = document.getElementById("sa-invoice-print-frame");
  if (existing) existing.remove();

  const frame = document.createElement("iframe");
  frame.id = "sa-invoice-print-frame";
  frame.setAttribute("aria-hidden", "true");
  // Off-screen but real width so scrollHeight measures correctly before print.
  const frameWidthPx = Math.round(((printWidthMm(preset) + 8) * 96) / 25.4);
  frame.style.cssText = `position:fixed;left:-${frameWidthPx + 40}px;top:0;width:${frameWidthPx}px;height:800px;border:0;opacity:0;pointer-events:none;`;
  document.body.appendChild(frame);

  const doc = frame.contentDocument;
  const win = frame.contentWindow;
  if (!doc || !win) {
    frame.remove();
    return;
  }

  const clone = sourceEl.cloneNode(true);
  clone.removeAttribute("id");
  clone.querySelectorAll("img").forEach((img) => img.remove());

  // First pass: measure content height at roll/sheet width
  const measureCss = invoicePrintCss(preset, 200, topMm);
  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${String(title).replace(/[<>&"]/g, "")}</title>
    <style>${measureCss}</style></head><body></body></html>`);
  doc.close();
  doc.body.appendChild(clone);

  const finish = () => {
    try {
      win.focus();
      win.print();
    } finally {
      window.setTimeout(() => frame.remove(), 1000);
    }
  };

  const run = () => {
    const heightMm = Math.ceil(pxToMm(doc.body.scrollHeight) + (preset.kind === "thermal" ? 8 : 12));
    const style = doc.querySelector("style");
    if (style) style.textContent = invoicePrintCss(preset, heightMm, topMm);
    // Allow layout to settle with final @page height
    window.setTimeout(finish, 50);
  };

  if (doc.fonts?.ready) {
    doc.fonts.ready.then(run).catch(run);
  } else {
    window.setTimeout(run, 50);
  }
}
