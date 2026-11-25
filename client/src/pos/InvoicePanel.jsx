import { useEffect, useState } from "react";
import { api } from "../api";
import { money, prettyDateTime } from "../format";
import { printInvoiceElement } from "./printInvoice";

const INVOICE_PRESETS = [
  { id: "a4", label: "A4 (210×297 mm)", kind: "sheet", w: 210, h: 297 },
  { id: "a5", label: "A5 (148×210 mm)", kind: "sheet", w: 148, h: 210 },
  { id: "letter", label: "Letter (8.5×11 in)", kind: "sheet", w: 215.9, h: 279.4 },
  { id: "t-58", label: "Thermal 58 mm roll", kind: "thermal", w: 58 },
  { id: "t-80", label: "Thermal 80 mm roll", kind: "thermal", w: 80 },
];

function unitCount(sale) {
  return (sale?.items || []).reduce((sum, line) => sum + Number(line.qty || 0), 0);
}

function thumbSrc(line) {
  return line?.image || "/images/studio-table.jpg";
}

export default function InvoicePanel({
  sale,
  onClose,
  autoFocusPhone = false,
  compact = false,
  asModal = false,
}) {
  const [phone, setPhone] = useState(sale?.customerPhone || "");
  const [smsBusy, setSmsBusy] = useState(false);
  const [smsError, setSmsError] = useState("");
  const [smsNotice, setSmsNotice] = useState("");
  const [presetId, setPresetId] = useState(() => localStorage.getItem("sa-invoice-preset") || "a4");
  const [senderPhone, setSenderPhone] = useState("");

  const preset = INVOICE_PRESETS.find((entry) => entry.id === presetId) || INVOICE_PRESETS[0];

  useEffect(() => {
    setPhone(sale?.customerPhone || "");
    setSmsError("");
    setSmsNotice("");
  }, [sale?.id, sale?.customerPhone]);

  useEffect(() => {
    api("/api/admin/settings")
      .then((data) => setSenderPhone(data.settings?.smsSenderPhone || ""))
      .catch(() => setSenderPhone(""));
  }, []);

  useEffect(() => {
    localStorage.setItem("sa-invoice-preset", preset.id);
  }, [preset.id]);

  if (!sale) return null;

  function printInvoice() {
    const source = document.getElementById("pos-invoice-print");
    if (!source) return;
    printInvoiceElement(source, preset, sale.receiptNo || sale.id || "Invoice");
  }

  const canSms = Boolean(sale.id) && !String(sale.id).startsWith("offline_");

  async function sendSms(event) {
    event?.preventDefault?.();
    if (!canSms) {
      setSmsError("SMS is available after this sale syncs to the server.");
      return;
    }
    setSmsBusy(true);
    setSmsError("");
    setSmsNotice("");
    try {
      const result = await api(`/api/pos/sales/${encodeURIComponent(sale.id)}/sms`, {
        method: "POST",
        body: { phone },
      });
      setPhone(result.phone || phone);
      setSmsNotice(
        result.provider === "log"
          ? `SMS logged for ${result.phone} (set SMS_PROVIDER for live delivery).`
          : `SMS sent to ${result.phone}.`
      );
    } catch (err) {
      setSmsError(err.message || "Could not send SMS.");
    } finally {
      setSmsBusy(false);
    }
  }

  const panel = (
    <section
      className={`pos-invoice-panel${compact ? " is-compact" : ""}${asModal ? " is-modal-panel" : ""}`}
      data-invoice-id={sale.id}
      data-preset={preset.id}
      data-kind={preset.kind}
    >
      <div className="pos-invoice-toolbar no-print">
        <div>
          <p className="kicker light">Invoice</p>
          <h2>{sale.receiptNo || sale.id}</h2>
        </div>
        <div className="pos-invoice-actions">
          <label className="pos-invoice-preset">
            Paper size
            <select value={preset.id} onChange={(event) => setPresetId(event.target.value)}>
              {INVOICE_PRESETS.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label}
                </option>
              ))}
            </select>
          </label>
          <button className="btn solid pos-tap" type="button" onClick={printInvoice}>
            Print invoice
          </button>
          {onClose && (
            <button className="btn line light pos-tap" type="button" onClick={onClose}>
              Close
            </button>
          )}
        </div>
      </div>

      <div className="pos-invoice-stage no-print" aria-hidden="true">
        <p className="muted">
          Preview · {preset.label}
          {preset.kind === "thermal"
            ? " · receipt roll — print opens a roll-sized page (set Margins to None, uncheck headers)"
            : " · sheet"}
        </p>
      </div>

      <article
        className={`pos-invoice preset-${preset.id} kind-${preset.kind}`}
        id="pos-invoice-print"
        style={{
          "--invoice-w": preset.w ? `${preset.w}mm` : "auto",
          "--invoice-h": preset.h ? `${preset.h}mm` : "auto",
        }}
      >
        <header className="pos-invoice-head">
          <div>
            <strong className="pos-invoice-brand">STYLEARZ</strong>
            <p>Point of sale invoice</p>
          </div>
          <div className="pos-invoice-meta">
            <p>
              <span>Receipt</span>
              <strong>{sale.receiptNo || sale.id}</strong>
            </p>
            <p>
              <span>Date</span>
              <strong>{prettyDateTime(sale.createdAt)}</strong>
            </p>
            <p>
              <span>Payment</span>
              <strong>{sale.paymentMethod || "cash"}</strong>
            </p>
            {sale.customerPhone && (
              <p>
                <span>Phone</span>
                <strong>{sale.customerPhone}</strong>
              </p>
            )}
          </div>
        </header>

        <table className="pos-invoice-table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Qty</th>
              <th>Price</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {(sale.items || []).map((line, index) => (
              <tr key={`${line.itemId || line.barcode || "line"}-${index}`}>
                <td>
                  <div className="pos-invoice-item">
                    {preset.kind !== "thermal" && (
                      <img
                        src={thumbSrc(line)}
                        alt=""
                        width={40}
                        height={40}
                        loading="lazy"
                        onError={(event) => {
                          event.currentTarget.style.display = "none";
                        }}
                      />
                    )}
                    <span>
                      <strong>{line.name}</strong>
                      <small>{[line.color, line.size, line.barcode].filter(Boolean).join(" · ")}</small>
                    </span>
                  </div>
                </td>
                <td>{line.qty}</td>
                <td>{money(line.price)}</td>
                <td>{money(line.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="pos-invoice-totals">
          <p>
            <span>Items</span>
            <strong>{unitCount(sale)}</strong>
          </p>
          <p>
            <span>Subtotal</span>
            <strong>{money(sale.subtotal)}</strong>
          </p>
          {Number(sale.discount) > 0 && (
            <p>
              <span>
                Discount
                {Number(sale.discountPercent) > 0
                  ? ` (${sale.discountPercent}%)`
                  : sale.offerPercent
                    ? ` (${sale.offerPercent}%)`
                    : ""}
              </span>
              <strong>−{money(sale.discount)}</strong>
            </p>
          )}
          <p className="pos-invoice-grand">
            <span>Total</span>
            <strong>{money(sale.total)}</strong>
          </p>
        </div>

        {sale.offerKind === "inaugural" && (
          <p className="pos-invoice-note">
            Grand opening guest #{sale.offerSlot} — {sale.offerPercent}% today
            {sale.lifetimePercent ? ` + lifetime ${sale.lifetimePercent}%` : ""}.
          </p>
        )}
        {sale.offerKind === "lifetime" && (
          <p className="pos-invoice-note">Lifetime inauguration discount {sale.lifetimePercent || sale.offerPercent}%.</p>
        )}
        {sale.giftEligible && <p className="pos-invoice-note">Special gift eligible (৳{sale.giftMinSubtotal || 5000}+).</p>}
        {sale.note && <p className="pos-invoice-note">Note: {sale.note}</p>}
        <p className="pos-invoice-thanks">Thank you for shopping with StyleARZ.</p>
      </article>

      <form className="pos-invoice-sms no-print" onSubmit={sendSms}>
        <label>
          Customer phone (SMS invoice)
          <input
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="01XXXXXXXXX"
            inputMode="tel"
            autoComplete="tel"
            autoFocus={autoFocusPhone}
          />
        </label>
        <p className="muted">
          {senderPhone
            ? `Sending via shop number ${senderPhone} (that number’s SMS balance).`
            : "Save the shop SMS number in Admin → Settings before sending."}
        </p>
        <button className="btn solid pos-tap" type="submit" disabled={smsBusy || !phone.trim() || !senderPhone}>
          {smsBusy ? "Sending…" : "Send SMS"}
        </button>
        {smsError && <p className="error">{smsError}</p>}
        {smsNotice && <p className="notice">{smsNotice}</p>}
      </form>
    </section>
  );

  if (!asModal) return panel;

  return (
    <div className="pos-invoice-modal no-print-root" role="presentation" onClick={onClose}>
      <div
        className="pos-invoice-modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Sale invoice"
        onClick={(event) => event.stopPropagation()}
      >
        {panel}
      </div>
    </div>
  );
}
