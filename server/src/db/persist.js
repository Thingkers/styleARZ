const { withTransaction } = require("./pool");

function asJson(value) {
  return JSON.stringify(value === undefined ? null : value);
}

function parseDoc(row) {
  if (!row) return null;
  const doc = row.doc;
  if (doc == null) return null;
  if (typeof doc === "object") return doc;
  try {
    return JSON.parse(doc);
  } catch {
    return null;
  }
}

async function replaceCollection(connection, table, rows, mapFn) {
  await connection.query(`DELETE FROM \`${table}\``);
  for (const row of rows) {
    const mapped = mapFn(row);
    if (!mapped) continue;
    const columns = Object.keys(mapped);
    const placeholders = columns.map((col) => `:${col}`).join(", ");
    await connection.execute(
      `INSERT INTO \`${table}\` (${columns.map((c) => `\`${c}\``).join(", ")}) VALUES (${placeholders})`,
      mapped
    );
  }
}

async function loadAll(connection) {
  const db = {
    users: [],
    products: [],
    looks: [],
    homeCollections: [],
    inventoryItems: [],
    inventorySeq: 1000,
    inventoryDeleted: [],
    inventoryCategories: [],
    labelDrafts: [],
    posSessions: [],
    posScanEvents: [],
    posSales: [],
    posSalesDeleted: [],
    offerCampaigns: [],
    offerCustomers: [],
    smsBroadcasts: [],
    settings: { smsSenderPhone: "" },
    orders: [],
    wardrobe: [],
    outfits: [],
    planner: [],
    posts: [],
    notifications: [],
  };

  const [metaRows] = await connection.query("SELECT meta_key, meta_value FROM app_meta");
  metaRows.forEach((row) => {
    let value = row.meta_value;
    if (typeof value === "string") {
      try {
        value = JSON.parse(value);
      } catch {
        // keep string
      }
    }
    if (row.meta_key === "inventorySeq") db.inventorySeq = Number(value) || 1000;
    if (row.meta_key === "smsBroadcasts" && Array.isArray(value)) {
      db.smsBroadcasts = value;
    }
    if (row.meta_key === "settings" && value && typeof value === "object") {
      db.settings = {
        smsSenderPhone: String(value.smsSenderPhone || "").trim(),
      };
    }
  });

  const loadDocs = async (table, targetKey) => {
    const [rows] = await connection.query(`SELECT doc FROM \`${table}\``);
    db[targetKey] = rows.map(parseDoc).filter(Boolean);
  };

  await loadDocs("users", "users");
  await loadDocs("products", "products");
  await loadDocs("looks", "looks");
  await loadDocs("home_collections", "homeCollections");
  await loadDocs("inventory_items", "inventoryItems");
  await loadDocs("inventory_deleted", "inventoryDeleted");
  await loadDocs("label_drafts", "labelDrafts");
  await loadDocs("pos_sessions", "posSessions");
  await loadDocs("pos_scan_events", "posScanEvents");
  await loadDocs("pos_sales", "posSales");
  await loadDocs("pos_sales_deleted", "posSalesDeleted");
  await loadDocs("offer_campaigns", "offerCampaigns");
  await loadDocs("offer_customers", "offerCustomers");
  await loadDocs("orders", "orders");
  await loadDocs("wardrobe", "wardrobe");
  await loadDocs("outfits", "outfits");
  await loadDocs("planner", "planner");
  await loadDocs("posts", "posts");
  await loadDocs("notifications", "notifications");

  const [categories] = await connection.query("SELECT name, audiences FROM inventory_categories");
  db.inventoryCategories = categories.map((row) => {
    let audiences = row.audiences;
    if (typeof audiences === "string") {
      try {
        audiences = JSON.parse(audiences);
      } catch {
        audiences = [];
      }
    }
    return { name: row.name, audiences: Array.isArray(audiences) ? audiences : [] };
  });

  return db;
}

