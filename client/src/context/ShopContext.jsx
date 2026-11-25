import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { useAuth } from "./AuthContext";

const ShopContext = createContext(null);
const GUEST_WISH_KEY = "sa-wish-guest";

function readList(key) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function wishKeyFor(userId) {
  return userId ? `sa-wish:${userId}` : GUEST_WISH_KEY;
}

export function ShopProvider({ children }) {
  const { user } = useAuth();
  const [cart, setCart] = useState(() => readList("sa-cart"));
  const [wishlist, setWishlist] = useState(() => readList(GUEST_WISH_KEY));
  const [drawer, setDrawer] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    localStorage.setItem("sa-cart", JSON.stringify(cart));
  }, [cart]);

  useEffect(() => {
    localStorage.setItem(wishKeyFor(user?.id), JSON.stringify(wishlist));
  }, [wishlist, user?.id]);

  // Load the signed-in account wishlist (replace — never merge another user's device list).
  useEffect(() => {
    if (!user) {
      setWishlist(readList(GUEST_WISH_KEY));
      return;
    }
    let cancelled = false;
    const cached = readList(wishKeyFor(user.id));
    const serverList = Array.isArray(user.wishlist) ? user.wishlist : [];
    setWishlist(serverList.length ? serverList : cached);
    api("/api/wishlist")
      .then((data) => {
        if (cancelled) return;
        const ids = Array.isArray(data.productIds) ? data.productIds : serverList;
        setWishlist(ids);
        localStorage.setItem(wishKeyFor(user.id), JSON.stringify(ids));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
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
    const available =
      product.sizeStock && product.sizeStock[size] !== undefined
        ? Number(product.sizeStock[size]) || 0
        : product.stock;
    if (available < 1) throw new Error("This piece is currently out of stock.");
    const index = cart.findIndex(
      (item) => item.productId === product.id && item.size === size && item.color === color
    );
    const existingQty = index >= 0 ? cart[index].qty : 0;
    if (existingQty + qty > available) {
      throw new Error(`Only ${available} available in size ${size}.`);
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
    const previous = wishlist;
    const next = wishlist.includes(productId)
      ? wishlist.filter((id) => id !== productId)
      : [...wishlist, productId];
    setWishlist(next);
    if (user) {
      try {
        const data = await api("/api/wishlist", { method: "PUT", body: { productIds: next } });
        setWishlist(data.productIds);
        notify(data.productIds.includes(productId) ? "Saved to wishlist." : "Removed from wishlist.");
      } catch (error) {
        setWishlist(previous);
        notify(error.message || "Could not update wishlist.");
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
    [cart, wishlist, drawer, toast, count, subtotal]
  );

  return <ShopContext.Provider value={value}>{children}</ShopContext.Provider>;
}

export function useShop() {
  return useContext(ShopContext);
}
