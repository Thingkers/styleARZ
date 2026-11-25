/**
 * Backup: previous 3-card flip hero deck.
 * Restored automatically when WINTER_HERO_ENABLED is false.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

const FLIP_MS = 5200;

export default function HeroOfferDeckFlip({ deck }) {
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
                <span className="hero-offer-card-num">{card.number})</span>
                <div className="hero-offer-card-body">
                  <p className="hero-offer-card-who">{card.title}</p>
                  <p className="hero-offer-card-pct">{card.highlight}</p>
                  <p className="hero-offer-card-life">{card.detail}</p>
                </div>
              </div>
              <div className="hero-offer-card-face hero-offer-card-back">
                <span className="hero-offer-card-num">{card.number})</span>
                <div className="hero-offer-card-body">
                  <p className="hero-offer-card-who">In store only</p>
                  <p className="hero-offer-card-pct">{card.highlight}</p>
                  <p className="hero-offer-card-life">{card.detail}</p>
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>

      {deck.gift ? <p className="hero-offer-gift">{deck.gift.text}</p> : null}

      <div className="hero-actions hero-offer-actions">
        <Link className="btn solid" to={deck.ctaHref || "/shop"}>
          {deck.ctaLabel || "Shop casuals"}
        </Link>
        {deck.posLive ? <span className="hero-offer-live">Live in store</span> : null}
      </div>
    </div>
  );
}
