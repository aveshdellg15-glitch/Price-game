'use strict';

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const initSqlJs = require('sql.js').default;

let SQL = null;
const sqlReady = initSqlJs({
  locateFile: f => path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', f)
}).then(m => {
  SQL = m;
});

const COUNTRY_CODE_RE = /^[A-Z]{2}$/;
const INT_RE = /^\d+$/;

/** Map a users table row (value array) to a plain object. */
function mapUser(row) {
  return {
    id: row[0],
    username: row[1],
    password_hash: row[2],
    points: row[3],
    games: row[4],
    wins: row[5],
    country: row[6],
    tier: row[7],
    created_at: row[8]
  };
}

class DatabaseStore {
  constructor(dbPath) {
    this.dbPath = dbPath;
    this.db = null;
    this.dirty = false;
  }

  async init() {
    if (!SQL) await sqlReady;
    const dir = path.dirname(this.dbPath);
    fs.mkdirSync(dir, { recursive: true });

    let bytes = null;
    try { bytes = fs.readFileSync(this.dbPath); } catch (e) { /* fresh database */ }

    this.db = new SQL.Database(bytes);
    this.db.run('PRAGMA journal_mode = WAL;');

    this.db.run(`CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT,
      points INTEGER NOT NULL DEFAULT 0,
      games INTEGER NOT NULL DEFAULT 0,
      wins INTEGER NOT NULL DEFAULT 0,
      country TEXT NOT NULL DEFAULT 'US',
      tier TEXT NOT NULL DEFAULT 'Penny Pincher',
      created_at INTEGER NOT NULL
    )`);

    this.db.run(`CREATE TABLE IF NOT EXISTS matches (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL,
      mode TEXT NOT NULL,
      country TEXT NOT NULL,
      rounds INTEGER NOT NULL,
      winner_ids TEXT NOT NULL DEFAULT '[]',
      scores TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL
    )`);

    this.db.run(`CREATE INDEX IF NOT EXISTS idx_users_points ON users(points DESC);`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_matches_code ON matches(code);`);

    this.dirty = true;
    this.save();
    setInterval(() => this.save(), 5000);
  }

  save() {
    if (!this.dirty || !this.db) return;
    try {
      const buf = Buffer.from(this.db.export());
      fs.writeFileSync(this.dbPath, buf);
      this.dirty = false;
    } catch (e) {
      console.error('[db] save failed:', e.message);
    }
  }

  run(sql, params = []) {
    this.dirty = true;
    return this.db.run(sql, params);
  }

  prepare(sql) {
    return this.db.prepare(sql);
  }

  /** Single-row read. Returns [] when no row found. */
  getRow(sql, params = []) {
    const stmt = this.prepare(sql);
    const row = stmt.get(params);
    stmt.free();
    return row;
  }

  /** Multi-row read via exec (params must be pre-sanitized literals). */
  getAll(sql) {
    const res = this.db.exec(sql);
    if (!res || !res.length) return [];
    const cols = res[0].columns;
    return res[0].values.map(v => Object.fromEntries(cols.map((c, i) => [c, v[i]])));
  }

  /** Create or fetch a user by username. */
  getOrCreateUser(username) {
    const row = this.getRow('SELECT * FROM users WHERE username = ?', [username]);
    if (!row.length) {
      const id = uuidv4();
      const now = Date.now();
      const hash = bcrypt.hashSync('', 0); // no password by default
      this.run(
        'INSERT INTO users (id, username, password_hash, points, games, wins, country, tier, created_at) VALUES (?, ?, ?, 0, 0, 0, ?, ?, ?)',
        [id, username, hash, 'US', 'Penny Pincher', now]
      );
      return { id, username, points: 0, games: 0, wins: 0, country: 'US', tier: 'Penny Pincher', created_at: now };
    }
    return mapUser(row);
  }

  getUser(id) {
    const row = this.getRow('SELECT * FROM users WHERE id = ?', [id]);
    return row.length ? mapUser(row) : null;
  }

  getUserByUsername(username) {
    const row = this.getRow('SELECT * FROM users WHERE username = ?', [username]);
    return row.length ? mapUser(row) : null;
  }

  /** Award points after a match. won = boolean. */
  updateUser(id, pointsEarned, won) {
    this.run(
      'UPDATE users SET points = points + ?, games = games + 1, wins = wins + ? WHERE id = ?',
      [Math.max(0, Math.floor(pointsEarned)), won ? 1 : 0, id]
    );
  }

  getLeaderboard(limit = 50, country) {
    limit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
    let sql = 'SELECT username, points, games, wins, country FROM users';
    if (country && COUNTRY_CODE_RE.test(country)) {
      sql += ` WHERE country = '${country}'`;
    }
    sql += ` ORDER BY points DESC LIMIT ${limit}`;
    return this.getAll(sql);
  }

  recordMatch(code, mode, country, rounds, winnerIds, scores) {
    const id = uuidv4();
    this.run(
      'INSERT INTO matches (id, code, mode, country, rounds, winner_ids, scores, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [id, code, mode, country, rounds, JSON.stringify(winnerIds), JSON.stringify(scores), Date.now()]
    );
  }

  getMatchHistory(limit = 20) {
    limit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
    return this.getAll(`SELECT code, mode, country, rounds, winner_ids, scores, created_at FROM matches ORDER BY created_at DESC LIMIT ${limit}`);
  }
}

module.exports = DatabaseStore;
