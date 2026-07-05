// server.js — ReceiptRadar Backend (JWT & Firebase Firestore auth)
import 'dotenv/config';
import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { GoogleGenAI } from '@google/genai';
import { db, initDatabase } from '../db.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Parse JSON bodies up to 10MB
app.use(express.json({ limit: '10mb' }));

// Serve static web pages from public directory
app.use(express.static('public'));

// Set Content Security Policy headers
app.use((req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://fonts.gstatic.com; " +
    "img-src 'self' data: https:; " +
    "font-src https://fonts.gstatic.com https://fonts.googleapis.com; " +
    "connect-src 'self' https://generativelanguage.googleapis.com;"
  );
  next();
});

// Initialize Gemini client
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// ── Category Lookup Helpers ──
async function resolveCategoryType(name, userId) {
  const catSnap = await db.collection('categories').where('name', '==', name).get();
  const userCat = catSnap.docs.find(doc => doc.data().user_id === userId);
  const globalCat = catSnap.docs.find(doc => doc.data().user_id === null);
  const catDoc = userCat || globalCat;
  return catDoc ? catDoc.data().type : null;
}

async function buildCategoryTypeMap(userId) {
  const [globalSnap, userSnap] = await Promise.all([
    db.collection('categories').where('user_id', '==', null).get(),
    db.collection('categories').where('user_id', '==', userId).get()
  ]);
  const map = {};
  globalSnap.forEach(doc => { map[doc.data().name] = doc.data().type; });
  userSnap.forEach(doc => { map[doc.data().name] = doc.data().type; });
  return map;
}

async function getOwnedTransaction(docId, userId, res) {
  const docRef = db.collection('transactions').doc(docId);
  const docSnap = await docRef.get();
  if (!docSnap.exists || docSnap.data().user_id !== userId) {
    res.status(404).json({ error: 'Transaction record not found or access denied.' });
    return null;
  }
  return { docRef, data: docSnap.data() };
}

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

// ── Categories API: Get List (Protected) ──
app.get('/api/categories', authenticateToken, async (req, res) => {
  try {
    const [globalSnap, userSnap] = await Promise.all([
      db.collection('categories').where('user_id', '==', null).get(),
      db.collection('categories').where('user_id', '==', req.user.id).get()
    ]);

    const categories = new Map();

    globalSnap.forEach(doc => {
      const data = doc.data();
      categories.set(data.name, { name: data.name, type: data.type, isGlobal: true });
    });

    userSnap.forEach(doc => {
      const data = doc.data();
      categories.set(data.name, { name: data.name, type: data.type, isGlobal: false });
    });

    res.json(Array.from(categories.values()));
  } catch (err) {
    console.error('Fetch categories error:', err);
    res.status(500).json({ error: 'Failed to retrieve categories.' });
  }
});

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
    const existingSnap = await db.collection('users').where('email', '==', email).limit(1).get();
    if (!existingSnap.empty) {
      return res.status(400).json({ error: 'Email address already registered.' });
    }

    // Hash password with bcryptjs
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(password, salt);

    // Save user document — Firestore auto-generates the doc ID
    const newUserRef = await db.collection('users').add({
      name,
      email,
      password_hash: hash,
      created_at: new Date().toISOString()
    });

    const userId = newUserRef.id;

    // Generate login token
    const token = jwt.sign(
      { id: userId, email, name },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.status(201).json({
      token,
      user: { id: userId, name, email }
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

    // Fetch user document by email
    const snap = await db.collection('users').where('email', '==', email).limit(1).get();
    if (snap.empty) {
      return res.status(400).json({ error: 'Invalid email or password.' });
    }

    const userDoc = snap.docs[0];
    const user = { id: userDoc.id, ...userDoc.data() };

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
    const snap = await db.collection('transactions')
      .where('user_id', '==', req.user.id)
      .get();

    const categoryTypeMap = await buildCategoryTypeMap(req.user.id);

    const transactions = [];
    snap.forEach(doc => {
      const r = doc.data();
      transactions.push({
        id: doc.id,
        user_id: r.user_id,
        category: r.category,
        amount: r.amount,
        description: r.description,
        vendor: r.description,
        transaction_date: r.transaction_date,
        date: r.transaction_date,
        created_at: r.created_at,
        metadata: r.metadata || null,
        type: r.type || categoryTypeMap[r.category] || 'expense'
      });
    });

    transactions.sort((a, b) => new Date(b.transaction_date) - new Date(a.transaction_date));

    res.json(transactions);
  } catch (err) {
    console.error('Fetch transactions error:', err);
    if (err.code === 9) {
      return res.status(500).json({
        error: 'Firestore index required. Check server logs for the index creation link.',
        details: err.message
      });
    }
    res.status(500).json({ error: 'Failed to retrieve transaction logs.' });
  }
});

