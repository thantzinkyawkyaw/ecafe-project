require("dotenv").config();

const express = require("express");
const cors = require("cors");
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const path = require("path");
const QRCode = require("qrcode");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const helmet = require("helmet")
const compression = require("compression")
const morgan = require("morgan")
const crypto = require("crypto")

const app = express();

const PORT = process.env.PORT || 3000;
//production မှာ environment variable ထည့်ခြင်း
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

if(!JWT_SECRET) {
  console.error("❌FATAL:JWT_SEVRET is not set in .env file!");
  process.exit(1);
}
// Order status flow
const ORDER_STATUS_FLOW = {
  Pending: ["Accepted", "Cancelled"],
  Accepted: ["Preparing", "Cancelled"],
  Preparing: ["Ready", "Cancelled"],
  Ready: ["Completed"],
  Completed: [],
  Cancelled: [],
};

/* ================================
   CORS — Whitelist Only
================================ */
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "http://localhost:3000")
    .split(",")
    .map(function (s) { return s.trim(); })
    .filter(Boolean);

const corsOptions = {
    origin: function (origin, callback) {
        // Postman / mobile apps / curl — origin မပါ
        if (!origin) {
            return callback(null, true);
        }

        if (allowedOrigins.includes(origin)) {
            return callback(null, true);
        }

        console.warn("CORS blocked origin:", origin);
        return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    maxAge: 86400 // Preflight cache 24h
};

app.use(cors(corsOptions));

/* ================================
   COMPRESSION + LOGGING
================================ */
app.use(compression());

// HTTP logging (production: combined, dev: dev)
app.use(
    process.env.NODE_ENV === "production"
        ? morgan("combined")
        : morgan("dev")
);

/* ================================
   TRUST PROXY (Railway, Vercel, Nginx)
================================ */
app.set("trust proxy", 1);

/* ================================
   HTTPS REDIRECT (Production only)
================================ */
app.use(function (req, res, next) {
    if (process.env.NODE_ENV !== "production") {
        return next();
    }

    // Already HTTPS?
    if (req.secure || req.headers["x-forwarded-proto"] === "https") {
        return next();
    }

    // Health check ကို exempt
    if (req.path === "/health") {
        return next();
    }

    return res.redirect(301, "https://" + req.headers.host + req.url);
});

/* ================================
   AUDIT LOG HELPER
================================ */
function auditLog(userId, userRole, action, entityType, entityId, details, req) {
    try {
        db.prepare(
            `INSERT INTO audit_log
                (user_id, user_role, action, entity_type, entity_id, details, ip_address)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).run(
            userId || null,
            userRole || null,
            action,
            entityType || null,
            entityId || null,
            details ? JSON.stringify(details) : null,
            req ? (req.ip || null) : null
        );
    } catch (error) {
        console.error("Audit log failed:", error.message);
    }
}
/* ================================
   HELMET — Security Headers
================================ */
app.use(helmet({
    // API + Static files အတွက် — CSP ကို ချိန်ညှိ
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            // Inline styles (checkout.html မှာ style attribute ရှိတယ်)
            styleSrc: ["'self'", "'unsafe-inline'"],
            // Inline scripts (နောက်ပိုင်း inline event handlers ရှိနိုင်)
            scriptSrc: ["'self'", "'unsafe-inline'"],
            // QR image external API
            imgSrc: ["'self'", "data:", "blob:", "https://api.qrserver.com"],
            connectSrc: ["'self'", "http://localhost:3000","http://127.0.0.1:3000","ws://localhost:3000"],
            fontSrc: ["'self'"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'none'"]
        }
    },
    // Static file တွေ cross-origin ဖြစ်လို့ disable
    crossOriginResourcePolicy: { policy: "cross-origin" },
    // Referrer policy
    referrerPolicy: { policy: "no-referrer" }
}));
/* ================================
   REQUEST TIMEOUT — Slowloris protection
================================ */
app.use(function (req, res, next) {
    req.setTimeout(30000, function () {  // 30 seconds
        if (!res.headersSent) {
            res.status(408).json({ message: "Request timeout." });
        }
    });
    next();
});

// Hide "X-Powered-By: Express" header
app.disable("x-powered-by");
/* ================================
   BODY PARSER — with size limit
================================ */
app.use(express.json({ limit: "100kb" }));

// Block direct access to /server folder (security)
app.use("/server", function (req, res) {
  res.status(403).send("Forbidden");
});

// Serve frontend files (HTML, CSS, JS, images)
app.use(express.static(path.join(__dirname, "..")));
/* ================================
   RATE LIMITERS
================================ */

// Auth — strict (brute force)
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { message: "Too many login attempts. Please try again after 15 minutes." },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true
});

// Register — strict (bot prevention)
const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 5,
    message: { message: "Too many accounts created. Try again later." },
    standardHeaders: true,
    legacyHeaders: false
});

// Order create — moderate
const orderLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    message: { message: "Too many orders. Please slow down." }
});

// Payment update — strict
const paymentLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 5,
    message: { message: "Too many payment requests. Please slow down." }
});

// QR generation — DoS protection
const qrLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    message: { message: "Too many QR requests. Please slow down." }
});

// Tracking — prevent enumeration
const trackLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    message: { message: "Too many tracking requests." }
});

// Admin/Kitchen — moderate
const adminLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    message: { message: "Too many requests. Please slow down." }
});

// Global — DDoS protection
const globalLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 300,
    message: { message: "Too many requests. Please slow down." },
    standardHeaders: true,
    legacyHeaders: false
});

app.use(globalLimiter);
/* ================================
   VALIDATION HELPERS
================================ */

function isValidEmail(email) {
    if (typeof email !== "string") return false;
    const trimmed = email.trim();
    // Simple but practical email regex
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmed)) return false;
    if (trimmed.length > 254) return false;
    return true;
}

function isValidPhone(phone) {
    if (typeof phone !== "string") return false;
    const trimmed = phone.trim();
    // Myanmar + international formats
    // Allows: digits, spaces, +, -, (, )
    const phoneRegex = /^[\d\s+\-()]{7,20}$/;
    if (!phoneRegex.test(trimmed)) return false;
    // Must contain at least 7 digits
    const digitsOnly = trimmed.replace(/\D/g, "");
    if (digitsOnly.length < 7) return false;
    return true;
}

function isStrongPassword(password) {
    if (typeof password !== "string") return { valid: false, reason: "Password must be text." };

    if (password.length < 6) {
        return { valid: false, reason: "Password must be at least 6 characters." };
    }

    if (password.length > 100) {
        return { valid: false, reason: "Password is too long (max 100 characters)." };
    }

    // Weak password list
    const weakPasswords = [
        "123456", "1234567", "12345678", "password", "qwerty",
        "abc123", "111111", "123123", "admin123", "letmein"
    ];

    if (weakPasswords.includes(password.toLowerCase())) {
        return { valid: false, reason: "Password is too weak. Please choose a stronger one." };
    }

    // Must contain at least 1 letter
    if (!/[a-zA-Z]/.test(password)) {
        return { valid: false, reason: "Password must contain at least one letter." };
    }

    // Must contain at least 1 number
    if (!/\d/.test(password)) {
        return { valid: false, reason: "Password must contain at least one number." };
    }

    return { valid: true };
}

function isValidName(name) {
    if (typeof name !== "string") return false;
    const trimmed = name.trim();
    if (trimmed.length < 2) return false;
    if (trimmed.length > 100) return false;
    return true;
}

function isValidId(id) {
    const num = Number(id);
    return Number.isInteger(num) && num > 0;
}
// Database
const db = new Database(path.join(__dirname, "restaurant.db"));
// SQLite production tuning
db.pragma("journal_mode = WAL");        // Concurrent reads + crash safety
db.pragma("foreign_keys = ON");          // FK enforcement
db.pragma("synchronous = NORMAL");       // Performance vs durability balance
db.pragma("busy_timeout = 5000");        // 5s wait on lock

console.log("SQLite: WAL mode enabled, foreign keys ON");
// Create users table
db.prepare(
  `
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL
    )
`,
).run();

// Create categories table
db.prepare(
  `
    CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL
    )`,
).run();

// Create foods table
db.prepare(
  `
    CREATE TABLE IF NOT EXISTS foods (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        price REAL NOT NULL,
        image TEXT,
        is_available INTEGER NOT NULL DEFAULT 1,
        FOREIGN KEY (category_id) REFERENCES categories(id)
    )`,
).run();
db.prepare(
  `CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        order_type TEXT NOT NULL,
        customer_name TEXT NOT NULL,
        phone TEXT NOT NULL,
        address TEXT,
        table_number INTEGER,
        status TEXT NOT NULL DEFAULT 'Pending',
        total_amount REAL NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
    )`,
).run();

db.prepare(
  `CREATE TABLE IF NOT EXISTS order_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        food_id INTEGER NOT NULL,
        food_name TEXT NOT NULL,
        price REAL NOT NULL,
        quantity INTEGER NOT NULL,
        subtotal REAL NOT NULL,
        FOREIGN KEY (order_id) REFERENCES orders(id),
        FOREIGN KEY (food_id) REFERENCES foods(id)
    )`,
).run();
// Create restaurant_tables table
db.prepare(
  `CREATE TABLE IF NOT EXISTS restaurant_tables (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        table_number INTEGER UNIQUE NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
).run();
// Create payments table
db.prepare(
  `CREATE TABLE IF NOT EXISTS payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        method TEXT NOT NULL,
        amount REAL NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        transaction_ref TEXT,
        gateway_response TEXT,
        paid_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (order_id) REFERENCES orders(id)
    )`,
).run();

