import { Hono } from 'hono'
import type { Bindings } from '../types'
import { isNonEmptyString, mapDbError } from '../helpers'

export const products = new Hono<{ Bindings: Bindings }>()

// ---------------------------------------------------------------
// GET /api/products  - list products. ?active=1 filters for storefront
// ---------------------------------------------------------------
products.get('/', async (c) => {
  const activeOnly = c.req.query('active')
  const stmt = activeOnly
    ? c.env.DB.prepare(`SELECT * FROM products WHERE is_active = 1 ORDER BY name ASC`)
    : c.env.DB.prepare(`SELECT * FROM products ORDER BY created_at DESC`)
  const { results } = await stmt.all()
  return c.json({ success: true, data: results })
})

// ---------------------------------------------------------------
// GET /api/products/:id  - get one product
// ---------------------------------------------------------------
products.get('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const row = await c.env.DB.prepare(`SELECT * FROM products WHERE id = ?`).bind(id).first()
  if (!row) return c.json({ success: false, error: 'Product not found' }, 404)
  return c.json({ success: true, data: row })
})

// ---------------------------------------------------------------
// POST /api/products  - CREATE (admin: add inventory item)
// ---------------------------------------------------------------
products.post('/', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const { sku, name, description, price, stock_quantity, image_url, is_active } = body as Record<
    string,
    unknown
  >

  if (!isNonEmptyString(sku)) return c.json({ success: false, error: 'sku is required' }, 400)
  if (!isNonEmptyString(name)) return c.json({ success: false, error: 'name is required' }, 400)
  if (typeof price !== 'number' || price < 0)
    return c.json({ success: false, error: 'price must be a non-negative number' }, 400)
  const qty = typeof stock_quantity === 'number' ? stock_quantity : 0
  if (qty < 0) return c.json({ success: false, error: 'stock_quantity must be >= 0' }, 400)

  try {
    const result = await c.env.DB.prepare(
      `INSERT INTO products (sku, name, description, price, stock_quantity, image_url, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        sku.trim(),
        name.trim(),
        description ?? null,
        price,
        qty,
        image_url ?? null,
        is_active === 0 ? 0 : 1
      )
      .run()

    const created = await c.env.DB.prepare(`SELECT * FROM products WHERE id = ?`)
      .bind(result.meta.last_row_id)
      .first()
    return c.json({ success: true, data: created }, 201)
  } catch (err) {
    const { status, message } = mapDbError(err)
    return c.json({ success: false, error: message }, status as any)
  }
})

// ---------------------------------------------------------------
// PUT /api/products/:id  - UPDATE product (admin edits, including manual stock adjustments)
// ---------------------------------------------------------------
products.put('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const existing = await c.env.DB.prepare(`SELECT * FROM products WHERE id = ?`).bind(id).first<any>()
  if (!existing) return c.json({ success: false, error: 'Product not found' }, 404)

  const body = await c.req.json().catch(() => ({}))
  const { sku, name, description, price, stock_quantity, image_url, is_active } = body as Record<
    string,
    unknown
  >

  try {
    await c.env.DB.prepare(
      `UPDATE products
       SET sku = ?, name = ?, description = ?, price = ?, stock_quantity = ?, image_url = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    )
      .bind(
        isNonEmptyString(sku) ? sku.trim() : existing.sku,
        isNonEmptyString(name) ? name.trim() : existing.name,
        description !== undefined ? description : existing.description,
        typeof price === 'number' ? price : existing.price,
        typeof stock_quantity === 'number' ? stock_quantity : existing.stock_quantity,
        image_url !== undefined ? image_url : existing.image_url,
        is_active === 0 ? 0 : is_active === 1 ? 1 : existing.is_active,
        id
      )
      .run()

    const updated = await c.env.DB.prepare(`SELECT * FROM products WHERE id = ?`).bind(id).first()
    return c.json({ success: true, data: updated })
  } catch (err) {
    const { status, message } = mapDbError(err)
    return c.json({ success: false, error: message }, status as any)
  }
})

// ---------------------------------------------------------------
// DELETE /api/products/:id  - blocked (RESTRICT) if referenced by order_items.
// Soft-delete alternative: set is_active = 0 (hides from storefront but
// preserves history/foreign keys).
// ---------------------------------------------------------------
products.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const existing = await c.env.DB.prepare(`SELECT * FROM products WHERE id = ?`).bind(id).first()
  if (!existing) return c.json({ success: false, error: 'Product not found' }, 404)

  try {
    await c.env.DB.prepare(`DELETE FROM products WHERE id = ?`).bind(id).run()
    return c.json({ success: true })
  } catch (err) {
    const { status, message } = mapDbError(err)
    return c.json(
      {
        success: false,
        error: `Cannot delete product (it has order history). Consider deactivating it instead. ${message}`,
      },
      status as any
    )
  }
})
