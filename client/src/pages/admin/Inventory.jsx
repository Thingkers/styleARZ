import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "../../api";
import { money, prettyDate } from "../../format";
import { Empty, Loading } from "../../components/ui";
import ItemPhoto from "./ItemPhoto";
import {
  CATEGORIES,
  QUICK_SIZES,
  barcodeSrc,
  fetchBarcodes,
  stockLevel,
  stockText,
  variantText,
} from "./inventoryUtils";
import { colourFromImage } from "./colorFromImage";

const FIELDS = ["name", "color", "colorHex", "size", "category", "price", "cost", "stock", "notes", "listed"];
const NUMBER_FIELDS = ["price", "cost", "stock"];
const EMPTY_FORM = {
  name: "",
  color: "",
  colorHex: "",
  size: "",
  sizes: [],
  category: "",
  price: "",
  cost: "",
  stock: "1",
  notes: "",
  listed: true,
};
const STEPS = [
  { id: "photo", label: "Photo" },
  { id: "details", label: "Details" },
  { id: "review", label: "Review" },
];

function toForm(item) {
  return {
    name: item.name || "",
    color: item.color || "",
    colorHex: item.colorHex || "",
    size: item.size || "",
    sizes: item.size ? [item.size] : [],
    category: item.category || "",
    price: String(item.price ?? ""),
    cost: item.cost ? String(item.cost) : "",
    stock: String(item.stock ?? 0),
    notes: item.notes || "",
    listed: item.listed !== false,
  };
}

function toPayload(form) {
  return {
    name: form.name.trim(),
    color: form.color.trim(),
    colorHex: (form.colorHex || "").trim(),
    size: form.size.trim(),
    category: form.category.trim(),
    price: Number(form.price),
    cost: form.cost.trim() === "" ? 0 : Number(form.cost),
    stock: form.stock.trim() === "" ? 0 : Number(form.stock),
    notes: form.notes.trim(),
    listed: form.listed !== false,
  };
}

function selectedSizes(form) {
  if (Array.isArray(form.sizes) && form.sizes.length) return form.sizes;
  const single = String(form.size || "").trim();
  return single ? [single] : [];
}

function validate(form, { multiSize = false } = {}) {
  if (form.name.trim().length < 2) return "Give the item a name (at least 2 characters).";
  if (form.price.trim() === "" || !(Number(form.price) >= 0)) return "Enter a selling price.";
  if (form.cost.trim() !== "" && !(Number(form.cost) >= 0)) return "Cost must be zero or more.";
  const stock = form.stock.trim() === "" ? 0 : Number(form.stock);
  if (!Number.isInteger(stock) || stock < 0) return "Stock must be a whole number, zero or more.";
  if (multiSize && !selectedSizes(form).length) return "Select at least one size (or type a custom size).";
  return "";
}

function changedFields(item, form) {
  const next = toPayload(form);
  const patch = {};
  FIELDS.forEach((field) => {
    let current = item[field];
    if (field === "listed") current = item.listed !== false;
    else if (current === undefined || current === null) current = NUMBER_FIELDS.includes(field) ? 0 : "";
    if (next[field] !== current) patch[field] = next[field];
  });
  return patch;
}

function marginPercent(price, cost) {
  if (!(price > 0) || !(cost > 0)) return null;
  return Math.round(((price - cost) / price) * 100);
}

function Thumb({ item }) {
  return item.image ? <img src={item.image} alt="" loading="lazy" /> : <span>{item.name.slice(0, 2)}</span>;
}

function ActionBar({ error, children }) {
  return (
    <div className="inv-bar">
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {children}
    </div>
  );
}

function useSuggestions() {
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState(CATEGORIES);

  useEffect(() => {
    api("/api/inventory")
      .then((data) => setItems(data.items))
      .catch(() => {});
    api("/api/inventory/categories")
      .then((data) => setCategories(data.categories?.length ? data.categories : CATEGORIES))
      .catch(() => {});
  }, []);

  return useMemo(() => {
    const collect = (field, defaults) => {
      const seen = new Map();
      [...defaults, ...items.map((item) => item[field])].forEach((value) => {
        const clean = String(value || "").trim();
        if (clean && !seen.has(clean.toLowerCase())) seen.set(clean.toLowerCase(), clean);
      });
      return [...seen.values()];
    };
    return {
      categories,
      colors: collect("color", []),
      sizes: collect("size", QUICK_SIZES),
    };
  }, [items, categories]);
}