// Indexes for performance
db.prepare(
  `CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id)`,
).run();

db.prepare(
  `CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status)`,
).run();
/* ================================
   MIGRATION — users.role column
   (ရှိပြီးသား data မပျက်အောင်)
================================ */

const userColumns = db.prepare("PRAGMA table_info(users)").all();
const hasRoleColumn = userColumns.some(function (col) {
  return col.name === "role";
});

if (!hasRoleColumn) {
  console.log("Running migration: adding 'role' column to users table...");

  db.prepare(
    `ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'customer'`,
  ).run();

  console.log("Migration complete: 'role' column added.");
} else {
  console.log("Migration skipped: 'role' column already exists.");
}

// Helper: column ရှိပြီးသားလား စစ်
function hasColumn(table, column) {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all();
    return cols.some(function (c) { return c.name === column; });
}

// ----- users: token_version -----
if (!hasColumn("users", "token_version")) {
    db.prepare(
        `ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0`
    ).run();
    console.log("Migration: users.token_version added");
}

// ----- users: must_change_password -----
if (!hasColumn("users", "must_change_password")) {
    db.prepare(
        `ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0`
    ).run();
    console.log("Migration: users.must_change_password added");
}

// ----- users: last_login_at -----
if (!hasColumn("users", "last_login_at")) {
    db.prepare(
        `ALTER TABLE users ADD COLUMN last_login_at TEXT`
    ).run();
    console.log("Migration: users.last_login_at added");
}

// ----- orders: tracking_token -----
if (!hasColumn("orders", "tracking_token")) {
    db.prepare(
        `ALTER TABLE orders ADD COLUMN tracking_token TEXT`
    ).run();

    // Existing orders အားလုံးအတွက် token generate
    const orders = db.prepare(
        `SELECT id FROM orders WHERE tracking_token IS NULL`
    ).all();

    const updateToken = db.prepare(
        `UPDATE orders SET tracking_token = ? WHERE id = ?`
    );

    orders.forEach(function (o) {
        const token = crypto.randomBytes(16).toString("hex");
        updateToken.run(token, o.id);
    });

    console.log(`Migration: orders.tracking_token added (${orders.length} tokens generated)`);
}

