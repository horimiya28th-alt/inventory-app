import { Hono } from 'hono'
import type { Bindings } from '../types'
import { mapDbError, recalcOrderTotal } from '../helpers'

export const orderItems = new Hono<{ Bindings: Bindings }>()

async function assertPendingOrder(db: D1Database, orderId: number) {
  const order = await db.prepare(`SELECT * FROM orders WHERE id = ?`).bind(orderId).first<any>()
  if (!order) return { error: 'Order not found', status: 404 as const }
  if (order.status !== 'pending') return { error: `Order is ${order.status}; items can only be modified while pending`, status: 409 as const }
  return { order }
}

// ---------------------------------------------------------------
// GET /api/order-items?order_id=  - SELECT items for an order
// ---------------------------------------------------------------
orderItems.get('/', async (c) => {
  const orderId = Number(c.req.query('order_id'))
  if (!orderId) return c.json({ success: false, error: 'order_id query param is required' }, 400)
  const { results } = await c.env.DB.prepare(
    `SELECT oi.*, p.name AS product_name, p.sku AS product_sku
     FROM order_items oi JOIN products p ON p.id = oi.product_id
     WHERE oi.order_id = ? ORDER BY oi.id ASC`
  )
    .bind(orderId)
    .all()
  return c.json({ success: true, data: results })
})

// ---------------------------------------------------------------
// POST /api/order-items  - INSERT/merge a line item into a pending order
// Body: { order_id, product_id, quantity }
// ---------------------------------------------------------------
orderItems.post('/', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const { order_id, product_id, quantity } = body as { order_id?: number; product_id?: number; quantity?: number }

  if (!order_id || !product_id || !quantity || quantity <= 0) {
    return c.json({ success: false, error: 'order_id, product_id and a positive quantity are required' }, 400)
  }

  const guard = await assertPendingOrder(c.env.DB, order_id)
  if ('error' in guard) return c.json({ success: false, error: guard.error }, guard.status)

  const product = await c.env.DB.prepare(`SELECT * FROM products WHERE id = ?`).bind(product_id).first<any>()
  if (!product) return c.json({ success: false, error: 'Product not found' }, 400)

  try {
    const existing = await c.env.DB.prepare(
      `SELECT * FROM order_items WHERE order_id = ? AND product_id = ?`
    )
      .bind(order_id, product_id)
      .first<any>()

    if (existing) {
      const newQty = existing.quantity + quantity
      const subtotal = Math.round(product.price * newQty * 100) / 100
      await c.env.DB.prepare(
        `UPDATE order_items SET quantity = ?, unit_price = ?, subtotal = ? WHERE id = ?`
      )
        .bind(newQty, product.price, subtotal, existing.id)
        .run()
    } else {
      const subtotal = Math.round(product.price * quantity * 100) / 100
      await c.env.DB.prepare(
        `INSERT INTO order_items (order_id, product_id, quantity, unit_price, subtotal) VALUES (?, ?, ?, ?, ?)`
      )
        .bind(order_id, product_id, quantity, product.price, subtotal)
        .run()
    }

    const total = await recalcOrderTotal(c.env.DB, order_id)
    const { results: items } = await c.env.DB.prepare(
      `SELECT oi.*, p.name AS product_name FROM order_items oi JOIN products p ON p.id = oi.product_id WHERE oi.order_id = ?`
    )
      .bind(order_id)
      .all()

    return c.json({ success: true, data: items, total }, 201)
  } catch (err) {
    const { status, message } = mapDbError(err)
    return c.json({ success: false, error: message }, status as any)
  }
})

// ---------------------------------------------------------------
// PUT /api/order-items/:id  - UPDATE quantity of a line item (pending order only)
// ---------------------------------------------------------------
orderItems.put('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json().catch(() => ({}))
  const { quantity } = body as { quantity?: number }
  if (!quantity || quantity <= 0) return c.json({ success: false, error: 'quantity must be a positive number' }, 400)

  const item = await c.env.DB.prepare(`SELECT * FROM order_items WHERE id = ?`).bind(id).first<any>()
  if (!item) return c.json({ success: false, error: 'Order item not found' }, 404)

  const guard = await assertPendingOrder(c.env.DB, item.order_id)
  if ('error' in guard) return c.json({ success: false, error: guard.error }, guard.status)

  try {
    const subtotal = Math.round(item.unit_price * quantity * 100) / 100
    await c.env.DB.prepare(`UPDATE order_items SET quantity = ?, subtotal = ? WHERE id = ?`)
      .bind(quantity, subtotal, id)
      .run()
    const total = await recalcOrderTotal(c.env.DB, item.order_id)
    const updated = await c.env.DB.prepare(`SELECT * FROM order_items WHERE id = ?`).bind(id).first()
    return c.json({ success: true, data: updated, total })
  } catch (err) {
    const { status, message } = mapDbError(err)
    return c.json({ success: false, error: message }, status as any)
  }
})

// ---------------------------------------------------------------
// DELETE /api/order-items/:id  - remove a line item from a pending order
// ---------------------------------------------------------------
orderItems.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const item = await c.env.DB.prepare(`SELECT * FROM order_items WHERE id = ?`).bind(id).first<any>()
  if (!item) return c.json({ success: false, error: 'Order item not found' }, 404)

  const guard = await assertPendingOrder(c.env.DB, item.order_id)
  if ('error' in guard) return c.json({ success: false, error: guard.error }, guard.status)

  await c.env.DB.prepare(`DELETE FROM order_items WHERE id = ?`).bind(id).run()
  const total = await recalcOrderTotal(c.env.DB, item.order_id)
  return c.json({ success: true, total })
})
