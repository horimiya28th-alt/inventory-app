import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-workers'
import { renderer } from './renderer'
import type { Bindings } from './types'
import { customers } from './routes/customers'
import { products } from './routes/products'
import { orders } from './routes/orders'
import { orderItems } from './routes/orderItems'

const app = new Hono<{ Bindings: Bindings }>()

app.use('/api/*', cors())
app.use('/static/*', serveStatic({ root: './public' }))
app.use(renderer)

// ------------------------------------------------------------------
// API routes
// ------------------------------------------------------------------
app.route('/api/customers', customers)
app.route('/api/products', products)
app.route('/api/orders', orders)
app.route('/api/order-items', orderItems)

app.get('/api/health', (c) => c.json({ success: true, service: 'inventory-store', time: new Date().toISOString() }))

// ------------------------------------------------------------------
// Pages
// ------------------------------------------------------------------
app.get('/', (c) => {
  return c.render(<StorefrontPage />, { title: 'Inventory Store' })
})

app.get('/admin', (c) => {
  return c.render(<AdminPage />, { title: 'Admin · Inventory Store' })
})

app.get('/receipt/:orderId', (c) => {
  return c.render(<ReceiptPage orderId={c.req.param('orderId')} />, { title: 'Receipt · Inventory Store' })
})

function StorefrontPage() {
  return (
    <div id="app">
      <header class="bg-white shadow-sm sticky top-0 z-40">
        <nav id="main-nav" class="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <a href="/" class="text-xl font-bold text-indigo-600">
            <i class="fas fa-store mr-2"></i>Inventory Store
          </a>
          <div class="flex items-center gap-4 text-sm">
            <a href="/admin" class="text-gray-600 hover:text-indigo-600">
              <i class="fas fa-user-shield mr-1"></i>Admin
            </a>
            <button
              id="cart-btn"
              class="relative bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition"
            >
              <i class="fas fa-shopping-cart mr-1"></i>Cart
              <span
                id="cart-count"
                class="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center"
              >
                0
              </span>
            </button>
          </div>
        </nav>
      </header>

      <main class="max-w-6xl mx-auto px-4 py-6">
        <section id="customer-bar" class="bg-white rounded-xl shadow-sm p-4 mb-6 flex flex-wrap items-center gap-3">
          <label class="text-sm font-medium text-gray-600">
            <i class="fas fa-user mr-1"></i>Shopping as:
          </label>
          <select id="customer-select" class="border rounded-lg px-3 py-2 text-sm flex-1 min-w-[220px]"></select>
          <button id="new-customer-btn" class="text-sm text-indigo-600 hover:underline">
            <i class="fas fa-user-plus mr-1"></i>New customer
          </button>
          <a id="view-history-btn" href="#" class="text-sm text-indigo-600 hover:underline ml-auto">
            <i class="fas fa-history mr-1"></i>Order history
          </a>
        </section>

        <section>
          <h2 class="text-2xl font-bold mb-4">Products</h2>
          <div id="product-grid" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5"></div>
        </section>

        <section id="history-section" class="hidden mt-10">
          <h2 class="text-2xl font-bold mb-4">
            <i class="fas fa-history mr-2"></i>Order History
          </h2>
          <div id="history-list" class="bg-white rounded-xl shadow-sm divide-y"></div>
        </section>
      </main>

      {/* Cart Drawer */}
      <div id="cart-overlay" class="hidden fixed inset-0 bg-black/40 z-50"></div>
      <aside
        id="cart-drawer"
        class="fixed top-0 right-0 h-full w-full sm:w-96 bg-white shadow-2xl z-50 translate-x-full transition-transform duration-300 flex flex-col"
      >
        <div class="flex items-center justify-between p-4 border-b">
          <h3 class="text-lg font-bold">
            <i class="fas fa-shopping-cart mr-2"></i>Your Cart
          </h3>
          <button id="close-cart-btn" class="text-gray-400 hover:text-gray-700">
            <i class="fas fa-times text-xl"></i>
          </button>
        </div>
        <div id="cart-items" class="flex-1 overflow-y-auto p-4 space-y-3"></div>
        <div class="border-t p-4 space-y-3">
          <div class="flex justify-between text-lg font-bold">
            <span>Total</span>
            <span id="cart-total">$0.00</span>
          </div>
          <button
            id="checkout-btn"
            class="w-full bg-green-600 text-white py-3 rounded-lg font-semibold hover:bg-green-700 transition disabled:opacity-50"
          >
            <i class="fas fa-credit-card mr-2"></i>Checkout
          </button>
        </div>
      </aside>

      {/* New customer modal */}
      <div id="modal-overlay" class="hidden fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4">
        <div class="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
          <h3 class="text-lg font-bold mb-4">
            <i class="fas fa-user-plus mr-2"></i>New Customer
          </h3>
          <form id="new-customer-form" class="space-y-3">
            <input required name="name" placeholder="Full name" class="w-full border rounded-lg px-3 py-2 text-sm" />
            <input
              required
              type="email"
              name="email"
              placeholder="Email"
              class="w-full border rounded-lg px-3 py-2 text-sm"
            />
            <input name="phone" placeholder="Phone (optional)" class="w-full border rounded-lg px-3 py-2 text-sm" />
            <input
              name="address"
              placeholder="Address (optional)"
              class="w-full border rounded-lg px-3 py-2 text-sm"
            />
            <div class="flex justify-end gap-2 pt-2">
              <button type="button" id="cancel-modal-btn" class="px-4 py-2 text-sm rounded-lg border">
                Cancel
              </button>
              <button type="submit" class="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white">
                Create
              </button>
            </div>
          </form>
        </div>
      </div>

      <div id="toast" class="hidden fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-5 py-3 rounded-lg shadow-lg z-[70]"></div>

      <script src="/static/store.js"></script>
    </div>
  )
}

