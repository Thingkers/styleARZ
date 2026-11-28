import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api";
import { Loading } from "../../components/ui";
import PrinterSettingsForm from "./PrinterSettingsForm";

export default function Settings() {
  const [smsSenderPhone, setSmsSenderPhone] = useState("");
  const [provider, setProvider] = useState("log");
  const [configured, setConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  function load() {
    setLoading(true);
    api("/api/admin/settings")
      .then((data) => {
        setSmsSenderPhone(data.settings?.smsSenderPhone || "");
        setProvider(data.sms?.provider || "log");
        setConfigured(data.sms?.configured !== false);
        setError("");
      })
      .catch((err) => setError(err.message || "Could not load settings."))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await api("/api/admin/settings", {
        method: "PUT",
        body: { smsSenderPhone },
      });
      setSmsSenderPhone(result.settings?.smsSenderPhone || "");
      if (result.sms?.provider) setProvider(result.sms.provider);
      if (result.sms?.configured !== undefined) setConfigured(result.sms.configured !== false);
      setNotice("SMS sender number saved. Invoice and bulk SMS use this number’s balance.");
    } catch (err) {
      setError(err.message || "Could not save settings.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Loading />;

  return (
    <div className="admin-settings">
      <form className="admin-settings-card" onSubmit={save}>
        <h2>SMS</h2>
        <p className="muted">
          Save the shop mobile used as the SMS sender / balance account. Used for POS invoice SMS and{" "}
          <Link to="/admin/messages">bulk Messages</Link>.
        </p>
        <label>
          SMS sender mobile (balance account)
          <input
            value={smsSenderPhone}
            onChange={(event) => setSmsSenderPhone(event.target.value)}
            placeholder="01XXXXXXXXX"
            inputMode="tel"
            autoComplete="tel"
          />
        </label>
        <p className="muted">
          Gateway: <strong>{provider}</strong>
          {configured ? "" : " · not fully configured in server env"}
          {provider === "log" ? " · log mode (no real SMS until you set SMS_PROVIDER)" : ""}
        </p>
        {error && <p className="error">{error}</p>}
        {notice && <p className="notice">{notice}</p>}
        <button className="btn solid" type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save SMS number"}
        </button>
      </form>

      <PrinterSettingsForm />

      <section className="admin-settings-card">
        <h3>Connect a live gateway</h3>
        <ol className="admin-settings-steps">
          <li>Choose a Bangladesh SMS provider (or Twilio).</li>
          <li>
            In cPanel → Setup Node.js App → Environment, set{" "}
            <code>SMS_PROVIDER=http</code> (or <code>twilio</code>) plus the provider keys. See{" "}
            <code>docs/SMS_SETUP.md</code> in the repo.
          </li>
          <li>Save the sender number above, then Restart the Node app.</li>
          <li>
            Test one POS invoice SMS, then a 1–2 number blast from <Link to="/admin/messages">Messages</Link>.
          </li>
        </ol>
        <p className="muted">
          Until the gateway is set, <code>SMS_PROVIDER=log</code> only writes messages to the server log (safe for
          testing).
        </p>
      </section>
    </div>
  );
}
