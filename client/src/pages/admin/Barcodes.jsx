import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { api } from "../../api";
import { money } from "../../format";
import { Empty, Loading } from "../../components/ui";
import { barcodeSrc, fetchBarcodes, variantText } from "./inventoryUtils";
import { labelOrientation, printAlignmentTest, printLabelSheet, resolveLabelPreset } from "./printLabels";
import { loadPrinterSettings, paperFromJob } from "./printerSettings";
import LabelPaperPicker from "./LabelPaperPicker";
import PrinterSetupHelp from "./PrinterSetupHelp";

const MAX_COPIES = 50;
const MAX_LABELS = 600;
const PRESET_STORAGE_KEY = "sa-barcode-preset-v2";
const CUSTOM_STORAGE_KEY = "sa-barcode-custom-size";

function loadCustomSize() {
  try {
    const saved = JSON.parse(localStorage.getItem(CUSTOM_STORAGE_KEY) || "null");
    if (saved && saved.w && saved.h) return { w: String(saved.w), h: String(saved.h) };
  } catch {
    /* ignore */
  }
  return { w: "38", h: "25" };
}

function BarcodeLabel({ label, shape, turned }) {
  const meta = [variantText(label), label.barcode].filter(Boolean).join(" · ");
  return (
    <article className={`ql-label is-${shape || "wide"}${turned ? " is-turned" : ""}`}>
      <div className="ql-label-face">
      <header>
        <span className="ql-brand-text">STYLEARZ</span>
        <strong>{money(label.price)}</strong>
      </header>
      <p className="ql-label-name">{label.name}</p>
      <p className="ql-label-size">{meta || "—"}</p>
      <img className="ql-label-barcode" src={barcodeSrc(label.svg)} alt={`Barcode ${label.barcode}`} />
      </div>
    </article>
  );
}

