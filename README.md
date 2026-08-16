# ReceiptRadar 🔍⚡
> **Google Gemini-Powered Income & Expense Intelligence & Dashboard**

ReceiptRadar is a modern, premium financial tracking web application that allows users to log and analyze their income and expenses. It combines standard manual ledger logging with **automated, AI-powered receipt scanning** using the Google Gemini API (`gemini-3.1-flash-lite` model). By uploading or dragging-and-dropping a receipt image, ReceiptRadar instantly parses the vendor, date, final transaction amount, and applies categorizations using structured JSON schema output from Gemini.

---

## 🌟 Key Features

1. **AI Receipt Scanning**: Integrates Google's next-generation `gemini-3.1-flash-lite` model to analyze receipt images and extract transaction metadata (merchant name, exact total paid after discounts/taxes, date in ISO format, and logical categorization).
2. **Secure Multi-User System**: Built-in authentication using JSON Web Tokens (JWT) and `bcryptjs` password hashing, ensuring users only see and manage their own financial logs.
3. **Unified Financial Ledger**: Double-entry bookkeeping structure storing all income and expense flows inside a unified Firestore schema.
4. **Rich Dashboard & Visualizations**:
   - **Interactive Charts**: Responsive pie chart visualizations of categories powered by `Chart.js`.
   - **Real-Time KPI Metrics**: Track total income, total expenses, net balance, top-spending category, total receipts scanned, and average expense per transaction.
   - **Actionable Log**: Search, filter, edit, delete, and clear records in a cozy, animated dashboard UI.
5. **Modern, Responsive Frontend**: Features a beautiful sage-green dark-accented UI built with Tailwind CSS v4, Google Fonts (Outfit & Inter), glassmorphism styles, drag-and-drop file regions, and loading overlays.

---

## ⚙️ Technology Stack

- **Frontend**: HTML5, Vanilla JavaScript, CSS, [Tailwind CSS v4 (CDN)](https://tailwindcss.com/), [Chart.js](https://www.chartjs.org/)
- **Backend**: Node.js (ES Module format), [Express.js](https://expressjs.com/)
- **AI SDK**: [@google/genai](https://www.npmjs.com/package/@google/genai) (Standard modern Google Gen AI SDK)
- **Database**: [Firebase Firestore](https://firebase.google.com/docs/firestore) (Cloud NoSQL database)
- **Auth & Crypto**: `jsonwebtoken` (JWT), `bcryptjs` (Password hashing)
- **Configuration & Environment**: `dotenv`

---

## 📁 Repository Structure

```
├── .env                  # Port, JWT secret, and Gemini API keys (git-ignored)
├── .gitignore            # Git ignore configuration
├── db.js                 # Firebase Firestore database client & initial collection setup
├── server.js             # Express API application & AI extraction integration
├── package.json          # Node dependencies, scripts, and type declarations
├── package-lock.json     # Locked dependency graph
└── public/               # Static folder containing client-side assets
    ├── index.html        # Core Dashboard & Ledger interface (Tailwind/Chart.js)
    ├── login.html        # Registration, onboarding, and login interface
    └── js/
        └── app.js        # Core frontend client interactions & API requests
```

---

## 🗄️ Database Architecture

The application implements a cloud NoSQL schema in **Firebase Firestore**. Key collections include:

### 1. `users` Collection
Stores user accounts and hashed credentials.
```javascript
{
  id: string,              // Auto-generated Firestore document ID
  name: string,
  email: string,           // Unique email address
  password_hash: string,   // bcryptjs hashed password
  created_at: string       // ISO timestamp
}
```

### 2. `categories` Collection
A hybrid lookup collection containing both system defaults (`user_id = NULL`) and custom, user-defined categories.
```javascript
{
  id: string,        // Auto-generated Firestore document ID
  user_id: string | null,  // null = system-wide, string = user-specific
  name: string,
  type: string      // 'expense' or 'income'
}
```
*Seeded categories (Defaults):*
- 🍔 **Food & Dining** (expense)
- 🎬 **Entertainment** (expense)
- ✈️ **Travel** (expense)
- 🛍️ **Shopping** (expense)
- 📈 **Investment** (expense)
- 💵 **Salary / Wages** (income)

### 3. `transactions` Collection
Unified ledger for all financial movements. Features custom receipt details (e.g. extracted vendor, scan status) inside a JSON `metadata` object.
```javascript
{
  id: string,        // Auto-generated Firestore document ID
  user_id: string,   // Reference to user collection
  category: string,
  amount: number,
  description: string,
  transaction_date: string,  // ISO date string YYYY-MM-DD
  created_at: string,         // ISO timestamp
  metadata: object | null,    // Additional receipt data
  type: string               // 'expense' or 'income'
}
```

---

## 🔌 API Endpoints

### 🔐 Authentication (`public`)
- `POST /api/auth/register`: Create a new user profile.
- `POST /api/auth/login`: Authenticate credentials and receive a JWT.

### 📝 Transactions Ledger (`protected`)
*Requires `Authorization: Bearer <jwt_token>`*
- `GET /api/transactions`: Fetch transaction timeline for logged-in user.
- `POST /api/transactions`: Create a new manual or scanned ledger row.
- `PUT /api/transactions/:id`: Update specific fields of a transaction.
- `DELETE /api/transactions/:id`: Delete a single transaction row.
- `DELETE /api/transactions`: Clear all transactions for the user.

### 🤖 Gemini AI Receipt Scanner (`protected`)
*Requires `Authorization: Bearer <jwt_token>`*
- `POST /api/scan-receipt`: Uploads a base64 receipt image and returns parsed parameters.
  - **Payload Structure**: `{ imageBase64: "...", mimeType: "image/jpeg" }`
  - **Output Object**:
    ```json
    {
      "date": "YYYY-MM-DD",
      "vendor": "Merchant Name",
      "amount": 250.75,
      "category": "Food & Dining"
    }
    ```

---

## 🚀 Deployment

### Vercel Deployment
1. Push to GitHub
2. Import project in Vercel
3. Add environment variables:
   - `GEMINI_API_KEY` - Your Google Gemini API key
   - `FIREBASE_SERVICE_ACCOUNT` - Firebase service account JSON (as a string)
   - `JWT_SECRET` - Random secret string
   - `JWT_EXPIRES_IN` - e.g., "7d"
4. Deploy

## 🚀 Installation & Setup

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd receiptradar
   ```

2. **Install Node.js dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment Variables**:
   Create a `.env` file in the root directory and add the following settings:
   ```env
   PORT=3000
   JWT_SECRET=your_super_secure_jwt_secret_phrase
   JWT_EXPIRES_IN=7d
   GEMINI_API_KEY=AIzaSy... (Your Google Gemini API Key)
   FIREBASE_SERVICE_ACCOUNT={"type":"service_account","project_id":"...","private_key":"...","client_email":"..."}
   ```

4. **Verify Gemini API connection (Optional)**:
   You can run the test script to make sure the key works and connections can be established:
   ```bash
   node test_gemini.js
   ```

5. **Start the Application**:
   - For production / standard launch:
     ```bash
     npm start
     ```
   - For development auto-reload (watch mode):
     ```bash
     npm run dev
     ```

6. **Open in browser**:
   Go to [http://localhost:3000](http://localhost:3000) to register a new user and start tracking!
