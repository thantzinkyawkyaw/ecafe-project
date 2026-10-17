/* ================================
   CONFIG
================================ */
const API_URL = window.location.origin;

/* ================================
   AUTH CHECK
================================ */
const authToken = localStorage.getItem("authToken");
const loggedInUser = JSON.parse(localStorage.getItem("loggedInUser") || "null");

if (!authToken || !loggedInUser || loggedInUser.role !== "admin") {
  alert("Admin access required. Please login as admin.");
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
  const response = await fetch(API_URL + path, {
    headers: authHeaders(),
  });

  if (response.status === 401 || response.status === 403) {
    alert("Session expired. Please login again.");
    localStorage.removeItem("authToken");
    localStorage.removeItem("loggedInUser");
    window.location.href = "login.html";
    return null;
  }

  return response.json();
}

/* ================================
   INIT
================================ */
document.addEventListener("DOMContentLoaded", function () {
  // Admin name ပြ
  const adminNameEl = document.getElementById("adminUserName");
  if (adminNameEl && loggedInUser) {
    adminNameEl.textContent = loggedInUser.name;
  }

  // Logout
  const logoutBtn = document.getElementById("adminLogoutBtn");
if (logoutBtn) {
    logoutBtn.addEventListener("click", async function () {
        if (!confirm("Logout from admin panel?")) return;

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
}

  // Sidebar navigation
  const navLinks = document.querySelectorAll(".admin-nav-link");
  navLinks.forEach(function (link) {
    link.addEventListener("click", function (event) {
      event.preventDefault();

      navLinks.forEach(function (l) {
        l.classList.remove("active");
      });
      link.classList.add("active");

      const section = link.dataset.section;
      loadSection(section);
    });
  });

  // Default: Dashboard
  loadSection("dashboard");
});

/* ================================
   SECTION ROUTER
================================ */
function loadSection(section) {
  const title = document.getElementById("adminPageTitle");
  const content = document.getElementById("adminContent");

  const titles = {
    dashboard: "Dashboard",
    foods: "Foods",
    categories: "Categories",
    orders: "Orders",
    customers: "Customers",
    tables: "Tables",
    payments: "Payments",
  };

  title.textContent = titles[section] || section;

  if (section === "dashboard") {
    renderDashboard(content);
  } else if (section === "foods") {
    renderFoods(content);
  } else if (section === "categories") {
    renderCategories(content);
  } else if (section === "orders") {
    renderOrders(content);
  } else if (section === "customers") {
    renderCustomers(content);
  } else if (section === "tables") {
    renderTables(content);
  } else if (section === "payments") {
    renderPayments(content);
  } else {
    renderPlaceholder(content, titles[section]);
  }
}

function renderPlaceholder(container, name) {
  container.innerHTML = `
    <div class="admin-placeholder">
      <h2>${name}</h2>
      <p>This section will be implemented in a later step.</p>
    </div>`;
}

/* ================================
   DASHBOARD
================================ */
async function renderDashboard(container) {
  container.innerHTML = `<div class="admin-loading">Loading dashboard...</div>`;

  const data = await apiGet("/api/admin/dashboard");

  if (!data) return;

  if (data.message) {
    container.innerHTML = `<div class="admin-placeholder">
        <p>${data.message}</p>
      </div>`;
    return;
  }

  container.innerHTML = `
        <div class="stat-grid">

            <div class="stat-card stat-info">
                <h3>Today's Orders</h3>
                <div class="stat-value">${data.today_orders}</div>
            </div>
            <div class="stat-card stat-success">
                <h3>Today's Revenue</h3>
                <div class="stat-value">$${Number(data.today_revenue).toFixed(2)}</div>
            </div>

            <div class="stat-card stat-warning">
                <h3>Pending Orders</h3>
                <div class="stat-value">${data.pending_orders}</div>
            </div>

            <div class="stat-card stat-danger">
                <h3>Pending Payments</h3>
                <div class="stat-value">${data.pending_payments}</div>
            </div>

            <div class="stat-card">
                <h3>Total Customers</h3>
                <div class="stat-value">${data.total_customers}</div>
            </div>

            <div class="stat-card">
                <h3>Total Foods</h3>
                <div class="stat-value">${data.total_foods}</div>
            </div>

            <div class="stat-card stat-success">
                <h3>Paid Revenue (All Time)</h3>
                <div class="stat-value">$${Number(data.paid_revenue).toFixed(2)}</div>
            </div>

        </div>
    `;
}
/* ================================
   MODAL HELPERS
================================ */
function openModal(title, bodyHtml) {
  const modal = document.getElementById("adminModal");
  document.getElementById("adminModalTitle").textContent = title;
  document.getElementById("adminModalBody").innerHTML = bodyHtml;
  modal.style.display = "flex";
}

function closeModal() {
  document.getElementById("adminModal").style.display = "none";
}

document.addEventListener("DOMContentLoaded", function () {
  const closeBtn = document.getElementById("adminModalClose");
  if (closeBtn) closeBtn.addEventListener("click", closeModal);

  const overlay = document.getElementById("adminModal");
  if (overlay) {
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) closeModal();
    });
  }
});

