const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();

const allowedOrigins = process.env.FRONTEND_URL
  ? process.env.FRONTEND_URL.split(',').map(o => o.trim())
  : [];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.length === 0) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS blocked: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.options('*', cors());
app.use(express.json());

// ── Database (Neon / any Postgres) ──────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // Required for Neon
});

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';

/* ══════════════════════════════════════════
   AUTH MIDDLEWARE
══════════════════════════════════════════ */
async function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token provided' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    // Verify user still exists in DB
    const { rows } = await pool.query('SELECT id, email, name FROM users WHERE id = $1', [decoded.userId]);
    if (!rows[0]) return res.status(401).json({ error: 'User not found' });
    req.user = rows[0];
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/* ══════════════════════════════════════════
   AUTH ROUTES
══════════════════════════════════════════ */
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Check if email already exists
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const password_hash = await bcrypt.hash(password, 12);
    const { rows } = await pool.query(
      'INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id, email, name, created_at',
      [email.toLowerCase(), password_hash, name || null]
    );
    const user = rows[0];

    const access_token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });

    // Return same shape as Supabase so frontend works unchanged
    res.json({
      user: { id: user.id, email: user.email, user_metadata: { name: user.name } },
      session: { access_token }
    });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Signup failed: ' + err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const { rows } = await pool.query(
      'SELECT id, email, name, password_hash FROM users WHERE email = $1',
      [email.toLowerCase()]
    );
    const user = rows[0];

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    const access_token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });

    // Return same shape as Supabase so frontend works unchanged
    res.json({
      user: { id: user.id, email: user.email, user_metadata: { name: user.name } },
      session: { access_token }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed: ' + err.message });
  }
});

app.post('/api/auth/logout', requireAuth, (req, res) => {
  // JWT is stateless — client just discards the token.
  // For token invalidation at scale, use a Redis blocklist. For personal apps, this is fine.
  res.json({ success: true });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

/* ══════════════════════════════════════════
   TRANSACTIONS
══════════════════════════════════════════ */
app.get('/api/transactions', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM transactions WHERE user_id = $1 ORDER BY date DESC',
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/transactions', requireAuth, async (req, res) => {
  try {
    const { type, amount, category, date, description, notes } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO transactions (user_id, type, amount, category, date, description, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.user.id, type, amount, category, date, description, notes]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/transactions/:id', requireAuth, async (req, res) => {
  try {
    const { type, amount, category, date, description, notes } = req.body;
    const { rows } = await pool.query(
      `UPDATE transactions SET type=$1, amount=$2, category=$3, date=$4, description=$5, notes=$6
       WHERE id=$7 AND user_id=$8 RETURNING *`,
      [type, amount, category, date, description, notes, req.params.id, req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Transaction not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/transactions/:id', requireAuth, async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM transactions WHERE id=$1 AND user_id=$2',
      [req.params.id, req.user.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ══════════════════════════════════════════
   CATEGORIES
══════════════════════════════════════════ */
app.get('/api/categories', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM categories WHERE user_id=$1 ORDER BY created_at',
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/categories', requireAuth, async (req, res) => {
  try {
    const { name, icon, color, type, fixed } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO categories (user_id, name, icon, color, type, fixed)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.user.id, name, icon, color, type, fixed || false]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/categories/:id', requireAuth, async (req, res) => {
  try {
    const { name, icon, color, type } = req.body;
    const { rows } = await pool.query(
      `UPDATE categories SET name=$1, icon=$2, color=$3, type=$4
       WHERE id=$5 AND user_id=$6 RETURNING *`,
      [name, icon, color, type, req.params.id, req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Category not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/categories/:id', requireAuth, async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM categories WHERE id=$1 AND user_id=$2',
      [req.params.id, req.user.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ══════════════════════════════════════════
   BUDGETS
══════════════════════════════════════════ */
app.get('/api/budgets', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM budgets WHERE user_id=$1',
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/budgets', requireAuth, async (req, res) => {
  try {
    const { category_id, amount } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO budgets (user_id, category_id, amount) VALUES ($1,$2,$3) RETURNING *`,
      [req.user.id, category_id, amount]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/budgets/:id', requireAuth, async (req, res) => {
  try {
    const { category_id, amount } = req.body;
    const { rows } = await pool.query(
      `UPDATE budgets SET category_id=$1, amount=$2 WHERE id=$3 AND user_id=$4 RETURNING *`,
      [category_id, amount, req.params.id, req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Budget not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/budgets/:id', requireAuth, async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM budgets WHERE id=$1 AND user_id=$2',
      [req.params.id, req.user.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ══════════════════════════════════════════
   HEALTH CHECK + DIAGNOSTIC
══════════════════════════════════════════ */
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.get('/api/debug', async (req, res) => {
  const checks = {
    database_url: process.env.DATABASE_URL ? '✅ set' : '❌ missing',
    jwt_secret: process.env.JWT_SECRET ? '✅ set' : '⚠️ using default (change in prod)',
    db_connection: null,
  };
  try {
    await pool.query('SELECT 1');
    checks.db_connection = '✅ connected to Neon';
  } catch (e) {
    checks.db_connection = `❌ ${e.message}`;
  }
  res.json(checks);
});

/* ══════════════════════════════════════════
   GLOBAL ERROR HANDLER
══════════════════════════════════════════ */
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`FinanceIQ API running on port ${PORT}`));

module.exports = app;
