import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { money } from "../format";
import { useShop } from "../context/ShopContext";

export default function ProductCard({ product }) {
  const { wishlist, toggleWish } = useShop();
  const [imageSrc, setImageSrc] = useState(product.image || "/images/studio-table.jpg");
  const [wishBusy, setWishBusy] = useState(false);
  const wishPending = useRef(false);
  const saved = wishlist.includes(product.id);

  async function onToggleWish() {
    if (wishPending.current) return;
    wishPending.current = true;
    setWishBusy(true);
    try {
      await toggleWish(product.id);
    } finally {
      wishPending.current = false;
      setWishBusy(false);
    }
  }

  return (
    <article className="product-card">
      <Link to={`/product/${product.id}`} className="product-media">
        <img
          src={imageSrc}
          alt={product.name}
          onError={() => setImageSrc("/images/studio-table.jpg")}
        />
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
            aria-pressed={saved}
            disabled={wishBusy}
            onClick={onToggleWish}
          >
            {saved ? "♥" : "♡"}
          </button>
        </div>
      </div>
    </article>
  );
}
