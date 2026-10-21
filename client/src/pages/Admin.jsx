import { useEffect, useState } from "react";
import { Link, NavLink, Route, Routes } from "react-router-dom";
import { api } from "../api";
import { money, prettyDate } from "../format";
import { useDocumentTitle } from "../hooks";
import { Loading, PageHeader } from "../components/ui";
import { InventoryEditor, InventoryList } from "./admin/Inventory";
import Barcodes from "./admin/Barcodes";
import Categories from "./admin/Categories";
import HomeCollections from "./admin/HomeCollections";
import PosSales from "./admin/PosSales";
import { LOW_STOCK, stockLevel, stockText, variantText } from "./admin/inventoryUtils";

export default function Admin() {
  useDocumentTitle("Atelier");
  return (
    <div className="page wrap">
      <PageHeader kicker="Atelier" title="Admin" lede="Orders, inventory, clients, and community moderation." />
      <nav className="admin-nav" aria-label="Admin">
        <NavLink end to="/admin">
          Overview
        </NavLink>
        <NavLink to="/pos">Open POS</NavLink>
        <NavLink to="/admin/home">Home</NavLink>
        <NavLink to="/admin/inventory">Inventory</NavLink>
        <NavLink to="/admin/categories">Categories</NavLink>
        <NavLink to="/admin/barcodes">Barcodes</NavLink>
        <NavLink to="/admin/pos-sales">POS sales</NavLink>
        <NavLink to="/admin/products">Products</NavLink>
        <NavLink to="/admin/orders">Orders</NavLink>
        <NavLink to="/admin/users">Users</NavLink>
        <NavLink to="/admin/moderation">Moderation</NavLink>
      </nav>
      <Routes>
        <Route index element={<Overview />} />
        <Route path="home" element={<HomeCollections />} />
        <Route path="inventory" element={<InventoryList />} />
        <Route path="inventory/new" element={<InventoryEditor />} />
        <Route path="inventory/:id" element={<InventoryEditor />} />
        <Route path="categories" element={<Categories />} />
        <Route path="barcodes" element={<Barcodes />} />
        <Route path="pos-sales" element={<PosSales />} />
        <Route path="products" element={<Products />} />
        <Route path="orders" element={<Orders />} />
        <Route path="users" element={<Users />} />
        <Route path="moderation" element={<Moderation />} />
      </Routes>
    </div>
  );
}

