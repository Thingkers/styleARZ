import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { api } from "../../api";
import { money } from "../../format";
import { Empty, Loading } from "../../components/ui";
import { barcodeSrc, fetchBarcodes, variantText } from "./inventoryUtils";

const MAX_COPIES = 50;
const MAX_LABELS = 600;

function BarcodeLabel({ label }) {
  const variant = variantText(label);
  return (
    <article className="barcode-label">
      <header>
        <span>StyleARZ</span>
        <strong>{money(label.price)}</strong>
      </header>
      <p className="barcode-name">{label.name}</p>
      {variant && <p className="barcode-meta">{variant}</p>}
      <img src={barcodeSrc(label.svg)} alt={`Barcode ${label.barcode}`} />
    </article>
  );
}

export default function Barcodes() {
  const [searchParams] = useSearchParams();
  const [items, setItems] = useState(null);
  const [selected, setSelected] = useState(() => new Set((searchParams.get("ids") || "").split(",").filter(Boolean)));
  const [labels, setLabels] = useState({});
  const [query, setQuery] = useState("");
  const [copies, setCopies] = useState("1");
  const [matchStock, setMatchStock] = useState(false);
  const [error, setError] = useState("");
  const [barcodeError, setBarcodeError] = useState("");
  const [retryLoad, setRetryLoad] = useState(0);
  const [retryBarcodes, setRetryBarcodes] = useState(0);
  const location = useLocation();
  const [notice] = useState(location.state?.notice || "");
  const requested = useRef(new Set());

  useEffect(() => {
    setError("");
    api("/api/inventory")
      .then((data) => setItems(data.items))
      .catch((err) => setError(err.message));
  }, [retryLoad]);

  const copiesEach = Math.min(MAX_COPIES, Math.max(1, Math.floor(Number(copies)) || 1));
  const order = items ? items.filter((item) => selected.has(item.id)) : [];
  const wanted = order.reduce((sum, item) => {
    const stockCount = Math.max(0, Math.floor(Number(item.stock) || 0));
    return sum + (matchStock ? stockCount : copiesEach);
  }, 0);
  const labelItems = [];
  order.forEach((item) => {
    const count = matchStock
      ? Math.max(0, Math.floor(Number(item.stock) || 0))
      : copiesEach;
    const remaining = MAX_LABELS - labelItems.length;
    for (let copy = 0; copy < count && copy < remaining; copy += 1) {
      labelItems.push({ key: `${item.id}-${copy}`, itemId: item.id });
    }
  });
  const labelIds = [...new Set(labelItems.map(({ itemId }) => itemId))];
  const labelRequestKey = labelIds.join(",");

  useEffect(() => {
    const ids = labelIds.filter((id) => !requested.current.has(id));
    if (!ids.length) return;
    ids.forEach((id) => requested.current.add(id));
    setBarcodeError("");
    fetchBarcodes(ids)
      .then((data) => {
        setLabels((current) => {
          const next = { ...current };
          data.items.forEach((entry) => {
            next[entry.id] = entry;
          });
          return next;
        });
        if (data.missing.length) {
          setSelected((current) => new Set([...current].filter((id) => !data.missing.includes(id))));
        }
      })
      .catch((err) => {
        ids.forEach((id) => requested.current.delete(id));
        setBarcodeError(err.message);
      });
  }, [labelRequestKey, retryBarcodes]);

  const shown = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return items || [];
    return (items || []).filter((item) =>
      [item.name, item.sku, item.barcode, item.color, item.size, item.category].join(" ").toLowerCase().includes(term)
    );
  }, [items, query]);

  const pending = labelIds.some((id) => !labels[id]);
  const sheet = labelItems
    .filter(({ itemId }) => labels[itemId])
    .map(({ key, itemId }) => ({ key, label: labels[itemId] }));

  function toggle(id) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectShown() {
    setSelected((current) => new Set([...current, ...shown.map((item) => item.id)]));
  }

  if (!items) {
    return error ? (
      <div>
        <p className="error">{error}</p>
        <button type="button" className="btn line" onClick={() => setRetryLoad((count) => count + 1)}>
          Retry loading inventory
        </button>
      </div>
    ) : (
      <Loading />
    );
  }

  if (items.length === 0) {
    return (
      <Empty
        title="No inventory to label"
        text="Add shop-floor items first. Each one gets a Code 128 barcode automatically."
        action={
          <Link className="btn solid" to="/admin/inventory/new">
            Add item
          </Link>
        }
      />
    );
  }

  return (
    <div className="barcode-page">
      {notice && <p className="notice no-print">{notice}</p>}
      <section className="barcode-picker no-print">
        <div className="barcode-picker-head">
          <h2>Choose items</h2>
          <p className="muted">
            {selected.size} selected · {items.length} in inventory
          </p>
        </div>
        <input
          type="search"
          className="barcode-filter"
          aria-label="Filter items"
          placeholder="Filter by name, colour, size or barcode"
          autoComplete="off"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="barcode-bulk">
          <button type="button" className="text-link" onClick={selectShown} disabled={!shown.length}>
            Select {query.trim() ? "matches" : "all"}
          </button>
          <button type="button" className="text-link" onClick={() => setSelected(new Set())} disabled={!selected.size}>
            Clear
          </button>
        </div>
        <ul className="barcode-choices">
          {shown.map((item) => {
            const on = selected.has(item.id);
            return (
              <li key={item.id}>
                <label className={on ? "on" : ""}>
                  <input type="checkbox" checked={on} onChange={() => toggle(item.id)} />
                  <span className="inv-thumb" aria-hidden="true">
                    {item.image ? <img src={item.image} alt="" loading="lazy" /> : <span>{item.name.slice(0, 2)}</span>}
                  </span>
                  <span className="barcode-choice-text">
                    <strong>{item.name}</strong>
                    <small className="muted">
                      {[variantText(item), item.barcode].filter(Boolean).join(" · ")}
                    </small>
                  </span>
                  <span className="barcode-choice-price">{money(item.price)}</span>
                </label>
              </li>
            );
          })}
          {shown.length === 0 && <li className="muted">No items match “{query.trim()}”.</li>}
        </ul>
        <div className="barcode-options">
          <label>
            Copies of each label
            <input
              type="number"
              inputMode="numeric"
              min="1"
              max={MAX_COPIES}
              value={copies}
              disabled={matchStock}
              onChange={(event) => setCopies(event.target.value)}
            />
          </label>
          <label className="inv-check">
            <input type="checkbox" checked={matchStock} onChange={(event) => setMatchStock(event.target.checked)} />
            One label per unit in stock
          </label>
          {wanted > MAX_LABELS && (
            <p className="warn">
              That's {wanted} labels. Only the first {MAX_LABELS} are shown; print in smaller batches.
            </p>
          )}
          {error && <p className="error">{error}</p>}
          {barcodeError && <p className="error">{barcodeError}</p>}
          {error && (
            <button type="button" className="text-link" onClick={() => setRetryLoad((count) => count + 1)}>
              Retry loading inventory
            </button>
          )}
          {barcodeError && (
            <button type="button" className="text-link" onClick={() => setRetryBarcodes((count) => count + 1)}>
              Retry preparing labels
            </button>
          )}
          <button
            type="button"
            className="btn solid"
            disabled={!sheet.length || pending}
            onClick={() => window.print()}
          >
            {pending ? "Preparing labels…" : `Print ${sheet.length} ${sheet.length === 1 ? "label" : "labels"}`}
          </button>
        </div>
      </section>

      <section className="barcode-preview">
        <div className="section-head no-print">
          <h2>Preview</h2>
          <p className="muted">Code 128 · prints three across on A4 or Letter</p>
        </div>
        {sheet.length === 0 ? (
          <p className="muted no-print">
            {pending
              ? "Preparing labels…"
              : matchStock && selected.size > 0 && wanted === 0
                ? "The selected items are out of stock, so there are no unit labels to print."
                : "Select items to preview their labels."}
          </p>
        ) : (
          <div className="barcode-sheet">
            {sheet.map(({ key, label }) => (
              <BarcodeLabel key={key} label={label} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