function AdminPage() {
  return (
    <div id="admin-app">
      <header class="bg-gray-900 text-white">
        <nav class="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <a href="/admin" class="text-xl font-bold">
            <i class="fas fa-user-shield mr-2"></i>Admin Console
          </a>
          <a href="/" class="text-sm text-gray-300 hover:text-white">
            <i class="fas fa-store mr-1"></i>Back to Store
          </a>
        </nav>
      </header>

      <main class="max-w-6xl mx-auto px-4 py-6">
        <div id="admin-tabs" class="flex gap-2 mb-6 border-b overflow-x-auto">
          <button data-tab="products" class="admin-tab px-4 py-2 font-medium border-b-2 border-indigo-600 text-indigo-600">
            <i class="fas fa-boxes mr-1"></i>Products
          </button>
          <button data-tab="customers" class="admin-tab px-4 py-2 font-medium border-b-2 border-transparent text-gray-500">
            <i class="fas fa-users mr-1"></i>Customers
          </button>
          <button data-tab="orders" class="admin-tab px-4 py-2 font-medium border-b-2 border-transparent text-gray-500">
            <i class="fas fa-receipt mr-1"></i>Orders
          </button>
        </div>

        <section id="tab-products" class="admin-panel">
          <div class="flex justify-between items-center mb-4">
            <h2 class="text-xl font-bold">Products (Inventory)</h2>
            <button id="add-product-btn" class="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm">
              <i class="fas fa-plus mr-1"></i>Add Product
            </button>
          </div>
          <div class="bg-white rounded-xl shadow-sm overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="bg-gray-100 text-gray-600 text-left">
                <tr>
                  <th class="p-3">SKU</th>
                  <th class="p-3">Name</th>
                  <th class="p-3">Price</th>
                  <th class="p-3">Stock</th>
                  <th class="p-3">Active</th>
                  <th class="p-3">Actions</th>
                </tr>
              </thead>
              <tbody id="admin-products-body"></tbody>
            </table>
          </div>
        </section>

        <section id="tab-customers" class="admin-panel hidden">
          <div class="flex justify-between items-center mb-4">
            <h2 class="text-xl font-bold">Customers</h2>
            <button id="add-customer-btn" class="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm">
              <i class="fas fa-plus mr-1"></i>Add Customer
            </button>
          </div>
          <div class="bg-white rounded-xl shadow-sm overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="bg-gray-100 text-gray-600 text-left">
                <tr>
                  <th class="p-3">Name</th>
                  <th class="p-3">Email</th>
                  <th class="p-3">Phone</th>
                  <th class="p-3">Address</th>
                  <th class="p-3">Actions</th>
                </tr>
              </thead>
              <tbody id="admin-customers-body"></tbody>
            </table>
          </div>
        </section>

        <section id="tab-orders" class="admin-panel hidden">
          <div class="flex justify-between items-center mb-4 flex-wrap gap-2">
            <h2 class="text-xl font-bold">Orders</h2>
            <div class="flex items-center gap-2">
              <select id="order-status-filter" class="border rounded-lg px-3 py-2 text-sm">
                <option value="">All statuses</option>
                <option value="pending">Pending</option>
                <option value="paid">Paid</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
                <option value="abandoned">Abandoned</option>
              </select>
              <button id="mark-abandoned-btn" class="bg-yellow-500 text-white px-3 py-2 rounded-lg text-sm">
                <i class="fas fa-broom mr-1"></i>Flag Abandoned Carts
              </button>
            </div>
          </div>
          <div class="bg-white rounded-xl shadow-sm overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="bg-gray-100 text-gray-600 text-left">
                <tr>
                  <th class="p-3">Order #</th>
                  <th class="p-3">Customer</th>
                  <th class="p-3">Status</th>
                  <th class="p-3">Items</th>
                  <th class="p-3">Total</th>
                  <th class="p-3">Created</th>
                  <th class="p-3">Actions</th>
                </tr>
              </thead>
              <tbody id="admin-orders-body"></tbody>
            </table>
          </div>
        </section>
      </main>

      {/* Generic modal for product/customer forms */}
      <div id="admin-modal-overlay" class="hidden fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4">
        <div class="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6">
          <h3 id="admin-modal-title" class="text-lg font-bold mb-4">Form</h3>
          <form id="admin-modal-form" class="space-y-3"></form>
        </div>
      </div>

      <div id="admin-toast" class="hidden fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-5 py-3 rounded-lg shadow-lg z-[70]"></div>

      <script src="/static/admin.js"></script>
    </div>
  )
}

function ReceiptPage({ orderId }: { orderId: string }) {
  return (
    <div id="receipt-app" class="max-w-2xl mx-auto px-4 py-10" data-order-id={orderId}>
      <div class="text-center mb-6 print:hidden">
        <a href="/" class="text-indigo-600 hover:underline text-sm">
          <i class="fas fa-arrow-left mr-1"></i>Back to store
        </a>
      </div>
      <div id="receipt-card" class="bg-white rounded-xl shadow-lg p-8">
        <p class="text-center text-gray-400">Loading receipt…</p>
      </div>
      <div class="text-center mt-6 print:hidden">
        <button onclick="window.print()" class="bg-gray-800 text-white px-5 py-2 rounded-lg text-sm">
          <i class="fas fa-print mr-2"></i>Print Receipt
        </button>
      </div>
      <script src="/static/receipt.js"></script>
    </div>
  )
}

export default app
