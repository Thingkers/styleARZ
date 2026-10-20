import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import Layout from "./components/Layout";
import { useAuth } from "./context/AuthContext";
import { Loading } from "./components/ui";
import Home from "./pages/Home";
import Shop from "./pages/Shop";
import Product from "./pages/Product";
import { Cart, Checkout, Confirmation } from "./pages/CartFlow";
import { Community, CompleteLook, Lookbook } from "./pages/Discover";
import { Budget, ColourMatch, Studio } from "./pages/Studio";
import { Quiz, QuizResults } from "./pages/Quiz";
import { Forgot, Login, Reset, Signup } from "./pages/Auth";
import { Notifications, Planner, Profile, Wardrobe, Wishlist } from "./pages/Account";
import Admin from "./pages/Admin";

function RequireAuth({ children }) {
  const { user, ready } = useAuth();
  const location = useLocation();
  if (!ready) return <Loading />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />;
  return children;
}

function RequireAdmin({ children }) {
  const { user, ready } = useAuth();
  if (!ready) return <Loading />;
  if (!user) return <Navigate to="/login?next=/admin" replace />;
  if (user.role !== "admin") return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  const { ready } = useAuth();
  if (!ready) {
    return (
      <div className="boot">
        <Loading label="Opening StyleARZ" />
      </div>
    );
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/shop" element={<Shop />} />
        <Route path="/search" element={<Shop />} />
        <Route path="/product/:id" element={<Product />} />
        <Route path="/cart" element={<Cart />} />
        <Route path="/checkout" element={<Checkout />} />
        <Route path="/order/:id" element={<Confirmation />} />
        <Route path="/lookbook" element={<Lookbook />} />
        <Route path="/lookbook/:id" element={<CompleteLook />} />
        <Route path="/studio" element={<Studio />} />
        <Route path="/studio/colour" element={<ColourMatch />} />
        <Route path="/studio/budget" element={<Budget />} />
        <Route path="/quiz" element={<Quiz />} />
        <Route path="/quiz/results" element={<QuizResults />} />
        <Route path="/community" element={<Community />} />
        <Route path="/wishlist" element={<Wishlist />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/forgot" element={<Forgot />} />
        <Route path="/reset" element={<Reset />} />
        <Route
          path="/wardrobe"
          element={
            <RequireAuth>
              <Wardrobe />
            </RequireAuth>
          }
        />
        <Route
          path="/planner"
          element={
            <RequireAuth>
              <Planner />
            </RequireAuth>
          }
        />
        <Route
          path="/notifications"
          element={
            <RequireAuth>
              <Notifications />
            </RequireAuth>
          }
        />
        <Route
          path="/profile"
          element={
            <RequireAuth>
              <Profile />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/*"
          element={
            <RequireAdmin>
              <Admin />
            </RequireAdmin>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
