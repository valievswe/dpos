import { app } from 'electron'
import { join } from 'path'
import Database from 'better-sqlite3'

let db: Database.Database | null = null

const PRAGMAS = [
  'foreign_keys = ON',
  'journal_mode = WAL',
  'synchronous = NORMAL',
  'busy_timeout = 5000'
]

const TABLE_SQL = `
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY,
  sku TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  barcode TEXT UNIQUE,
  unit TEXT NOT NULL,
  cost_cents INTEGER NOT NULL DEFAULT 0,
  price_cents INTEGER NOT NULL,
  qty REAL NOT NULL DEFAULT 0,
  min_stock REAL NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT UNIQUE,
  email TEXT,
  address TEXT,
  debt_cents INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS app_users (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('Do''kondor','owner')),
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sales (
  id INTEGER PRIMARY KEY,
  customer_id INTEGER REFERENCES customers(id),
  sale_date DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%S+05:00', 'now', '+5 hours')),
  subtotal_cents INTEGER NOT NULL,
  discount_cents INTEGER NOT NULL DEFAULT 0,
  tax_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash','card','mixed','debt')),
  note TEXT
);

CREATE TABLE IF NOT EXISTS sale_items (
  id INTEGER PRIMARY KEY,
  sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  product_name TEXT NOT NULL,
  barcode TEXT,
  quantity REAL NOT NULL,
  unit_price_cents INTEGER NOT NULL,
  cost_cents INTEGER NOT NULL,
  line_total_cents INTEGER NOT NULL,
  profit_cents INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sale_returns (
  id INTEGER PRIMARY KEY,
  sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  customer_id INTEGER REFERENCES customers(id),
  total_cents INTEGER NOT NULL,
  debt_reduced_cents INTEGER NOT NULL DEFAULT 0,
  refund_method TEXT CHECK (refund_method IN ('cash','card')),
  refund_cents INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sale_return_items (
  id INTEGER PRIMARY KEY,
  return_id INTEGER NOT NULL REFERENCES sale_returns(id) ON DELETE CASCADE,
  sale_item_id INTEGER NOT NULL REFERENCES sale_items(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  quantity REAL NOT NULL,
  unit_price_cents INTEGER NOT NULL,
  line_total_cents INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY,
  sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  method TEXT NOT NULL CHECK (method IN ('cash','card')),
  amount_cents INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id),
  movement_type TEXT NOT NULL CHECK (movement_type IN ('initial','receive','sale','return','adjustment')),
  quantity_change REAL NOT NULL,
  old_qty REAL,
  new_qty REAL,
  cost_cents INTEGER NOT NULL DEFAULT 0,
  unit_price_cents INTEGER NOT NULL DEFAULT 0,
  reference_id INTEGER,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS debts (
  id INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  sale_id INTEGER REFERENCES sales(id),
  description TEXT NOT NULL,
  total_cents INTEGER NOT NULL,
  paid_cents INTEGER NOT NULL DEFAULT 0,
  due_date DATE,
  is_paid INTEGER NOT NULL DEFAULT 0,
  paid_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS debt_transactions (
  id INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  sale_id INTEGER REFERENCES sales(id),
  type TEXT NOT NULL CHECK (type IN ('debt_added','payment')),
  amount_cents INTEGER NOT NULL,
  note TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS print_jobs (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('barcode','receipt')),
  product_id INTEGER REFERENCES products(id),
  sale_id INTEGER REFERENCES sales(id),
  copies INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL CHECK (status IN ('queued','sent','failed','done')) DEFAULT 'queued',
  payload TEXT,
  error TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`

const INDEXES_AND_TRIGGERS = `
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(sale_date);
CREATE INDEX IF NOT EXISTS idx_sale_items_product ON sale_items(product_id);
CREATE INDEX IF NOT EXISTS idx_sale_returns_sale ON sale_returns(sale_id, created_at);
CREATE INDEX IF NOT EXISTS idx_sale_return_items_sale_item ON sale_return_items(sale_item_id);
CREATE INDEX IF NOT EXISTS idx_stock_product_date ON stock_movements(product_id, created_at);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_debts_customer ON debts(customer_id, is_paid);

CREATE TRIGGER IF NOT EXISTS trg_products_updated AFTER UPDATE ON products
BEGIN
  UPDATE products SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_customers_updated AFTER UPDATE ON customers
BEGIN
  UPDATE customers SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_app_users_updated AFTER UPDATE ON app_users
BEGIN
  UPDATE app_users SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
`

