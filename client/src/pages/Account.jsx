import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { money, prettyDate } from "../format";
import { useDocumentTitle } from "../hooks";
import { useAuth } from "../context/AuthContext";
import { useShop } from "../context/ShopContext";
import ProductCard from "../components/ProductCard";
import { Empty, Loading, PageHeader } from "../components/ui";
import { PALETTE } from "../palette";

export function Wishlist() {
  useDocumentTitle("Wishlist");
  const { wishlist } = useShop();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (wishlist.length === 0) {
      setProducts([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    api("/api/products")
      .then((data) => setProducts(data.products.filter((product) => wishlist.includes(product.id))))
      .finally(() => setLoading(false));
  }, [wishlist]);

  return (
    <div className="page wrap">
      <PageHeader kicker="Saved" title="Wishlist" lede="Pieces held for later. Sign in to sync across devices." />
      {loading && <Loading />}
      {!loading && products.length === 0 && (
        <Empty title="Nothing saved yet" text="Use the heart on a product card." action={<Link className="btn dark" to="/shop">Browse the edit</Link>} />
      )}
      <div className="product-grid">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </div>
  );
}

export function Wardrobe() {
  useDocumentTitle("Wardrobe");
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ name: "", category: "Shirts", color: "Ink", hex: "#161616", notes: "" });
  const [error, setError] = useState("");

  function load() {
    api("/api/wardrobe")
      .then((data) => setItems(data.items))
      .catch((err) => setError(err.message));
  }

  useEffect(() => {
    load();
  }, []);

  async function add(event) {
    event.preventDefault();
    setError("");
    try {
      await api("/api/wardrobe", { method: "POST", body: form });
      setForm({ name: "", category: "Shirts", color: "Ink", hex: "#161616", notes: "" });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function remove(id) {
    await api(`/api/wardrobe/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="page wrap">
      <PageHeader
        kicker="Digital wardrobe"
        title="Clothes you already own"
        lede="Add pieces from your cupboard, then pull them into the Mix & Match studio."
      >
        <Link className="btn line" to="/studio">
          Open studio
        </Link>
      </PageHeader>
      {error && <p className="error">{error}</p>}
      <form className="panel form-grid" onSubmit={add}>
        <label>
          Name
          <input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
        </label>
        <label>
          Category
          <select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>
            {["Shirts", "Knitwear", "Trousers", "Outerwear", "Dresses", "Footwear", "Accessories"].map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <label>
          Colour
          <select
            value={form.color}
            onChange={(event) => {
              const tone = PALETTE.find((color) => color.name === event.target.value) || PALETTE[0];
              setForm({ ...form, color: tone.name, hex: tone.hex });
            }}
          >
            {PALETTE.map((color) => (
              <option key={color.name}>{color.name}</option>
            ))}
          </select>
        </label>
        <label className="span-2">
          Notes
          <input value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
        </label>
        <button className="btn dark" type="submit">
          Add piece
        </button>
      </form>
      {items.length === 0 ? (
        <Empty title="Wardrobe is empty" text="Start with one shirt or jacket you wear often." />
      ) : (
        <ul className="wardrobe-list">
          {items.map((item) => (
            <li key={item.id}>
              <i style={{ background: item.hex }} />
              <div>
                <strong>{item.name}</strong>
                <p>
                  {item.category} · {item.color}
                </p>
                {item.notes && <p className="muted">{item.notes}</p>}
              </div>
              <button type="button" className="text-link" onClick={() => remove(item.id)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Planner() {
  useDocumentTitle("Outfit planner");
  const [entries, setEntries] = useState([]);
  const [outfits, setOutfits] = useState([]);
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    title: "",
    outfitId: "",
    notes: "",
  });
  const [error, setError] = useState("");

  function load() {
    Promise.all([api("/api/planner"), api("/api/outfits")])
      .then(([planData, outfitData]) => {
        setEntries(planData.entries);
        setOutfits(outfitData.outfits);
      })
      .catch((err) => setError(err.message));
  }

  useEffect(() => {
    load();
  }, []);

  async function add(event) {
    event.preventDefault();
    setError("");
    try {
      await api("/api/planner", {
        method: "POST",
        body: { ...form, outfitId: form.outfitId || null },
      });
      setForm({ ...form, title: "", notes: "", outfitId: "" });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function markWorn(id) {
    await api(`/api/planner/${id}/worn`, { method: "POST" });
    load();
  }

  async function remove(id) {
    await api(`/api/planner/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="page wrap">
      <PageHeader
        kicker="Planner"
        title="Weekly outfit planner"
        lede="Schedule looks from the studio, then mark them worn to build a rewear record."
      />
      {error && <p className="error">{error}</p>}
      <form className="panel form-grid" onSubmit={add}>
        <label>
          Date
          <input type="date" required value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} />
        </label>
        <label>
          Title
          <input required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
        </label>
        <label>
          Saved look
          <select value={form.outfitId} onChange={(event) => setForm({ ...form, outfitId: event.target.value })}>
            <option value="">None</option>
            {outfits.map((outfit) => (
              <option key={outfit.id} value={outfit.id}>
                {outfit.name}
              </option>
            ))}
          </select>
        </label>
        <label className="span-2">
          Notes
          <input value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
        </label>
        <button className="btn dark" type="submit">
          Add to week
        </button>
      </form>
      {entries.length === 0 ? (
        <Empty title="No plans yet" text="Save a look in the studio, then place it on a day." />
      ) : (
        <ul className="planner-list">
          {entries.map((entry) => {
            const outfit = outfits.find((item) => item.id === entry.outfitId);
            return (
              <li key={entry.id}>
                <div>
                  <p className="kicker">{prettyDate(entry.date)}</p>
                  <strong>{entry.title}</strong>
                  <p className="muted">{outfit ? `Look: ${outfit.name}` : "No linked look"}</p>
                  {entry.notes && <p>{entry.notes}</p>}
                  <p className="muted">
                    Worn {entry.wornCount} time{entry.wornCount === 1 ? "" : "s"}
                    {entry.lastWorn ? ` · last ${prettyDate(entry.lastWorn)}` : ""}
                  </p>
                </div>
                <div className="hero-actions">
                  <button type="button" className="btn line" onClick={() => markWorn(entry.id)}>
                    Mark worn
                  </button>
                  <button type="button" className="text-link" onClick={() => remove(entry.id)}>
                    Remove
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function Notifications() {
  useDocumentTitle("Notifications");
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");

  function load() {
    api("/api/notifications")
      .then((data) => setItems(data.notifications))
      .catch((err) => setError(err.message));
  }

  useEffect(() => {
    load();
  }, []);

  async function markRead(id) {
    await api(`/api/notifications/${id}/read`, { method: "POST" });
    load();
  }

  async function markAll() {
    await api("/api/notifications/read-all", { method: "POST" });
    load();
  }

  return (
    <div className="page wrap narrow">
      <PageHeader kicker="Alerts" title="Notification centre" lede="Order updates, quiz results, and atelier notes.">
        {items.some((item) => !item.read) && (
          <button type="button" className="btn line" onClick={markAll}>
            Mark all read
          </button>
        )}
      </PageHeader>
      {error && <p className="error">{error}</p>}
      {items.length === 0 ? (
        <Empty title="No notifications" text="Activity will appear here after orders and studio saves." />
      ) : (
        <ul className="notify-list">
          {items.map((item) => (
            <li key={item.id} className={item.read ? "" : "unread"}>
              <div>
                <strong>{item.title}</strong>
                <p>{item.body}</p>
                <p className="muted">{prettyDate(item.createdAt)}</p>
              </div>
              {!item.read && (
                <button type="button" className="text-link" onClick={() => markRead(item.id)}>
                  Mark read
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Profile() {
  useDocumentTitle("Profile");
  const { user, logout } = useAuth();
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    api("/api/orders")
      .then((data) => setOrders(data.orders))
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div className="page wrap">
      <PageHeader kicker="Account" title={user.name} lede={user.email}>
        <button type="button" className="btn line" onClick={logout}>
          Sign out
        </button>
      </PageHeader>
      <div className="profile-links">
        <Link to="/wishlist">Wishlist</Link>
        <Link to="/wardrobe">Wardrobe</Link>
        <Link to="/planner">Planner</Link>
        <Link to="/notifications">Notifications</Link>
        {user.role === "admin" && <Link to="/admin">Atelier admin</Link>}
      </div>
      {error && <p className="error">{error}</p>}
      <section>
        <div className="section-head">
          <h2>Orders</h2>
        </div>
        {orders.length === 0 ? (
          <Empty title="No orders yet" text="When you place an order, the confirmation will live here." />
        ) : (
          <ul className="order-list">
            {orders.map((order) => (
              <li key={order.id}>
                <div>
                  <Link to={`/order/${order.id}`}>{order.id}</Link>
                  <p className="muted">
                    {prettyDate(order.createdAt)} · {order.items.length} piece{order.items.length === 1 ? "" : "s"}
                  </p>
                </div>
                <div>
                  <p className={`status status-${order.status}`}>{order.status}</p>
                  <strong>{money(order.total)}</strong>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
