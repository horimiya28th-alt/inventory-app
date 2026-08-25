// ============================================================
// Receipt page: fetches an order + its items + customer and
// renders a printable receipt totalling the purchase.
// ============================================================
function money(n) {
  return '$' + Number(n).toFixed(2)
}

async function loadReceipt() {
  const root = document.getElementById('receipt-app')
  const orderId = root.dataset.orderId
  const card = document.getElementById('receipt-card')

  try {
    const res = await axios.get(`/api/orders/${orderId}`)
    const { order, customer, items } = res.data.data

    const rows = items
      .map(
        (it) => `
      <tr class="border-b">
        <td class="py-2">${it.product_name} <span class="text-gray-400 text-xs">(${it.product_sku})</span></td>
        <td class="py-2 text-center">${it.quantity}</td>
        <td class="py-2 text-right">${money(it.unit_price)}</td>
        <td class="py-2 text-right font-medium">${money(it.subtotal)}</td>
      </tr>`
      )
      .join('')

    card.innerHTML = `
      <div class="text-center mb-6">
        <h1 class="text-2xl font-bold"><i class="fas fa-receipt mr-2"></i>Receipt</h1>
        <p class="text-gray-500 text-sm">${order.order_number}</p>
        <span class="badge badge-${order.status} mt-2 inline-block">${order.status}</span>
      </div>
      <div class="grid grid-cols-2 gap-4 text-sm mb-6">
        <div>
          <p class="text-gray-400">Billed To</p>
          <p class="font-medium">${customer.name}</p>
          <p>${customer.email}</p>
          ${customer.phone ? `<p>${customer.phone}</p>` : ''}
          ${customer.address ? `<p>${customer.address}</p>` : ''}
        </div>
        <div class="text-right">
          <p class="text-gray-400">Date</p>
          <p class="font-medium">${dayjs(order.paid_at || order.created_at).format('MMM D, YYYY HH:mm')}</p>
        </div>
      </div>
      <table class="w-full text-sm mb-4">
        <thead>
          <tr class="border-b text-gray-500 text-left">
            <th class="py-2">Item</th>
            <th class="py-2 text-center">Qty</th>
            <th class="py-2 text-right">Unit Price</th>
            <th class="py-2 text-right">Subtotal</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="flex justify-end">
        <div class="w-56">
          <div class="flex justify-between py-2 border-t text-lg font-bold">
            <span>Total</span>
            <span>${money(order.total_amount)}</span>
          </div>
        </div>
      </div>
      <p class="text-center text-xs text-gray-400 mt-8">Thank you for shopping with Inventory Store!</p>
    `
  } catch (err) {
    card.innerHTML = `<p class="text-center text-red-500">Could not load receipt: ${
      err.response?.data?.error || err.message
    }</p>`
  }
}

loadReceipt()
