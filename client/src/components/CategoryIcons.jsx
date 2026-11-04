/** Banner category icons — cropped from STYLEARZ coming-soon artwork. */

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.55,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

function IconFrame({ children, label }) {
  return (
    <svg viewBox="0 0 48 48" width="48" height="48" aria-hidden={label ? undefined : true} role={label ? "img" : "presentation"}>
      {label ? <title>{label}</title> : null}
      {children}
    </svg>
  );
}

/** Unique banner glyphs (no label text) — one of each category. */
export const BANNER_ICON_SRC = {
  Saree: "/icons/categories/saree-glyph.png?v=7",
  Sharee: "/icons/categories/sharee-glyph.png?v=7",
  Panjabi: "/icons/categories/panjabi-glyph.png?v=7",
  Dress: "/icons/categories/dress-glyph.png?v=7",
  Dresses: "/icons/categories/dress-glyph.png?v=7",
  Jeans: "/icons/categories/jeans-glyph.png?v=7",
  Trousers: "/icons/categories/jeans-glyph.png?v=7",
  Shirt: "/icons/categories/shirt-glyph.png?v=7",
  Shirts: "/icons/categories/shirt-glyph.png?v=7",
  "T-Shirt": "/icons/categories/tshirt-glyph.png?v=7",
  "T-Shirts": "/icons/categories/tshirt-glyph.png?v=7",
  Knitwear: "/icons/categories/tshirt-glyph.png?v=7",
};

export function BannerIcon({ name, alt = name, className = "" }) {
  const src = BANNER_ICON_SRC[name] || BANNER_ICON_SRC.Shirt;
  return <img className={`banner-cat-icon ${className}`} src={src} alt={alt} width={96} height={132} decoding="async" />;
}

export function ShareeIcon(props) {
  return (
    <IconFrame {...props}>
      <path {...stroke} d="M18 8c2.2 1.8 4.2 2.6 6 2.6S27.8 9.8 30 8" />
      <path {...stroke} d="M18 8v8.5c0 2.2-1.2 4-3 5.2L12 40h8.5" />
      <path {...stroke} d="M30 8v6c4.2 1.2 7 4.8 7.5 9.5.4 3.8-1 7.4-3.8 10.2L28 40" />
      <path {...stroke} d="M20.5 40c2.2-6.5 4.8-10.5 7.5-12.5" />
      <path {...stroke} d="M24 10.6v8" />
    </IconFrame>
  );
}

export function PanjabiIcon(props) {
  return (
    <IconFrame {...props}>
      <path {...stroke} d="M16 13 10 17v23h28V17l-6-4" />
      <path {...stroke} d="M16 13c2.2 3.2 5 4.6 8 4.6s5.8-1.4 8-4.6" />
      <path {...stroke} d="M24 17.6V36" />
      <path {...stroke} d="M21 8 24 11.5 27 8" />
      <path {...stroke} d="M24 20v1.2M24 24v1.2M24 28v1.2" />
    </IconFrame>
  );
}

export function DressIcon(props) {
  return (
    <IconFrame {...props}>
      <path {...stroke} d="M18 8h12l2.5 7.5L36 18l-3 22H15L12 18l3.5-2.5L18 8z" />
      <path {...stroke} d="M18 8c1.2 2.4 3.4 3.6 6 3.6S28.8 10.4 30 8" />
      <path {...stroke} d="M20.5 15.5 24 24l3.5-8.5" />
    </IconFrame>
  );
}

export function TrousersIcon(props) {
  return (
    <IconFrame {...props}>
      <path {...stroke} d="M16 8h16l1.5 8H14.5L16 8z" />
      <path {...stroke} d="M14.5 16 13 40h8.5l2.5-16 2.5 16H35L33.5 16" />
      <path {...stroke} d="M24 16v8" />
    </IconFrame>
  );
}

export function ShirtIcon(props) {
  return (
    <IconFrame {...props}>
      <path {...stroke} d="M16 14 10 18v20h28V18l-6-4" />
      <path {...stroke} d="M16 14c2.2 3.2 5 4.6 8 4.6s5.8-1.4 8-4.6" />
      <path {...stroke} d="M24 18.6V38" />
      <path {...stroke} d="M21 8.5 24 12l3-3.5" />
      <rect {...stroke} x="28" y="22" width="5" height="5" rx="0.5" />
    </IconFrame>
  );
}

