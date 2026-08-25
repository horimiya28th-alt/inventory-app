// ============================================================
// Admin console: CRUD for products, customers; view/manage orders.
// ============================================================
function money(n) {
  return '$' + Number(n).toFixed(2)
}
function showToast(msg, isError) {
  const el = document.getElementById('admin-toast')
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
// Tabs
// ---------------------------------------------------------
document.querySelectorAll('.admin-tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.admin-tab').forEach((t) => {
      t.classList.remove('border-indigo-600', 'text-indigo-600')
      t.classList.add('border-transparent', 'text-gray-500')
    })
    tab.classList.add('border-indigo-600', 'text-indigo-600')
    tab.classList.remove('border-transparent', 'text-gray-500')

    document.querySelectorAll('.admin-panel').forEach((p) => p.classList.add('hidden'))
    document.getElementById(`tab-${tab.dataset.tab}`).classList.remove('hidden')

    if (tab.dataset.tab === 'products') loadProducts()
    if (tab.dataset.tab === 'customers') loadCustomers()
    if (tab.dataset.tab === 'orders') loadOrders()
  })
})

// ---------------------------------------------------------
// Generic modal helpers
// ---------------------------------------------------------
const modalOverlay = document.getElementById('admin-modal-overlay')
const modalTitle = document.getElementById('admin-modal-title')
const modalForm = document.getElementById('admin-modal-form')

function openModal(title, fieldsHtml, onSubmit) {
  modalTitle.textContent = title
  modalForm.innerHTML =
    fieldsHtml +
    `<div class="flex justify-end gap-2 pt-2">
       <button type="button" id="admin-modal-cancel" class="px-4 py-2 text-sm rounded-lg border">Cancel</button>
       <button type="submit" class="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white">Save</button>
     </div>`
  modalOverlay.classList.remove('hidden')
  document.getElementById('admin-modal-cancel').addEventListener('click', closeModal)
  modalForm.onsubmit = async (e) => {
    e.preventDefault()
    await onSubmit(new FormData(modalForm))
  }
}
function closeModal() {
  modalOverlay.classList.add('hidden')
  modalForm.onsubmit = null
}

// ---------------------------------------------------------
// PRODUCTS CRUD
// ---------------------------------------------------------
async function loadProducts() {
  const { data } = await api('get', '/api/products')
  const body = document.getElementById('admin-products-body')
  body.innerHTML = data
    .map(
      (p) => `
    <tr class="border-b">
      <td class="p-3">${p.sku}</td>
      <td class="p-3">${p.name}</td>
      <td class="p-3">${money(p.price)}</td>
      <td class="p-3">${p.stock_quantity}</td>
      <td class="p-3">${p.is_active ? '<span class="badge badge-paid">Active</span>' : '<span class="badge badge-cancelled">Inactive</span>'}</td>
      <td class="p-3 whitespace-nowrap">
        <button class="edit-product text-indigo-600 mr-3" data-id="${p.id}"><i class="fas fa-edit"></i></button>
        <button class="delete-product text-red-500" data-id="${p.id}"><i class="fas fa-trash"></i></button>
      </td>
    </tr>`
    )
    .join('')

  body.querySelectorAll('.edit-product').forEach((btn) =>
    btn.addEventListener('click', () => {
      const p = data.find((x) => x.id === Number(btn.dataset.id))
      openProductForm(p)
    })
  )
  body.querySelectorAll('.delete-product').forEach((btn) =>
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this product? This will fail if it has order history.')) return
      const r = await api('delete', `/api/products/${btn.dataset.id}`).catch(() => null)
      if (r) {
        showToast('Product deleted')
        loadProducts()
      }
    })
  )
}

function openProductForm(p) {
  const isEdit = !!p
  openModal(
    isEdit ? 'Edit Product' : 'Add Product',
    `
    <input required name="sku" placeholder="SKU" value="${p?.sku ?? ''}" class="w-full border rounded-lg px-3 py-2 text-sm" />
    <input required name="name" placeholder="Name" value="${p?.name ?? ''}" class="w-full border rounded-lg px-3 py-2 text-sm" />
    <textarea name="description" placeholder="Description" class="w-full border rounded-lg px-3 py-2 text-sm">${p?.description ?? ''}</textarea>
    <div class="grid grid-cols-2 gap-3">
      <input required type="number" step="0.01" min="0" name="price" placeholder="Price" value="${p?.price ?? ''}" class="w-full border rounded-lg px-3 py-2 text-sm" />
      <input required type="number" min="0" name="stock_quantity" placeholder="Stock Quantity" value="${p?.stock_quantity ?? 0}" class="w-full border rounded-lg px-3 py-2 text-sm" />
    </div>
    <input name="image_url" placeholder="Image URL (optional)" value="${p?.image_url ?? ''}" class="w-full border rounded-lg px-3 py-2 text-sm" />
    <label class="flex items-center gap-2 text-sm">
      <input type="checkbox" name="is_active" ${p?.is_active !== 0 ? 'checked' : ''} /> Active (visible in store)
    </label>
    `,
    async (fd) => {
      const payload = {
        sku: fd.get('sku'),
        name: fd.get('name'),
        description: fd.get('description'),
        price: parseFloat(fd.get('price')),
        stock_quantity: parseInt(fd.get('stock_quantity'), 10),
        image_url: fd.get('image_url'),
        is_active: fd.get('is_active') ? 1 : 0,
      }
      const result = isEdit
        ? await api('put', `/api/products/${p.id}`, payload).catch(() => null)
        : await api('post', '/api/products', payload).catch(() => null)
      if (result) {
        showToast(isEdit ? 'Product updated' : 'Product created')
        closeModal()
        loadProducts()
      }
    }
  )
}
document.getElementById('add-product-btn').addEventListener('click', () => openProductForm(null))

