require("dotenv").config();

const mysql = require("mysql2/promise");
const promptsSeedData = require("./promptsSeedData");

async function seed() {
  const host = process.env.DB_HOST || "localhost";
  const port = Number(process.env.DB_PORT || 3306);
  const user = process.env.DB_USER || "root";
  const password = process.env.DB_PASSWORD || "";
  const dbName = process.env.DB_NAME || "evalassist";

  const connection = await mysql.createConnection({ host, port, user, password });

  try {
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
    await connection.query(`USE \`${dbName}\``);

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

    await connection.query("DELETE FROM prompt_statements");

    const insertSql = `
      INSERT INTO prompt_statements (category_key, sort_order, statement_text)
      VALUES (?, ?, ?)
    `;

    for (const [category, statements] of Object.entries(promptsSeedData)) {
      for (let i = 0; i < statements.length; i += 1) {
        await connection.query(insertSql, [category, i + 1, statements[i]]);
      }
    }

    console.log("Database seeded successfully.");
  } finally {
    await connection.end();
  }
}

seed().catch((error) => {
  console.error("Seeding failed:", error.message);
  process.exit(1);
});