// ── Transactions API: Create Row (Protected) ──
app.post('/api/transactions', authenticateToken, async (req, res) => {
  try {
    const { category, amount, description, transaction_date, metadata, type } = req.body;

    if (!category || amount === undefined || !transaction_date) {
      return res.status(400).json({ error: 'Category, amount, and date are required.' });
    }

    let transactionType = type;

    if (!transactionType) {
      transactionType = await resolveCategoryType(category, req.user.id);
      if (!transactionType) {
        return res.status(400).json({ 
          error: `Category "${category}" not found. Please create the category first.` 
        });
      }
    }

    if (!['income', 'expense'].includes(transactionType)) {
      return res.status(400).json({ error: 'Type must be "income" or "expense"' });
    }

    const newDoc = await db.collection('transactions').add({
      user_id: req.user.id,
      category,
      amount: parseFloat(amount),
      description: description || '',
      transaction_date,
      type: transactionType,
      created_at: new Date().toISOString(),
      metadata: metadata || null
    });

    res.status(201).json({ id: newDoc.id });
  } catch (err) {
    console.error('Create transaction error:', err);
    res.status(500).json({ error: 'Failed to create transaction log.' });
  }
});

// ── Transactions API: Update Field (Protected) ──
app.put('/api/transactions/:id', authenticateToken, async (req, res) => {
  try {
    const owned = await getOwnedTransaction(req.params.id, req.user.id, res);
    if (!owned) return;

    const { category, amount, description, transaction_date, type } = req.body;

    const updates = {};
    if (category !== undefined)         updates.category = category;
    if (amount !== undefined)           updates.amount = parseFloat(amount);
    if (description !== undefined)      updates.description = description;
    if (transaction_date !== undefined) updates.transaction_date = transaction_date;
    if (type !== undefined)             updates.type = type;

    if (category !== undefined && type === undefined) {
      const derivedType = await resolveCategoryType(category, req.user.id);
      if (!derivedType) {
        return res.status(400).json({ error: `Category "${category}" not found.` });
      }
      updates.type = derivedType;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No fields to update.' });
    }

    await owned.docRef.update(updates);
    res.json({ success: true });
  } catch (err) {
    console.error('Update transaction error:', err);
    res.status(500).json({ error: 'Failed to update transaction.' });
  }
});

// ── Transactions API: Delete Single (Protected) ──
app.delete('/api/transactions/:id', authenticateToken, async (req, res) => {
  try {
    const owned = await getOwnedTransaction(req.params.id, req.user.id, res);
    if (!owned) return;

    await owned.docRef.delete();
    res.json({ success: true });
  } catch (err) {
    console.error('Delete transaction error:', err);
    res.status(500).json({ error: 'Failed to delete transaction.' });
  }
});

// ── Transactions API: Clear All For User (Protected) ──
app.delete('/api/transactions', authenticateToken, async (req, res) => {
  try {
    const snap = await db.collection('transactions')
      .where('user_id', '==', req.user.id)
      .get();

    // Firestore batch delete (max 500 per batch)
    const batchSize = 500;
    const docs = snap.docs;

    for (let i = 0; i < docs.length; i += batchSize) {
      const batch = db.batch();
      docs.slice(i, i + batchSize).forEach(doc => batch.delete(doc.ref));
      await batch.commit();
    }

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

export default app;

// Only listen if not running on Vercel
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  initDatabase()
    .then(() => {
      app.listen(PORT, () => console.log(`ReceiptRadar server running → http://localhost:${PORT}`));
    })
    .catch((err) => {
      console.error('Failed to initialize database:', err);
      process.exit(1);
    });
}