// ---------------------------------------------------------
// CUSTOMERS CRUD
// ---------------------------------------------------------
async function loadCustomers() {
  const { data } = await api('get', '/api/customers')
  const body = document.getElementById('admin-customers-body')
  body.innerHTML = data
    .map(
      (cu) => `
    <tr class="border-b">
      <td class="p-3">${cu.name}</td>
      <td class="p-3">${cu.email}</td>
      <td class="p-3">${cu.phone ?? ''}</td>
      <td class="p-3">${cu.address ?? ''}</td>
      <td class="p-3 whitespace-nowrap">
        <button class="edit-customer text-indigo-600 mr-3" data-id="${cu.id}"><i class="fas fa-edit"></i></button>
        <button class="delete-customer text-red-500" data-id="${cu.id}"><i class="fas fa-trash"></i></button>
      </td>
    </tr>`
    )
    .join('')

  body.querySelectorAll('.edit-customer').forEach((btn) =>
    btn.addEventListener('click', () => {
      const cu = data.find((x) => x.id === Number(btn.dataset.id))
      openCustomerForm(cu)
    })
  )
  body.querySelectorAll('.delete-customer').forEach((btn) =>
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this customer? This will fail if they have any orders.')) return
      const r = await api('delete', `/api/customers/${btn.dataset.id}`).catch(() => null)
      if (r) {
        showToast('Customer deleted')
        loadCustomers()
      }
    })
  )
}

function openCustomerForm(cu) {
  const isEdit = !!cu
  openModal(
    isEdit ? 'Edit Customer' : 'Add Customer',
    `
    <input required name="name" placeholder="Full name" value="${cu?.name ?? ''}" class="w-full border rounded-lg px-3 py-2 text-sm" />
    <input required type="email" name="email" placeholder="Email" value="${cu?.email ?? ''}" class="w-full border rounded-lg px-3 py-2 text-sm" />
    <input name="phone" placeholder="Phone" value="${cu?.phone ?? ''}" class="w-full border rounded-lg px-3 py-2 text-sm" />
    <input name="address" placeholder="Address" value="${cu?.address ?? ''}" class="w-full border rounded-lg px-3 py-2 text-sm" />
    `,
    async (fd) => {
      const payload = Object.fromEntries(fd.entries())
      const result = isEdit
        ? await api('put', `/api/customers/${cu.id}`, payload).catch(() => null)
        : await api('post', '/api/customers', payload).catch(() => null)
      if (result) {
        showToast(isEdit ? 'Customer updated' : 'Customer created')
        closeModal()
        loadCustomers()
      }
    }
  )
}
document.getElementById('add-customer-btn').addEventListener('click', () => openCustomerForm(null))

// ---------------------------------------------------------
// ORDERS (view, checkout/cancel/delete, mark-abandoned)
// ---------------------------------------------------------
async function loadOrders() {
  const status = document.getElementById('order-status-filter').value
  const url = status ? `/api/orders?status=${status}` : '/api/orders'
  const { data } = await api('get', url)
  const body = document.getElementById('admin-orders-body')
  body.innerHTML = data
    .map(
      (o) => `
    <tr class="border-b">
      <td class="p-3">${o.order_number}</td>
      <td class="p-3">${o.customer_name}<br/><span class="text-xs text-gray-400">${o.customer_email}</span></td>
      <td class="p-3"><span class="badge badge-${o.status}">${o.status}</span></td>
      <td class="p-3">${o.item_count}</td>
      <td class="p-3">${money(o.total_amount)}</td>
      <td class="p-3 text-xs text-gray-500">${dayjs(o.created_at).format('MMM D HH:mm')}</td>
      <td class="p-3 whitespace-nowrap space-x-2">
        ${o.status === 'paid' || o.status === 'completed' ? `<a href="/receipt/${o.id}" class="text-indigo-600 text-sm"><i class="fas fa-receipt"></i></a>` : ''}
        ${o.status === 'pending' ? `<button class="cancel-order text-yellow-600" data-id="${o.id}"><i class="fas fa-ban"></i></button>` : ''}
        ${o.status !== 'paid' && o.status !== 'completed' ? `<button class="delete-order text-red-500" data-id="${o.id}"><i class="fas fa-trash"></i></button>` : ''}
      </td>
    </tr>`
    )
    .join('')

  body.querySelectorAll('.cancel-order').forEach((btn) =>
    btn.addEventListener('click', async () => {
      const r = await api('post', `/api/orders/${btn.dataset.id}/cancel`).catch(() => null)
      if (r) {
        showToast('Order cancelled')
        loadOrders()
      }
    })
  )
  body.querySelectorAll('.delete-order').forEach((btn) =>
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this order and its items?')) return
      const r = await api('delete', `/api/orders/${btn.dataset.id}`).catch(() => null)
      if (r) {
        showToast('Order deleted')
        loadOrders()
      }
    })
  )
}
document.getElementById('order-status-filter').addEventListener('change', loadOrders)
document.getElementById('mark-abandoned-btn').addEventListener('click', async () => {
  const r = await api('post', '/api/orders/mark-abandoned').catch(() => null)
  if (r) {
    showToast(`${r.abandoned_count} pending order(s) flagged abandoned`)
    loadOrders()
  }
})

// ---------------------------------------------------------
// Init
// ---------------------------------------------------------
loadProducts()
