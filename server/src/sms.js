const { httpError } = require("./inventory");

function normalizeBdPhone(raw) {
  let digits = String(raw || "")
    .replace(/[^\d+]/g, "")
    .trim();
  if (!digits) return "";
  if (digits.startsWith("+880")) digits = `0${digits.slice(4)}`;
  else if (digits.startsWith("880")) digits = `0${digits.slice(3)}`;
  else if (digits.startsWith("8801")) digits = `0${digits.slice(3)}`;
  digits = digits.replace(/\D/g, "");
  if (/^01\d{9}$/.test(digits)) return digits;
  if (/^1\d{9}$/.test(digits)) return `0${digits}`;
  return "";
}

// function smsConfigured() {
//   const provider = String(process.env.SMS_PROVIDER || "log").toLowerCase();
//   if (provider === "log") return true;
//   if (provider === "http") return Boolean(process.env.SMS_HTTP_URL);
//   if (provider === "twilio") {
//     return Boolean(
//       process.env.TWILIO_ACCOUNT_SID &&
//       process.env.TWILIO_AUTH_TOKEN &&
//       process.env.TWILIO_FROM,
//     );
//   }
//   return false;
// }

function smsConfigured() {
  const provider = String(process.env.SMS_PROVIDER || "log").toLowerCase();

  if (provider === "log") return true;

  if (provider === "http") {
    return Boolean(process.env.SMS_HTTP_URL);
  }

  if (provider === "bulksmsbd") {
    return Boolean(
      process.env.BULKSMSBD_API_URL &&
      process.env.BULKSMSBD_API_KEY &&
      process.env.BULKSMSBD_SENDER_ID,
    );
  }

  if (provider === "twilio") {
    return Boolean(
      process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_FROM,
    );
  }

  if (provider === "sendmysms") {
    return Boolean(
      process.env.SENDMYSMS_API_URL &&
      process.env.SENDMYSMS_API_KEY &&
      process.env.SENDMYSMS_USERNAME,
    );
  }

  return false;
}

function formatSaleSms(sale) {
  const invoice = sale.invoiceNumber || sale.invoiceNo || sale.id;
  const total = Number(sale.total || 0).toLocaleString("en-BD");
  const payment = String(sale.paymentMethod || "Cash").toUpperCase();
  const itemCount =
    sale.items?.reduce((sum, item) => sum + Number(item.quantity || 0), 0) || 0;

  return `Thank you for shopping with StyleARZ!

Your purchase is confirmed.

Invoice: ${invoice}
Total: BDT ${total}
Payment: ${payment}
Items: ${itemCount}

We appreciate your trust in us. Visit us again!

- Team StyleARZ`;
}

function resolveSenderPhone(fromPhone) {
  const saved = normalizeBdPhone(fromPhone);
  if (saved) return saved;
  const envSender = normalizeBdPhone(
    process.env.SMS_HTTP_SENDER || process.env.SMS_SENDER_PHONE || "",
  );
  return envSender || "";
}

