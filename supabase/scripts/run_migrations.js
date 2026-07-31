const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Client } = require('pg');
require('dotenv').config({ path: '../../.env' });

function sha256(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function getMigrationFiles() {
  const migrationDir = path.join(__dirname, '../migrations');
  return fs
    .readdirSync(migrationDir)
    .filter((name) => /^\d+.*\.sql$/i.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

async function runMigrations() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("DATABASE_URL must be set in .env");
    process.exit(1);
  }

  const client = new Client({
    connectionString: dbUrl,
    ssl: dbUrl.includes('supabase') || dbUrl.includes('sslmode=require') ? { rejectUnauthorized: false } : false,
  });

  try {
    await client.connect();
    console.log("Connected to database.");

    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        filename TEXT UNIQUE NOT NULL,
        checksum TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    const files = getMigrationFiles();
    if (files.length === 0) {
      console.log('No SQL migration files found.');
      return;
    }

    for (const file of files) {
      const filePath = path.join(__dirname, '../migrations', file);
      const sql = fs.readFileSync(filePath, 'utf8');
      const checksum = sha256(sql);

      const existing = await client.query(
        'SELECT filename, checksum FROM schema_migrations WHERE filename = $1 LIMIT 1',
        [file]
      );

      if (existing.rows.length > 0) {
        const applied = existing.rows[0];
        if (applied.checksum !== checksum) {
          throw new Error(
            `Checksum mismatch for ${file}. Applied checksum ${applied.checksum} does not match current ${checksum}.`
          );
        }
        console.log(`Skipping ${file} (already applied).`);
        continue;
      }

      console.log(`Applying ${file}...`);
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)',
          [file, checksum]
        );
        await client.query('COMMIT');
        console.log(`Successfully applied ${file}`);
      } catch (migrationErr) {
        await client.query('ROLLBACK');
        throw migrationErr;
      }
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
