process.env.NODE_ENV = process.env.NODE_ENV || "production";
const { start } = require("./server/src/index.js");

start().catch((error) => {
  console.error("Failed to start StyleARZ:", error);
  process.exit(1);
});
