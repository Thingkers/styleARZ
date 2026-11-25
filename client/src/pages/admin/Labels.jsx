import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api";
import { money, prettyDateTime } from "../../format";
import { Empty, Loading, Modal } from "../../components/ui";
import { CATEGORIES, QUICK_SIZES, allowedAudiencesForCategory, barcodeSrc } from "./inventoryUtils";

const PAPER_PRESETS = [
  { id: "a4-65", label: "A4 · 65-up (38.1×21.2 mm)", kind: "a4", cols: 5, rows: 13, w: 38.1, h: 21.2 },
  { id: "a4-40", label: "A4 · 40-up (52×29 mm)", kind: "a4", cols: 4, rows: 10, w: 52, h: 29 },
  { id: "a4-24", label: "A4 · 24-up (70×36 mm)", kind: "a4", cols: 3, rows: 8, w: 70, h: 36 },
  { id: "t-40x30", label: "Thermal 40×30 mm", kind: "thermal", w: 40, h: 30, shape: "wide" },
  { id: "t-50x30", label: "Thermal 50×30 mm", kind: "thermal", w: 50, h: 30, shape: "wide" },
  { id: "t-58x40", label: "Thermal 58×40 mm", kind: "thermal", w: 58, h: 40, shape: "wide" },
  { id: "t-40x60", label: "Thermal 40×60 mm (narrow hang tag)", kind: "thermal", w: 40, h: 60, shape: "tall" },
  { id: "t-60x40", label: "Thermal 60×40 mm", kind: "thermal", w: 60, h: 40, shape: "wide" },
  { id: "t-80x50", label: "Thermal 80×50 mm", kind: "thermal", w: 80, h: 50, shape: "wide" },
];

const SIZE_CHIPS = [...QUICK_SIZES.filter((size) => size !== "One"), "Custom"];

function todayIso() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function DraftThumb({ src, label }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <span>{label || "QL"}</span>;
  return <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} />;
}

function LabelFace({ label, shape }) {
  return (
    <article className={`ql-label is-${shape || "wide"}`}>
      <header>
        <span className="ql-brand" aria-label="StyleARZ">
          <span className="ql-brand-mark" aria-hidden="true" />
          <span className="ql-brand-text">
            <em>STYLE</em>
            <b>ARZ</b>
          </span>
        </span>
        <strong>{money(label.price)}</strong>
      </header>
      {label.name ? <p className="ql-label-name">{label.name}</p> : null}
      <p className="ql-label-size">{[label.size, label.barcode].filter(Boolean).join(" · ") || "—"}</p>
      <img className="ql-label-barcode" src={barcodeSrc(label.svg)} alt={`Barcode ${label.barcode}`} />
    </article>
  );
}

function emptyEdit(item) {
  return {
    name: item?.name || "",
    price: item ? String(item.price) : "",
    size: item?.size || "",
    note: item?.note || "",
    customSize: "",
    sizeMode: item?.size && !QUICK_SIZES.includes(item.size) && item.size !== "Free" ? "Custom" : item?.size || "",
  };
}

