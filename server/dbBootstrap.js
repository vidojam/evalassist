const mysql = require("mysql2/promise");
const promptsSeedData = require("./promptsSeedData");

function getDbConfig() {
  return {
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "evalassist"
  };
}

async function seedStatements(connection) {
  const insertSql = `
    INSERT INTO prompt_statements (category_key, sort_order, statement_text)
    VALUES (?, ?, ?)
  `;

  for (const [category, statements] of Object.entries(promptsSeedData)) {
    for (let i = 0; i < statements.length; i += 1) {
      await connection.query(insertSql, [category, i + 1, statements[i]]);
    }
  }
}

async function ensureDatabaseReady(options = {}) {
  const { seedIfEmpty = false, forceReseed = false } = options;
  const { host, port, user, password, database } = getDbConfig();

  const connection = await mysql.createConnection({ host, port, user, password });

  try {
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${database}\``);
    await connection.query(`USE \`${database}\``);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS prompt_statements (
        id INT AUTO_INCREMENT PRIMARY KEY,
        category_key VARCHAR(64) NOT NULL,
        sort_order INT NOT NULL,
        statement_text TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_category_sort (category_key, sort_order)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    const [countRows] = await connection.query("SELECT COUNT(*) AS total FROM prompt_statements");
    const currentCount = Number(countRows?.[0]?.total || 0);

    if (forceReseed) {
      await connection.query("DELETE FROM prompt_statements");
      await seedStatements(connection);
      return { seeded: true, reason: "force_reseed" };
    }

    if (seedIfEmpty && currentCount === 0) {
      await seedStatements(connection);
      return { seeded: true, reason: "empty_table" };
    }

    return { seeded: false, reason: currentCount > 0 ? "table_has_data" : "seed_disabled" };
  } finally {
    await connection.end();
  }
}

module.exports = { ensureDatabaseReady };