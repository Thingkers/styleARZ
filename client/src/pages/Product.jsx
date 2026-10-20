import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import { money } from "../format";
import { defaultSize } from "../commerce";
import { useDocumentTitle } from "../hooks";
import { useShop } from "../context/ShopContext";
import ProductCard from "../components/ProductCard";
import { Loading, Modal } from "../components/ui";

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
  useDocumentTitle(data?.product?.name || "Piece");

  useEffect(() => {
    setData(null);
    setError("");
    setSize("");
    setColor("");
    setAdvice(null);
    api(`/api/products/${id}`)
      .then((payload) => {
        setData(payload);
        setColor(payload.product.colors[0]?.name || "");
        setSize(defaultSize(payload.product));
      })
      .catch((err) => setError(err.message));
  }, [id]);

  async function onFit(event) {
    event.preventDefault();
    try {
      const result = await api("/api/fit", { method: "POST", body: fit });
      setAdvice(result);
      if (data?.product.sizes.includes(result.size)) setSize(result.size);
    } catch (err) {
      setAdvice({ note: err.message });
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
          <img src={product.image} alt={product.name} />
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
          <p className={product.stock < 3 ? "warn" : "muted"}>
            {product.stock === 0 ? "Out of stock" : product.stock < 3 ? `Only ${product.stock} left` : "In stock"}
          </p>
          <div className="hero-actions">
            <button type="button" className="btn solid" onClick={onAdd} disabled={product.stock === 0}>
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
            <li>Occasions: {product.occasions.join(", ")}</li>
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
              ? "Children’s pieces are sized by age band, from 2–3Y to 10–12Y. The suggestion is an estimate — check the fit on the child."
              : "The recommendation is an estimate. It uses height and preferred fit, then you confirm the size."}
          </p>
          {product.audience === "Children" ? (
            <table className="size-table">
              <thead>
                <tr>
                  <th>Age</th>
                  <th>Height</th>
                  <th>Chest</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["2-3Y", "92–98 cm", "54"],
                  ["4-5Y", "104–110 cm", "58"],
                  ["6-7Y", "116–122 cm", "62"],
                  ["8-9Y", "128–134 cm", "68"],
                  ["10-12Y", "140–152 cm", "74"],
                ].map((row) => (
                  <tr key={row[0]}>
                    {row.map((cell) => (
                      <td key={cell}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
          <>
          <form className="stack" onSubmit={onFit}>
            <label>
              Height (cm)
              <input
                type="number"
                min="140"
                max="220"
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
                <th>Size</th>
                <th>Chest</th>
                <th>Waist</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["XS", "84", "66"],
                ["S", "88", "70"],
                ["M", "96", "78"],
                ["L", "104", "86"],
                ["XL", "112", "94"],
              ].map((row) => (
                <tr key={row[0]}>
                  {row.map((cell) => (
                    <td key={cell}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted">Measurements are in centimetres and describe the body, not the garment.</p>
          </>
          )}
        </Modal>
      )}
    </div>
  );
}
