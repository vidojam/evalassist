require("dotenv").config();

const path = require("path");
const express = require("express");
const cors = require("cors");
const { ensureDatabaseReady } = require("./dbBootstrap");
const { createPool } = require("./db");
const promptsSeedData = require("./promptsSeedData");

const app = express();
const port = Number(process.env.PORT || 3001);
let pool;

function parseBooleanEnv(name) {
  return String(process.env[name] || "").toLowerCase() === "true";
}

app.use(cors());
app.use(express.json());

app.get("/api/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, error: "Database connection failed" });
  }
});

app.get("/api/prompts", async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT category_key, sort_order, statement_text
       FROM prompt_statements
       ORDER BY category_key ASC, sort_order ASC, id ASC`
    );

    const grouped = rows.reduce((acc, row) => {
      if (!acc[row.category_key]) acc[row.category_key] = [];
      acc[row.category_key].push(row.statement_text);
      return acc;
    }, {});

    // Keep seeded categories visible in admin even if DB rows were deleted.
    for (const [category, seedStatements] of Object.entries(promptsSeedData)) {
      if (!Array.isArray(grouped[category]) || grouped[category].length === 0) {
        grouped[category] = [...seedStatements];
      }
    }

    res.json(grouped);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch prompts" });
  }
});

app.get("/api/prompts/:category", async (req, res) => {
  const category = String(req.params.category || "").toLowerCase();

  if (!category) {
    return res.status(400).json({ error: "Category is required" });
  }

  try {
    const [rows] = await pool.query(
      `SELECT statement_text
       FROM prompt_statements
       WHERE category_key = ?
       ORDER BY sort_order ASC, id ASC`,
      [category]
    );

    if (!rows.length) {
      const fallbackStatements = promptsSeedData[category];

      if (Array.isArray(fallbackStatements) && fallbackStatements.length > 0) {
        return res.json({
          category,
          statements: [...fallbackStatements],
          source: "seed_fallback"
        });
      }

      return res.status(404).json({
        error: `No prompts found for category '${category}'`
      });
    }

    res.json({
      category,
      statements: rows.map((row) => row.statement_text)
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch prompt category" });
  }
});

app.put("/api/prompts/:category", async (req, res) => {
  const category = String(req.params.category || "").toLowerCase();
  const statements = Array.isArray(req.body?.statements) ? req.body.statements : null;

  if (!category) {
    return res.status(400).json({ error: "Category is required" });
  }

  if (!statements) {
    return res.status(400).json({ error: "statements must be an array" });
  }

  const normalizedStatements = statements
    .map((value) => String(value || "").trim())
    .filter((value) => value.length > 0);

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    await connection.query("DELETE FROM prompt_statements WHERE category_key = ?", [category]);

    if (normalizedStatements.length > 0) {
      const rowsToInsert = normalizedStatements.map((statement, index) => [
        category,
        index + 1,
        statement
      ]);

      await connection.query(
        "INSERT INTO prompt_statements (category_key, sort_order, statement_text) VALUES ?",
        [rowsToInsert]
      );
    }

    await connection.commit();

    res.json({
      category,
      statements: normalizedStatements,
      updatedCount: normalizedStatements.length
    });
  } catch (error) {
    await connection.rollback();
    res.status(500).json({ error: "Failed to update prompt category" });
  } finally {
    connection.release();
  }
});

app.post("/api/prompts/restore", async (_req, res) => {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    await connection.query("DELETE FROM prompt_statements");

    const rowsToInsert = [];

    for (const [category, statements] of Object.entries(promptsSeedData)) {
      statements.forEach((statement, index) => {
        rowsToInsert.push([category, index + 1, statement]);
      });
    }

    if (rowsToInsert.length > 0) {
      await connection.query(
        "INSERT INTO prompt_statements (category_key, sort_order, statement_text) VALUES ?",
        [rowsToInsert]
      );
    }

    await connection.commit();

    res.json({
      restored: true,
      categoryCount: Object.keys(promptsSeedData).length,
      statementCount: rowsToInsert.length
    });
  } catch (error) {
    await connection.rollback();
    res.status(500).json({ error: "Failed to restore prompt categories" });
  } finally {
    connection.release();
  }
});

const distDir = path.resolve(__dirname, "..", "dist");

app.use(express.static(distDir));

app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) {
    return next();
  }

  return res.sendFile(path.join(distDir, "index.html"));
});

async function startServer() {
  const autoInit = parseBooleanEnv("DB_AUTO_INIT_ON_START");
  const autoSeedEmpty = parseBooleanEnv("DB_AUTO_SEED_IF_EMPTY");

  if (autoInit) {
    const result = await ensureDatabaseReady({ seedIfEmpty: autoSeedEmpty });
    console.log(
      `DB bootstrap complete (seeded=${result.seeded}, reason=${result.reason})`
    );
  }

  pool = createPool();

  app.listen(port, () => {
    console.log(`EvalAssist running on http://localhost:${port}`);
  });
}

startServer().catch((error) => {
  console.error("Startup failed:", error.message);
  process.exit(1);
});
