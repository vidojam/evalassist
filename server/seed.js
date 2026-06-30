require("dotenv").config();

const { ensureDatabaseReady } = require("./dbBootstrap");

async function seed() {
  await ensureDatabaseReady({ forceReseed: true });
  console.log("Database seeded successfully.");
}

seed().catch((error) => {
  console.error("Seeding failed:", error.message);
  process.exit(1);
});