export function initializeDatabase(): Database.Database {
  if (db) {
    return db
  }

  const dbPath = join(app.getPath('userData'), 'pos_system.db')
  db = new Database(dbPath, {
    fileMustExist: false
  })

  PRAGMAS.forEach((p) => db!.pragma(p))
  // 1) Create tables if missing
  db.exec(TABLE_SQL)
  // 2) Migrate legacy columns (old products without barcode, etc.)
  migrateLegacyProducts(db)
  migrateLegacyDebtColumns(db)
  migrateLegacyAppUsersRoleConstraint(db)
  // 3) Indexes/triggers after columns exist
  db.exec(INDEXES_AND_TRIGGERS)

  return db
}

export function getDB(): Database.Database {
  if (!db) throw new Error('Database not initialized')
  return db
}

// Helper: map row to UI expectations (price so'm, stock -> qty)
export function mapProductRow(row: any) {
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    price: row.price_cents / 100,
    costPrice: (row.cost_cents ?? 0) / 100,
    stock: row.qty,
    barcode: row.barcode,
    unit: row.unit,
    min_stock: row.min_stock
  }
}

// -- MIGRATION: legacy products jadvalidan kolonkalarni to'ldirish
function migrateLegacyProducts(database: Database.Database) {
  const addCol = (table: string, name: string, type: string) => {
    const cols = database.prepare(`PRAGMA table_info(${table})`).all()
    const exists = cols.some((c: any) => c.name === name)
    if (!exists) {
      database.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`)
    }
  }

  // Products: barcode va yangi pul kolonkalar
  addCol('products', 'barcode', 'TEXT')
  addCol('products', 'unit', "TEXT NOT NULL DEFAULT 'dona'")
  addCol('products', 'cost_cents', 'INTEGER NOT NULL DEFAULT 0')
  addCol('products', 'price_cents', 'INTEGER NOT NULL DEFAULT 0')
  addCol('products', 'qty', 'REAL NOT NULL DEFAULT 0')
  addCol('products', 'min_stock', 'REAL NOT NULL DEFAULT 0')
  addCol('products', 'active', 'INTEGER NOT NULL DEFAULT 1')
  addCol('products', 'created_at', 'DATETIME DEFAULT CURRENT_TIMESTAMP')
  addCol('products', 'updated_at', 'DATETIME DEFAULT CURRENT_TIMESTAMP')

  // Legacy price -> price_cents migration (best-effort)
  try {
    const hasLegacyPrice = database
      .prepare("PRAGMA table_info(products)")
      .all()
      .some((c: any) => c.name === 'price')
    if (hasLegacyPrice) {
      database.exec(
        `UPDATE products SET price_cents = CASE 
            WHEN price_cents IS NULL OR price_cents = 0 THEN CAST(ROUND(price * 100) AS INTEGER)
            ELSE price_cents END`
      )
    }
  } catch (err) {
    console.warn('Price migration skipped:', err)
  }
}

function migrateLegacyDebtColumns(database: Database.Database) {
  const addCol = (table: string, name: string, type: string) => {
    const cols = database.prepare(`PRAGMA table_info(${table})`).all()
    const exists = cols.some((c: any) => c.name === name)
    if (!exists) {
      database.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`)
    }
  }

  addCol('debts', 'sale_id', 'INTEGER REFERENCES sales(id)')
  addCol('debts', 'paid_at', 'DATETIME')

  // Backfill sale_id for legacy rows created from debt sales like "Sotuv #123"
  database.exec(`
    UPDATE debts
    SET sale_id = CAST(SUBSTR(description, INSTR(description, '#') + 1) AS INTEGER)
    WHERE sale_id IS NULL
      AND description LIKE 'Sotuv #%'
      AND INSTR(description, '#') > 0;
  `)
}

function migrateLegacyAppUsersRoleConstraint(database: Database.Database) {
  const row = database
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'app_users'")
    .get() as { sql?: string } | undefined
  const tableSql = row?.sql ?? ''
  if (!tableSql) return

  const hasOwnerOnlyConstraint = /CHECK\s*\(\s*role\s+IN\s*\(\s*'owner'\s*\)\s*\)/i.test(tableSql)
  if (!hasOwnerOnlyConstraint) return

  const migrate = database.transaction(() => {
    database.exec(`
      CREATE TABLE app_users_new (
        id INTEGER PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        role TEXT NOT NULL CHECK (role IN ('Do''kondor','owner')),
        password_salt TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      INSERT INTO app_users_new (id, username, role, password_salt, password_hash, created_at, updated_at)
      SELECT
        id,
        username,
        CASE
          WHEN role = 'Do''kondor' THEN 'Do''kondor'
          ELSE 'owner'
        END,
        password_salt,
        password_hash,
        created_at,
        updated_at
      FROM app_users;

      DROP TABLE app_users;
      ALTER TABLE app_users_new RENAME TO app_users;
    `)
  })

  migrate()
}
