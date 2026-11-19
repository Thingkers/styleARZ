const { httpError } = require("./inventory");

function normalizeBdPhone(raw) {
  let digits = String(raw || "").replace(/[^\d+]/g, "").trim();
  if (!digits) return "";
  if (digits.startsWith("+880")) digits = `0${digits.slice(4)}`;
  else if (digits.startsWith("880")) digits = `0${digits.slice(3)}`;
  else if (digits.startsWith("8801")) digits = `0${digits.slice(3)}`;
  digits = digits.replace(/\D/g, "");
  if (/^01\d{9}$/.test(digits)) return digits;
  if (/^1\d{9}$/.test(digits)) return `0${digits}`;
  return "";
}

function smsConfigured() {
  const provider = String(process.env.SMS_PROVIDER || "log").toLowerCase();
  if (provider === "log") return true;
  if (provider === "http") return Boolean(process.env.SMS_HTTP_URL);
  if (provider === "twilio") {
    return Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM);
  }
  return false;
}

function formatSaleSms(sale) {
  const count = (sale.items || []).reduce((sum, line) => sum + Number(line.qty || 0), 0);
  const total = Math.round(Number(sale.total) || 0);
  const method = String(sale.paymentMethod || "cash");
  return [
    `StyleARZ Invoice ${sale.receiptNo || sale.id}`,
    `Total: BDT ${total} (${method})`,
    `${count} item${count === 1 ? "" : "s"}. Thank you.`,
  ].join("\n");
}

function resolveSenderPhone(fromPhone) {
  const saved = normalizeBdPhone(fromPhone);
  if (saved) return saved;
  const envSender = normalizeBdPhone(process.env.SMS_HTTP_SENDER || process.env.SMS_SENDER_PHONE || "");
  return envSender || "";
}

async function sendViaHttp(phone, message, fromPhone) {
  const url = process.env.SMS_HTTP_URL;
  if (!url) throw httpError(503, "SMS_HTTP_URL is not configured.");
  const method = String(process.env.SMS_HTTP_METHOD || "POST").toUpperCase();
  const headers = { "Content-Type": "application/json", Accept: "application/json" };
  if (process.env.SMS_HTTP_TOKEN) headers.Authorization = `Bearer ${process.env.SMS_HTTP_TOKEN}`;
  const body = {
    to: phone,
    phone,
    message,
    text: message,
    from: fromPhone,
    sender: fromPhone,
    account: fromPhone,
    balancePhone: fromPhone,
  };
  const response = await fetch(url, { method, headers, body: JSON.stringify(body) });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw httpError(502, `SMS gateway failed (${response.status}). ${text.slice(0, 160)}`.trim());
  }
  return { provider: "http", from: fromPhone };
}

async function sendViaTwilio(phone, message, fromPhone) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const fromEnv = process.env.TWILIO_FROM;
  if (!sid || !token) throw httpError(503, "Twilio SMS is not configured.");
  const fromRaw = fromPhone || fromEnv;
  if (!fromRaw) throw httpError(400, "Save an SMS sender mobile number in Admin → Settings.");
  const to = phone.startsWith("0") ? `+880${phone.slice(1)}` : phone;
  const from = String(fromRaw).startsWith("0") ? `+880${String(fromRaw).slice(1)}` : String(fromRaw);
  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  const params = new URLSearchParams({ To: to, From: from, Body: message });
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw httpError(502, `Twilio SMS failed (${response.status}). ${text.slice(0, 160)}`.trim());
  }
  return { provider: "twilio", from };
}

/**
 * Send SMS. `fromPhone` is the shop mobile whose SMS balance / gateway account is used.
 */
async function sendSms({ phone, message, fromPhone }) {
  const normalized = normalizeBdPhone(phone);
  if (!normalized) throw httpError(400, "Enter a valid Bangladesh mobile number (01XXXXXXXXX).");
  const text = String(message || "").trim().slice(0, 480);
  if (!text) throw httpError(400, "SMS message is empty.");

  const sender = resolveSenderPhone(fromPhone);
  if (!sender) {
    throw httpError(400, "Save the SMS sender mobile number in Admin → Settings first. Invoice SMS is billed to that number’s balance.");
  }

  const provider = String(process.env.SMS_PROVIDER || "log").toLowerCase();
  if (provider === "log") {
    console.log(`[sms:log] from=${sender} to=${normalized} ${text.replace(/\n/g, " | ")}`);
    return { ok: true, provider: "log", phone: normalized, from: sender };
  }
  if (provider === "http") {
    const result = await sendViaHttp(normalized, text, sender);
    return { ok: true, phone: normalized, ...result };
  }
  if (provider === "twilio") {
    const result = await sendViaTwilio(normalized, text, sender);
    return { ok: true, phone: normalized, ...result };
  }
  throw httpError(503, "Unknown SMS_PROVIDER. Use log, http, or twilio.");
}

module.exports = {
  normalizeBdPhone,
  smsConfigured,
  formatSaleSms,
  sendSms,
  resolveSenderPhone,
};
