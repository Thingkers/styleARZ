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

const INSERT_BATCH_ROWS = 200;
const INSERT_BATCH_BYTES = 512 * 1024;
const DELETE_BATCH_KEYS = 500;

/*
 * Incremental persistence: the last committed signature of every row, per table.
 * `null` until a full table set has been loaded from or written to MySQL, so the
 * first save of a fresh process (seed, import, reset) still rewrites everything.
 */
let savedState = null;

function resetSaveCache() {
  savedState = null;
}

function rowSignature(mapped) {
  return mapped.doc !== undefined ? mapped.doc : JSON.stringify(mapped);
}

async function insertRows(connection, table, rows) {
  if (!rows.length) return;
  const columns = Object.keys(rows[0]);
  const columnSql = columns.map((c) => `\`${c}\``).join(", ");
  let batch = [];
  let bytes = 0;
  const flush = async () => {
    if (!batch.length) return;
    await connection.query(`INSERT INTO \`${table}\` (${columnSql}) VALUES ?`, [batch]);
    batch = [];
    bytes = 0;
  };
  for (const row of rows) {
    const values = columns.map((col) => (row[col] === undefined ? null : row[col]));
    const size = typeof row.doc === "string" ? row.doc.length : 256;
    if (batch.length && (batch.length >= INSERT_BATCH_ROWS || bytes + size > INSERT_BATCH_BYTES)) {
      await flush();
    }
    batch.push(values);
    bytes += size;
  }
  await flush();
}

async function deleteKeys(connection, table, keyColumn, keys) {
  for (let start = 0; start < keys.length; start += DELETE_BATCH_KEYS) {
    const chunk = keys.slice(start, start + DELETE_BATCH_KEYS);
    await connection.query(`DELETE FROM \`${table}\` WHERE \`${keyColumn}\` IN (?)`, [chunk]);
  }
}

/** Map one in-memory collection to rows keyed by primary key (first occurrence wins). */
function mapTableRows(spec, db) {
  const rows = new Map();
  for (const source of spec.rows(db)) {
    const mapped = spec.map(source);
    if (!mapped) continue;
    const key = mapped[spec.key];
    if (key === undefined || key === null || key === "") {
      console.warn(`[persist] skipped ${spec.table} row without ${spec.key}`);
      continue;
    }
    if (rows.has(key)) {
      console.warn(`[persist] skipped duplicate ${spec.table} ${spec.key}=${key}`);
      continue;
    }
    rows.set(key, mapped);
  }
  return rows;
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
        printer: value.printer && typeof value.printer === "object" ? value.printer : undefined,
      };
    }
  });

  const keysByTable = new Map();
  const loadDocs = async (table, targetKey) => {
    const [rows] = await connection.query(`SELECT id, doc FROM \`${table}\``);
    keysByTable.set(table, rows.map((row) => row.id));
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
  keysByTable.set("inventory_categories", categories.map((row) => row.name));

  primeSaveCache(db, keysByTable);
  return db;
}