// Unique index for tracking_token
db.prepare(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_tracking_token
     ON orders(tracking_token) WHERE tracking_token IS NOT NULL`
).run();

// ----- payments: verification columns -----
if (!hasColumn("payments", "verified_by")) {
    db.prepare(
        `ALTER TABLE payments ADD COLUMN verified_by INTEGER`
    ).run();
    console.log("Migration: payments.verified_by added");
}

if (!hasColumn("payments", "verified_at")) {
    db.prepare(
        `ALTER TABLE payments ADD COLUMN verified_at TEXT`
    ).run();
    console.log("Migration: payments.verified_at added");
}

if (!hasColumn("payments", "rejection_reason")) {
    db.prepare(
        `ALTER TABLE payments ADD COLUMN rejection_reason TEXT`
    ).run();
    console.log("Migration: payments.rejection_reason added");
}

// ----- payments status update: awaiting_verification -----
// SQLite CHECK constraint မရှိတဲ့အတွက် code ထဲမှာ validate လုပ်ပါမယ်

/* ================================
   AUDIT LOG TABLE
================================ */

db.prepare(
    `CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        user_role TEXT,
        action TEXT NOT NULL,
        entity_type TEXT,
        entity_id INTEGER,
        details TEXT,
        ip_address TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`
).run();

db.prepare(
    `CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id)`
).run();

db.prepare(
    `CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action)`
).run();

db.prepare(
    `CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at)`
).run();
/* ================================
   SEED — Default Admin User
================================ */

const adminEmail = "admin@goldenspoon.com";

const existingAdmin = db
  .prepare(`SELECT id FROM users WHERE email = ?`)
  .get(adminEmail);

if (!existingAdmin) {
  const defaultAdminPassword = bcrypt.hashSync("admin123", 10);

  db.prepare(
    `INSERT INTO users (name, email, password, role)
         VALUES (?, ?, ?, ?)`,
  ).run("Admin", adminEmail, defaultAdminPassword, "admin");

  console.log("Default admin created: admin@goldenspoon.com / admin123");
  console.log("⚠️ Please change this password after first login!");
} else {
  console.log("Admin user already exists. Skipping seed.");
}

/* ================================
   SEED — Default Kitchen User
================================ */

const kitchenEmail = "kitchen@goldenspoon.com";

const existingKitchen = db
  .prepare(`SELECT id FROM users WHERE email = ?`)
  .get(kitchenEmail);

if (!existingKitchen) {
  const defaultKitchenPassword = bcrypt.hashSync("kitchen123", 10);

  db.prepare(
    `INSERT INTO users (name, email, password, role)
         VALUES (?, ?, ?, ?)`,
  ).run("Kitchen Staff", kitchenEmail, defaultKitchenPassword, "kitchen");

  console.log("Default kitchen created: kitchen@goldenspoon.com / kitchen123");
} else {
  console.log("Kitchen user already exists. Skipping seed.");
}

/* ================================
   AUTH MIDDLEWARE
================================ */

function verifyToken(req, res, next) {
    const authHeader = req.headers["authorization"];

    if (!authHeader) {
        return res.status(401).json({
            message: "No token provided."
        });
    }

    const parts = authHeader.split(" ");

    if (parts.length !== 2 || parts[0] !== "Bearer") {
        return res.status(401).json({
            message: "Invalid token format."
        });
    }

    const token = parts[1];

    try {
        const decoded = jwt.verify(token, JWT_SECRET);

        // ================================
        // TOKEN VERSION CHECK
        // Logout / password change ဖြစ်ရင် token invalid
        // ================================
        const user = db.prepare(
            `SELECT id, token_version FROM users WHERE id = ?`
        ).get(decoded.id);

        if (!user) {
            return res.status(401).json({
                message: "User no longer exists."
            });
        }

        if ((user.token_version || 0) !== (decoded.token_version || 0)) {
            return res.status(401).json({
                message: "Session expired. Please login again."
            });
        }

        req.user = decoded;
        next();

    } catch (error) {
        return res.status(401).json({
            message: "Invalid or expired token."
        });
    }
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({
      message: "Admin access required.",
    });
  }
  next();
}

function requireKitchen(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      message: "Authentication required.",
    });
  }

  if (req.user.role !== "kitchen" && req.user.role !== "admin") {
    return res.status(403).json({
      message: "Kitchen access required.",
    });
  }

  next();
}
// Test route
app.get("/", function (req, res) {
  res.send("Golden Spoon Backend is running!");
});

// Get all categories
app.get("/api/categories", function (req, res) {
  try {
    const categories = db
      .prepare(
        `SELECT * FROM categories
            ORDER BY id ASC`,
      )
      .all();

    res.json(categories);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Failed to get categories.",
    });
  }
});

// Create category
app.post("/api/categories", verifyToken, requireAdmin, function (req, res) {
  const { name } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({
      message: "Category name is required.",
    });
  }

  try {
    const statement = db.prepare(
      `INSERT INTO categories (name)
            VALUES (?)`,
    );

    const result = statement.run(name.trim());

    res.status(201).json({
      message: "Category created successfully!",
      category: {
        id: result.lastInsertRowid,
        name: name.trim(),
      },
    });
  } catch (error) {
    if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
      return res.status(409).json({
        message: "Category already exists.",
      });
    }

    console.error(error);

    res.status(500).json({
      message: "Failed to create category.",
    });
  }
});

// Create food
app.post("/api/foods", verifyToken, requireAdmin, function (req, res) {
  const { category_id, name, description, price, image } = req.body;

  if (!category_id || !name || price === undefined) {
    return res.status(400).json({
      message: "Category, name and price are required.",
    });
  }

  if (Number(price) < 0) {
    return res.status(400).json({
      message: "Price cannot be negative.",
    });
  }

  try {
    // Check category exists
    const category = db
      .prepare(
        `SELECT id FROM categories
            WHERE id = ?`,
      )
      .get(category_id);

    if (!category) {
      return res.status(404).json({
        message: "Category not found.",
      });
    }

    const statement = db.prepare(
      `INSERT INTO foods (
                category_id,
                name,
                description,
                price,
                image
            )
            VALUES (?, ?, ?, ?, ?)`,
    );

    const result = statement.run(
      category_id,
      name.trim(),
      description || "",
      Number(price),
      image || "",
    );

    res.status(201).json({
      message: "Food created successfully!",
      food: {
        id: result.lastInsertRowid,
        category_id: Number(category_id),
        name: name.trim(),
        description: description || "",
        price: Number(price),
        image: image || "",
        is_available: 1,
      },
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Failed to create food.",
    });
  }
});
//API order
// Create order
app.post("/api/orders",orderLimiter, function (req, res) {
  const {
    user_id,
    order_type,
    customer_name,
    phone,
    address,
    table_number,
    payment_method,
    items,
  } = req.body;

  /* ================================
       STEP 1 — Basic Validation
    ================================= */

  if (!order_type) {
    return res.status(400).json({
      message: "Order type is required.",
    });
  }

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({
      message: "Cart is empty.",
    });
  }

  const validOrderTypes = ["dine-in", "takeaway", "delivery"];

  if (!validOrderTypes.includes(order_type)) {
    return res.status(400).json({
      message: "Invalid order type.",
    });
  }

  if (order_type === "delivery") {
    if (!customer_name || !phone || !address) {
        return res.status(400).json({
            message: "Name, phone and address are required for delivery."
        });
    }

    if (!isValidName(customer_name)) {
        return res.status(400).json({
            message: "Name must be between 2 and 100 characters."
        });
    }

    if (!isValidPhone(phone)) {
        return res.status(400).json({
            message: "Please enter a valid phone number."
        });
    }

    if (address.trim().length < 5) {
        return res.status(400).json({
            message: "Address must be at least 5 characters."
        });
    }

    if (address.trim().length > 500) {
        return res.status(400).json({
            message: "Address is too long (max 500 characters)."
        });
    }
}

  if (order_type === "dine-in") {
    if (!table_number) {
      return res.status(400).json({
        message: "Table number is required for dine-in.",
      });
    }
  }

  /* ================================
       STEP 2 — Validate quantities
    ================================= */

  for (const item of items) {
    if (!item.food_id) {
      return res.status(400).json({
        message: "Each cart item must have a food_id.",
      });
    }

    const quantity = Number(item.quantity);

    if (!Number.isInteger(quantity) || quantity <= 0) {
      return res.status(400).json({
        message: "Invalid quantity.",
      });
    }
  }

  /* ================================
       STEP 3 — Validate foods & calculate total
       (DB write မလုပ်ခင် အရင်စစ်ဆေး)
    ================================= */

  const orderItems = [];
  let totalAmount = 0;

  for (const item of items) {
    const food = db
      .prepare(
        `SELECT id, name, price, is_available
             FROM foods
             WHERE id = ?`,
      )
      .get(item.food_id);

    if (!food) {
      return res.status(404).json({
        message: `Food with ID ${item.food_id} not found.`,
      });
    }

    if (food.is_available !== 1) {
      return res.status(400).json({
        message: `${food.name} is currently sold out.`,
      });
    }

    const quantity = Number(item.quantity);
    const subtotal = food.price * quantity;
    totalAmount += subtotal;

    orderItems.push({
      food_id: food.id,
      food_name: food.name,
      price: food.price,
      quantity: quantity,
      subtotal: subtotal,
    });
  }

  /* ================================
       STEP 4 — Insert atomically (transaction)
       order + order_items နှစ်ခုလုံး အောင်မြင်မှ သိမ်း
    ================================= */

  try {
    const createOrder = db.transaction(function () {
      const orderResult = db
        .prepare(
          `INSERT INTO orders (
                    user_id,
                    order_type,
                    customer_name,
                    phone,
                    address,
                    table_number,
                    status,
                    total_amount
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          user_id || null,
          order_type,
          customer_name || "",
          phone || "",
          address || "",
          table_number || null,
          "Pending",
          totalAmount,
        );

      const orderId = orderResult.lastInsertRowid;
      const itemStatement = db.prepare(
        `INSERT INTO order_items (
                    order_id,
                    food_id,
                    food_name,
                    price,
                    quantity,
                    subtotal
                )
                VALUES (?, ?, ?, ?, ?, ?)`,
      );

      for (const item of orderItems) {
        itemStatement.run(
          orderId,
          item.food_id,
          item.food_name,
          item.price,
          item.quantity,
          item.subtotal,
        );
      }

      // ================================
      // Create payment record
      // ================================
      const validPaymentMethods = ["cash", "kpay", "wavepay"];
      const finalPaymentMethod = validPaymentMethods.includes(payment_method)
        ? payment_method
        : "cash";

      const paymentResult = db
        .prepare(
          `INSERT INTO payments (
        order_id, method, amount, status
    )
    VALUES (?, ?, ?, ?)`,
        )
        .run(orderId, finalPaymentMethod, totalAmount, "pending");

      // Tracking token generate
    const trackingToken = crypto.randomBytes(16).toString("hex");
    db.prepare(
        `UPDATE orders SET tracking_token = ? WHERE id = ?`
    ).run(trackingToken, orderId);

    return {
        orderId: orderId,
        paymentId: paymentResult.lastInsertRowid,
        paymentMethod: finalPaymentMethod,
        trackingToken: trackingToken
    };
});

    const result = createOrder();
    const orderId = result.orderId;
    const paymentId = result.paymentId;
    const finalPaymentMethod = result.paymentMethod;
    const trackingToken = result.trackingToken;

    res.status(201).json({
      message: "Order created successfully!",
      order: {
        id: orderId,
        order_type: order_type,
        status: "Pending",
        total_amount: totalAmount,
        payment_id: paymentId,
        payment_method: finalPaymentMethod,
        payment_status: "pending",
        tracking_token: trackingToken
      },
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Failed to create order.",
    });
  }
});

