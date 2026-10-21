import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api";
import { Loading } from "../../components/ui";

const AUDIENCES = ["Men", "Women", "Children", "Unisex"];
const MAX_EDGE = 1600;
const MAX_BYTES = 1.9 * 1024 * 1024;

function toJpeg(source, width, height) {
  const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext("2d");
  context.fillStyle = "#222";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingQuality = "high";
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  for (const quality of [0.86, 0.74, 0.6, 0.45]) {
    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    if (dataUrl.length * 0.75 <= MAX_BYTES) return dataUrl;
  }
  throw new Error("That photo is too large. Try a smaller image.");
}

async function photoFromFile(file) {
  if (file.type && !file.type.startsWith("image/")) throw new Error("Choose an image file.");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode().catch(() => {
      throw new Error("Couldn't read that image. Try a JPEG or PNG photo.");
    });
    return toJpeg(image, image.naturalWidth, image.naturalHeight);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function HomeCollections() {
  const [collections, setCollections] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState("");

  function load() {
    return api("/api/admin/home-collections")
      .then((data) => {
        setCollections(data.collections);
        const next = {};
        data.collections.forEach((entry) => {
          next[entry.id] = {
            kicker: entry.kicker,
            title: entry.title,
            audience: entry.audience,
          };
        });
        setDrafts(next);
      })
      .catch((err) => setError(err.message));
  }

  useEffect(() => {
    load();
  }, []);

  function setDraft(id, patch) {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  async function save(id) {
    setBusyId(id);
    setError("");
    setNotice("");
    try {
      const data = await api(`/api/admin/home-collections/${id}`, {
        method: "PATCH",
        body: drafts[id],
      });
      setCollections(data.collections);
      setNotice("Saved. Refresh the homepage to see it.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId("");
    }
  }

  async function onImage(id, event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusyId(id);
    setError("");
    setNotice("");
    try {
      const image = await photoFromFile(file);
      const data = await api(`/api/admin/home-collections/${id}`, {
        method: "PATCH",
        body: { image },
      });
      setCollections(data.collections);
      setNotice("Image updated.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId("");
    }
  }

  if (!collections) return error ? <p className="error">{error}</p> : <Loading />;

  return (
    <div className="home-collections-admin">
      <div className="inv-flow-head">
        <div>
          <Link className="inv-back" to="/admin">
            ← Admin
          </Link>
          <h2>Home collections</h2>
          <p className="muted">
            These three cards sit under the hero. Each card links to the shop filtered by audience. Products in the grid below
            still use the Home checkbox on Products.
          </p>
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      {notice && <p className="notice">{notice}</p>}
      <ul className="home-collections-grid">
        {collections.map((entry) => {
          const draft = drafts[entry.id] || entry;
          const busy = busyId === entry.id;
          return (
            <li key={entry.id} className="panel">
              <div className="home-collections-preview">
                <img src={entry.image} alt="" />
                <div>
                  <p className="kicker">{draft.kicker || entry.kicker}</p>
                  <strong>{draft.title || entry.title}</strong>
                </div>
              </div>
              <label>
                Label
                <input
                  value={draft.kicker}
                  onChange={(e) => setDraft(entry.id, { kicker: e.target.value })}
                  maxLength={40}
                  disabled={busy}
                />
              </label>
              <label>
                Line under label
                <input
                  value={draft.title}
                  onChange={(e) => setDraft(entry.id, { title: e.target.value })}
                  maxLength={80}
                  disabled={busy}
                />
              </label>
              <label>
                Shop filter
                <select
                  value={draft.audience}
                  onChange={(e) => setDraft(entry.id, { audience: e.target.value })}
                  disabled={busy}
                >
                  {AUDIENCES.map((audience) => (
                    <option key={audience} value={audience}>
                      {audience}
                    </option>
                  ))}
                </select>
              </label>
              <label className="home-collections-upload">
                Replace image
                <input type="file" accept="image/*" onChange={(e) => onImage(entry.id, e)} disabled={busy} />
              </label>
              <button className="btn solid" type="button" disabled={busy} onClick={() => save(entry.id)}>
                {busy ? "Saving…" : "Save card"}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
