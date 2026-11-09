import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { useDocumentTitle } from "../hooks";
import { useAuth } from "../context/AuthContext";
import { PageHeader } from "../components/ui";

export function Login() {
  useDocumentTitle("Sign in");
  const { login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const user = await login(form.email, form.password);
      const next = params.get("next");
      let destination = "";
      if (next && next.startsWith("/") && !next.startsWith("//")) {
        const url = new URL(next, window.location.origin);
        if (url.origin === window.location.origin) {
          destination = `${url.pathname}${url.search}${url.hash}`;
        }
      }
      navigate(destination || (user.role === "admin" ? "/admin" : "/"));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page wrap narrow">
      <PageHeader kicker="Account" title="Sign in" lede="Access your wishlist, wardrobe, planner, and orders." />
      <form className="panel stack" onSubmit={onSubmit}>
        {error && <p className="error">{error}</p>}
        <label>
          Email
          <input
            type="email"
            required
            autoComplete="email"
            value={form.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
          />
        </label>
        <label>
          Password
          <input
            type="password"
            required
            autoComplete="current-password"
            value={form.password}
            onChange={(event) => setForm({ ...form, password: event.target.value })}
          />
        </label>
        <button className="btn solid" type="submit" disabled={busy}>
          {busy ? "Signing in" : "Sign in"}
        </button>
        <p className="muted">
          <Link to="/forgot">Forgot password</Link>
          {" · "}
          <Link to="/signup">Create account</Link>
        </p>
      </form>
    </div>
  );
}

export function Signup() {
  useDocumentTitle("Create account");
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await signup(form);
      navigate("/quiz");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page wrap narrow">
      <PageHeader
        kicker="Account"
        title="Create your StyleARZ account"
        lede="Optional style quiz after signup. You can skip it and go straight to the shop."
      />
      <form className="panel stack" onSubmit={onSubmit}>
        {error && <p className="error">{error}</p>}
        <label>
          Full name
          <input
            required
            autoComplete="name"
            maxLength={80}
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
        </label>
        <label>
          Email
          <input
            type="email"
            required
            autoComplete="email"
            value={form.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
          />
        </label>
        <label>
          Password
          <input
            type="password"
            required
            minLength={6}
            autoComplete="new-password"
            value={form.password}
            onChange={(event) => setForm({ ...form, password: event.target.value })}
          />
        </label>
        <button className="btn solid" type="submit" disabled={busy}>
          {busy ? "Creating account" : "Create account"}
        </button>
        <p className="muted">
          Already registered? <Link to="/login">Sign in</Link>
          {" · "}
          After creating an account you can take the optional style quiz, or skip it.
        </p>
      </form>
    </div>
  );
}

export function Forgot() {
  useDocumentTitle("Forgot password");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const data = await api("/api/auth/forgot", { method: "POST", body: { email } });
      setMessage(data.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page wrap narrow">
      <PageHeader kicker="Account" title="Reset password" lede="Use the reset code from the server console in local development. Email delivery is configured separately in production." />
      <form className="panel stack" onSubmit={onSubmit}>
        {error && <p className="error">{error}</p>}
        {message && <p className="notice">{message}</p>}
        <label>
          Email
          <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <button className="btn dark" type="submit" disabled={busy}>
          {busy ? "Requesting" : "Request reset code"}
        </button>
        <p className="muted">
          Already have a code? <Link to={`/reset?email=${encodeURIComponent(email) || ""}`}>Continue to reset</Link>
          {" · "}
          <Link to="/login">Back to sign in</Link>
        </p>
      </form>
    </div>
  );
}

export function Reset() {
  useDocumentTitle("Set new password");
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [form, setForm] = useState({
    email: params.get("email") || "",
    code: "",
    password: "",
  });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [redirectToLogin, setRedirectToLogin] = useState(false);

  useEffect(() => {
    if (!redirectToLogin) return undefined;
    const timeout = window.setTimeout(() => navigate("/login"), 1200);
    return () => window.clearTimeout(timeout);
  }, [redirectToLogin, navigate]);

  async function onSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const data = await api("/api/auth/reset", { method: "POST", body: form });
      setMessage(data.message);
      setRedirectToLogin(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page wrap narrow">
      <PageHeader kicker="Account" title="Choose a new password" lede="Enter the reset code and a password of at least six characters." />
      <form className="panel stack" onSubmit={onSubmit}>
        {error && <p className="error">{error}</p>}
        {message && <p className="notice">{message}</p>}
        <label>
          Email
          <input
            type="email"
            required
            value={form.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
          />
        </label>
        <label>
          Reset code
          <input required value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} />
        </label>
        <label>
          New password
          <input
            type="password"
            required
            minLength={6}
            value={form.password}
            onChange={(event) => setForm({ ...form, password: event.target.value })}
          />
        </label>
        <button className="btn solid" type="submit" disabled={busy}>
          {busy ? "Updating" : "Update password"}
        </button>
      </form>
    </div>
  );
}