async function sendViaHttp(phone, message, fromPhone) {
  const url = process.env.SMS_HTTP_URL;
  if (!url) throw httpError(503, "SMS_HTTP_URL is not configured.");
  const method = String(process.env.SMS_HTTP_METHOD || "POST").toUpperCase();
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (process.env.SMS_HTTP_TOKEN)
    headers.Authorization = `Bearer ${process.env.SMS_HTTP_TOKEN}`;
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
  const response = await fetch(url, {
    method,
    headers,
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw httpError(
      502,
      `SMS gateway failed (${response.status}). ${text.slice(0, 160)}`.trim(),
    );
  }
  return { provider: "http", from: fromPhone };
}

// async function sendViaTwilio(phone, message, fromPhone) {
//   const sid = process.env.TWILIO_ACCOUNT_SID;
//   const token = process.env.TWILIO_AUTH_TOKEN;
//   const fromEnv = process.env.TWILIO_FROM;
//   if (!sid || !token) throw httpError(503, "Twilio SMS is not configured.");
//   const fromRaw = fromPhone || fromEnv;
//   if (!fromRaw) throw httpError(400, "Save an SMS sender mobile number in Admin → Settings.");
//   const to = phone.startsWith("0") ? `+880${phone.slice(1)}` : phone;
//   const from = String(fromRaw).startsWith("0") ? `+880${String(fromRaw).slice(1)}` : String(fromRaw);
//   const auth = Buffer.from(`${sid}:${token}`).toString("base64");
//   const params = new URLSearchParams({ To: to, From: from, Body: message });
//   const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
//     method: "POST",
//     headers: {
//       Authorization: `Basic ${auth}`,
//       "Content-Type": "application/x-www-form-urlencoded",
//     },
//     body: params,
//   });
//   if (!response.ok) {
//     const text = await response.text().catch(() => "");
//     throw httpError(502, `Twilio SMS failed (${response.status}). ${text.slice(0, 160)}`.trim());
//   }
//   return { provider: "twilio", from };
// }

// /**
//  * Send SMS. `fromPhone` is the shop mobile whose SMS balance / gateway account is used.
//  */
// async function sendSms({ phone, message, fromPhone }) {
//   const normalized = normalizeBdPhone(phone);
//   if (!normalized) throw httpError(400, "Enter a valid Bangladesh mobile number (01XXXXXXXXX).");
//   const text = String(message || "").trim().slice(0, 480);
//   if (!text) throw httpError(400, "SMS message is empty.");

//   const sender = resolveSenderPhone(fromPhone);
//   if (!sender) {
//     throw httpError(400, "Save the SMS sender mobile number in Admin → Settings first. Invoice SMS is billed to that number’s balance.");
//   }

//   const provider = String(process.env.SMS_PROVIDER || "log").toLowerCase();
//   if (provider === "log") {
//     console.log(`[sms:log] from=${sender} to=${normalized} ${text.replace(/\n/g, " | ")}`);
//     return { ok: true, provider: "log", phone: normalized, from: sender };
//   }
//   if (provider === "http") {
//     const result = await sendViaHttp(normalized, text, sender);
//     return { ok: true, phone: normalized, ...result };
//   }
//   if (provider === "twilio") {
//     const result = await sendViaTwilio(normalized, text, sender);
//     return { ok: true, phone: normalized, ...result };
//   }
//   throw httpError(503, "Unknown SMS_PROVIDER. Use log, http, or twilio.");
// }

//// Updated code for sendSms function and sendViaTwilio function
// async function sendViaTwilio(phone, message) {
//   const sid = process.env.TWILIO_ACCOUNT_SID;
//   const token = process.env.TWILIO_AUTH_TOKEN;
//   const from = process.env.TWILIO_FROM;

//   if (!sid || !token || !from) {
//     throw httpError(503, "Twilio SMS is not configured.");
//   }

//   // Bangladesh local number to international format
//   const to = phone.startsWith("0") ? `+880${phone.slice(1)}` : phone;

//   // TWILIO_FROM should already be in E.164 format
//   if (!from.startsWith("+")) {
//     throw httpError(
//       400,
//       "TWILIO_FROM must use international format, e.g. +12345678900.",
//     );
//   }

//   const auth = Buffer.from(`${sid}:${token}`).toString("base64");

//   const params = new URLSearchParams({
//     To: to,
//     From: from,
//     Body: "sms_order_confirmation",
//   });

//   const response = await fetch(
//     `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
//     {
//       method: "POST",
//       headers: {
//         Authorization: `Basic ${auth}`,
//         "Content-Type": "application/x-www-form-urlencoded",
//       },
//       body: params,
//     },
//   );

//   const result = await response.json().catch(() => ({}));

//   if (!response.ok) {
//     throw httpError(
//       502,
//       `Twilio SMS failed (${response.status}): ${
//         result.message || "Unknown error"
//       }`,
//     );
//   }

//   return {
//     provider: "twilio",
//     from,
//     to,
//     sid: result.sid,
//     status: result.status,
//   };
// }

// async function sendViaSendMySMS(phone, message) {
//   const user = process.env.SENDMYSMS_USERNAME;
//   const key = process.env.SENDMYSMS_API_KEY;
//   const url = process.env.SENDMYSMS_API_URL;

//   if (!user || !key || !url) {
//     throw new Error("SendMySMS configuration is missing.");
//   }

//   // Bangladesh number normalize
//   let to = String(phone).replace(/\D/g, "");

//   if (to.startsWith("880")) {
//     to = "0" + to.slice(3);
//   } else if (to.startsWith("88")) {
//     to = "0" + to.slice(2);
//   }

//   if (!/^01[3-9]\d{8}$/.test(to)) {
//     throw new Error("Invalid Bangladesh mobile number.");
//   }

//   if (!message || !String(message).trim()) {
//     throw new Error("SMS message cannot be blank.");
//   }

//   const payload = new URLSearchParams({
//     user,
//     key,
//     to,
//     msg: String(message),
//   });

//   const response = await fetch(url, {
//     method: "POST",
//     headers: {
//       "Content-Type": "application/x-www-form-urlencoded",
//     },
//     body: payload,
//     signal: AbortSignal.timeout(15000),
//   });

//   if (!response.ok) {
//     throw new Error(`SendMySMS HTTP error: ${response.status}`);
//   }

//   const result = await response.json();

//   if (result.status !== "OK") {
//     throw new Error(result.response || "SendMySMS request failed.");
//   }

//   return {
//     success: true,
//     phone: to,
//     message: result.response,
//     provider: "sendmysms",
//   };
// }

async function sendViaBulkSMSBD(phone, message) {
  const apiUrl = process.env.BULKSMSBD_API_URL;
  const apiKey = process.env.BULKSMSBD_API_KEY;
  const senderId = process.env.BULKSMSBD_SENDER_ID;

  if (!apiUrl || !apiKey || !senderId) {
    throw httpError(
      500,
      "BulkSMSBD configuration is incomplete. Check your .env file.",
    );
  }

  const internationalNumber = `88${phone}`;

  const params = new URLSearchParams({
    api_key: apiKey,
    type: "text",
    number: internationalNumber,
    senderid: senderId,
    message,
  });

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  const responseText = (await response.text()).trim();

  if (!response.ok) {
    throw httpError(
      502,
      `BulkSMSBD HTTP error (${response.status}): ${responseText}`,
    );
  }

  let data;

  try {
    data = JSON.parse(responseText);
  } catch {
    if (responseText === "202") {
      return {
        provider: "bulksmsbd",
        status: "submitted",
        responseCode: 202,
      };
    }

    throw httpError(502, `Invalid BulkSMSBD response: ${responseText}`);
  }

  if (Number(data.response_code) !== 202) {
    throw httpError(
      502,
      data.error_message || `BulkSMSBD error: ${responseText}`,
    );
  }

  return {
    provider: "bulksmsbd",
    status: "submitted",
    responseCode: 202,
    messageId: data.message_id,
    message: data.success_message,
  };
}

async function sendSms({ phone, message, fromPhone }) {
  const normalized = normalizeBdPhone(phone);

  if (!normalized) {
    throw httpError(
      400,
      "Enter a valid Bangladesh mobile number (01XXXXXXXXX).",
    );
  }

  const text = String(message || "")
    .trim()
    .slice(0, 480);

  if (!text) {
    throw httpError(400, "SMS message is empty.");
  }

  const provider = String(process.env.SMS_PROVIDER || "log").toLowerCase();

  // Twilio provider
  if (provider === "twilio") {
    const result = await sendViaTwilio(normalized, text);

    return {
      ok: true,
      phone: normalized,
      ...result,
    };
  }

  // SendMySMS provider
  if (provider === "sendmysms") {
    const result = await sendViaSendMySMS(normalized, text);

    return {
      ok: true,
      phone: normalized,
      ...result,
    };
  }

  // BulkSMSBD provider
  if (provider === "bulksmsbd") {
    const result = await sendViaBulkSMSBD(normalized, text);

    return {
      ok: true,
      phone: normalized,
      ...result,
    };
  }

  // Existing log and HTTP provider behavior
  const sender = resolveSenderPhone(fromPhone);

  if (!sender) {
    throw httpError(
      400,
      "Save an SMS sender mobile number in Admin → Settings first.",
    );
  }

  if (provider === "log") {
    console.log(`[sms:log] from=${sender} to=${normalized} ${text}`);

    return {
      ok: true,
      provider: "log",
      phone: normalized,
      from: sender,
    };
  }

  if (provider === "http") {
    const result = await sendViaHttp(normalized, text, sender);

    return {
      ok: true,
      phone: normalized,
      ...result,
    };
  }

  throw httpError(
    503,
    "Unknown SMS_PROVIDER. Use log, http, twilio, sendmysms, or bulksmsbd.",
  );
}

module.exports = {
  normalizeBdPhone,
  smsConfigured,
  formatSaleSms,
  sendSms,
  resolveSenderPhone,
};
