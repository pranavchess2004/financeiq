const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));
app.use(express.json());

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

/* ══════════════════════════════════════════
   AUTH MIDDLEWARE
══════════════════════════════════════════ */
async function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token provided' });

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return res.status(401).json({ error: 'Invalid token' });

  req.user = user;
  next();
}

/* ══════════════════════════════════════════
   AUTH ROUTES
══════════════════════════════════════════ */
app.post('/api/auth/signup', async (req, res) => {
  const { email, password, name } = req.body;
  const { data, error } = await supabase.auth.signUp({
    email, password,
    options: { data: { name } }
  });
  if (error) return res.status(400).json({ error: error.message });
  res.json({ user: data.user, session: data.session });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return res.status(400).json({ error: error.message });
  res.json({ user: data.user, session: data.session });
});

app.post('/api/auth/logout', requireAuth, async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  await supabase.auth.admin.signOut(token);
  res.json({ success: true });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

/* ══════════════════════════════════════════
   TRANSACTIONS
══════════════════════════════════════════ */
app.get('/api/transactions', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', req.user.id)
    .order('date', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/transactions', requireAuth, async (req, res) => {
  const { type, amount, category, date, description, notes } = req.body;
  const { data, error } = await supabase
    .from('transactions')
    .insert({ user_id: req.user.id, type, amount, category, date, description, notes })
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.put('/api/transactions/:id', requireAuth, async (req, res) => {
  const { type, amount, category, date, description, notes } = req.body;
  const { data, error } = await supabase
    .from('transactions')
    .update({ type, amount, category, date, description, notes })
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.delete('/api/transactions/:id', requireAuth, async (req, res) => {
  const { error } = await supabase
    .from('transactions')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.user.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

/* ══════════════════════════════════════════
   CATEGORIES
══════════════════════════════════════════ */
app.get('/api/categories', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .eq('user_id', req.user.id)
    .order('created_at');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/categories', requireAuth, async (req, res) => {
  const { name, icon, color, type, fixed } = req.body;
  const { data, error } = await supabase
    .from('categories')
    .insert({ user_id: req.user.id, name, icon, color, type, fixed: fixed || false })
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.put('/api/categories/:id', requireAuth, async (req, res) => {
  const { name, icon, color, type } = req.body;
  const { data, error } = await supabase
    .from('categories')
    .update({ name, icon, color, type })
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.delete('/api/categories/:id', requireAuth, async (req, res) => {
  const { error } = await supabase
    .from('categories')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.user.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

/* ══════════════════════════════════════════
   BUDGETS
══════════════════════════════════════════ */
app.get('/api/budgets', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('budgets')
    .select('*')
    .eq('user_id', req.user.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/budgets', requireAuth, async (req, res) => {
  const { category_id, amount } = req.body;
  const { data, error } = await supabase
    .from('budgets')
    .insert({ user_id: req.user.id, category_id, amount })
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.put('/api/budgets/:id', requireAuth, async (req, res) => {
  const { category_id, amount } = req.body;
  const { data, error } = await supabase
    .from('budgets')
    .update({ category_id, amount })
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.delete('/api/budgets/:id', requireAuth, async (req, res) => {
  const { error } = await supabase
    .from('budgets')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.user.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

/* ══════════════════════════════════════════
   HEALTH CHECK
══════════════════════════════════════════ */
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`FinanceIQ API running on port ${PORT}`));
