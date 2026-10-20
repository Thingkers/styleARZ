import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useDocumentTitle } from "../hooks";
import { money } from "../format";
import ProductCard from "../components/ProductCard";
import { PageHeader } from "../components/ui";

const STEPS = [
  {
    key: "who",
    kicker: "Collection",
    title: "Who are you dressing?",
    options: ["Men", "Women", "Children", "Mix"],
  },
  {
    key: "life",
    kicker: "Occasion",
    title: "Where does the clothing need to work?",
    options: ["Office", "Evening", "Weekend", "Travel", "Celebration"],
  },
  {
    key: "palette",
    kicker: "Colour",
    title: "Which palette feels like you?",
    options: ["Neutrals", "Earth", "Deep", "Clear"],
  },
  {
    key: "fit",
    kicker: "Fit",
    title: "How should it sit?",
    options: [
      { value: "tailored", label: "Tailored" },
      { value: "mixed", label: "Mixed" },
      { value: "relaxed", label: "Relaxed" },
    ],
  },
  {
    key: "budget",
    kicker: "Budget",
    title: "What should a look cost?",
    options: ["Under ৳8,000", "৳8,000–৳15,000", "৳15,000 and above"],
  },
  {
    key: "priority",
    kicker: "Priority",
    title: "What matters most?",
    options: ["Quality cloth", "Versatility", "Occasion impact"],
  },
];

export function Quiz() {
  useDocumentTitle("Style quiz");
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const current = STEPS[step];

  function choose(value) {
    setAnswers((prev) => ({ ...prev, [current.key]: value }));
  }

  async function next() {
    if (!answers[current.key]) {
      setError("Choose one to continue.");
      return;
    }
    setError("");
    if (step < STEPS.length - 1) {
      setStep(step + 1);
      return;
    }
    setBusy(true);
    try {
      const data = await api("/api/quiz", { method: "POST", body: { answers } });
      localStorage.setItem("sa-quiz", JSON.stringify(data));
      navigate("/quiz/results");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page wrap narrow">
      <PageHeader
        kicker={`Style quiz · ${step + 1} of ${STEPS.length}`}
        title={current.title}
        lede="Optional, and useful. Your answers shape a short edit from the Grade A collections."
      />
      <p className="kicker">{current.kicker}</p>
      <div className="choice-grid">
        {current.options.map((option) => {
          const value = typeof option === "string" ? option : option.value;
          const label = typeof option === "string" ? option : option.label;
          return (
            <button
              key={value}
              type="button"
              className={answers[current.key] === value ? "on" : ""}
              onClick={() => choose(value)}
            >
              {label}
            </button>
          );
        })}
      </div>
      {error && <p className="error">{error}</p>}
      <div className="hero-actions">
        {step > 0 && (
          <button type="button" className="btn line" onClick={() => setStep(step - 1)}>
            Back
          </button>
        )}
        <button type="button" className="btn solid" onClick={next} disabled={busy}>
          {step === STEPS.length - 1 ? (busy ? "Preparing" : "See the edit") : "Continue"}
        </button>
        <Link to="/shop">Skip to the shop</Link>
      </div>
    </div>
  );
}

export function QuizResults() {
  useDocumentTitle("Your edit");
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem("sa-quiz") || "null");
  } catch {
    saved = null;
  }
  const result = saved?.result;
  const products = saved?.products || [];

  if (!result) {
    return (
      <div className="page wrap narrow">
        <PageHeader kicker="Style quiz" title="No edit yet" lede="Answer a few questions and the house will suggest a starting wardrobe." />
        <Link className="btn dark" to="/quiz">Start the quiz</Link>
      </div>
    );
  }

  return (
    <div className="page wrap">
      <PageHeader kicker="Your edit" title={result.title} lede={result.summary}>
        <Link className="btn line" to="/quiz">Retake</Link>
      </PageHeader>
      <ul className="answer-row">
        {Object.entries(result.answers || {}).map(([key, value]) => (
          <li key={key}>
            <span>{key}</span>
            <strong>{value}</strong>
          </li>
        ))}
      </ul>
      <div className="product-grid">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
      <p className="muted">Prices in the edit start from {products[0] ? money(Math.min(...products.map((item) => item.price))) : "—"}.</p>
    </div>
  );
}