/* ================================
   FOODS SECTION
================================ */
async function renderFoods(container) {
  container.innerHTML = `<div class="admin-loading">Loading foods...</div>`;

  const [foods, categories] = await Promise.all([
    apiGet("/api/foods"),
    apiGet("/api/categories"),
  ]);

  if (!foods || !categories) return;

  let rowsHtml = "";

  if (foods.length === 0) {
    rowsHtml = `<tr><td colspan="6" class="admin-empty">No foods yet.</td></tr>`;
  } else {
    foods.forEach(function (food) {
      const img = food.image
        ? `<img src="${food.image}" class="food-thumb" onerror="this.style.display='none'">`
        : `<div class="food-thumb"></div>`;

      const status = food.is_available
        ? `<span class="badge badge-success">Available</span>`
        : `<span class="badge badge-danger">Sold Out</span>`;

      rowsHtml += `<tr>
                    <td>${img}</td>
                    <td><strong>${food.name}</strong><br><small style="color:#94a3b8">${food.category_name}</small></td>
                    <td>$${Number(food.price).toFixed(2)}</td>
                    <td>${status}</td>
                    <td>${food.id}</td>
                    <td>
                        <button class="admin-btn admin-btn-secondary admin-btn-sm" data-action="toggle" data-id="${food.id}" data-avail="${food.is_available}">
                            ${food.is_available ? "Mark Sold Out" : "Mark Available"}
                        </button>
                        <button class="admin-btn admin-btn-primary admin-btn-sm" data-action="edit" data-id="${food.id}">Edit</button>
                        <button class="admin-btn admin-btn-danger admin-btn-sm" data-action="delete" data-id="${food.id}">Delete</button>
                    </td>
                </tr>`;
    });
  }

  container.innerHTML = `<div class="admin-table-wrap">
            <div class="admin-table-header">
                <h2>All Foods (${foods.length})</h2>
                <button class="admin-btn admin-btn-primary" id="addFoodBtn">+ Add Food</button>
            </div>
            <table class="admin-table">
                <thead>
                    <tr>
                        <th>Image</th>
                        <th>Name / Category</th>
                        <th>Price</th>
                        <th>Status</th>
                        <th>ID</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>${rowsHtml}</tbody>
            </table>
        </div>`;

  // Event listeners
  document.getElementById("addFoodBtn").addEventListener("click", function () {
    openFoodForm(null, categories);
  });

  container.querySelectorAll("[data-action]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      const action = btn.dataset.action;
      const id = Number(btn.dataset.id);
      if (action === "edit") {
        const food = foods.find((f) => f.id === id);
        openFoodForm(food, categories);
      } else if (action === "delete") {
        deleteFood(id);
      } else if (action === "toggle") {
        toggleAvailability(id, Number(btn.dataset.avail));
      }
    });
  });
}

/* -------- Food Form (Add / Edit) -------- */
function openFoodForm(food, categories) {
  const isEdit = !!food;

  const categoryOptions = categories
    .map(function (c) {
      const selected = isEdit && c.id === food.category_id ? "selected" : "";
      return `<option value="${c.id}" ${selected}>${c.name}</option>`;
    })
    .join("");

  const body = `<form id="foodForm">
            <div class="admin-form-group">
                <label>Name</label>
                <input type="text" id="foodName" value="${isEdit ? food.name : ""}" required>
            </div>
            <div class="admin-form-group">
                <label>Category</label>
                <select id="foodCategory" required>${categoryOptions}</select>
            </div>
            <div class="admin-form-group">
                <label>Price</label>
                <input type="number" id="foodPrice" step="0.01" min="0" value="${isEdit ? food.price : ""}" required>
            </div>
            <div class="admin-form-group">
                <label>Description</label>
                <textarea id="foodDescription">${isEdit ? food.description || "" : ""}</textarea>
            </div>
            <div class="admin-form-group">
                <label>Image URL</label>
                <input type="text" id="foodImage" value="${isEdit ? food.image || "" : ""}">
            </div>
            <div class="admin-form-group">
                <label>Availability</label>
                <select id="foodAvailable">
                    <option value="1" ${isEdit && food.is_available ? "selected" : ""}>Available</option>
                    <option value="0" ${isEdit && !food.is_available ? "selected" : ""}>Sold Out</option>
                </select>
            </div>
            <div id="foodFormError"></div>
            <div class="admin-form-actions">
                <button type="button" class="admin-btn admin-btn-secondary" id="foodFormCancel">Cancel</button>
                <button type="submit" class="admin-btn admin-btn-primary">${isEdit ? "Update" : "Create"}</button>
            </div>
        </form>`;
  openModal(isEdit ? "Edit Food" : "Add Food", body);

  document
    .getElementById("foodFormCancel")
    .addEventListener("click", closeModal);

  document
    .getElementById("foodForm")
    .addEventListener("submit", async function (e) {
      e.preventDefault();

      const errorBox = document.getElementById("foodFormError");
      errorBox.innerHTML = "";

      const payload = {
        category_id: Number(document.getElementById("foodCategory").value),
        name: document.getElementById("foodName").value.trim(),
        price: Number(document.getElementById("foodPrice").value),
        description: document.getElementById("foodDescription").value.trim(),
        image: document.getElementById("foodImage").value.trim(),
        is_available: Number(document.getElementById("foodAvailable").value),
      };

      const url = isEdit ? `/api/foods/${food.id}` : "/api/foods";
      const method = isEdit ? "PUT" : "POST";

      try {
        const response = await fetch(API_URL + url, {
          method: method,
          headers: authHeaders(),
          body: JSON.stringify(payload),
        });

        const data = await response.json();

        if (!response.ok) {
          errorBox.innerHTML = `<div class="admin-error">${data.message}</div>`;
          return;
        }

        closeModal();
        loadSection("foods");
      } catch (error) {
        console.error(error);
        errorBox.innerHTML = `<div class="admin-error">Cannot connect to server.</div>`;
      }
    });
}

/* -------- Delete Food -------- */
async function deleteFood(id) {
  if (!confirm("Delete this food? This cannot be undone.")) return;

  try {
    const response = await fetch(`${API_URL}/api/foods/${id}`, {
      method: "DELETE",
      headers: authHeaders(),
    });

    const data = await response.json();

    if (!response.ok) {
      alert(data.message);
      return;
    }

    loadSection("foods");
  } catch (error) {
    console.error(error);
    alert("Cannot connect to server.");
  }
}

/* -------- Toggle Availability -------- */
async function toggleAvailability(id, currentAvail) {
  const newAvail = currentAvail ? 0 : 1;

  try {
    const response = await fetch(`${API_URL}/api/foods/${id}/availability`, {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify({ is_available: newAvail }),
    });

    const data = await response.json();

    if (!response.ok) {
      alert(data.message);
      return;
    }

    loadSection("foods");
  } catch (error) {
    console.error(error);
    alert("Cannot connect to server.");
  }
}

