import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import { money } from "../format";
import { defaultSize } from "../commerce";
import { useDocumentTitle } from "../hooks";
import { useShop } from "../context/ShopContext";
import ProductCard from "../components/ProductCard";
import { Loading, Modal } from "../components/ui";

const ADULT_SIZES = ["XS", "S", "M", "L", "XL", "XXL"];
const CHILD_SIZES = [
  { size: "2-3Y", height: "92–98 cm", maxHeight: 98 },
  { size: "4-5Y", height: "104–110 cm", maxHeight: 110 },
  { size: "6-7Y", height: "116–122 cm", maxHeight: 122 },
  { size: "8-9Y", height: "128–134 cm", maxHeight: 134 },
  { size: "10-12Y", height: "140–152 cm", maxHeight: 152 },
];

function closestAvailableSize(suggestedSize, sizes, sizeOrder) {
  if (sizes.includes(suggestedSize)) return suggestedSize;
  const suggestedIndex = sizeOrder.indexOf(suggestedSize);
  if (suggestedIndex < 0) return "";
  return sizes
    .map((size) => ({ size, index: sizeOrder.indexOf(size) }))
    .filter((entry) => entry.index >= 0)
    .sort((a, b) => Math.abs(a.index - suggestedIndex) - Math.abs(b.index - suggestedIndex))[0]?.size || "";
}

function normalizeProductPayload(payload) {
  if (!payload?.product || typeof payload.product !== "object") {
    throw new Error("The server returned invalid product data.");
  }
  const product = payload.product;
  return {
    product: {
      ...product,
      name: typeof product.name === "string" ? product.name : "Product",
      category: typeof product.category === "string" ? product.category : "",
      description: typeof product.description === "string" ? product.description : "",
      colors: Array.isArray(product.colors)
        ? product.colors.filter((color) => color && typeof color.name === "string")
        : [],
      sizes: Array.isArray(product.sizes) ? product.sizes.filter((size) => typeof size === "string") : [],
      details: Array.isArray(product.details) ? product.details.filter((detail) => typeof detail === "string") : [],
      occasions: Array.isArray(product.occasions)
        ? product.occasions.filter((occasion) => typeof occasion === "string")
        : [],
    },
    related: Array.isArray(payload.related) ? payload.related.filter((item) => item && item.id) : [],
  };
}

