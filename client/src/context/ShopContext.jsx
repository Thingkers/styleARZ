import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { useAuth } from "./AuthContext";

const ShopContext = createContext(null);

function readList(key) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function ShopProvider({ children }) {
  const { user } = useAuth();
  const [cart, setCart] = useState(() => readList("sa-cart"));
  const [wishlist, setWishlist] = useState(() => readList("sa-wish"));
  const [drawer, setDrawer] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    localStorage.setItem("sa-cart", JSON.stringify(cart));
  }, [cart]);

  useEffect(() => {
    localStorage.setItem("sa-wish", JSON.stringify(wishlist));
  }, [wishlist]);

  useEffect(() => {
    if (!user) return;
    const merged = [...new Set([...(user.wishlist || []), ...wishlist])];
    setWishlist(merged);
    api("/api/wishlist", { method: "PUT", body: { productIds: merged } }).catch(() => {});
    // Merge once when the signed-in account changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2800);
    return () => clearTimeout(timer);
  }, [toast]);

  function notify(message) {
    setToast(message);
  }

  function addToCart(product, { size, color, qty = 1 }) {
    if (!size || !color) throw new Error("Choose a size and a colour.");
    if (product.stock < 1) throw new Error("This piece is currently out of stock.");
    const index = cart.findIndex(
      (item) => item.productId === product.id && item.size === size && item.color === color
    );
    const existingQty = index >= 0 ? cart[index].qty : 0;
    if (existingQty + qty > product.stock) {
      throw new Error(`Only ${product.stock} available.`);
    }
    const next = cart.slice();
    if (index >= 0) next[index] = { ...next[index], qty: existingQty + qty };
    else {
      next.push({
        productId: product.id,
        name: product.name,
        price: product.price,
        image: product.image,
        size,
        color,
        qty,
      });
    }
    setCart(next);
    setDrawer(true);
    notify(`${product.name} added to the bag.`);
  }

  function updateQty(index, qty) {
    setCart((current) => {
      const next = current.slice();
      if (qty < 1) next.splice(index, 1);
      else next[index] = { ...next[index], qty };
      return next;
    });
  }

  function removeFromCart(index) {
    setCart((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  function clearCart() {
    setCart([]);
  }

  async function toggleWish(productId) {
    const next = wishlist.includes(productId)
      ? wishlist.filter((id) => id !== productId)
      : [...wishlist, productId];
    setWishlist(next);
    if (user) {
      try {
        const data = await api("/api/wishlist", { method: "PUT", body: { productIds: next } });
        setWishlist(data.productIds);
      } catch (error) {
        notify(error.message);
      }
    } else {
      notify(next.includes(productId) ? "Saved on this device. Sign in to sync." : "Removed from wishlist.");
    }
  }

  const count = cart.reduce((sum, item) => sum + item.qty, 0);
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);

  const value = useMemo(
    () => ({
      cart,
      wishlist,
      drawer,
      setDrawer,
      toast,
      notify,
      addToCart,
      updateQty,
      removeFromCart,
      clearCart,
      toggleWish,
      count,
      subtotal,
    }),
    [cart, wishlist, drawer, toast, count, subtotal, user]
  );

  return <ShopContext.Provider value={value}>{children}</ShopContext.Provider>;
}

export function useShop() {
  return useContext(ShopContext);
}