/* ================================
   CATEGORIES SECTION
================================ */
async function renderCategories(container) {
  container.innerHTML = `<div class="admin-loading">Loading categories...</div>`;

  const categories = await apiGet("/api/categories");

  if (!categories) return;

  let rowsHtml = "";

  if (categories.length === 0) {
    rowsHtml = `<tr><td colspan="3" class="admin-empty">No categories yet.</td></tr>`;
  } else {
    categories.forEach(function (cat) {
      rowsHtml += `<tr>
                    <td>${cat.id}</td>
                    <td><strong>${cat.name}</strong></td>
                    <td>
                        <button class="admin-btn admin-btn-primary admin-btn-sm" data-action="edit" data-id="${cat.id}">Edit</button>
                        <button class="admin-btn admin-btn-danger admin-btn-sm" data-action="delete" data-id="${cat.id}">Delete</button>
                    </td>
                </tr>`;
    });
  }

  container.innerHTML = `<div class="admin-table-wrap">
            <div class="admin-table-header">
                <h2>All Categories (${categories.length})</h2>
                <button class="admin-btn admin-btn-primary" id="addCategoryBtn">+ Add Category</button>
            </div>
            <table class="admin-table">
                <thead>
                    <tr><th>ID</th><th>Name</th><th>Actions</th></tr>
                </thead>
                <tbody>${rowsHtml}</tbody>
            </table>
        </div>`;

  document
    .getElementById("addCategoryBtn")
    .addEventListener("click", function () {
      openCategoryForm(null);
    });

  container.querySelectorAll("[data-action]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      const id = Number(btn.dataset.id);

      if (btn.dataset.action === "edit") {
        const cat = categories.find((c) => c.id === id);
        openCategoryForm(cat);
      } else if (btn.dataset.action === "delete") {
        deleteCategory(id);
      }
    });
  });
}

function openCategoryForm(category) {
  const isEdit = !!category;

  const body = `
        <form id="categoryForm">
            <div class="admin-form-group">
                <label>Category Name</label>
                <input type="text" id="categoryName" value="${isEdit ? category.name : ""}" required>
                </div>
            <div id="categoryFormError"></div>
            <div class="admin-form-actions">
                <button type="button" class="admin-btn admin-btn-secondary" id="categoryFormCancel">Cancel</button>
                <button type="submit" class="admin-btn admin-btn-primary">${isEdit ? "Update" : "Create"}</button>
            </div>
        </form>`;
  openModal(isEdit ? "Edit Category" : "Add Category", body);

  document
    .getElementById("categoryFormCancel")
    .addEventListener("click", closeModal);

  document
    .getElementById("categoryForm")
    .addEventListener("submit", async function (e) {
      e.preventDefault();

      const errorBox = document.getElementById("categoryFormError");
      errorBox.innerHTML = "";

      const name = document.getElementById("categoryName").value.trim();
      const url = isEdit ? `/api/categories/${category.id}` : "/api/categories";
      const method = isEdit ? "PUT" : "POST";

      try {
        const response = await fetch(API_URL + url, {
          method: method,
          headers: authHeaders(),
          body: JSON.stringify({ name: name }),
        });

        const data = await response.json();

        if (!response.ok) {
          errorBox.innerHTML = `<div class="admin-error">${data.message}</div>`;
          return;
        }

        closeModal();
        loadSection("categories");
      } catch (error) {
        console.error(error);
        errorBox.innerHTML = `<div class="admin-error">Cannot connect to server.</div>`;
      }
    });
}

async function deleteCategory(id) {
  if (!confirm("Delete this category?")) return;

  try {
    const response = await fetch(`${API_URL}/api/categories/${id}`, {
      method: "DELETE",
      headers: authHeaders(),
    });

    const data = await response.json();

    if (!response.ok) {
      alert(data.message);
      return;
    }

    loadSection("categories");
  } catch (error) {
    console.error(error);
    alert("Cannot connect to server.");
  }
}
/* ================================
   ORDERS SECTION
================================ */
async function renderOrders(container) {
  container.innerHTML = `<div class="admin-loading">Loading orders...</div>`;

  const orders = await apiGet("/api/admin/orders");

  if (!orders) return;

  // Status filter buttons
  const statuses = [
    "all",
    "Pending",
    "Accepted",
    "Preparing",
    "Ready",
    "Completed",
    "Cancelled",
  ];

  const filterHtml = statuses
    .map(function (s) {
      const label = s === "all" ? "All" : s;
      const active = s === "all" ? "active" : "";
      return `<button class="admin-btn admin-btn-secondary admin-btn-sm order-filter-btn ${active}" data-status="${s}">${label}</button>`;
    })
    .join(" ");

  const rowsHtml = buildOrderRows(orders);

  container.innerHTML = `<div style="margin-bottom:16px; display:flex; gap:8px; flex-wrap:wrap;">
            ${filterHtml}
        </div>
        <div class="admin-table-wrap">
            <div class="admin-table-header">
                <h2>Orders (${orders.length})</h2>
            </div>
            <table class="admin-table">
                <thead>
                    <tr>
                        <th>Order #</th>
                        <th>Type</th>
                        <th>Customer</th>
                        <th>Total</th>
                        <th>Payment</th>
                        <th>Status</th>
                        <th>Time</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody id="ordersTbody">${rowsHtml}</tbody>
            </table>
        </div>`;

  // Filter buttons
  container.querySelectorAll(".order-filter-btn").forEach(function (btn) {
    btn.addEventListener("click", async function () {
      container.querySelectorAll(".order-filter-btn").forEach(function (b) {
        b.classList.remove("active");
      });
      btn.classList.add("active");

      const status = btn.dataset.status;
      const filtered = await apiGet("/api/admin/orders?status=" + status);
      if (!filtered) return;

      document.querySelector(".admin-table-header h2").textContent =
        `Orders (${filtered.length})`;
      document.getElementById("ordersTbody").innerHTML =
        buildOrderRows(filtered);

      attachOrderRowListeners(filtered);
    });
  });

  attachOrderRowListeners(orders);
}