app.get("/api/foods", function (req, res) {
  try {
    const foods = db
      .prepare(
        `SELECT
                foods.id,
                foods.name,
                foods.description,
                foods.price,
                foods.image,
                foods.is_available,
                categories.id AS category_id,
                categories.name AS category_name
            FROM foods
            JOIN categories
                ON foods.category_id = categories.id
            ORDER BY foods.id ASC`,
      )
      .all();

    res.json(foods);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Failed to get foods.",
    });
  }
});

//Sold out,Available
app.patch("/api/foods/:id/availability", function (req, res) {
  const foodId = Number(req.params.id);
  const { is_available } = req.body;

  if (!Number.isInteger(foodId)) {
    return res.status(400).json({
      message: "Invalid food ID.",
    });
  }

  if (is_available !== 0 && is_available !== 1) {
    return res.status(400).json({
      message: "is_available must be 0 or 1.",
    });
  }

  try {
    const food = db
      .prepare(
        `SELECT id
            FROM foods
            WHERE id = ?`,
      )
      .get(foodId);

    if (!food) {
      return res.status(404).json({
        message: "Food not found.",
      });
    }

    db.prepare(
      `UPDATE foods
            SET is_available = ?
            WHERE id = ?`,
    ).run(is_available, foodId);

    res.json({
      message: "Food availability updated successfully!",
      food_id: foodId,
      is_available: is_available,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Failed to update food availability.",
    });
  }
});
// Register API
app.post("/api/register", authLimiter, async function (req, res) {

    const { name, email, password } = req.body;

    // ================================
    // Validation
    // ================================
    if (!name || !email || !password) {
        return res.status(400).json({
            message: "All fields are required."
        });
    }

    if (!isValidName(name)) {
        return res.status(400).json({
            message: "Name must be between 2 and 100 characters."
        });
    }

    if (!isValidEmail(email)) {
        return res.status(400).json({
            message: "Please enter a valid email address."
        });
    }

    const passwordCheck = isStrongPassword(password);

    if (!passwordCheck.valid) {
        return res.status(400).json({
            message: passwordCheck.reason
        });
    }

  try {
    const cleanName = name.trim();
const cleanEmail = email.trim().toLowerCase();
const hashedPassword = await bcrypt.hash(password, 10);

const statement = db.prepare(
    `INSERT INTO users (name, email, password, role)
     VALUES (?, ?, ?, ?)`
);

statement.run(cleanName, cleanEmail, hashedPassword, "customer");

    res.status(201).json({
      message: "Account created successfully!",
    });
  } catch (error) {
    if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
      return res.status(409).json({
        message: "Email already exists.",
      });
    }

    res.status(500).json({
      message: "Something went wrong.",
    });
  }
});
//Login API
app.post("/api/login", authLimiter, async function (req, res) {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({
            message: "Email and password are required."
        });
    }

    if (!isValidEmail(email)) {
        return res.status(401).json({
            message: "Invalid email or password."
        });
    }

    try {
        const cleanEmail = email.trim().toLowerCase();

        const user = db.prepare(
            `SELECT * FROM users
            WHERE email = ?`
        ).get(cleanEmail);

    if (!user) {
      return res.status(401).json({
        message: "Invalid email or password.",
      });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
      return res.status(401).json({
        message: "Invalid email or password.",
      });
    }

    db.prepare(`UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?`).run(user.id);
    // JWT token create
    const tokenPayload = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role || "customer",
      token_version: user.token_version || 0
    };

    const token = jwt.sign(tokenPayload, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN,
    });

    res.json({
      message: "Login successful!",
      token: token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role || "customer",
        must_change_password: user.must_change_password || 0
      },
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Something went wrong.",
    });
  }
});

/* ================================
   RESTAURANT TABLES API
================================ */

// Get all tables
app.get("/api/tables", function (req, res) {
  try {
    const tables = db
      .prepare(
        `SELECT * FROM restaurant_tables
             ORDER BY table_number ASC`,
      )
      .all();

    res.json(tables);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Failed to get tables.",
    });
  }
});

// Create a new table
app.post("/api/tables", verifyToken, requireAdmin, function (req, res) {
  const { table_number } = req.body;

  if (table_number === undefined || table_number === null) {
    return res.status(400).json({
      message: "Table number is required.",
    });
  }

  const number = Number(table_number);

  if (!Number.isInteger(number) || number <= 0) {
    return res.status(400).json({
      message: "Table number must be a positive integer.",
    });
  }

  try {
    const result = db
      .prepare(
        `INSERT INTO restaurant_tables (table_number)
             VALUES (?)`,
      )
      .run(number);

    res.status(201).json({
      message: "Table created successfully!",
      table: {
        id: result.lastInsertRowid,
        table_number: number,
        is_active: 1,
      },
    });
  } catch (error) {
    if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
      return res.status(409).json({
        message: "Table number already exists.",
      });
    }

    console.error(error);
    res.status(500).json({
      message: "Failed to create table.",
    });
  }
});

// Delete a table
app.delete("/api/tables/:id", verifyToken, requireAdmin, function (req, res) {
  const tableId = Number(req.params.id);

  if (!Number.isInteger(tableId)) {
    return res.status(400).json({
      message: "Invalid table ID.",
    });
  }

  try {
    const result = db
      .prepare(`DELETE FROM restaurant_tables WHERE id = ?`)
      .run(tableId);

    if (result.changes === 0) {
      return res.status(404).json({
        message: "Table not found.",
      });
    }

    res.json({
      message: "Table deleted successfully.",
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Failed to delete table.",
    });
  }
});

