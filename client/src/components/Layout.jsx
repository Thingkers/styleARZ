import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import Logo from "./Logo";
import { FEATURED_CATEGORIES } from "./CategoryIcons";
import { useAuth } from "../context/AuthContext";
import { useShop } from "../context/ShopContext";
import { api } from "../api";
import { money } from "../format";

const LINKS = [
  { to: "/shop", label: "Shop" },
  { to: "/lookbook", label: "Lookbook" },
  { to: "/studio", label: "Studio" },
  { to: "/community", label: "Community" },
  { to: "/quiz", label: "Quiz" },
  { to: "/planner", label: "Planner" },
  { to: "/wardrobe", label: "Wardrobe" },
];

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const { cart, count, subtotal, drawer, setDrawer, updateQty, removeFromCart, toast } = useShop();
  const [menu, setMenu] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [unread, setUnread] = useState(0);
  const [scrolled, setScrolled] = useState(false);
  const searchInputRef = useRef(null);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    setMenu(false);
    setAccountOpen(false);
    setSearchOpen(false);
    setDrawer(false);
    window.scrollTo(0, 0);
  }, [location.pathname, setDrawer]);

  useEffect(() => {
    if (!accountOpen) return undefined;
    function onPointer(event) {
      if (!event.target.closest?.(".account-menu")) setAccountOpen(false);
    }
    function onKey(event) {
      if (event.key === "Escape") setAccountOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [accountOpen]);

  useEffect(() => {
    if (!searchOpen) return undefined;
    searchInputRef.current?.focus();
    function onPointer(event) {
      if (!event.target.closest?.(".nav-search")) setSearchOpen(false);
    }
    function onKey(event) {
      if (event.key === "Escape") setSearchOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [searchOpen]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!user) {
      setUnread(0);
      return;
    }
    api("/api/notifications")
      .then((data) => setUnread(data.unread))
      .catch(() => {});
  }, [user, location.pathname]);

  function onSearch(event) {
    event.preventDefault();
    const term = query.trim();
    navigate(term ? `/shop?q=${encodeURIComponent(term)}` : "/shop");
    setMenu(false);
    setSearchOpen(false);
  }

  const toolMode =
    location.pathname.startsWith("/admin/labels/capture") ||
    location.pathname === "/pos" ||
    location.pathname.startsWith("/pos/");

  return (
    <div className={`shell${toolMode ? " is-tool" : ""}`}>
      <a className="skip" href="#main">
        Skip to content
      </a>
      {!toolMode && (
      <header className={`site-header ${scrolled ? "is-scrolled" : ""} ${menu ? "is-open" : ""}`}>
        <div className="header-bar">
          <button
            type="button"
            className="nav-toggle"
            aria-label={menu ? "Close menu" : "Open menu"}
            aria-expanded={menu}
            onClick={() => setMenu((open) => !open)}
          >
            <span className="nav-toggle-bars" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
          </button>

          <Logo />

          <div className="header-end">
            <nav className={menu ? "open" : ""} aria-label="Primary">
              <div className="nav-rail">
                {LINKS.map((link) => (
                  <NavLink key={link.to} to={link.to}>
                    {link.label}
                  </NavLink>
                ))}
                {user?.role === "admin" && <NavLink to="/admin">Atelier</NavLink>}
                <form
                  className={`nav-search ${searchOpen ? "is-open" : ""}`}
                  onSubmit={onSearch}
                  role="search"
                >
                  <button
                    type="button"
                    className="nav-search-toggle"
                    aria-label={searchOpen ? "Close search" : "Open search"}
                    aria-expanded={searchOpen}
                    onClick={() => setSearchOpen((open) => !open)}
                  >
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                      <circle cx="11" cy="11" r="6.5" />
                      <path d="M16.2 16.2 20 20" strokeLinecap="round" />
                    </svg>
                  </button>
                  <input
                    ref={searchInputRef}
                    id="site-search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search casuals"
                    aria-label="Search casuals"
                    tabIndex={searchOpen ? 0 : -1}
                  />
                </form>
              </div>
            </nav>

            <div className="mast-actions">
              {user && (
                <Link to="/notifications" className="action-chip bell" aria-label="Notifications">
                  Alerts
                  {unread > 0 && <em>{unread}</em>}
                </Link>
              )}
              {user ? (
                <div className={`account-menu ${accountOpen ? "is-open" : ""}`}>
                  <button
                    type="button"
                    className="account-trigger"
                    aria-label={`Account menu for ${user.name}`}
                    aria-expanded={accountOpen}
                    aria-haspopup="menu"
                    onClick={() => setAccountOpen((open) => !open)}
                  >
                    <span className="account-avatar" aria-hidden>
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <circle cx="12" cy="8" r="3.2" />
                        <path d="M5.5 19.2c1.6-3.1 4-4.6 6.5-4.6s4.9 1.5 6.5 4.6" strokeLinecap="round" />
                      </svg>
                    </span>
                  </button>
                  {accountOpen && (
                    <div className="account-dropdown" role="menu">
                      <p className="account-dropdown-name">{user.name}</p>
                      <p className="account-dropdown-email">{user.email}</p>
                      <Link role="menuitem" to="/profile" onClick={() => setAccountOpen(false)}>
                        Profile
                      </Link>
                      {user.role === "admin" && (
                        <Link role="menuitem" to="/admin" onClick={() => setAccountOpen(false)}>
                          Admin
                        </Link>
                      )}
                      <Link role="menuitem" to="/wishlist" onClick={() => setAccountOpen(false)}>
                        Wishlist
                      </Link>
                      <button
                        type="button"
                        role="menuitem"
                        className="account-logout"
                        onClick={() => {
                          setAccountOpen(false);
                          logout();
                          navigate("/");
                        }}
                      >
                        Log out
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <Link to="/login" className="account-trigger account-trigger-link" aria-label="Sign in">
                  <span className="account-avatar" aria-hidden>
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <circle cx="12" cy="8" r="3.2" />
                      <path d="M5.5 19.2c1.6-3.1 4-4.6 6.5-4.6s4.9 1.5 6.5 4.6" strokeLinecap="round" />
                    </svg>
                  </span>
                </Link>
              )}
              <Link to="/wishlist" className="action-icon saved-trigger" aria-label="Saved">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                  <path
                    d="M12 20s-6.2-3.9-8.4-7.2C1.8 9.8 3.2 6.5 6.4 6.1c1.7-.2 3.2.6 4.1 1.9.9-1.3 2.4-2.1 4.1-1.9 3.2.4 4.6 3.7 2.8 6.7C18.2 16.1 12 20 12 20z"
                    strokeLinejoin="round"
                  />
                </svg>
              </Link>
              <button type="button" className="action-chip bag bag-desktop" onClick={() => setDrawer(true)}>
                Bag
                <em>{count}</em>
              </button>
              <button
                type="button"
                className="bag-mobile"
                onClick={() => setDrawer(true)}
                aria-label={`Bag, ${count} items`}
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                  <path d="M6 8h12l-1 12H7L6 8z" strokeLinejoin="round" />
                  <path d="M9 8V7a3 3 0 0 1 6 0v1" strokeLinecap="round" />
                </svg>
                {count > 0 && <em>{count}</em>}
              </button>
            </div>
          </div>
        </div>
      </header>
      )}

      <main id="main">{children}</main>

      {!toolMode && (
      <footer className="site-footer">
        <div className="footer-inner">
          <div className="footer-brand">
            <Logo />
            <p>
              Export-floor casuals from Bangladesh — the same Grade A RMG programmes that ship worldwide, edited for everyday wear at home.
            </p>
          </div>
          <div>
            <h2>Shop</h2>
            <Link to="/shop">All casuals</Link>
            {FEATURED_CATEGORIES.map(({ key, label }) => (
              <Link key={key} to={`/shop?category=${encodeURIComponent(key)}`}>
                {label}
              </Link>
            ))}
            <Link to="/shop?audience=Men">Men</Link>
            <Link to="/shop?audience=Women">Women</Link>
          </div>
          <div>
            <h2>Studio</h2>
            <Link to="/studio">Mix & match</Link>
            <Link to="/studio/colour">Colour match</Link>
            <Link to="/studio/budget">Build on a budget</Link>
            <Link to="/lookbook">Lookbook</Link>
          </div>
          <div>
            <h2>Account</h2>
            <Link to="/login">Sign in</Link>
            <Link to="/signup">Create account</Link>
            <Link to="/wishlist">Wishlist</Link>
            <Link to="/profile">Orders & profile</Link>
          </div>
          <div className="footer-base">
            <span>© {new Date().getFullYear()} StyleARZ</span>
            <span>Made for Bangladesh · Export quality</span>
            <span>stylearz.com</span>
            {user && (
              <button
                type="button"
                className="text-link"
                onClick={() => {
                  logout();
                  navigate("/");
                }}
              >
                Sign out
              </button>
            )}
          </div>
        </div>
      </footer>
      )}

      {drawer && (
        <div className="drawer-backdrop" onClick={() => setDrawer(false)} role="presentation">
          <aside className="drawer" role="dialog" aria-label="Bag" onClick={(event) => event.stopPropagation()}>
            <header>
              <h2>Bag</h2>
              <button type="button" className="icon-btn" onClick={() => setDrawer(false)} aria-label="Close bag">
                ×
              </button>
            </header>
            {cart.length === 0 ? (
              <p className="muted">Your bag is empty. Export casuals are ready when you are.</p>
            ) : (
              <ul className="drawer-list">
                {cart.map((item, index) => (
                  <li key={`${item.productId}-${item.size}-${item.color}`}>
                    <img src={item.image} alt="" />
                    <div>
                      <strong>{item.name}</strong>
                      <p>
                        {item.color} · {item.size}
                      </p>
                      <div className="qty">
                        <button type="button" onClick={() => updateQty(index, item.qty - 1)} aria-label="Decrease">
                          −
                        </button>
                        <span>{item.qty}</span>
                        <button type="button" onClick={() => updateQty(index, item.qty + 1)} aria-label="Increase">
                          +
                        </button>
                        <button type="button" className="text-link" onClick={() => removeFromCart(index)}>
                          Remove
                        </button>
                      </div>
                    </div>
                    <b>{money(item.price * item.qty)}</b>
                  </li>
                ))}
              </ul>
            )}
            <footer>
              <p>
                <span>Subtotal</span>
                <strong>{money(subtotal)}</strong>
              </p>
              <p className="muted">Shipping calculated at checkout. Free over ৳8,000 inside Bangladesh.</p>
              <Link className="btn solid" to="/cart" onClick={() => setDrawer(false)}>
                Review bag
              </Link>
              <Link className={`btn dark ${cart.length === 0 ? "disabled" : ""}`} to="/checkout">
                Checkout
              </Link>
            </footer>
          </aside>
        </div>
      )}

      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
