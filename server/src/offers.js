const crypto = require("crypto");

const GRAND_OPENING_ID = "offer_grand_opening";

const DEFAULT_TIERS = [
  { from: 1, to: 10, salePercent: 20, lifetimePercent: 10 },
  { from: 11, to: 30, salePercent: 15, lifetimePercent: 10 },
  { from: 31, to: 50, salePercent: 10, lifetimePercent: 10 },
];

/** Reusable offer blueprints for Admin → Offers templates. */
const OFFER_TEMPLATES = [
  {
    id: "tmpl_grand_opening",
    name: "Grand Opening",
    description: "First 50 customers tiered discount + lifetime 10% + ৳5000 gift (inauguration flyer).",
    campaignId: GRAND_OPENING_ID,
    defaults: {
      name: "Grand Opening",
      active: true,
      showOnWebsite: true,
      startsAt: "2026-11-27T00:00:00.000Z",
      endsAt: null,
      tiers: DEFAULT_TIERS.map((tier) => ({ ...tier })),
      giftMinSubtotal: 5000,
      maxSlots: 50,
      publicHeadline: "Grand Opening Offer",
      publicLede: "Inauguration special — limited to the first 50 customers in store.",
      publicRules: [
        "First 10 customers: 20% discount + lifetime 10% discount",
        "Next 20 customers: 15% discount + lifetime 10% discount",
        "Next 20 customers: 10% discount + lifetime 10% discount",
        "Minimum ৳5000 purchase: special gift",
      ],
      publicImage: "",
      publicCtaLabel: "Shop casuals",
      publicCtaHref: "/shop",
      inaugurationNote: "Inauguration date: 27 November",
    },
  },
];

function nowIso() {
  return new Date().toISOString();
}

function round2(value) {
  return Math.round(Number(value) * 100) / 100;
}

function httpError(status, message, extra) {
  return Object.assign(new Error(message), { status, ...(extra || {}) });
}

function ensureOfferCollections(db) {
  let changed = false;
  if (!Array.isArray(db.offerCampaigns)) {
    db.offerCampaigns = [];
    changed = true;
  }
  if (!Array.isArray(db.offerCustomers)) {
    db.offerCustomers = [];
    changed = true;
  }
  return changed;
}

function publicFieldsFromTemplate(defaults = {}) {
  return {
    showOnWebsite: defaults.showOnWebsite !== false,
    publicHeadline: defaults.publicHeadline || defaults.name || "Special offer",
    publicLede: defaults.publicLede || "",
    publicRules: Array.isArray(defaults.publicRules) ? defaults.publicRules.slice() : [],
    publicImage: defaults.publicImage || "",
    publicCtaLabel: defaults.publicCtaLabel || "Shop now",
    publicCtaHref: defaults.publicCtaHref || "/shop",
    inaugurationNote: defaults.inaugurationNote || "",
    templateId: defaults.templateId || null,
  };
}

