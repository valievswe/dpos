import { app } from 'electron'
import { join } from 'path'
import Database from 'better-sqlite3'

let db: Database.Database

export function initializeDatabase(): Database.Database {
  // 1. Define Path
  const dbPath = join(app.getPath('userData'), 'pos_system.db')

  // 2. Open Connection
  db = new Database(dbPath) // { verbose: console.log } for debugging

  // 3. Initialize Tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sku TEXT UNIQUE,
      name TEXT,
      price REAL,
      stock INTEGER DEFAULT 0
    );
  `)

  console.log('Database connected at:', dbPath)
  return db
}

// Helper to get the DB instance later
export function getDB(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized!')
  }
  return db
}