function buildOrderRows(orders) {
  if (orders.length === 0) {
    return `<tr><td colspan="8" class="admin-empty">No orders found.</td></tr>`;
  }

  const statusBadge = {
    Pending: "badge-warning",
    Accepted: "badge-info",
    Preparing: "badge-info",
    Ready: "badge-success",
    Completed: "badge-success",
    Cancelled: "badge-danger",
  };

  return orders
    .map(function (o) {
      const payBadge =
        o.payment_status === "paid"
          ? `<span class="badge badge-success">Paid</span>`
          : `<span class="badge badge-warning">Pending</span>`;

      const custDisplay = o.user_name
        ? `${o.user_name}<br><small style="color:#94a3b8">${o.user_email}</small>`
        : o.customer_name || "Guest";

      const time = o.created_at
        ? o.created_at.replace("T", " ").slice(0, 16)
        : "-";

      return `<tr>
                <td><strong>#${o.id}</strong></td>
                <td>${o.order_type}${o.table_number ? `<br><small>Table ${o.table_number}</small>` : ""}</td>
                <td>${custDisplay}</td>
                <td>$${Number(o.total_amount).toFixed(2)}</td>
                <td>${o.payment_method || "-"}<br>${payBadge}</td>
                <td><span class="badge ${statusBadge[o.status] || "badge-info"}">${o.status}</span></td>
                <td><small>${time}</small></td>
                <td>
                    <button class="admin-btn admin-btn-primary admin-btn-sm" data-order-id="${o.id}">View</button>
                </td>
            </tr>`;
    })
    .join("");
}
function attachOrderRowListeners(orders) {
  document.querySelectorAll("[data-order-id]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      const id = Number(btn.dataset.orderId);
      openOrderDetail(id);
    });
  });
}

async function openOrderDetail(orderId) {
  openModal("Order #" + orderId, `<div class="admin-loading">Loading...</div>`);

  const data = await apiGet("/api/admin/orders/" + orderId);

  if (!data || data.message) {
    document.getElementById("adminModalBody").innerHTML =
      `<p class="admin-error">${data?.message || "Failed to load."}</p>`;
    return;
  }

  const o = data.order;
  const items = data.items;

  const itemsHtml = items
    .map(function (item) {
      return `<tr>
                <td>${item.food_name}</td>
                <td>$${Number(item.price).toFixed(2)}</td>
                <td>× ${item.quantity}</td>
                <td>$${Number(item.subtotal).toFixed(2)}</td>
            </tr>`;
    })
    .join("");

  const body = `<div style="margin-bottom:16px;">
            <p><strong>Type:</strong> ${o.order_type}
                ${o.table_number ? `(Table ${o.table_number})` : ""}</p>
            <p><strong>Status:</strong> ${o.status}</p>
            ${o.user_name ? `<p><strong>Customer:</strong> ${o.user_name} (${o.user_email})</p>` : ""}
            ${o.customer_name ? `<p><strong>Name:</strong> ${o.customer_name}</p>` : ""}
            ${o.phone ? `<p><strong>Phone:</strong> ${o.phone}</p>` : ""}
            ${o.address ? `<p><strong>Address:</strong> ${o.address}</p>` : ""}
            <p><strong>Payment:</strong> ${o.payment_method || "-"} — 
                ${o.payment_status || "-"}
                ${o.transaction_ref ? `<br><small>Ref: ${o.transaction_ref}</small>` : ""}</p>
            <p><strong>Placed:</strong> ${o.created_at}</p>
        </div>
        <h3 style="margin:0 0 12px;">Items</h3>
        <table class="admin-table">
            <thead>
                <tr><th>Item</th><th>Price</th><th>Qty</th><th>Subtotal</th></tr>
            </thead>
            <tbody>${itemsHtml || '<tr><td colspan="4" class="admin-empty">No items.</td></tr>'}</tbody>
        </table>
        <div style="text-align:right; margin-top:16px; font-size:18px;">
            <strong>Total: $${Number(o.total_amount).toFixed(2)}</strong>
        </div>`;
  document.getElementById("adminModalBody").innerHTML = body;
}

/* ================================
   CUSTOMERS SECTION
================================ */
async function renderCustomers(container) {
  container.innerHTML = `<div class="admin-loading">Loading customers...</div>`;

  const customers = await apiGet("/api/admin/customers");

  if (!customers) return;

  let rowsHtml = "";

  if (customers.length === 0) {
    rowsHtml = `<tr><td colspan="5" class="admin-empty">No customers yet.</td></tr>`;
  } else {
    customers.forEach(function (c) {
      const lastOrder = c.last_order_at
        ? c.last_order_at.replace("T", " ").slice(0, 16)
        : "—";

      rowsHtml += `<tr>
                    <td><strong>${c.name}</strong><br><small style="color:#94a3b8">${c.email}</small></td>
                    <td>${c.order_count}</td>
                    <td>$${Number(c.total_spent).toFixed(2)}</td>
                    <td><small>${lastOrder}</small></td>
                    <td>${c.id}</td>
                </tr>`;
    });
  }

  container.innerHTML = `
        <div class="admin-table-wrap">
            <div class="admin-table-header">
                <h2>Customers (${customers.length})</h2>
            </div>
            <table class="admin-table">
                <thead>
                  <tr>
                        <th>Customer</th>
                        <th>Orders</th>
                        <th>Total Spent</th>
                        <th>Last Order</th>
                        <th>ID</th>
                    </tr>
                </thead>
                <tbody>${rowsHtml}</tbody>
            </table>
        </div>
    `;
}
/* ================================
   TABLES SECTION
================================ */
async function renderTables(container) {
  container.innerHTML = `<div class="admin-loading">Loading tables...</div>`;

  const tables = await apiGet("/api/tables");

  if (!tables) return;

  let rowsHtml = "";

  if (tables.length === 0) {
    rowsHtml = `<tr><td colspan="4" class="admin-empty">No tables yet. Add one to get started.</td></tr>`;
  } else {
    tables.forEach(function (t) {
      const status = t.is_active
        ? `<span class="badge badge-success">Active</span>`
        : `<span class="badge badge-danger">Inactive</span>`;

      rowsHtml += ` <tr>
                    <td>${t.id}</td>
                    <td><strong>Table ${t.table_number}</strong></td>
                    <td>${status}</td>
                    <td>
                        <button class="admin-btn admin-btn-primary admin-btn-sm" data-action="qr" data-id="${t.id}" data-num="${t.table_number}">Show QR</button>
                        <button class="admin-btn admin-btn-danger admin-btn-sm" data-action="delete" data-id="${t.id}" data-num="${t.table_number}">Delete</button>
                    </td>
                </tr>`;
    });
  }

  container.innerHTML = `<div class="admin-table-wrap">
            <div class="admin-table-header">
                <h2>Restaurant Tables (${tables.length})</h2>
                <button class="admin-btn admin-btn-primary" id="addTableBtn">+ Add Table</button>
            </div>
            <table class="admin-table">
                <thead>
                    <tr><th>ID</th><th>Table</th><th>Status</th><th>Actions</th></tr>
                </thead>
                <tbody>${rowsHtml}</tbody>
            </table>
        </div>`;

  document
    .getElementById("addTableBtn")
    .addEventListener("click", openAddTableForm);

  container.querySelectorAll("[data-action]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      const id = Number(btn.dataset.id);
      const num = btn.dataset.num;

      if (btn.dataset.action === "qr") {
        showTableQr(id, num);
      } else if (btn.dataset.action === "delete") {
        deleteTable(id, num);
      }
    });
  });
}

