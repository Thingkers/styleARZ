import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api";
import { Loading } from "../../components/ui";

export default function Categories() {
  const [categories, setCategories] = useState(null);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  function load() {
    return api("/api/inventory/categories")
      .then((data) => setCategories(data.categories))
      .catch((err) => setError(err.message));
  }

  useEffect(() => {
    load();
  }, []);

  async function add(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const data = await api("/api/inventory/categories", { method: "POST", body: { name } });
      setCategories(data.categories);
      setName("");
      setNotice(`Added “${data.category}”.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function rename(from) {
    const to = window.prompt(`Rename category “${from}” to:`, from);
    if (to === null || !to.trim() || to.trim() === from) return;
    setBusy(true);
    setError("");
    try {
      const data = await api("/api/inventory/categories", { method: "PATCH", body: { from, to } });
      setCategories(data.categories);
      setNotice(`Renamed to “${data.category}”. Inventory items using the old name were updated.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(category) {
    if (!window.confirm(`Delete category “${category}”? Items keep their category text until you edit them.`)) return;
    setBusy(true);
    setError("");
    try {
      const data = await api("/api/inventory/categories", { method: "DELETE", body: { name: category } });
      setCategories(data.categories);
      setNotice(`Removed “${data.category}”.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!categories) return error ? <p className="error">{error}</p> : <Loading />;

  return (
    <div className="inv-categories">
      <div className="inv-flow-head">
        <div>
          <Link className="inv-back" to="/admin/inventory">
            ← Inventory
          </Link>
          <h2>Categories</h2>
          <p className="muted">Used when adding inventory and shown in the shop filters.</p>
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      {notice && <p className="notice">{notice}</p>}
      <form className="panel inv-category-form" onSubmit={add}>
        <label>
          New category
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="e.g. Denim" required />
        </label>
        <button className="btn solid" type="submit" disabled={busy || name.trim().length < 2}>
          Add
        </button>
      </form>
      <ul className="admin-table inv-category-list">
        {categories.map((category) => (
          <li key={category}>
            <span>{category}</span>
            <div className="inv-row-actions">
              <button type="button" className="text-link" disabled={busy} onClick={() => rename(category)}>
                Rename
              </button>
              <button type="button" className="text-link inv-danger" disabled={busy} onClick={() => remove(category)}>
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
