const fs = require('fs');
const { Client } = require('pg');
require('dotenv').config({ path: '../../.env' });

async function runMigrations() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("DATABASE_URL must be set in .env");
    process.exit(1);
  }

  const client = new Client({
    connectionString: dbUrl,
  });

  try {
    await client.connect();
    console.log("Connected to database.");

    const files = [
      '001_initial_schema.sql',
      '002_auth_schema.sql'
    ];

    for (const file of files) {
      const sql = fs.readFileSync(file, 'utf8');
      console.log(`Applying ${file}...`);
      await client.query(sql);
      console.log(`Successfully applied ${file}`);
    }

    console.log("All migrations applied successfully!");
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigrations();
