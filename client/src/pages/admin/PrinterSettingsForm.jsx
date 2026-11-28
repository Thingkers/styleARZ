import { useEffect, useState } from "react";
import { DEFAULT_PRINTER, loadPrinterSettings, savePrinterSettings } from "./printerSettings";

function JobFields({ title, text, job, onChange }) {
  function set(field, value) {
    onChange({ ...job, [field]: value });
  }

  return (
    <fieldset className="printer-job">
      <legend>{title}</legend>
      <p className="muted">{text}</p>
      <div className="printer-job-grid">
        <label>
          Stock name
          <input value={job.name} maxLength={40} onChange={(event) => set("name", event.target.value)} />
        </label>
        <label>
          Width (mm)
          <input type="number" min="20" max="200" step="1" value={job.w} onChange={(event) => set("w", event.target.value)} />
        </label>
        <label>
          Height (mm)
          <input type="number" min="15" max="400" step="1" value={job.h} onChange={(event) => set("h", event.target.value)} />
        </label>
        <label>
          Orientation
          <select value={job.orientation} onChange={(event) => set("orientation", event.target.value)}>
            <option value="portrait">Portrait</option>
            <option value="landscape">Landscape</option>
          </select>
        </label>
        <label>
          Media type
          <select value={job.media} onChange={(event) => set("media", event.target.value)}>
            <option value="gaps">Labels with gaps</option>
            <option value="continuous">Continuous</option>
          </select>
        </label>
        <label>
          Top gap (mm)
          <input
            type="number"
            min="0"
            max="8"
            step="0.5"
            value={job.topGap}
            onChange={(event) => set("topGap", event.target.value)}
          />
        </label>
      </div>
    </fieldset>
  );
}

/** Shop-wide Xprinter sizes. Barcode and invoice rolls are stored separately. */
export default function PrinterSettingsForm({ onSaved }) {
  const [printer, setPrinter] = useState(DEFAULT_PRINTER);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    loadPrinterSettings()
      .then((next) => setPrinter(next))
      .catch((err) => setError(err.message || "Could not load printer settings."))
      .finally(() => setLoading(false));
  }, []);

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const saved = await savePrinterSettings(printer);
      setPrinter(saved);
      setNotice("Printer settings saved. Barcode labels and invoices will use these rolls.");
      onSaved?.(saved);
    } catch (err) {
      setError(err.message || "Could not save printer settings.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="muted">Loading printer settings…</p>;

  return (
    <form className="admin-settings-card" onSubmit={save}>
      <h2>Xprinter XP-365B</h2>
      <p className="muted">
        These are the same options as the printer’s Page Setup. Barcode labels and invoices keep their own roll, because
        the receipt roll can be a different width. The site sends this size when you print. On each computer, create a
        matching stock once under the Xprinter preferences (the browser cannot change Windows printer settings itself).
      </p>
      <JobFields
        title="Barcode / label roll"
        text="The stock that already prints labels correctly. Default is 38×25 mm, Portrait, labels with gaps."
        job={printer.label}
        onChange={(label) => setPrinter((current) => ({ ...current, label }))}
      />
      <JobFields
        title="Invoice roll"
        text="Use the receipt roll width. Continuous paper has no gaps, so a long invoice stays one piece. Height is the stock height to create in Windows (200 mm is a safe receipt stock); the printed page grows with the invoice."
        job={printer.invoice}
        onChange={(invoice) => setPrinter((current) => ({ ...current, invoice }))}
      />
      {error && <p className="error">{error}</p>}
      {notice && <p className="notice">{notice}</p>}
      <button className="btn solid" type="submit" disabled={busy}>
        {busy ? "Saving…" : "Save printer settings"}
      </button>
    </form>
  );
}