/* -------- Add Table Form -------- */
function openAddTableForm() {
  const body = `<form id="tableForm">
            <div class="admin-form-group">
                <label>Table Number</label>
                <input type="number" id="tableNumberInput" min="1" required placeholder="e.g. 6">
            </div>
            <div id="tableFormError"></div>
            <div class="admin-form-actions">
                <button type="button" class="admin-btn admin-btn-secondary" id="tableFormCancel">Cancel</button>
                <button type="submit" class="admin-btn admin-btn-primary">Create Table</button>
            </div>
        </form>`;
  openModal("Add Table", body);

  document
    .getElementById("tableFormCancel")
    .addEventListener("click", closeModal);

  document
    .getElementById("tableForm")
    .addEventListener("submit", async function (e) {
      e.preventDefault();

      const errorBox = document.getElementById("tableFormError");
      errorBox.innerHTML = "";

      const tableNumber = Number(
        document.getElementById("tableNumberInput").value,
      );

      try {
        const response = await fetch(API_URL + "/api/tables", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ table_number: tableNumber }),
        });

        const data = await response.json();

        if (!response.ok) {
          errorBox.innerHTML = `<div class="admin-error">${data.message}</div>`;
          return;
        }

        closeModal();
        loadSection("tables");
      } catch (error) {
        console.error(error);
        errorBox.innerHTML = `<div class="admin-error">Cannot connect to server.</div>`;
      }
    });
}

/* -------- Delete Table -------- */
async function deleteTable(id, num) {
  if (!confirm(`Delete Table ${num}? This cannot be undone.`)) return;

  try {
    const response = await fetch(`${API_URL}/api/tables/${id}`, {
      method: "DELETE",
      headers: authHeaders(),
    });

    const data = await response.json();

    if (!response.ok) {
      alert(data.message);
      return;
    }

    loadSection("tables");
  } catch (error) {
    console.error(error);
    alert("Cannot connect to server.");
  }
}

/* -------- Show Table QR -------- */
async function showTableQr(id, tableNumber) {
  openModal(
    `Table ${tableNumber} — QR Code`,
    `<div class="admin-loading">Generating QR...</div>`,
  );

  const data = await apiGet(`/api/tables/${id}/qr`);

  if (!data || data.message) {
    document.getElementById("adminModalBody").innerHTML =
      `<p class="admin-error">${data?.message || "Failed to generate QR."}</p>`;
    return;
  }

  const body = `<div style="text-align:center;">
            <p style="color:#64748b; font-size:14px;">
                Scan this QR to order from Table ${tableNumber}
            </p>
            <img src="${data.qr_data_url}" alt="QR Code"
                 style="width:280px; height:280px; border:1px solid #e2e8f0; border-radius:8px; padding:8px; background:#fff;">
            <p style="font-size:12px; color:#94a3b8; word-break:break-all; margin-top:12px;">
                ${data.target_url}
            </p>
            <div class="admin-form-actions" style="justify-content:center;">
                <a href="${data.qr_data_url}" download="table-${tableNumber}-qr.png" class="admin-btn admin-btn-primary" style="text-decoration:none;">
                    Download QR
                </a>
                <button type="button" class="admin-btn admin-btn-secondary" onclick="window.print()">Print</button>
            </div>
        </div>`;
  document.getElementById("adminModalBody").innerHTML = body;
}