export function TeeIcon(props) {
  return (
    <IconFrame {...props}>
      <path {...stroke} d="M17 14 11 17.5V24h5v16h16V24h5v-6.5L31 14" />
      <path {...stroke} d="M17 14c2 2.8 4.4 4 7 4s5-1.2 7-4" />
      <path {...stroke} d="M20.5 9.5 24 12.5l3.5-3" />
    </IconFrame>
  );
}

export function KnitIcon(props) {
  return (
    <IconFrame {...props}>
      <path {...stroke} d="M16 16 10 20v8h5v14h18V28h5v-8l-6-4" />
      <path {...stroke} d="M16 16c2.2 3 5 4.4 8 4.4s5.8-1.4 8-4.4" />
      <path {...stroke} d="M18 28h12M18 33h12M18 38h12" />
    </IconFrame>
  );
}

export function OuterwearIcon(props) {
  return (
    <IconFrame {...props}>
      <path {...stroke} d="M15 14 9 19v21h11V28h8v12h11V19l-6-5" />
      <path {...stroke} d="M15 14c2.4 3.4 5.2 5 9 5s6.6-1.6 9-5" />
      <path {...stroke} d="M24 19v9" />
      <path {...stroke} d="M20 9.5 24 13l4-3.5" />
    </IconFrame>
  );
}

export function SetsIcon(props) {
  return (
    <IconFrame {...props}>
      <path {...stroke} d="M17 8h14l1.5 6H15.5L17 8z" />
      <path {...stroke} d="M15.5 14 14 24h20l-1.5-10" />
      <path {...stroke} d="M16 26h16l1 14H15l1-14z" />
      <path {...stroke} d="M24 14v10" />
    </IconFrame>
  );
}

export function AccessoriesIcon(props) {
  return (
    <IconFrame {...props}>
      <circle {...stroke} cx="24" cy="18" r="7" />
      <path {...stroke} d="M17 18h14" />
      <path {...stroke} d="M20 25.5 18 40M28 25.5 30 40" />
      <path {...stroke} d="M21.5 12.5c1.2-1.4 3.8-1.4 5 0" />
    </IconFrame>
  );
}

const BY_CATEGORY = {
  Saree: ShareeIcon,
  Sharee: ShareeIcon,
  Panjabi: PanjabiIcon,
  Dresses: DressIcon,
  Dress: DressIcon,
  Trousers: TrousersIcon,
  Jeans: TrousersIcon,
  Shirts: ShirtIcon,
  Shirt: ShirtIcon,
  "T-Shirts": TeeIcon,
  "T-Shirt": TeeIcon,
  Knitwear: KnitIcon,
  Outerwear: OuterwearIcon,
  Sets: SetsIcon,
  Accessories: AccessoriesIcon,
};

/**
 * Unique icons from both banner strips (Shirt / T-Shirt appear once only).
 * Dress · Jeans · Shirt · T-Shirt · Saree · Panjabi
 */
export const FEATURED_CATEGORIES = [
  { key: "Saree", label: "Saree", src: "/icons/categories/saree-glyph.png?v=7" },
  { key: "Panjabi", label: "Panjabi", src: "/icons/categories/panjabi-glyph.png?v=7" },
  { key: "Dress", label: "Dress", src: "/icons/categories/dress-glyph.png?v=7" },
  { key: "Jeans", label: "Jeans", src: "/icons/categories/jeans-glyph.png?v=7" },
  { key: "Shirt", label: "Shirt", src: "/icons/categories/shirt-glyph.png?v=7" },
  { key: "T-Shirt", label: "T-Shirt", src: "/icons/categories/tshirt-glyph.png?v=7" },
];

export function categoryIcon(name) {
  return BY_CATEGORY[name] || ShirtIcon;
}

export function CategoryGlyph({ name, className = "" }) {
  const src = BANNER_ICON_SRC[name];
  if (src) {
    return (
      <span className={`cat-glyph cat-glyph-img ${className}`} aria-hidden="true">
        <img src={src} alt="" width={40} height={56} decoding="async" />
      </span>
    );
  }
  const Icon = categoryIcon(name);
  return (
    <span className={`cat-glyph ${className}`} aria-hidden="true">
      <Icon />
    </span>
  );
}