async function saveAll(db) {
  const homeCollections = (db.homeCollections || []).map((entry, index) => ({
    ...entry,
    sortOrder: Number.isFinite(entry.sortOrder) ? entry.sortOrder : index,
  }));

  await withTransaction(async (connection) => {
    await connection.execute(
      `INSERT INTO app_meta (meta_key, meta_value) VALUES ('inventorySeq', :value)
       ON DUPLICATE KEY UPDATE meta_value = VALUES(meta_value)`,
      { value: JSON.stringify(Number(db.inventorySeq) || 1000) }
    );

    const settings = {
      smsSenderPhone: String((db.settings && db.settings.smsSenderPhone) || "").trim(),
    };
    await connection.execute(
      `INSERT INTO app_meta (meta_key, meta_value) VALUES ('settings', :value)
       ON DUPLICATE KEY UPDATE meta_value = VALUES(meta_value)`,
      { value: JSON.stringify(settings) }
    );

    await connection.execute(
      `INSERT INTO app_meta (meta_key, meta_value) VALUES ('smsBroadcasts', :value)
       ON DUPLICATE KEY UPDATE meta_value = VALUES(meta_value)`,
      { value: JSON.stringify(Array.isArray(db.smsBroadcasts) ? db.smsBroadcasts.slice(0, 100) : []) }
    );

    await replaceCollection(connection, "users", db.users || [], (user) => ({
      id: user.id,
      email: String(user.email || "").toLowerCase(),
      role: user.role || "customer",
      doc: asJson(user),
      created_at: user.createdAt || null,
    }));

    await replaceCollection(connection, "products", db.products || [], (product) => ({
      id: product.id,
      name: product.name || "",
      audience: product.audience || null,
      category: product.category || null,
      listed: product.listed === false ? 0 : 1,
      featured: product.featured ? 1 : 0,
      sort_order: Number.isFinite(product.sortOrder) ? product.sortOrder : 9999,
      doc: asJson(product),
    }));

    await replaceCollection(connection, "inventory_items", db.inventoryItems || [], (item) => ({
      id: item.id,
      sku: item.sku || item.id,
      barcode: item.barcode || item.id,
      name: item.name || "",
      category: item.category || null,
      audience: item.audience || null,
      price: Number(item.price) || 0,
      cost: Number(item.cost) || 0,
      stock: Number(item.stock) || 0,
      version: Number(item.version) || 1,
      listed: item.listed === false ? 0 : 1,
      featured: item.featured ? 1 : 0,
      sort_order: Number.isFinite(item.sortOrder) ? item.sortOrder : 9999,
      doc: asJson(item),
    }));

    await replaceCollection(connection, "inventory_categories", db.inventoryCategories || [], (entry) => {
      const name = typeof entry === "string" ? entry : entry && entry.name;
      if (!name) return null;
      const audiences = typeof entry === "object" && Array.isArray(entry.audiences) ? entry.audiences : [];
      return { name, audiences: asJson(audiences) };
    });

    await replaceCollection(connection, "inventory_deleted", db.inventoryDeleted || [], (entry) => ({
      id: entry.id,
      barcode: entry.barcode || null,
      deleted_at: entry.deletedAt || new Date().toISOString(),
      doc: asJson(entry),
    }));

    await replaceCollection(connection, "label_drafts", db.labelDrafts || [], (draft) => ({
      id: draft.id,
      barcode: draft.barcode || draft.id,
      status: draft.status || "draft",
      price: Number(draft.price) || 0,
      name: draft.name || null,
      size: draft.size || null,
      inventory_item_id: draft.inventoryItemId || null,
      doc: asJson(draft),
      created_at: draft.createdAt || null,
    }));

    await replaceCollection(connection, "orders", db.orders || [], (order) => ({
      id: order.id,
      user_id: order.userId || null,
      email: order.email || null,
      status: order.status || "confirmed",
      total: Number(order.total) || 0,
      doc: asJson(order),
      created_at: order.createdAt || null,
    }));

    await replaceCollection(connection, "pos_sessions", db.posSessions || [], (session) => ({
      id: session.id,
      code: session.code || session.id,
      status: session.status || "open",
      doc: asJson(session),
    }));

    await replaceCollection(connection, "pos_scan_events", db.posScanEvents || [], (event) => ({
      id: event.id,
      session_id: event.sessionId || "",
      created_at: event.createdAt || null,
      doc: asJson(event),
    }));

    await replaceCollection(connection, "pos_sales", db.posSales || [], (sale) => ({
      id: sale.id,
      session_id: sale.sessionId || null,
      client_sale_id: sale.clientId || sale.clientSaleId || null,
      created_at: sale.createdAt || null,
      doc: asJson(sale),
    }));

    await replaceCollection(connection, "pos_sales_deleted", db.posSalesDeleted || [], (entry) => ({
      id: entry.id,
      client_sale_id: entry.clientId || null,
      deleted_at: entry.deletedAt || null,
      doc: asJson(entry),
    }));

    await replaceCollection(connection, "offer_campaigns", db.offerCampaigns || [], (campaign) => ({
      id: campaign.id,
      name: campaign.name || "",
      active: campaign.active ? 1 : 0,
      claimed_count: Number(campaign.claimedCount) || 0,
      doc: asJson(campaign),
    }));

    await replaceCollection(connection, "offer_customers", db.offerCustomers || [], (entry) => ({
      id: entry.id,
      phone: entry.phone || "",
      campaign_id: entry.campaignId || "",
      slot: Number(entry.slot) || 0,
      doc: asJson(entry),
      created_at: entry.createdAt || null,
    }));

    await replaceCollection(connection, "looks", db.looks || [], (look) => ({
      id: look.id,
      doc: asJson(look),
    }));

    await replaceCollection(connection, "home_collections", homeCollections, (entry) => ({
      id: entry.id,
      audience: entry.audience || null,
      sort_order: Number.isFinite(entry.sortOrder) ? entry.sortOrder : 0,
      doc: asJson(entry),
    }));

    await replaceCollection(connection, "wardrobe", db.wardrobe || [], (item) => ({
      id: item.id,
      user_id: item.userId || "",
      doc: asJson(item),
    }));

    await replaceCollection(connection, "outfits", db.outfits || [], (item) => ({
      id: item.id,
      user_id: item.userId || "",
      doc: asJson(item),
    }));

    await replaceCollection(connection, "planner", db.planner || [], (item) => ({
      id: item.id,
      user_id: item.userId || "",
      entry_date: item.date || null,
      doc: asJson(item),
    }));

    await replaceCollection(connection, "posts", db.posts || [], (post) => ({
      id: post.id,
      status: post.status || "published",
      doc: asJson(post),
      created_at: post.createdAt || null,
    }));

    await replaceCollection(connection, "notifications", db.notifications || [], (item) => ({
      id: item.id,
      user_id: item.userId || "",
      read_flag: item.read ? 1 : 0,
      doc: asJson(item),
      created_at: item.createdAt || null,
    }));
  });
}

module.exports = {
  loadAll,
  saveAll,
  parseDoc,
  asJson,
};
