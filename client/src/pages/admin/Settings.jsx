import { useEffect, useState } from "react";
import { api } from "../../api";
import { Loading } from "../../components/ui";

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
      setNotice("SMS sender number saved. Invoice SMS will use this number’s balance.");
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
        <h2>Invoice SMS</h2>
        <p className="muted">
          Save the shop mobile number used to send invoice SMS. Messages are billed against that number’s SMS balance
          (via your SMS gateway account linked to it).
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
        </p>
        {error && <p className="error">{error}</p>}
        {notice && <p className="notice">{notice}</p>}
        <button className="btn solid" type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save SMS number"}
        </button>
      </form>
    </div>
  );
}
