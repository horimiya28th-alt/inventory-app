// ============================================================
// Storefront logic: browse products, manage cart, checkout,
// view order history for the selected customer.
// ============================================================
const state = {
  customers: [],
  products: [],
  currentCustomerId: null,
  currentOrderId: null, // pending order id acting as the "cart" on the server
  cartItems: [], // [{product_id, name, price, quantity, order_item_id}]
}

function money(n) {
  return '$' + Number(n).toFixed(2)
}

function showToast(msg, isError) {
  const el = document.getElementById('toast')
  el.textContent = msg
  el.classList.remove('hidden')
  el.style.background = isError ? '#dc2626' : '#111827'
  clearTimeout(window.__toastTimer)
  window.__toastTimer = setTimeout(() => el.classList.add('hidden'), 3000)
}

async function api(method, url, body) {
  try {
    const res = await axios({ method, url, data: body })
    return res.data
  } catch (err) {
    const msg = err.response?.data?.error || err.message
    showToast(msg, true)
    throw err
  }
}

// ---------------------------------------------------------
// Customers
// ---------------------------------------------------------
async function loadCustomers() {
  const { data } = await api('get', '/api/customers')
  state.customers = data
  const sel = document.getElementById('customer-select')
  sel.innerHTML = data.map((c) => `<option value="${c.id}">${c.name} (${c.email})</option>`).join('')
  if (data.length) {
    state.currentCustomerId = Number(sel.value)
  }
}

document.getElementById('customer-select').addEventListener('change', (e) => {
  state.currentCustomerId = Number(e.target.value)
  state.currentOrderId = null
  state.cartItems = []
  renderCart()
  document.getElementById('history-section').classList.add('hidden')
})

document.getElementById('new-customer-btn').addEventListener('click', () => {
  document.getElementById('modal-overlay').classList.remove('hidden')
})
document.getElementById('cancel-modal-btn').addEventListener('click', () => {
  document.getElementById('modal-overlay').classList.add('hidden')
})
document.getElementById('new-customer-form').addEventListener('submit', async (e) => {
  e.preventDefault()
  const form = new FormData(e.target)
  const payload = Object.fromEntries(form.entries())
  const result = await api('post', '/api/customers', payload).catch(() => null)
  if (result) {
    showToast('Customer created!')
    document.getElementById('modal-overlay').classList.add('hidden')
    e.target.reset()
    await loadCustomers()
    document.getElementById('customer-select').value = String(result.data.id)
    state.currentCustomerId = result.data.id
  }
})

// ---------------------------------------------------------
// Products
// ---------------------------------------------------------
async function loadProducts() {
  const { data } = await api('get', '/api/products?active=1')
  state.products = data
  const grid = document.getElementById('product-grid')
  grid.innerHTML = data
    .map(
      (p) => `
    <div class="product-card bg-white rounded-xl shadow-sm overflow-hidden flex flex-col">
      <img src="${p.image_url || 'https://picsum.photos/seed/' + p.id + '/400/300'}" alt="${p.name}" />
      <div class="p-4 flex-1 flex flex-col">
        <h3 class="font-semibold">${p.name}</h3>
        <p class="text-xs text-gray-500 mb-2 line-clamp-2">${p.description || ''}</p>
        <div class="mt-auto flex items-center justify-between">
          <span class="font-bold text-indigo-600">${money(p.price)}</span>
          <span class="text-xs ${p.stock_quantity > 0 ? 'text-green-600' : 'text-red-500'}">
            ${p.stock_quantity > 0 ? p.stock_quantity + ' in stock' : 'Out of stock'}
          </span>
        </div>
        <button
          class="add-to-cart-btn mt-3 w-full bg-indigo-600 text-white py-2 rounded-lg text-sm disabled:opacity-40"
          data-id="${p.id}" ${p.stock_quantity <= 0 ? 'disabled' : ''}>
          <i class="fas fa-cart-plus mr-1"></i>Add to Cart
        </button>
      </div>
    </div>`
    )
    .join('')

  grid.querySelectorAll('.add-to-cart-btn').forEach((btn) => {
    btn.addEventListener('click', () => addToCart(Number(btn.dataset.id)))
  })
}

// ---------------------------------------------------------
// Cart / Pending Order
// ---------------------------------------------------------
async function ensurePendingOrder() {
  if (!state.currentCustomerId) {
    showToast('Please select or create a customer first', true)
    return null
  }
  if (state.currentOrderId) return state.currentOrderId
  return null
}

async function addToCart(productId) {
  if (!state.currentCustomerId) {
    showToast('Please select or create a customer first', true)
    return
  }
  const product = state.products.find((p) => p.id === productId)
  if (!product) return

  if (!state.currentOrderId) {
    // INSERT a new pending order (cart) for this customer
    const result = await api('post', '/api/orders', {
      customer_id: state.currentCustomerId,
      items: [{ product_id: productId, quantity: 1 }],
    }).catch(() => null)
    if (!result) return
    state.currentOrderId = result.data.id
  } else {
    const result = await api('post', '/api/order-items', {
      order_id: state.currentOrderId,
      product_id: productId,
      quantity: 1,
    }).catch(() => null)
    if (!result) return
  }
  await refreshCartFromServer()
  showToast(`${product.name} added to cart`)
  openCart()
}

