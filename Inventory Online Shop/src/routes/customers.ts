import { Hono } from 'hono'
import type { Bindings } from '../types'
import { isNonEmptyString, mapDbError } from '../helpers'

export const customers = new Hono<{ Bindings: Bindings }>()

// ---------------------------------------------------------------
// GET /api/customers  - list customers (SELECT)
// ---------------------------------------------------------------
customers.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM customers ORDER BY created_at DESC`
  ).all()
  return c.json({ success: true, data: results })
})

// ---------------------------------------------------------------
// GET /api/customers/:id  - get one customer
// ---------------------------------------------------------------
customers.get('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const row = await c.env.DB.prepare(`SELECT * FROM customers WHERE id = ?`).bind(id).first()
  if (!row) return c.json({ success: false, error: 'Customer not found' }, 404)
  return c.json({ success: true, data: row })
})

// ---------------------------------------------------------------
// GET /api/customers/:id/orders  - SELECT order history for the customer
// ---------------------------------------------------------------
customers.get('/:id/orders', async (c) => {
  const id = Number(c.req.param('id'))
  const customer = await c.env.DB.prepare(`SELECT id FROM customers WHERE id = ?`).bind(id).first()
  if (!customer) return c.json({ success: false, error: 'Customer not found' }, 404)

  const { results } = await c.env.DB.prepare(
    `SELECT o.*,
            (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) AS item_count
     FROM orders o
     WHERE o.customer_id = ?
     ORDER BY o.created_at DESC`
  )
    .bind(id)
    .all()
  return c.json({ success: true, data: results })
})

// ---------------------------------------------------------------
// POST /api/customers  - INSERT a customer
// ---------------------------------------------------------------
customers.post('/', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const { name, email, phone, address } = body as Record<string, unknown>

  if (!isNonEmptyString(name)) return c.json({ success: false, error: 'name is required' }, 400)
  if (!isNonEmptyString(email)) return c.json({ success: false, error: 'email is required' }, 400)

  try {
    const result = await c.env.DB.prepare(
      `INSERT INTO customers (name, email, phone, address) VALUES (?, ?, ?, ?)`
    )
      .bind(name.trim(), (email as string).trim().toLowerCase(), phone ?? null, address ?? null)
      .run()

    const created = await c.env.DB.prepare(`SELECT * FROM customers WHERE id = ?`)
      .bind(result.meta.last_row_id)
      .first()
    return c.json({ success: true, data: created }, 201)
  } catch (err) {
    const { status, message } = mapDbError(err)
    return c.json({ success: false, error: message }, status as any)
  }
})

// ---------------------------------------------------------------
// PUT /api/customers/:id  - UPDATE a customer
// ---------------------------------------------------------------
customers.put('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json().catch(() => ({}))
  const { name, email, phone, address } = body as Record<string, unknown>

  const existing = await c.env.DB.prepare(`SELECT * FROM customers WHERE id = ?`).bind(id).first()
  if (!existing) return c.json({ success: false, error: 'Customer not found' }, 404)

  try {
    await c.env.DB.prepare(
      `UPDATE customers SET name = ?, email = ?, phone = ?, address = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    )
      .bind(
        isNonEmptyString(name) ? name.trim() : existing.name,
        isNonEmptyString(email) ? (email as string).trim().toLowerCase() : existing.email,
        phone !== undefined ? phone : existing.phone,
        address !== undefined ? address : existing.address,
        id
      )
      .run()

    const updated = await c.env.DB.prepare(`SELECT * FROM customers WHERE id = ?`).bind(id).first()
    return c.json({ success: true, data: updated })
  } catch (err) {
    const { status, message } = mapDbError(err)
    return c.json({ success: false, error: message }, status as any)
  }
})

// ---------------------------------------------------------------
// DELETE /api/customers/:id  - blocked (RESTRICT) if the customer has orders
// ---------------------------------------------------------------
customers.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const existing = await c.env.DB.prepare(`SELECT * FROM customers WHERE id = ?`).bind(id).first()
  if (!existing) return c.json({ success: false, error: 'Customer not found' }, 404)

  try {
    await c.env.DB.prepare(`DELETE FROM customers WHERE id = ?`).bind(id).run()
    return c.json({ success: true })
  } catch (err) {
    const { status, message } = mapDbError(err)
    return c.json(
      {
        success: false,
        error: `Cannot delete customer: ${message}`,
      },
      status as any
    )
  }
})
