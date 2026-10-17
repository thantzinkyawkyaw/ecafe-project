/* ================================
   CONFIG
================================ */
const API_URL = window.location.origin;
/* ================================
   AUTO LOGOUT FOR GUEST MODE
   (QR scan ဖြစ်ရင် admin/kitchen ကို auto-logout)
================================ */
(function autoLogoutForGuestMode() {
    const params = new URLSearchParams(window.location.search);
    const tableParam = params.get("table");

    if (!tableParam) {
        return;
    }

    const loggedInUserRaw = localStorage.getItem("loggedInUser");

    if (!loggedInUserRaw) {
        return;
    }

    try {
        const user = JSON.parse(loggedInUserRaw);

        if (user.role === "admin" || user.role === "kitchen") {
            localStorage.removeItem("loggedInUser");
            localStorage.removeItem("authToken");

            console.log(
                `Guest Mode: Auto-logged out ${user.role} (${user.name}). ` +
                `Ordering as guest for table ${tableParam}.`
            );
        }
    } catch (error) {
        // Corrupted user data — clear it
        localStorage.removeItem("loggedInUser");
        localStorage.removeItem("authToken");
    }
})();

/* ================================
   MESSAGE HELPER (Login / Register / Contact)
================================ */
function showMessage(message, type) {
  const messageBox = document.getElementById("formMessage");
  if (!messageBox) {
    console.error("formMessage not found.");
    return;
  }
  messageBox.textContent = message;
  messageBox.className = type;
}

/* ================================
   CART STORAGE
================================ */
function getCart() {
  try {
    return JSON.parse(localStorage.getItem("cart")) || [];
  } catch (e) {
    return [];
  }
}

let cart = getCart();

function saveCart() {
  localStorage.setItem("cart", JSON.stringify(cart));
}

/* ================================
   AUTH AREA (Header - Welcome / Logout)
================================ */
const authArea = document.getElementById("authArea");

