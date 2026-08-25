import { Hono } from 'hono'
import type { Bindings, OrderStatus } from '../types'
import { generateOrderNumber, mapDbError, recalcOrderTotal } from '../helpers'

export const orders = new Hono<{ Bindings: Bindings }>()

const ABANDON_AFTER_MINUTES = 30

// ---------------------------------------------------------------
// GET /api/orders  - list all orders (optionally ?status=pending)
// ---------------------------------------------------------------
orders.get('/', async (c) => {
  const status = c.req.query('status') as OrderStatus | undefined
  const stmt = status
    ? c.env.DB.prepare(
        `SELECT o.*, cu.name AS customer_name, cu.email AS customer_email,
                (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) AS item_count
         FROM orders o JOIN customers cu ON cu.id = o.customer_id
         WHERE o.status = ?
         ORDER BY o.created_at DESC`
      ).bind(status)
    : c.env.DB.prepare(
        `SELECT o.*, cu.name AS customer_name, cu.email AS customer_email,
                (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) AS item_count
         FROM orders o JOIN customers cu ON cu.id = o.customer_id
         ORDER BY o.created_at DESC`
      )
  const { results } = await stmt.all()
  return c.json({ success: true, data: results })
})

// ---------------------------------------------------------------
// GET /api/orders/:id  - get one order + its items + customer (the "receipt")
// ---------------------------------------------------------------
orders.get('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const order = await c.env.DB.prepare(`SELECT * FROM orders WHERE id = ?`).bind(id).first<any>()
  if (!order) return c.json({ success: false, error: 'Order not found' }, 404)

  const customer = await c.env.DB.prepare(`SELECT * FROM customers WHERE id = ?`)
    .bind(order.customer_id)
    .first()

  const { results: items } = await c.env.DB.prepare(
    `SELECT oi.*, p.name AS product_name, p.sku AS product_sku
     FROM order_items oi JOIN products p ON p.id = oi.product_id
     WHERE oi.order_id = ?
     ORDER BY oi.id ASC`
  )
    .bind(id)
    .all()

  return c.json({ success: true, data: { order, customer, items } })
})

// ---------------------------------------------------------------
// POST /api/orders  - INSERT a new order (a "pending" cart) for a customer.
// Body: { customer_id, items: [{ product_id, quantity }] }
// This is a TEMPORARY record: no stock is deducted yet, so it is safe
// to leave 'pending' and later flag it 'abandoned' if unpaid.
// ---------------------------------------------------------------
orders.post('/', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const { customer_id, items } = body as {
    customer_id?: number
    items?: { product_id: number; quantity: number }[]
  }

  if (!customer_id) return c.json({ success: false, error: 'customer_id is required' }, 400)
  if (!Array.isArray(items) || items.length === 0)
    return c.json({ success: false, error: 'items must be a non-empty array' }, 400)

  const customer = await c.env.DB.prepare(`SELECT id FROM customers WHERE id = ?`)
    .bind(customer_id)
    .first()
  if (!customer) return c.json({ success: false, error: 'customer_id does not reference an existing customer' }, 400)

  try {
    const orderNumber = generateOrderNumber()
    const insertOrder = await c.env.DB.prepare(
      `INSERT INTO orders (order_number, customer_id, status, total_amount) VALUES (?, ?, 'pending', 0)`
    )
      .bind(orderNumber, customer_id)
      .run()
    const orderId = insertOrder.meta.last_row_id as number

    for (const item of items) {
      const product = await c.env.DB.prepare(`SELECT * FROM products WHERE id = ?`)
        .bind(item.product_id)
        .first<any>()
      if (!product) {
        return c.json({ success: false, error: `Product ${item.product_id} not found` }, 400)
      }
      if (!item.quantity || item.quantity <= 0) {
        return c.json({ success: false, error: `Invalid quantity for product ${item.product_id}` }, 400)
      }
      const subtotal = Math.round(product.price * item.quantity * 100) / 100
      await c.env.DB.prepare(
        `INSERT INTO order_items (order_id, product_id, quantity, unit_price, subtotal) VALUES (?, ?, ?, ?, ?)`
      )
        .bind(orderId, item.product_id, item.quantity, product.price, subtotal)
        .run()
    }

    const total = await recalcOrderTotal(c.env.DB, orderId)
    const order = await c.env.DB.prepare(`SELECT * FROM orders WHERE id = ?`).bind(orderId).first()

    return c.json({ success: true, data: order, total }, 201)
  } catch (err) {
    const { status, message } = mapDbError(err)
    return c.json({ success: false, error: message }, status as any)
  }
})

