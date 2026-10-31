import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import { money, prettyDate } from "../format";
import { defaultSize } from "../commerce";
import { useDocumentTitle } from "../hooks";
import { useAuth } from "../context/AuthContext";
import { useShop } from "../context/ShopContext";
import { Loading, PageHeader } from "../components/ui";

export function Lookbook() {
  useDocumentTitle("Lookbook");
  const [looks, setLooks] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api("/api/looks")
      .then((data) => setLooks(data.looks))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="page wrap">
      <PageHeader
        kicker="Lookbook"
        title="Occasions, already edited"
        lede="Choose a day. Each look opens into the pieces, ready to adjust in the studio."
      />
      {error && <p className="error">{error}</p>}
      {loading && <Loading />}
      {!loading && !error && looks.length === 0 && <p className="notice">No looks are available right now.</p>}
      <div className="occasion-grid large">
        {looks.map((look) => (
          <Link key={look.id} to={`/lookbook/${look.id}`} className="occasion-card">
            <img src={look.image} alt="" />
            <div>
              <span>{look.occasion}</span>
              <strong>{look.name}</strong>
              <em>{look.summary}</em>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function CompleteLook() {
  const { id } = useParams();
  const { addToCart, notify } = useShop();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  useDocumentTitle(data?.look?.name || "Complete look");

  useEffect(() => {
    api(`/api/looks/${id}`)
      .then(setData)
      .catch((err) => setError(err.message));
  }, [id]);

  function addAll() {
    if (!data) return;
    let added = 0;
    const failures = [];
    data.products.forEach((product) => {
      try {
        addToCart(product, {
          size: defaultSize(product),
          color: product.colors[0].name,
          qty: 1,
        });
        added += 1;
      } catch (err) {
        failures.push(err.message);
      }
    });
    if (failures.length) {
      notify(
        added
          ? `Added ${added} of ${data.products.length} pieces. ${failures[0]}`
          : `Could not add the look. ${failures[0]}`
      );
    } else if (added) {
      notify("Look added to the bag. Review sizes before checkout.");
    } else {
      notify("This look has no pieces to add.");
    }
  }

  if (error) return <div className="page wrap"><p className="error">{error}</p></div>;
  if (!data) return <div className="page wrap"><Loading /></div>;
  const total = data.products.reduce((sum, product) => sum + product.price, 0);

  return (
    <div className="page wrap">
      <PageHeader kicker={data.look.occasion} title={data.look.name} lede={data.look.note}>
        <div className="hero-actions">
          <button type="button" className="btn solid" onClick={addAll}>
            Add the look · {money(total)}
          </button>
          <Link className="btn line" to={`/studio?look=${data.look.id}`}>
            Customise in studio
          </Link>
        </div>
      </PageHeader>
      <div className="look-hero">
        <img src={data.look.image} alt="" />
        <p>{data.look.summary}</p>
      </div>
      <div className="product-grid">
        {data.products.map((product) => (
          <article key={product.id} className="product-card">
            <Link to={`/product/${product.id}`} className="product-media">
              <img src={product.image} alt={product.name} />
              <span>{product.slot}</span>
            </Link>
            <div className="product-meta">
              <div>
                <Link to={`/product/${product.id}`}>{product.name}</Link>
                <p>{product.colors[0].name}</p>
              </div>
              <strong>{money(product.price)}</strong>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

export function Community() {
  useDocumentTitle("Community");
  const { user } = useAuth();
  const [posts, setPosts] = useState([]);
  const [form, setForm] = useState({ title: "", body: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [liking, setLiking] = useState(() => new Set());

  async function load() {
    setError("");
    try {
      const data = await api("/api/community");
      setPosts(data.posts);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function publish(event) {
    event.preventDefault();
    setError("");
    setPublishing(true);
    try {
      const data = await api("/api/community", { method: "POST", body: form });
      setPosts((current) => [data.post, ...current]);
      setForm({ title: "", body: "" });
    } catch (err) {
      setError(err.message);
    } finally {
      setPublishing(false);
    }
  }

  async function like(postId) {
    setError("");
    setLiking((current) => new Set(current).add(postId));
    try {
      const data = await api(`/api/community/${postId}/like`, { method: "POST" });
      setPosts((current) => current.map((post) => (post.id === postId ? { ...post, likes: data.likes } : post)));
    } catch (err) {
      setError(err.message);
    } finally {
      setLiking((current) => {
        const next = new Set(current);
        next.delete(postId);
        return next;
      });
    }
  }

  return (
    <div className="page wrap">
      <PageHeader
        kicker="Community"
        title="Notes from the floor"
        lede="Short observations on what was worn, and why. Signed-in clients can add a note."
      />
      {error && <p className="error">{error}</p>}
      {user ? (
        <form className="panel stack" onSubmit={publish}>
          <label>
            Title
            <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} required />
          </label>
          <label>
            Note
            <textarea rows="3" value={form.body} onChange={(event) => setForm({ ...form, body: event.target.value })} required />
          </label>
          <button className="btn dark" type="submit" disabled={publishing}>
            {publishing ? "Publishing…" : "Publish note"}
          </button>
        </form>
      ) : (
        <p className="notice">
          <Link to="/login">Sign in</Link> to share a note. Reading is open.
        </p>
      )}
      <div className="feed">
        {loading && <Loading />}
        {!loading && !error && posts.length === 0 && <p className="notice">No community notes yet. Be the first to share one.</p>}
        {posts.map((post) => (
          <article key={post.id}>
            <img src={post.image} alt="" />
            <div>
              <p className="kicker">{post.author} · {prettyDate(post.createdAt)}</p>
              <h2>{post.title}</h2>
              <p>{post.body}</p>
              <button
                type="button"
                className="text-link"
                onClick={() => like(post.id)}
                disabled={liking.has(post.id)}
              >
                {liking.has(post.id) ? "Updating…" : `Appreciate · ${post.likes}`}
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
