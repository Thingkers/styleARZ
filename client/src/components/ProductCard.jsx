import { Link } from "react-router-dom";
import { money } from "../format";
import { useShop } from "../context/ShopContext";

export default function ProductCard({ product }) {
  const { wishlist, toggleWish } = useShop();
  const saved = wishlist.includes(product.id);
  return (
    <article className="product-card">
      <Link to={`/product/${product.id}`} className="product-media">
        <img src={product.image} alt={product.name} />
        <span>{product.audience} · {product.category}</span>
      </Link>
      <div className="product-meta">
        <div>
          <Link to={`/product/${product.id}`}>{product.name}</Link>
          <p>{product.colors.map((color) => color.name).join(" · ")}</p>
        </div>
        <div className="product-side">
          <strong>{money(product.price)}</strong>
          <button
            type="button"
            className={`icon-btn wish ${saved ? "on" : ""}`}
            aria-label={saved ? "Remove from wishlist" : "Save to wishlist"}
            onClick={() => toggleWish(product.id)}
          >
            {saved ? "♥" : "♡"}
          </button>
        </div>
      </div>
    </article>
  );
}
