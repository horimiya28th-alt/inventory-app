import type { Bindings } from './types'

/** Generate a human-friendly unique order number, e.g. ORD-20260824-4F92A1 */
export function generateOrderNumber(): string {
  const now = new Date()
  const ymd = now.toISOString().slice(0, 10).replace(/-/g, '')
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase()
  return `ORD-${ymd}-${rand}`
}

/** Recalculate and persist an order's total_amount from its order_items rows. */
export async function recalcOrderTotal(db: D1Database, orderId: number) {
  const row = await db
    .prepare(`SELECT COALESCE(SUM(subtotal), 0) AS total FROM order_items WHERE order_id = ?`)
    .bind(orderId)
    .first<{ total: number }>()
  const total = row?.total ?? 0
  await db
    .prepare(`UPDATE orders SET total_amount = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .bind(total, orderId)
    .run()
  return total
}

/** Translate a raw D1/SQLite error into a friendly {status, message}. */
export function mapDbError(err: unknown): { status: number; message: string } {
  const msg = err instanceof Error ? err.message : String(err)
  if (/UNIQUE constraint failed:\s*(\S+)/i.test(msg)) {
    const m = msg.match(/UNIQUE constraint failed:\s*([^\s]+)/i)
    return { status: 409, message: `Duplicate value violates unique constraint on ${m?.[1] ?? 'field'}` }
  }
  if (/FOREIGN KEY constraint failed/i.test(msg)) {
    return {
      status: 409,
      message:
        'Operation blocked by a foreign key constraint (referenced record is missing, or this record is still referenced by other rows).',
    }
  }
  if (/CHECK constraint failed:\s*(\S+)/i.test(msg)) {
    const m = msg.match(/CHECK constraint failed:\s*([^\s)]+)/i)
    if (m?.[1]?.includes('stock_quantity')) {
      return { status: 409, message: 'Insufficient stock: requested quantity exceeds available inventory.' }
    }
    return { status: 400, message: `Invalid data: violates check constraint (${m?.[1] ?? 'rule'})` }
  }
  if (/NOT NULL constraint failed:\s*(\S+)/i.test(msg)) {
    const m = msg.match(/NOT NULL constraint failed:\s*([^\s]+)/i)
    return { status: 400, message: `Missing required field: ${m?.[1] ?? 'field'}` }
  }
  return { status: 500, message: msg }
}

export function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0
}
