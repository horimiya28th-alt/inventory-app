# Inventory Online Store

A lightweight inventory-driven online store built with **Hono** + **Cloudflare Pages/Workers** + **Cloudflare D1**. Customers browse products, build a cart, and check out; stock is deducted automatically and a printable receipt is generated. An Admin console provides full CRUD over products, customers and orders.

## Project Overview
- **Name**: Inventory Online Store
- **Goal**: Demonstrate a real relational data model (customers, products, orders, order_items) with proper keys/constraints enforcing data integrity, plus a working storefront + admin UI on Cloudflare's edge stack.
- **Features**:
  - Customer picker / quick "new customer" creation on the storefront
  - Product catalog with live stock indicator
  - Cart (backed by a real **pending** order + order_items in D1) — add/remove/adjust quantity
  - **Checkout**: verifies stock, deducts inventory, marks the order **paid**, generates a receipt
  - **Receipt page** (`/receipt/:orderId`) — printable, totals all line items
  - **Order history** per customer
  - **Admin console** (`/admin`) — CRUD for Products, Customers; Orders list with cancel / delete / "flag abandoned carts" tools
  - Abandoned-cart business rule: pending orders older than 30 minutes with no payment can be swept to `abandoned` via a maintenance endpoint (idempotent, never touches paid orders)

## URLs
- **Local sandbox preview**: started via PM2, exposed with the sandbox's public URL (see chat)
- **Production**: not yet deployed — see "Deployment" below
- **GitHub**: not yet connected

## Data Architecture

### Storage
- **Cloudflare D1** (SQLite at the edge) — binding `DB`, database name `webapp-production`
- Local development uses `wrangler d1 --local`, which stores data in `.wrangler/state/v3/d1` and mirrors the production schema

### Tables & Relationships

```
customers (1) ──< orders (1) ──< order_items >── (1) products
```

| Table         | Key columns                                                                 | Constraints |
|---------------|------------------------------------------------------------------------------|-------------|
| `customers`   | `id` PK, `email` UNIQUE                                                     | `name` non-empty (CHECK) |
| `products`    | `id` PK, `sku` UNIQUE                                                       | `price >= 0`, `stock_quantity >= 0` (CHECK) |
| `orders`      | `id` PK, `order_number` UNIQUE, `customer_id` FK → customers.id             | `status` restricted to `pending/paid/completed/cancelled/abandoned` (CHECK); FK `ON DELETE RESTRICT` (a customer with orders cannot be deleted) |
| `order_items` | `id` PK, `order_id` FK → orders.id, `product_id` FK → products.id, UNIQUE(`order_id`,`product_id`) | `quantity > 0`, `unit_price >= 0`, `subtotal >= 0` (CHECK); `order_id` FK `ON DELETE CASCADE` (items die with their order); `product_id` FK `ON DELETE RESTRICT` (a product with order history cannot be deleted — deactivate it instead) |

This prevents orphaned/invalid records: you cannot insert an order for a non-existent customer, an order_item for a non-existent order/product, or delete a product/customer that is still referenced by historical orders.

### Order status lifecycle (business rules)
- **pending** — a temporary "cart" record created the moment a customer adds an item. No stock is deducted yet, so it is safe to abandon.
- **paid** — checkout succeeded: stock was deducted and the order is finalized (this state generates the receipt).
- **cancelled** — customer/admin explicitly cancelled a still-pending order.
- **abandoned** — **system-set only**: a maintenance sweep (`POST /api/orders/mark-abandoned`) flags `pending` orders older than 30 minutes. Paid/completed/cancelled orders are never touched.
- **completed** — reserved for a future "fulfilled/shipped" step (schema supports it; not automatically set today).

### Core SQL operations implemented
- **INSERT** a customer — `POST /api/customers`
- **INSERT** a new order + its order_items — `POST /api/orders` (creates a `pending` cart)
- **UPDATE stock after checkout** — `POST /api/orders/:id/checkout` (atomic `UPDATE products SET stock_quantity = stock_quantity - ? WHERE id = ? AND stock_quantity >= ?`, guarded by the `CHECK(stock_quantity >= 0)` constraint as a last line of defense)
- **SELECT order history for a customer** — `GET /api/customers/:id/orders`
- **UPDATE order status → abandoned** (business rule, temporary/pending only) — `POST /api/orders/mark-abandoned`

## API Reference

| Method | Path | Description |
|---|---|---|
| GET | `/api/customers` | List customers |
| GET | `/api/customers/:id` | Get a customer |
| GET | `/api/customers/:id/orders` | Order history for a customer |
| POST | `/api/customers` | Create customer `{name, email, phone?, address?}` |
| PUT | `/api/customers/:id` | Update customer |
| DELETE | `/api/customers/:id` | Delete customer (blocked if they have orders) |
| GET | `/api/products` | List products (`?active=1` for storefront) |
| GET | `/api/products/:id` | Get a product |
| POST | `/api/products` | Create product `{sku, name, price, stock_quantity, description?, image_url?, is_active?}` |
| PUT | `/api/products/:id` | Update product / adjust stock |
| DELETE | `/api/products/:id` | Delete product (blocked if it has order history) |
| GET | `/api/orders` | List orders (`?status=pending|paid|completed|cancelled|abandoned`) |
| GET | `/api/orders/:id` | Get an order + its items + customer (receipt data) |
| POST | `/api/orders` | Create a pending order (cart) `{customer_id, items:[{product_id, quantity}]}` |
| POST | `/api/orders/:id/checkout` | Verify stock, deduct inventory, mark `paid` |
| POST | `/api/orders/:id/cancel` | Cancel a pending order |
| POST | `/api/orders/mark-abandoned` | Sweep stale pending orders → `abandoned` |
| DELETE | `/api/orders/:id` | Delete a non-paid order (items cascade) |
| GET | `/api/order-items?order_id=` | List items for an order |
| POST | `/api/order-items` | Add/merge a line item into a pending order |
| PUT | `/api/order-items/:id` | Update line item quantity (pending order only) |
| DELETE | `/api/order-items/:id` | Remove a line item (pending order only) |

## User Guide
1. Open the storefront (`/`). Pick a customer from the dropdown, or click **New customer** to create one.
2. Click **Add to Cart** on any product. This creates/updates a `pending` order behind the scenes.
3. Open the cart drawer to adjust quantities or remove items.
4. Click **Checkout** — stock is deducted and you're redirected to a printable **Receipt**.
5. Click **Order history** to see all past orders for the selected customer, with links back to their receipts.
6. Visit `/admin` to manage the catalog (add/edit/delete products), manage customers, and review/cancel/delete orders. Use **Flag Abandoned Carts** to sweep stale pending orders.

## Deployment
- **Platform**: Cloudflare Pages (target)
- **Status**: ❌ Not yet deployed to production — currently running in the sandbox for development/testing
- **Tech Stack**: Hono + TypeScript + TailwindCSS (CDN) + Cloudflare D1
- **Local dev**: `npm run build && pm2 start ecosystem.config.cjs` (serves on port 3000 via `wrangler pages dev`)