const TABLE_SPECS = [
  {
    table: "users",
    key: "id",
    rows: (db) => db.users || [],
    map: (user) => ({
      id: user.id,
      email: String(user.email || "").toLowerCase(),
      role: user.role || "customer",
      doc: asJson(user),
      created_at: user.createdAt || null,
    }),
  },
  {
    table: "products",
    key: "id",
    rows: (db) => db.products || [],
    map: (product) => ({
      id: product.id,
      name: product.name || "",
      audience: product.audience || null,
      category: product.category || null,
      listed: product.listed === false ? 0 : 1,
      featured: product.featured ? 1 : 0,
      sort_order: Number.isFinite(product.sortOrder) ? product.sortOrder : 9999,
      doc: asJson(product),
    }),
  },
  {
    table: "inventory_items",
    key: "id",
    rows: (db) => db.inventoryItems || [],
    map: (item) => ({
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
    }),
  },
  {
    table: "inventory_categories",
    key: "name",
    rows: (db) => db.inventoryCategories || [],
    map: (entry) => {
      const name = typeof entry === "string" ? entry : entry && entry.name;
      if (!name) return null;
      const audiences = typeof entry === "object" && Array.isArray(entry.audiences) ? entry.audiences : [];
      return { name, audiences: asJson(audiences) };
    },
  },
  {
    table: "inventory_deleted",
    key: "id",
    rows: (db) => db.inventoryDeleted || [],
    map: (entry) => ({
      id: entry.id,
      barcode: entry.barcode || null,
      deleted_at: entry.deletedAt || new Date().toISOString(),
      doc: asJson(entry),
    }),
  },
  {
    table: "label_drafts",
    key: "id",
    rows: (db) => db.labelDrafts || [],
    map: (draft) => ({
      id: draft.id,
      barcode: draft.barcode || draft.id,
      status: draft.status || "draft",
      price: Number(draft.price) || 0,
      name: draft.name || null,
      size: draft.size || null,
      inventory_item_id: draft.inventoryItemId || null,
      doc: asJson(draft),
      created_at: draft.createdAt || null,
    }),
  },
  {
    table: "orders",
    key: "id",
    rows: (db) => db.orders || [],
    map: (order) => ({
      id: order.id,
      user_id: order.userId || null,
      email: order.email || null,
      status: order.status || "confirmed",
      total: Number(order.total) || 0,
      doc: asJson(order),
      created_at: order.createdAt || null,
    }),
  },
  {
    table: "pos_sessions",
    key: "id",
    rows: (db) => db.posSessions || [],
    map: (session) => ({
      id: session.id,
      code: session.code || session.id,
      status: session.status || "open",
      doc: asJson(session),
    }),
  },
  {
    table: "pos_scan_events",
    key: "id",
    rows: (db) => db.posScanEvents || [],
    map: (event) => ({
      id: event.id,
      session_id: event.sessionId || "",
      created_at: event.createdAt || null,
      doc: asJson(event),
    }),
  },
  {
    table: "pos_sales",
    key: "id",
    rows: (db) => db.posSales || [],
    map: (sale) => ({
      id: sale.id,
      session_id: sale.sessionId || null,
      client_sale_id: sale.clientId || sale.clientSaleId || null,
      created_at: sale.createdAt || null,
      doc: asJson(sale),
    }),
  },
  {
    table: "pos_sales_deleted",
    key: "id",
    rows: (db) => db.posSalesDeleted || [],
    map: (entry) => ({
      id: entry.id,
      client_sale_id: entry.clientId || null,
      deleted_at: entry.deletedAt || null,
      doc: asJson(entry),
    }),
  },
  {
    table: "offer_campaigns",
    key: "id",
    rows: (db) => db.offerCampaigns || [],
    map: (campaign) => ({
      id: campaign.id,
      name: campaign.name || "",
      active: campaign.active ? 1 : 0,
      claimed_count: Number(campaign.claimedCount) || 0,
      doc: asJson(campaign),
    }),
  },
  {
    table: "offer_customers",
    key: "id",
    rows: (db) => db.offerCustomers || [],
    map: (entry) => ({
      id: entry.id,
      phone: entry.phone || "",
      campaign_id: entry.campaignId || "",
      slot: Number(entry.slot) || 0,
      doc: asJson(entry),
      created_at: entry.createdAt || null,
    }),
  },
  {
    table: "looks",
    key: "id",
    rows: (db) => db.looks || [],
    map: (look) => ({
      id: look.id,
      doc: asJson(look),
    }),
  },
  {
    table: "home_collections",
    key: "id",
    rows: (db) =>
      (db.homeCollections || []).map((entry, index) => ({
        ...entry,
        sortOrder: Number.isFinite(entry.sortOrder) ? entry.sortOrder : index,
      })),
    map: (entry) => ({
      id: entry.id,
      audience: entry.audience || null,
      sort_order: Number.isFinite(entry.sortOrder) ? entry.sortOrder : 0,
      doc: asJson(entry),
    }),
  },
  {
    table: "wardrobe",
    key: "id",
    rows: (db) => db.wardrobe || [],
    map: (item) => ({
      id: item.id,
      user_id: item.userId || "",
      doc: asJson(item),
    }),
  },
  {
    table: "outfits",
    key: "id",
    rows: (db) => db.outfits || [],
    map: (item) => ({
      id: item.id,
      user_id: item.userId || "",
      doc: asJson(item),
    }),
  },
  {
    table: "planner",
    key: "id",
    rows: (db) => db.planner || [],
    map: (item) => ({
      id: item.id,
      user_id: item.userId || "",
      entry_date: item.date || null,
      doc: asJson(item),
    }),
  },
  {
    table: "posts",
    key: "id",
    rows: (db) => db.posts || [],
    map: (post) => ({
      id: post.id,
      status: post.status || "published",
      doc: asJson(post),
      created_at: post.createdAt || null,
    }),
  },
  {
    table: "notifications",
    key: "id",
    rows: (db) => db.notifications || [],
    map: (item) => ({
      id: item.id,
      user_id: item.userId || "",
      read_flag: item.read ? 1 : 0,
      doc: asJson(item),
      created_at: item.createdAt || null,
    }),
  },
];

