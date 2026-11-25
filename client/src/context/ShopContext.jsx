import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import { useAuth } from "./AuthContext";

const ShopContext = createContext(null);
const GUEST_WISH_KEY = "sa-wish-guest";

function readStoredList(key) {
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
    if (!writeStoredList(CART_STORAGE_KEY, cart)) {
      setToast("Your bag changed, but this browser could not save it.");
    }
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

  function commitCart(next) {
    cartRef.current = next;
    setCart(next);
  }

  function addProductToCart(current, product, { size, color, qty = 1 }) {
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
    const next = current.slice();
    if (index >= 0) next[index] = { ...next[index], qty: existingQty + qty };
    else {
      next.push({
        productId: product.id,
        name: product.name,
        price: product.price,
        image: product.image,
        stock,
        size,
        color,
        qty,
      });
    }
    return next;
  }

  function addToCart(product, options) {
    const next = addProductToCart(cartRef.current, product, options);
    commitCart(next);
    setDrawer(true);
    notify(`${product.name} added to the bag.`);
  }

  function addManyToCart(entries) {
    let next = cartRef.current.slice();
    const added = [];
    const errors = [];
    entries.forEach(({ product, ...options }) => {
      try {
        next = addProductToCart(next, product, options);
        added.push(product.name);
      } catch (error) {
        errors.push(error.message || "A piece could not be added.");
      }
    });

    if (added.length > 0) {
      commitCart(next);
      setDrawer(true);
    }
    if (errors.length > 0) {
      notify(`${added.length ? `${added.length} pieces added. ` : ""}${errors.join(" ")}`);
    } else if (added.length === 1) {
      notify(`${added[0]} added to the bag.`);
    } else if (added.length > 1) {
      notify(`${added.length} pieces added to the bag.`);
    }
  }

  function updateQty(index, qty) {
    const current = cartRef.current;
    if (!Number.isInteger(index) || index < 0 || index >= current.length || !Number.isInteger(qty)) return;
    const next = current.slice();
    if (qty < 1) next.splice(index, 1);
    else {
      const maxQty = Math.min(
        MAX_CART_QUANTITY,
        Number.isFinite(current[index].stock) ? current[index].stock : MAX_CART_QUANTITY
      );
      if (maxQty < 1) next.splice(index, 1);
      else next[index] = { ...next[index], qty: Math.min(maxQty, qty) };
    }
    commitCart(next);
  }

  function removeFromCart(index) {
    commitCart(cartRef.current.filter((_, itemIndex) => itemIndex !== index));
  }

  function clearCart() {
    commitCart([]);
  }

  function updateCartPrices(products) {
    const pricesById = new Map(products.map((product) => [product.id, product.price]));
    commitCart(
      cartRef.current.map((item) =>
        pricesById.has(item.productId) ? { ...item, price: pricesById.get(item.productId) } : item
      )
    );
  }

  async function toggleWish(productId) {
    if (typeof productId !== "string" || productId.length === 0) {
      notify("Could not update wishlist: invalid product.");
      return;
    }
    const previous = wishlist;
    const next = wishlist.includes(productId)
      ? wishlist.filter((id) => id !== productId)
      : [...wishlist, productId];
    setWishlist(next);
    if (user) {
      try {
        const data = await api("/api/wishlist", { method: "PUT", body: { productIds: next } });
        if (!Array.isArray(data.productIds)) throw new Error("The server returned an invalid wishlist.");
        const savedIds = cleanProductIds(data.productIds);
        setWishlist(savedIds);
        notify(savedIds.includes(productId) ? "Saved to wishlist." : "Removed from wishlist.");
      } catch (error) {
        setWishlist(previous);
        notify(error.message || "Could not update wishlist.");
      }
    } else {
      if (!writeStoredList(GUEST_WISHLIST_STORAGE_KEY, next)) {
        setWishlist(previous);
        notify("Could not save your wishlist in this browser.");
        return;
      }
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
      addManyToCart,
      updateQty,
      removeFromCart,
      clearCart,
      updateCartPrices,
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
