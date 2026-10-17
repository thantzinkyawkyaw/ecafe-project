/* ================================
   CONFIG
================================ */
const API_URL = window.location.origin;
const REFRESH_INTERVAL_MS = 10000; // 10 seconds

/* ================================
   AUTH CHECK
================================ */
const authToken = localStorage.getItem("authToken");
const loggedInUser = JSON.parse(localStorage.getItem("loggedInUser") || "null");

if (
  !authToken ||
  !loggedInUser ||
  (loggedInUser.role !== "kitchen" && loggedInUser.role !== "admin")
) {
  alert("Kitchen access required. Please login.");
  window.location.href = "login.html";
}

/* ================================
   HELPERS
================================ */
function authHeaders() {
  return {
    "Content-Type": "application/json",
    Authorization: "Bearer " + authToken,
  };
}

async function apiGet(path) {
  const response = await fetch(API_URL + path, { headers: authHeaders() });

  if (response.status === 401 || response.status === 403) {
    alert("Session expired. Please login again.");
    localStorage.removeItem("authToken");
    localStorage.removeItem("loggedInUser");
    window.location.href = "login.html";
    return null;
  }

  return response.json();
}

function showToast(message, isError) {
  const toast = document.getElementById("kitchenToast");
  toast.textContent = message;
  toast.className = "kitchen-toast" + (isError ? " error" : "");
  toast.style.display = "block";

  setTimeout(function () {
    toast.style.display = "none";
  }, 2500);
}

/* ================================
   STATUS → UI MAPPING
================================ */
const STATUS_ACTIONS = {
  Pending: [
    { label: "✅ Accept", status: "Accepted", cls: "btn-accept" },
    { label: "✕ Cancel", status: "Cancelled", cls: "btn-cancel" },
  ],
  Accepted: [
    { label: "🔥 Start Preparing", status: "Preparing", cls: "btn-prepare" },
    { label: "✕ Cancel", status: "Cancelled", cls: "btn-cancel" },
  ],
  Preparing: [
    { label: "🔔 Mark Ready", status: "Ready", cls: "btn-ready" },
    { label: "✕ Cancel", status: "Cancelled", cls: "btn-cancel" },
  ],
  Ready: [{ label: "✔ Complete", status: "Completed", cls: "btn-complete" }],
};

/* ================================
   INIT
================================ */
document.addEventListener("DOMContentLoaded", function () {
  document.getElementById("kitchenUserName").textContent = loggedInUser.name;

  document
    .getElementById("kitchenLogoutBtn")
    .addEventListener("click", async function () {
        if (!confirm("Logout from kitchen?")) return;

        const token = localStorage.getItem("authToken");

        // Local မှာ ချက်ချင်း ဖျက်မယ်
        localStorage.removeItem("authToken");
        localStorage.removeItem("loggedInUser");

        // Backend ကို အသိပေးမယ် (Token Revoke လုပ်ဖို့)
        if (token) {
            try {
                await fetch(API_URL + "/api/logout", {
                    method: "POST",
                    headers: { "Authorization": "Bearer " + token }
                });
            } catch (e) {
                console.log("Logout API failed, but local clear succeeded.");
            }
        }

        window.location.href = "login.html";
    });

  document
    .getElementById("kitchenRefreshBtn")
    .addEventListener("click", function () {
      loadKitchenOrders();
      showToast("Refreshed");
    });

  // Initial load
  loadKitchenOrders();

  // Auto-refresh
  setInterval(loadKitchenOrders, REFRESH_INTERVAL_MS);
});

/* ================================
   LOAD ORDERS
================================ */
async function loadKitchenOrders() {
  const orders = await apiGet("/api/kitchen/orders");

  if (!orders) return;

  renderColumns(orders);
}

/* ================================
   RENDER COLUMNS
================================ */
function renderColumns(orders) {
  const grouped = {
    Pending: [],
    Accepted: [],
    Preparing: [],
    Ready: [],
  };

  orders.forEach(function (o) {
    if (grouped[o.status]) {
      grouped[o.status].push(o);
    }
  });

  renderColumn("Pending", grouped.Pending, "colPending", "countPending");
  renderColumn("Accepted", grouped.Accepted, "colAccepted", "countAccepted");
  renderColumn(
    "Preparing",
    grouped.Preparing,
    "colPreparing",
    "countPreparing",
  );
  renderColumn("Ready", grouped.Ready, "colReady", "countReady");
}
function renderColumn(status, orders, containerId, countId) {
  const container = document.getElementById(containerId);
  const countEl = document.getElementById(countId);

  countEl.textContent = orders.length;

  if (orders.length === 0) {
    container.innerHTML = `<div class="kitchen-empty">No orders</div>`;
    return;
  }

  container.innerHTML = orders.map(buildCard).join("");

  // Attach action listeners
  container.querySelectorAll("[data-action-status]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      const orderId = Number(btn.dataset.orderId);
      const newStatus = btn.dataset.actionStatus;

      if (newStatus === "Cancelled") {
        if (!confirm(`Cancel Order #${orderId}?`)) return;
      }

      updateOrderStatus(orderId, newStatus, btn);
    });
  });
}

function buildCard(order) {
  const actions = STATUS_ACTIONS[order.status] || [];

  const actionsHtml = actions
    .map(function (a) {
      return `<button
                    class="kitchen-action-btn ${a.cls}"
                    data-order-id="${order.id}"
                    data-action-status="${a.status}"
                >${a.label}</button>`;
    })
    .join("");

  // Location info
  let locationHtml = "";

  if (order.order_type === "dine-in") {
    locationHtml = `<span class="kitchen-card-info dine-in">🍽️ Table ${order.table_number || "?"}</span>`;
  } else if (order.order_type === "delivery") {
    locationHtml = `<span class="kitchen-card-info delivery">🚚 Delivery — ${order.customer_name || ""}</span>`;
  } else {
    locationHtml = `<span class="kitchen-card-info">🥡 Takeaway</span>`;
  }

  const itemsHtml = order.items
    .map(function (item) {
      return `<li>
                    <span class="qty">${item.quantity}×</span>
                    <span class="name">${item.food_name}</span>
                </li>`;
    })
    .join("");

  const time = order.created_at
    ? order.created_at.replace("T", " ").slice(11, 16)
    : "";

  return `<div class="kitchen-card">
            <div class="kitchen-card-header">
                <div>
                    <div class="kitchen-card-title">#${order.id}</div>
                    <div class="kitchen-card-type">${order.order_type}</div>
                </div>
                <div style="color:#94a3b8; font-size:13px;">${time}</div>
            </div>

            <div>${locationHtml}</div>

            <ul class="kitchen-card-items">
                ${itemsHtml || '<li style="color:#94a3b8;">No items</li>'}
            </ul>

            <div class="kitchen-card-actions">
                ${actionsHtml}
            </div>
        </div>`;
}

/* ================================
   UPDATE STATUS
================================ */
async function updateOrderStatus(orderId, newStatus, btn) {
  if (btn) btn.disabled = true;

  try {
    const response = await fetch(
      `${API_URL}/api/kitchen/orders/${orderId}/status`,
      {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ status: newStatus }),
      },
    );

    const data = await response.json();

    if (!response.ok) {
      showToast(data.message || "Failed to update.", true);
      if (btn) btn.disabled = false;
      return;
    }

    showToast(`Order #${orderId} → ${newStatus}`);

    // Reload orders immediately
    loadKitchenOrders();
  } catch (error) {
    console.error(error);
    showToast("Cannot connect to server.", true);
    if (btn) btn.disabled = false;
  }
}