export function InventoryList() {
  const navigate = useNavigate();
  const location = useLocation();
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(location.state?.notice || "");
  const [query, setQuery] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const [importing, setImporting] = useState(false);
  const [openKeys, setOpenKeys] = useState(() => new Set());

  useEffect(() => {
    loadItems();
  }, []);

  function loadItems() {
    setError("");
    return api("/api/inventory")
      .then((data) => setItems(data.items))
      .catch((err) => setError(err.message));
  }

  function toggleGroup(key) {
    setOpenKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function importCatalog() {
    if (
      !window.confirm(
        "Import all shop products into inventory? Each size gets a barcode for POS. Shop listings stay as they are (no duplicates)."
      )
    ) {
      return;
    }
    setImporting(true);
    setError("");
    setNotice("");
    try {
      const data = await api("/api/inventory/import-catalog", { method: "POST", body: {} });
      setItems(data.items);
      setNotice(
        data.createdCount
          ? `Imported ${data.createdCount} inventory rows from the shop catalog.`
          : "Shop products were already in inventory — nothing new to add."
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setImporting(false);
    }
  }

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return (items || []).filter((item) => {
      if (lowOnly && stockLevel(item.stock) === "ok") return false;
      if (!term) return true;
      return [item.name, item.sku, item.barcode, item.color, item.size, item.category, item.notes]
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
  }, [items, query, lowOnly]);

  const groups = useMemo(() => {
    const map = new Map();
    visible.forEach((item) => {
      const key =
        item.sourceProductId ||
        `${String(item.name || "").toLowerCase()}|${String(item.color || "").toLowerCase()}|${String(item.category || "").toLowerCase()}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          name: item.name,
          color: item.color,
          category: item.category,
          image: item.image,
          price: item.price,
          variants: [],
        });
      }
      const group = map.get(key);
      group.variants.push(item);
      if (!group.image && item.image) group.image = item.image;
      if (!group.price && item.price) group.price = item.price;
    });
    return [...map.values()].map((group) => {
      const variants = group.variants.slice().sort((a, b) => String(a.size || "").localeCompare(String(b.size || ""), undefined, { numeric: true }));
      const stock = variants.reduce((sum, item) => sum + Number(item.stock || 0), 0);
      const level = stockLevel(stock);
      const worst = variants.some((item) => stockLevel(item.stock) === "out")
        ? "out"
        : variants.some((item) => stockLevel(item.stock) === "low")
          ? "low"
          : level;
      return { ...group, variants, stock, level: worst };
    });
  }, [visible]);

  if (!items) {
    if (!error) return <Loading />;
    return (
      <div>
        <p className="error">{error}</p>
        <button className="text-link" type="button" onClick={loadItems}>
          Retry
        </button>
      </div>
    );
  }

  const lowCount = items.filter((item) => stockLevel(item.stock) !== "ok").length;
  const units = items.reduce((sum, item) => sum + item.stock, 0);
  const retailValue = items.reduce((sum, item) => sum + item.price * item.stock, 0);
  const styleCount = new Set(
    items.map(
      (item) =>
        item.sourceProductId ||
        `${String(item.name || "").toLowerCase()}|${String(item.color || "").toLowerCase()}|${String(item.category || "").toLowerCase()}`
    )
  ).size;

  // Barcode scanners type the code and press Enter, so an exact match opens the item.
  function onSearch(event) {
    event.preventDefault();
    const code = query.trim().toUpperCase();
    const match = items.find((item) => item.barcode.toUpperCase() === code || item.sku.toUpperCase() === code);
    if (match) navigate(`/admin/inventory/${match.id}`);
  }

  async function remove(item) {
    if (!window.confirm(`Delete ${item.name} (${item.barcode})? It will be removed from inventory and the POS.`)) return;
    setError("");
    setNotice("");
    try {
      await api(`/api/inventory/${item.id}`, { method: "DELETE" });
      setItems((current) => current.filter((entry) => entry.id !== item.id));
      setNotice(`${item.name} deleted.`);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <div className="stat-grid">
        <article>
          <p className="kicker">Styles</p>
          <strong>{styleCount}</strong>
        </article>
        <article>
          <p className="kicker">Size rows</p>
          <strong>{items.length}</strong>
        </article>
        <article>
          <p className="kicker">Units in stock</p>
          <strong>{units}</strong>
        </article>
        <article>
          <p className="kicker">Low stock</p>
          <strong>{lowCount}</strong>
        </article>
        <article>
          <p className="kicker">Retail value</p>
          <strong>{money(retailValue)}</strong>
        </article>
      </div>

      <div className="inv-toolbar inv-list-toolbar">
        <form className="inv-search" role="search" onSubmit={onSearch}>
          <label className="sr" htmlFor="inv-search">
            Search inventory
          </label>
          <input
            id="inv-search"
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search or scan a barcode"
          />
        </form>
        <div className="pills">
          <button type="button" className={lowOnly ? "on" : ""} aria-pressed={lowOnly} onClick={() => setLowOnly((on) => !on)}>
            Low stock ({lowCount})
          </button>
        </div>
        <button className="btn line" type="button" disabled={importing} onClick={importCatalog}>
          {importing ? "Importing…" : "Import shop products"}
        </button>
        <Link className="btn line" to="/admin/barcodes">
          Print labels
        </Link>
        <Link className="btn solid" to="/admin/inventory/new">
          Add item
        </Link>
      </div>

      {notice && <p className="notice">{notice}</p>}
      {error && <p className="error">{error}</p>}

      {items.length === 0 ? (
        <Empty
          title="No inventory yet"
          text="The online shop catalog is separate from POS inventory. Import shop products to create barcodes, or add a new floor item with a photo."
          action={
            <>
              <button className="btn solid" type="button" disabled={importing} onClick={importCatalog}>
                {importing ? "Importing…" : "Import shop products"}
              </button>
              <Link className="btn line" to="/admin/inventory/new">
                Add your first item
              </Link>
            </>
          }
        />
      ) : groups.length === 0 ? (
        <p className="muted">Nothing matches{query.trim() ? ` “${query.trim()}”` : ""}.</p>
      ) : (
        <ul className="inv-list">
          {groups.map((group) => {
            const primary = group.variants[0];
            const sizeIds = group.variants.map((item) => item.id).join(",");
            const open = openKeys.has(group.key);
            return (
              <li key={group.key} className={`inv-group is-${group.level} ${open ? "is-open" : ""}`}>
                <button
                  type="button"
                  className="inv-group-head"
                  aria-expanded={open}
                  onClick={() => toggleGroup(group.key)}
                >
                  <span className="inv-thumb" aria-hidden="true">
                    <Thumb item={primary} />
                  </span>
                  <span className="inv-group-title">
                    <span className="inv-group-name">{group.name}</span>
                    <span className="muted inv-group-meta">
                      {[group.color, group.category, `${group.variants.length} sizes`].filter(Boolean).join(" · ")}
                    </span>
                    <span className="inv-group-summary">
                      <strong>{money(group.price)}</strong>
                      <span className={`inv-stock is-${group.level}`}>{stockText(group.stock)}</span>
                    </span>
                  </span>
                  <span className="inv-group-toggle">{open ? "Collapse" : "Expand"}</span>
                </button>
                {open && (
                  <div className="inv-group-body">
                    <div className="inv-group-tools">
                      <Link to={`/admin/inventory/${primary.id}`}>Open</Link>
                      <Link to={`/admin/barcodes?ids=${encodeURIComponent(sizeIds)}`}>All labels</Link>
                    </div>
                    <ul className="inv-size-list">
                      {group.variants.map((item) => {
                        const level = stockLevel(item.stock);
                        return (
                          <li key={item.id} className={`is-${level}`}>
                            <span className="inv-size-label">{item.size || "One"}</span>
                            <code className="inv-code">{item.barcode}</code>
                            <strong className="inv-price">{money(item.price)}</strong>
                            <div className="inv-size-tools">
                              <span className={`inv-stock is-${level}`}>{stockText(item.stock)}</span>
                              <Link to={`/admin/inventory/${item.id}`} aria-label={`Edit ${item.name} ${item.size}`}>
                                Edit
                              </Link>
                              <Link
                                to={`/admin/barcodes?ids=${encodeURIComponent(item.id)}`}
                                aria-label={`Barcode for ${item.name} ${item.size}`}
                              >
                                Barcode
                              </Link>
                              <button
                                type="button"
                                className="text-link inv-danger"
                                onClick={() => remove(item)}
                                aria-label={`Delete ${item.name} ${item.size}`}
                              >
                                Delete
                              </button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ItemFields({ form, onChange, suggestions, multiSize = false, colourHint }) {
  const set = (field) => (event) => onChange({ ...form, [field]: event.target.value });
  const values = toPayload(form);
  const margin = marginPercent(values.price, values.cost);
  const sizes = selectedSizes(form);

  function toggleSize(size) {
    if (!multiSize) {
      onChange({ ...form, size, sizes: [size] });
      return;
    }
    const next = sizes.includes(size) ? sizes.filter((entry) => entry !== size) : [...sizes, size];
    onChange({ ...form, sizes: next, size: next[0] || "" });
  }

  function addCustomSize(event) {
    event.preventDefault();
    const custom = String(form.size || "").trim();
    if (!custom) return;
    if (!multiSize) return;
    if (sizes.includes(custom)) return;
    onChange({ ...form, sizes: [...sizes, custom], size: "" });
  }

  return (
    <div className="form-grid inv-fields">
      <label className="span-2">
        Name
        <input
          value={form.name}
          onChange={set("name")}
          required
          minLength={2}
          maxLength={120}
          autoComplete="off"
          placeholder="e.g. Casual Export Oxford"
        />
      </label>
      <label>
        Category
        <input value={form.category} onChange={set("category")} maxLength={60} list="inv-categories" autoComplete="off" />
      </label>
      <label>
        Colour
        <input value={form.color} onChange={set("color")} maxLength={40} list="inv-colors" autoComplete="off" />
      </label>
      {colourHint && (
        <div className="span-2 inv-colour-hint">
          <span className="inv-swatch" style={{ background: colourHint.hex }} aria-hidden />
          <span>
            From photo: <strong>{colourHint.name}</strong> ({colourHint.hex})
          </span>
          <button
            type="button"
            className="btn line"
            onClick={() => onChange({ ...form, color: colourHint.name, colorHex: colourHint.hex })}
          >
            Use this colour
          </button>
        </div>
      )}
      {multiSize ? (
        <>
          <div className="span-2">
            <p className="inv-field-label">Sizes (select all that apply)</p>
            <p className="muted inv-field-help">Each size becomes its own stock row with a unique barcode.</p>
          </div>
          <div className="span-2 size-row inv-size-picks" role="group" aria-label="Sizes">
            {QUICK_SIZES.map((size) => (
              <button
                key={size}
                type="button"
                className={sizes.includes(size) ? "on" : ""}
                aria-pressed={sizes.includes(size)}
                onClick={() => toggleSize(size)}
              >
                {size}
              </button>
            ))}
          </div>
          {sizes.length > 0 && (
            <p className="span-2 muted">
              Selected: {sizes.join(", ")}
            </p>
          )}
          <label className="span-2">
            Add custom size
            <div className="inv-custom-size">
              <input
                value={form.size}
                onChange={set("size")}
                maxLength={20}
                list="inv-sizes"
                autoComplete="off"
                placeholder="e.g. 32 or 8-9Y"
              />
              <button type="button" className="btn line" onClick={addCustomSize}>
                Add size
              </button>
            </div>
          </label>
        </>
      ) : (
        <>
          <label className="span-2">
            Size
            <input value={form.size} onChange={set("size")} maxLength={20} list="inv-sizes" autoComplete="off" />
          </label>
          <div className="span-2 size-row inv-size-picks" role="group" aria-label="Quick sizes">
            {QUICK_SIZES.map((size) => (
              <button
                key={size}
                type="button"
                className={form.size === size ? "on" : ""}
                aria-pressed={form.size === size}
                onClick={() => onChange({ ...form, size })}
              >
                {size}
              </button>
            ))}
          </div>
        </>
      )}
      <label>
        Price (৳)
        <input type="number" inputMode="decimal" min="0" step="0.01" value={form.price} onChange={set("price")} required />
      </label>
      <label>
        Cost (৳)
        <input
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          value={form.cost}
          onChange={set("cost")}
          placeholder="Optional"
        />
      </label>
      <label>
        Stock
        <input type="number" inputMode="numeric" min="0" step="1" value={form.stock} onChange={set("stock")} />
      </label>
      <div className="inv-margin">
        <span>Margin</span>
        <output>{margin === null ? "—" : `${margin}%`}</output>
      </div>
      <label className="span-2">
        Notes
        <textarea
          rows={3}
          maxLength={400}
          value={form.notes}
          onChange={set("notes")}
          placeholder="Fabric, supplier, shelf…"
        />
      </label>
      {"listed" in form && (
        <label className="span-2 inv-listed">
          <input
            type="checkbox"
            checked={form.listed !== false}
            onChange={(event) => onChange({ ...form, listed: event.target.checked })}
          />
          Show this item in the online shop
        </label>
      )}
      <datalist id="inv-categories">
        {suggestions.categories.map((value) => (
          <option key={value} value={value} />
        ))}
      </datalist>
      <datalist id="inv-colors">
        {suggestions.colors.map((value) => (
          <option key={value} value={value} />
        ))}
      </datalist>
      <datalist id="inv-sizes">
        {suggestions.sizes.map((value) => (
          <option key={value} value={value} />
        ))}
      </datalist>
    </div>
  );
}

function ItemPreview({ form, photo }) {
  const values = toPayload(form);
  const sizes = selectedSizes(form);
  const margin = marginPercent(values.price, values.cost);
  const level = stockLevel(values.stock);

  return (
    <article className="inv-preview">
      <div className="inv-preview-media">{photo ? <img src={photo} alt="" /> : <span>No photo</span>}</div>
      <div className="inv-preview-body">
        {values.category && <p className="kicker">{values.category}</p>}
        <h3>{values.name}</h3>
        <p className="muted">
          {[values.color, sizes.join(", ")].filter(Boolean).join(" · ") || "No colour or size"}
        </p>
        <p className="price">{money(values.price)}</p>
        <dl className="inv-facts">
          <div>
            <dt>Sizes</dt>
            <dd>{sizes.length ? `${sizes.length} barcode${sizes.length === 1 ? "" : "s"}` : "—"}</dd>
          </div>
          <div>
            <dt>Stock each</dt>
            <dd>
              <span className={`inv-stock is-${level}`}>{stockText(values.stock)}</span>
            </dd>
          </div>
          <div>
            <dt>Cost</dt>
            <dd>{values.cost ? money(values.cost) : "—"}</dd>
          </div>
          <div>
            <dt>Margin</dt>
            <dd>{margin === null ? "—" : `${margin}%`}</dd>
          </div>
          <div>
            <dt>Barcode</dt>
            <dd>One unique code per size on save</dd>
          </div>
        </dl>
        {values.notes && <p className="inv-notes">{values.notes}</p>}
      </div>
    </article>
  );
}

export function InventoryEditor() {
  const { id } = useParams();
  return id ? <EditItem key={id} id={id} /> : <AddItem />;
}

function AddItem() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const suggestions = useSuggestions();
  const [form, setForm] = useState(EMPTY_FORM);
  const [photo, setPhoto] = useState("");
  const [colourHint, setColourHint] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const photoRequestRef = useRef(0);

  const requested = STEPS.some((entry) => entry.id === searchParams.get("step")) ? searchParams.get("step") : "photo";
  const problem = validate(form, { multiSize: true });
  const step = requested === "review" && problem ? "details" : requested;
  const stepIndex = STEPS.findIndex((entry) => entry.id === step);
  const flowRef = useRef(null);

  useEffect(() => {
    const flow = flowRef.current;
    if (flow && flow.getBoundingClientRect().top < 0) flow.scrollIntoView({ block: "start" });
  }, [step]);

  async function onPhoto(dataUrl) {
    const requestId = ++photoRequestRef.current;
    setPhoto(dataUrl);
    setColourHint(null);
    setError("");
    if (!dataUrl) return;
    try {
      const hint = await colourFromImage(dataUrl);
      if (requestId !== photoRequestRef.current) return;
      setColourHint(hint);
      setForm((current) => (current.color.trim() ? current : { ...current, color: hint.name, colorHex: hint.hex }));
    } catch (err) {
      if (requestId === photoRequestRef.current) {
        setError(`Photo was added, but a colour suggestion could not be generated: ${err.message}`);
      }
    }
  }

  function goTo(next) {
    setError("");
    setSearchParams(next === "photo" ? {} : { step: next }, { replace: next === requested });
  }

  function toReview(event) {
    event.preventDefault();
    if (problem) {
      setError(problem);
      return;
    }
    goTo("review");
  }

  async function save() {
    setSaving(true);
    setError("");
    const sizes = selectedSizes(form);
    const base = toPayload(form);
    try {
      const data = await api("/api/inventory/batch", {
        method: "POST",
        body: {
          items: sizes.map((size) => ({ ...base, size })),
          ...(photo ? { image: photo } : {}),
        },
      });
      const created = data.items;
      const ids = created.map((item) => item.id).join(",");
      const notice =
        created.length === 1
          ? `${created[0].name} saved with barcode ${created[0].barcode}.`
          : `${created.length} sizes saved (${created.map((item) => item.size).join(", ")}). Each has its own barcode.`;
      navigate(`/admin/barcodes?ids=${encodeURIComponent(ids)}`, {
        replace: true,
        state: { notice },
      });
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <div className="inv-flow" ref={flowRef}>
      <div className="inv-flow-head">
        <div>
          <Link className="inv-back" to="/admin/inventory">
            ← Inventory
          </Link>
          <h2>Add item</h2>
        </div>
      </div>

      <ol className="inv-steps">
        {STEPS.map((entry, index) => (
          <li
            key={entry.id}
            className={index < stepIndex ? "is-done" : index === stepIndex ? "is-current" : ""}
            aria-current={index === stepIndex ? "step" : undefined}
          >
            <button type="button" disabled={index >= stepIndex} onClick={() => goTo(entry.id)}>
              <span>{index + 1}</span>
              {entry.label}
            </button>
          </li>
        ))}
      </ol>

      {step === "photo" && (
        <section>
          <ItemPhoto
            src={photo}
            onChange={onPhoto}
            onRemove={() => {
              photoRequestRef.current += 1;
              setPhoto("");
              setColourHint(null);
            }}
            note="Shoot the piece flat or on a hanger against a plain background. Colour is suggested from the photo."
          />
          {colourHint && (
            <p className="notice inv-colour-inline">
              <span className="inv-swatch" style={{ background: colourHint.hex }} aria-hidden />
              Suggested colour: <strong>{colourHint.name}</strong> — you can change it on the next step.
            </p>
          )}
          <ActionBar error={error}>
            <Link className="btn line" to="/admin/inventory">
              Cancel
            </Link>
            <button type="button" className="btn solid" onClick={() => goTo("details")}>
              {photo ? "Next: details" : "Skip photo"}
            </button>
          </ActionBar>
        </section>
      )}

      {step === "details" && (
        <form onSubmit={toReview} noValidate>
          <div className="panel">
            <ItemFields
              multiSize
              colourHint={colourHint}
              form={form}
              onChange={(next) => {
                setForm(next);
                setError("");
              }}
              suggestions={suggestions}
            />
          </div>
          <ActionBar error={error}>
            <button type="button" className="btn line" onClick={() => goTo("photo")}>
              Back
            </button>
            <button type="submit" className="btn solid">
              Review
            </button>
          </ActionBar>
        </form>
      )}

      {step === "review" && (
        <section>
          <ItemPreview form={form} photo={photo} />
          <ActionBar error={error}>
            <button type="button" className="btn line" onClick={() => goTo("details")}>
              Edit details
            </button>
            <button type="button" className="btn solid" disabled={saving} onClick={save}>
              {saving
                ? "Saving…"
                : selectedSizes(form).length > 1
                  ? `Save ${selectedSizes(form).length} sizes`
                  : "Save item"}
            </button>
          </ActionBar>
        </section>
      )}
    </div>
  );
}

function AddSizesPanel({ item, onCreated }) {
  const [picked, setPicked] = useState([]);
  const [custom, setCustom] = useState("");
  const [stock, setStock] = useState(String(item.stock ?? 1));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function toggle(size) {
    setPicked((current) => (current.includes(size) ? current.filter((entry) => entry !== size) : [...current, size]));
  }

  async function createSizes(event) {
    event.preventDefault();
    const sizes = [...picked];
    const extra = custom.trim();
    if (extra && !sizes.includes(extra)) sizes.push(extra);
    if (!sizes.length) {
      setError("Select one or more sizes.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await api(`/api/inventory/${item.id}/sizes`, {
        method: "POST",
        body: { sizes, stock: stock === "" ? item.stock : Number(stock) },
      });
      setPicked([]);
      setCustom("");
      onCreated(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel inv-add-sizes">
      <h3>Add more sizes</h3>
      <p className="muted">
        Keeps the same photo, name, colour, price and category. Each size gets its own barcode and stock — no need to re-photograph.
      </p>
      <div className="size-row inv-size-picks" role="group" aria-label="Additional sizes">
        {QUICK_SIZES.map((size) => (
          <button
            key={size}
            type="button"
            className={picked.includes(size) || item.size === size ? "on" : ""}
            disabled={item.size === size}
            aria-pressed={picked.includes(size)}
            onClick={() => toggle(size)}
          >
            {size}
          </button>
        ))}
      </div>
      <div className="inv-custom-size">
        <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Custom size" maxLength={20} />
        <label>
          Stock each
          <input type="number" min="0" step="1" value={stock} onChange={(e) => setStock(e.target.value)} />
        </label>
      </div>
      {error && <p className="error">{error}</p>}
      <button type="button" className="btn solid" disabled={busy} onClick={createSizes}>
        {busy ? "Creating…" : "Create sizes + barcodes"}
      </button>
    </section>
  );
}

function EditItem({ id }) {
  const navigate = useNavigate();
  const location = useLocation();
  const suggestions = useSuggestions();
  const [item, setItem] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [photo, setPhoto] = useState("");
  const [removePhoto, setRemovePhoto] = useState(false);
  const [barcodeSvg, setBarcodeSvg] = useState("");
  const [barcodeError, setBarcodeError] = useState("");
  const [siblings, setSiblings] = useState([]);
  const [siblingsError, setSiblingsError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState(location.state?.notice || "");
  const [error, setError] = useState(location.state?.error || "");
  const [saving, setSaving] = useState(false);
  const photoRequestRef = useRef(0);
  const barcode = item?.barcode;

  function loadSiblings(current) {
    setSiblingsError("");
    return api("/api/inventory")
      .then((list) => {
        setSiblings(
          list.items.filter(
            (entry) =>
              entry.id !== current.id &&
              entry.name === current.name &&
              entry.color === current.color &&
              entry.category === current.category
          )
        );
      })
      .catch((err) => {
        setSiblings([]);
        setSiblingsError(err.message);
      });
  }

  function loadItem() {
    setLoadError("");
    return api(`/api/inventory/${id}`)
      .then((data) => {
        setItem(data.item);
        setForm(toForm(data.item));
        return data.item;
      })
      .then((current) => loadSiblings(current))
      .catch((err) => setLoadError(err.message));
  }

  useEffect(() => {
    loadItem();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!barcode) return;
    setBarcodeError("");
    fetchBarcodes([id])
      .then((data) => setBarcodeSvg(data.items[0]?.svg || ""))
      .catch((err) => {
        setBarcodeSvg("");
        setBarcodeError(err.message);
      });
  }, [id, barcode]);

  if (loadError) {
    return (
      <div>
        <p className="error">{loadError}</p>
        <Link to="/admin/inventory">Back to inventory</Link>
      </div>
    );
  }
  if (!item) return <Loading />;

  const patch = changedFields(item, form);
  const dirty = Object.keys(patch).length > 0 || Boolean(photo) || removePhoto;
  const shownPhoto = photo || (removePhoto ? "" : item.image);
  const level = stockLevel(item.stock);

  async function save(event) {
    event.preventDefault();
    const problem = validate(form);
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");

    const body = { ...patch };
    // Guards absolute stock edits against POS sales that landed while this form was open.
    if (body.stock !== undefined) body.baseVersion = item.version;
    if (removePhoto && !photo) body.image = "";

    if (Object.keys(body).length) {
      try {
        const data = await api(`/api/inventory/${id}`, { method: "PATCH", body });
        setItem(data.item);
        setForm(toForm(data.item));
        setRemovePhoto(false);
      } catch (err) {
        const fresh = err.status === 409 ? await api(`/api/inventory/${id}`).catch(() => null) : null;
        if (fresh) {
          setItem(fresh.item);
          setForm((current) => ({ ...current, stock: String(fresh.item.stock) }));
          setError(`Stock changed to ${fresh.item.stock} while you were editing (probably a POS sale). Check the count and save again.`);
        } else {
          setError(err.message);
        }
        setSaving(false);
        return;
      }
    }

    if (photo) {
      try {
        const data = await api(`/api/inventory/${id}/image`, { method: "POST", body: { image: photo } });
        setItem(data.item);
        setPhoto("");
      } catch (err) {
        setError(`Details saved, but the photo didn't upload: ${err.message}`);
        setSaving(false);
        return;
      }
    }

    setNotice("Changes saved.");
    setSaving(false);
  }

  async function remove() {
    if (!window.confirm(`Delete ${item.name} (${item.barcode})? It will be removed from inventory and the POS.`)) return;
    setError("");
    try {
      await api(`/api/inventory/${id}`, { method: "DELETE" });
      navigate("/admin/inventory", { replace: true, state: { notice: `${item.name} deleted.` } });
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <form className="inv-edit" onSubmit={save} noValidate>
      <div className="inv-flow-head">
        <div>
          <Link className="inv-back" to="/admin/inventory">
            ← Inventory
          </Link>
          <h2>{item.name}</h2>
          <span className={`inv-stock is-${level}`}>{stockText(item.stock)}</span>
        </div>
        <Link className="btn line" to="/admin/inventory/new">
          Add another
        </Link>
      </div>

      {notice && <p className="notice">{notice}</p>}

      <div className="inv-edit-grid">
        <aside className="inv-edit-side">
          <ItemPhoto
            src={shownPhoto}
            onChange={async (dataUrl) => {
              const requestId = ++photoRequestRef.current;
              setPhoto(dataUrl);
              setRemovePhoto(false);
              setNotice("");
              if (!dataUrl || form.color.trim()) return;
              try {
                const hint = await colourFromImage(dataUrl);
                if (requestId !== photoRequestRef.current) return;
                setForm((current) =>
                  current.color.trim() ? current : { ...current, color: hint.name, colorHex: hint.hex }
                );
                setNotice(`Colour suggested from photo: ${hint.name}`);
              } catch (err) {
                if (requestId === photoRequestRef.current) {
                  setNotice(`Photo was added, but a colour suggestion could not be generated: ${err.message}`);
                }
              }
            }}
            onRemove={() => {
              photoRequestRef.current += 1;
              if (photo) setPhoto("");
              else setRemovePhoto(true);
              setNotice("");
            }}
            note={photo ? "New photo uploads when you save." : removePhoto ? "Photo will be removed when you save." : ""}
          />
          <section className="inv-barcode-card">
            <p className="kicker">Barcode</p>
            {barcodeSvg ? <img src={barcodeSrc(barcodeSvg)} alt={`Barcode ${item.barcode}`} /> : <code>{item.barcode}</code>}
            <p className="muted inv-barcode-code">{item.barcode}</p>
            {barcodeError && <p className="error" role="alert">{barcodeError}</p>}
            <dl className="inv-facts">
              <div>
                <dt>SKU</dt>
                <dd>{item.sku}</dd>
              </div>
              <div>
                <dt>Updated</dt>
                <dd>{prettyDate(item.updatedAt)}</dd>
              </div>
            </dl>
            <Link className="btn solid" to={`/admin/barcodes?ids=${encodeURIComponent(item.id)}`}>
              Create / print barcode label
            </Link>
            {siblings.length > 0 && (
              <div className="inv-siblings">
                <p className="kicker">Other sizes</p>
                <ul>
                  {siblings.map((sibling) => (
                    <li key={sibling.id}>
                      <Link to={`/admin/inventory/${sibling.id}`}>
                        {sibling.size || "—"} · {sibling.barcode}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {siblingsError && (
              <div className="inv-siblings">
                <p className="error">{siblingsError}</p>
                <button type="button" className="text-link" onClick={() => loadSiblings(item)}>
                  Retry loading sizes
                </button>
              </div>
            )}
          </section>
        </aside>
        <div className="inv-edit-main">
          <div className="panel">
            <ItemFields form={form} onChange={setForm} suggestions={suggestions} />
          </div>
          <AddSizesPanel
            item={item}
            onCreated={(result) => {
              const ids = result.created.map((entry) => entry.id).join(",");
              setNotice(
                `Created ${result.created.length} size${result.created.length === 1 ? "" : "s"}: ${result.created
                  .map((entry) => entry.size)
                  .join(", ")}. Same photo reused.`
              );
              loadItem();
              if (ids) navigate(`/admin/barcodes?ids=${encodeURIComponent(ids)}`, { state: { notice: "Print labels for the new sizes." } });
            }}
          />
        </div>
      </div>

      <ActionBar error={error}>
        <button type="button" className="text-link inv-danger" onClick={remove}>
          Delete item
        </button>
        <button type="submit" className="btn solid" disabled={!dirty || saving}>
          {saving ? "Saving…" : dirty ? "Save changes" : "Saved"}
        </button>
      </ActionBar>
    </form>
  );
}
