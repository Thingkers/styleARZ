# StyleARZ SMS setup

StyleARZ already sends **invoice SMS** from POS and now supports **bulk SMS** from **Admin → Messages**.

## What you do (checklist)

1. Pick an SMS provider that can send to Bangladesh numbers (`01XXXXXXXXX`).
2. Put the provider credentials in the **server environment** (cPanel → Setup Node.js App → Environment variables), **not** in git.
3. In **Admin → Settings**, save the **SMS sender mobile** (the number whose SMS balance is used).
4. Restart the Node app.
5. Test one invoice SMS from POS, then a small bulk send from **Admin → Messages** (manual list of 1–2 phones first).

## Environment variables

### Option A — log only (safe default / testing)

```bash
SMS_PROVIDER=log
```

Messages are printed in the server log. No real SMS is sent. Use this until the gateway is ready.

### Option B — HTTP SMS gateway (common for BD aggregators)

```bash
SMS_PROVIDER=http
SMS_HTTP_URL=https://YOUR-GATEWAY/api/send
SMS_HTTP_METHOD=POST
SMS_HTTP_TOKEN=your_api_token_if_needed
SMS_HTTP_SENDER=01XXXXXXXXX
```

The app POSTs JSON roughly like:

```json
{
  "to": "017xxxxxxxx",
  "phone": "017xxxxxxxx",
  "message": "...",
  "text": "...",
  "from": "01XXXXXXXXX",
  "sender": "01XXXXXXXXX"
}
```

If your provider uses different field names, tell Thingkers the API docs and we map them.

### Option C — Twilio

```bash
SMS_PROVIDER=twilio
TWILIO_ACCOUNT_SID=ACxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxx
TWILIO_FROM=+8801XXXXXXXXX
```

Also save the same sender in **Admin → Settings**.

## Admin UI

| Screen | Purpose |
| --- | --- |
| **Admin → Settings** | Save SMS sender mobile |
| **Admin → Messages** | Preview + send bulk SMS to inauguration guests, POS phones, or a manual list |
| **POS invoice** | Send one receipt SMS to a customer |

## Audiences for bulk SMS

- **Inauguration guests** — phones that claimed a Grand Opening slot  
- **POS customers** — unique phones from completed POS sales  
- **Manual list** — paste numbers for a one-off festive blast  

## Notes

- Bulk send is sequential (one-by-one) to avoid flooding the gateway.
- Keep festive copy under ~480 characters.
- Real SMS costs money — always **Preview** first, then send a manual test list before blasting everyone.
