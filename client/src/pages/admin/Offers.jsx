import { useEffect, useRef, useState } from "react";
import { api } from "../../api";
import { Loading } from "../../components/ui";
import { prettyDateTime } from "../../format";

function rulesToText(rules) {
  return Array.isArray(rules) ? rules.join("\n") : "";
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Could not read that image."));
    reader.readAsDataURL(file);
  });
}

export default function Offers() {
  const fileRef = useRef(null);
  const [campaign, setCampaign] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [activeNow, setActiveNow] = useState(false);
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  function syncForm(next) {
    if (!next) {
      setForm(null);
      return;
    }
    setForm({
      name: next.name || "",
      publicHeadline: next.publicHeadline || "",
      publicLede: next.publicLede || "",
      publicRules: rulesToText(next.publicRules),
      publicImage: next.publicImage || "",
      publicCtaLabel: next.publicCtaLabel || "",
      publicCtaHref: next.publicCtaHref || "",
      inaugurationNote: next.inaugurationNote || "",
      giftMinSubtotal: next.giftMinSubtotal ?? 0,
      showOnWebsite: next.showOnWebsite !== false,
      active: Boolean(next.active),
    });
  }

  function applyPayload(data) {
    const next = data.campaign || null;
    setCampaign(next);
    setCampaigns(Array.isArray(data.campaigns) ? data.campaigns : []);
    setTemplates(Array.isArray(data.templates) ? data.templates : []);
    setCustomers(Array.isArray(data.customers) ? data.customers : []);
    setActiveNow(Boolean(data.activeNow));
    syncForm(next);
  }

  function load(id) {
    setLoading(true);
    const suffix = id ? `?id=${encodeURIComponent(id)}` : "";
    api(`/api/admin/offers/campaign${suffix}`)
      .then((data) => {
        applyPayload(data);
        setError("");
      })
      .catch((err) => setError(err.message || "Could not load offers."))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  async function patch(body, successMessage) {
    if (!campaign) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const data = await api("/api/admin/offers/campaign", {
        method: "PATCH",
        body: { ...body, id: campaign.id },
      });
      applyPayload(data);
      setNotice(successMessage);
    } catch (err) {
      setError(err.message || "Could not update campaign.");
    } finally {
      setBusy(false);
    }
  }

  async function saveWebsiteCopy(event) {
    event.preventDefault();
    if (!form) return;
    await patch(
      {
        name: form.name,
        publicHeadline: form.publicHeadline,
        publicLede: form.publicLede,
        publicRules: form.publicRules,
        publicCtaLabel: form.publicCtaLabel,
        publicCtaHref: form.publicCtaHref,
        inaugurationNote: form.inaugurationNote,
        giftMinSubtotal: Number(form.giftMinSubtotal),
        showOnWebsite: form.showOnWebsite,
      },
      "Offer saved. Hero slides update from the options list."
    );
  }

  async function applyTemplate(templateId, asNew = false) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const data = await api(`/api/admin/offers/templates/${encodeURIComponent(templateId)}/apply`, {
        method: "POST",
        body: { asNew },
      });
      applyPayload(data);
      setNotice(asNew ? "Template added as a new offer." : "Template applied to this campaign.");
    } catch (err) {
      setError(err.message || "Could not apply template.");
    } finally {
      setBusy(false);
    }
  }

  async function createBlank() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const data = await api("/api/admin/offers/campaign", {
        method: "POST",
        body: {
          name: "New offer",
          publicHeadline: "New offer",
          publicLede: "",
          publicRules: ["Option one", "Option two"],
          showOnWebsite: true,
        },
      });
      applyPayload(data);
      setNotice("New offer created. Edit the options below.");
    } catch (err) {
      setError(err.message || "Could not create offer.");
    } finally {
      setBusy(false);
    }
  }

  async function uploadImage(event) {
    const file = event.target.files && event.target.files[0];
    event.target.value = "";
    if (!file || !campaign) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const image = await readFileAsDataUrl(file);
      const data = await api(`/api/admin/offers/campaign/${encodeURIComponent(campaign.id)}/image`, {
        method: "POST",
        body: { image },
      });
      applyPayload(data);
      setNotice("Image saved on this offer (kept for admin; hero uses animated text options).");
    } catch (err) {
      setError(err.message || "Could not upload image.");
    } finally {
      setBusy(false);
    }
  }

  async function removeCampaign() {
    if (!campaign || campaign.id === "offer_grand_opening") return;
    if (!window.confirm(`Delete offer “${campaign.name}”?`)) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const data = await api(`/api/admin/offers/campaign/${encodeURIComponent(campaign.id)}`, {
        method: "DELETE",
      });
      applyPayload(data);
      setNotice("Offer deleted.");
    } catch (err) {
      setError(err.message || "Could not delete offer.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Loading />;
  if (!campaign || !form) return <p className="error">No offer campaign loaded.</p>;

  return (
    <div className="admin-offers">
      <section className="admin-offers-card">
        <h2>Offers</h2>
        <p className="muted">
          Each offer’s options animate in the homepage hero (fly-in slides). Add as many offers as you need from a
          template or a blank card. Optional image upload is stored for reference — it is not pasted into the hero.
        </p>
        <div className="admin-offers-actions">
          <button className="btn solid" type="button" disabled={busy} onClick={createBlank}>
            Add blank offer
          </button>
          {templates.map((tmpl) => (
            <button
              key={tmpl.id}
              className="btn line"
              type="button"
              disabled={busy}
              onClick={() => applyTemplate(tmpl.id, true)}
            >
              Add “{tmpl.name}” from template
            </button>
          ))}
        </div>
        <ul className="admin-offer-templates">
          {campaigns.map((entry) => (
            <li key={entry.id}>
              <div>
                <strong>{entry.name}</strong>
                <p className="muted">
                  {entry.showOnWebsite ? "On website" : "Hidden"} · {(entry.publicRules || []).length} options
                  {entry.id === campaign.id ? " · editing" : ""}
                </p>
              </div>
              <button className="btn line" type="button" disabled={busy || entry.id === campaign.id} onClick={() => load(entry.id)}>
                Edit
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="admin-offers-card">
        <h2>{campaign.name}</h2>
        <p>
          POS status:{" "}
          <strong className={activeNow && campaign.active ? "admin-offers-on" : "admin-offers-off"}>
            {activeNow && campaign.id === "offer_grand_opening"
              ? "Live on POS now"
              : campaign.active
                ? "Saved active (POS)"
                : "POS off"}
          </strong>
        </p>
        <p className="muted">
          {campaign.id === "offer_grand_opening"
            ? `Slots claimed: ${campaign.claimedCount || 0} / ${campaign.maxSlots || 50}`
            : "Custom website offer (POS tiers only apply on Grand Opening)."}
          {campaign.startsAt ? ` · starts ${prettyDateTime(campaign.startsAt)}` : ""}
        </p>

        <div className="admin-offers-actions">
          {campaign.id === "offer_grand_opening" && (
            <>
              <button
                className="btn solid"
                type="button"
                disabled={busy}
                onClick={() => patch({ active: !campaign.active }, campaign.active ? "POS turned off." : "POS turned on.")}
              >
                {campaign.active ? "Turn POS off" : "Turn POS on"}
              </button>
              <button
                className="btn line"
                type="button"
                disabled={busy}
                onClick={() =>
                  patch({ active: true, startsAt: new Date().toISOString(), endsAt: null }, "POS campaign started now.")
                }
              >
                Start POS now
              </button>
              <button className="btn line" type="button" disabled={busy} onClick={() => applyTemplate("tmpl_grand_opening", false)}>
                Reset from Grand Opening template
              </button>
            </>
          )}
          <button
            className="btn line"
            type="button"
            disabled={busy}
            onClick={() =>
              patch(
                { showOnWebsite: !campaign.showOnWebsite },
                campaign.showOnWebsite ? "Hidden from hero." : "Showing in hero slides."
              )
            }
          >
            {campaign.showOnWebsite ? "Hide from hero" : "Show in hero"}
          </button>
          {campaign.id !== "offer_grand_opening" && (
            <button className="btn line" type="button" disabled={busy} onClick={removeCampaign}>
              Delete offer
            </button>
          )}
          <button className="text-link" type="button" disabled={busy} onClick={() => load(campaign.id)}>
            Refresh
          </button>
        </div>
      </section>

      <section className="admin-offers-card">
        <h3>Hero options & copy</h3>
        <p className="muted">One line per option — each becomes a fly-in slide in the hero.</p>
        <form className="admin-offer-form" onSubmit={saveWebsiteCopy}>
          <label>
            Internal name
            <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </label>
          <label>
            Public headline
            <input
              value={form.publicHeadline}
              onChange={(event) => setForm({ ...form, publicHeadline: event.target.value })}
            />
          </label>
          <label>
            Short description (used if no options)
            <textarea
              rows={2}
              value={form.publicLede}
              onChange={(event) => setForm({ ...form, publicLede: event.target.value })}
            />
          </label>
          <label>
            Options (one per line → hero slides)
            <textarea
              rows={6}
              value={form.publicRules}
              onChange={(event) => setForm({ ...form, publicRules: event.target.value })}
              placeholder={"First 10 customers: 20% + lifetime 10%\nNext 20 customers: 15% + lifetime 10%"}
            />
          </label>
          <div className="admin-offer-form-row">
            <label>
              CTA label
              <input
                value={form.publicCtaLabel}
                onChange={(event) => setForm({ ...form, publicCtaLabel: event.target.value })}
              />
            </label>
            <label>
              CTA link
              <input
                value={form.publicCtaHref}
                onChange={(event) => setForm({ ...form, publicCtaHref: event.target.value })}
              />
            </label>
          </div>
          <label>
            Date note
            <input
              value={form.inaugurationNote}
              onChange={(event) => setForm({ ...form, inaugurationNote: event.target.value })}
            />
          </label>
          {campaign.id === "offer_grand_opening" && (
            <label>
              Gift minimum (৳)
              <input
                type="number"
                min="0"
                value={form.giftMinSubtotal}
                onChange={(event) => setForm({ ...form, giftMinSubtotal: event.target.value })}
              />
            </label>
          )}
          <label className="usb-arm">
            <input
              type="checkbox"
              checked={form.showOnWebsite}
              onChange={(event) => setForm({ ...form, showOnWebsite: event.target.checked })}
            />
            Show options in homepage hero
          </label>
          <button className="btn solid" type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save offer"}
          </button>
        </form>

        <div className="admin-offer-upload">
          <p className="kicker">Optional image (admin reference)</p>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={uploadImage} />
          <button className="btn line" type="button" disabled={busy} onClick={() => fileRef.current?.click()}>
            Upload image
          </button>
          {campaign.publicImage ? (
            <div className="admin-offer-preview">
              <img src={campaign.publicImage} alt="" />
            </div>
          ) : (
            <p className="muted">No image uploaded.</p>
          )}
        </div>
      </section>

      {campaign.id === "offer_grand_opening" && (
        <section className="admin-offers-card">
          <h3>Claimed inauguration guests</h3>
          {!customers.length ? (
            <p className="muted">No phones have claimed a slot yet.</p>
          ) : (
            <div className="admin-offers-table-wrap">
              <table className="admin-offers-table">
                <thead>
                  <tr>
                    <th>Slot</th>
                    <th>Phone</th>
                    <th>Today %</th>
                    <th>Lifetime %</th>
                    <th>First sale</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((entry) => (
                    <tr key={entry.id}>
                      <td>#{entry.slot}</td>
                      <td>{entry.phone}</td>
                      <td>{entry.inauguralPercent}%</td>
                      <td>{entry.lifetimePercent}%</td>
                      <td>{entry.createdAt ? prettyDateTime(entry.createdAt) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {error && <p className="error">{error}</p>}
      {notice && <p className="notice">{notice}</p>}
    </div>
  );
}
