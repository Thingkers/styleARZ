const fs = require("fs");
const path = require("path");
const { resetWithSeed } = require("../store");
const { closePool } = require("./pool");

function loadEnv() {
  const envPath = path.join(__dirname, "..", "..", "..", ".env");
  if (!fs.existsSync(envPath)) return;
  fs.readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return;
      const eq = trimmed.indexOf("=");
      if (eq < 1) return;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    });
}

async function main() {
  loadEnv();
  // Ensure schema exists, then wipe via full seed rewrite.
  const { migrate } = require("./migrate");
  await migrate();
  await resetWithSeed();
  console.log("MySQL database reset and re-seeded.");
  await closePool();
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
