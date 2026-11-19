import { useEffect, useId, useMemo, useRef, useState } from "react";
import { money } from "../format";
import { searchCatalog } from "./catalog";

const DEBOUNCE_MS = 180;

function thumbSrc(item) {
  return item?.image || "/images/studio-table.jpg";
}

function stockOf(item) {
  const raw = item?.stock;
  const value = typeof raw === "string" ? Number.parseInt(raw, 10) : Number(raw);
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

export default function ProductSearch({ onPick, busy = false, autofocus = false }) {
  const listId = useId();
  const inputRef = useRef(null);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const reqRef = useRef(0);

  const inStock = useMemo(() => hits.filter((item) => stockOf(item) > 0), [hits]);
  const outOfStock = useMemo(() => hits.filter((item) => stockOf(item) < 1), [hits]);
  const selectable = inStock;

  useEffect(() => {
    if (autofocus) inputRef.current?.focus();
  }, [autofocus]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 1) {
      setHits([]);
      setSearching(false);
      setError("");
      return undefined;
    }
    const requestId = ++reqRef.current;
    setSearching(true);
    const timer = window.setTimeout(() => {
      searchCatalog(q, 24)
        .then((items) => {
          if (requestId !== reqRef.current) return;
          setHits(items);
          setActive(0);
          setOpen(true);
          setError("");
        })
        .catch((err) => {
          if (requestId !== reqRef.current) return;
          setHits([]);
          setError(err.message || "Could not search products.");
        })
        .finally(() => {
          if (requestId === reqRef.current) setSearching(false);
        });
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [query]);

  function choose(item) {
    if (!item || busy) return;
    if (stockOf(item) < 1) {
      setError(`Out of stock — not added: ${item.name}`);
      return;
    }
    onPick?.(item);
    setQuery("");
    setHits([]);
    setOpen(false);
    setError("");
    inputRef.current?.focus();
  }

  function onKeyDown(event) {
    if (!open || !selectable.length) {
      if (event.key === "Enter") {
        event.preventDefault();
        if (selectable[0]) choose(selectable[0]);
        else if (outOfStock.length) setError("All matches are out of stock — nothing added.");
      }
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => Math.min(selectable.length - 1, i + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      choose(selectable[active] || selectable[0]);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  function renderRow(item, index, { selectableRow }) {
    const stock = stockOf(item);
    const out = stock < 1;
    return (
      <li key={item.id} role="option" aria-selected={selectableRow && index === active} aria-disabled={out || undefined}>
        <button
          type="button"
          className={`${selectableRow && index === active ? "is-active" : ""}${out ? " is-oos" : ""}`}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => choose(item)}
          disabled={out}
        >
          <img className="pos-product-thumb" src={thumbSrc(item)} alt="" width={48} height={48} loading="lazy" />
          <span className="pos-product-copy">
            <strong>{item.name}</strong>
            <small>
              {[item.color, item.size, item.sku, item.barcode].filter(Boolean).join(" · ") || "—"}
              {out ? " · Out of stock" : ""}
            </small>
          </span>
          <span className="pos-product-price">
            <b>{money(item.price)}</b>
            <small className={out ? "is-oos" : ""}>{out ? "Out of stock" : `Stock ${stock}`}</small>
          </span>
        </button>
      </li>
    );
  }

  return (
    <div className="pos-product-search">
      <label>
        Find product
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            setError("");
          }}
          onFocus={() => query.trim() && setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 160)}
          onKeyDown={onKeyDown}
          placeholder="Name, barcode, SKU, color, size…"
          autoComplete="off"
          spellCheck={false}
          disabled={busy}
          aria-autocomplete="list"
          aria-controls={listId}
          aria-expanded={open && hits.length > 0}
        />
      </label>
      <div className="pos-product-search-meta">
        {searching && <span className="muted">Searching…</span>}
        {!searching && query.trim() && !hits.length && !error && <span className="muted">No matches</span>}
        {error && <span className="error">{error}</span>}
      </div>
      {open && hits.length > 0 && (
        <div id={listId} className="pos-product-dropdown" role="listbox">
          {inStock.length > 0 && (
            <div className="pos-product-group">
              <p className="pos-product-group-label">In stock</p>
              <ul>
                {inStock.map((item, index) => renderRow(item, index, { selectableRow: true }))}
              </ul>
            </div>
          )}
          {outOfStock.length > 0 && (
            <div className="pos-product-group is-oos">
              <p className="pos-product-group-label">Out of stock</p>
              <ul>
                {outOfStock.map((item, index) => renderRow(item, index, { selectableRow: false }))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
