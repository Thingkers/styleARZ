import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { money } from "../format";
import { defaultSize } from "../commerce";
import { useDocumentTitle } from "../hooks";
import { useAuth } from "../context/AuthContext";
import { useShop } from "../context/ShopContext";
import { PALETTE, compareColours } from "../palette";
import { Loading, PageHeader } from "../components/ui";

const SLOTS = [
  { id: "layer", label: "Layer" },
  { id: "top", label: "Top" },
  { id: "bottom", label: "Bottom" },
  { id: "dress", label: "Dress" },
  { id: "shoes", label: "Shoes" },
  { id: "accessory", label: "Accessory" },
  { id: "other", label: "Other" },
];

export function Studio() {
  useDocumentTitle("Style Studio");
  const { user } = useAuth();
  const { addManyToCart, notify } = useShop();
  const [params] = useSearchParams();
  const lookId = params.get("look");
  const [products, setProducts] = useState([]);
  const [wardrobe, setWardrobe] = useState([]);
  const [active, setActive] = useState("top");
  const [slots, setSlots] = useState({});
  const [name, setName] = useState("Untitled look");
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [errors, setErrors] = useState([]);
  const [wardrobeError, setWardrobeError] = useState("");
  const lookEdited = useRef(false);
  const nameEdited = useRef(false);

  useEffect(() => {
    let activeRequest = true;
    lookEdited.current = false;
    nameEdited.current = false;
    setErrors([]);
    setLoadingProducts(true);
    setProducts([]);
    api("/api/products")
      .then((data) => {
        if (!Array.isArray(data?.products)) throw new Error("The product list could not be loaded.");
        if (activeRequest) setProducts(data.products);
      })
      .catch((err) => {
        if (activeRequest) {
          setProducts([]);
          setErrors((current) => [...current, err?.message || "Could not load products."]);
        }
      })
      .finally(() => {
        if (activeRequest) setLoadingProducts(false);
      });

    if (lookId) {
      api(`/api/looks/${encodeURIComponent(lookId)}`)
        .then((data) => {
          if (!Array.isArray(data?.products) || !data.look || typeof data.look.name !== "string") {
            throw new Error("This saved look could not be loaded.");
          }
          if (!activeRequest || lookEdited.current) return;
          const next = {};
          data.products.forEach((product) => {
            if (product && typeof product.id === "string" && SLOTS.some((slot) => slot.id === product.slot)) {
              next[product.slot] = product.id;
            }
          });
          setSlots(next);
          if (!nameEdited.current) setName(data.look.name);
        })
        .catch((err) => {
          if (activeRequest) {
            setErrors((current) => [...current, err?.message || "Could not load this look."]);
          }
        });
    } else {
      setSlots({});
      setName("Untitled look");
    }

    return () => {
      activeRequest = false;
    };
  }, [lookId]);

  useEffect(() => {
    let activeRequest = true;
    setWardrobeError("");
    if (!user) {
      setWardrobe([]);
      return () => {
        activeRequest = false;
      };
    }
    api("/api/wardrobe")
      .then((data) => {
        if (!Array.isArray(data?.items)) throw new Error("Your wardrobe could not be loaded.");
        if (activeRequest) setWardrobe(data.items);
      })
      .catch((err) => {
        if (!activeRequest) return;
        setWardrobe([]);
        setWardrobeError(err?.message || "Could not load your wardrobe.");
      });

    return () => {
      activeRequest = false;
    };
  }, [user]);

  const chosen = useMemo(() => {
    return SLOTS.map((slot) => {
      const value = slots[slot.id];
      if (!value) return { slot, item: null };
      const owned = wardrobe.find((item) => item.id === value);
      const product = products.find((item) => item.id === value);
      return { slot, item: owned || product || null, owned: Boolean(owned) };
    }).filter((entry) => entry.item);
  }, [slots, products, wardrobe]);

  const total = chosen.reduce((sum, entry) => sum + (entry.owned ? 0 : entry.item.price || 0), 0);
  const options = products.filter((product) => getProductSlot(product) === active);

  function choose(id) {
    lookEdited.current = true;
    setSlots((current) => ({ ...current, [active]: current[active] === id ? undefined : id }));
  }

  async function save() {
    if (!user) {
      notify("Sign in to save this look.");
      return;
    }
    try {
      await api("/api/outfits", { method: "POST", body: { name, slots } });
      notify("Look saved to your studio.");
    } catch (err) {
      notify(err.message);
    }
  }

  function shopLook() {
    addManyToCart(chosen
      .filter((entry) => !entry.owned)
      .map((entry) => ({
        product: entry.item,
        size: defaultSize(entry.item),
        color: entry.item.colors?.[0]?.name,
        qty: 1,
      })));
  }

  const colours = chosen.flatMap((entry) => {
    if (entry.owned) return [{ name: entry.item.color, hex: entry.item.hex || "#4e4e4e" }];
    return entry.item.colors.slice(0, 1);
  });

  return (
    <div className="page wrap">
      <PageHeader
        kicker="Style Studio"
        title="Mix and match"
        lede="Build a look from the edit, then fold in pieces you already own. Colour and budget tools sit beside it."
      >
        <div className="hero-actions">
          <Link className="btn line" to="/studio/colour">Colour match</Link>
          <Link className="btn line" to="/studio/budget">Budget builder</Link>
        </div>
      </PageHeader>
      {errors.map((message, index) => <p className="error" key={`${index}-${message}`}>{message}</p>)}
      <div className="studio">
        <div className="board">
          <label>
            Look name
            <input
              value={name}
              onChange={(event) => {
                nameEdited.current = true;
                setName(event.target.value);
              }}
            />
          </label>
          <ul className="slot-list">
            {SLOTS.map((slot) => {
              const entry = chosen.find((item) => item.slot.id === slot.id);
              return (
                <li key={slot.id}>
                  <button type="button" className={active === slot.id ? "on" : ""} onClick={() => setActive(slot.id)}>
                    <span>{slot.label}</span>
                    <strong>{entry ? entry.item.name : "Choose"}</strong>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="total-line">
            <span>Catalogue total</span>
            <strong>{money(total)}</strong>
          </p>
          {colours.length >= 2 && (
            <p className="muted">
              Lead colours: {colours.map((color) => color.name).join(" + ")}.{" "}
              <Link to={`/studio/colour?a=${encodeURIComponent(colours[0].name)}&b=${encodeURIComponent(colours[1].name)}`}>
                Check the pairing
              </Link>
            </p>
          )}
          <div className="hero-actions">
            <button type="button" className="btn solid" onClick={shopLook} disabled={chosen.every((entry) => entry.owned) || chosen.length === 0}>
              Add catalogue pieces
            </button>
            <button type="button" className="btn dark" onClick={save}>
              Save look
            </button>
          </div>
        </div>
        <div>
          <div className="pills">
            {SLOTS.map((slot) => (
              <button key={slot.id} type="button" className={active === slot.id ? "on" : ""} onClick={() => setActive(slot.id)}>
                {slot.label}
              </button>
            ))}
          </div>
          {wardrobeError && <p className="error">{wardrobeError}</p>}
          {loadingProducts && <Loading />}
          <div className="picker">
            {wardrobe
              .filter((item) => matchWardrobe(item, active))
              .map((item) => (
                <button key={item.id} type="button" className={slots[active] === item.id ? "on owned" : "owned"} onClick={() => choose(item.id)}>
                  <i style={{ background: item.hex }} />
                  <span>{item.name}</span>
                  <em>Yours</em>
                </button>
              ))}
            {options.map((product) => (
              <button
                key={product.id}
                type="button"
                className={slots[active] === product.id ? "on" : ""}
                disabled={!Number.isFinite(Number(product.stock)) || Number(product.stock) < 1}
                onClick={() => choose(product.id)}
              >
                <img src={product.image} alt="" />
                <span>{product.name}</span>
                <em>{Number(product.stock) > 0 ? money(product.price) : "Out of stock"}</em>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function matchWardrobe(item, slot) {
  return getCategorySlot(item?.category) === slot;
}

function getCategorySlot(category) {
  const value = String(category || "").toLowerCase();
  if (value.includes("outer") || value.includes("tailor")) return "layer";
  if (value.includes("shirt") || value.includes("knit")) return "top";
  if (value.includes("trouser") || value.includes("jean")) return "bottom";
  if (value.includes("dress")) return "dress";
  if (value.includes("foot") || value.includes("shoe")) return "shoes";
  if (value.includes("access")) return "accessory";
  return "other";
}

function getProductSlot(product) {
  if (product.slot && product.slot !== "other" && SLOTS.some((slot) => slot.id === product.slot)) {
    return product.slot;
  }
  return getCategorySlot(product.category);
}

export function ColourMatch() {
  useDocumentTitle("Colour match");
  const [params, setParams] = useSearchParams();
  const colorA = params.get("a");
  const colorB = params.get("b");
  const initialA = PALETTE.find((color) => color.name === colorA) || PALETTE[0];
  const initialB = PALETTE.find((color) => color.name === colorB) || PALETTE[4];
  const [a, setA] = useState(initialA);
  const [b, setB] = useState(initialB);
  useEffect(() => {
    setA(PALETTE.find((color) => color.name === colorA) || PALETTE[0]);
    setB(PALETTE.find((color) => color.name === colorB) || PALETTE[4]);
  }, [colorA, colorB]);

  function updateColour(key, color, setColor) {
    setColor(color);
    const next = new URLSearchParams(params);
    next.set(key, color.name);
    setParams(next, { replace: true });
  }

  const result = compareColours(a, b);

  return (
    <div className="page wrap">
      <PageHeader
        kicker="Colour match"
        title="Do these two belong together?"
        lede="Pick the two strongest tones in the outfit. Neutrals can carry almost anything. Saturated pairs need a clear lead."
      />
      <div className="colour-stage">
        <div style={{ background: a.hex }}>
          <span>{a.name}</span>
        </div>
        <div style={{ background: b.hex }}>
          <span>{b.name}</span>
        </div>
      </div>
      <div className="notice">
        <p className="kicker">{result.verdict}</p>
        <p>{result.note}</p>
      </div>
      <div className="colour-pick">
        <Palette label="First tone" value={a} onChange={(color) => updateColour("a", color, setA)} />
        <Palette label="Second tone" value={b} onChange={(color) => updateColour("b", color, setB)} />
      </div>
    </div>
  );
}

function Palette({ label, value, onChange }) {
  return (
    <fieldset>
      <legend>{label}</legend>
      <div className="swatch-row">
        {PALETTE.map((color) => (
          <button key={color.name} type="button" className={value.name === color.name ? "on" : ""} onClick={() => onChange(color)}>
            <i style={{ background: color.hex }} />
            {color.name}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function Budget() {
  useDocumentTitle("Budget builder");
  const { addManyToCart } = useShop();
  const [budget, setBudget] = useState(15000);
  const [occasion, setOccasion] = useState("Office");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [building, setBuilding] = useState(false);
  const buildSequence = useRef(0);

  async function build(event) {
    event?.preventDefault();
    const sequence = ++buildSequence.current;
    setBuilding(true);
    setResult(null);
    setError("");
    try {
      const data = await api("/api/studio/budget", { method: "POST", body: { budget, occasion } });
      if (!Array.isArray(data?.items)) throw new Error("The outfit suggestion could not be loaded.");
      if (sequence === buildSequence.current) setResult(data);
    } catch (err) {
      if (sequence === buildSequence.current) {
        setError(err?.message || "Could not build an outfit. Please try again.");
      }
    } finally {
      if (sequence === buildSequence.current) setBuilding(false);
    }
  }

  useEffect(() => {
    build();
    return () => {
      buildSequence.current += 1;
    };
  }, []);

  function addAll() {
    addManyToCart(result?.items.map((product) => ({
      product,
      size: defaultSize(product),
      color: product.colors?.[0]?.name,
      qty: 1,
    })) || []);
  }

  return (
    <div className="page wrap">
      <PageHeader
        kicker="Budget"
        title="A complete look, inside the number"
        lede="The builder prefers pieces that suit the occasion, then spends toward the budget instead of defaulting to the cheapest option."
      />
      <form className="budget-bar" onSubmit={build}>
        <label>
          Budget {money(budget)}
          <input type="range" min="2500" max="25000" step="100" value={budget} onChange={(event) => setBudget(Number(event.target.value))} />
        </label>
        <label>
          Occasion
          <select value={occasion} onChange={(event) => setOccasion(event.target.value)}>
            {["Office", "Evening", "Weekend", "Celebration", "Travel", "Children"].map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <button className="btn dark" type="submit" disabled={building}>
          {building ? "Building..." : "Build"}
        </button>
      </form>
      {error && <p className="error">{error}</p>}
      {building && <Loading />}
      {result && (
        <div>
          <p className="notice">
            {result.note} Total {money(result.total)}. {money(result.remaining)} left unspent.
          </p>
          <div className="product-grid">
            {result.items.map((product) => (
              <article key={product.id} className="product-card">
                <Link to={`/product/${product.id}`} className="product-media">
                  <img src={product.image} alt={product.name} />
                  <span>{product.slot}</span>
                </Link>
                <div className="product-meta">
                  <Link to={`/product/${product.id}`}>{product.name}</Link>
                  <strong>{money(product.price)}</strong>
                </div>
              </article>
            ))}
          </div>
          {result.items.length > 0 && (
            <button type="button" className="btn solid" onClick={addAll}>
              Add this build to the bag
            </button>
          )}
        </div>
      )}
    </div>
  );
}
