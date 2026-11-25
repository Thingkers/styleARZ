import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api";
import { Loading } from "../../components/ui";
import { AUDIENCES, CATEGORY_AUDIENCE_RULES, allowedAudiencesForCategory, categoryName } from "./inventoryUtils";

export default function Categories() {
  const [categories, setCategories] = useState(null);
  const [audiences, setAudiences] = useState(AUDIENCES);
  const [rules, setRules] = useState(CATEGORY_AUDIENCE_RULES);
  const [name, setName] = useState("");
  const [selectedAudiences, setSelectedAudiences] = useState(["Women"]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const createAllowed = useMemo(() => allowedAudiencesForCategory(name, rules), [name, rules]);

  function load() {
    setError("");
    return api("/api/inventory/categories")
      .then((data) => {
        setCategories(data.categories);
        if (data.audiences?.length) setAudiences(data.audiences);
        if (data.rules) setRules(data.rules);
      })
      .catch((err) => setError(err.message));
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    setSelectedAudiences((current) => {
      const next = current.filter((entry) => createAllowed.includes(entry));
      return next.length ? next : createAllowed.slice(0, 1);
    });
  }, [createAllowed]);

  function toggleAudience(value, allowed) {
    if (!allowed.includes(value)) return;
    setSelectedAudiences((current) =>
      current.includes(value) ? current.filter((entry) => entry !== value) : [...current, value]
    );
  }

  async function add(event) {
    event.preventDefault();
    const allowed = allowedAudiencesForCategory(name, rules);
    const picked = selectedAudiences.filter((entry) => allowed.includes(entry));
    if (!picked.length) {
      setError(`“${name.trim() || "This category"}” only allows: ${allowed.join(", ")}.`);
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const data = await api("/api/inventory/categories", {
        method: "POST",
        body: { name, audiences: picked },
      });
      setCategories(data.categories);
      if (data.rules) setRules(data.rules);
      setName("");
      setNotice(`Added “${categoryName(data.category)}”.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function rename(entry) {
    const from = categoryName(entry);
    const to = window.prompt(`Rename category “${from}” to:`, from);
    if (to === null || !to.trim() || to.trim() === from) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const data = await api("/api/inventory/categories", {
        method: "PATCH",
        body: { from, to, audiences: entry.audiences },
      });
      setCategories(data.categories);
      setNotice(`Renamed to “${categoryName(data.category)}”. Inventory items using the old name were updated.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveAudiences(entry, nextAudiences) {
    const label = categoryName(entry);
    const allowed = allowedAudiencesForCategory(label, rules);
    const picked = nextAudiences.filter((value) => allowed.includes(value));
    if (!picked.length) {
      setError(`“${label}” only allows: ${allowed.join(", ")}.`);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const data = await api("/api/inventory/categories", {
        method: "PATCH",
        body: { from: label, to: label, audiences: picked },
      });
      setCategories(data.categories);
      setNotice(`Updated collections for “${label}”.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(entry) {
    const category = categoryName(entry);
    if (!window.confirm(`Delete category “${category}”? Items keep their category text until you edit them.`)) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const data = await api("/api/inventory/categories", { method: "DELETE", body: { name: category } });
      setCategories(data.categories);
      setNotice(`Removed “${categoryName(data.category)}”.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!categories) {
    if (!error) return <Loading />;
    return (
      <div>
        <p className="error">{error}</p>
        <button className="text-link" type="button" onClick={load}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="inv-categories">
      <div className="inv-flow-head">
        <div>
          <Link className="inv-back" to="/admin/inventory">
            ← Inventory
          </Link>
          <h2>Categories</h2>
          <p className="muted">
            Collections are locked to what makes sense — Saree stays Women-only, Panjabi stays Men/Children, and so on.
          </p>
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      {notice && <p className="notice">{notice}</p>}
      <form className="panel inv-category-form" onSubmit={add}>
        <label>
          New category
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="e.g. Denim" required disabled={busy} />
        </label>
        <fieldset className="inv-audience-fieldset">
          <legend>Collections</legend>
          <div className="inv-audience-picks" role="group" aria-label="Collections">
            {audiences.map((value) => {
              const allowed = createAllowed.includes(value);
              return (
                <label key={value} className={`inv-audience-chip ${allowed ? "" : "is-blocked"}`}>
                  <input
                    type="checkbox"
                    checked={selectedAudiences.includes(value)}
                    disabled={!allowed}
                    onChange={() => toggleAudience(value, createAllowed)}
                  />
                  {value}
                </label>
              );
            })}
          </div>
          {name.trim() && (
            <p className="muted inv-audience-hint">Allowed for “{name.trim()}”: {createAllowed.join(", ")}</p>
          )}
        </fieldset>
        <button className="btn solid" type="submit" disabled={busy || name.trim().length < 2}>
          Add
        </button>
      </form>
      <ul className="admin-table inv-category-list">
        {categories.map((entry) => {
          const label = categoryName(entry);
          const allowed = allowedAudiencesForCategory(label, rules);
          const selected = (Array.isArray(entry.audiences) ? entry.audiences : allowed).filter((value) =>
            allowed.includes(value)
          );
          return (
            <li key={label}>
              <div className="inv-category-row">
                <span className="inv-category-name">{label}</span>
                <div className="inv-audience-picks" role="group" aria-label={`${label} collections`}>
                  {audiences.map((value) => {
                    const canUse = allowed.includes(value);
                    return (
                      <label key={value} className={`inv-audience-chip ${canUse ? "" : "is-blocked"}`}>
                        <input
                          type="checkbox"
                          checked={selected.includes(value)}
                          disabled={busy || !canUse}
                          onChange={() => {
                            const next = selected.includes(value)
                              ? selected.filter((entryValue) => entryValue !== value)
                              : [...selected, value];
                            saveAudiences(entry, next);
                          }}
                        />
                        {value}
                      </label>
                    );
                  })}
                </div>
              </div>
              <div className="inv-row-actions">
                <button type="button" className="text-link" disabled={busy} onClick={() => rename(entry)}>
                  Rename
                </button>
                <button type="button" className="text-link inv-danger" disabled={busy} onClick={() => remove(entry)}>
                  Delete
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
