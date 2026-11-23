import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { WINTER_COLLECTION } from "../home/features";

const SLIDE_MS = 3200;

export default function HeroWinterStrip() {
  const images = WINTER_COLLECTION;
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState("enter");

  useEffect(() => {
    if (images.length < 2) return undefined;
    let exitTimer;
    const timer = window.setInterval(() => {
      setPhase("exit");
      exitTimer = window.setTimeout(() => {
        setIndex((current) => (current + 1) % images.length);
        setPhase("enter");
      }, 420);
    }, SLIDE_MS);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(exitTimer);
    };
  }, [images.length]);

  if (!images.length) return null;

  const current = images[Math.min(index, images.length - 1)];

  return (
    <Link to="/shop?category=Knitwear" className="hero-winter-strip" aria-label="In-store winter cloth available now">
      <div className="hero-winter-strip-copy">
        <p className="hero-winter-kicker">In store now</p>
        <strong>Winter cloth available on the floor</strong>
      </div>
      <div className="hero-winter-slider" aria-hidden="true">
        <div key={`${current.src}-${phase}`} className={`hero-winter-slide is-${phase}`}>
          <img src={current.src} alt="" loading="lazy" decoding="async" />
        </div>
        <div className="hero-winter-slide-dots">
          {images.map((item, dotIndex) => (
            <span key={item.src} className={dotIndex === index ? "is-active" : ""} />
          ))}
        </div>
      </div>
    </Link>
  );
}
