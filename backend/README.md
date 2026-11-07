# International Payment System

A robust, full-stack payment platform enabling multi-currency digital wallets, instant transfers, and real-time FX operations. This system is built with a **FastAPI** backend and a **React (Vite)** frontend.

## 🚀 Features

### � Frontend (User Interface)
*   **Modern Dashboard**: clean, responsive UI built with Tailwind CSS.
*   **Wallet Management**: View balances, deposit, and withdraw in multiple currencies with live FX rates.
*   **Real-time FX Ticker**: Live currency exchange rates display.
*   **Secure Authentication**: JWT-based login and registration flows.
*   **Transaction History**: Detailed view of all past deposits, withdrawals, and transfers.
*   **Smart Feedback**: Toast notifications and loading states for better UX.

### ⚙️ Backend (API & Logic)
*   **Secure Auth**: JWT-based authentication using OAuth2 standards.
*   **Ledger System**: Double-entry accounting (`LedgerEntry`) for immutable financial tracking.
*   **Multi-Currency**: Native support for USD settlement and foreign currency operations.
*   **Liquidity Management**: Tracks system liquidity to ensure solvency for withdrawals.
*   **Idempotency**: Prevents duplicate transactions for safe withdrawals.

---

## 🛠️ Technology Stack

### Frontend
*   **Framework**: [React](https://react.dev/) (via [Vite](https://vitejs.dev/))
*   **Styling**: [Tailwind CSS](https://tailwindcss.com/)
*   **Routing**: [React Router](https://reactrouter.com/)
*   **Icons**: Material Icons

### Backend
*   **Framework**: [FastAPI](https://fastapi.tiangolo.com/)
*   **Database ORM**: [SQLAlchemy](https://www.sqlalchemy.org/)
*   **Database**: SQLite (default), extensible to PostgreSQL.
*   **Validation**: [Pydantic](https://docs.pydantic.dev/)
*   **Server**: [Uvicorn](https://www.uvicorn.org/)

---

## 📂 Project Structure

```
payment-system/
├── backend/                # Python FastAPI Backend
│   ├── app/
│   │   ├── core/           # Security & Config
│   │   ├── models/         # Database Models (User, Account, Ledger, etc.)
│   │   ├── routes/         # API Endpoints
│   │   ├── schemas/        # Pydantic Schemas
│   │   ├── services/       # Business Logic (Deposit, Withdraw, Transfer)
│   │   └── scripts/        # Seeding scripts
│   ├── requirements.txt
│   └── main.py
│
└── frontend/               # React Vite Frontend
    ├── src/
    │   ├── components/     # Reusable UI components (Sidebar, Header, WalletCard)
    │   ├── pages/          # Page views (Dashboard, Wallet, Auth, Transactions)
    │   ├── services/       # API integration layer
    │   └── assets/         # Static assets
    ├── tailwind.config.js
    └── vite.config.js
```

---

## ⚡ Getting Started

### Prerequisites
*   **Node.js** (v16+) & **npm**
*   **Python** (v3.8+) & **pip**

### 1️⃣ Backend Setup

1.  **Navigate to backend:**
    ```bash
    cd backend
    ```

2.  **Create virtual environment & install dependencies:**
    ```bash
    python -m venv venv
    # Windows: .\venv\Scripts\activate
    # Mac/Linux: source venv/bin/activate
    pip install -r requirements.txt
    ```

3.  **Environment Setup:**
    Create a `.env` file (copy from `.env.example`).
    ```bash
    cp .env.example .env
    ```

4.  **Seed Database (FX Rates & Liquidity):**
    ```bash
    python -m app.scripts.seed_fx
    ```

5.  **Run Server:**
    ```bash
    uvicorn app.main:app --reload
    ```
    *   API running at: `http://localhost:8000`
    *   Docs: `http://localhost:8000/docs`

### 2️⃣ Frontend Setup

1.  **Open a new terminal and navigate to frontend:**
    ```bash
    cd frontend
    ```

2.  **Install Dependencies:**
    ```bash
    npm install
    ```

3.  **Run Development Server:**
    ```bash
    npm run dev
    ```
    *   App running at: `http://localhost:5173`

---

## 🔮 Future Scope

*   **Payment Gateway**: Integration with Stripe/Razorpay for real fiat deposits.
*   **Live FX API**: Connect to external APIs (e.g., OpenExchangeRates) for real-time market data.
*   **Admin Panel**: specific dashboard for system monitoring and user management.
*   **Mobile App**: React Native port for iOS/Android.
*   **CI/CD**: Automated testing and deployment pipelines.