// ---------------------------------------------------------------
// POST /api/orders/:id/checkout  - finalize a pending order:
//   1) verify stock for every line item
//   2) UPDATE stock (deduct quantity) for every product
//   3) mark the order 'paid' and stamp paid_at  -> this IS the receipt
// Only orders with status = 'pending' may be checked out.
// ---------------------------------------------------------------
orders.post('/:id/checkout', async (c) => {
  const id = Number(c.req.param('id'))
  const order = await c.env.DB.prepare(`SELECT * FROM orders WHERE id = ?`).bind(id).first<any>()
  if (!order) return c.json({ success: false, error: 'Order not found' }, 404)
  if (order.status !== 'pending') {
    return c.json({ success: false, error: `Only pending orders can be checked out (current status: ${order.status})` }, 409)
  }

  const { results: items } = await c.env.DB.prepare(
    `SELECT * FROM order_items WHERE order_id = ?`
  )
    .bind(id)
    .all<any>()

  if (!items || items.length === 0) {
    return c.json({ success: false, error: 'Order has no items to checkout' }, 400)
  }

  // 1) Verify stock availability for all items first
  for (const item of items) {
    const product = await c.env.DB.prepare(`SELECT stock_quantity, name FROM products WHERE id = ?`)
      .bind(item.product_id)
      .first<any>()
    if (!product) return c.json({ success: false, error: `Product ${item.product_id} no longer exists` }, 409)
    if (product.stock_quantity < item.quantity) {
      return c.json(
        {
          success: false,
          error: `Insufficient stock for "${product.name}": requested ${item.quantity}, available ${product.stock_quantity}`,
        },
        409
      )
    }
  }

  try {
    // 2) UPDATE stock after checkout — atomic guard via WHERE stock_quantity >= quantity
    //    plus the CHECK(stock_quantity >= 0) constraint as a last line of defense.
    for (const item of items) {
      const upd = await c.env.DB.prepare(
        `UPDATE products SET stock_quantity = stock_quantity - ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND stock_quantity >= ?`
      )
        .bind(item.quantity, item.product_id, item.quantity)
        .run()
      if (upd.meta.changes === 0) {
        throw new Error(`Insufficient stock while deducting product ${item.product_id} (concurrent purchase?)`)
      }
    }

    // 3) Mark order as paid (finalize the sale)
    await c.env.DB.prepare(
      `UPDATE orders SET status = 'paid', paid_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    )
      .bind(id)
      .run()

    const updatedOrder = await c.env.DB.prepare(`SELECT * FROM orders WHERE id = ?`).bind(id).first()
    const customer = await c.env.DB.prepare(`SELECT * FROM customers WHERE id = ?`)
      .bind(order.customer_id)
      .first()
    const { results: receiptItems } = await c.env.DB.prepare(
      `SELECT oi.*, p.name AS product_name, p.sku AS product_sku
       FROM order_items oi JOIN products p ON p.id = oi.product_id
       WHERE oi.order_id = ?`
    )
      .bind(id)
      .all()

    return c.json({ success: true, data: { order: updatedOrder, customer, items: receiptItems } })
  } catch (err) {
    const { status, message } = mapDbError(err)
    return c.json({ success: false, error: message }, status as any)
  }
})

// ---------------------------------------------------------------
// POST /api/orders/:id/cancel  - customer/admin explicitly cancels a
// pending order. No stock effect (nothing was deducted yet).
// ---------------------------------------------------------------
orders.post('/:id/cancel', async (c) => {
  const id = Number(c.req.param('id'))
  const order = await c.env.DB.prepare(`SELECT * FROM orders WHERE id = ?`).bind(id).first<any>()
  if (!order) return c.json({ success: false, error: 'Order not found' }, 404)
  if (order.status !== 'pending') {
    return c.json({ success: false, error: `Only pending orders can be cancelled (current status: ${order.status})` }, 409)
  }
  await c.env.DB.prepare(
    `UPDATE orders SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  )
    .bind(id)
    .run()
  const updated = await c.env.DB.prepare(`SELECT * FROM orders WHERE id = ?`).bind(id).first()
  return c.json({ success: true, data: updated })
})

// ---------------------------------------------------------------
// POST /api/orders/mark-abandoned  - BUSINESS RULE maintenance job:
// only 'pending' orders older than ABANDON_AFTER_MINUTES with no
// payment are flipped to 'abandoned'. Paid/completed/cancelled orders
// are never touched. Safe to call repeatedly (idempotent).
// ---------------------------------------------------------------
orders.post('/mark-abandoned', async (c) => {
  const result = await c.env.DB.prepare(
    `UPDATE orders
     SET status = 'abandoned', updated_at = CURRENT_TIMESTAMP
     WHERE status = 'pending'
       AND created_at <= datetime('now', ?)`
  )
    .bind(`-${ABANDON_AFTER_MINUTES} minutes`)
    .run()

  return c.json({ success: true, abandoned_count: result.meta.changes ?? 0 })
})

// ---------------------------------------------------------------
// DELETE /api/orders/:id - delete an order. order_items cascade-delete
// automatically (ON DELETE CASCADE). Only allowed for non-paid orders
// to avoid destroying financial history.
// ---------------------------------------------------------------
orders.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const order = await c.env.DB.prepare(`SELECT * FROM orders WHERE id = ?`).bind(id).first<any>()
  if (!order) return c.json({ success: false, error: 'Order not found' }, 404)
  if (order.status === 'paid' || order.status === 'completed') {
    return c.json({ success: false, error: 'Cannot delete a paid/completed order (financial record must be preserved)' }, 409)
  }
  await c.env.DB.prepare(`DELETE FROM orders WHERE id = ?`).bind(id).run()
  return c.json({ success: true })
})