export default function Product() {
  const { id } = useParams();
  const { addToCart, wishlist, toggleWish, notify } = useShop();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [size, setSize] = useState("");
  const [color, setColor] = useState("");
  const [guide, setGuide] = useState(false);
  const [fit, setFit] = useState({ height: "172", fit: "mixed" });
  const [advice, setAdvice] = useState(null);
  const [fitLoading, setFitLoading] = useState(false);
  const fitRequestId = useRef(0);
  useDocumentTitle(data?.product?.name || "Piece");

  useEffect(() => {
    let active = true;
    fitRequestId.current += 1;
    setData(null);
    setError("");
    setSize("");
    setColor("");
    setAdvice(null);
    setFitLoading(false);
    api(`/api/products/${id}`)
      .then((payload) => {
        if (!active) return;
        const normalized = normalizeProductPayload(payload);
        setData(normalized);
        setColor(normalized.product.colors[0]?.name || "");
        setSize(defaultSize(normalized.product));
        setFit((current) => ({
          ...current,
          height: normalized.product.audience === "Children" ? "110" : "172",
        }));
      })
      .catch((err) => {
        if (active) setError(err.message);
      });
    return () => {
      active = false;
    };
  }, [id]);

  async function onFit(event) {
    event.preventDefault();
    const requestId = fitRequestId.current;
    const height = Number(fit.height);
    const isChildren = data?.product.audience === "Children";
    const minHeight = isChildren ? 92 : 140;
    const maxHeight = isChildren ? 152 : 220;
    if (!Number.isInteger(height) || height < minHeight || height > maxHeight) {
      setAdvice({ note: `Enter a height between ${minHeight} and ${maxHeight} cm.` });
      return;
    }

    if (isChildren) {
      const ageBand = CHILD_SIZES.find((entry) => height <= entry.maxHeight) || CHILD_SIZES[CHILD_SIZES.length - 1];
      const suggestedSize = closestAvailableSize(ageBand.size, data.product.sizes, CHILD_SIZES.map((entry) => entry.size));
      setAdvice({
        size: suggestedSize || undefined,
        note: suggestedSize
          ? `Based on height, ${ageBand.size} is the estimate${suggestedSize !== ageBand.size ? `; ${suggestedSize} is the closest size available for this piece` : ""}. Please check the fit on the child.`
          : `The estimated size is ${ageBand.size}, which is not available for this piece.`,
      });
      if (suggestedSize) setSize(suggestedSize);
      return;
    }

    setFitLoading(true);
    try {
      const result = await api("/api/fit", { method: "POST", body: fit });
      if (requestId !== fitRequestId.current) return;
      const suggestedSize = closestAvailableSize(result.size, data.product.sizes, ADULT_SIZES);
      setAdvice({
        size: suggestedSize || result.size,
        note: suggestedSize
          ? `${result.note}${suggestedSize !== result.size ? ` The closest available size for this piece is ${suggestedSize}.` : ""}`
          : `${result.note} This suggested size is not available for this piece.`,
      });
      if (suggestedSize) setSize(suggestedSize);
    } catch (err) {
      if (requestId === fitRequestId.current) setAdvice({ note: err.message });
    } finally {
      if (requestId === fitRequestId.current) setFitLoading(false);
    }
  }

  function onAdd() {
    try {
      addToCart(data.product, { size, color, qty: 1 });
    } catch (err) {
      notify(err.message);
    }
  }

  if (error) {
    return (
      <div className="page wrap">
        <p className="error">{error}</p>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="page wrap">
        <Loading />
      </div>
    );
  }

  const { product, related } = data;
  const saved = wishlist.includes(product.id);
  const stockAvailable = Number.isFinite(product.stock) && product.stock >= 0;
  const inStock = stockAvailable && product.stock > 0;

  return (
    <div className="page wrap">
      <p className="crumbs">
        <Link to="/shop">Shop</Link>
        <span>/</span>
        <Link to={`/shop?category=${encodeURIComponent(product.category)}`}>{product.category}</Link>
        <span>/</span>
        {product.name}
      </p>
      <div className="pdp">
        <div className="gallery">
          <img src={product.image || ""} alt={product.name} />
        </div>
        <div className="buybox">
          <p className="kicker">{product.category}</p>
          <h1>{product.name}</h1>
          <p className="grade">Grade A · {product.audience} · Finished in Bangladesh</p>
          <p className="price">{money(product.price)}</p>
          <p className="lede">{product.description}</p>
          <div className="buy-block">
            <p>Colour</p>
            <div className="swatch-row">
              {product.colors.map((item) => (
                <button
                  key={item.name}
                  type="button"
                  className={color === item.name ? "on" : ""}
                  onClick={() => setColor(item.name)}
                >
                  <i style={{ background: item.hex }} />
                  {item.name}
                </button>
              ))}
            </div>
          </div>
          <div className="buy-block">
            <div className="row-between">
              <p>Size</p>
              <button type="button" className="text-link" onClick={() => setGuide(true)}>
                Size & fit assistant
              </button>
            </div>
            <div className="size-row">
              {product.sizes.map((item) => (
                <button key={item} type="button" className={size === item ? "on" : ""} onClick={() => setSize(item)}>
                  {item}
                </button>
              ))}
            </div>
          </div>
          <p className={!stockAvailable || product.stock < 3 ? "warn" : "muted"}>
            {!stockAvailable
              ? "Stock unavailable"
              : product.stock === 0
                ? "Out of stock"
                : product.stock < 3
                  ? `Only ${product.stock} left`
                  : "In stock"}
          </p>
          <div className="hero-actions">
            <button type="button" className="btn solid" onClick={onAdd} disabled={!inStock}>
              Add to bag
            </button>
            <button type="button" className="btn line" onClick={() => toggleWish(product.id)}>
              {saved ? "Saved" : "Save"}
            </button>
          </div>
          <ul className="details">
            {product.details.map((detail) => (
              <li key={detail}>{detail}</li>
            ))}
            {product.occasions.length > 0 && <li>Occasions: {product.occasions.join(", ")}</li>}
          </ul>
        </div>
      </div>
      {related.length > 0 && (
        <section>
          <div className="section-head">
            <h2>Worn with</h2>
          </div>
          <div className="product-grid">
            {related.map((item) => (
              <ProductCard key={item.id} product={item} />
            ))}
          </div>
        </section>
      )}
      {guide && (
        <Modal title="Smart size & fit" onClose={() => setGuide(false)}>
          <p className="lede">
            {product.audience === "Children"
              ? "Enter the child’s height for an age-band estimate. The suggested size is matched to the sizes available for this piece."
              : "The recommendation is an estimate based on height and fit preference, matched to the sizes available for this piece."}
          </p>
          {product.audience === "Children" ? (
            <>
              <form className="stack" onSubmit={onFit}>
                <label>
                  Child’s height (cm)
                  <input
                    type="number"
                    min="92"
                    max="152"
                    step="1"
                    required
                    value={fit.height}
                    onChange={(event) => setFit({ ...fit, height: event.target.value })}
                  />
                </label>
                <button className="btn dark" type="submit">
                  Suggest a size
                </button>
              </form>
              {advice && (
                <div className="notice">
                  {advice.size && <strong>Suggested size {advice.size}</strong>}
                  <p>{advice.note}</p>
                </div>
              )}
              <table className="size-table">
                <thead>
                  <tr>
                    <th>Age</th>
                    <th>Height</th>
                    <th>Size availability</th>
                  </tr>
                </thead>
                <tbody>
                  {CHILD_SIZES.map((entry) => (
                    <tr key={entry.size}>
                      <td>{entry.size}</td>
                      <td>{entry.height}</td>
                      <td>{product.sizes.includes(entry.size) ? entry.size : "Unavailable"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : (
            <>
              <form className="stack" onSubmit={onFit}>
                <label>
                  Height (cm)
                  <input
                    type="number"
                    min="140"
                    max="220"
                    step="1"
                    required
                    value={fit.height}
                    onChange={(event) => setFit({ ...fit, height: event.target.value })}
                  />
                </label>
                <label>
                  Fit preference
                  <select value={fit.fit} onChange={(event) => setFit({ ...fit, fit: event.target.value })}>
                    <option value="tailored">Tailored</option>
                    <option value="mixed">Mixed</option>
                    <option value="relaxed">Relaxed</option>
                  </select>
                </label>
                <button className="btn dark" type="submit" disabled={fitLoading}>
                  {fitLoading ? "Suggesting…" : "Suggest a size"}
                </button>
              </form>
              {advice && (
                <div className="notice">
                  {advice.size && <strong>Suggested size {advice.size}</strong>}
                  <p>{advice.note}</p>
                </div>
              )}
              <p className="muted">
                This product’s size measurements are not available. Use this estimate as a guide and confirm the size above.
              </p>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