async function renderPayments(container) {
  container.innerHTML = `<div class="admin-loading">Loading payments...</div>`;

  const [payments, sales, awaiting] = await Promise.all([
    apiGet("/api/admin/payments"),
    apiGet("/api/admin/sales"),
    apiGet("/api/admin/payments?status=awaiting_verification"),
  ]);

  if (!payments || !sales || !awaiting) return;

  // ================================
  // 🔔 Pending Verification Alert
  // ================================
  let alertHtml = "";

  if (awaiting.length > 0) {
    alertHtml = `<div class="admin-alert-warning">
                <div class="alert-icon">🔔</div>
                <div class="alert-content">
                    <strong>${awaiting.length} Payment${awaiting.length > 1 ? "s" : ""} Awaiting Verification</strong>
                    <p>Customers submitted payments. Please verify before marking as paid.</p>
                </div>
                <button class="admin-btn admin-btn-primary admin-btn-sm" id="showAwaitingBtn">
                    View Now →
                </button>
            </div>`;
  }

  // ================================
  // Sales Summary
  // ================================
  const summaryHtml = `<div class="stat-grid" style="margin-bottom:24px;">
            <div class="stat-card stat-info">
                <h3>Today</h3>
                <div class="stat-value">$${Number(sales.today.revenue).toFixed(2)}</div>
                <div style="color:#94a3b8; font-size:13px; margin-top:6px;">
                    ${sales.today.orders} order(s)
                </div>
            </div>
            <div class="stat-card stat-info">
                <h3>Last 7 Days</h3>
                <div class="stat-value">$${Number(sales.week.revenue).toFixed(2)}</div>
                <div style="color:#94a3b8; font-size:13px; margin-top:6px;">
                    ${sales.week.orders} order(s)
                </div>
            </div>
            <div class="stat-card stat-warning">
                <h3>Last 30 Days</h3>
                <div class="stat-value">$${Number(sales.month.revenue).toFixed(2)}</div>
                <div style="color:#94a3b8; font-size:13px; margin-top:6px;">
                    ${sales.month.orders} order(s)
                </div>
            </div>
            <div class="stat-card stat-success">
                <h3>All Time (Verified)</h3>
                <div class="stat-value">$${Number(sales.all_time.revenue).toFixed(2)}</div>
                <div style="color:#94a3b8; font-size:13px; margin-top:6px;">
                    ${sales.all_time.orders} order(s)
                </div>
            </div>
        </div>`;
  // ================================
  // By Method
  // ================================
  let methodHtml = "";

  if (sales.by_method.length === 0) {
    methodHtml = `<p style="color:#94a3b8;">No paid payments yet.</p>`;
  } else {
    methodHtml = `<div class="stat-grid">
                ${sales.by_method
                  .map(function (m) {
                    return `
                        <div class="stat-card">
                            <h3>${m.method.toUpperCase()}</h3>
                            <div class="stat-value">$${Number(m.total).toFixed(2)}</div>
                            <div style="color:#94a3b8; font-size:13px; margin-top:6px;">
                                ${m.count} payment(s)
                            </div>
                        </div>`;
                  })
                  .join("")}
            </div>`;
  }

  // ================================
  // Filter Buttons — awaiting_verification ပါလာ
  // ================================
  const statusFilters = [
    "all",
    "awaiting_verification",
    "paid",
    "pending",
    "rejected",
    "refunded",
  ];
  const methodFilters = ["all", "cash", "kpay", "wavepay"];
  const statusFilterHtml = statusFilters
    .map(function (s) {
      const active = s === "all" ? "active" : "";
      const label = s === "awaiting_verification" ? "⏳ Awaiting Verify" : s;
      return `<button class="admin-btn admin-btn-secondary admin-btn-sm payment-filter-btn ${active}" data-type="status" data-value="${s}">${label}</button>`;
    })
    .join(" ");

  const methodFilterHtml = methodFilters
    .map(function (m) {
      const active = m === "all" ? "active" : "";
      return `<button class="admin-btn admin-btn-secondary admin-btn-sm payment-filter-btn ${active}" data-type="method" data-value="${m}">${m}</button>`;
    })
    .join(" ");

  // ================================
  // Payments Table
  // ================================
  const rowsHtml = buildPaymentRows(payments);

  container.innerHTML = `${alertHtml}

        <h2 style="margin-top:0;">Sales Summary</h2>
        ${summaryHtml}

        <h2 style="margin-top:32px;">Revenue by Payment Method</h2>
        ${methodHtml}

        <h2 style="margin-top:32px;">Payments</h2>

        <div style="margin-bottom:12px;">
            <strong style="color:#64748b; font-size:13px; margin-right:8px;">STATUS:</strong>
            ${statusFilterHtml}
        </div>

        <div style="margin-bottom:16px;">
            <strong style="color:#64748b; font-size:13px; margin-right:8px;">METHOD:</strong>
            ${methodFilterHtml}
        </div>

        <div class="admin-table-wrap">
            <div class="admin-table-header">
                <h2>All Payments (${payments.length})</h2>
            </div>
            <table class="admin-table">
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Order #</th>
                        <th>Method</th>
                        <th>Amount</th>
                        <th>Status</th>
                        <th>Customer</th>
                        <th>Ref</th>
                        <th>Created</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody id="paymentsTbody">${rowsHtml}</tbody>
            </table>
        </div>`;

  // Filter handling
  let currentFilters = { status: "all", method: "all" };

  function applyFilters() {
    const queryParams = [];
    if (currentFilters.status !== "all")
      queryParams.push("status=" + currentFilters.status);
    if (currentFilters.method !== "all")
      queryParams.push("method=" + currentFilters.method);

    const url =
      "/api/admin/payments" +
      (queryParams.length > 0 ? "?" + queryParams.join("&") : "");

    apiGet(url).then(function (filtered) {
      if (!filtered) return;

      const header = document.querySelector(".admin-table-header h2");
      if (header) header.textContent = `All Payments (${filtered.length})`;

      const tbody = document.getElementById("paymentsTbody");
      if (tbody) tbody.innerHTML = buildPaymentRows(filtered);

      attachPaymentActions(filtered);
    });
  }

  container.querySelectorAll(".payment-filter-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      const type = btn.dataset.type;
      const value = btn.dataset.value;

      currentFilters[type] = value;

      container
        .querySelectorAll(`.payment-filter-btn[data-type="${type}"]`)
        .forEach(function (b) {
          b.classList.remove("active");
        });
      btn.classList.add("active");

      applyFilters();
    });
  });

  // "View Now" button
  const showAwaitingBtn = document.getElementById("showAwaitingBtn");
  if (showAwaitingBtn) {
    showAwaitingBtn.addEventListener("click", function () {
      // Filter ကို awaiting_verification ပြောင်း
      currentFilters.status = "awaiting_verification";
      currentFilters.method = "all";
      container
        .querySelectorAll(`.payment-filter-btn[data-type="status"]`)
        .forEach(function (b) {
          b.classList.toggle(
            "active",
            b.dataset.value === "awaiting_verification",
          );
        });
      container
        .querySelectorAll(`.payment-filter-btn[data-type="method"]`)
        .forEach(function (b) {
          b.classList.toggle("active", b.dataset.value === "all");
        });

      applyFilters();

      // Payments table ကို scroll
      const table = document.querySelector(".admin-table-wrap");
      if (table) table.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  attachPaymentActions(payments);
}

/* ================================
   ATTACH PAYMENT ACTIONS
================================ */
function attachPaymentActions(payments) {
  document.querySelectorAll("[data-payment-action]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      const action = btn.dataset.paymentAction;
      const id = Number(btn.dataset.paymentId);
      const payment = payments.find(function (p) {
        return p.id === id;
      });

      if (!payment) return;

      if (action === "verify") {
        openVerifyPaymentModal(payment);
      } else if (action === "reject") {
        openRejectPaymentModal(payment);
      } else if (action === "cash_paid") {
        markCashAsPaid(payment);
      } else if (action === "view") {
        showPaymentDetails(payment);
      }
    });
  });
}