export default function Barcodes() {
  const [searchParams] = useSearchParams();
  const [items, setItems] = useState(null);
  const [selected, setSelected] = useState(() => new Set((searchParams.get("ids") || "").split(",").filter(Boolean)));
  const [labels, setLabels] = useState({});
  const [query, setQuery] = useState("");
  const [presetId, setPresetId] = useState(() => localStorage.getItem(PRESET_STORAGE_KEY) || "t-38x25");
  const [custom, setCustom] = useState(loadCustomSize);
  const [orientation, setOrientation] = useState(() => localStorage.getItem("sa-barcode-orient") || "landscape");
  const [topGap, setTopGap] = useState(() => localStorage.getItem("sa-barcode-gap") || "2.5");
  const [shopJob, setShopJob] = useState(null);
  const [copies, setCopies] = useState("1");
  const [matchStock, setMatchStock] = useState(false);
  const [error, setError] = useState("");
  const location = useLocation();
  const [notice] = useState(location.state?.notice || "");
  const requested = useRef(new Set());
  const sheetRef = useRef(null);

  const shopPaper = paperFromJob(shopJob);
  const preset = presetId === "shop" && shopPaper ? shopPaper : resolveLabelPreset(presetId, custom);
  const printOrientation = preset.id === "shop" ? "landscape" : orientation;
  const printGap = preset.id === "shop" ? preset.topGap : topGap;
  const orient = labelOrientation(preset, printOrientation);
  const shape = preset.kind === "thermal" ? orient.shape : preset.shape || (preset.h > preset.w ? "tall" : "wide");

  useEffect(() => {
    localStorage.setItem(PRESET_STORAGE_KEY, presetId);
  }, [presetId]);

  useEffect(() => {
    localStorage.setItem(CUSTOM_STORAGE_KEY, JSON.stringify(custom));
  }, [custom]);

  useEffect(() => {
    localStorage.setItem("sa-barcode-orient", orientation);
  }, [orientation]);

  useEffect(() => {
    localStorage.setItem("sa-barcode-gap", topGap);
  }, [topGap]);

  useEffect(() => {
    loadPrinterSettings()
      .then((printer) => {
        setShopJob(printer.label);
        setPresetId("shop");
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    api("/api/inventory")
      .then((data) => setItems(data.items))
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    const ids = [...selected].filter((id) => !requested.current.has(id));
    if (!ids.length) return;
    ids.forEach((id) => requested.current.add(id));
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
        setError(err.message);
      });
  }, [selected]);

  const shown = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return items || [];
    return (items || []).filter((item) =>
      [item.name, item.sku, item.barcode, item.color, item.size, item.category].join(" ").toLowerCase().includes(term)
    );
  }, [items, query]);

  const copiesEach = Math.min(MAX_COPIES, Math.max(1, Math.floor(Number(copies)) || 1));
  const order = items ? items.filter((item) => selected.has(item.id)) : [];
  const pending = order.some((item) => !labels[item.id]);
  const wanted = order.reduce((sum, item) => sum + (matchStock ? Math.max(1, item.stock) : copiesEach), 0);
  const sheet = [];
  order.forEach((item) => {
    const label = labels[item.id];
    if (!label) return;
    const count = matchStock ? Math.max(1, item.stock) : copiesEach;
    for (let copy = 0; copy < count && sheet.length < MAX_LABELS; copy += 1) {
      sheet.push({ key: `${item.id}-${copy}`, label });
    }
  });

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

  if (!items) return error ? <p className="error">{error}</p> : <Loading />;

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
    <div className={`barcode-page preset-${preset.id}`}>
      {notice && <p className="notice no-print">{notice}</p>}
      <section className="label-print-bar no-print" aria-label="Print settings">
        <div className="label-print-controls">
          <LabelPaperPicker
            presetId={presetId}
            onPresetChange={setPresetId}
            custom={custom}
            onCustomChange={setCustom}
            preset={preset}
            orientation={orientation}
            onOrientationChange={setOrientation}
            topGap={topGap}
            onTopGapChange={setTopGap}
            shopJob={shopJob}
          />
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
          <div className="label-print-actions">
            <button
              type="button"
              className="btn solid"
              disabled={!sheet.length || pending}
              onClick={() => printLabelSheet(sheetRef.current, preset, `StyleARZ Barcodes (${sheet.length})`, printOrientation, printGap)}
            >
              {pending ? "Preparing labels…" : `Print ${sheet.length} ${sheet.length === 1 ? "label" : "labels"}`}
            </button>
            <button type="button" className="text-link" onClick={() => printAlignmentTest(preset, printOrientation, printGap)}>
              Print alignment test
            </button>
          </div>
        </div>
        {wanted > MAX_LABELS && (
          <p className="warn">
            That's {wanted} labels. Only the first {MAX_LABELS} are shown; print in smaller batches.
          </p>
        )}
        {error && <p className="error">{error}</p>}
        <PrinterSetupHelp preset={preset} />
      </section>
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
      </section>

      <section className="barcode-preview">
        <div className="section-head no-print">
          <h2>Preview</h2>
          <p className="muted">
            {preset.label}
            {shape === "tall"
              ? " · vertical narrow hang-tag paper"
              : preset.kind === "thermal"
                ? " · roll sticker"
                : " · A4 sheet"}
          </p>
        </div>
        {sheet.length === 0 ? (
          <p className="muted no-print">{pending ? "Preparing labels…" : "Select items to preview their labels."}</p>
        ) : (
          <div className={`ql-paper-stage kind-${preset.kind} shape-${shape}`} aria-label="Paper print preview">
            <div
              ref={sheetRef}
              className="ql-sheet"
              style={{
                "--ql-cols": preset.cols || 1,
                "--ql-rows": preset.rows || 1,
                "--ql-w": preset.w,
                "--ql-h": preset.h,
                "--ql-w-mm": `${preset.w}mm`,
                "--ql-h-mm": `${preset.h}mm`,
                "--ql-top": `${Math.min(6, Math.max(0, Number(printGap) || 0))}mm`,
              }}
              data-kind={preset.kind}
              data-shape={shape}
            >
              {sheet.map(({ key, label }) => (
                <BarcodeLabel key={key} label={label} shape={shape} turned={orient.turned} />
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