async function refreshCartFromServer() {
  if (!state.currentOrderId) {
    state.cartItems = []
    renderCart()
    return
  }
  const { data } = await api('get', `/api/order-items?order_id=${state.currentOrderId}`)
  state.cartItems = data.map((it) => ({
    order_item_id: it.id,
    product_id: it.product_id,
    name: it.product_name,
    price: it.unit_price,
    quantity: it.quantity,
    subtotal: it.subtotal,
  }))
  renderCart()
}

function renderCart() {
  const container = document.getElementById('cart-items')
  const countEl = document.getElementById('cart-count')
  const totalEl = document.getElementById('cart-total')

  countEl.textContent = state.cartItems.reduce((s, i) => s + i.quantity, 0)
  const total = state.cartItems.reduce((s, i) => s + i.subtotal, 0)
  totalEl.textContent = money(total)

  if (state.cartItems.length === 0) {
    container.innerHTML = '<p class="text-gray-400 text-center mt-10">Your cart is empty</p>'
    document.getElementById('checkout-btn').disabled = true
    return
  }
  document.getElementById('checkout-btn').disabled = false

  container.innerHTML = state.cartItems
    .map(
      (it) => `
    <div class="flex items-center justify-between border-b pb-2">
      <div class="flex-1">
        <p class="text-sm font-medium">${it.name}</p>
        <p class="text-xs text-gray-500">${money(it.price)} x ${it.quantity} = ${money(it.subtotal)}</p>
      </div>
      <div class="flex items-center gap-1">
        <button class="qty-btn w-7 h-7 rounded bg-gray-100" data-id="${it.order_item_id}" data-delta="-1">-</button>
        <span class="w-6 text-center text-sm">${it.quantity}</span>
        <button class="qty-btn w-7 h-7 rounded bg-gray-100" data-id="${it.order_item_id}" data-delta="1">+</button>
        <button class="remove-btn w-7 h-7 rounded bg-red-50 text-red-500" data-id="${it.order_item_id}">
          <i class="fas fa-trash text-xs"></i>
        </button>
      </div>
    </div>`
    )
    .join('')

  container.querySelectorAll('.qty-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = Number(btn.dataset.id)
      const delta = Number(btn.dataset.delta)
      const item = state.cartItems.find((i) => i.order_item_id === id)
      const newQty = item.quantity + delta
      if (newQty <= 0) {
        await api('delete', `/api/order-items/${id}`).catch(() => null)
      } else {
        await api('put', `/api/order-items/${id}`, { quantity: newQty }).catch(() => null)
      }
      await refreshCartFromServer()
    })
  })
  container.querySelectorAll('.remove-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await api('delete', `/api/order-items/${btn.dataset.id}`).catch(() => null)
      await refreshCartFromServer()
    })
  })
}

document.getElementById('cart-btn').addEventListener('click', openCart)
document.getElementById('close-cart-btn').addEventListener('click', closeCart)
document.getElementById('cart-overlay').addEventListener('click', closeCart)

function openCart() {
  document.getElementById('cart-drawer').classList.add('open')
  document.getElementById('cart-overlay').classList.remove('hidden')
}
function closeCart() {
  document.getElementById('cart-drawer').classList.remove('open')
  document.getElementById('cart-overlay').classList.add('hidden')
}

document.getElementById('checkout-btn').addEventListener('click', async () => {
  if (!state.currentOrderId) return
  const result = await api('post', `/api/orders/${state.currentOrderId}/checkout`).catch(() => null)
  if (!result) return
  showToast('Order placed! Redirecting to receipt…')
  const orderId = state.currentOrderId
  state.currentOrderId = null
  state.cartItems = []
  renderCart()
  closeCart()
  await loadProducts() // refresh stock numbers
  setTimeout(() => {
    window.location.href = `/receipt/${orderId}`
  }, 600)
})

// ---------------------------------------------------------
// Order history
// ---------------------------------------------------------
document.getElementById('view-history-btn').addEventListener('click', async (e) => {
  e.preventDefault()
  if (!state.currentCustomerId) {
    showToast('Select a customer first', true)
    return
  }
  const { data } = await api('get', `/api/customers/${state.currentCustomerId}/orders`)
  const section = document.getElementById('history-section')
  const list = document.getElementById('history-list')
  section.classList.remove('hidden')
  section.scrollIntoView({ behavior: 'smooth' })

  if (data.length === 0) {
    list.innerHTML = '<p class="p-4 text-gray-400">No orders yet.</p>'
    return
  }

  list.innerHTML = data
    .map(
      (o) => `
    <div class="p-4 flex items-center justify-between flex-wrap gap-2">
      <div>
        <p class="font-medium">${o.order_number}</p>
        <p class="text-xs text-gray-500">${dayjs(o.created_at).format('MMM D, YYYY HH:mm')} · ${o.item_count} item(s)</p>
      </div>
      <div class="flex items-center gap-3">
        <span class="badge badge-${o.status}">${o.status}</span>
        <span class="font-semibold">${money(o.total_amount)}</span>
        ${
          o.status === 'paid' || o.status === 'completed'
            ? `<a href="/receipt/${o.id}" class="text-indigo-600 text-sm hover:underline">View Receipt</a>`
            : ''
        }
      </div>
    </div>`
    )
    .join('')
})

// ---------------------------------------------------------
// Init
// ---------------------------------------------------------
;(async function init() {
  await loadCustomers()
  await loadProducts()
  renderCart()
})()
