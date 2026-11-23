import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { api } from "../api";
import { money, prettyDate } from "../format";
import { useDocumentTitle } from "../hooks";
import { useAuth } from "../context/AuthContext";
import { isSuperAdmin } from "../roles";
import { Loading } from "../components/ui";
import { RevenueBarChart, StatusDonutChart } from "../components/Charts";
import { InventoryEditor, InventoryList } from "./admin/Inventory";
import Barcodes from "./admin/Barcodes";
import Categories from "./admin/Categories";
import HomeCollections from "./admin/HomeCollections";
import HomeProducts from "./admin/HomeProducts";
import LabelCapture from "./admin/LabelCapture";
import Labels from "./admin/Labels";
import PosSales from "./admin/PosSales";
import Settings from "./admin/Settings";
import UsbScanner from "./admin/UsbScanner";
import Offers from "./admin/Offers";
import Messages from "./admin/Messages";
import { LOW_STOCK, stockLevel, stockText, variantText } from "./admin/inventoryUtils";

function RequireSuperAdmin({ children }) {
  const { user } = useAuth();
  if (!isSuperAdmin(user)) return <Navigate to="/admin" replace />;
  return children;
}

const ADMIN_SECTIONS = [
  {
    id: "dashboard",
    label: "Dashboard",
    match: (path) => path === "/admin" || path === "/admin/",
    links: [
      { to: "/admin", end: true, label: "Overview", hint: "Stats & low stock" },
      { to: "/pos", label: "Open POS", hint: "Till & barcode sales", external: false },
    ],
  },
  {
    id: "storefront",
    label: "Storefront",
    match: (path) =>
      path.startsWith("/admin/home") || path.startsWith("/admin/products") || path.startsWith("/admin/moderation"),
    links: [
      { to: "/admin/home", label: "Home collections", hint: "Audience tiles" },
      { to: "/admin/home-products", label: "Home products", hint: "Display pieces" },
      { to: "/admin/products", label: "Products", hint: "Catalog order" },
      { to: "/admin/moderation", label: "Moderation", hint: "Community posts" },
    ],
  },
  {
    id: "inventory",
    label: "Inventory",
    match: (path) =>
      path.startsWith("/admin/inventory") || path.startsWith("/admin/labels") || path.startsWith("/admin/barcodes"),
    links: [
      { to: "/admin/inventory", label: "Inventory", hint: "Stock & variants" },
      { to: "/admin/labels", label: "Quick Labels", hint: "Shelf tags" },
      { to: "/admin/barcodes", label: "Barcodes", hint: "Print codes" },
    ],
  },
  {
    id: "sales",
    label: "Sales",
    match: (path) => path.startsWith("/admin/pos-sales") || path.startsWith("/admin/orders"),
    links: [
      { to: "/admin/pos-sales", label: "POS sales", hint: "Receipts & deletes" },
      { to: "/admin/orders", label: "Orders", hint: "Online checkout" },
    ],
  },
  {
    id: "owner",
    label: "Configuration",
    ownerOnly: true,
    match: (path) =>
      path.startsWith("/admin/settings") ||
      path.startsWith("/admin/messages") ||
      path.startsWith("/admin/offers") ||
      path.startsWith("/admin/categories") ||
      path.startsWith("/admin/usb-scanner") ||
      path.startsWith("/admin/users"),
    links: [
      { to: "/admin/settings", label: "Settings", hint: "SMS sender" },
      { to: "/admin/messages", label: "Messages", hint: "Bulk SMS" },
      { to: "/admin/offers", label: "Offers", hint: "Grand opening" },
      { to: "/admin/categories", label: "Categories", hint: "Catalog groups" },
      { to: "/admin/usb-scanner", label: "USB scanner", hint: "Remote HID" },
      { to: "/admin/users", label: "Users", hint: "Roles & access" },
    ],
  },
];

function sectionOpenKey(id) {
  return `sa-admin-nav-${id}`;
}

