const SIZES = ["XS", "S", "M", "L", "XL"];

function suggestSize({ height, fit }) {
  const cm = Number(height);
  if (!cm || cm < 140 || cm > 220) {
    return { error: "Enter a height between 140 and 220 cm." };
  }
  let index = 2;
  if (cm < 162) index = 0;
  else if (cm < 170) index = 1;
  else if (cm < 178) index = 2;
  else if (cm < 186) index = 3;
  else index = 4;
  if (fit === "relaxed") index = Math.min(4, index + 1);
  if (fit === "tailored") index = Math.max(0, index - 1);
  return {
    size: SIZES[index],
    note: "This size is an estimate from the height and fit you entered. Structured pieces can vary. Use it as a starting point, then check the garment notes.",
  };
}

function quizResult(answers, products) {
  const life = answers.life || "Office";
  const palette = answers.palette || "Neutrals";
  const titles = {
    Office: "The Considered Uniform",
    Evening: "The After-Hours Edit",
    Weekend: "The Easy Statement",
    Travel: "The Carry-On Wardrobe",
    Wedding: "The Guest Edit",
  };
  const paletteNotes = {
    Neutrals: "Ink, ivory, stone, and charcoal do the work.",
    Earth: "Camel, cognac, rust, and forest keep the palette warm.",
    Deep: "Midnight, ink, and forest give the look its weight.",
    Clear: "One clearer tone — sky or rust — against a quiet ground.",
  };
  const family = {
    Neutrals: ["Ink", "Ivory", "Stone", "Charcoal", "White", "Sand"],
    Earth: ["Camel", "Cognac", "Rust", "Forest", "Sand", "Stone"],
    Deep: ["Midnight", "Ink", "Forest", "Charcoal"],
    Clear: ["Sky", "Rust", "Ivory", "White"],
  };
  const wanted = new Set(family[palette] || family.Neutrals);
  const ranked = products
    .map((product) => {
      let score = 0;
      if (product.occasions.includes(life)) score += 5;
      if (product.occasions.includes("Everyday")) score += 1;
      if (product.colors.some((color) => wanted.has(color.name))) score += 3;
      if (answers.who && answers.who !== "Mix" && product.audience === answers.who) score += 6;
      if (answers.who && answers.who !== "Mix" && product.audience !== answers.who) score -= 3;
      if (answers.budget === "Under ৳8,000" && product.price <= 2500) score += 2;
      if (answers.budget === "৳15,000 and above" && product.price >= 4500) score += 2;
      if (answers.priority === "Versatility" && product.occasions.length > 1) score += 2;
      if (answers.priority === "Occasion impact" && product.price >= 300) score += 1;
      return { product, score };
    })
    .sort((a, b) => b.score - a.score || a.product.price - b.product.price);

  const picks = [];
  const usedSlots = new Set();
  for (const row of ranked) {
    if (picks.length >= 4) break;
    if (usedSlots.has(row.product.slot) && picks.length < 3) continue;
    usedSlots.add(row.product.slot);
    picks.push(row.product);
  }

  return {
    title: titles[life] || "Your StyleARZ Edit",
    summary: `${paletteNotes[palette] || paletteNotes.Neutrals} Built around ${life.toLowerCase()} dressing${
      answers.fit ? `, with a ${answers.fit} fit` : ""
    }.`,
    answers,
    productIds: picks.map((product) => product.id),
  };
}

function budgetOutfit(products, budget, occasion) {
  const amount = Number(budget);
  if (!amount || amount < 1500) return { error: "Set a budget of at least ৳1,500." };
  const evening = occasion === "Evening" || occasion === "Celebration";
  const template = occasion === "Children"
    ? ["top", "bottom", "layer"]
    : evening
      ? ["dress", "accessory"]
      : ["layer", "top", "bottom"];

  let pool = products.filter((product) => product.stock > 0);
  if (occasion === "Children") pool = pool.filter((product) => product.audience === "Children");
  const chosen = [];
  let remaining = amount;

  template.forEach((slot, index) => {
    const slotsLeft = template.length - index - 1;
    const reserve = slotsLeft * (occasion === "Children" ? 900 : 1800);
    const options = pool
      .filter((product) => product.slot === slot && !chosen.some((item) => item.id === product.id))
      .filter((product) => product.price <= Math.max(0, remaining - reserve) || slotsLeft === 0)
      .sort((a, b) => {
        const ao = a.occasions.includes(occasion) ? 1 : 0;
        const bo = b.occasions.includes(occasion) ? 1 : 0;
        if (ao !== bo) return bo - ao;
        return b.price - a.price;
      });
    const pick = options.find((product) => product.price <= remaining);
    if (pick) {
      chosen.push(pick);
      remaining -= pick.price;
    }
  });

  const total = chosen.reduce((sum, product) => sum + product.price, 0);
  return {
    items: chosen,
    total,
    remaining: Math.max(0, amount - total),
    note:
      chosen.length === 0
        ? "Nothing in the edit fits this budget. Raise it slightly or change the occasion."
        : `Assembled for ${occasion || "everyday"} dressing. Prices are taken from current stock.`,
  };
}

function priceItems(products, items) {
  if (!Array.isArray(items) || items.length === 0) {
    return { error: "Your bag is empty." };
  }
  const priced = [];
  for (const item of items) {
    const product = products.find((entry) => entry.id === item.productId);
    if (!product) return { error: "A piece in the bag is no longer available." };
    const qty = Number(item.qty);
    if (!qty || qty < 1 || qty > 5) return { error: "Quantity must be between 1 and 5." };
    const color = product.colors.find((entry) => entry.name === item.color);
    if (!color) return { error: `Choose a colour for ${product.name}.` };
    if (!product.sizes.includes(item.size)) return { error: `Choose a size for ${product.name}.` };
    if (product.stock < qty) return { error: `${product.name} does not have enough stock.` };
    priced.push({
      productId: product.id,
      name: product.name,
      price: product.price,
      qty,
      size: item.size,
      color: color.name,
      image: product.image,
    });
  }
  const subtotal = priced.reduce((sum, item) => sum + item.price * item.qty, 0);
  const shipping = subtotal >= 8000 ? 0 : 120;
  return { items: priced, subtotal, shipping, total: subtotal + shipping };
}

module.exports = { suggestSize, quizResult, budgetOutfit, priceItems };
