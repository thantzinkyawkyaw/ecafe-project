/* ================================
   CONFIG
================================ */
const API_URL = window.location.origin;
const REFRESH_INTERVAL_MS = 10000;


/* ================================
   STATUS CONFIG
================================ */
const STATUS_CONFIG = {
    "Pending": {
        icon: "📝",
        title: "Order Received",
        desc: "We received your order and it's waiting for kitchen confirmation.",
        step: 0
    },
    "Accepted": {
        icon: "✅",
        title: "Accepted",
        desc: "Kitchen has accepted your order and will start soon.",
        step: 1
    },
    "Preparing": {
        icon: "🔥",
        title: "Preparing",
        desc: "Your order is being prepared with care.",
        step: 2
    },
    "Ready": {
        icon: "🔔",
        title: "Ready!",
        desc: "Your order is ready. Please pick up or wait for delivery.",
        step: 3
    },
    "Completed": {
        icon: "🎉",
        title: "Completed",
        desc: "Order completed. Thank you for dining with us!",
        step: 4
    },
    "Cancelled": {
        icon: "❌",
        title: "Cancelled",
        desc: "This order has been cancelled. Contact staff for details.",
        step: -1
    }
};

const STEPS = [
    { key: "Pending",   short: "Placed" },
    { key: "Accepted",  short: "Accepted" },
    { key: "Preparing", short: "Preparing" },
    { key: "Ready",     short: "Ready" },
    { key: "Completed", short: "Done" }
];


/* ================================
   HELPERS
================================ */
function getOrderIdFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("id");

    if (!id) return null;

    const num = Number(id);
    if (!Number.isInteger(num) || num <= 0) return null;

    return num;
}

function getTokenFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get("token");
}


function orderTypeLabel(orderType) {
    const map = {
        "dine-in": "🍽️ Dine-in",
        "takeaway": "🥡 Takeaway",
        "delivery": "🚚 Delivery"
    };
    return map[orderType] || orderType;
}


/* ================================
   MAIN
================================ */
const orderId = getOrderIdFromUrl();

if (!orderId) {
    showError("Invalid Order", "No valid order ID in the URL.");
} else {
    loadOrder();
    setInterval(loadOrder, REFRESH_INTERVAL_MS);
}


function showError(title, message) {
    document.getElementById("trackContent").innerHTML = 
        `<div class="track-empty">
            <div class="icon">😕</div>
            <h2>${title}</h2>
            <p>${message}</p>
        </div>`
    ;
}


async function loadOrder() {
    try {
        const token = getTokenFromUrl();

if (!token) {
    showError("Tracking Token Missing", "Please use the link from your order confirmation.");
    return;
}

const response = await fetch(
    `${API_URL}/api/orders/${orderId}/track?token=${encodeURIComponent(token)}`
);
        const data = await response.json();

        if (!response.ok) {
            showError("Order Not Found", data.message || `Order #${orderId} could not be loaded.`);
            return;
        }

        renderOrder(data);

    } catch (error) {
        console.error(error);
        showError("Connection Error", "Cannot connect to server. Please try again.");
    }
}


function renderOrder(data) {
    const order = data.order;
    const items = data.items;
    const payment = data.payment;

    const config = STATUS_CONFIG[order.status] || STATUS_CONFIG["Pending"];
    const statusClass = "status-" + order.status.toLowerCase();

    // Progress HTML (hide if cancelled)
    let progressHtml = "";

    if (order.status !== "Cancelled") {
        const currentStep = config.step;

        const stepsHtml = STEPS.map(function (step, index) {
            let cls = "";
            let content = index + 1;

            if (index < currentStep) {
                cls = "done";
                content = "✓";
            } else if (index === currentStep) {
                cls = "current";
                content = "●";
            }

            return `
                <div class="progress-step ${cls}">
                    <div class="progress-dot">${content}</div>
                    <div class="progress-step-label">${step.short}</div>
                </div>`
            ;
        }).join("");
        // Fill width: 0% at step 0, 100% at step 4
        const fillPercent = (currentStep / (STEPS.length - 1)) * 100;

        progressHtml = `
            <div class="progress-section">
                <div class="progress-label">Progress</div>
                <div class="progress-track">
                    <div class="progress-fill" style="width: calc(${fillPercent}% - 32px);"></div>
                    ${stepsHtml}
                </div>
            </div>`
        ;
    }

    // Items
    const itemsHtml = items.map(function (item) {
        return `
            <div class="item-row">
                <div class="item-name">
                    <span class="item-qty">${item.quantity}×</span>
                    <span>${item.food_name}</span>
                </div>
                <span class="item-price">$${Number(item.subtotal).toFixed(2)}</span>
            </div>`
        ;
    }).join("");

    // Payment
    let paymentHtml = "";

    if (payment) {
        const payClass = payment.status === "paid" ? "paid"
            : payment.status === "failed" ? "failed"
            : "pending";

        paymentHtml = 
            `<div class="payment-badge">
                <span class="payment-method">
                    Payment · <strong>${payment.method.toUpperCase()}</strong>
                </span>
                <span class="payment-status ${payClass}">${payment.status}</span>
            </div>`
        ;
    }

    const total = Number(order.total_amount).toFixed(2);

    document.getElementById("trackContent").innerHTML = 
        `<div class="track-card">

            <div class="track-header">
                <h1>Order #${order.id}</h1>
                <div class="order-meta">
                    <span>${orderTypeLabel(order.order_type)}</span>
                    ${order.table_number ? `<span class="dot"></span><span>Table ${order.table_number}</span>` : ""}
                </div>
            </div>

            <div class="status-display ${statusClass}">
                <div class="status-icon">${config.icon}</div>
                <div class="status-text-block">
                    <div class="status-label">Current Status</div>
                    <h2 class="status-title">${config.title}</h2>
                    <p class="status-desc">${config.desc}</p>
                </div>
            </div>

            ${progressHtml}

            <div class="items-section">
                <div class="section-title">Your Items</div>
                ${itemsHtml || '<p style="color:#999;">No items</p>'}
            </div>

            <div class="total-section">
                <span class="total-label">Total</span>
                <span class="total-value">$${total}</span>
            </div>

            ${paymentHtml}

        </div>

        <div class="refresh-indicator">
            <span class="dot"></span>
            <span>Auto-refreshing every 10 seconds</span>
        </div>

        <div class="track-actions">
            <a href="menu.html" class="track-btn track-btn-primary">Order More</a>
            <a href="index.html" class="track-btn track-btn-secondary">Home</a>
        </div>`
    ;
}