export default function Labels() {
  const [items, setItems] = useState(null);
  const [status, setStatus] = useState("draft");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(() => new Set());
  const [rangeAnchor, setRangeAnchor] = useState(null);
  const [labels, setLabels] = useState({});
  const [presetId, setPresetId] = useState("t-40x60");
  const [copies, setCopies] = useState("1");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [editForm, setEditForm] = useState(emptyEdit());
  const [convertItem, setConvertItem] = useState(null);
  const [convertForm, setConvertForm] = useState({
    name: "",
    category: "Shirt",
    audience: "Unisex",
    color: "",
    stock: "1",
    listed: false,
  });

  const preset = PAPER_PRESETS.find((entry) => entry.id === presetId) || PAPER_PRESETS[6];
  const shape = preset.shape || (preset.h > preset.w ? "tall" : "wide");

  function load() {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (query.trim()) params.set("q", query.trim());
    return api(`/api/labels?${params}`)
      .then((data) => setItems(data.items))
      .catch((err) => setError(err.message));
  }

  useEffect(() => {
    setItems(null);
    load();
  }, [status]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      load();
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  const order = useMemo(() => items || [], [items]);

  const sheet = useMemo(() => {
    const copiesEach = Math.min(20, Math.max(1, Math.floor(Number(copies)) || 1));
    const rows = [];
    order.forEach((item) => {
      if (!selected.has(item.id)) return;
      const label = labels[item.id];
      if (!label) return;
      const face = {
        ...label,
        name: label.name || item.name || "",
      };
      for (let copy = 0; copy < copiesEach; copy += 1) {
        rows.push({ key: `${item.id}-${copy}`, label: face });
      }
    });
    return rows;
  }, [order, selected, labels, copies]);

  useEffect(() => {
    const ids = [...selected].filter((id) => !labels[id]);
    if (!ids.length) return undefined;
    let cancelled = false;
    api("/api/labels/barcodes/batch", { method: "POST", body: { ids } })
      .then((data) => {
        if (cancelled) return;
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
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [selected, labels]);

  function toggle(id, index, event) {
    setSelected((current) => {
      const next = new Set(current);
      if (event?.shiftKey && rangeAnchor != null) {
        const from = Math.min(rangeAnchor, index);
        const to = Math.max(rangeAnchor, index);
        for (let i = from; i <= to; i += 1) next.add(order[i].id);
        return next;
      }
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setRangeAnchor(index);
  }

  function selectRange() {
    if (selected.size < 1) {
      setError("Tap the first item, then Fill range after tapping the last — or Shift-click.");
      return;
    }
    const indexes = order.map((item, index) => (selected.has(item.id) ? index : -1)).filter((i) => i >= 0);
    if (!indexes.length) return;
    const from = Math.min(...indexes);
    const to = Math.max(...indexes);
    setSelected(new Set(order.slice(from, to + 1).map((item) => item.id)));
    setNotice(`Selected ${to - from + 1} labels in range.`);
  }

  function selectToday() {
    const day = todayIso();
    const ids = order.filter((item) => String(item.createdAt || "").slice(0, 10) === day).map((item) => item.id);
    setSelected(new Set(ids));
    setNotice(ids.length ? `Selected ${ids.length} from today.` : "No labels from today in this list.");
  }

  async function removeSelected() {
    if (!selected.size) return;
    if (!window.confirm(`Delete ${selected.size} quick label${selected.size === 1 ? "" : "s"}?`)) return;
    setBusy(true);
    setError("");
    try {
      for (const id of selected) {
        await api(`/api/labels/${id}`, { method: "DELETE" });
      }
      setSelected(new Set());
      setNotice("Deleted.");
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function openEdit(item) {
    setEditItem(item);
    setEditForm(emptyEdit(item));
    setError("");
  }

  function openConvert(item) {
    if (!item || item.status !== "draft") return;
    setConvertItem(item);
    setConvertForm({
      name: item.name || "",
      category: "Shirt",
      audience: "Unisex",
      color: "",
      stock: "1",
      listed: false,
    });
    setError("");
  }

  const audienceOptions = allowedAudiencesForCategory(convertForm.category);

  useEffect(() => {
    if (!audienceOptions.includes(convertForm.audience)) {
      setConvertForm((current) => ({ ...current, audience: audienceOptions[0] || "Unisex" }));
    }
  }, [convertForm.category, convertForm.audience, audienceOptions]);

  async function saveEdit(event) {
    event.preventDefault();
    if (!editItem) return;
    const amount = Number(editForm.price);
    if (!Number.isFinite(amount) || amount < 0) {
      setError("Enter a valid price.");
      return;
    }
    const size = editForm.sizeMode === "Custom" ? editForm.customSize.trim() : editForm.sizeMode || editForm.size;
    setBusy(true);
    setError("");
    try {
      const data = await api(`/api/labels/${editItem.id}`, {
        method: "PATCH",
        body: {
          name: editForm.name.trim(),
          price: amount,
          size,
          note: editForm.note.trim(),
        },
      });
      setLabels((current) => {
        const next = { ...current };
        delete next[editItem.id];
        return next;
      });
      setEditItem(null);
      setNotice(`Updated ${data.item.barcode}.`);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function convertOne(event) {
    event.preventDefault();
    if (!convertItem) return;
    setBusy(true);
    setError("");
    try {
      const result = await api("/api/labels/convert", {
        method: "POST",
        body: {
          ids: [convertItem.id],
          name: convertForm.name,
          category: convertForm.category,
          audience: convertForm.audience,
          color: convertForm.color,
          stock: Number(convertForm.stock) || 1,
          listed: Boolean(convertForm.listed),
        },
      });
      setConvertItem(null);
      setSelected((current) => {
        const next = new Set(current);
        next.delete(convertItem.id);
        return next;
      });
      setNotice(`Converted ${result.created[0].item.name} · barcode ${result.created[0].item.barcode}.`);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!items) return error ? <p className="error">{error}</p> : <Loading />;

  const draftCount = items.filter((item) => item.status === "draft").length;
  const singleSelected =
    selected.size === 1 ? order.find((item) => selected.has(item.id) && item.status === "draft") : null;

  return (
    <div className={`ql-page paper-${preset.kind} preset-${preset.id} shape-${shape}`}>
      <div className="ql-toolbar no-print">
        <div>
          <h2>Quick Labels</h2>
          <p className="muted">Capture on phone, edit details anytime, print a batch, convert one piece at a time.</p>
        </div>
        <div className="ql-toolbar-actions">
          <Link className="btn solid" to="/admin/labels/capture">
            Capture on phone
          </Link>
        </div>
      </div>

      {notice && <p className="notice no-print">{notice}</p>}
      {error && !editItem && !convertItem && <p className="error no-print">{error}</p>}

      {items.length === 0 && status === "draft" ? (
        <Empty
          title="No quick labels yet"
          text="Open Capture on your phone, photograph each garment, enter a price (name optional), and save."
          action={
            <Link className="btn solid" to="/admin/labels/capture">
              Start capture
            </Link>
          }
        />
      ) : (
        <div className="ql-layout">
          <section className="ql-list-panel no-print">
            <div className="ql-filters">
              <label>
                Show
                <select
                  value={status}
                  onChange={(event) => {
                    setStatus(event.target.value);
                    setSelected(new Set());
                  }}
                >
                  <option value="draft">Drafts ({status === "draft" ? items.length : draftCount || "…"})</option>
                  <option value="converted">Converted</option>
                  <option value="">All</option>
                </select>
              </label>
              <label>
                Search
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Name, barcode, size"
                  autoComplete="off"
                />
              </label>
            </div>
            <div className="ql-bulk">
              <button type="button" className="text-link" onClick={() => setSelected(new Set(order.map((item) => item.id)))}>
                Select all
              </button>
              <button type="button" className="text-link" onClick={selectToday}>
                Select today
              </button>
              <button type="button" className="text-link" onClick={selectRange} disabled={selected.size < 2}>
                Fill range
              </button>
              <button type="button" className="text-link" onClick={() => setSelected(new Set())} disabled={!selected.size}>
                Clear
              </button>
            </div>
            <ul className="ql-choices">
              {order.map((item, index) => {
                const on = selected.has(item.id);
                return (
                  <li key={item.id}>
                    <div className={`ql-choice-row ${on ? "on" : ""}`}>
                      <label>
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={(event) => toggle(item.id, index, event.nativeEvent)}
                        />
                        <span className="inv-thumb" aria-hidden>
                          <DraftThumb src={item.image} label={(item.name || item.barcode || "QL").slice(0, 2)} />
                        </span>
                        <span className="ql-choice-text">
                          <strong>{item.name || item.barcode}</strong>
                          <small className="muted">
                            {[item.name ? item.barcode : null, item.size, prettyDateTime(item.createdAt), item.status === "converted" ? "in inventory" : null]
                              .filter(Boolean)
                              .join(" · ")}
                          </small>
                        </span>
                        <span className="ql-choice-price">{money(item.price)}</span>
                      </label>
                      {item.status === "draft" && (
                        <div className="ql-choice-actions">
                          <button type="button" className="text-link" onClick={() => openEdit(item)}>
                            Edit
                          </button>
                          <button type="button" className="text-link" onClick={() => openConvert(item)}>
                            Convert
                          </button>
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="ql-options">
              <label>
                Paper / label size
                <select value={presetId} onChange={(event) => setPresetId(event.target.value)}>
                  {PAPER_PRESETS.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Copies each
                <input
                  type="number"
                  min="1"
                  max="20"
                  inputMode="numeric"
                  value={copies}
                  onChange={(event) => setCopies(event.target.value)}
                />
              </label>
              <button type="button" className="btn solid" disabled={!sheet.length} onClick={() => window.print()}>
                Print {sheet.length || selected.size} label{sheet.length === 1 ? "" : "s"}
              </button>
              <button
                type="button"
                className="btn line"
                disabled={!singleSelected || busy}
                onClick={() => openConvert(singleSelected)}
              >
                Convert selected (one)
              </button>
              <button type="button" className="text-link" disabled={!selected.size || busy} onClick={removeSelected}>
                Delete selected
              </button>
            </div>
          </section>

          <section className="ql-preview">
            <div className="section-head no-print">
              <h2>Print preview</h2>
              <p className="muted">
                {preset.label}
                {shape === "tall" ? " · vertical narrow hang-tag paper" : preset.kind === "thermal" ? " · roll sticker" : " · A4 sheet"}
              </p>
            </div>
            {sheet.length === 0 ? (
              <p className="muted no-print">Select labels to preview on real paper size.</p>
            ) : (
              <div className={`ql-paper-stage kind-${preset.kind} shape-${shape}`} aria-label="Paper print preview">
                <div
                  className="ql-sheet"
                  style={{
                    "--ql-cols": preset.cols || 1,
                    "--ql-rows": preset.rows || 1,
                    "--ql-w": preset.w,
                    "--ql-h": preset.h,
                    "--ql-w-mm": `${preset.w}mm`,
                    "--ql-h-mm": `${preset.h}mm`,
                  }}
                  data-kind={preset.kind}
                  data-shape={shape}
                >
                  {sheet.map(({ key, label }) => (
                    <LabelFace key={key} label={label} shape={shape} />
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      {editItem && (
        <Modal title={`Edit ${editItem.barcode}`} onClose={() => setEditItem(null)}>
          <form className="ql-convert" onSubmit={saveEdit}>
            <div className="ql-edit-photo">
              {editItem.image ? <img src={editItem.image} alt="" /> : <span className="muted">No photo</span>}
            </div>
            <label>
              Product name <em className="muted">(optional)</em>
              <input
                maxLength={120}
                value={editForm.name}
                onChange={(event) => setEditForm({ ...editForm, name: event.target.value })}
                placeholder="Skip if you will name it later"
              />
            </label>
            <label>
              Price (৳)
              <input
                required
                type="number"
                inputMode="numeric"
                min="0"
                value={editForm.price}
                onChange={(event) => setEditForm({ ...editForm, price: event.target.value })}
              />
            </label>
            <div className="ql-sizes light" role="group" aria-label="Size">
              {SIZE_CHIPS.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  className={(editForm.sizeMode || editForm.size) === chip ? "on" : ""}
                  onClick={() =>
                    setEditForm((current) => ({
                      ...current,
                      sizeMode: chip,
                      size: chip === "Custom" ? current.customSize : chip,
                    }))
                  }
                >
                  {chip}
                </button>
              ))}
            </div>
            {editForm.sizeMode === "Custom" && (
              <label>
                Custom size
                <input
                  value={editForm.customSize}
                  onChange={(event) =>
                    setEditForm({ ...editForm, customSize: event.target.value, size: event.target.value })
                  }
                  maxLength={20}
                />
              </label>
            )}
            <label>
              Note <em className="muted">(optional)</em>
              <input
                maxLength={120}
                value={editForm.note}
                onChange={(event) => setEditForm({ ...editForm, note: event.target.value })}
              />
            </label>
            {error && <p className="error">{error}</p>}
            <div className="ql-form-actions">
              <button type="button" className="btn line" onClick={() => setEditItem(null)}>
                Cancel
              </button>
              <button type="submit" className="btn solid" disabled={busy}>
                {busy ? "Saving…" : "Save changes"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {convertItem && (
        <Modal title="Convert to inventory" onClose={() => setConvertItem(null)}>
          <form className="ql-convert" onSubmit={convertOne}>
            <p className="muted">
              One label only · barcode <strong>{convertItem.barcode}</strong> stays the same.
            </p>
            <label>
              Product name
              <input
                required
                minLength={2}
                maxLength={120}
                value={convertForm.name}
                onChange={(event) => setConvertForm({ ...convertForm, name: event.target.value })}
                placeholder="Required for inventory"
              />
            </label>
            <label>
              Category
              <select
                value={convertForm.category}
                onChange={(event) => setConvertForm({ ...convertForm, category: event.target.value })}
              >
                {CATEGORIES.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Audience
              <select
                value={convertForm.audience}
                onChange={(event) => setConvertForm({ ...convertForm, audience: event.target.value })}
              >
                {audienceOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Colour <em className="muted">(optional)</em>
              <input
                value={convertForm.color}
                onChange={(event) => setConvertForm({ ...convertForm, color: event.target.value })}
                maxLength={40}
              />
            </label>
            <label>
              Stock
              <input
                type="number"
                min="0"
                value={convertForm.stock}
                onChange={(event) => setConvertForm({ ...convertForm, stock: event.target.value })}
              />
            </label>
            <label className="inv-check">
              <input
                type="checkbox"
                checked={convertForm.listed}
                onChange={(event) => setConvertForm({ ...convertForm, listed: event.target.checked })}
              />
              List on shop immediately
            </label>
            {error && <p className="error">{error}</p>}
            <div className="ql-form-actions">
              <button type="button" className="btn line" onClick={() => setConvertItem(null)}>
                Cancel
              </button>
              <button type="submit" className="btn solid" disabled={busy}>
                {busy ? "Converting…" : "Convert this piece"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
