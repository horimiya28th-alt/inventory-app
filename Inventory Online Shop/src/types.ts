export type Bindings = {
  DB: D1Database
}

export interface Customer {
  id: number
  name: string
  email: string
  phone?: string | null
  address?: string | null
  created_at: string
  updated_at: string
}

export interface Product {
  id: number
  sku: string
  name: string
  description?: string | null
  price: number
  stock_quantity: number
  image_url?: string | null
  is_active: number
  created_at: string
  updated_at: string
}

export type OrderStatus = 'pending' | 'paid' | 'completed' | 'cancelled' | 'abandoned'

export interface Order {
  id: number
  order_number: string
  customer_id: number
  status: OrderStatus
  total_amount: number
  created_at: string
  updated_at: string
  paid_at?: string | null
}

export interface OrderItem {
  id: number
  order_id: number
  product_id: number
  quantity: number
  unit_price: number
  subtotal: number
  created_at: string
}