// Generate QR code for a table
// Returns a data URL (base64 PNG image) that can be used in <img src="...">
app.get("/api/tables/:id/qr", async function (req, res) {
  const tableId = Number(req.params.id);

  if (!Number.isInteger(tableId)) {
    return res.status(400).json({
      message: "Invalid table ID.",
    });
  }

  try {
    const table = db
      .prepare(`SELECT * FROM restaurant_tables WHERE id = ?`)
      .get(tableId);

    if (!table) {
      return res.status(404).json({
        message: "Table not found.",
      });
    }

    // Frontend URL — ဒီနေရာကို ပြောင်းရင် QR က လိုက်ပြောင်းမယ်
    const FRONTEND_URL = "http://localhost:5500";

    const targetUrl = `${FRONTEND_URL}/menu.html?table=${table.table_number}`;

    const qrDataUrl = await QRCode.toDataURL(targetUrl, {
      width: 400,
      margin: 2,
      color: {
        dark: "#000000",
        light: "#FFFFFF",
      },
    });

    res.json({
      table_id: table.id,
      table_number: table.table_number,
      target_url: targetUrl,
      qr_data_url: qrDataUrl,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Failed to generate QR code.",
    });
  }
});

/* ================================
   PAYMENT API
================================ */

// Get all payments (Admin အတွက်)
app.get("/api/payments", function (req, res) {
  try {
    const payments = db
      .prepare(
        `SELECT
                p.*,
                o.order_type,
                o.status AS order_status
             FROM payments p
             JOIN orders o ON o.id = p.order_id
             ORDER BY p.id DESC`,
      )
      .all();

    res.json(payments);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Failed to get payments.",
    });
  }
});

// Get payment by order ID
app.get("/api/orders/:orderId/payment", function (req, res) {
  const orderId = Number(req.params.orderId);

  if (!Number.isInteger(orderId)) {
    return res.status(400).json({
      message: "Invalid order ID.",
    });
  }

  try {
    const payment = db
      .prepare(
        `SELECT * FROM payments
             WHERE order_id = ?
             ORDER BY id DESC
             LIMIT 1`,
      )
      .get(orderId);

    if (!payment) {
      return res.status(404).json({
        message: "Payment not found for this order.",
      });
    }

    res.json(payment);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Failed to get payment.",
    });
  }
});

// ================================
// Update payment status
// Customer: pending → awaiting_verification (token လိုတယ်)
// Admin: awaiting_verification → paid / rejected
// ================================
app.patch("/api/payments/:id", paymentLimiter, function (req, res) {
    const paymentId = Number(req.params.id);
    const {
        status,
        transaction_ref,
        gateway_response,
        payment_token,        // Customer အတွက်
        rejection_reason      // Admin reject အတွက်
    } = req.body;

    if (!Number.isInteger(paymentId)) {
        return res.status(400).json({ message: "Invalid payment ID." });
    }

    // ================================
    // Determine access mode
    // ================================
    const authHeader = req.headers["authorization"];
    let isAdmin = false;
    let adminUser = null;

    if (authHeader) {
        // Try admin auth
        const parts = authHeader.split(" ");
        if (parts.length === 2 && parts[0] === "Bearer") {
            try {
                const decoded = jwt.verify(parts[1], JWT_SECRET);

                // Token version check
                const user = db.prepare(
                    `SELECT id, token_version, role FROM users WHERE id = ?`
                ).get(decoded.id);

                if (user && (user.token_version || 0) === (decoded.token_version || 0)) {
                    if (user.role === "admin" || user.role === "kitchen") {
                        isAdmin = true;
                        adminUser = decoded;
                    }
                }
            } catch (e) {
                // Invalid token — continue as customer
            }
        }
    }

    // ================================
    // Load payment + order
    // ================================
    const payment = db.prepare(
        `SELECT p.*, o.tracking_token
         FROM payments p
         JOIN orders o ON o.id = p.order_id
         WHERE p.id = ?`
    ).get(paymentId);

    if (!payment) {
        return res.status(404).json({ message: "Payment not found." });
    }

    // ================================
    // AUTHORIZATION LOGIC
    // ================================

    // ---- CUSTOMER PATH ----
    if (!isAdmin) {
        // Customer က "awaiting_verification" ပဲ လုပ်နိုင်တယ်
        if (status !== "awaiting_verification") {
            return res.status(403).json({
                message: "Customer can only submit payment for verification."
            });
        }

        // Payment status က "pending" ဖြစ်ရမယ်
        if (payment.status !== "pending") {
            return res.status(400).json({
                message: `Payment already ${payment.status}.`
            });
        }

        // Payment token check — order tracking token နဲ့ ကိုက်ရမယ်
        if (!payment_token || payment_token !== payment.tracking_token) {
            return res.status(403).json({
                message: "Invalid payment token."
            });
        }

        // Update → awaiting_verification
        db.prepare(
            `UPDATE payments
             SET status = 'awaiting_verification',
                 transaction_ref = COALESCE(?, transaction_ref),
                 gateway_response = COALESCE(?, gateway_response)
             WHERE id = ?`
        ).run(
            transaction_ref || null,
            gateway_response || null,
            paymentId
        );

        auditLog(
            null, "customer",
            "payment.submitted_for_verification",
            "payment", paymentId,
            { order_id: payment.order_id, amount: payment.amount, method: payment.method },
            req
        );

        return res.json({
            message: "Payment submitted. Waiting for staff verification.",
            payment_id: paymentId,
            status: "awaiting_verification"
        });
    }

    // ---- ADMIN PATH ----
    // Admin က "paid", "rejected", "refunded" လုပ်နိုင်တယ်
    const adminAllowed = ["paid", "rejected", "refunded"];
    if (!adminAllowed.includes(status)) {
        return res.status(400).json({
            message: "Admin can set status to paid, rejected, or refunded."
        });
    }

    // State transition validation
    // pending → (customer က awaiting_verification လုပ်ရမယ်)
    // awaiting_verification → paid / rejected
    // paid → refunded
    const currentStatus = payment.status;
    const isCashPending = payment.method === "cash" && currentStatus === "pending";

    if (status === "paid" && currentStatus !== "awaiting_verification" && !isCashPending) {
        return res.status(400).json({
            message: `Cannot mark as paid. Current status: ${currentStatus}.`
        });
    }

    if (status === "rejected" && currentStatus !== "awaiting_verification") {
        return res.status(400).json({
            message: `Cannot reject. Current status: ${currentStatus}.`
        });
    }

    if (status === "refunded" && currentStatus !== "paid") {
        return res.status(400).json({
            message: `Can only refund paid payments. Current: ${currentStatus}.`
        });
    }

    const paidAt = status === "paid"
        ? new Date().toISOString()
        : null;

    const verifiedAt = new Date().toISOString();

    db.prepare(
        `UPDATE payments
         SET status = ?,
             transaction_ref = COALESCE(?, transaction_ref),
             gateway_response = COALESCE(?, gateway_response),
             paid_at = COALESCE(?, paid_at),
             verified_by = ?,
             verified_at = ?,
             rejection_reason = ?
         WHERE id = ?`
    ).run(
        status,
        transaction_ref || null,
        gateway_response || null,
        paidAt,
        adminUser.id,
        verifiedAt,
        status === "rejected" ? (rejection_reason || "Rejected by staff") : null,
        paymentId
    );

    auditLog(
        adminUser.id, adminUser.role,
        `payment.${status}`,
        "payment", paymentId,
        {
            order_id: payment.order_id,
            amount: payment.amount,
            method: payment.method,
            reason: rejection_reason || null
        },
        req
    );

    res.json({
        message: `Payment ${status}.`,
        payment_id: paymentId,
        status: status,
        verified_by: adminUser.name
    });
});

