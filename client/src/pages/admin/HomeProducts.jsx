import { useEffect, useState } from "react";
import { api } from "../../api";
import { Loading } from "../../components/ui";
import ItemPhoto from "./ItemPhoto";

const AUDIENCES = ["Women", "Men", "Children", "Unisex"];

export default function HomeProducts() {
  const [products, setProducts] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [audience, setAudience] = useState("Unisex");
  const [description, setDescription] = useState("");
  const [photo, setPhoto] = useState("");

  function load() {
    api("/api/admin/home-products")
      .then((data) => {
        setProducts(data.products || []);
        setError("");
      })
      .catch((err) => setError(err.message || "Could not load home products."));
  }

  useEffect(() => {
    load();
  }, []);

  async function createProduct(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api("/api/admin/home-products", {
        method: "POST",
        body: {
          name,
          audience,
          description,
          image: photo,
          featured: true,
        },
      });
      setName("");
      setDescription("");
      setPhoto("");
      setAudience("Unisex");
      setNotice("Home image product added. It shows on the homepage when Featured is on.");
      load();
    } catch (err) {
      setError(err.message || "Could not add home product.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleFeatured(product, featured) {
    setError("");
    try {
      await api(`/api/admin/products/${product.id}`, { method: "PATCH", body: { featured } });
      setProducts((current) =>
        (current || []).map((entry) => (entry.id === product.id ? { ...entry, featured } : entry))
      );
    } catch (err) {
      setError(err.message || "Could not update featured.");
    }
  }

  async function remove(product) {
    if (!window.confirm(`Delete homepage image “${product.name}”?`)) return;
    setError("");
    try {
      await api(`/api/admin/home-products/${product.id}`, { method: "DELETE" });
      setProducts((current) => (current || []).filter((entry) => entry.id !== product.id));
      setNotice("Home product deleted.");
    } catch (err) {
      setError(err.message || "Could not delete.");
    }
  }

  if (!products && !error) return <Loading />;

  return (
    <div className="home-products-admin">
      <div className="inv-flow-head">
        <div>
          <h2>Home page products</h2>
          <p className="muted">
            Image-only looks for the homepage. These are <strong>not real inventory</strong> and are never imported to
            POS. Use Inventory for sellable floor stock.
          </p>
        </div>
      </div>

      {error && <p className="error">{error}</p>}
      {notice && <p className="notice">{notice}</p>}

      <form className="home-products-create" onSubmit={createProduct}>
        <h3>Add homepage image</h3>
        <ItemPhoto
          src={photo}
          onChange={setPhoto}
          onRemove={() => setPhoto("")}
          note="Upload the look photo used on the homepage. This does not create inventory stock."
        />
        <label>
          Name
          <input value={name} onChange={(event) => setName(event.target.value)} required minLength={2} maxLength={80} />
        </label>
        <label>
          Collection
          <select value={audience} onChange={(event) => setAudience(event.target.value)}>
            {AUDIENCES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label>
          Caption (optional)
          <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={2} maxLength={400} />
        </label>
        <button className="btn solid" type="submit" disabled={busy || !photo || name.trim().length < 2}>
          {busy ? "Adding…" : "Add to homepage products"}
        </button>
      </form>

      {!products?.length ? (
        <p className="muted">No homepage image products yet.</p>
      ) : (
        <ul className="admin-products catalog-order-grid">
          {products.map((product) => (
            <li key={product.id}>
              <div className="catalog-card-media">
                <img src={product.image} alt="" />
              </div>
              <div className="catalog-card-body">
                <strong>{product.name}</strong>
                <p className="muted">{product.audience} · Image only</p>
                <label className="admin-toggle catalog-featured">
                  <span>Featured on home</span>
                  <input
                    type="checkbox"
                    role="switch"
                    checked={Boolean(product.featured)}
                    onChange={(event) => toggleFeatured(product, event.target.checked)}
                  />
                </label>
                <button type="button" className="text-link inv-danger" onClick={() => remove(product)}>
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
