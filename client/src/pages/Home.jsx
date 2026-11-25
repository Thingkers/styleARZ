import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useDocumentTitle } from "../hooks";
import ProductCard from "../components/ProductCard";
import { Loading } from "../components/ui";
import { FEATURED_CATEGORIES } from "../components/CategoryIcons";
import HeroOfferSlides from "../components/HeroOfferSlides";
import HeroWinterStrip from "../components/HeroWinterStrip";
import { WINTER_COLLECTION } from "../home/features";

export default function Home() {
  useDocumentTitle("");
  const [products, setProducts] = useState([]);
  const [collections, setCollections] = useState([]);
  const [looks, setLooks] = useState([]);
  const [posts, setPosts] = useState([]);
  const [deck, setDeck] = useState(null);
  const [quiz, setQuiz] = useState(null);
  const [loading, setLoading] = useState({
    products: true,
    collections: true,
    looks: true,
    posts: true,
  });
  const [errors, setErrors] = useState({});

  useEffect(() => {
    try {
      const saved = readStoredQuiz();
      if (saved) {
        setQuiz(saved);
      }
    } catch (err) {
      setErrors((current) => ({ ...current, quiz: err.message }));
    }
    Promise.all([
      api("/api/products?featured=1"),
      api("/api/home-collections"),
      api("/api/looks"),
      api("/api/community"),
      api("/api/offers").catch(() => ({ deck: null })),
    ])
      .then(([productData, collectionData, lookData, postData, offerData]) => {
        setProducts(productData.products);
        setCollections(collectionData.collections || []);
        setLooks(lookData.looks);
        setPosts(postData.posts.slice(0, 3));
        setDeck(offerData.deck && Array.isArray(offerData.deck.cards) && offerData.deck.cards.length ? offerData.deck : null);
      })
      .catch((err) => setError(err.message));
  }, []);

  const hasOfferDeck = Boolean(deck?.cards?.length);

  return (
    <div className="home">
      <section className={`hero ${hasOfferDeck ? "has-offers" : ""} hero-has-winter`}>
        <div className="hero-media" aria-hidden="true" />
        <aside className="hero-rail" aria-label="Shop by category">
          <ul className="rail-icons">
            {FEATURED_CATEGORIES.map(({ key, label, src }) => (
              <li key={key}>
                <Link to={`/shop?category=${encodeURIComponent(key)}`} className="rail-icon" aria-label={label}>
                  <span className="rail-icon-disc" aria-hidden="true">
                    <img src={src} alt="" width={56} height={56} decoding="async" />
                  </span>
                  <span className="rail-icon-label">{label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </aside>
        <div className={`hero-layout ${hasOfferDeck ? "hero-layout-offers" : ""}`}>
          <div className="hero-copy">
            <div className="hero-brand">
              <span className="logo-lockup hero-lockup" aria-label="STYLEARZ">
                <span className="logo-style">STYLE</span>
                <span className="logo-arz">ARZ</span>
              </span>
              <p className="hero-tag">your personal fashion statement</p>
            </div>
            {!hasOfferDeck && (
              <>
                <h1>Export casuals, made for how Bangladesh dresses.</h1>
                <p className="hero-lede">
                  Grade A RMG from Bangladesh’s garment floors — soft shirts, polos, chinos, knits, and easy dresses built to export
                  specs, priced for everyday.
                </p>
                <div className="hero-actions">
                  <Link className="btn solid" to="/shop">
                    Shop casuals
                  </Link>
                  <Link className="btn line light" to="/quiz">
                    Take the style quiz
                  </Link>
                </div>
              </>
            )}
          </div>
          <div className={`hero-split ${hasOfferDeck ? "hero-split-offers" : ""}`}>
            {hasOfferDeck ? <HeroOfferSlides deck={deck} /> : null}
            <HeroWinterStrip />
          </div>
        </div>
      </section>

      <ul className="trust">
        <li>Bangladesh Grade A export</li>
        <li>Casual RMG for daily wear</li>
        <li>Men · Women · Children</li>
        <li>Free shipping over ৳8,000</li>
      </ul>

      <section className="wrap winter-collection reveal" aria-label="Winter collection">
        <div className="section-head">
          <div>
            <p className="kicker">Winter collection</p>
            <h2>Knits and layers for the season ahead</h2>
          </div>
          <Link to="/shop?category=Knitwear">Shop winter</Link>
        </div>
        <div className="winter-grid">
          {WINTER_COLLECTION.map((item) => (
            <Link
              key={item.src}
              to={`/shop?category=${encodeURIComponent(item.key)}`}
              className="winter-tile"
            >
              <img src={item.src} alt="" loading="lazy" decoding="async" />
              <span>{item.label}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="wrap collections">
        {errors.collections && <p className="error">{errors.collections}</p>}
        {loading.collections && <Loading />}
        {!loading.collections && !errors.collections && collections.length === 0 && (
          <p className="notice">No collections are available right now.</p>
        )}
        {collections.map((entry) => (
          <Link key={entry.id} to={`/shop?audience=${encodeURIComponent(entry.audience)}`} className="collection-card">
            <img src={entry.image} alt={`${entry.kicker} export casuals`} />
            <div>
              <p className="kicker">{entry.kicker}</p>
              <strong>{entry.title}</strong>
            </div>
          </Link>
        ))}
      </section>

      {quiz?.result && (
        <section className="wrap banner">
          <div>
            <p className="kicker">Your edit</p>
            <h2>{quiz.result.title}</h2>
            <p>{quiz.result.summary}</p>
          </div>
          <Link className="btn dark" to="/quiz/results">
            View recommendations
          </Link>
        </section>
      )}
      {errors.quiz && <p className="wrap error">{errors.quiz}</p>}

      <section className="wrap reveal">
        <div className="section-head">
          <div>
            <p className="kicker">01 — Casuals</p>
            <h2>Opening pieces from the export floor</h2>
          </div>
          <Link to="/shop">View all</Link>
        </div>
        {errors.products && <p className="error">{errors.products}</p>}
        {loading.products && <Loading />}
        {!loading.products && !errors.products && products.length === 0 && (
          <p className="notice">No featured products are available right now.</p>
        )}
        <div className="product-grid">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </section>

      <section className="wrap reveal">
        <div className="section-head">
          <div>
            <p className="kicker">02 — Ways to wear</p>
            <h2>Casual looks for real days</h2>
          </div>
          <Link to="/lookbook">Open lookbook</Link>
        </div>
        {errors.looks && <p className="error">{errors.looks}</p>}
        {loading.looks && <Loading />}
        {!loading.looks && !errors.looks && looks.length === 0 && (
          <p className="notice">No looks are available right now.</p>
        )}
        <div className="occasion-grid">
          {looks.map((look) => (
            <Link key={look.id} to={`/lookbook/${look.id}`} className="occasion-card">
              <img src={look.image} alt="" />
              <div>
                <span>{look.occasion}</span>
                <strong>{look.name}</strong>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="studio-band">
        <div className="wrap">
          <p className="kicker light">03 — Style Studio</p>
          <h2>Build the casual look before you buy it.</h2>
          <div className="tool-grid">
            <Link to="/studio" className="tool-card">
              <span>01</span>
              <h3>Mix & match</h3>
              <p>Combine catalogue casuals with clothes you already own.</p>
            </Link>
            <Link to="/studio/colour" className="tool-card">
              <span>02</span>
              <h3>Colour match</h3>
              <p>Check whether two tones sit well on an everyday outfit.</p>
            </Link>
            <Link to="/studio/budget" className="tool-card">
              <span>03</span>
              <h3>Build on a budget</h3>
              <p>Set a number and get a complete casual look within it.</p>
            </Link>
          </div>
        </div>
      </section>

      <section className="wrap reveal">
        <div className="section-head">
          <div>
            <p className="kicker">04 — From the floor</p>
            <h2>How clients are wearing the casuals</h2>
          </div>
          <Link to="/community">Community</Link>
        </div>
        {errors.posts && <p className="error">{errors.posts}</p>}
        {loading.posts && <Loading />}
        {!loading.posts && !errors.posts && posts.length === 0 && (
          <p className="notice">No community notes are available right now.</p>
        )}
        <div className="feed home-feed">
          {posts.map((post) => (
            <article key={post.id}>
              <img src={post.image} alt="" />
              <p className="kicker">{post.author}</p>
              <h3>{post.title}</h3>
              <p>{post.body}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