/* ================================
   AUTH TEST ROUTES
================================ */

app.get("/api/auth/me", verifyToken, function (req, res) {
  res.json({
    message: "Token valid.",
    user: req.user,
  });
});

app.get("/api/admin/test", verifyToken, requireAdmin, function (req, res) {
  res.json({
    message: "Admin access granted.",
    admin: req.user,
  });
});

/* ================================
   ADMIN — Dashboard Stats
================================ */

app.get("/api/admin/dashboard", verifyToken, requireAdmin, function (req, res) {
  try {
    const todayOrders = db
      .prepare(
        `SELECT COUNT(*) AS c FROM orders
             WHERE DATE(created_at) = DATE('now')`,
      )
      .get();

    const todayRevenue = db
      .prepare(
        `SELECT COALESCE(SUM(total_amount), 0) AS total
             FROM orders
             WHERE DATE(created_at) = DATE('now')
               AND status != 'Cancelled'`,
      )
      .get();

    const pendingOrders = db
      .prepare(
        `SELECT COUNT(*) AS c FROM orders
             WHERE status IN ('Pending', 'Accepted', 'Preparing', 'Ready')`,
      )
      .get();

    const totalCustomers = db
      .prepare(`SELECT COUNT(*) AS c FROM users WHERE role = 'customer'`)
      .get();

    const totalFoods = db.prepare(`SELECT COUNT(*) AS c FROM foods`).get();

    const paidRevenue = db
      .prepare(
        `SELECT COALESCE(SUM(amount), 0) AS total
             FROM payments WHERE status = 'paid'`,
      )
      .get();

    const pendingPayments = db
      .prepare(`SELECT COUNT(*) AS c FROM payments WHERE status = 'pending'`)
      .get();

    res.json({
      today_orders: todayOrders.c,
      today_revenue: todayRevenue.total,
      pending_orders: pendingOrders.c,
      total_customers: totalCustomers.c,
      total_foods: totalFoods.c,
      paid_revenue: paidRevenue.total,
      pending_payments: pendingPayments.c,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Failed to load dashboard.",
    });
  }
});

/* ================================
   ADMIN — Food Edit / Delete
================================ */

