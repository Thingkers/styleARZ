import { useEffect, useState } from "react";

const FLIP_MS = 4800;

export default function HeroOfferSlides({ deck }) {
  const cards = Array.isArray(deck?.cards) ? deck.cards.slice(0, 3) : [];
  const [flipped, setFlipped] = useState([false, false, false]);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    const enter = window.setTimeout(() => setEntered(true), 60);
    return () => window.clearTimeout(enter);
  }, [cards.length]);

  useEffect(() => {
    if (cards.length < 1) return undefined;
    let step = 0;
    const timer = window.setInterval(() => {
      const cardIndex = step % cards.length;
      setFlipped((current) => current.map((value, index) => (index === cardIndex ? !value : value)));
      step += 1;
    }, FLIP_MS);
    return () => window.clearInterval(timer);
  }, [cards.length]);

  if (!cards.length) return null;

  return (
    <div className={`hero-offer-deck ${entered ? "is-in" : ""}`} aria-label={deck.headline || "Current offers"}>
      <div className="hero-offer-deck-head">
        <p className="hero-offer-kicker">Grand opening</p>
        <h2 className="hero-offer-title">{deck.headline || "Grand Opening Offer"}</h2>
        {deck.note ? <p className="hero-offer-note">{deck.note}</p> : null}
        <p className="hero-offer-explain">Discounts apply in order as the first 50 customers check out in store.</p>
      </div>

      <div className="hero-offer-cards">
        {cards.map((card, index) => (
          <article
            key={card.id || index}
            className={`hero-offer-card ${flipped[index] ? "is-flipped" : ""}`}
            style={{ "--card-delay": `${index * 140}ms` }}
          >
            <div className="hero-offer-card-inner">
              <div className="hero-offer-card-face hero-offer-card-front">
                <div className="hero-offer-card-body">
                  <p className="hero-offer-card-badge">{card.badge || "In store only"}</p>
                  <p className="hero-offer-card-who">{card.title}</p>
                  {card.subtitle ? <p className="hero-offer-card-sub">{card.subtitle}</p> : null}
                  <p className="hero-offer-card-pct">{card.highlight}</p>
                  <p className="hero-offer-card-life">{card.detail}</p>
                </div>
              </div>
              <div className="hero-offer-card-face hero-offer-card-back">
                <div className="hero-offer-card-body">
                  <p className="hero-offer-card-badge">{card.badge || "In store only"}</p>
                  <p className="hero-offer-card-who">{card.title}</p>
                  {card.subtitle ? <p className="hero-offer-card-sub">{card.subtitle}</p> : null}
                  <p className="hero-offer-card-pct">{card.highlight}</p>
                  <p className="hero-offer-card-life">{card.detail}</p>
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
