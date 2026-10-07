import pg from "pg";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("localhost")
    ? false
    : { rejectUnauthorized: false }
});

export async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS admins (
      user_id BIGINT PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS sessions (
      user_id BIGINT PRIMARY KEY,
      step INT NOT NULL DEFAULT 0,
      data JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  const ownerId = process.env.OWNER_ID;
  if (ownerId) {
    await pool.query(
      `INSERT INTO admins(user_id) VALUES($1) ON CONFLICT DO NOTHING`,
      [ownerId]
    );
  }
}

export async function isAdmin(userId) {
  const { rows } = await pool.query(
    `SELECT 1 FROM admins WHERE user_id=$1`,
    [String(userId)]
  );
  return rows.length > 0;
}

export async function listAdmins() {
  const { rows } = await pool.query(
    `SELECT user_id::text AS user_id, created_at FROM admins ORDER BY created_at`
  );
  return rows;
}

export async function addAdmin(userId) {
  await pool.query(
    `INSERT INTO admins(user_id) VALUES($1) ON CONFLICT DO NOTHING`,
    [String(userId)]
  );
}

export async function removeAdmin(userId) {
  if (String(userId) === String(process.env.OWNER_ID)) return false;
  const result = await pool.query(`DELETE FROM admins WHERE user_id=$1`, [String(userId)]);
  return result.rowCount > 0;
}

export async function getSetting(key, fallback = null) {
  const { rows } = await pool.query(`SELECT value FROM settings WHERE key=$1`, [key]);
  return rows.length ? rows[0].value : fallback;
}

export async function setSetting(key, value) {
  await pool.query(`
    INSERT INTO settings(key,value,updated_at)
    VALUES($1,$2,NOW())
    ON CONFLICT(key)
    DO UPDATE SET value=EXCLUDED.value, updated_at=NOW()
  `, [key, JSON.stringify(value)]);
}

export async function getSession(userId) {
  const { rows } = await pool.query(
    `SELECT step, data FROM sessions WHERE user_id=$1`,
    [String(userId)]
  );
  if (!rows.length) return null;
  return { step: rows[0].step, data: rows[0].data };
}

export async function setSession(userId, step, data) {
  await pool.query(`
    INSERT INTO sessions(user_id,step,data,updated_at)
    VALUES($1,$2,$3,NOW())
    ON CONFLICT(user_id)
    DO UPDATE SET step=EXCLUDED.step,data=EXCLUDED.data,updated_at=NOW()
  `, [String(userId), step, JSON.stringify(data)]);
}

export async function clearSession(userId) {
  await pool.query(`DELETE FROM sessions WHERE user_id=$1`, [String(userId)]);
}
