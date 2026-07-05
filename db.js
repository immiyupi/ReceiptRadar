// db.js — Firebase Admin + Firestore database helper
import admin from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config();

// Parse the service account JSON stored as an env variable
// In .env: FIREBASE_SERVICE_ACCOUNT={"type":"service_account","project_id":"..."}
let serviceAccount;
try {
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
} catch (e) {
  console.error('❌ Failed to parse FIREBASE_SERVICE_ACCOUNT env variable. Make sure it is valid JSON.');
  process.exit(1);
}

// Initialize Firebase Admin (guard against duplicate init in watch/dev mode)
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

// Export the Firestore database instance
export const db = admin.firestore();

// Default system-wide categories to seed on first run
const DEFAULT_CATEGORIES = [
  { name: 'Food & Dining',  type: 'expense' },
  { name: 'Entertainment',  type: 'expense' },
  { name: 'Travel',         type: 'expense' },
  { name: 'Shopping',       type: 'expense' },
  { name: 'Investment',     type: 'expense' },
  { name: 'Salary / Wages', type: 'income'  },
  { name: 'Other',          type: 'expense' },
];

/**
 * Seeds default global categories into Firestore if they don't already exist.
 * Idempotent — safe to call on every server start.
 */
export async function initDatabase() {
  const catRef = db.collection('categories');

  const existing = await catRef.where('user_id', '==', null).get();

  if (existing.empty) {
    const batch = db.batch();
    for (const cat of DEFAULT_CATEGORIES) {
      const docRef = catRef.doc();
      batch.set(docRef, { ...cat, user_id: null });
    }
    await batch.commit();
    console.log('✅ Firestore initialized and seeded with default categories.');
  } else {
    console.log('✅ Firestore connected. Default categories already seeded.');
    
    const otherExists = existing.docs.some(doc => doc.data().name === 'Other');
    if (!otherExists) {
      const otherDoc = catRef.doc();
      await otherDoc.set({ name: 'Other', type: 'expense', user_id: null });
      console.log('✅ Added missing "Other" category to existing database.');
    }
  }
}

export default db;
