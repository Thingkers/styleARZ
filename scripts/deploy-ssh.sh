#!/usr/bin/env bash
# Deploy StyleARZ over SSH/rsync using credentials.json
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CREDS="$ROOT/credentials.json"

if [[ ! -f "$CREDS" ]]; then
  echo "Missing credentials.json — copy from credentials.example.json and fill it in."
  exit 1
fi

HOST="$(node -e "console.log(require('$CREDS').ssh.host)")"
PORT="$(node -e "console.log(require('$CREDS').ssh.port || 21098)")"
USER="$(node -e "console.log(require('$CREDS').ssh.username)")"
KEY="$(node -e "const p=require('$CREDS').ssh.privateKeyPath||''; console.log(p.replace(/^~/, require('os').homedir()))")"
REMOTE="$(node -e "console.log(require('$CREDS').app.remoteAppDir || '/home/'+require('$CREDS').ssh.username+'/stylearz')")"

if [[ -z "$HOST" || -z "$USER" ]]; then
  echo "ssh.host and ssh.username must be set in credentials.json"
  exit 1
fi

SSH_OPTS=(-p "$PORT" -o StrictHostKeyChecking=accept-new)
if [[ -n "$KEY" && -f "$KEY" ]]; then
  SSH_OPTS+=(-i "$KEY")
fi

echo "==> Building production assets"
cd "$ROOT"
npm run build

echo "==> Ensuring remote directory $REMOTE"
ssh "${SSH_OPTS[@]}" "$USER@$HOST" "mkdir -p '$REMOTE'"

echo "==> Syncing app (excluding local secrets / node_modules / git)"
# --delete would remove CloudLinux's node_modules symlink; keep filter protects it.
rsync -az --delete \
  --filter 'P node_modules' --filter 'P node_modules/**' \
  --filter 'P server/uploads' --filter 'P server/uploads/**' \
  --filter 'P server/data' --filter 'P server/data/**' \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude '.env' \
  --exclude 'credentials.json' \
  --exclude 'server/data/db.json' \
  --exclude 'server/uploads' \
  --exclude '.DS_Store' \
  --exclude '.shots' \
  --exclude 'tmp' \
  --exclude 'stderr.log' \
  -e "ssh ${SSH_OPTS[*]}" \
  "$ROOT/" "$USER@$HOST:$REMOTE/"

# CloudLinux NodeJS Selector owns node_modules as a symlink into a venv.
# Never npm-install into the app root from SSH after the app exists; use cPanel "Run NPM Install".
echo "==> Ensuring app root has no real node_modules folder (CloudLinux requirement)"
ssh "${SSH_OPTS[@]}" "$USER@$HOST" "cd '$REMOTE' && mkdir -p server/uploads/inventory server/data && if [ -d node_modules ] && [ ! -L node_modules ]; then rm -rf node_modules; echo removed_real_node_modules; elif [ -L node_modules ]; then echo symlink_ok; else echo no_node_modules; fi"

echo "Done. Files are at $REMOTE"
echo "In cPanel → Setup Node.js App (create if needed):"
echo "  Node.js version:  18.x"
echo "  Application root: stylearz   (must NOT contain a real node_modules dir)"
echo "  Application URL:  stylearz.com (path empty)"
echo "  Startup file:     app.js"
echo "  Env: NODE_ENV=production  JWT_SECRET=(from credentials.json)"
echo "Then: Create → Run NPM Install → Restart → https://stylearz.com"
