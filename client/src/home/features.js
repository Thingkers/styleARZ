/**
 * Kept for reverse: previous winter-in-hero experiment.
 * Hero always uses category rail again; winter lives in its own homepage section.
 */
export const WINTER_HERO_ENABLED = false;

/** Winter collection tiles on the homepage (from winter-images/). */
export const WINTER_COLLECTION = [
  { key: "Knitwear", label: "Knit aisle", src: "/images/winter/w1.jpeg" },
  { key: "Outerwear", label: "Layered racks", src: "/images/winter/w2.jpeg" },
  { key: "Shirt", label: "Winter shirts", src: "/images/winter/w3.jpeg" },
  { key: "Dress", label: "Season edits", src: "/images/winter/w4.jpeg" },
];

/** @deprecated use WINTER_COLLECTION — alias kept so old imports keep working */
export const WINTER_RAIL = WINTER_COLLECTION;
