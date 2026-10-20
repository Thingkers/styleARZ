import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { money } from "../format";
import { defaultSize } from "../commerce";
import { useDocumentTitle } from "../hooks";
import { useAuth } from "../context/AuthContext";
import { useShop } from "../context/ShopContext";
import { PALETTE, compareColours } from "../palette";
import { PageHeader } from "../components/ui";

const SLOTS = [
  { id: "layer", label: "Layer" },
  { id: "top", label: "Top" },
  { id: "bottom", label: "Bottom" },
  { id: "dress", label: "Dress" },
  { id: "shoes", label: "Shoes" },
  { id: "accessory", label: "Accessory" },
];

export function Studio() {
  useDocumentTitle("Style Studio");
  const { user } = useAuth();
  const { addToCart, notify } = useShop();
  const [params] = useSearchParams();
  const [products, setProducts] = useState([]);
  const [wardrobe, setWardrobe] = useState([]);
  const [active, setActive] = useState("top");
  const [slots, setSlots] = useState({});
  const [name, setName] = useState("Untitled look");

  useEffect(() => {
    api("/api/products").then((data) => setProducts(data.products));
    const lookId = params.get("look");
    if (lookId) {
      api(`/api/looks/${lookId}`).then((data) => {
        const next = {};
        data.products.forEach((product) => {
          next[product.slot] = product.id;
        });
        setSlots(next);
        setName(data.look.name);
      });
    }
  }, [params]);

  useEffect(() => {
    if (!user) {
      setWardrobe([]);
      return;
    }
    api("/api/wardrobe")
      .then((data) => setWardrobe(data.items))
      .catch(() => {});
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
  const options = products.filter((product) => product.slot === active);

  function choose(id) {
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
    chosen
      .filter((entry) => !entry.owned)
      .forEach((entry) => {
        try {
          addToCart(entry.item, {
            size: defaultSize(entry.item),
            color: entry.item.colors[0].name,
            qty: 1,
          });
        } catch (err) {
          notify(err.message);
        }
      });
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
      <div className="studio">
        <div className="board">
          <label>
            Look name
            <input value={name} onChange={(event) => setName(event.target.value)} />
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
          <div className="picker">
            {wardrobe
              .filter((item) => item.category.toLowerCase().includes(active === "layer" ? "outer" : active) || matchWardrobe(item, active))
              .map((item) => (
                <button key={item.id} type="button" className={slots[active] === item.id ? "on owned" : "owned"} onClick={() => choose(item.id)}>
                  <i style={{ background: item.hex }} />
                  <span>{item.name}</span>
                  <em>Yours</em>
                </button>
              ))}
            {options.map((product) => (
              <button key={product.id} type="button" className={slots[active] === product.id ? "on" : ""} onClick={() => choose(product.id)}>
                <img src={product.image} alt="" />
                <span>{product.name}</span>
                <em>{money(product.price)}</em>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function matchWardrobe(item, slot) {
  const category = item.category.toLowerCase();
  if (slot === "layer") return category.includes("outer") || category.includes("tailor");
  if (slot === "top") return category.includes("shirt") || category.includes("knit");
  if (slot === "bottom") return category.includes("trouser") || category.includes("jean");
  if (slot === "shoes") return category.includes("foot") || category.includes("shoe");
  if (slot === "accessory") return category.includes("access");
  return false;
}

export function ColourMatch() {
  useDocumentTitle("Colour match");
  const [params] = useSearchParams();
  const initialA = PALETTE.find((color) => color.name === params.get("a")) || PALETTE[0];
  const initialB = PALETTE.find((color) => color.name === params.get("b")) || PALETTE[4];
  const [a, setA] = useState(initialA);
  const [b, setB] = useState(initialB);
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
        <Palette label="First tone" value={a} onChange={setA} />
        <Palette label="Second tone" value={b} onChange={setB} />
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
  const { addToCart, notify } = useShop();
  const [budget, setBudget] = useState(15000);
  const [occasion, setOccasion] = useState("Office");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  async function build(event) {
    event?.preventDefault();
    setError("");
    try {
      const data = await api("/api/studio/budget", { method: "POST", body: { budget, occasion } });
      setResult(data);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    build();
    // Initial suggestion for the default budget.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function addAll() {
    result?.items.forEach((product) => {
      try {
        addToCart(product, {
          size: defaultSize(product),
          color: product.colors[0].name,
          qty: 1,
        });
      } catch (err) {
        notify(err.message);
      }
    });
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
        <button className="btn dark" type="submit">Build</button>
      </form>
      {error && <p className="error">{error}</p>}
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
