import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api";
import { useDocumentTitle } from "../hooks";
import ProductCard from "../components/ProductCard";
import { CategoryGlyph, categoriesMatch } from "../components/CategoryIcons";
import { Empty, Loading, PageHeader } from "../components/ui";
import {
  CATEGORY_AUDIENCE_RULES,
  allowedAudiencesForCategory,
  categoriesForAudience,
} from "./admin/inventoryUtils";

export default function Shop() {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") || "";
  const category = params.get("category") || "";
  const occasion = params.get("occasion") || "";
  const audience = params.get("audience") || "";
  const [products, setProducts] = useState([]);
  const [meta, setMeta] = useState({
    categories: [],
    occasions: [],
    audiences: ["Men", "Women", "Children"],
    rules: CATEGORY_AUDIENCE_RULES,
  });
  const [sort, setSort] = useState("featured");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useDocumentTitle(q ? `Search · ${q}` : "Shop");

  const rules = meta.rules || CATEGORY_AUDIENCE_RULES;
  const audienceOptions = useMemo(() => {
    const base = (meta.audiences || ["Men", "Women", "Children"]).filter((item) => item !== "Unisex");
    if (!category) return base;
    const allowed = allowedAudiencesForCategory(category, rules);
    return base.filter((item) => allowed.includes(item));
  }, [meta.audiences, category, rules]);

  const categoryOptions = useMemo(() => {
    const list = meta.categories || [];
    if (!audience) return list;
    return categoriesForAudience(list, audience, rules);
  }, [meta.categories, audience, rules]);

  // Drop meaningless pairs from the URL (e.g. Saree + Men, Panjabi + Women).
  useEffect(() => {
    if (!category || !audience) return;
    const allowed = allowedAudiencesForCategory(category, rules);
    if (allowed.includes(audience)) return;
    const next = new URLSearchParams(params);
    next.delete("audience");
    setParams(next, { replace: true });
  }, [category, audience, rules, params, setParams]);

  useEffect(() => {
    setLoading(true);
    const query = new URLSearchParams();
    if (q) query.set("q", q);
    if (category) query.set("category", category);
    if (occasion) query.set("occasion", occasion);
    const effectiveAudience =
      category && audience && !allowedAudiencesForCategory(category, rules).includes(audience)
        ? ""
        : audience;
    if (effectiveAudience) query.set("audience", effectiveAudience);
    api(`/api/products?${query.toString()}`)
      .then((data) => setProducts(data.products))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [q, category, occasion, audience, rules]);

  useEffect(() => {
    api("/api/meta")
      .then((data) => setMeta({ ...data, rules: data.rules || CATEGORY_AUDIENCE_RULES }))
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

    if (key === "category") {
      const nextCategory = value || "";
      const currentAudience = next.get("audience") || "";
      if (nextCategory && currentAudience) {
        const allowed = allowedAudiencesForCategory(nextCategory, rules);
        if (!allowed.includes(currentAudience)) next.delete("audience");
      }
    }

    if (key === "audience") {
      const nextAudience = value || "";
      const currentCategory = next.get("category") || "";
      if (nextAudience && currentCategory) {
        const allowedCats = categoriesForAudience(meta.categories || [], nextAudience, rules);
        const stillOk = allowedCats.some(
          (entry) => entry === currentCategory || categoriesMatch(currentCategory, entry)
        );
        if (!stillOk) next.delete("category");
      }
    }

    setParams(next);
  }

  const activeAudience = audienceOptions.includes(audience) ? audience : "";

  return (
    <div className="page wrap">
      <PageHeader
        kicker={q ? "Search results" : "Shop"}
        title={q ? `Results for “${q}”` : activeAudience ? `${activeAudience}'s collection` : "The edit"}
        lede="Grade A export pieces for men, women, and children. Finished in Bangladesh, priced in taka."
      />
      <div className="filters">
        <div className="pills" role="tablist" aria-label="Collections">
          <button type="button" className={!activeAudience ? "on" : ""} onClick={() => setFilter("audience", "")}>
            All collections
          </button>
          {audienceOptions.map((item) => (
            <button
              key={item}
              type="button"
              className={activeAudience === item ? "on" : ""}
              onClick={() => setFilter("audience", item)}
            >
              {item}
            </button>
          ))}
        </div>
        <div className="category-filter" role="tablist" aria-label="Categories">
          <button type="button" className={`category-filter-btn ${!category ? "on" : ""}`} onClick={() => setFilter("category", "")}>
            <span className="category-filter-all">All</span>
          </button>
          {categoryOptions.map((item) => (
            <button
              key={item}
              type="button"
              className={`category-filter-btn ${category === item || categoriesMatch(category, item) ? "on" : ""}`}
              onClick={() => setFilter("category", item)}
            >
              <CategoryGlyph name={item} />
              <span>{item}</span>
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