function buildGrandOpeningCampaign() {
  const tmpl = OFFER_TEMPLATES.find((entry) => entry.id === "tmpl_grand_opening");
  const defaults = tmpl ? tmpl.defaults : {};
  return {
    id: GRAND_OPENING_ID,
    templateId: "tmpl_grand_opening",
    name: defaults.name || "Grand Opening",
    active: defaults.active !== false,
    startsAt: defaults.startsAt || "2026-11-27T00:00:00.000Z",
    endsAt: defaults.endsAt || null,
    tiers: (defaults.tiers || DEFAULT_TIERS).map((tier) => ({ ...tier })),
    giftMinSubtotal: Number.isFinite(defaults.giftMinSubtotal) ? defaults.giftMinSubtotal : 5000,
    claimedCount: 0,
    maxSlots: Number.isFinite(defaults.maxSlots) ? defaults.maxSlots : 50,
    ...publicFieldsFromTemplate({ ...defaults, templateId: "tmpl_grand_opening" }),
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
}

function fillPublicDefaults(campaign) {
  let changed = false;
  if (campaign.showOnWebsite === undefined) {
    campaign.showOnWebsite = true;
    changed = true;
  }
  if (!campaign.publicHeadline) {
    campaign.publicHeadline = campaign.name || "Special offer";
    changed = true;
  }
  if (campaign.publicLede === undefined) {
    campaign.publicLede = "Inauguration special — limited to the first 50 customers in store.";
    changed = true;
  }
  if (!Array.isArray(campaign.publicRules) || !campaign.publicRules.length) {
    campaign.publicRules = [
      "First 10 customers: 20% discount + lifetime 10% discount",
      "Next 20 customers: 15% discount + lifetime 10% discount",
      "Next 20 customers: 10% discount + lifetime 10% discount",
      "Minimum ৳5000 purchase: special gift",
    ];
    changed = true;
  }
  if (campaign.publicImage === undefined) {
    campaign.publicImage = "";
    changed = true;
  }
  if (!campaign.publicCtaLabel) {
    campaign.publicCtaLabel = "Shop the store";
    changed = true;
  }
  if (!campaign.publicCtaHref) {
    campaign.publicCtaHref = "/shop";
    changed = true;
  }
  if (campaign.inaugurationNote === undefined) {
    campaign.inaugurationNote = "Inauguration date: 27 November";
    changed = true;
  }
  if (!campaign.templateId && campaign.id === GRAND_OPENING_ID) {
    campaign.templateId = "tmpl_grand_opening";
    changed = true;
  }
  return changed;
}

function ensureGrandOpeningCampaign(db) {
  ensureOfferCollections(db);
  let changed = false;
  let campaign = db.offerCampaigns.find((entry) => entry.id === GRAND_OPENING_ID);
  if (!campaign) {
    campaign = buildGrandOpeningCampaign();
    db.offerCampaigns.unshift(campaign);
    changed = true;
  } else {
    if (!Array.isArray(campaign.tiers) || !campaign.tiers.length) {
      campaign.tiers = DEFAULT_TIERS.map((tier) => ({ ...tier }));
      changed = true;
    }
    if (!Number.isFinite(campaign.giftMinSubtotal)) {
      campaign.giftMinSubtotal = 5000;
      changed = true;
    }
    if (!Number.isFinite(campaign.claimedCount) || campaign.claimedCount < 0) {
      campaign.claimedCount = 0;
      changed = true;
    }
    if (!Number.isFinite(campaign.maxSlots)) {
      campaign.maxSlots = 50;
      changed = true;
    }
    if (!campaign.startsAt) {
      campaign.startsAt = "2026-11-27T00:00:00.000Z";
      changed = true;
    }
    if (fillPublicDefaults(campaign)) changed = true;
  }
  return changed;
}

function listTemplates() {
  return OFFER_TEMPLATES.map((tmpl) => ({
    id: tmpl.id,
    name: tmpl.name,
    description: tmpl.description,
    campaignId: tmpl.campaignId,
    defaults: {
      ...tmpl.defaults,
      tiers: (tmpl.defaults.tiers || []).map((tier) => ({ ...tier })),
      publicRules: Array.isArray(tmpl.defaults.publicRules) ? tmpl.defaults.publicRules.slice() : [],
    },
  }));
}

function applyTemplate(db, templateId, { resetClaims = false, asNew = false } = {}) {
  ensureOfferCollections(db);
  const tmpl = OFFER_TEMPLATES.find((entry) => entry.id === templateId);
  if (!tmpl) throw httpError(404, "Offer template not found.");
  const defaults = tmpl.defaults;
  const id = asNew ? `offer_${crypto.randomBytes(3).toString("hex")}` : tmpl.campaignId || `offer_${crypto.randomBytes(3).toString("hex")}`;
  let campaign = asNew ? null : db.offerCampaigns.find((entry) => entry.id === id);
  if (!campaign) {
    campaign = {
      id,
      claimedCount: 0,
      createdAt: nowIso(),
    };
    db.offerCampaigns.unshift(campaign);
  }
  campaign.templateId = tmpl.id;
  campaign.name = asNew ? `${defaults.name || tmpl.name} copy` : defaults.name || tmpl.name;
  campaign.active = asNew ? false : defaults.active !== false;
  campaign.startsAt = defaults.startsAt || null;
  campaign.endsAt = defaults.endsAt || null;
  campaign.tiers = (defaults.tiers || DEFAULT_TIERS).map((tier) => ({ ...tier }));
  campaign.giftMinSubtotal = Number.isFinite(defaults.giftMinSubtotal) ? defaults.giftMinSubtotal : 5000;
  campaign.maxSlots = Number.isFinite(defaults.maxSlots) ? defaults.maxSlots : 50;
  Object.assign(campaign, publicFieldsFromTemplate({ ...defaults, templateId: tmpl.id }));
  if (resetClaims || asNew) campaign.claimedCount = 0;
  if (!Number.isFinite(campaign.claimedCount)) campaign.claimedCount = 0;
  campaign.updatedAt = nowIso();
  return campaign;
}

function createCampaign(db, input = {}) {
  ensureOfferCollections(db);
  const id = `offer_${crypto.randomBytes(3).toString("hex")}`;
  const rules = Array.isArray(input.publicRules)
    ? input.publicRules.map((line) => String(line).trim()).filter(Boolean)
    : String(input.publicRules || "")
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean);
  const campaign = {
    id,
    templateId: null,
    name: String(input.name || "New offer").trim().slice(0, 80) || "New offer",
    active: false,
    startsAt: null,
    endsAt: null,
    tiers: [],
    giftMinSubtotal: Number.isFinite(Number(input.giftMinSubtotal)) ? Number(input.giftMinSubtotal) : 0,
    claimedCount: 0,
    maxSlots: 0,
    showOnWebsite: input.showOnWebsite !== false,
    publicHeadline: String(input.publicHeadline || input.name || "Special offer").trim().slice(0, 120),
    publicLede: String(input.publicLede || "").trim().slice(0, 400),
    publicRules: rules.slice(0, 12),
    publicImage: typeof input.publicImage === "string" && !input.publicImage.startsWith("data:") ? String(input.publicImage).slice(0, 300) : "",
    publicCtaLabel: String(input.publicCtaLabel || "Shop now").trim().slice(0, 40),
    publicCtaHref: String(input.publicCtaHref || "/shop").trim().slice(0, 120),
    inaugurationNote: String(input.inaugurationNote || "").trim().slice(0, 120),
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  db.offerCampaigns.unshift(campaign);
  return campaign;
}

function deleteCampaign(db, id, uploadsDir) {
  ensureOfferCollections(db);
  if (id === GRAND_OPENING_ID) throw httpError(400, "The Grand Opening campaign cannot be deleted. Hide it from the website instead.");
  const index = db.offerCampaigns.findIndex((entry) => entry && entry.id === id);
  if (index < 0) throw httpError(404, "Offer campaign not found.");
  const [removed] = db.offerCampaigns.splice(index, 1);
  if (uploadsDir && removed.publicImage && String(removed.publicImage).startsWith("/uploads/offers/")) {
    try {
      const { removeImageFile } = require("./inventory");
      // removeImageFile only handles inventory paths — delete offers file directly below
    } catch {
      /* ignore */
    }
    try {
      const fs = require("fs");
      const path = require("path");
      const absolute = path.join(uploadsDir, removed.publicImage.replace(/^\/uploads\//, ""));
      if (fs.existsSync(absolute)) fs.unlinkSync(absolute);
    } catch {
      /* ignore */
    }
  }
  db.offerCustomers = (db.offerCustomers || []).filter((entry) => entry.campaignId !== id);
  return removed;
}

function setCampaignImage(db, id, uploadsDir, dataUrl) {
  const campaign = getCampaign(db, id);
  if (!campaign) throw httpError(404, "Offer campaign not found.");
  const { saveImageFromBase64 } = require("./inventory");
  const previous = campaign.publicImage;
  campaign.publicImage = saveImageFromBase64(uploadsDir, id, dataUrl, "offers");
  campaign.updatedAt = nowIso();
  if (previous && String(previous).startsWith("/uploads/offers/") && previous !== campaign.publicImage) {
    try {
      const fs = require("fs");
      const path = require("path");
      const absolute = path.join(uploadsDir, previous.replace(/^\/uploads\//, ""));
      if (fs.existsSync(absolute)) fs.unlinkSync(absolute);
    } catch {
      /* ignore */
    }
  }
  return campaign;
}

/** Flatten website offers into hero animation slides (text options, no flyer paste). */
function listHeroSlides(db) {
  return listPublicOffers(db).flatMap((offer) => {
    const rules = Array.isArray(offer.publicRules) ? offer.publicRules.filter(Boolean) : [];
    const base = {
      offerId: offer.id,
      headline: offer.publicHeadline || offer.name,
      note: offer.inaugurationNote || "",
      ctaLabel: offer.publicCtaLabel || "Shop now",
      ctaHref: offer.publicCtaHref || "/shop",
      posLive: offer.posLive,
    };
    if (!rules.length) {
      return [
        {
          ...base,
          id: `${offer.id}-lede`,
          text: offer.publicLede || offer.publicHeadline || offer.name,
        },
      ];
    }
    return rules.map((text, index) => ({
      ...base,
      id: `${offer.id}-${index}`,
      text,
    }));
  });
}

function parseRuleCard(text, index) {
  const raw = String(text || "").trim();
  const percentMatch = raw.match(/(\d+)\s*%\s*(discount)?/i);
  const lifetimeMatch = raw.match(/lifetime\s*(\d+)\s*%/i);
  const personsMatch = raw.match(/(first|next)\s+(\d+)\s*(persons?|customers?)?/i);
  const giftMatch = /gift|৳|taka|minimum/i.test(raw);
  if (giftMatch && !personsMatch) {
    return {
      id: `gift-${index}`,
      kind: "gift",
      number: index + 1,
      title: raw.replace(/[:\-–].*$/, "").trim().slice(0, 48) || "SPECIAL GIFT",
      highlight: "SPECIAL GIFT",
      detail: raw,
    };
  }
  const who = personsMatch
    ? `${personsMatch[1].toUpperCase()} ${personsMatch[2]} PERSONS`
    : `OFFER ${index + 1}`;
  const pct = percentMatch ? `${percentMatch[1]}% DISCOUNT` : raw.slice(0, 28).toUpperCase();
  const lifetime = lifetimeMatch ? `+ Lifetime ${lifetimeMatch[1]}% Discount` : "+ Lifetime 10% Discount";
  return {
    id: `tier-${index}`,
    kind: "tier",
    number: index + 1,
    title: who,
    highlight: pct,
    detail: lifetime,
  };
}

/** Up to three visual hero cards (flyer-style) from the primary website offer. */
function listHeroCards(db) {
  ensureGrandOpeningCampaign(db);
  const offers = listPublicOffers(db);
  if (!offers.length) return { headline: "", note: "", ctaLabel: "Shop casuals", ctaHref: "/shop", posLive: false, cards: [], gift: null };

  const primary =
    offers.find((entry) => entry.id === GRAND_OPENING_ID) ||
    offers[0];
  const campaign = getCampaign(db, primary.id);
  const tiers = Array.isArray(campaign?.tiers) ? campaign.tiers.filter((tier) => Number(tier.salePercent) > 0) : [];

  let cards = [];
  if (tiers.length) {
    cards = tiers.slice(0, 3).map((tier, index) => {
      const from = Number(tier.from);
      const to = Number(tier.to);
      const title =
        index === 0
          ? `Customers #${from}–${to}`
          : `Then customers #${from}–${to}`;
      const subtitle =
        index === 0
          ? `First ${to - from + 1} shoppers in store`
          : `Next ${to - from + 1} shoppers after that`;
      return {
        id: `${primary.id}-tier-${index}`,
        kind: "tier",
        number: index + 1,
        title,
        subtitle,
        highlight: `${Number(tier.salePercent)}% DISCOUNT`,
        detail: `+ Lifetime ${Number(tier.lifetimePercent) || 10}% Discount`,
        badge: "In store only",
      };
    });
  } else {
    const rules = (primary.publicRules || []).filter((line) => !/gift|৳5000|taka/i.test(line));
    cards = rules.slice(0, 3).map((line, index) => parseRuleCard(line, index));
  }

  while (cards.length < 3 && (primary.publicRules || [])[cards.length]) {
    cards.push(parseRuleCard(primary.publicRules[cards.length], cards.length));
  }
  cards = cards.slice(0, 3).map((card, index) => ({
    ...card,
    number: index + 1,
    badge: card.badge || "In store only",
    subtitle: card.subtitle || "",
  }));

  // Keep sequence for older push UI, but same card content (no separate "In store only" slide).
  const sequence = cards.map((card) => ({
    id: `${card.id}-slide`,
    title: card.title,
    subtitle: card.subtitle,
    highlight: card.highlight,
    detail: card.detail,
    badge: card.badge || "In store only",
  }));

  const giftRule = (primary.publicRules || []).find((line) => /gift|৳5000|taka|minimum/i.test(line));
  const gift = giftRule
    ? {
        id: `${primary.id}-gift`,
        text: giftRule,
        min: primary.giftMinSubtotal || 5000,
      }
    : primary.giftMinSubtotal
      ? {
          id: `${primary.id}-gift`,
          text: `Minimum ৳${primary.giftMinSubtotal} purchase — special gift`,
          min: primary.giftMinSubtotal,
        }
      : null;

  return {
    headline: primary.publicHeadline || primary.name || "Grand Opening Offer",
    note: primary.inaugurationNote || "",
    ctaLabel: primary.publicCtaLabel || "Shop casuals",
    ctaHref: primary.publicCtaHref || "/shop",
    posLive: Boolean(primary.posLive),
    cards,
    sequence,
    gift,
  };
}

function listCampaigns(db) {
  ensureGrandOpeningCampaign(db);
  return (db.offerCampaigns || []).slice().sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
}

/** Public website offers — showOnWebsite, independent of POS date window. */
function listPublicOffers(db) {
  ensureGrandOpeningCampaign(db);
  const live = getActiveCampaign(db);
  return (db.offerCampaigns || [])
    .filter((campaign) => campaign && campaign.showOnWebsite)
    .sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")))
    .map((campaign) => ({
      id: campaign.id,
      name: campaign.name,
      publicHeadline: campaign.publicHeadline || campaign.name,
      publicLede: campaign.publicLede || "",
      publicRules: Array.isArray(campaign.publicRules) ? campaign.publicRules : [],
      publicImage: campaign.publicImage || "",
      publicCtaLabel: campaign.publicCtaLabel || "Shop now",
      publicCtaHref: campaign.publicCtaHref || "/shop",
      inaugurationNote: campaign.inaugurationNote || "",
      giftMinSubtotal: campaign.giftMinSubtotal,
      startsAt: campaign.startsAt || null,
      endsAt: campaign.endsAt || null,
      posLive: Boolean(live && live.id === campaign.id),
      claimedCount: Number(campaign.claimedCount) || 0,
      maxSlots: Number(campaign.maxSlots) || 0,
    }));
}

function normalizePhone(raw) {
  const digits = String(raw || "").replace(/[^\d+]/g, "").trim();
  if (!digits) return "";
  let phone = digits;
  if (phone.startsWith("+880")) phone = `0${phone.slice(4)}`;
  else if (phone.startsWith("880")) phone = `0${phone.slice(3)}`;
  phone = phone.replace(/\D/g, "");
  if (/^01\d{9}$/.test(phone)) return phone;
  if (/^1\d{9}$/.test(phone)) return `0${phone}`;
  return String(raw || "").trim().slice(0, 20);
}

function getActiveCampaign(db, at = Date.now()) {
  ensureGrandOpeningCampaign(db);
  return (
    db.offerCampaigns.find((campaign) => {
      if (!campaign || !campaign.active) return false;
      if (campaign.startsAt) {
        const start = Date.parse(campaign.startsAt);
        if (!Number.isNaN(start) && at < start) return false;
      }
      if (campaign.endsAt) {
        const end = Date.parse(campaign.endsAt);
        if (!Number.isNaN(end) && at > end) return false;
      }
      return true;
    }) || null
  );
}

function tierForSlot(campaign, slot) {
  const tiers = Array.isArray(campaign?.tiers) ? campaign.tiers : DEFAULT_TIERS;
  return tiers.find((tier) => slot >= tier.from && slot <= tier.to) || null;
}

function findCustomer(db, phone, campaignId) {
  if (!phone) return null;
  return (
    (db.offerCustomers || []).find(
      (entry) => entry && entry.phone === phone && (!campaignId || entry.campaignId === campaignId)
    ) || null
  );
}

function emptyPreview({ giftEligible = false, giftMinSubtotal = 5000, message = "" } = {}) {
  return {
    eligible: false,
    kind: "none",
    campaignId: null,
    campaignName: null,
    slot: null,
    salePercent: 0,
    lifetimePercent: 0,
    discountAmount: 0,
    giftEligible,
    giftMinSubtotal,
    message,
    claimedCount: null,
    maxSlots: null,
  };
}

/** Live preview for POS — does not claim a slot. */
function previewOffer(db, { phone, subtotal } = {}) {
  ensureGrandOpeningCampaign(db);
  const campaign = getActiveCampaign(db);
  const giftMin = Number(campaign?.giftMinSubtotal) || 5000;
  const sub = Math.max(0, Number(subtotal) || 0);
  const giftEligible = sub >= giftMin;
  const normalized = normalizePhone(phone);

  if (!campaign) {
    return emptyPreview({
      giftEligible,
      giftMinSubtotal: giftMin,
      message: giftEligible ? "Special gift — hand over gift (৳5000+)." : "",
    });
  }

  const base = {
    campaignId: campaign.id,
    campaignName: campaign.name,
    giftEligible,
    giftMinSubtotal: giftMin,
    claimedCount: Number(campaign.claimedCount) || 0,
    maxSlots: Number(campaign.maxSlots) || 50,
  };

  if (!normalized) {
    return {
      ...emptyPreview({ giftEligible, giftMinSubtotal: giftMin }),
      ...base,
      message: giftEligible
        ? "Special gift — hand over gift (৳5000+). Enter phone for inauguration discount."
        : "Enter customer phone to check inauguration / lifetime offer.",
    };
  }

  const existing = findCustomer(db, normalized, campaign.id);
  if (existing) {
    const percent = Number(existing.lifetimePercent) || 10;
    const discountAmount = round2((sub * percent) / 100);
    return {
      eligible: true,
      kind: "lifetime",
      ...base,
      slot: existing.slot,
      salePercent: percent,
      lifetimePercent: percent,
      discountAmount,
      message: `Returning inauguration guest (slot #${existing.slot}) — lifetime ${percent}% applied.${
        giftEligible ? " Special gift — hand over gift (৳5000+)." : ""
      }`,
    };
  }

  const claimed = Number(campaign.claimedCount) || 0;
  const maxSlots = Number(campaign.maxSlots) || 50;
  if (claimed >= maxSlots) {
    return {
      ...emptyPreview({ giftEligible, giftMinSubtotal: giftMin }),
      ...base,
      message: giftEligible
        ? "Inaugural slots full. Special gift — hand over gift (৳5000+)."
        : "Inaugural slots full — no new tier discount for this phone.",
    };
  }

  const nextSlot = claimed + 1;
  const tier = tierForSlot(campaign, nextSlot);
  const salePercent = Number(tier?.salePercent) || 0;
  const lifetimePercent = Number(tier?.lifetimePercent) || 10;
  const discountAmount = round2((sub * salePercent) / 100);
  return {
    eligible: true,
    kind: "inaugural",
    ...base,
    slot: nextSlot,
    salePercent,
    lifetimePercent,
    discountAmount,
    message: `Grand opening: customer #${nextSlot} — ${salePercent}% today + lifetime ${lifetimePercent}%.${
      giftEligible ? " Special gift — hand over gift (৳5000+)." : ""
    }`,
  };
}

/**
 * Resolve discount for finalize: prefer offer % unless cashier typed a higher manual discount.
 * Accepts either a money `discountInput` and/or `discountPercent` (computes amount from subtotal).
 * Returns { discount, discountPercent, discountSource, offerPreview }.
 */
function resolveSaleDiscount(db, { phone, subtotal, discountInput, discountPercent } = {}) {
  const preview = previewOffer(db, { phone, subtotal });
  const offerDiscount = preview.eligible ? Number(preview.discountAmount) || 0 : 0;
  const offerPercent = preview.eligible ? Number(preview.salePercent) || 0 : 0;
  const sub = Math.max(0, Number(subtotal) || 0);

  let percent = null;
  if (discountPercent !== undefined && discountPercent !== null && discountPercent !== "") {
    const pct = Number(discountPercent);
    if (Number.isFinite(pct) && pct >= 0) percent = Math.min(100, pct);
  }

  let amount = discountInput === undefined || discountInput === "" ? null : Number(discountInput);
  if ((amount === null || !Number.isFinite(amount)) && percent !== null) {
    amount = round2((sub * percent) / 100);
  }
  const hasManual = amount !== null && Number.isFinite(amount);

  if (hasManual && amount + 0.001 >= offerDiscount) {
    const fromOffer = offerDiscount > 0 && Math.abs(amount - offerDiscount) < 0.02;
    return {
      discount: round2(Math.max(0, Math.min(sub, amount))),
      discountPercent: fromOffer ? offerPercent || percent : percent,
      discountSource: fromOffer ? "offer" : "manual",
      offerPreview: preview,
    };
  }

  if (offerDiscount > 0) {
    return {
      discount: round2(Math.min(sub, offerDiscount)),
      discountPercent: offerPercent || null,
      discountSource: "offer",
      offerPreview: preview,
    };
  }

  return {
    discount: hasManual ? round2(Math.max(0, Math.min(sub, amount))) : 0,
    discountPercent: hasManual ? percent : null,
    discountSource: hasManual ? "manual" : "none",
    offerPreview: preview,
  };
}

/** Claim slot / stamp sale after stock checks. Mutates db + sale. */
function commitOfferOnSale(db, sale) {
  ensureGrandOpeningCampaign(db);
  const campaign = getActiveCampaign(db);
  const phone = normalizePhone(sale.customerPhone);
  const subtotal = Number(sale.subtotal) || 0;
  const giftMin = Number(campaign?.giftMinSubtotal) || 5000;
  const giftEligible = subtotal >= giftMin;

  sale.giftEligible = giftEligible;
  sale.giftMinSubtotal = giftMin;

  if (!campaign || !phone) {
    sale.offerCampaignId = campaign ? campaign.id : null;
    sale.offerSlot = null;
    sale.offerPercent = 0;
    sale.lifetimePercent = 0;
    sale.offerKind = "none";
    return sale;
  }

  let customer = findCustomer(db, phone, campaign.id);
  if (customer) {
    sale.offerCampaignId = campaign.id;
    sale.offerSlot = customer.slot;
    sale.offerPercent = Number(customer.lifetimePercent) || 10;
    sale.lifetimePercent = sale.offerPercent;
    sale.offerKind = "lifetime";
    return sale;
  }

  const claimed = Number(campaign.claimedCount) || 0;
  const maxSlots = Number(campaign.maxSlots) || 50;
  if (claimed >= maxSlots) {
    sale.offerCampaignId = campaign.id;
    sale.offerSlot = null;
    sale.offerPercent = 0;
    sale.lifetimePercent = 0;
    sale.offerKind = "slots_full";
    return sale;
  }

  const slot = claimed + 1;
  const tier = tierForSlot(campaign, slot);
  const inauguralPercent = Number(tier?.salePercent) || 0;
  const lifetimePercent = Number(tier?.lifetimePercent) || 10;

  campaign.claimedCount = slot;
  campaign.updatedAt = nowIso();

  customer = {
    id: `oc_${crypto.randomBytes(4).toString("hex")}`,
    phone,
    campaignId: campaign.id,
    slot,
    inauguralPercent,
    lifetimePercent,
    firstSaleId: sale.id,
    createdAt: nowIso(),
  };
  db.offerCustomers.unshift(customer);

  sale.offerCampaignId = campaign.id;
  sale.offerSlot = slot;
  sale.offerPercent = inauguralPercent;
  sale.lifetimePercent = lifetimePercent;
  sale.offerKind = "inaugural";
  return sale;
}

function getCampaign(db, id = GRAND_OPENING_ID) {
  ensureGrandOpeningCampaign(db);
  const wanted = String(id || GRAND_OPENING_ID);
  return db.offerCampaigns.find((entry) => entry.id === wanted) || (wanted === GRAND_OPENING_ID ? buildGrandOpeningCampaign() : null);
}

function updateCampaign(db, patch = {}, id = GRAND_OPENING_ID) {
  ensureGrandOpeningCampaign(db);
  const campaign = getCampaign(db, id);
  if (!campaign) throw httpError(404, "Offer campaign not found.");
  if (patch.active !== undefined) campaign.active = Boolean(patch.active);
  if (patch.showOnWebsite !== undefined) campaign.showOnWebsite = Boolean(patch.showOnWebsite);
  if (patch.name !== undefined) campaign.name = String(patch.name || "").trim().slice(0, 80) || campaign.name;
  if (patch.publicHeadline !== undefined) {
    campaign.publicHeadline = String(patch.publicHeadline || "").trim().slice(0, 120);
  }
  if (patch.publicLede !== undefined) {
    campaign.publicLede = String(patch.publicLede || "").trim().slice(0, 400);
  }
  if (patch.publicRules !== undefined) {
    const rules = Array.isArray(patch.publicRules)
      ? patch.publicRules
      : String(patch.publicRules || "")
          .split(/\n+/)
          .map((line) => line.trim())
          .filter(Boolean);
    campaign.publicRules = rules.map((line) => String(line).trim().slice(0, 200)).filter(Boolean).slice(0, 12);
  }
  if (patch.publicImage !== undefined) {
    campaign.publicImage = String(patch.publicImage || "").trim().slice(0, 300);
  }
  if (patch.publicCtaLabel !== undefined) {
    campaign.publicCtaLabel = String(patch.publicCtaLabel || "").trim().slice(0, 40) || "Shop now";
  }
  if (patch.publicCtaHref !== undefined) {
    campaign.publicCtaHref = String(patch.publicCtaHref || "").trim().slice(0, 120) || "/shop";
  }
  if (patch.inaugurationNote !== undefined) {
    campaign.inaugurationNote = String(patch.inaugurationNote || "").trim().slice(0, 120);
  }
  if (patch.startsAt !== undefined) {
    const value = patch.startsAt === null || patch.startsAt === "" ? null : String(patch.startsAt);
    if (value && Number.isNaN(Date.parse(value))) throw httpError(400, "startsAt must be an ISO date.");
    campaign.startsAt = value;
  }
  if (patch.endsAt !== undefined) {
    const value = patch.endsAt === null || patch.endsAt === "" ? null : String(patch.endsAt);
    if (value && Number.isNaN(Date.parse(value))) throw httpError(400, "endsAt must be an ISO date.");
    campaign.endsAt = value;
  }
  if (patch.giftMinSubtotal !== undefined) {
    const amount = Number(patch.giftMinSubtotal);
    if (!Number.isFinite(amount) || amount < 0) throw httpError(400, "giftMinSubtotal must be a non-negative number.");
    campaign.giftMinSubtotal = round2(amount);
  }
  if (Array.isArray(patch.tiers) && patch.tiers.length) {
    campaign.tiers = patch.tiers.map((tier) => ({
      from: Number(tier.from),
      to: Number(tier.to),
      salePercent: Number(tier.salePercent),
      lifetimePercent: Number(tier.lifetimePercent) || 10,
    }));
  }
  campaign.updatedAt = nowIso();
  return campaign;
}

function listOfferCustomers(db, campaignId = GRAND_OPENING_ID) {
  ensureOfferCollections(db);
  const campaign = getCampaign(db, campaignId);
  return (db.offerCustomers || [])
    .filter((entry) => entry && entry.campaignId === campaignId)
    .sort((a, b) => (a.slot || 0) - (b.slot || 0))
    .map((entry) => {
      const tier = tierForSlot(campaign, entry.slot);
      return {
        ...entry,
        tierLabel: tier ? `#${tier.from}–${tier.to}` : "",
        tierFrom: tier ? tier.from : null,
        tierTo: tier ? tier.to : null,
      };
    });
}

function summarizeOfferCustomers(db, campaignId = GRAND_OPENING_ID) {
  ensureGrandOpeningCampaign(db);
  const campaign = getCampaign(db, campaignId);
  const customers = listOfferCustomers(db, campaignId);
  const tiers = Array.isArray(campaign?.tiers) && campaign.tiers.length ? campaign.tiers : DEFAULT_TIERS;
  const bands = tiers.map((tier) => {
    const from = Number(tier.from) || 0;
    const to = Number(tier.to) || 0;
    const count = customers.filter((entry) => entry.slot >= from && entry.slot <= to).length;
    return {
      from,
      to,
      label: `#${from}–${to}`,
      salePercent: Number(tier.salePercent) || 0,
      lifetimePercent: Number(tier.lifetimePercent) || 10,
      count,
      capacity: Math.max(0, to - from + 1),
    };
  });
  return {
    claimed: Number(campaign?.claimedCount) || customers.length,
    max: Number(campaign?.maxSlots) || 50,
    remaining: Math.max(0, (Number(campaign?.maxSlots) || 50) - (Number(campaign?.claimedCount) || customers.length)),
    bands,
  };
}

module.exports = {
  GRAND_OPENING_ID,
  DEFAULT_TIERS,
  OFFER_TEMPLATES,
  ensureOfferCollections,
  ensureGrandOpeningCampaign,
  buildGrandOpeningCampaign,
  listTemplates,
  applyTemplate,
  createCampaign,
  deleteCampaign,
  setCampaignImage,
  listCampaigns,
  listPublicOffers,
  listHeroSlides,
  listHeroCards,
  normalizePhone,
  getActiveCampaign,
  previewOffer,
  resolveSaleDiscount,
  commitOfferOnSale,
  getCampaign,
  updateCampaign,
  listOfferCustomers,
  summarizeOfferCustomers,
};