/* ================================
   VERIFY PAYMENT MODAL
================================ */
function openVerifyPaymentModal(payment) {
  const body = `<div style="text-align:center;">
            <div style="font-size:48px; margin-bottom:12px;">✅</div>
            <h3 style="margin:0 0 8px 0; color:#0f172a;">Verify Payment</h3>
            <p style="color:#64748b; font-size:14px; margin-bottom:20px;">
                ပိုက်ဆံ တကယ် ရကြောင်း သေချာပြီးမှ verify လုပ်ပါ။
            </p>

            <div style="background:#f8fafc; border-radius:10px; padding:16px; margin-bottom:20px; text-align:left; font-size:14px;">
                <div style="display:flex; justify-content:space-between; padding:6px 0;">
                    <span style="color:#64748b;">Payment ID</span>
                    <strong>#${payment.id}</strong>
                </div>
                <div style="display:flex; justify-content:space-between; padding:6px 0;">
                    <span style="color:#64748b;">Order #</span>
                    <strong>#${payment.order_id}</strong>
                </div>
                <div style="display:flex; justify-content:space-between; padding:6px 0;">
                    <span style="color:#64748b;">Method</span>
                    <strong>${payment.method.toUpperCase()}</strong>
                </div>
                <div style="display:flex; justify-content:space-between; padding:6px 0; border-top:1px dashed #e2e8f0; margin-top:6px; padding-top:12px;">
                    <span style="color:#64748b;">Amount</span>
                    <strong style="font-size:18px; color:#d97706;">$${Number(payment.amount).toFixed(2)}</strong>
                </div>
                ${
                  payment.transaction_ref
                    ? `
                    <div style="display:flex; justify-content:space-between; padding:6px 0;">
                        <span style="color:#64748b;">Ref</span>
                        <small style="font-family:monospace;">${payment.transaction_ref}</small>
                    </div>`
                    : ""
                }
            </div>

            <div class="admin-form-actions" style="justify-content:center;">
                <button type="button" class="admin-btn admin-btn-secondary" onclick="closeModal()">
                    Cancel
                </button>
                <button type="button" class="admin-btn admin-btn-primary" id="confirmVerifyBtn">
                    ✅ Confirm & Mark as Paid
                </button>
            </div>
        </div>`;
  openModal("Verify Payment", body);
  document
    .getElementById("confirmVerifyBtn")
    .addEventListener("click", async function () {
      const btn = this;
      btn.disabled = true;
      btn.textContent = "Verifying...";

      try {
        const response = await fetch(`${API_URL}/api/payments/${payment.id}`, {
          method: "PATCH",
          headers: authHeaders(),
          body: JSON.stringify({ status: "paid" }),
        });

        const data = await response.json();

        if (!response.ok) {
          alert(data.message);
          btn.disabled = false;
          btn.textContent = "✅ Confirm & Mark as Paid";
          return;
        }

        closeModal();
        loadSection("payments");
      } catch (error) {
        console.error(error);
        alert("Cannot connect to server.");
        btn.disabled = false;
        btn.textContent = "✅ Confirm & Mark as Paid";
      }
    });
}

