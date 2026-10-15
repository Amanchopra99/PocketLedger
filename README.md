# PocketLedger — Personal Expense Tracker MVP

Dark-mode personal finance tracker for **Web + Android/iOS**. Built with React + TypeScript (web), Expo React Native (mobile), FastAPI (API), and MongoDB.

## MVP scope
- Create, list, filter, and delete income/expense transactions
- INR amounts stored as integer paise to avoid floating-point money errors
- Dashboard summary: income, expenses, net cash flow, recent transactions
- CSV statement preview and import
- Responsive dark web interface
- Mobile starter screen using the same API
- MongoDB via Docker Compose

## Architecture
```text
Web (React/Vite) ─────┐
                      ├── FastAPI REST API ─── MongoDB
Mobile (Expo) ────────┘          │
                                 └── CSV preview/import
```

## Requirements
- Python 3.11+
- Node.js 20+
- Docker Desktop (or a local MongoDB instance)
- A Groq API key for AI chat

## Run the backend
```bash
cd backend
python -m venv .venv
# macOS/Linux:
source .venv/bin/activate
# Windows PowerShell:
# .venv\Scripts\Activate.ps1
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload
```
API docs: http://localhost:8000/docs

Set `GROQ_API_KEY` in `backend/.env` to enable the AI assistant. The assistant sends aggregate totals, categories, payment methods, monthly trends, and your chat messages to Groq; it does not send transaction descriptions or notes.


Start MongoDB separately with `docker compose up -d mongo` from the project root, or set `MONGODB_URL` in `backend/.env` to your existing MongoDB URL.

## Run the web app
```bash
cd web
npm install
cp .env.example .env
npm run dev
```
Open the URL printed by Vite (usually http://localhost:5173).

## Run the mobile app
```bash
cd mobile
npm install
cp .env.example .env
npx expo start
```
Set `EXPO_PUBLIC_API_URL` to the API host reachable from the device:
- iOS simulator: `http://127.0.0.1:8000`
- Android emulator: `http://10.0.2.2:8000`
- Physical phone: `http://YOUR_COMPUTER_LAN_IP:8000`

## CSV format
Required headers: `date`, `description`, `amount`, `type`.
- `date`: YYYY-MM-DD
- `amount`: decimal amount in INR (e.g. `125.50`)
- `type`: `expense` or `income`
- Optional: `category`, `payment_method`, `notes`
Negative amounts are treated as positive values; the `type` column determines direction.

Example:
```csv
date,description,amount,type,category,payment_method
2026-10-14,Groceries,850.50,expense,Food,UPI
2026-10-15,Salary,45000,income,Salary,Bank
```

## API overview
- `GET /health`
- `GET /api/transactions?type=&category=&from_date=&to_date=&limit=&skip=`
- `POST /api/transactions`
- `DELETE /api/transactions/{transaction_id}`
- `GET /api/dashboard/summary?month=YYYY-MM`
- `POST /api/imports/csv/preview`
- `POST /api/imports/csv/commit`

## Important MVP limitations
This is a development starter, not production-ready financial software. Authentication, user isolation, backups, encrypted transport, audit logging, and secure production configuration must be added before storing real financial records online. Do not expose the API publicly without those controls.
