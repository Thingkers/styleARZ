import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useDocumentTitle } from "../hooks";
import ProductCard from "../components/ProductCard";
import { Loading } from "../components/ui";

export default function Home() {
  useDocumentTitle("");
  const [products, setProducts] = useState([]);
  const [looks, setLooks] = useState([]);
  const [posts, setPosts] = useState([]);
  const [quiz, setQuiz] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem("sa-quiz");
    if (saved) {
      try {
        setQuiz(JSON.parse(saved));
      } catch {
        localStorage.removeItem("sa-quiz");
      }
    }
    Promise.all([api("/api/products?featured=1"), api("/api/looks"), api("/api/community")])
      .then(([productData, lookData, postData]) => {
        setProducts(productData.products);
        setLooks(lookData.looks);
        setPosts(postData.posts.slice(0, 3));
      })
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div className="home">
      <section className="hero">
        <div className="hero-media" aria-hidden="true">
          <span className="hero-pane hero-pane-style" />
          <span className="hero-pane hero-pane-arz" />
        </div>
        <div className="hero-copy">
          <span className="logo-lockup hero-lockup">
            <span className="logo-style">STYLE</span>
            <span className="logo-arz">ARZ</span>
          </span>
          <p className="hero-tag">your personal fashion statement</p>
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
        </div>
      </section>

      <ul className="trust">
        <li>Bangladesh Grade A export</li>
        <li>Casual RMG for daily wear</li>
        <li>Men · Women · Children</li>
        <li>Free shipping over ৳8,000</li>
      </ul>

      <section className="wrap collections">
        <Link to="/shop?audience=Men" className="collection-card">
          <img src="/images/look-weekend.jpg" alt="Men's export casuals" />
          <div>
            <p className="kicker">Men</p>
            <strong>Polos, shirts, chinos</strong>
          </div>
        </Link>
        <Link to="/shop?audience=Women" className="collection-card">
          <img src="/images/look-women-day.jpg" alt="Women's export casuals" />
          <div>
            <p className="kicker">Women</p>
            <strong>Blouses, easy dresses, knits</strong>
          </div>
        </Link>
        <Link to="/shop?audience=Children" className="collection-card">
          <img src="/images/look-children.jpg" alt="Children's export casuals" />
          <div>
            <p className="kicker">Children</p>
            <strong>Same Grade A, ages 2–12</strong>
          </div>
        </Link>
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

      <section className="wrap reveal">
        <div className="section-head">
          <div>
            <p className="kicker">01 — Casuals</p>
            <h2>Opening pieces from the export floor</h2>
          </div>
          <Link to="/shop">View all</Link>
        </div>
        {error && <p className="error">{error}</p>}
        {!error && products.length === 0 && <Loading />}
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
