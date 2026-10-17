# 🍽️ Golden Spoon Restaurant

A full-stack restaurant management system with Customer Ordering, Kitchen Dashboard, and Admin Panel.

---

## ✨ Features

### Customer
- 🍔 Browse menu with categories
- 🛒 Add to cart
- 🍽️ Dine-in — QR code scan → Guest mode → Table auto-fill
- 🥡 Takeaway — Quick order without login
- 🚚 Delivery — Login required + address form
- 💳 Payment — Cash / KPay / WavePay (Mock)
- 📦 Order tracking with live status

### Kitchen
- 📋 Kanban board (Pending / Accepted / Preparing / Ready)
- ✅ One-click status transitions
- 🔄 Auto-refresh every 10 seconds

### Admin
- 📊 Dashboard with sales stats
- 🍔 Food management (CRUD + Availability toggle)
- 📁 Category management
- 📋 Order monitoring + details
- 👥 Customer list
- 🪑 Tables + QR code generation
- 💳 Payment records + Sales summary

---

## 🛠️ Tech Stack

Backend:
- Node.js + Express
- SQLite (better-sqlite3)
- JWT Authentication
- bcryptjs (password hashing)
- Helmet (security headers)
- express-rate-limit

Frontend:
- Vanilla HTML / CSS / JavaScript
- No framework — fast and simple

---

## 🚀 Getting Started

### Prerequisites
- Node.js v18+
- npm

### Installation

1. Clone repository
   `bash
   git clone <your-repo-url>
   cd eCafe