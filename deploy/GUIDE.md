# StyleARZ — complete guide (local + cPanel + Git)

Private repo: https://github.com/Thingkers/styleARZ  
Live site: https://stylearz.com  
cPanel: https://stylearz.com:2083/

---

## 1. Accounts & access

| What | Value |
|------|--------|
| GitHub org / repo | `Thingkers/styleARZ` (private) |
| GitHub login for this project | Thingkers org members (e.g. `Thingkers-Intelligence`) |
| cPanel URL | https://stylearz.com:2083/ |
| cPanel username | `stylvrey` |
| cPanel password | **vault only** — never commit |
| SSH host | `premium115.web-hosting.com` |
| SSH port | `21098` (not 22) |
| SSH user | `stylvrey` |
| App directory on server | `/home/stylvrey/stylearz` |
| Startup file | `app.js` |
| Node version | 18+ (CloudLinux “Setup Node.js App”) |

**Secrets stay out of git.** Each developer keeps a local:

- `.env` (from `.env.example`)
- `credentials.json` (from `credentials.example.json`)
- SSH private key (e.g. `~/.ssh/stylearz_deploy`) — or their own key authorized in cPanel

---

## 2. Clone & continue work

```bash
git clone https://github.com/Thingkers/styleARZ.git
cd styleARZ
npm install

cp .env.example .env
# edit .env — set a local JWT_SECRET

cp credentials.example.json credentials.json
# fill cPanel password, SSH key path, production JWT_SECRET (for deploy only)
```

Optional — commits as Thingkers on this machine only:

```bash
git config --local user.name "Thingkers Intelligence"
git config --local user.email "thingkersai@gmail.com"
```

Daily loop:

```bash
git pull origin main
npm run dev
# …edit…
git add -A && git commit -m "Describe why" && git push origin main
```

---

## 3. Local development

Requires **Node 18+**.

```bash
cd styleARZ
npm install
npm run dev
```

| Process | URL |
|---------|-----|
| Storefront (Vite) | http://127.0.0.1:5173 |
| API (Express) | http://127.0.0.1:4000 |

Vite proxies `/api` → port 4000.

### Demo logins (seed data)

Created on first boot when `server/data/db.json` is missing:

| Role | Email | Password |
|------|--------|----------|
| Customer | `farhan@stylearz.com` | `style123` |
| Admin | `admin@stylearz.com` | `style123` |

Reset seed DB:

```bash
npm run seed:reset
```

Change these passwords after go-live.

Stop servers: `Ctrl+C` in the terminal running `npm run dev`.

---

## 4. cPanel login & one-time hosting setup

### 4.1 Log in

1. Open **https://stylearz.com:2083/**
2. User: `stylvrey`
3. Password: from your team vault

(Alternate host URL if the domain SSL for :2083 fails: `https://premium115.web-hosting.com:2083`)

### 4.2 Enable SSH (once per machine / teammate)

1. Search **SSH Access** → **Manage SSH Keys**
2. **Generate** a new key, or **Import** your public key
3. **Authorize** the public key
4. On your Mac, keep the matching private key (e.g. `~/.ssh/stylearz_deploy`)
5. Test:

```bash
ssh -p 21098 -i ~/.ssh/stylearz_deploy stylvrey@premium115.web-hosting.com
```

Exit with `exit` when connected.

### 4.3 SSL for the website