function metaRows(db) {
  return [
    ["inventorySeq", JSON.stringify(Number(db.inventorySeq) || 1000)],
    [
      "settings",
      JSON.stringify({
        smsSenderPhone: String((db.settings && db.settings.smsSenderPhone) || "").trim(),
        printer: db.settings && db.settings.printer ? db.settings.printer : undefined,
      }),
    ],
    ["smsBroadcasts", JSON.stringify(Array.isArray(db.smsBroadcasts) ? db.smsBroadcasts.slice(0, 100) : [])],
  ];
}

/** Snapshot every table's rows and signatures synchronously, before any await. */
function snapshotTables(db) {
  return TABLE_SPECS.map((spec) => {
    const rows = mapTableRows(spec, db);
    const signatures = new Map();
    rows.forEach((mapped, key) => signatures.set(key, rowSignature(mapped)));
    return { spec, rows, signatures };
  });
}

const ORPHAN_SIGNATURE = "\u0000orphan";

/**
 * Record the in-memory state as already persisted (right after loadAll). With
 * `keysByTable`, only keys really present in MySQL count as saved, and MySQL rows that
 * did not load into memory (unparseable docs) are marked so the next save deletes them.
 */
function primeSaveCache(db, keysByTable) {
  const tables = new Map();
  snapshotTables(db).forEach(({ spec, signatures }) => {
    const dbKeys = keysByTable && keysByTable.get(spec.table);
    if (!dbKeys) {
      tables.set(spec.table, signatures);
      return;
    }
    const saved = new Map();
    dbKeys.forEach((key) => {
      saved.set(key, signatures.has(key) ? signatures.get(key) : ORPHAN_SIGNATURE);
    });
    tables.set(spec.table, saved);
  });
  savedState = { tables, meta: new Map(metaRows(db)) };
}

/*
 * Writes only rows that changed since the last committed save (delete + insert of the
 * changed keys, removed keys deleted), in one transaction. Falls back to a full table
 * rewrite when nothing has been loaded/saved yet in this process.
 */
async function saveAll(db) {
  const snapshot = snapshotTables(db);
  const meta = metaRows(db);
  const previous = savedState;

  await withTransaction(async (connection) => {
    for (const [metaKey, value] of meta) {
      if (previous && previous.meta.get(metaKey) === value) continue;
      await connection.execute(
        `INSERT INTO app_meta (meta_key, meta_value) VALUES (:key, :value)
         ON DUPLICATE KEY UPDATE meta_value = VALUES(meta_value)`,
        { key: metaKey, value }
      );
    }

    for (const { spec, rows, signatures } of snapshot) {
      const before = previous && previous.tables.get(spec.table);
      if (!before) {
        await connection.query(`DELETE FROM \`${spec.table}\``);
        await insertRows(connection, spec.table, [...rows.values()]);
        continue;
      }
      const staleKeys = [];
      const writeRows = [];
      before.forEach((_signature, key) => {
        if (!signatures.has(key)) staleKeys.push(key);
      });
      signatures.forEach((signature, key) => {
        const old = before.get(key);
        if (old === signature) return;
        if (old !== undefined) staleKeys.push(key);
        writeRows.push(rows.get(key));
      });
      if (staleKeys.length) await deleteKeys(connection, spec.table, spec.key, staleKeys);
      if (writeRows.length) await insertRows(connection, spec.table, writeRows);
    }
  });

  const tables = new Map();
  snapshot.forEach(({ spec, signatures }) => tables.set(spec.table, signatures));
  savedState = { tables, meta: new Map(meta) };
}

module.exports = {
  loadAll,
  saveAll,
  primeSaveCache,
  resetSaveCache,
  parseDoc,
  asJson,
};