function AdminAccordionNav({ owner }) {
  const location = useLocation();
  const path = location.pathname;
  const sections = useMemo(
    () => ADMIN_SECTIONS.filter((section) => !section.ownerOnly || owner),
    [owner]
  );
  const [openMap, setOpenMap] = useState(() => {
    const initial = {};
    ADMIN_SECTIONS.filter((section) => !section.ownerOnly || owner).forEach((section) => {
      const saved = localStorage.getItem(sectionOpenKey(section.id));
      initial[section.id] = saved === null ? Boolean(section.match(path)) : saved === "1";
    });
    return initial;
  });

  useEffect(() => {
    setOpenMap((current) => {
      const next = { ...current };
      let changed = false;
      sections.forEach((section) => {
        if (section.match(path) && !next[section.id]) {
          next[section.id] = true;
          changed = true;
          localStorage.setItem(sectionOpenKey(section.id), "1");
        }
      });
      return changed ? next : current;
    });
  }, [path, sections]);

  function toggle(id) {
    setOpenMap((current) => {
      const nextOpen = !current[id];
      localStorage.setItem(sectionOpenKey(id), nextOpen ? "1" : "0");
      return { ...current, [id]: nextOpen };
    });
  }

  return (
    <nav className="admin-side-nav" aria-label="Admin sections">
      {sections.map((section) => {
        const open = Boolean(openMap[section.id]);
        const active = section.match(path);
        return (
          <div
            key={section.id}
            className={`admin-acc ${open ? "is-open" : ""} ${active ? "is-active" : ""} ${
              section.ownerOnly ? "is-owner" : ""
            }`}
          >
            <button
              type="button"
              className="admin-acc-trigger"
              aria-expanded={open}
              onClick={() => toggle(section.id)}
            >
              <span>
                {section.label}
                {section.ownerOnly ? <em>Owner</em> : null}
              </span>
              <span className="admin-acc-chevron" aria-hidden="true" />
            </button>
            <div className="admin-acc-panel" hidden={!open}>
              {section.links.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  end={Boolean(link.end)}
                  className={({ isActive }) => `admin-acc-link${isActive ? " is-active" : ""}`}
                >
                  <strong>{link.label}</strong>
                  {link.hint ? <span>{link.hint}</span> : null}
                </NavLink>
              ))}
            </div>
          </div>
        );
      })}
    </nav>
  );
}

function AdminShell() {
  const { user } = useAuth();
  const location = useLocation();
  const owner = isSuperAdmin(user);
  const captureMode = location.pathname.startsWith("/admin/labels/capture");

  if (captureMode) {
    return (
      <Routes>
        <Route path="labels/capture" element={<LabelCapture />} />
      </Routes>
    );
  }

  return (
    <div className="page wrap admin-dashboard">
      <header className="admin-dash-head">
        <div>
          <p className="kicker">Atelier</p>
          <h1>Dashboard</h1>
          <p className="admin-dash-lede">
            {owner
              ? "Shop owner — operations and full configuration."
              : "Staff — inventory, sales, and storefront day-to-day."}
          </p>
        </div>
        <div className="admin-dash-badge">{owner ? "Superadmin" : "Admin"}</div>
      </header>

      <div className="admin-dash-layout">
        <aside className="admin-dash-side">
          <AdminAccordionNav owner={owner} />
        </aside>
        <div className="admin-dash-main">
          <Routes>
            <Route index element={<Overview />} />
            <Route path="home" element={<HomeCollections />} />
            <Route path="home-products" element={<HomeProducts />} />
            <Route path="inventory" element={<InventoryList />} />
            <Route path="inventory/new" element={<InventoryEditor />} />
            <Route path="inventory/:id" element={<InventoryEditor />} />
            <Route path="labels" element={<Labels />} />
            <Route path="labels/capture" element={<LabelCapture />} />
            <Route path="barcodes" element={<Barcodes />} />
            <Route path="pos-sales" element={<PosSales />} />
            <Route path="products" element={<Products />} />
            <Route path="orders" element={<Orders />} />
            <Route path="moderation" element={<Moderation />} />
            <Route
              path="categories"
              element={
                <RequireSuperAdmin>
                  <Categories />
                </RequireSuperAdmin>
              }
            />
            <Route
              path="usb-scanner"
              element={
                <RequireSuperAdmin>
                  <UsbScanner />
                </RequireSuperAdmin>
              }
            />
            <Route
              path="offers"
              element={
                <RequireSuperAdmin>
                  <Offers />
                </RequireSuperAdmin>
              }
            />
            <Route
              path="messages"
              element={
                <RequireSuperAdmin>
                  <Messages />
                </RequireSuperAdmin>
              }
            />
            <Route
              path="settings"
              element={
                <RequireSuperAdmin>
                  <Settings />
                </RequireSuperAdmin>
              }
            />
            <Route
              path="users"
              element={
                <RequireSuperAdmin>
                  <Users />
                </RequireSuperAdmin>
              }
            />
          </Routes>
        </div>
      </div>
    </div>
  );
}

