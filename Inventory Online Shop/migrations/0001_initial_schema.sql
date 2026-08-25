-- ============================================================
-- Inventory Online Store - Initial Schema
-- Tables: customers, products, orders, order_items
-- Enforces keys & constraints to prevent orphaned/invalid records
-- ============================================================

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------
-- CUSTOMERS
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS customers (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL CHECK (length(trim(name)) > 0),
  email         TEXT NOT NULL UNIQUE,
  phone         TEXT,
  address       TEXT,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);

-- ---------------------------------------------------------
-- PRODUCTS (Inventory)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  sku             TEXT NOT NULL UNIQUE,
  name            TEXT NOT NULL CHECK (length(trim(name)) > 0),
  description     TEXT,
  price           REAL NOT NULL CHECK (price >= 0),
  stock_quantity  INTEGER NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
  image_url       TEXT,
  is_active       INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
CREATE INDEX IF NOT EXISTS idx_products_active ON products(is_active);

-- ---------------------------------------------------------
-- ORDERS
-- status lifecycle (business rules):
--   'pending'   -> a temporary "cart" order. Created the moment a customer
--                  starts checking out. NOT counted as a real sale yet.
--   'paid'      -> checkout completed successfully, stock already deducted.
--   'cancelled' -> customer/admin explicitly cancelled a pending order.
--   'abandoned' -> SYSTEM-SET ONLY. A 'pending' order is automatically
--                  flagged 'abandoned' if it is left un-paid past a
--                  timeout (business rule enforced in application code /
--                  cleanup endpoint, never applied to 'paid' orders).
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS orders (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  order_number   TEXT NOT NULL UNIQUE,
  customer_id    INTEGER NOT NULL,
  status         TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','paid','completed','cancelled','abandoned')),
  total_amount   REAL NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  paid_at        DATETIME,
  CONSTRAINT fk_orders_customer
    FOREIGN KEY (customer_id) REFERENCES customers(id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);

-- ---------------------------------------------------------
-- ORDER_ITEMS (line items) - links orders <-> products
-- Cascade delete with the parent order (an order_item cannot outlive
-- its order), but a product cannot be deleted while referenced by any
-- order_item (RESTRICT) to avoid orphaned/invalid historical records.
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS order_items (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id     INTEGER NOT NULL,
  product_id   INTEGER NOT NULL,
  quantity     INTEGER NOT NULL CHECK (quantity > 0),
  unit_price   REAL NOT NULL CHECK (unit_price >= 0),
  subtotal     REAL NOT NULL CHECK (subtotal >= 0),
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_order_items_order
    FOREIGN KEY (order_id) REFERENCES orders(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT fk_order_items_product
    FOREIGN KEY (product_id) REFERENCES products(id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,
  CONSTRAINT uq_order_product UNIQUE (order_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product ON order_items(product_id);
