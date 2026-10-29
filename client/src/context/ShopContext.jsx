import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { useAuth } from "./AuthContext";

const ShopContext = createContext(null);
const CART_STORAGE_KEY = "sa-cart";
const GUEST_WISHLIST_STORAGE_KEY = "sa-wish:guest";
const MAX_CART_QUANTITY = 5;

function readStoredList(key) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeStoredList(key, items) {
  try {
    localStorage.setItem(key, JSON.stringify(items));
    return true;
  } catch {
    return false;
  }
}

function removeStoredList(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    return false;
  }
  return true;
}

function readCart() {
  return readStoredList(CART_STORAGE_KEY).filter(
    (item) =>
      item &&
      typeof item.productId === "string" &&
      typeof item.name === "string" &&
      typeof item.price === "number" &&
      Number.isFinite(item.price) &&
      item.price >= 0 &&
      typeof item.size === "string" &&
      typeof item.color === "string" &&
      Number.isInteger(item.qty) &&
      item.qty > 0
  ).map((item) => ({
    ...item,
    stock: Number.isFinite(item.stock) && item.stock >= 1 ? item.stock : MAX_CART_QUANTITY,
    qty: Math.min(item.qty, MAX_CART_QUANTITY),
  }));
}

function cleanProductIds(ids) {
  return [...new Set((Array.isArray(ids) ? ids : []).filter(
    (productId) => typeof productId === "string" && productId.length > 0
  ))];
}

function readGuestWishlist() {
  try {
    return cleanProductIds(readStoredList(GUEST_WISHLIST_STORAGE_KEY));
  } catch {
    return [];
  }
}

export function ShopProvider({ children }) {
  const { user, ready: authReady } = useAuth();
  const [cart, setCart] = useState(readCart);
  const [wishlist, setWishlist] = useState(() => cleanProductIds(readStoredList(GUEST_WISHLIST_STORAGE_KEY)));
  const [drawer, setDrawer] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (!writeStoredList(CART_STORAGE_KEY, cart)) {
      setToast("Your bag changed, but this browser could not save it.");
    }
  }, [cart]);

  useEffect(() => {
    if (!authReady) return undefined;

    let active = true;
    if (!user) {
      setWishlist(readGuestWishlist());
      return () => {
        active = false;
      };
    }

    const guestWishlist = cleanProductIds(readStoredList(GUEST_WISHLIST_STORAGE_KEY));
    const merged = cleanProductIds([...(user.wishlist || []), ...guestWishlist]);
    setWishlist(merged);

    api("/api/wishlist", { method: "PUT", body: { productIds: merged } })
      .then((data) => {
        if (!Array.isArray(data.productIds)) {
          throw new Error("The server returned an invalid wishlist.");
        }
        if (!active) return;
        setWishlist(cleanProductIds(data.productIds));
        if (!removeStoredList(GUEST_WISHLIST_STORAGE_KEY)) {
          setToast("Wishlist synced, but guest wishlist data could not be cleared from this browser.");
        }
      })
      .catch((error) => {
        if (active) setToast(error.message || "Could not sync your wishlist. Please try again.");
      });

    return () => {
      active = false;
    };
  }, [authReady, user?.id]);

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
    if (!Number.isInteger(qty) || qty < 1) throw new Error("Choose a valid quantity.");
    const stock = Number(product.stock);
    if (!Number.isFinite(stock) || stock < 1) throw new Error("This piece is currently out of stock.");
    const index = cart.findIndex(
      (item) => item.productId === product.id && item.size === size && item.color === color
    );
    const existingQty = index >= 0 ? cart[index].qty : 0;
    const maxQty = Math.min(MAX_CART_QUANTITY, stock);
    if (existingQty + qty > maxQty) {
      throw new Error(`You can add up to ${maxQty} of this piece.`);
    }
    const next = cart.slice();
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
    setCart(next);
    setDrawer(true);
    notify(`${product.name} added to the bag.`);
  }

  function updateQty(index, qty) {
    setCart((current) => {
      if (!Number.isInteger(index) || index < 0 || index >= current.length || !Number.isInteger(qty)) {
        return current;
      }
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
      return next;
    });
  }

  function removeFromCart(index) {
    setCart((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  function clearCart() {
    setCart([]);
  }

  function updateCartPrices(products) {
    const pricesById = new Map(products.map((product) => [product.id, product.price]));
    setCart((current) =>
      current.map((item) =>
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
      updateQty,
      removeFromCart,
      clearCart,
      updateCartPrices,
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