1. cPanel → **SSL/TLS Status** (or **Let's Encrypt**)
2. Issue a free certificate for `stylearz.com` (+ `www` if used)
3. Force HTTPS when the cert is active

### 4.4 Create the Node.js application (once)

1. cPanel → **Setup Node.js App** → **Create Application**
2. Set:

| Field | Value |
|-------|--------|
| Node.js version | 18.x (or 20.x) |
| Application mode | Production |
| Application root | `stylearz` → resolves to `/home/stylvrey/stylearz` |
| Application URL | `stylearz.com` (path empty) |
| Application startup file | `app.js` |

3. Environment variables:

| Name | Value |
|------|--------|
| `NODE_ENV` | `production` |
| `JWT_SECRET` | long random string (same as in your private `credentials.json`) |
| `PORT` | usually set automatically by the selector |

4. Important CloudLinux rule: the app root must **not** contain a real `node_modules` folder. The selector creates a **symlink** named `node_modules` into a virtual env. Use **Run NPM Install** in the cPanel UI — do **not** run `npm install` in the app root over SSH after the app exists.
5. **Create** → **Run NPM Install** → **Start** / **Restart**

---

## 5. Deploy updates (after code changes)

From your laptop (preferred):

```bash
cd styleARZ
# credentials.json must exist and point at SSH key + remoteAppDir
bash scripts/deploy-ssh.sh
```

What the script does:

1. `npm run build` → writes static files to `server/public/`
2. `rsync` to `/home/stylvrey/stylearz` (skips `.env`, `credentials.json`, `node_modules`, local DB)
3. Protects CloudLinux’s `node_modules` symlink

Then in cPanel → **Setup Node.js App**:

1. **Run NPM Install** — only if `package.json` / lockfile changed
2. **Restart** the application

Open https://stylearz.com and verify.

### Manual upload (if SSH is unavailable)

1. Locally: `npm run build`
2. Upload via File Manager or FTP into `/home/stylvrey/stylearz`:
   - `app.js`, `package.json`, `package-lock.json`
   - `server/` (including `server/public/` after build)
3. Do **not** upload: `node_modules`, `.env`, `credentials.json`, `client/src` (optional), `styleArz-server.pdf`
4. Create/edit server `.env` in File Manager if needed
5. **Run NPM Install** + **Restart** in Setup Node.js App

---

## 6. `credentials.json` (local only)

```bash
cp credentials.example.json credentials.json
```

Fill at least:

```json
{
  "cpanel": {
    "url": "https://stylearz.com:2083/",
    "username": "stylvrey",
    "password": "YOUR_CPANEL_PASSWORD"
  },
  "ssh": {
    "host": "premium115.web-hosting.com",
    "port": 21098,
    "username": "stylvrey",
    "privateKeyPath": "~/.ssh/stylearz_deploy"
  },
  "app": {
    "remoteAppDir": "/home/stylvrey/stylearz",
    "startupFile": "app.js",
    "jwtSecret": "PRODUCTION_SECRET_NOT_THE_LOCAL_ONE"
  }
}
```

This file is gitignored. Share passwords via a password manager, not the repo.

---

## 7. Invite teammates on GitHub

Repo → **Settings** → **Collaborators and teams** → add GitHub usernames with **Write**.

Or:

```bash
gh api -X PUT repos/Thingkers/styleARZ/collaborators/GITHUB_USERNAME -f permission=push
```

Send them this file (`deploy/GUIDE.md`) plus vault access for cPanel/SSH.

---

## 8. Checklist

**First-time machine**

- [ ] GitHub access to `Thingkers/styleARZ`
- [ ] `git clone` + `npm install` + `.env`
- [ ] `npm run dev` works on :5173
- [ ] cPanel login at https://stylearz.com:2083/
- [ ] SSH key authorized; `ssh -p 21098 …` works
- [ ] Local `credentials.json` filled

**First-time server**

- [ ] Node app created (`stylearz` / `app.js`)
- [ ] Env: `NODE_ENV`, `JWT_SECRET`
- [ ] Run NPM Install + Start
- [ ] SSL issued for stylearz.com
- [ ] Demo passwords changed for production

**Every release**

- [ ] `git push`
- [ ] `bash scripts/deploy-ssh.sh`
- [ ] cPanel Restart (NPM Install if deps changed)
- [ ] Smoke-test https://stylearz.com

---

## 9. Troubleshooting

| Symptom | Fix |
|---------|-----|
| cPanel :2083 won’t load | Try `https://premium115.web-hosting.com:2083` or confirm SSL; use HTTP only if hosting allows |
| SSH “Permission denied” | Authorize public key in cPanel SSH Access; use port **21098** and `-i` private key |
| CloudLinux error about `node_modules` | Delete real `node_modules` folder in app root; let selector create the symlink; use UI **Run NPM Install** |
| Site up but API 404 / blank | Confirm Application root is `stylearz`, startup `app.js`, app **Running**, and `server/public/` was built |
| SSL warning in browser | Issue cert in SSL/TLS Status; wait for propagation; force HTTPS |
| Wrong GitHub user when pushing | `gh auth switch` → choose Thingkers account; confirm `git remote -v` is `Thingkers/styleARZ` |
