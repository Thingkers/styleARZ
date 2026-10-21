# StyleARZ

Fashion storefront for [stylearz.com](https://stylearz.com) — **React** frontend + **Node/Express** API.

| | |
|--|--|
| **Repo** | https://github.com/Thingkers/styleARZ |
| **Live** | https://stylearz.com |
| **Stack** | React 18, Vite, Express, Node 18+ |
| **Org** | [Thingkers](https://github.com/Thingkers) |

---

## Quick start (every teammate)

```bash
git clone https://github.com/Thingkers/styleARZ.git
cd styleARZ
npm install
cp .env.example .env
npm run dev
```

Open **http://127.0.0.1:5173**

| Service | URL |
|---------|-----|
| Storefront | http://127.0.0.1:5173 |
| API | http://127.0.0.1:4000 |

### Demo logins (local seed)

| Role | Email | Password |
|------|--------|----------|
| Customer | `farhan@stylearz.com` | `style123` |
| Admin | `admin@stylearz.com` | `style123` |

Reset local database:

```bash
npm run seed:reset
```

---

## Useful scripts

| Command | What it does |
|---------|----------------|
| `npm run dev` | API + Vite together |
| `npm run build` | Production build → `server/public/` |
| `npm start` | Run production server (`app.js`) |
| `npm run seed:reset` | Recreate seed `db.json` |
| `bash scripts/deploy-ssh.sh` | Build + rsync to hosting |

---

## Project layout

```
styleARZ/
├── client/          # React (Vite) storefront + POS (/pos)
├── server/          # Express API + seeded data
│   ├── public/      # Built frontend (after npm run build)
│   └── uploads/     # Retail inventory images (not in git)
├── app.js           # Production entry (cPanel startup file)
├── scripts/         # deploy-ssh.sh
├── deploy/          # Hosting & team guides
│   ├── GUIDE.md     # Full local + cPanel + deploy + POS guide
│   └── cpanel-notes.txt
├── credentials.example.json
└── .env.example
```

Admin POS entry points: `/admin/inventory`, `/admin/barcodes`, `/pos`, `/pos/scan` (admin login required).

---

## Deploy & hosting

**Full guide for the team:** [deploy/GUIDE.md](deploy/GUIDE.md)

Short version:

1. Ask a lead for **cPanel / SSH credentials** (password manager — never commit them).
2. Copy `credentials.example.json` → `credentials.json` and fill it in.
3. Authorize your SSH public key in cPanel → **SSH Access**.
4. Deploy:

```bash
bash scripts/deploy-ssh.sh
```

5. In cPanel → **Setup Node.js App** → **Restart** (and **Run NPM Install** if `package.json` changed).

| Hosting | |
|---------|--|
| cPanel | https://stylearz.com:2083/ |
| SSH | `premium115.web-hosting.com` port `21098` |
| App root | `/home/stylvrey/stylearz` |
| Startup | `app.js` |

---

## Secrets — do not commit

| File | Commit? |
|------|---------|
| `.env` | No |
| `credentials.json` | No |
| SSH private keys | No |
| `styleArz-server.pdf` | No |
| `.env.example` / `credentials.example.json` | Yes (empty placeholders) |

---

## Git workflow

```bash
git pull origin main
# …work…
git add -A
git commit -m "Short description of why"
git push origin main
```

Branch from `main` for larger features if the team prefers PRs.

If you use multiple GitHub accounts on one machine:

```bash
gh auth switch          # pick Thingkers account
git remote -v           # should be Thingkers/styleARZ
```

---

## Need help?

1. Read [deploy/GUIDE.md](deploy/GUIDE.md) (local run, cPanel, SSL, troubleshooting).
2. Ask the project lead for vault access (cPanel password + deploy key).
