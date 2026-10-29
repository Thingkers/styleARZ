import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { money, prettyDate } from "../format";
import { shippingFor } from "../commerce";
import { useDocumentTitle } from "../hooks";
import { useAuth } from "../context/AuthContext";
import { useShop } from "../context/ShopContext";
import { Empty, PageHeader } from "../components/ui";

export function Cart() {
  useDocumentTitle("Bag");
  const { cart, updateQty, removeFromCart, subtotal } = useShop();
  const shipping = shippingFor(subtotal);
  return (
    <div className="page wrap">
      <PageHeader kicker="Bag" title="Review the pieces" lede="Quantities can be changed here. Shipping is confirmed at checkout." />
      {cart.length === 0 ? (
        <Empty title="Your bag is empty" text="Start with the edit, or build a look in the studio." action={<Link className="btn dark" to="/shop">Shop the edit</Link>} />
      ) : (
        <div className="cart-layout">
          <ul className="cart-list">
            {cart.map((item, index) => (
              <li key={`${item.productId}-${item.size}-${item.color}`}>
                <img src={item.image} alt="" />
                <div>
                  <Link to={`/product/${item.productId}`}>{item.name}</Link>
                  <p>
                    {item.color} · Size {item.size}
                  </p>
                  <div className="qty">
                    <button type="button" onClick={() => updateQty(index, item.qty - 1)} aria-label="Decrease">
                      −
                    </button>
                    <span>{item.qty}</span>
                    <button
                      type="button"
                      onClick={() => updateQty(index, item.qty + 1)}
                      aria-label="Increase"
                      disabled={item.qty >= Math.min(5, item.stock ?? 5)}
                    >
                      +
                    </button>
                  </div>
                </div>
                <div className="cart-price">
                  <strong>{money(item.price * item.qty)}</strong>
                  <button type="button" className="text-link" onClick={() => removeFromCart(index)}>
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <aside className="summary">
            <h2>Summary</h2>
            <p><span>Subtotal</span><strong>{money(subtotal)}</strong></p>
            <p><span>Shipping</span><strong>{shipping === 0 ? "Complimentary" : money(shipping)}</strong></p>
            <p className="total"><span>Total</span><strong>{money(subtotal + shipping)}</strong></p>
            <Link className="btn solid" to="/checkout">Checkout</Link>
          </aside>
        </div>
      )}
    </div>
  );
}

export function Checkout() {
  useDocumentTitle("Checkout");
  const { user } = useAuth();
  const { cart, subtotal, clearCart, updateCartPrices, notify } = useShop();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: user?.name || "",
    email: user?.email || "",
    phone: "",
    address: "",
    city: "",
    country: "Bangladesh",
    notes: "",
    card: "",
    expiry: "",
    cvc: "",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const shipping = shippingFor(subtotal);

  useEffect(() => {
    if (user) {
      setForm((current) => ({
        ...current,
        name: current.name || user.name,
        email: current.email || user.email,
      }));
    }
  }, [user]);

  function set(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function onSubmit(event) {
    event.preventDefault();
    setError("");
    const digits = form.card.replace(/\s/g, "");
    if (!/^\d{16}$/.test(digits)) {
      setError("Enter a 16-digit card number. This checkout is a demonstration and does not charge the card.");
      return;
    }
    if (!/^\d{2}\/\d{2}$/.test(form.expiry) || !/^\d{3,4}$/.test(form.cvc)) {
      setError("Enter an expiry as MM/YY and a CVC.");
      return;
    }
    setBusy(true);
    try {
      const catalog = await api("/api/products");
      if (!Array.isArray(catalog.products)) {
        throw new Error("Could not verify current product prices. Please try again.");
      }
      const pricesById = new Map(catalog.products.map((product) => [product.id, product.price]));
      const unavailable = cart.find((item) => !pricesById.has(item.productId));
      if (unavailable) {
        throw new Error(`${unavailable.name} is no longer available. Remove it from your bag to continue.`);
      }
      const currentSubtotal = cart.reduce(
        (sum, item) => sum + pricesById.get(item.productId) * item.qty,
        0
      );
      const pricesChanged = cart.some((item) => pricesById.get(item.productId) !== item.price);
      updateCartPrices(catalog.products);
      if (pricesChanged) {
        setError("Prices have changed. Review the updated total and place your order again.");
        return;
      }

      const data = await api("/api/orders", {
        method: "POST",
        body: {
          name: form.name,
          email: form.email,
          phone: form.phone,
          address: form.address,
          city: form.city,
          country: form.country,
          notes: form.notes,
          paymentLast4: digits.slice(-4),
          expectedSubtotal: currentSubtotal,
          items: cart.map((item) => ({
            productId: item.productId,
            size: item.size,
            color: item.color,
            qty: item.qty,
          })),
        },
      });
      clearCart();
      navigate(`/order/${data.order.id}`);
    } catch (err) {
      setError(err.message);
      notify(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (cart.length === 0) {
    return (
      <div className="page wrap">
        <Empty title="Nothing to check out" text="Add a piece to the bag first." action={<Link className="btn dark" to="/shop">Return to shop</Link>} />
      </div>
    );
  }

  return (
    <div className="page wrap">
      <PageHeader
        kicker="Checkout"
        title="Delivery and confirmation"
        lede="Demonstration checkout. The card number is checked in the browser and is not stored. Only the last four digits are kept with the order."
      />
      <form className="cart-layout" onSubmit={onSubmit}>
        <div className="stack">
          {error && <p className="error">{error}</p>}
          <div className="form-grid">
            <label>
              Full name
              <input required value={form.name} onChange={(event) => set("name", event.target.value)} />
            </label>
            <label>
              Email
              <input required type="email" value={form.email} onChange={(event) => set("email", event.target.value)} />
            </label>
            <label>
              Phone
              <input value={form.phone} onChange={(event) => set("phone", event.target.value)} />
            </label>
            <label>
              Country
              <input required value={form.country} onChange={(event) => set("country", event.target.value)} />
            </label>
            <label className="span-2">
              Address
              <input required value={form.address} onChange={(event) => set("address", event.target.value)} />
            </label>
            <label>
              City
              <input required value={form.city} onChange={(event) => set("city", event.target.value)} />
            </label>
            <label>
              Card number
              <input
                required
                inputMode="numeric"
                autoComplete="off"
                placeholder="•••• •••• •••• ••••"
                value={form.card}
                onChange={(event) => set("card", event.target.value)}
              />
            </label>
            <label>
              Expiry
              <input required placeholder="MM/YY" value={form.expiry} onChange={(event) => set("expiry", event.target.value)} />
            </label>
            <label>
              CVC
              <input required placeholder="123" value={form.cvc} onChange={(event) => set("cvc", event.target.value)} />
            </label>
            <label className="span-2">
              Note for the atelier
              <textarea rows="3" value={form.notes} onChange={(event) => set("notes", event.target.value)} />
            </label>
          </div>
        </div>
        <aside className="summary">
          <h2>Order</h2>
          <ul className="mini-lines">
            {cart.map((item) => (
              <li key={`${item.productId}-${item.size}-${item.color}`}>
                <span>
                  {item.name} × {item.qty}
                </span>
                <strong>{money(item.price * item.qty)}</strong>
              </li>
            ))}
          </ul>
          <p><span>Subtotal</span><strong>{money(subtotal)}</strong></p>
          <p><span>Shipping</span><strong>{shipping === 0 ? "Complimentary" : money(shipping)}</strong></p>
          <p className="total"><span>Total</span><strong>{money(subtotal + shipping)}</strong></p>
          <button className="btn solid" type="submit" disabled={busy}>
            {busy ? "Placing order" : "Place order"}
          </button>
        </aside>
      </form>
    </div>
  );
}

export function Confirmation() {
  const { id } = useParams();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  useDocumentTitle("Order confirmed");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setOrder(null);
    api(`/api/orders/${id}`)
      .then((data) => {
        if (active) setOrder(data.order);
      })
      .catch((err) => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id, attempt]);

  return (
    <div className="page wrap narrow">
      <PageHeader
        kicker={error ? "Order lookup" : order ? "Confirmed" : "Order lookup"}
        title={error ? "We couldn't load this order" : loading ? "Checking your order" : "The order is with the atelier"}
        lede={order ? `Reference ${order.id}` : loading ? "Fetching the confirmation" : ""}
      />
      {error && (
        <div className="stack">
          <p className="error">{error}</p>
          <button className="btn dark" type="button" onClick={() => setAttempt((current) => current + 1)}>
            Try again
          </button>
        </div>
      )}
      {order && (
        <div className="panel">
          <p className={`status status-${order.status}`}>{order.status}</p>
          <p>
            {order.name} · {order.email}
          </p>
          <p>
            {order.address}, {order.city}, {order.country}
          </p>
          <ul className="mini-lines">
            {order.items.map((item) => (
              <li key={`${item.productId}-${item.size}`}>
                <span>
                  {item.name} · {item.color} · {item.size} × {item.qty}
                </span>
                <strong>{money(item.price * item.qty)}</strong>
              </li>
            ))}
          </ul>
          <p className="total"><span>Total</span><strong>{money(order.total)}</strong></p>
          <p className="muted">Paid with card ending {order.paymentLast4}. Placed {prettyDate(order.createdAt)}.</p>
          <Link className="btn dark" to="/shop">Continue browsing</Link>
        </div>
      )}
    </div>
  );
}
