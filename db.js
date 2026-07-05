// db.js — SQLite local database helper using Promises
import sqlite3 from 'sqlite3';
import path from 'path';

// Store DB locally in the project root directory
const dbPath = path.resolve('./database.db');
const db = new sqlite3.Database(dbPath);

// Helper to run non-select SQL statements with Promise wrapper
export function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

// Helper to retrieve a single row
export function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

// Helper to retrieve all matching rows
export function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

// Main initialization function for DB schema setup and category seeding
export async function initDatabase() {
  // Enable foreign keys constraint enforcement in SQLite
  await dbRun("PRAGMA foreign_keys = ON;");

  // 1. Users Table
  await dbRun(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 2. Categories Table
  await dbRun(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(user_id, name)
    )
  `);

  // 3. Transactions Table
  await dbRun(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      category TEXT NOT NULL,
      amount REAL NOT NULL,
      description TEXT,
      transaction_date TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      metadata TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Seed default categories if not already seeded
  const row = await dbGet("SELECT COUNT(*) as count FROM categories WHERE user_id IS NULL");
  if (row.count === 0) {
    const defaults = [
      { name: "Food & Dining", type: "expense" },
      { name: "Entertainment", type: "expense" },
      { name: "Travel", type: "expense" },
      { name: "Shopping", type: "expense" },
      { name: "Investment", type: "expense" },
      { name: "Salary / Wages", type: "income" }
    ];
    
    for (const cat of defaults) {
      await dbRun(
        "INSERT INTO categories (user_id, name, type) VALUES (NULL, ?, ?)",
        [cat.name, cat.type]
      );
    }
    console.log("Database initialized and seeded with default categories.");
  }
}

export default db;
