import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api";
import { useDocumentTitle } from "../hooks";
import ProductCard from "../components/ProductCard";
import { Empty, Loading, PageHeader } from "../components/ui";

export default function Shop() {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") || "";
  const category = params.get("category") || "";
  const occasion = params.get("occasion") || "";
  const audience = params.get("audience") || "";
  const [products, setProducts] = useState([]);
  const [meta, setMeta] = useState({ categories: [], occasions: [], audiences: ["Men", "Women", "Children"] });
  const [sort, setSort] = useState("featured");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useDocumentTitle(q ? `Search · ${q}` : "Shop");

  useEffect(() => {
    setLoading(true);
    const query = new URLSearchParams();
    if (q) query.set("q", q);
    if (category) query.set("category", category);
    if (occasion) query.set("occasion", occasion);
    if (audience) query.set("audience", audience);
    api(`/api/products?${query.toString()}`)
      .then((data) => setProducts(data.products))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [q, category, occasion, audience]);

  useEffect(() => {
    api("/api/meta")
      .then(setMeta)
      .catch(() => {});
  }, []);

  const visible = useMemo(() => {
    const next = products.slice();
    if (sort === "price-asc") next.sort((a, b) => a.price - b.price);
    if (sort === "price-desc") next.sort((a, b) => b.price - a.price);
    if (sort === "name") next.sort((a, b) => a.name.localeCompare(b.name));
    return next;
  }, [products, sort]);

  function setFilter(key, value) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next);
  }

  return (
    <div className="page wrap">
      <PageHeader
        kicker={q ? "Search results" : "Shop"}
        title={q ? `Results for “${q}”` : audience ? `${audience}'s collection` : "The edit"}
        lede="Grade A export pieces for men, women, and children. Finished in Bangladesh, priced in taka."
      />
      <div className="filters">
        <div className="pills" role="tablist" aria-label="Collections">
          <button type="button" className={!audience ? "on" : ""} onClick={() => setFilter("audience", "")}>
            All collections
          </button>
          {(meta.audiences || ["Men", "Women", "Children"]).map((item) => (
            <button
              key={item}
              type="button"
              className={audience === item ? "on" : ""}
              onClick={() => setFilter("audience", item)}
            >
              {item}
            </button>
          ))}
        </div>
        <div className="pills" role="tablist" aria-label="Categories">
          <button type="button" className={!category ? "on" : ""} onClick={() => setFilter("category", "")}>
            All
          </button>
          {meta.categories.map((item) => (
            <button
              key={item}
              type="button"
              className={category === item ? "on" : ""}
              onClick={() => setFilter("category", item)}
            >
              {item}
            </button>
          ))}
        </div>
        <div className="filter-row">
          <label>
            Occasion
            <select value={occasion} onChange={(event) => setFilter("occasion", event.target.value)}>
              <option value="">Any</option>
              {meta.occasions.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label>
            Sort
            <select value={sort} onChange={(event) => setSort(event.target.value)}>
              <option value="featured">Featured</option>
              <option value="price-asc">Price, low to high</option>
              <option value="price-desc">Price, high to low</option>
              <option value="name">Name</option>
            </select>
          </label>
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      {loading && <Loading />}
      {!loading && visible.length === 0 && (
        <Empty title="Nothing matches" text="Try another category, or clear the search." />
      )}
      <div className="product-grid">
        {visible.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </div>
  );
}
