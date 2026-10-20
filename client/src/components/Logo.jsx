import { Link } from "react-router-dom";

export default function Logo({ large = false }) {
  return (
    <Link to="/" className={`logo ${large ? "logo-large" : ""}`} aria-label="StyleARZ home">
      <span className="logo-lockup" aria-hidden="true">
        <span className="logo-style">STYLE</span>
        <span className="logo-arz">ARZ</span>
      </span>
      <span className="logo-tag">your personal fashion statement</span>
    </Link>
  );
}
