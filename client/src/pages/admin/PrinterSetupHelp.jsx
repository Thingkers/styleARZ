/** Print-window checklist plus one-time Xprinter XP-365B setup for labels or receipts. */
export default function PrinterSetupHelp({ preset, kind = "label" }) {
  if (!preset || preset.kind !== "thermal") return null;
  const isReceipt = kind === "invoice";
  const stockH = isReceipt ? preset.h || 200 : preset.h;
  const size = isReceipt ? `${preset.w} mm roll` : `${preset.w}×${preset.h} mm`;
  const stockName = isReceipt ? `${preset.w}x${stockH} receipt` : `${preset.w}x${preset.h}`;
  const orientation = preset.orientation === "landscape" ? "Landscape" : "Portrait";
  const media = preset.media === "continuous" || isReceipt ? "Continuous" : "Labels with gaps";

  return (
    <div className="printer-help">
      <p className="printer-help-short">
        In the print window: <strong>Paper size {isReceipt ? stockName : size}</strong> · <strong>Margins None</strong> ·{" "}
        <strong>Scale Default (100)</strong> · <strong>Headers and footers off</strong>.{" "}
        {isReceipt
          ? "The receipt prints as one page. Raise Top gap if the first line is cut off."
          : "One label prints per page. The shop barcode stock is sent with the print."}
      </p>
      <p className="printer-help-short muted">
        Preview shows a big white page with the {isReceipt ? "receipt" : "label"} small in the middle, plus a date and web
        address? The wrong printer or paper is selected — set <strong>Destination</strong> to the Xprinter (use{" "}
        <em>See more</em> if it is not listed) and pick the {size} paper size.
      </p>
      <details className="printer-help-details">
        <summary>Xprinter XP-365B setup (do once per computer)</summary>
        <ol>
          <li>
            Windows: <em>Settings → Printers</em> → Xprinter XP-365B → <em>Printing preferences</em> →{" "}
            <em>Page Setup</em> → Stock <em>New…</em> → name <strong>{stockName}</strong>, width{" "}
            <strong>{preset.w} mm</strong>, height <strong>{stockH} mm</strong>, orientation <strong>{orientation}</strong>.
            Set media type to <strong>{media}</strong>. Tab names differ a little between
            driver versions.
          </li>
          <li>
            Mac: in the print window choose <em>Print using system dialog</em> → Paper Size →{" "}
            <em>Manage Custom Sizes…</em> → add {stockName} with all margins 0.
          </li>
          <li>
            {isReceipt
              ? "Load the receipt roll and switch the printer to continuous (receipt) paper if the driver or printer asks."
              : "Load the label roll and calibrate the gap sensor: hold the FEED button until the light flashes, then release. The printer feeds a few labels and learns where each label starts. If labels print across the gap, repeat this."}
          </li>
          <li>
            In Chrome’s print window pick <strong>Destination: Xprinter XP-365B</strong>, open{" "}
            <em>More settings</em>, and set Paper size, Margins None, Scale Default, untick Headers and footers, tick
            Background graphics. Chrome remembers these for next time.
          </li>
          <li>
            Using the same printer for labels and receipts? Add it twice in Windows (for example “XP-365B Labels” and
            “XP-365B Receipts”), each with its own default paper, and pick the right one when printing.
          </li>
        </ol>
      </details>
    </div>
  );
}