function Overview() {
  const [data, setData] = useState(null);
  const [lowInventory, setLowInventory] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api("/api/admin/overview")
      .then(setData)
      .catch((err) => setError(err.message));
    api(`/api/inventory?lowStock=${LOW_STOCK}`)
      .then((result) => setLowInventory(result.items))
      .catch(() => {});
  }, []);

  if (error) return <p className="error">{error}</p>;
  if (!data) return <Loading />;

  return (
    <div>
      <div className="stat-grid">
        <article>
          <p className="kicker">Revenue</p>
          <strong>{money(data.revenue)}</strong>
        </article>
        <article>
          <p className="kicker">Orders</p>
          <strong>{data.orders}</strong>
        </article>
        <article>
          <p className="kicker">Clients</p>
          <strong>{data.clients}</strong>
        </article>
        <article>
          <p className="kicker">Community notes</p>
          <strong>{data.posts}</strong>
        </article>
      </div>
      <section>
        <div className="section-head">
          <h2>Low stock · storefront</h2>
        </div>
        {data.lowStock.length === 0 ? (
          <p className="muted">All pieces have comfortable stock.</p>
        ) : (
          <ul className="admin-table">
            {data.lowStock.map((product) => (
              <li key={product.id}>
                <span>{product.name}</span>
                <strong>{product.stock} left</strong>
              </li>
            ))}
          </ul>
        )}
      </section>
      {lowInventory && (
        <section>
          <div className="section-head">
            <h2>Low stock · shop floor</h2>
            <Link to="/admin/inventory">Manage inventory</Link>
          </div>
          {lowInventory.length === 0 ? (
            <p className="muted">Shop-floor inventory is comfortably stocked.</p>
          ) : (
            <ul className="admin-table">
              {lowInventory.map((item) => (
                <li key={item.id}>
                  <span>
                    <Link to={`/admin/inventory/${item.id}`}>{item.name}</Link>
                    <em className="muted"> · {[variantText(item), item.barcode].filter(Boolean).join(" · ")}</em>
                  </span>
                  <span className={`inv-stock is-${stockLevel(item.stock)}`}>{stockText(item.stock)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

function Products() {
  const [products, setProducts] = useState([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dragId, setDragId] = useState("");

  function load() {
    api("/api/products")
      .then((data) => {
        setProducts(data.products);
        setDirty(false);
      })
      .catch((err) => setError(err.message));
  }

  useEffect(() => {
    load();
  }, []);

  async function save(product, patch) {
    setMessage("");
    setError("");
    try {
      await api(`/api/admin/products/${product.id}`, { method: "PATCH", body: patch });
      setMessage(`${product.name} updated.`);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  function moveItem(fromId, toId) {
    if (!fromId || !toId || fromId === toId) return;
    setProducts((current) => {
      const next = current.slice();
      const from = next.findIndex((item) => item.id === fromId);
      const to = next.findIndex((item) => item.id === toId);
      if (from < 0 || to < 0) return current;
      const [row] = next.splice(from, 1);
      next.splice(to, 0, row);
      return next;
    });
    setDirty(true);
    setMessage("");
  }

  function toggleHome(productId, featured) {
    setProducts((current) =>
      current.map((product) => (product.id === productId ? { ...product, featured: Boolean(featured) } : product))
    );
    setDirty(true);
    setMessage("");
  }

  async function saveChanges() {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const featured = {};
      products.forEach((product) => {
        featured[product.id] = Boolean(product.featured);
      });
      const data = await api("/api/admin/catalog-order", {
        method: "PUT",
        body: {
          ids: products.map((product) => product.id),
          featured,
        },
      });
      setProducts(data.products);
      setDirty(false);
      setMessage("Saved. Shop order and home featured picks are updated.");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (!products.length && !error) return <Loading />;

  return (
    <div className="catalog-order">
      <div className="inv-flow-head">
        <div>
          <h2>Shop & home display</h2>
          <p className="muted">
            Drag to set shop order. Tick <strong>Home</strong> to show a piece on the homepage, then click Save.
          </p>
        </div>
        <button type="button" className="btn solid" disabled={!dirty || saving} onClick={saveChanges}>
          {saving ? "Saving…" : dirty ? "Save changes" : "All saved"}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      {message && <p className="notice">{message}</p>}
      {dirty && <p className="notice">You have unsaved changes — click Save changes.</p>}
      <ul className="admin-products catalog-order-grid">
        {products.map((product, index) => (
          <li
            key={product.id}
            className={dragId === product.id ? "is-dragging" : ""}
            draggable
            onDragStart={() => setDragId(product.id)}
            onDragEnd={() => setDragId("")}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => {
              moveItem(dragId, product.id);
              setDragId("");
            }}
          >
            <div className="catalog-card-media">
              <img src={product.image} alt="" />
              <span className="catalog-order-handle" aria-hidden>
                {index + 1}
                <em>⋮⋮</em>
              </span>
            </div>
            <div className="catalog-card-body">
              <strong>{product.name}</strong>
              <p className="muted">
                {product.audience} · {product.category}
                {product.source === "inventory" ? " · Inventory" : ""}
              </p>
              <div className="admin-edit">
                <label>
                  Price
                  <input
                    type="number"
                    defaultValue={product.price}
                    onBlur={(event) => {
                      const price = Number(event.target.value);
                      if (price !== product.price) save(product, { price });
                    }}
                  />
                </label>
                <label>
                  Stock
                  <input
                    type="number"
                    defaultValue={product.stock}
                    onBlur={(event) => {
                      const stock = Number(event.target.value);
                      if (stock !== product.stock) save(product, { stock });
                    }}
                  />
                </label>
                <label className="catalog-featured">
                  <input
                    type="checkbox"
                    checked={Boolean(product.featured)}
                    onChange={(event) => {
                      event.stopPropagation();
                      toggleHome(product.id, event.target.checked);
                    }}
                    onClick={(event) => event.stopPropagation()}
                  />
                  Show on Home
                </label>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Orders() {
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState("");

  function load() {
    api("/api/admin/orders")
      .then((data) => setOrders(data.orders))
      .catch((err) => setError(err.message));
  }

  useEffect(() => {
    load();
  }, []);

  async function setStatus(id, status) {
    await api(`/api/admin/orders/${id}`, { method: "PATCH", body: { status } });
    load();
  }

  if (error) return <p className="error">{error}</p>;

  return (
    <ul className="admin-orders">
      {orders.map((order) => (
        <li key={order.id}>
          <div>
            <strong>{order.id}</strong>
            <p>
              {order.name} · {order.email}
            </p>
            <p className="muted">
              {prettyDate(order.createdAt)} · {money(order.total)}
            </p>
          </div>
          <label>
            Status
            <select value={order.status} onChange={(event) => setStatus(order.id, event.target.value)}>
              {["confirmed", "packing", "shipped", "delivered", "cancelled"].map((status) => (
                <option key={status}>{status}</option>
              ))}
            </select>
          </label>
        </li>
      ))}
    </ul>
  );
}

function Users() {
  const [users, setUsers] = useState([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editingId, setEditingId] = useState("");
  const [draft, setDraft] = useState({ name: "", email: "", role: "customer", password: "" });
  const [busy, setBusy] = useState(false);

  function load() {
    return api("/api/admin/users")
      .then((data) => setUsers(data.users))
      .catch((err) => setError(err.message));
  }

  useEffect(() => {
    load();
  }, []);

  function startEdit(user) {
    setEditingId(user.id);
    setDraft({ name: user.name, email: user.email, role: user.role, password: "" });
    setError("");
    setNotice("");
  }

  async function save(event) {
    event.preventDefault();
    if (!editingId) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const body = {
        name: draft.name,
        email: draft.email,
        role: draft.role,
      };
      if (draft.password.trim()) body.password = draft.password.trim();
      const data = await api(`/api/admin/users/${editingId}`, { method: "PATCH", body });
      setUsers((current) => current.map((entry) => (entry.id === editingId ? data.user : entry)));
      setNotice(data.message || "User updated.");
      setEditingId("");
      setDraft({ name: "", email: "", role: "customer", password: "" });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!users.length && !error) return <Loading />;
  if (error && !users.length) return <p className="error">{error}</p>;

  return (
    <div className="admin-users">
      <p className="muted">Edit any account’s name, email, role, or set a new password.</p>
      {error && <p className="error">{error}</p>}
      {notice && <p className="notice">{notice}</p>}
      <ul className="admin-table">
        {users.map((user) => (
          <li key={user.id} className={editingId === user.id ? "is-editing" : ""}>
            {editingId === user.id ? (
              <form className="admin-user-edit" onSubmit={save}>
                <label>
                  Name
                  <input
                    required
                    value={draft.name}
                    onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                    maxLength={80}
                  />
                </label>
                <label>
                  Email
                  <input
                    required
                    type="email"
                    value={draft.email}
                    onChange={(event) => setDraft({ ...draft, email: event.target.value })}
                  />
                </label>
                <label>
                  Role
                  <select value={draft.role} onChange={(event) => setDraft({ ...draft, role: event.target.value })}>
                    <option value="customer">customer</option>
                    <option value="admin">admin</option>
                  </select>
                </label>
                <label>
                  New password
                  <input
                    type="password"
                    value={draft.password}
                    onChange={(event) => setDraft({ ...draft, password: event.target.value })}
                    placeholder="Leave blank to keep"
                    minLength={6}
                  />
                </label>
                <div className="admin-user-actions">
                  <button className="btn solid" type="submit" disabled={busy}>
                    {busy ? "Saving…" : "Save"}
                  </button>
                  <button className="btn line" type="button" disabled={busy} onClick={() => setEditingId("")}>
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <>
                <span>
                  {user.name}
                  <em className="muted"> · {user.email}</em>
                </span>
                <strong>{user.role}</strong>
                <button type="button" className="text-link" onClick={() => startEdit(user)}>
                  Edit
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Moderation() {
  const [posts, setPosts] = useState([]);
  const [error, setError] = useState("");

  function load() {
    api("/api/admin/posts")
      .then((data) => setPosts(data.posts))
      .catch((err) => setError(err.message));
  }

  useEffect(() => {
    load();
  }, []);

  async function setStatus(id, status) {
    await api(`/api/admin/posts/${id}`, { method: "PATCH", body: { status } });
    load();
  }

  if (error) return <p className="error">{error}</p>;

  return (
    <ul className="admin-orders">
      {posts.map((post) => (
        <li key={post.id}>
          <div>
            <strong>{post.title}</strong>
            <p className="muted">
              {post.author} · {prettyDate(post.createdAt)}
            </p>
            <p>{post.body}</p>
          </div>
          <label>
            Visibility
            <select value={post.status} onChange={(event) => setStatus(post.id, event.target.value)}>
              <option value="published">published</option>
              <option value="hidden">hidden</option>
            </select>
          </label>
        </li>
      ))}
    </ul>
  );
}
