const crypto = require("crypto");
const sms = require("./sms");

const AUDIENCES = [
  {
    id: "offer_customers",
    label: "Inauguration guests",
    description: "Unique phones that claimed a Grand Opening slot",
  },
  {
    id: "pos_customers",
    label: "POS customers",
    description: "Unique phones from completed POS sales",
  },
  {
    id: "manual",
    label: "Manual list",
    description: "Paste phone numbers (one per line or comma-separated)",
  },
];

function ensureBroadcastCollections(db) {
  if (!Array.isArray(db.smsBroadcasts)) db.smsBroadcasts = [];
  if (!db.settings || typeof db.settings !== "object")
    db.settings = { smsSenderPhone: "" };
  return db;
}

function uniquePhones(list) {
  const seen = new Set();
  const out = [];
  for (const raw of list) {
    const phone = sms.normalizeBdPhone(raw);
    if (!phone || seen.has(phone)) continue;
    seen.add(phone);
    out.push(phone);
  }
  return out;
}

function parseManualPhones(raw) {
  return String(raw || "")
    .split(/[\s,;]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function resolveAudience(
  db,
  { audience = "offer_customers", phonesText = "" } = {},
) {
  ensureBroadcastCollections(db);
  if (audience === "manual") {
    return uniquePhones(parseManualPhones(phonesText));
  }
  if (audience === "pos_customers") {
    const fromSales = (db.posSales || [])
      .map((sale) => sale && sale.customerPhone)
      .filter(Boolean);
    return uniquePhones(fromSales);
  }
  // default: inauguration offer customers
  const fromOffers = (db.offerCustomers || [])
    .map((entry) => entry && entry.phone)
    .filter(Boolean);
  return uniquePhones(fromOffers);
}

function audienceCounts(db) {
  ensureBroadcastCollections(db);
  return {
    offer_customers: resolveAudience(db, { audience: "offer_customers" })
      .length,
    pos_customers: resolveAudience(db, { audience: "pos_customers" }).length,
  };
}

function listBroadcasts(db, limit = 30) {
  ensureBroadcastCollections(db);
  return (db.smsBroadcasts || []).slice(
    0,
    Math.max(1, Math.min(100, Number(limit) || 30)),
  );
}

/**
 * Send the same SMS to an audience. Sequential to avoid hammering the gateway.
 * dryRun=true only resolves recipients and returns a preview.
 */
async function sendBroadcast(db, input = {}) {
  ensureBroadcastCollections(db);
  const audience = String(input.audience || "offer_customers");
  const message = String(input.message || "")
    .trim()
    .slice(0, 480);
  const dryRun = Boolean(input.dryRun);
  if (!message) {
    const err = new Error("Message is required.");
    err.status = 400;
    throw err;
  }
  if (!AUDIENCES.some((entry) => entry.id === audience)) {
    const err = new Error("Unknown audience.");
    err.status = 400;
    throw err;
  }

  const phones = resolveAudience(db, {
    audience,
    phonesText: input.phonesText,
  });
  if (!phones.length) {
    const err = new Error(
      "No valid Bangladesh mobile numbers in this audience.",
    );
    err.status = 400;
    throw err;
  }

  const fromPhone = String(db.settings?.smsSenderPhone || "").trim();
  const provider = String(process.env.SMS_PROVIDER || "log").toLowerCase();

  if (
    !dryRun &&
    !["bulksmsbd", "twilio", "sendmysms"].includes(provider) &&
    !sms.resolveSenderPhone(fromPhone)
  ) {
    const err = new Error(
      "Save the SMS sender mobile in Admin → Settings first.",
    );
    err.status = 400;
    throw err;
  }

  const results = [];
  let sent = 0;
  let failed = 0;
  for (const phone of phones) {
    try {
      const result = await sms.sendSms({ phone, message, fromPhone });
      results.push({ phone, ok: true, provider: result.provider });
      sent += 1;
    } catch (error) {
      results.push({ phone, ok: false, error: error.message || "Send failed" });
      failed += 1;
    }
  }

  const record = {
    id: `bc_${crypto.randomBytes(4).toString("hex")}`,
    audience,
    message,
    recipientCount: phones.length,
    sent,
    failed,
    provider: String(process.env.SMS_PROVIDER || "log"),
    createdAt: new Date().toISOString(),
    sampleFailures: results.filter((row) => !row.ok).slice(0, 10),
  };
  db.smsBroadcasts.unshift(record);
  db.smsBroadcasts = db.smsBroadcasts.slice(0, 100);

  return { dryRun: false, ...record, results };
}

module.exports = {
  AUDIENCES,
  ensureBroadcastCollections,
  audienceCounts,
  listBroadcasts,
  resolveAudience,
  sendBroadcast,
};