export default function Admin() {
  useDocumentTitle("Atelier");
  return <AdminShell />;
}

function Overview() {
  const { user } = useAuth();
  const owner = isSuperAdmin(user);
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
    <div className="admin-overview">
      <div className="admin-overview-top">
        <div>
          <h2>Overview</h2>
          <p className="muted">
            {owner
              ? "Owner console — expand Configuration in the sidebar for SMS, offers, and users."
              : "Staff console — ask the shop owner for configuration changes."}
          </p>
        </div>
        <Link className="btn solid" to="/pos">
          Open POS
        </Link>
      </div>

      <div className="stat-grid admin-stat-grid">
        <article>
          <p className="kicker">Online revenue</p>
          <strong>{money(data.revenue)}</strong>
        </article>
        <article>
          <p className="kicker">POS revenue</p>
          <strong>{money(data.posRevenue || 0)}</strong>
        </article>
        <article>
          <p className="kicker">Orders</p>
          <strong>{data.orders}</strong>
        </article>
        <article>
          <p className="kicker">Clients</p>
          <strong>{data.clients}</strong>
        </article>
      </div>

      {data.charts ? (
        <div className="admin-chart-grid">
          <section className="admin-panel admin-chart-panel">
            <div className="section-head">
              <h2>Revenue · last 14 days</h2>
              <span className="muted">{money(data.totalRevenue || data.revenue)}</span>
            </div>
            <RevenueBarChart series={data.charts.revenueSeries || []} />
          </section>
          <section className="admin-panel admin-chart-panel">
            <div className="section-head">
              <h2>Orders by status</h2>
            </div>
            <StatusDonutChart segments={data.charts.orderStatus || []} />
            <div className="admin-pay-mix">
              <p className="kicker">Online payment mix</p>
              <ul>
                <li>
                  <span>Card</span>
                  <strong>{data.charts.paymentMix?.card || 0}</strong>
                </li>
                <li>
                  <span>Cash on delivery</span>
                  <strong>{data.charts.paymentMix?.cod || 0}</strong>
                </li>
              </ul>
            </div>
          </section>
        </div>
      ) : null}

      <div className="admin-quick-grid">
        <Link to="/admin/inventory" className="admin-quick-card">
          <strong>Inventory</strong>
          <span>Stock, variants, costs</span>
        </Link>
        <Link to="/admin/pos-sales" className="admin-quick-card">
          <strong>POS sales</strong>
          <span>Receipts and invoices</span>
        </Link>
        <Link to="/admin/home-products" className="admin-quick-card">
          <strong>Home products</strong>
          <span>Display merchandising</span>
        </Link>
        {owner ? (
          <Link to="/admin/settings" className="admin-quick-card is-owner">
            <strong>Settings</strong>
            <span>SMS & system config</span>
          </Link>
        ) : null}
        {owner ? (
          <Link to="/admin/messages" className="admin-quick-card is-owner">
            <strong>Messages</strong>
            <span>Bulk festive SMS</span>
          </Link>
        ) : null}
        {owner ? (
          <Link to="/admin/offers" className="admin-quick-card is-owner">
            <strong>Offers</strong>
            <span>Inauguration tiers</span>
          </Link>
        ) : null}
      </div>

      <section className="admin-panel">
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
        <section className="admin-panel">
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
    // Real sellable catalog only (listed inventory). Seed/home images live under Home products.
    api("/api/products?kind=sellable")
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
          <h2>Shop products</h2>
          <p className="muted">
            Real sellable pieces from inventory (listed in the shop). Drag to set order. Fake/demo images are under{" "}
            <strong>Home products</strong> only — they never appear here or in inventory import.
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
                <label className="admin-toggle catalog-featured">
                  <span>Featured</span>
                  <input
                    type="checkbox"
                    role="switch"
                    checked={Boolean(product.featured)}
                    onChange={(event) => {
                      event.stopPropagation();
                      toggleHome(product.id, event.target.checked);
                    }}
                    onClick={(event) => event.stopPropagation()}
                  />
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
              {prettyDate(order.createdAt)} · {money(order.total)} ·{" "}
              {order.paymentMethod === "cod" || (!order.paymentLast4 && order.paymentMethod !== "card")
                ? "Cash on delivery"
                : `Card ···· ${order.paymentLast4 || "····"}`}
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
                    <option value="admin">admin (staff)</option>
                    <option value="superadmin">superadmin (shop owner)</option>
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
