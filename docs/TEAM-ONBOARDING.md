# StyleARZ — teammate onboarding

Send this page (or the repo README) to anyone joining the project.

---

## 1. Get the code

```bash
git clone https://github.com/Thingkers/styleARZ.git
cd styleARZ
npm install
cp .env.example .env
npm run dev
```

Browser: **http://127.0.0.1:5173**

Requires **Node.js 18+** (`node -v`).

---

## 2. Try the app

| | |
|--|--|
| Customer | `farhan@stylearz.com` / `style123` |
| Admin | `admin@stylearz.com` / `style123` |

Live reference site: https://stylearz.com  

---

## 3. Day-to-day

```bash
git pull origin main
npm run dev
# edit files under client/ or server/
git add -A && git commit -m "Why you changed it" && git push
```

---

## 4. Deploy (only if you have hosting access)

Ask the lead for **vault** items (not in git):

- cPanel password for https://stylearz.com:2083/
- SSH private key (or add your own public key in cPanel)

Then:

```bash
cp credentials.example.json credentials.json
# fill passwords + privateKeyPath from the vault

bash scripts/deploy-ssh.sh
```

In cPanel → **Setup Node.js App** → **Restart**.

Full steps: [deploy/GUIDE.md](../deploy/GUIDE.md)

---

## 5. Rules

- Never commit `.env`, `credentials.json`, or SSH keys.
- Don’t run `npm install` inside the live app folder over SSH (CloudLinux owns `node_modules`).
- Change demo passwords before treating production as final.

---

## Links

| Resource | URL |
|----------|-----|
| GitHub | https://github.com/Thingkers/styleARZ |
| Live site | https://stylearz.com |
| cPanel | https://stylearz.com:2083/ |
| Full guide | [deploy/GUIDE.md](../deploy/GUIDE.md) |
| README | [README.md](../README.md) |
