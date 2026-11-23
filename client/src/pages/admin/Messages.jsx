import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api";
import { prettyDateTime } from "../../format";
import { Loading } from "../../components/ui";

export default function Messages() {
  const [audiences, setAudiences] = useState([]);
  const [counts, setCounts] = useState({});
  const [broadcasts, setBroadcasts] = useState([]);
  const [sms, setSms] = useState(null);
  const [audience, setAudience] = useState("offer_customers");
  const [phonesText, setPhonesText] = useState("");
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  function load() {
    setLoading(true);
    api("/api/admin/messages")
      .then((data) => {
        setAudiences(Array.isArray(data.audiences) ? data.audiences : []);
        setCounts(data.counts || {});
        setBroadcasts(Array.isArray(data.broadcasts) ? data.broadcasts : []);
        setSms(data.sms || null);
        setError("");
      })
      .catch((err) => setError(err.message || "Could not load messages."))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  async function runPreview(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    setPreview(null);
    try {
      const data = await api("/api/admin/messages/preview", {
        method: "POST",
        body: { audience, message, phonesText },
      });
      setPreview(data);
      setNotice(`Preview ready · ${data.recipientCount} recipient${data.recipientCount === 1 ? "" : "s"}.`);
    } catch (err) {
      setError(err.message || "Preview failed.");
    } finally {
      setBusy(false);
    }
  }

  async function sendNow() {
    if (!preview?.recipientCount) {
      setError("Run Preview first.");
      return;
    }
    const ok = window.confirm(
      `Send this SMS to ${preview.recipientCount} number${preview.recipientCount === 1 ? "" : "s"}?\n\nProvider: ${
        sms?.provider || "log"
      }\nThis uses your SMS balance when the gateway is live.`
    );
    if (!ok) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const data = await api("/api/admin/messages/send", {
        method: "POST",
        body: { audience, message, phonesText },
      });
      setNotice(`Sent ${data.sent}/${data.recipientCount}${data.failed ? ` · ${data.failed} failed` : ""}.`);
      setPreview(null);
      load();
    } catch (err) {
      setError(err.message || "Send failed.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Loading />;

  return (
    <div className="admin-messages">
      <section className="admin-settings-card">
        <h2>Bulk SMS</h2>
        <p className="muted">
          Notify inauguration guests or POS customers about festive offers. Uses the same SMS gateway as invoice SMS.
        </p>
        <p className="muted">
          Gateway: <strong>{sms?.provider || "log"}</strong>
          {sms?.configured === false ? " · not configured" : ""}
          {" · "}
          Sender: <strong>{sms?.senderPhone || "not set"}</strong>
          {" · "}
          <Link to="/admin/settings">SMS settings</Link>
        </p>

        <form className="admin-offer-form" onSubmit={runPreview}>
          <fieldset className="admin-message-audience">
            <legend>Audience</legend>
            {audiences.map((entry) => (
              <label key={entry.id} className="usb-arm">
                <input
                  type="radio"
                  name="audience"
                  value={entry.id}
                  checked={audience === entry.id}
                  onChange={() => setAudience(entry.id)}
                />
                <span>
                  <strong>{entry.label}</strong>
                  {entry.id !== "manual" ? ` (${counts[entry.id] || 0})` : ""}
                  <br />
                  <span className="muted">{entry.description}</span>
                </span>
              </label>
            ))}
          </fieldset>

          {audience === "manual" ? (
            <label>
              Phone numbers
              <textarea
                rows={4}
                value={phonesText}
                onChange={(event) => setPhonesText(event.target.value)}
                placeholder={"017xxxxxxxx\n018xxxxxxxx"}
              />
            </label>
          ) : null}

          <label>
            Message
            <textarea
              rows={5}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              maxLength={480}
              placeholder="StyleARZ: Grand opening offer live in store. First 50 customers get special discounts. Visit today!"
              required
            />
          </label>
          <p className="muted">{message.length}/480</p>

          <div className="admin-offers-actions">
            <button className="btn line" type="submit" disabled={busy || !message.trim()}>
              {busy ? "Working…" : "Preview recipients"}
            </button>
            <button className="btn solid" type="button" disabled={busy || !preview?.recipientCount} onClick={sendNow}>
              Send SMS
            </button>
          </div>
        </form>

        {preview ? (
          <div className="admin-message-preview">
            <p>
              <strong>{preview.recipientCount}</strong> recipients · provider <strong>{preview.provider}</strong>
            </p>
            {preview.sample?.length ? (
              <p className="muted">Sample: {preview.sample.join(", ")}</p>
            ) : null}
          </div>
        ) : null}

        {error && <p className="error">{error}</p>}
        {notice && <p className="notice">{notice}</p>}
      </section>

      <section className="admin-settings-card">
        <h3>Recent broadcasts</h3>
        {!broadcasts.length ? (
          <p className="muted">No broadcasts yet.</p>
        ) : (
          <div className="admin-offers-table-wrap">
            <table className="admin-offers-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Audience</th>
                  <th>Sent</th>
                  <th>Failed</th>
                  <th>Message</th>
                </tr>
              </thead>
              <tbody>
                {broadcasts.map((row) => (
                  <tr key={row.id}>
                    <td>{row.createdAt ? prettyDateTime(row.createdAt) : "—"}</td>
                    <td>{row.audience}</td>
                    <td>
                      {row.sent}/{row.recipientCount}
                    </td>
                    <td>{row.failed || 0}</td>
                    <td>{String(row.message || "").slice(0, 80)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
