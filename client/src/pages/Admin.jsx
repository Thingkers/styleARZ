import { useEffect, useState } from "react";
import { NavLink, Route, Routes } from "react-router-dom";
import { api } from "../api";
import { money, prettyDate } from "../format";
import { useDocumentTitle } from "../hooks";
import { Loading, PageHeader } from "../components/ui";

export default function Admin() {
  useDocumentTitle("Atelier");
  return (
    <div className="page wrap">
      <PageHeader kicker="Atelier" title="Admin" lede="Orders, inventory, clients, and community moderation." />
      <nav className="admin-nav" aria-label="Admin">
        <NavLink end to="/admin">
          Overview
        </NavLink>
        <NavLink to="/admin/products">Products</NavLink>
        <NavLink to="/admin/orders">Orders</NavLink>
        <NavLink to="/admin/users">Users</NavLink>
        <NavLink to="/admin/moderation">Moderation</NavLink>
      </nav>
      <Routes>
        <Route index element={<Overview />} />
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
  const [error, setError] = useState("");

  useEffect(() => {
    api("/api/admin/overview")
      .then(setData)
      .catch((err) => setError(err.message));
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
          <h2>Low stock</h2>
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
    </div>
  );
}

function Products() {
  const [products, setProducts] = useState([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  function load() {
    api("/api/products")
      .then((data) => setProducts(data.products))
      .catch((err) => setError(err.message));
  }

  useEffect(() => {
    load();
  }, []);

  async function save(product, patch) {
    setMessage("");
    try {
      await api(`/api/admin/products/${product.id}`, { method: "PATCH", body: patch });
      setMessage(`${product.name} updated.`);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      {error && <p className="error">{error}</p>}
      {message && <p className="notice">{message}</p>}
      <ul className="admin-products">
        {products.map((product) => (
          <li key={product.id}>
            <img src={product.image} alt="" />
            <div>
              <strong>{product.name}</strong>
              <p className="muted">
                {product.audience} · {product.category}
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

  useEffect(() => {
    api("/api/admin/users")
      .then((data) => setUsers(data.users))
      .catch((err) => setError(err.message));
  }, []);

  if (error) return <p className="error">{error}</p>;

  return (
    <ul className="admin-table">
      {users.map((user) => (
        <li key={user.id}>
          <span>
            {user.name}
            <em className="muted"> · {user.email}</em>
          </span>
          <strong>{user.role}</strong>
        </li>
      ))}
    </ul>
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