// Update food
app.put("/api/foods/:id", verifyToken, requireAdmin, function (req, res) {
  const foodId = Number(req.params.id);
  const { category_id, name, description, price, image, is_available } =
    req.body;

  if (!Number.isInteger(foodId)) {
    return res.status(400).json({ message: "Invalid food ID." });
  }

  if (!category_id || !name || price === undefined) {
    return res.status(400).json({
        message: "Category, name and price are required."
    });
}

if (!isValidName(name)) {
    return res.status(400).json({
        message: "Food name must be between 2 and 100 characters."
    });
}

const priceNum = Number(price);

if (!Number.isFinite(priceNum) || priceNum < 0) {
    return res.status(400).json({
        message: "Price must be a valid number."
    });
}

if (priceNum > 1000000) {
    return res.status(400).json({
        message: "Price is too high."
    });
}

  try {
    const food = db.prepare(`SELECT id FROM foods WHERE id = ?`).get(foodId);
    if (!food) {
      return res.status(404).json({ message: "Food not found." });
    }

    const category = db
      .prepare(`SELECT id FROM categories WHERE id = ?`)
      .get(category_id);
    if (!category) {
      return res.status(404).json({ message: "Category not found." });
    }

    const availability =
      is_available === 0 || is_available === 1 ? is_available : 1;

    db.prepare(
      `UPDATE foods
             SET category_id = ?, name = ?, description = ?, price = ?, image = ?, is_available = ?
             WHERE id = ?`,
    ).run(
      category_id,
      name.trim(),
      description || "",
      Number(price),
      image || "",
      availability,
      foodId,
    );

    res.json({
      message: "Food updated successfully!",
      food_id: foodId,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to update food." });
  }
});

// Delete food
app.delete("/api/foods/:id", verifyToken, requireAdmin, function (req, res) {
  const foodId = Number(req.params.id);

  if (!Number.isInteger(foodId)) {
    return res.status(400).json({ message: "Invalid food ID." });
  }

  try {
    const food = db
      .prepare(`SELECT id, name FROM foods WHERE id = ?`)
      .get(foodId);
    if (!food) {
      return res.status(404).json({ message: "Food not found." });
    }

    // Order history မှာ ပါနေရင် ဖျက်လို့ မရ (FK constraint)
    const usedInOrders = db
      .prepare(`SELECT COUNT(*) AS c FROM order_items WHERE food_id = ?`)
      .get(foodId);

    if (usedInOrders.c > 0) {
      return res.status(409).json({
        message: `"${food.name}" has been ordered ${usedInOrders.c} time(s) and cannot be deleted. Mark it as "Sold Out" instead.`,
      });
    }

    db.prepare(`DELETE FROM foods WHERE id = ?`).run(foodId);

    res.json({ message: "Food deleted successfully." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to delete food." });
  }
});

/* ================================
   ADMIN — Category Edit / Delete
================================ */

// Update category
app.put("/api/categories/:id", verifyToken, requireAdmin, function (req, res) {
  const categoryId = Number(req.params.id);
  const { name } = req.body;

  if (!Number.isInteger(categoryId)) {
    return res.status(400).json({ message: "Invalid category ID." });
  }
  if (!name || !name.trim()) {
    return res.status(400).json({ message: "Category name is required." });
  }

  try {
    const category = db
      .prepare(`SELECT id FROM categories WHERE id = ?`)
      .get(categoryId);
    if (!category) {
      return res.status(404).json({ message: "Category not found." });
    }

    db.prepare(`UPDATE categories SET name = ? WHERE id = ?`).run(
      name.trim(),
      categoryId,
    );

    res.json({ message: "Category updated successfully." });
  } catch (error) {
    if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
      return res.status(409).json({ message: "Category name already exists." });
    }
    console.error(error);
    res.status(500).json({ message: "Failed to update category." });
  }
});

// Delete category
app.delete(
  "/api/categories/:id",
  verifyToken,
  requireAdmin,
  function (req, res) {
    const categoryId = Number(req.params.id);

    if (!Number.isInteger(categoryId)) {
      return res.status(400).json({ message: "Invalid category ID." });
    }

    try {
      const category = db
        .prepare(`SELECT id, name FROM categories WHERE id = ?`)
        .get(categoryId);
      if (!category) {
        return res.status(404).json({ message: "Category not found." });
      }

      // Food တွေ ရှိသေးရင် ဖျက်လို့ မရ
      const foodCount = db
        .prepare(`SELECT COUNT(*) AS c FROM foods WHERE category_id = ?`)
        .get(categoryId);

      if (foodCount.c > 0) {
        return res.status(409).json({
          message: `"${category.name}" has ${foodCount.c} food(s). Move or delete them first.`,
        });
      }

      db.prepare(`DELETE FROM categories WHERE id = ?`).run(categoryId);

      res.json({ message: "Category deleted successfully." });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Failed to delete category." });
    }
  },
);

/* ================================
   ADMIN — Orders List
================================ */

app.get("/api/admin/orders", verifyToken, requireAdmin, function (req, res) {
  try {
    const status = req.query.status; // optional filter

    let query = `SELECT
                o.id,
                o.order_type,
                o.customer_name,
                o.phone,
                o.address,
                o.table_number,
                o.status,
                o.total_amount,
                o.created_at,
                u.id AS user_id,
                u.name AS user_name,
                u.email AS user_email,
                p.method AS payment_method,
                p.status AS payment_status
            FROM orders o
            LEFT JOIN users u ON u.id = o.user_id
            LEFT JOIN payments p ON p.order_id = o.id`;
    const params = [];

    if (status && status !== "all") {
      query += `WHERE o.status = ?`;
      params.push(status);
    }

    query += ` ORDER BY o.id DESC LIMIT 200`;

    const orders = db.prepare(query).all(...params);

    res.json(orders);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to load orders." });
  }
});

// Get single order detail with items
app.get(
  "/api/admin/orders/:id",
  verifyToken,
  requireAdmin,
  function (req, res) {
    const orderId = Number(req.params.id);

    if (!Number.isInteger(orderId)) {
      return res.status(400).json({ message: "Invalid order ID." });
    }

    try {
      const order = db
        .prepare(
          `SELECT
                o.*,
                u.name AS user_name,
                u.email AS user_email,
                p.method AS payment_method,
                p.status AS payment_status,
                p.transaction_ref,
                p.paid_at
             FROM orders o
             LEFT JOIN users u ON u.id = o.user_id
             LEFT JOIN payments p ON p.order_id = o.id
             WHERE o.id = ?`,
        )
        .get(orderId);

      if (!order) {
        return res.status(404).json({ message: "Order not found." });
      }

      const items = db
        .prepare(`SELECT * FROM order_items WHERE order_id = ? ORDER BY id ASC`)
        .all(orderId);

      res.json({ order: order, items: items });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Failed to load order." });
    }
  },
);

/* ================================
   ADMIN — Payments List
================================ */

app.get("/api/admin/payments", verifyToken, requireAdmin, function (req, res) {
  try {
    const status = req.query.status;
    const method = req.query.method;

    let query = `SELECT
                p.id,
                p.order_id,
                p.method,
                p.amount,
                p.status,
                p.transaction_ref,
                p.paid_at,
                p.created_at,
                o.order_type,
                o.total_amount AS order_total,
                o.customer_name,
                u.name AS user_name,
                u.email AS user_email
            FROM payments p
            LEFT JOIN orders o ON o.id = p.order_id
            LEFT JOIN users u ON u.id = o.user_id`;
    const conditions = [];
    const params = [];

    if (status && status !== "all") {
      conditions.push("p.status = ?");
      params.push(status);
    }

    if (method && method !== "all") {
      conditions.push("p.method = ?");
      params.push(method);
    }

    if (conditions.length > 0) {
      query += " WHERE " + conditions.join(" AND ");
    }

    query += " ORDER BY p.id DESC LIMIT 200";

    const payments = db.prepare(query).all(...params);

    res.json(payments);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to load payments." });
  }
});

/* ================================
   ADMIN — Sales Summary
================================ */

app.get("/api/admin/sales", verifyToken, requireAdmin, function (req, res) {
  try {
    // Today
    const today = db
      .prepare(
        `SELECT
                COUNT(*) AS orders,
                COALESCE(SUM(total_amount), 0) AS revenue
             FROM orders
             WHERE DATE(created_at) = DATE('now')
               AND status != 'Cancelled'`,
      )
      .get();

    // This week (last 7 days)
    const week = db
      .prepare(
        `SELECT
                COUNT(*) AS orders,
                COALESCE(SUM(total_amount), 0) AS revenue
             FROM orders
             WHERE DATE(created_at) >= DATE('now', '-7 days')
               AND status != 'Cancelled'`,
      )
      .get();

    // This month (last 30 days)
    const month = db
      .prepare(
        `SELECT
                COUNT(*) AS orders,
                COALESCE(SUM(total_amount), 0) AS revenue
             FROM orders
             WHERE DATE(created_at) >= DATE('now', '-30 days')
               AND status != 'Cancelled'`,
      )
      .get();

    // All time
    const allTime = db
      .prepare(
        `SELECT
                COUNT(*) AS orders,
                COALESCE(SUM(total_amount), 0) AS revenue
             FROM orders
             WHERE status != 'Cancelled'`,
      )
      .get();

    // By payment method
    const byMethod = db
      .prepare(
        `SELECT
                method,
                COUNT(*) AS count,
                COALESCE(SUM(amount), 0) AS total
             FROM payments
             WHERE status = 'paid'
             GROUP BY method`,
      )
      .all();

    // By status
    const byStatus = db
      .prepare(
        `SELECT
                status,
                COUNT(*) AS count,
                COALESCE(SUM(amount), 0) AS total
             FROM payments
             GROUP BY status`,
      )
      .all();

    // By order type
    const byOrderType = db
      .prepare(
        `SELECT
                order_type,
                COUNT(*) AS count,
                COALESCE(SUM(total_amount), 0) AS total
             FROM orders
             WHERE status != 'Cancelled'
             GROUP BY order_type`,
      )
      .all();
    res.json({
      today: today,
      week: week,
      month: month,
      all_time: allTime,
      by_method: byMethod,
      by_status: byStatus,
      by_order_type: byOrderType,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to load sales." });
  }
});
/* ================================
   ADMIN — Customers List
================================ */

app.get("/api/admin/customers", verifyToken, requireAdmin, function (req, res) {
  try {
    const customers = db
      .prepare(
        `SELECT
                u.id,
                u.name,
                u.email,
                u.role,
                COUNT(o.id) AS order_count,
                COALESCE(SUM(o.total_amount), 0) AS total_spent,
                MAX(o.created_at) AS last_order_at
             FROM users u
             LEFT JOIN orders o ON o.user_id = u.id
             WHERE u.role = 'customer'
             GROUP BY u.id
             ORDER BY order_count DESC, u.id DESC`,
      )
      .all();

    res.json(customers);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to load customers." });
  }
});
/* ================================
   KITCHEN API
================================ */

// Get active orders (Kitchen view)
app.get(
  "/api/kitchen/orders",
  verifyToken,
  requireKitchen,
  function (req, res) {
    try {
      // Default: active orders (Pending, Accepted, Preparing, Ready)
      // Query param ?status=Ready → filter
      const statusFilter = req.query.status;

      let query = `SELECT
                o.id,
                o.order_type,
                o.table_number,
                o.customer_name,
                o.phone,
                o.address,
                o.status,
                o.total_amount,
                o.created_at,
                u.name AS user_name
            FROM orders o
            LEFT JOIN users u ON u.id = o.user_id`;
      const params = [];

      if (statusFilter && statusFilter !== "active") {
        query += ` WHERE o.status = ?`;
        params.push(statusFilter);
      } else {
        // Active = လက်ရှိ ပြင်ဆင်နေဆဲ orders
        query += ` WHERE o.status IN ('Pending', 'Accepted', 'Preparing', 'Ready')`;
      }

      query += ` ORDER BY
                    CASE o.status
                        WHEN 'Pending' THEN 1
                        WHEN 'Accepted' THEN 2
                        WHEN 'Preparing' THEN 3
                        WHEN 'Ready' THEN 4
                        ELSE 5
                    END ASC,
                    o.id ASC`;

      const orders = db.prepare(query).all(...params);

      // ဒီ order တစ်ခုချင်းစီအတွက် items ကို ဆွဲထုတ်
      const orderIds = orders.map(function (o) {
        return o.id;
      });

      let itemsByOrder = {};

      if (orderIds.length > 0) {
        const placeholders = orderIds
          .map(function () {
            return "?";
          })
          .join(",");
        const items = db
          .prepare(
            `SELECT order_id, food_name, quantity, price, subtotal
                 FROM order_items
                 WHERE order_id IN (${placeholders})
                 ORDER BY id ASC`,
          )
          .all(...orderIds);

        items.forEach(function (item) {
          if (!itemsByOrder[item.order_id]) {
            itemsByOrder[item.order_id] = [];
          }
          itemsByOrder[item.order_id].push(item);
        });
      }

      // Orders + items ကို ပေါင်း
      const result = orders.map(function (o) {
        return {
          ...o,
          items: itemsByOrder[o.id] || [],
        };
      });

      res.json(result);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Failed to load kitchen orders." });
    }
  },
);

// Update order status
app.patch(
  "/api/kitchen/orders/:id/status",
  verifyToken,
  requireKitchen,
  function (req, res) {
    const orderId = Number(req.params.id);
    const { status } = req.body;

    if (!Number.isInteger(orderId)) {
      return res.status(400).json({ message: "Invalid order ID." });
    }

    if (!status) {
      return res.status(400).json({ message: "Status is required." });
    }

    try {
      const order = db
        .prepare(`SELECT id, status FROM orders WHERE id = ?`)
        .get(orderId);

      if (!order) {
        return res.status(404).json({ message: "Order not found." });
      }

      // Check status transition validity
      const allowed = ORDER_STATUS_FLOW[order.status] || [];

      if (!allowed.includes(status)) {
        return res.status(400).json({
          message: `Cannot change status from "${order.status}" to "${status}".`,
        });
      }

      db.prepare(`UPDATE orders SET status = ? WHERE id = ?`).run(
        status,
        orderId,
      );

      res.json({
        message: `Order #${orderId} → ${status}`,
        order_id: orderId,
        old_status: order.status,
        new_status: status,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Failed to update order status." });
    }
  },
);
/* ================================
   PUBLIC — Order Tracking
   ⚠️ Tracking token လိုတယ် — PII ကာကွယ်
================================ */

app.get("/api/orders/:id/track", trackLimiter, function (req, res) {
    const orderId = Number(req.params.id);
    const trackingToken = req.query.token;

    if (!Number.isInteger(orderId) || orderId <= 0) {
        return res.status(400).json({ message: "Invalid order ID." });
    }

    if (!trackingToken) {
        return res.status(401).json({
            message: "Tracking token required."
        });
    }

    try {
        const order = db.prepare(
            `SELECT
                id, order_type, table_number,
                status, total_amount, created_at, tracking_token
             FROM orders
             WHERE id = ?`
        ).get(orderId);

        if (!order) {
            return res.status(404).json({ message: "Order not found." });
        }

        // Token match check
        if (order.tracking_token !== trackingToken) {
            return res.status(403).json({
                message: "Invalid tracking token."
            });
        }

        // Customer PII ကို ပြန်ပေးတဲ့အခါ mask လုပ်
        const items = db.prepare(
            `SELECT food_name, price, quantity, subtotal
             FROM order_items
             WHERE order_id = ?
             ORDER BY id ASC`
        ).all(orderId);

        const payment = db.prepare(
            `SELECT method, status FROM payments
             WHERE order_id = ?
             ORDER BY id DESC
             LIMIT 1`
        ).get(orderId);

        // tracking_token ကို response မှာ မထည့်ပါနဲ့
        delete order.tracking_token;

        res.json({
            order: order,
            items: items,
            payment: payment || null
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Failed to load order." });
    }
});
/* ================================
   MOCK QR — Generate on our own server
================================ */

app.get("/api/mock-qr", async function (req, res) {
    const data = String(req.query.data || "mock-payment").slice(0, 500);

    try {
        const qrDataUrl = await QRCode.toDataURL(data, {
            width: 220,
            margin: 2,
            color: {
                dark: "#000000",
                light: "#FFFFFF"
            }
        });

        res.json({ qr_data_url: qrDataUrl });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Failed to generate QR." });
    }
});

/* ================================
   AUTH — LOGOUT (Token Revocation)
================================ */
app.post("/api/logout", verifyToken, function (req, res) {
    try {
        
        db.prepare(`UPDATE users SET token_version = token_version + 1 WHERE id = ?`).run(req.user.id);

        res.json({ message: "Logged out successfully. All sessions revoked." });
    } catch (error) {
        console.error("Logout error:", error);
        res.status(500).json({ message: "Failed to logout." });
    }
});
/* ================================
   AUTH — CHANGE PASSWORD
================================ */
app.post("/api/change-password", verifyToken, async function (req, res) {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: "Current and new password are required." });
    }

    const passwordCheck = isStrongPassword(newPassword);
    if (!passwordCheck.valid) {
        return res.status(400).json({ message: passwordCheck.reason });
    }

    try {
        const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);

        const passwordMatch = await bcrypt.compare(currentPassword, user.password);
        if (!passwordMatch) {
            return res.status(401).json({ message: "Incorrect current password." });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // Password အသစ်သိမ်းမယ် + token_version တိုးမယ် (အခြား Device တွေမှာ Login ထားတာတွေ Auto Logout ဖြစ်သွားမယ်)
        db.prepare(
            `UPDATE users 
             SET password = ?, token_version = token_version + 1, must_change_password = 0 
             WHERE id = ?`
        ).run(hashedPassword, req.user.id);

        res.json({ message: "Password changed successfully. Please login again." });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Failed to change password." });
    }
});
/* ================================
   GLOBAL ERROR HANDLER
================================ */
app.use(function (err, req, res, next) {
    console.error("Server Error:", err.stack);
    res.status(500).json({
        message: "Something went wrong on the server."
    });
});

// လုံးဝ Crash မဖြစ်အောင် ကာကွယ်ခြင်း
process.on("uncaughtException", function (err) {
    console.error("UNCAUGHT EXCEPTION! 💥 Shutting down...");
    console.error(err.name, err.message);
    process.exit(1);
});

process.on("unhandledRejection", function (err) {
    console.error("UNHANDLED REJECTION! 💥 Shutting down...");
    console.error(err.name, err.message);
});
// Start server
const server = app.listen(PORT, function () {
    console.log("========================================");
    console.log(`🚀 Server running at http://localhost:${PORT}`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || "development"}`);
    console.log(`🔐 JWT Secret: ${JWT_SECRET ? "loaded ✓" : "MISSING ✗"}`);
    console.log(`✅ CORS allowed origins:`);
    allowedOrigins.forEach(function (origin) {
        console.log(`   - ${origin}`);
    });
    console.log("========================================");
});

// ================================
// GRACEFUL SHUTDOWN
// ================================
function gracefulShutdown(signal) {
    console.log(`\n${signal} received. Shutting down gracefully...`);

    server.close(function () {
        console.log("HTTP server closed.");

        try {
            db.close();
            console.log("Database closed.");
        } catch (error) {
            console.error("DB close error:", error.message);
        }

        process.exit(0);
    });

    // Force exit after 10s
    setTimeout(function () {
        console.error("Forced exit after timeout.");
        process.exit(1);
    }, 10000);
}

process.on("SIGTERM", function () { gracefulShutdown("SIGTERM"); });
process.on("SIGINT", function () { gracefulShutdown("SIGINT"); });