/* ================================
   REJECT PAYMENT MODAL
================================ */
function openRejectPaymentModal(payment) {
  const body = `<div>
            <div style="text-align:center; margin-bottom:16px;">
                <div style="font-size:48px; margin-bottom:8px;">❌</div>
                <h3 style="margin:0 0 4px 0; color:#0f172a;">Reject Payment</h3>
                <p style="color:#64748b; font-size:14px; margin:0;">
                    ပိုက်ဆံ မရကြောင်း သေချာပြီးမှ reject လုပ်ပါ။
                </p>
            </div>

            <div style="background:#fef2f2; border-radius:10px; padding:14px; margin-bottom:16px; font-size:14px; border:1px solid #fecaca;">
                <div style="display:flex; justify-content:space-between; padding:4px 0;">
                    <span style="color:#991b1b;">Payment #${payment.id} · Order #${payment.order_id}</span>
                    <strong style="color:#991b1b;">$${Number(payment.amount).toFixed(2)}</strong>
                </div>
            </div>

            <form id="rejectPaymentForm">
                <div class="admin-form-group">
                    <label>Reason for Rejection *</label>
                    <textarea id="rejectionReason" required placeholder="ဥပမာ — KPay မှာ ပိုက်ဆံ မရပါ၊ transaction ref မမှန်ပါ၊ စသည်"></textarea>
                </div>

                <div id="rejectError"></div>

                <div class="admin-form-actions">
                    <button type="button" class="admin-btn admin-btn-secondary" onclick="closeModal()">
                        Cancel
                    </button>
                    <button type="submit" class="admin-btn admin-btn-danger">
                        ❌ Confirm Reject
                    </button>
                </div>
            </form>
        </div>`;
  openModal("Reject Payment", body);

  document
    .getElementById("rejectPaymentForm")
    .addEventListener("submit", async function (e) {
      e.preventDefault();

      const errorBox = document.getElementById("rejectError");
      errorBox.innerHTML = "";

      const reason = document.getElementById("rejectionReason").value.trim();

      if (reason.length < 3) {
        errorBox.innerHTML = `<div class="admin-error">Please provide a reason.</div>`;
        return;
      }

      try {
        const response = await fetch(`${API_URL}/api/payments/${payment.id}`, {
          method: "PATCH",
          headers: authHeaders(),
          body: JSON.stringify({
            status: "rejected",
            rejection_reason: reason,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          errorBox.innerHTML = `<div class="admin-error">${data.message}</div>`;
          return;
        }

        closeModal();
        loadSection("payments");
      } catch (error) {
        console.error(error);
        errorBox.innerHTML = `<div class="admin-error">Cannot connect to server.</div>`;
      }
    });
}
/* ================================
   PAYMENT DETAILS
================================ */
function showPaymentDetails(payment) {
  const paidAt = payment.paid_at
    ? new Date(payment.paid_at).toLocaleString()
    : "—";

  const verifiedAt = payment.verified_at
    ? new Date(payment.verified_at).toLocaleString()
    : "—";

  let gatewayHtml = "";

  if (payment.gateway_response) {
    try {
      const gw = JSON.parse(payment.gateway_response);
      gatewayHtml = `<pre style="background:#f8fafc; padding:12px; border-radius:8px; font-size:12px; overflow-x:auto;">${JSON.stringify(gw, null, 2)}</pre>`;
    } catch (e) {
      gatewayHtml = `<pre style="background:#f8fafc; padding:12px; border-radius:8px; font-size:12px;">${payment.gateway_response}</pre>`;
    }
  }

  const body = `<div style="font-size:14px;">
            <p><strong>Payment ID:</strong> #${payment.id}</p>
            <p><strong>Order #:</strong> #${payment.order_id} (${payment.order_type || "—"})</p>
            <p><strong>Method:</strong> ${payment.method.toUpperCase()}</p>
            <p><strong>Amount:</strong> $${Number(payment.amount).toFixed(2)}</p>
            <p><strong>Status:</strong> ${payment.status}</p>
            ${payment.transaction_ref ? `<p><strong>Ref:</strong> <code>${payment.transaction_ref}</code></p>` : ""}
            <p><strong>Created:</strong> ${payment.created_at || "—"}</p>
            <p><strong>Paid At:</strong> ${paidAt}</p>
            <p><strong>Verified At:</strong> ${verifiedAt}</p>
            ${payment.rejection_reason ? `<p style="color:#991b1b;"><strong>Rejection Reason:</strong> ${payment.rejection_reason}</p>` : ""}

            ${gatewayHtml ? `<h4 style="margin-top:16px;">Gateway Response</h4>${gatewayHtml}` : ""}
        </div>`;
  openModal("Payment Details", body);
}
/* -------- Build Payment Rows -------- */
function buildPaymentRows(payments) {
  if (payments.length === 0) {
    return `<tr><td colspan="9" class="admin-empty">No payments found.</td></tr>`;
  }

  const statusBadge = {
    paid: "badge-success",
    pending: "badge-warning",
    awaiting_verification: "badge-info",
    rejected: "badge-danger",
    failed: "badge-danger",
    refunded: "badge-info",
  };

  return payments
    .map(function (p) {
      const statusLabel =
        p.status === "awaiting_verification" ? "⏳ Awaiting Verify" : p.status;

      const status = `<span class="badge ${statusBadge[p.status] || "badge-info"}">${statusLabel}</span>`;

      const customer = p.user_name
        ? `${p.user_name}<br><small style="color:#94a3b8">${p.user_email}</small>`
        : p.customer_name || "—";

      const time = p.created_at
        ? p.created_at.replace("T", " ").slice(0, 16)
        : "—";

      const ref = p.transaction_ref
        ? `<small style="font-family:monospace;">${p.transaction_ref.slice(0, 15)}${p.transaction_ref.length > 15 ? "..." : ""}</small>`
        : "—";

      // Actions — status အလိုက် ကွာခြား
      let actions = "";

      if (p.status === "awaiting_verification") {
    actions = 
        `<button class="admin-btn admin-btn-primary admin-btn-sm" data-payment-action="verify" data-payment-id="${p.id}">
            ✅ Verify
        </button>
        <button class="admin-btn admin-btn-danger admin-btn-sm" data-payment-action="reject" data-payment-id="${p.id}">
            ✕ Reject
        </button>`
    ;
} else if (p.status === "pending" && p.method === "cash") {
    // Cash အတွက် သီးသန့် Button
    actions = 
        `<button class="admin-btn admin-btn-success admin-btn-sm" data-payment-action="cash_paid" data-payment-id="${p.id}">
            💵 Mark as Paid
        </button>`
    ;
} else {
        actions = `<button class="admin-btn admin-btn-secondary admin-btn-sm" data-payment-action="view" data-payment-id="${p.id}">
                    View
                </button>`;
      }

      // Awaiting ဖြစ်ရင် row ကို highlight
      const rowClass =
        p.status === "awaiting_verification"
          ? 'style="background:#fef3c7;"'
          : "";

      return `
            <tr ${rowClass}>
                <td>${p.id}</td>
                <td><strong>#${p.order_id}</strong><br><small style="color:#94a3b8">${p.order_type || "—"}</small></td>
                <td>${p.method.toUpperCase()}</td>
                <td>$${Number(p.amount).toFixed(2)}</td>
                <td>${status}</td>
                <td>${customer}</td>
                <td>${ref}</td>
                <td><small>${time}</small></td>
                <td>${actions}</td>
            </tr>`;
    })
    .join("");
}
function markCashAsPaid(payment) {
    if (!confirm(`Order #${payment.order_id} အတွက် ငွေ $${Number(payment.amount).toFixed(2)} လက်ခံရရှိပြီးပါပြီလား?`)) {
        return;
    }

    fetch(`${API_URL}/api/payments/${payment.id}`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ status: "paid" })
    })
    .then(r => r.json())
    .then(data => {
        if (data.message && data.message.includes("successfully") || data.status === "paid") {
            loadSection("payments"); // Refresh list
        } else {
            alert(data.message || "Failed to update payment");
        }
    })
    .catch(err => {
        console.error(err);
        alert("Cannot connect to server.");
    });
}