if (authArea) {
  const loggedInUserRaw = localStorage.getItem("loggedInUser");

  if (loggedInUserRaw) {
    const user = JSON.parse(loggedInUserRaw);

    authArea.innerHTML = `<span>Welcome, ${user.name}</span>
            <button id="logoutBtn">Logout</button>`;

    const logoutBtn = document.getElementById("logoutBtn");

logoutBtn.addEventListener("click", async function () {
    const token = localStorage.getItem("authToken");
    
    // Local မှာ ချက်ချင်း ဖျက်မယ်
    localStorage.removeItem("loggedInUser");
    localStorage.removeItem("authToken");
    localStorage.removeItem("deliveryInfo");
    sessionStorage.removeItem("dineInTable");

    // Backend ကို အသိပေးမယ် (Token Revoke လုပ်ဖို့)
    if (token) {
        try {
            await fetch("http://localhost:3000/api/logout", {
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
}

/* ================================
   LOGIN FORM
================================ */
const loginForm = document.getElementById("loginForm");

if (loginForm) {
  loginForm.addEventListener("submit", async function (event) {
    event.preventDefault();

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    if (email === "") {
      showMessage("Please enter your email.", "error");
      return;
    }
    if (password === "") {
      showMessage("Please enter your password.", "error");
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        showMessage(data.message, "error");
        return;
      }

      showMessage(data.message, "success");
      localStorage.setItem("loggedInUser", JSON.stringify(data.user));

      // ✅ Token ကို save (အသစ်)
      if (data.token) {
        localStorage.setItem("authToken", data.token);
      }

      // Redirect logic
      const params = new URLSearchParams(window.location.search);
      const redirect = params.get("redirect");

      setTimeout(function () {
        if(data.user.must_change_password === 1){
          window.location.href = "change-password.html";
          return;
        }
        if (redirect === "checkout") {
          window.location.href = "checkout.html";
        } else if (data.user.role === "admin") {
          // ✅ Admin → Dashboard
          window.location.href = "admin.html";
        } else if (data.user.role === "kitchen") {
          window.location.href = "kitchen.html";
        } else {
          window.location.href = "index.html";
        }
      }, 1000);
    } catch (error) {
      console.error("Login error:", error);
      showMessage("Cannot connect to server.", "error");
    }
  });
}

/* ================================
   REGISTER FORM
================================ */
const registerForm = document.getElementById("registerForm");

if (registerForm) {
  registerForm.addEventListener("submit", async function (event) {
    event.preventDefault();

    const name = document.getElementById("registerName").value.trim();
    const email = document.getElementById("registerEmail").value.trim();
    const password = document.getElementById("registerPassword").value;
    const confirmPassword = document.getElementById("confirmPassword").value;

    if (name === "") {
      showMessage("Please enter your name.", "error");
      return;
    }
    if (email === "") {
      showMessage("Please enter your email.", "error");
      return;
    }
    // 3. Check email format
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
if (!emailRegex.test(email)) {
    showMessage("Please enter a valid email address.", "error");
    return;
}

// 4. Check password strength
if (password.length < 6) {
    showMessage("Password must be at least 6 characters.", "error");
    return;
}

if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) {
    showMessage("Password must contain at least one letter and one number.", "error");
    return;
}

const weakPasswords = [
    "123456", "1234567", "12345678", "password", "qwerty",
    "abc123", "111111", "123123", "admin123", "letmein"
];

if (weakPasswords.includes(password.toLowerCase())) {
    showMessage("Password is too weak. Please choose a stronger one.", "error");
    return;
}
    if (password !== confirmPassword) {
      showMessage("Passwords do not match.", "error");
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        showMessage(data.message, "error");
        return;
      }

      showMessage(data.message, "success");
      registerForm.reset();

      // Redirect ကို URL ကနေ ဖတ်
      const params = new URLSearchParams(window.location.search);
      const redirect = params.get("redirect");

      if (redirect === "checkout") {
        setTimeout(function () {
          window.location.href = "login.html?redirect=checkout";
        }, 1500);
      }
    } catch (error) {
      console.error(error);
      showMessage("Cannot connect to server.", "error");
    }
  });
}

/* ================================
   CONTACT FORM
================================ */
const contactForm = document.getElementById("contactForm");

if (contactForm) {
  contactForm.addEventListener("submit", function (event) {
    event.preventDefault();

    const name = document.getElementById("contactName").value.trim();
    const email = document.getElementById("contactEmail").value.trim();
    const message = document.getElementById("contactMessage").value.trim();

    if (name === "") {
      showMessage("Please enter your name.", "error");
      return;
    }
    if (email === "") {
      showMessage("Please enter your email.", "error");
      return;
    }
    if (message === "") {
      showMessage("Please enter your message.", "error");
      return;
    }

    showMessage("Your message has been sent successfully!", "success");
    contactForm.reset();
  });
}

/* ================================
   MENU PAGE - LOAD & DISPLAY FOODS
================================ */
const menuContainer = document.getElementById("menuContainer");

async function loadFoods() {
  if (!menuContainer) {
    return;
  }

  try {
    const response = await fetch(`${API_URL}/api/foods`);
    const foods = await response.json();

    if (!response.ok) {
      throw new Error(foods.message || "Failed to load foods.");
    }

    displayFoods(foods);
  } catch (error) {
    console.error("Food loading error:", error);
    menuContainer.innerHTML = "<p>Cannot load menu from server.</p>";
  }
}

function displayFoods(foods) {
  menuContainer.innerHTML = "";

  const categories = {};

  foods.forEach(function (food) {
    if (!categories[food.category_name]) {
      categories[food.category_name] = [];
    }
    categories[food.category_name].push(food);
  });

  for (const categoryName in categories) {
    const categorySection = document.createElement("div");
    categorySection.className = "menu-category";

    categorySection.innerHTML = `<h2>${categoryName}</h2>
            <div class="food-grid"></div>`;

    const foodGrid = categorySection.querySelector(".food-grid");

    categories[categoryName].forEach(function (food) {
      const foodCard = document.createElement("article");
      foodCard.className = "food-card";

      const availabilityButton = food.is_available
        ? `<button
                        class="order-btn"
                        data-food-id="${food.id}"
                        data-name="${food.name}"
                        data-price="${food.price}">
                        Add to cart
                    </button>`
        : `<button class="order-btn" disabled>Sold Out</button>`;
      foodCard.innerHTML = `
                <img src="${food.image}" alt="${food.name}">
                <div class="food-info">
                    <h3>${food.name}</h3>
                    <p>${food.description || ""}</p>
                    <div class="food-bottom">
                        <span class="price">
                            $${Number(food.price).toFixed(2)}
                        </span>
                        ${availabilityButton}
                    </div>
                </div>`;

      foodGrid.appendChild(foodCard);
    });

    menuContainer.appendChild(categorySection);
  }

  addCartEvents();
}

/* ================================
   MENU PAGE - CART
================================ */
const cartItems = document.getElementById("cartItems");
const cartCount = document.getElementById("cartCount");
const cartTotal = document.getElementById("cartTotal");

function addCartEvents() {
  const orderButtons = document.querySelectorAll(".order-btn");

  orderButtons.forEach(function (button) {
    button.addEventListener("click", function () {
      const foodId = Number(button.dataset.foodId);
      const name = button.dataset.name;
      const price = Number(button.dataset.price);

      const existingItem = cart.find(function (item) {
        return item.food_id === foodId;
      });

      if (existingItem) {
        existingItem.quantity++;
      } else {
        cart.push({
          food_id: foodId,
          name: name,
          price: price,
          quantity: 1,
        });
      }

      saveCart();
      renderCart();
    });
  });
}

function renderCart() {
  if (!cartItems) {
    return;
  }

  cartItems.innerHTML = "";

  let total = 0;
  let count = 0;

  cart.forEach(function (item, index) {
    const itemTotal = item.price * item.quantity;
    total += itemTotal;
    count += item.quantity;

    const cartItem = document.createElement("div");
    cartItem.className = "cart-item";

    cartItem.innerHTML = `<div>
                <h3>${item.name}</h3>
                <p>$${item.price.toFixed(2)} × ${item.quantity}</p>
            </div>
            <div>
                <strong>$${itemTotal.toFixed(2)}</strong>
                <button class="remove-btn" data-index="${index}">
                    Remove
                </button>
            </div>`;

    cartItems.appendChild(cartItem);
  });

  if (cartCount) {
    cartCount.textContent = count;
  }

  if (cartTotal) {
    cartTotal.textContent = total.toFixed(2);
  }

  addRemoveEvents();
}

function addRemoveEvents() {
  const removeButtons = document.querySelectorAll(".remove-btn");

  removeButtons.forEach(function (button) {
    button.addEventListener("click", function () {
      const index = Number(button.dataset.index);
      cart.splice(index, 1);
      saveCart();
      renderCart();
    });
  });
}

/* ================================
   MENU PAGE - CHECKOUT BUTTON
================================ */
const checkoutButton = document.getElementById("checkoutButton");

if (checkoutButton) {
  checkoutButton.addEventListener("click", function () {
    if (cart.length === 0) {
      alert("Your cart is empty.");
      return;
    }
    window.location.href = "checkout.html";
  });
}

/* ================================
   CHECKOUT PAGE
================================ */
const checkoutForm = document.getElementById("checkoutForm");

if (checkoutForm) {
  // Form submit ကို လုံးဝ ပိတ်
  checkoutForm.addEventListener("submit", function (event) {
    event.preventDefault();
  });
  /* -------- Guest Mode Setup (Dine-in via QR) -------- */
  const guestTable = sessionStorage.getItem("dineInTable");

  if (guestTable) {
    const tableNumberValue = Number(guestTable);

    // Dine-in radio ကို auto-select
    const dineInRadio = document.querySelector(
      'input[name="orderType"][value="dine-in"]',
    );

    if (dineInRadio) {
      dineInRadio.checked = true;
    }

    // Table number input ကို auto-fill + read-only
    const tableInput = document.getElementById("tableNumber");
    if (tableInput) {
      tableInput.value = tableNumberValue;
      tableInput.readOnly = true;
    }

    // Notice ပြ
    const notice = document.getElementById("guestCheckoutNotice");
    const noticeTable = document.getElementById("guestCheckoutTable");

    if (notice && noticeTable) {
      noticeTable.textContent = tableNumberValue;
      notice.style.display = "block";
    }

    console.log(`Checkout Guest Mode — Table ${tableNumberValue}`);
  }

  const orderTypeInputs = document.querySelectorAll('input[name="orderType"]');
  const deliveryInfo = document.getElementById("deliveryInfo");
  const tableGroup = document.getElementById("tableGroup");
  const checkoutName = document.getElementById("checkoutName");
  const checkoutPhone = document.getElementById("checkoutPhone");
  const checkoutAddress = document.getElementById("checkoutAddress");
  const checkoutItems = document.getElementById("checkoutItems");
  const checkoutTotal = document.getElementById("checkoutTotal");
  const checkoutMessage = document.getElementById("checkoutMessage");
  const placeOrderButton = document.getElementById("placeOrderButton");

  /* -------- Order Type Switching -------- */
  function updateCheckoutFields() {
    const checkedInput = document.querySelector(
      'input[name="orderType"]:checked',
    );

    if (!checkedInput) {
      return;
    }

    const selectedOrderType = checkedInput.value;

    deliveryInfo.style.display = "none";
    tableGroup.style.display = "none";

    checkoutName.required = false;
    checkoutPhone.required = false;
    checkoutAddress.required = false;

    if (selectedOrderType === "dine-in") {
      tableGroup.style.display = "block";
    }

    if (selectedOrderType === "delivery") {
      deliveryInfo.style.display = "block";
      checkoutName.required = true;
      checkoutPhone.required = true;
      checkoutAddress.required = true;

      // ================================
      // Step 7C — Auto-fill
      // ================================
      const loggedInUserRaw = localStorage.getItem("loggedInUser");
      const savedInfoRaw = localStorage.getItem("deliveryInfo");

      // Name field — login ဝင်ထားရင် user.name နဲ့ ဖြည့် (အလွတ်ဖြစ်နေရင်ပဲ)
      if (loggedInUserRaw && checkoutName.value.trim() === "") {
        const user = JSON.parse(loggedInUserRaw);
        checkoutName.value = user.name;
      }

      // Phone / Address — save ထားရင် auto-fill (အလွတ်ဖြစ်နေရင်ပဲ)
      if (savedInfoRaw) {
        const saved = JSON.parse(savedInfoRaw);
        if (checkoutPhone.value.trim() === "" && saved.phone) {
          checkoutPhone.value = saved.phone;
        }
        if (checkoutAddress.value.trim() === "" && saved.address) {
          checkoutAddress.value = saved.address;
        }
      }

      // ================================
      // Login status ပြ
      // ================================
      const statusBox = document.getElementById("deliveryLoginStatus");
      if (statusBox) {
        if (loggedInUserRaw) {
          const user = JSON.parse(loggedInUserRaw);
          statusBox.innerHTML = `<p style="color: #16a34a; font-weight: 500; margin-bottom: 12px;">
                    ✅ Logged in as <strong>${user.name}</strong>
                </p>`;
        } else {
          statusBox.innerHTML = `<p style="color: #d97706; font-weight: 500; margin-bottom: 12px;">
                    ℹ️ You are ordering as a guest.
                </p>`;
        }
      }
    }
  }
  /* -------- Guest Mode: Order Type lock -------- */
  function applyGuestModeLock() {
    const guestTable = sessionStorage.getItem("dineInTable");

    if (!guestTable) {
      return;
    }

    // Dine-in ကလွဲပြီး ကျန်တဲ့ radio တွေကို disable
    orderTypeInputs.forEach(function (input) {
      if (input.value !== "dine-in") {
        input.disabled = true;
      }
    });
  }

  applyGuestModeLock();

  orderTypeInputs.forEach(function (input) {
    input.addEventListener("change", updateCheckoutFields);
  });

  updateCheckoutFields();

  /* -------- Checkout Cart Summary -------- */
  function renderCheckoutCart() {
    if (!checkoutItems || !checkoutTotal) {
      return;
    }

    checkoutItems.innerHTML = "";
    let total = 0;

    if (cart.length === 0) {
      checkoutItems.innerHTML = "<p>Your cart is empty.</p>";
      checkoutTotal.textContent = "0.00";
      return;
    }

    cart.forEach(function (item) {
      const itemTotal = item.price * item.quantity;
      total += itemTotal;

      const itemElement = document.createElement("div");
      itemElement.className = "checkout-item";

      itemElement.innerHTML = `<div>
                    <h3>${item.name}</h3>
                    <p>$${item.price.toFixed(2)} × ${item.quantity}</p>
                </div>
                <strong>$${itemTotal.toFixed(2)}</strong>`;

      checkoutItems.appendChild(itemElement);
    });

    checkoutTotal.textContent = total.toFixed(2);
  }

  renderCheckoutCart();

  /* -------- Place Order -------- */
  if (placeOrderButton) {
    placeOrderButton.addEventListener("click", async function (event) {
      event.preventDefault();

      if (cart.length === 0) {
        checkoutMessage.textContent = "Your cart is empty.";
        return;
      }

      const checkedInput = document.querySelector(
        'input[name="orderType"]:checked',
      );

      if (!checkedInput) {
        checkoutMessage.textContent = "Please select an order type.";
        return;
      }

      const selectedOrderType = checkedInput.value;

      // Payment method ဖတ်
      const paymentInput = document.querySelector(
        'input[name="paymentMethod"]:checked',
      );
      const selectedPaymentMethod = paymentInput ? paymentInput.value : "cash";

      const orderData = {
        order_type: selectedOrderType,
        payment_method: selectedPaymentMethod,
        items: cart.map(function (item) {
          return {
            food_id: item.food_id,
            quantity: item.quantity,
          };
        }),
      };

      const loggedInUserRaw = localStorage.getItem("loggedInUser");

      if (loggedInUserRaw) {
        const loggedInUser = JSON.parse(loggedInUserRaw);
        orderData.user_id = loggedInUser.id;
      }
      if (selectedOrderType === "dine-in") {
        const tableNumber = document.getElementById("tableNumber").value;

        if (!tableNumber) {
          checkoutMessage.textContent = "Please enter your table number.";
          return;
        }

        orderData.table_number = Number(tableNumber);
      }

      if (selectedOrderType === "delivery") {
        // ================================
        // GATE 1 — Login check (Gateway ပြ)
        // ================================
        const loggedInUserRaw = localStorage.getItem("loggedInUser");

        if (!loggedInUserRaw) {
          // Gateway ကို ပြ
          const gateway = document.getElementById("deliveryGateway");
          if (gateway) {
            gateway.style.display = "block";
            gateway.scrollIntoView({ behavior: "smooth", block: "center" });
          }

          checkoutMessage.textContent =
            "Please login or register to place a delivery order.";

          // Cart ကို localStorage မှာ သိမ်းထားပြီးသား
          // (redirect ဖြစ်လည်း မပျောက်)
          saveCart();

          return;
        }

        // ================================
        // GATE 2 — Form validation
        // ================================
        orderData.customer_name = checkoutName.value.trim();
        orderData.phone = checkoutPhone.value.trim();
        orderData.address = checkoutAddress.value.trim();

        if (
          !orderData.customer_name ||
          !orderData.phone ||
          !orderData.address
        ) {
          checkoutMessage.textContent = "Name, phone and address are required.";
          return;
        }

        // Gateway ကို ပြန်ဖျောက် (validation အောင်ရင်)
        const gateway = document.getElementById("deliveryGateway");
        if (gateway) {
          gateway.style.display = "none";
        }
      }

      checkoutMessage.textContent = "Placing your order...";

      try {
        const response = await fetch(`${API_URL}/api/orders`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(orderData),
        });

        const data = await response.json();

        if (!response.ok) {
          checkoutMessage.textContent =
            data.message || "Failed to place order.";
          return;
        }

        // Step 7C - Delivery info save (Payment method မရွေးခင် အရင် save)
        if (selectedOrderType === "delivery") {
          const saveCheckbox = document.getElementById("saveDeliveryInfo");
          if (saveCheckbox && saveCheckbox.checked) {
            localStorage.setItem(
              "deliveryInfo",
              JSON.stringify({
                phone: orderData.phone,
                address: orderData.address,
              }),
            );
          }
        }

        // ================================
        // Payment Method အလိုက် ခွဲ
        // ================================
        // ================================
// Tracking token ကို sessionStorage မှာ သိမ်း
// (track.html က ပြန်ဖတ်ဖို့)
// ================================
if (data.order.tracking_token) {
    sessionStorage.setItem(
        "orderTracking_" + data.order.id,
        data.order.tracking_token
    );
}
        const paymentMethod = data.order.payment_method;

        if (paymentMethod === "cash") {
          const trackingToken = sessionStorage.getItem("orderTracking_" + data.order.id) || data.order.tracking_token;
    checkoutMessage.innerHTML = `
        Order placed successfully! Order #${data.order.id}
        <br><br>
        <a href="track.html?id=${data.order.id}"
           style="display:inline-block; padding:10px 20px; background:#ffc107; color:#000; border-radius:6px; text-decoration:none; font-weight:600; margin-top:8px;">
            Track Order →
        </a>`;

    localStorage.removeItem("cart");
    cart = [];
    renderCheckoutCart();
} else {
          // KPay / WavePay → Modal ပြ
          showPaymentModal(data.order, paymentMethod);
        }
      } catch (error) {
        console.error("Order error:", error);
        checkoutMessage.textContent = "Cannot connect to server.";
      }
    });
  }
}

/* ================================
   GUEST MODE (Dine-in via QR Code)
================================ */
function getTableFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const table = params.get("table");

  if (!table) {
    return null;
  }

  const number = Number(table);

  if (!Number.isInteger(number) || number <= 0) {
    return null;
  }

  return number;
}

function setupGuestMode() {
  const tableNumber = getTableFromUrl();

  if (!tableNumber) {
    // QR scan မဟုတ်ရင် sessionStorage ကို ရှင်း
    sessionStorage.removeItem("dineInTable");
    return;
  }

  // Table number ကို sessionStorage မှာ သိမ်း
  // (checkout page က ဖတ်လို့ ရအောင်)
  sessionStorage.setItem("dineInTable", tableNumber);

  // Banner ပြ
  const banner = document.getElementById("guestBanner");
  const bannerNumber = document.getElementById("guestTableNumber");

  if (banner && bannerNumber) {
    bannerNumber.textContent = tableNumber;
    banner.style.display = "block";
  }

  console.log(`Guest Mode active — Table ${tableNumber}`);
}

setupGuestMode();

/* ================================
   INITIAL LOAD (Menu Page)
================================ */
loadFoods();
/* ================================
   PAYMENT MODAL — Mock Flow
================================ */

function showPaymentModal(order, paymentMethod) {
  const modal = document.getElementById("paymentModal");
  const title = document.getElementById("paymentModalTitle");
  const orderIdEl = document.getElementById("paymentModalOrderId");
  const amountEl = document.getElementById("paymentModalAmount");
  const appEl = document.getElementById("paymentModalApp");
  const qrEl = document.getElementById("paymentModalQr");

  if (!modal || !title || !orderIdEl || !amountEl || !appEl || !qrEl) {
    console.error("Payment modal elements missing.");
    return;
  }

  // Method အလိုက် label
  const methodLabel = paymentMethod === "kpay" ? "KPay" : "WavePay";

  title.textContent = methodLabel + " Payment";
  orderIdEl.textContent = order.id;
  amountEl.textContent = Number(order.total_amount).toFixed(2);
  appEl.textContent = methodLabel;

  // Mock QR — ကိုယ့် backend ကနေ generate
const mockPaymentUrl = `MOCK-${paymentMethod.toUpperCase()}-${order.id}-${order.total_amount}`;
qrEl.src = ""; // clear first

fetch(`${API_URL}/api/mock-qr?data=${encodeURIComponent(mockPaymentUrl)}`)
    .then(function (r) { return r.json(); })
    .then(function (data) {
        if (data.qr_data_url) {
            qrEl.src = data.qr_data_url;
        }
    })
    .catch(function (err) {
        console.error("QR load error:", err);
    });
  // Modal ပြ
  modal.style.display = "flex";

  // Buttons
  const paidBtn = document.getElementById("paymentPaidBtn");
  const cancelBtn = document.getElementById("paymentCancelBtn");

  // Listener အဟောင်း ဖျက် (duplicate မဖြစ်အောင်)
  paidBtn.replaceWith(paidBtn.cloneNode(true));
  cancelBtn.replaceWith(cancelBtn.cloneNode(true));

  const newPaidBtn = document.getElementById("paymentPaidBtn");
  const newCancelBtn = document.getElementById("paymentCancelBtn");

  newPaidBtn.addEventListener("click", async function () {
    // ================================
    // Payment token ကို sessionStorage ကနေ ဖတ်
    // ================================
    const trackingToken = sessionStorage.getItem(
        "orderTracking_" + order.id
    );

    if (!trackingToken) {
        alert("Session expired. Please refresh the page.");
        return;
    }

    paidBtn.disabled = true;
    cancelBtn.disabled = true;
    paidBtn.textContent = "Submitting...";

    const mockRef = `MOCK-${methodLabel.toUpperCase()}-${Date.now()}`;

    try {
        const response = await fetch(
            `${API_URL}/api/payments/${order.payment_id}`,
            {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    status: "awaiting_verification",
                    payment_token: trackingToken,
                    transaction_ref: mockRef,
                    gateway_response: JSON.stringify({
                        mock: true,
                        method: methodLabel,
                        ref: mockRef,
                        submitted_at: new Date().toISOString()
                    })
                })
            }
        );

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || "Payment update failed.");
        }

        if (modal) modal.style.display = "none";

        const checkoutMessage = document.getElementById("checkoutMessage");
        if (checkoutMessage) {
            checkoutMessage.innerHTML = 
                `✅ Payment submitted! Order #${order.id}<br>
                <span style="font-size:13px;">Waiting for staff to verify. You can track your order below.</span><br><br>
                <a href="track.html?id=${order.id}&token=${trackingToken}"
                   style="display:inline-block; padding:10px 20px; background:#16a34a; color:#fff; border-radius:6px; text-decoration:none; font-weight:600;">
                    Track Order →
                </a>`
            ;
        }

        localStorage.removeItem("cart");
        cart = [];
        renderCheckoutCart();

    } catch (error) {
        console.error("Payment error:", error);

        if (paidBtn) {
            paidBtn.disabled = false;
            paidBtn.textContent = "✅ I have paid";
        }
        if (cancelBtn) {
            cancelBtn.disabled = false;
        }

        alert("Payment failed: " + error.message);
    }
});

  newCancelBtn.addEventListener("click", function () {
    // Cancel — Order က Pending ကျန်
    // ⚠️ Cart ကို မဖျက်ရ — Customer က ပြန် retry လုပ်နိုင်ရမယ်
    modal.style.display = "none";

    const checkoutMessage = document.getElementById("checkoutMessage");
    if (checkoutMessage) {
        checkoutMessage.innerHTML =
            `⚠️ Order #${order.id} created but payment not completed.<br>
            <span style="font-size:13px;">You can pay later or contact staff.
            Your cart is still saved.</span><br><br>
            <a href="track.html?id=${order.id}"
               style="display:inline-block; padding:8px 18px; background:#ffc107; color:#000; border-radius:6px; text-decoration:none; font-weight:600; font-size:14px;">
                View Order →
            </a>`;
    }

    localStorage.removeItem("cart");
    cart = [];
    renderCheckoutCart();
  });
}

/* ================================
   SYNC CART ACROSS TABS
   (menu page က အခြား tab က ပြောင်းလဲမှုကို သိရမယ်)
================================ */

window.addEventListener("storage", function (event) {
    if (event.key === "cart") {
        try {
            cart = JSON.parse(event.newValue) || [];
            renderCart();
        } catch (e) {
            cart = [];
        }
    }
});

