// server.js — ReceiptRadar Backend (JWT & SQLite local database auth)
import 'dotenv/config';
import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { GoogleGenAI } from '@google/genai';
import { dbRun, dbGet, dbAll, initDatabase } from './db.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Parse JSON bodies up to 10MB
app.use(express.json({ limit: '10mb' }));

// Serve static web pages from public directory
app.use(express.static('public'));

// Initialize Gemini client
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// ── Authentication Middleware ──
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required.' });
  }

  try {
    const verified = jwt.verify(token, process.env.JWT_SECRET);
    req.user = verified; // Append decoded JWT payload { id, email, name }
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Invalid or expired session token.' });
  }
}

// ── Auth Route 1: Register ──
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    // Check if email already registered
    const existing = await dbGet('SELECT id FROM users WHERE email = ?', [email]);
    if (existing) {
      return res.status(400).json({ error: 'Email address already registered.' });
    }

    // Hash password with bcryptjs
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(password, salt);

    // Save user row
    const result = await dbRun(
      'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)',
      [name, email, hash]
    );

    // Generate login token
    const token = jwt.sign(
      { id: result.lastID, email, name },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.status(201).json({
      token,
      user: { id: result.lastID, name, email }
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Internal registration error.' });
  }
});

// ── Auth Route 2: Login ──
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    // Fetch user row
    const user = await dbGet('SELECT * FROM users WHERE email = ?', [email]);
    if (!user) {
      return res.status(400).json({ error: 'Invalid email or password.' });
    }

    // Validate password hash
    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      return res.status(400).json({ error: 'Invalid email or password.' });
    }

    // Generate login token
    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal database authentication error.' });
  }
});

// ── Transactions API: Get List (Protected) ──
app.get('/api/transactions', authenticateToken, async (req, res) => {
  try {
    const rows = await dbAll(
      'SELECT * FROM transactions WHERE user_id = ? ORDER BY transaction_date DESC, id DESC',
      [req.user.id]
    );

    // Map SQLite string metadata back into objects
    const mapped = rows.map((r) => ({
      id: r.id,
      user_id: r.user_id,
      category: r.category,
      amount: r.amount,
      description: r.description,
      transaction_date: r.transaction_date,
      created_at: r.created_at,
      metadata: r.metadata ? JSON.parse(r.metadata) : null
    }));

    res.json(mapped);
  } catch (err) {
    console.error('Fetch transactions error:', err);
    res.status(500).json({ error: 'Failed to retrieve transaction logs.' });
  }
});

// ── Transactions API: Create Row (Protected) ──
app.post('/api/transactions', authenticateToken, async (req, res) => {
  try {
    const { category, amount, description, transaction_date, metadata } = req.body;

    if (!category || amount === undefined || !transaction_date) {
      return res.status(400).json({ error: 'Category, amount, and date are required.' });
    }

    const metadataStr = metadata ? JSON.stringify(metadata) : null;

    const result = await dbRun(
      `INSERT INTO transactions (user_id, category, amount, description, transaction_date, metadata) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [req.user.id, category, parseFloat(amount), description || '', transaction_date, metadataStr]
    );

    res.status(201).json({ id: result.lastID });
  } catch (err) {
    console.error('Create transaction error:', err);
    res.status(500).json({ error: 'Failed to create transaction log.' });
  }
});

// ── Transactions API: Update Field (Protected) ──
app.put('/api/transactions/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { category, amount, description, transaction_date } = req.body;

    // Verify ownership
    const tx = await dbGet('SELECT id FROM transactions WHERE id = ? AND user_id = ?', [id, req.user.id]);
    if (!tx) {
      return res.status(404).json({ error: 'Transaction record not found or access denied.' });
    }

    // Dynamically update passed fields
    const updates = [];
    const params = [];

    if (category !== undefined) {
      updates.push('category = ?');
      params.push(category);
    }
    if (amount !== undefined) {
      updates.push('amount = ?');
      params.push(parseFloat(amount));
    }
    if (description !== undefined) {
      updates.push('description = ?');
      params.push(description);
    }
    if (transaction_date !== undefined) {
      updates.push('transaction_date = ?');
      params.push(transaction_date);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update.' });
    }

    params.push(id, req.user.id);

    await dbRun(
      `UPDATE transactions SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`,
      params
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Update transaction error:', err);
    res.status(500).json({ error: 'Failed to update transaction.' });
  }
});

// ── Transactions API: Delete Single (Protected) ──
app.delete('/api/transactions/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Verify ownership
    const tx = await dbGet('SELECT id FROM transactions WHERE id = ? AND user_id = ?', [id, req.user.id]);
    if (!tx) {
      return res.status(404).json({ error: 'Transaction record not found or access denied.' });
    }

    await dbRun('DELETE FROM transactions WHERE id = ? AND user_id = ?', [id, req.user.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete transaction error:', err);
    res.status(500).json({ error: 'Failed to delete transaction.' });
  }
});

// ── Transactions API: Clear All For User (Protected) ──
app.delete('/api/transactions', authenticateToken, async (req, res) => {
  try {
    await dbRun('DELETE FROM transactions WHERE user_id = ?', [req.user.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Clear transactions error:', err);
    res.status(500).json({ error: 'Failed to clear transaction log.' });
  }
});

// ── AI Scanner Flow Route: Ingest image, extract structured details (Protected) ──
app.post('/api/scan-receipt', authenticateToken, async (req, res) => {
  try {
    const { imageBase64, mimeType } = req.body;

    if (!imageBase64 || !mimeType) {
      return res.status(400).json({ error: 'Missing imageBase64 or mimeType' });
    }

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          parts: [
            {
              text: `You are a receipt data extraction assistant.
Extract the following from this receipt image:
1. Transaction date in ISO YYYY-MM-DD format.
2. Merchant / vendor name.
3. The strict FINAL total amount paid (Net Total / Grand Total) AFTER any discounts, taxes, or promotions have been applied. Do NOT use the subtotal or pre-discount price.
4. Assign a category from this list:
   [Food & Dining, Entertainment, Travel, Shopping, Investment, Other].
Return valid JSON only.`
            },
            {
              inlineData: { mimeType, data: imageBase64 }
            }
          ]
        }
      ],
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            date:     { type: 'STRING',  description: 'ISO YYYY-MM-DD' },
            vendor:   { type: 'STRING',  description: 'Merchant name' },
            amount:   { type: 'NUMBER',  description: 'Strict FINAL total paid after all discounts, taxes, and promotions' },
            category: {
              type: 'STRING',
              enum: ['Food & Dining','Entertainment','Travel','Shopping','Investment','Other']
            }
          },
          required: ['date', 'vendor', 'amount', 'category']
        }
      }
    });

    const text = response.text;
    if (!text) {
      throw new Error('Gemini did not return any text.');
    }
    let cleanedText = text.trim();
    if (cleanedText.startsWith('```')) {
      cleanedText = cleanedText.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/, '').trim();
    }
    const parsed = JSON.parse(cleanedText);
    res.json(parsed);
  } catch (err) {
    console.error('Gemini error:', err);
    res.status(500).json({ error: err.message || 'Receipt scan failed' });
  }
});

// Run DB table creations and seed defaults, then bind HTTP listening port
initDatabase()
  .then(() => {
    app.listen(PORT, () => console.log(`ReceiptRadar server running → http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });
