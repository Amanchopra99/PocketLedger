import csv
import io
import json
from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Optional

from bson import ObjectId
from fastapi import FastAPI, HTTPException, Query, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from openai import AsyncOpenAI, AuthenticationError, OpenAIError, RateLimitError

from .config import settings
from .db import db, client, ensure_indexes
from .schemas import ChatRequest, TransactionCreate

app = FastAPI(title="PocketLedger API", version="0.1.0",
              description="Personal expense tracker MVP API")

origins = [item.strip() for item in settings.cors_origins.split(",") if item.strip()]
app.add_middleware(
    CORSMiddleware, allow_origins=origins, allow_credentials=True,
    allow_methods=["*"], allow_headers=["*"]
)

@app.on_event("startup")
async def startup():
    await ensure_indexes()

@app.on_event("shutdown")
async def shutdown():
    client.close()

@app.get("/health")
async def health():
    return {"status": "ok"}

def serialize(doc: dict) -> dict:
    return {
        "id": str(doc["_id"]),
        "description": doc["description"],
        "amount_paise": int(doc["amount_paise"]),
        "type": doc["type"],
        "date": doc["date"].isoformat() if isinstance(doc["date"], date) else str(doc["date"]),
        "category": doc.get("category", "Uncategorized"),
        "payment_method": doc.get("payment_method", "Other"),
        "notes": doc.get("notes"),
        "created_at": doc["created_at"].isoformat() if isinstance(doc["created_at"], datetime) else doc["created_at"],
    }

@app.post("/api/transactions", status_code=201)
async def create_transaction(payload: TransactionCreate):
    doc = payload.model_dump()
    doc["date"] = payload.date.isoformat()  # Store dates consistently as YYYY-MM-DD strings
    doc["created_at"] = datetime.now(timezone.utc)
    result = await db.transactions.insert_one(doc)
    doc["_id"] = result.inserted_id
    return serialize(doc)

@app.get("/api/transactions")
async def list_transactions(
    type: Optional[str] = Query(default=None, pattern="^(expense|income)$"),
    category: Optional[str] = None,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    limit: int = Query(default=100, ge=1, le=500),
    skip: int = Query(default=0, ge=0),
):
    query = {}
    if type: query["type"] = type
    if category: query["category"] = category
    date_query = {}
    if from_date: date_query["$gte"] = from_date.isoformat()
    if to_date: date_query["$lte"] = to_date.isoformat()
    if date_query: query["date"] = date_query
    cursor = db.transactions.find(query).sort([("date", -1), ("created_at", -1)]).skip(skip).limit(limit)
    return [serialize(doc) async for doc in cursor]

@app.delete("/api/transactions/{transaction_id}", status_code=204)
async def delete_transaction(transaction_id: str):
    if not ObjectId.is_valid(transaction_id):
        raise HTTPException(status_code=400, detail="Invalid transaction ID")
    result = await db.transactions.delete_one({"_id": ObjectId(transaction_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Transaction not found")
    return None

@app.get("/api/dashboard/summary")
async def dashboard_summary(month: str = Query(..., pattern=r"^\d{4}-\d{2}$")):
    try:
        year, month_num = map(int, month.split("-"))
        start = date(year, month_num, 1)
        end = date(year + (month_num == 12), month_num % 12 + 1, 1)
    except ValueError:
        raise HTTPException(status_code=400, detail="month must be YYYY-MM")
    match = {"date": {"$gte": start.isoformat(), "$lt": end.isoformat()}}
    pipeline = [
        {"$match": match},
        {"$group": {"_id": "$type", "total": {"$sum": "$amount_paise"}, "count": {"$sum": 1}}},
    ]
    totals = {row["_id"]: row for row in await db.transactions.aggregate(pipeline).to_list(length=10)}
    expenses = int(totals.get("expense", {}).get("total", 0))
    income = int(totals.get("income", {}).get("total", 0))
    category_pipeline = [
        {"$match": {**match, "type": "expense"}},
        {"$group": {"_id": "$category", "total": {"$sum": "$amount_paise"}}},
        {"$sort": {"total": -1}},
    ]
    categories = [{"category": row["_id"], "amount_paise": int(row["total"])}
                  for row in await db.transactions.aggregate(category_pipeline).to_list(length=50)]
    return {
        "month": month, "income_paise": income, "expense_paise": expenses,
        "net_paise": income - expenses,
        "income_count": int(totals.get("income", {}).get("count", 0)),
        "expense_count": int(totals.get("expense", {}).get("count", 0)),
        "expense_by_category": categories,
    }

async def transaction_insights() -> dict:
    totals_rows = await db.transactions.aggregate([
        {"$group": {
            "_id": None,
            "transaction_count": {"$sum": 1},
            "income_paise": {"$sum": {"$cond": [{"$eq": ["$type", "income"]}, "$amount_paise", 0]}},
            "expense_paise": {"$sum": {"$cond": [{"$eq": ["$type", "expense"]}, "$amount_paise", 0]}},
        }}
    ]).to_list(length=1)
    category_rows = await db.transactions.aggregate([
        {"$match": {"type": "expense"}},
        {"$group": {"_id": "$category", "total_paise": {"$sum": "$amount_paise"}, "count": {"$sum": 1}}},
        {"$sort": {"total_paise": -1}},
        {"$limit": 30},
    ]).to_list(length=30)
    payment_rows = await db.transactions.aggregate([
        {"$group": {"_id": "$payment_method", "total_paise": {"$sum": "$amount_paise"}, "count": {"$sum": 1}}},
        {"$sort": {"total_paise": -1}},
        {"$limit": 12},
    ]).to_list(length=12)
    monthly_rows = await db.transactions.aggregate([
        {"$group": {
            "_id": {"$substrBytes": ["$date", 0, 7]},
            "income_paise": {"$sum": {"$cond": [{"$eq": ["$type", "income"]}, "$amount_paise", 0]}},
            "expense_paise": {"$sum": {"$cond": [{"$eq": ["$type", "expense"]}, "$amount_paise", 0]}},
            "transaction_count": {"$sum": 1},
        }},
        {"$sort": {"_id": -1}},
        {"$limit": 24},
    ]).to_list(length=24)
    totals = totals_rows[0] if totals_rows else {}
    to_rupees = lambda value: round(int(value or 0) / 100, 2)
    income = int(totals.get("income_paise", 0))
    expenses = int(totals.get("expense_paise", 0))
    return {
        "transaction_count": int(totals.get("transaction_count", 0)),
        "all_time": {
            "income_inr": to_rupees(income),
            "expenses_inr": to_rupees(expenses),
            "net_inr": to_rupees(income - expenses),
        },
        "expenses_by_category": [
            {"category": row["_id"], "amount_inr": to_rupees(row["total_paise"]), "count": row["count"]}
            for row in category_rows
        ],
        "by_payment_method": [
            {"method": row["_id"] or "Other", "amount_inr": to_rupees(row["total_paise"]), "count": row["count"]}
            for row in payment_rows
        ],
        "monthly_trends_last_24_months": [
            {
                "month": row["_id"],
                "income_inr": to_rupees(row["income_paise"]),
                "expenses_inr": to_rupees(row["expense_paise"]),
                "transaction_count": row["transaction_count"],
            }
            for row in reversed(monthly_rows)
        ],
    }

@app.post("/api/assistant/chat")
async def assistant_chat(payload: ChatRequest):
    if not settings.groq_api_key:
        raise HTTPException(status_code=503, detail="AI chat is not configured. Set GROQ_API_KEY in backend/.env.")
    if payload.messages[-1].role != "user":
        raise HTTPException(status_code=422, detail="The last chat message must be from the user.")
    insights = await transaction_insights()
    instructions = (
        "You are PocketLedger, a helpful personal-finance spending analysis assistant. "
        "Answer using only the supplied transaction aggregates; do not invent facts. "
        "All amounts are INR. Totals and category/payment breakdowns cover the full transaction history; "
        "monthly trends include the latest 24 months. Offer specific, practical, nonjudgmental observations. "
        "Do not present investment, tax, or legal advice. The data below contains aggregates only, not transaction descriptions or notes.\n\n"
        f"Transaction aggregates: {json.dumps(insights, separators=(',', ':'))}"
    )
    try:
        async with AsyncOpenAI(
            api_key=settings.groq_api_key,
            base_url="https://api.groq.com/openai/v1/",
        ) as ai_client:
            response = await ai_client.chat.completions.create(
                model=settings.groq_model,
                messages=[
                    {"role": "system", "content": instructions},
                    *[{"role": message.role, "content": message.content} for message in payload.messages],
                ],
            )
    except AuthenticationError as exc:
        raise HTTPException(status_code=502, detail="Groq rejected the API key. Check GROQ_API_KEY in backend/.env.") from exc
    except RateLimitError as exc:
        raise HTTPException(status_code=429, detail="Groq rate limit or quota reached. Check your Groq account limits.") from exc
    except OpenAIError as exc:
        raise HTTPException(
            status_code=502,
            detail="Groq could not complete the request. Check model access and try again.",
        ) from exc
    reply = response.choices[0].message.content
    if not reply:
        raise HTTPException(status_code=502, detail="Groq returned an empty response.")
    return {"reply": reply.strip()}

def parse_csv_row(row: dict, row_number: int) -> dict:
    try:
        date_value = date.fromisoformat((row.get("date") or "").strip())
        description = (row.get("description") or "").strip()
        if not description:
            raise ValueError("description is required")
        kind = (row.get("type") or "").strip().lower()
        if kind not in ("expense", "income"):
            raise ValueError("type must be expense or income")
        amount = Decimal((row.get("amount") or "").strip().replace(",", "").replace("₹", ""))
        if amount <= 0:
            raise ValueError("amount must be greater than zero")
        paise = int((amount * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
        payload = TransactionCreate(
            date=date_value, description=description, amount_paise=paise, type=kind,
            category=(row.get("category") or "Uncategorized").strip() or "Uncategorized",
            payment_method=(row.get("payment_method") or "Other").strip() or "Other",
            notes=(row.get("notes") or "").strip() or None
        )
        return {"row_number": row_number, "valid": True, "data": payload.model_dump(mode="json")}
    except (ValueError, InvalidOperation, TypeError) as exc:
        return {"row_number": row_number, "valid": False, "error": str(exc)}

@app.post("/api/imports/csv/preview")
async def preview_csv(file: UploadFile = File(...)):
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Upload a .csv file")
    content = await file.read()
    if len(content) > 5_000_000:
        raise HTTPException(status_code=413, detail="CSV must be 5 MB or smaller")
    try:
        text = content.decode("utf-8-sig")
        reader = csv.DictReader(io.StringIO(text))
        required = {"date", "description", "amount", "type"}
        if not reader.fieldnames or not required.issubset({h.strip().lower() for h in reader.fieldnames}):
            raise HTTPException(status_code=400, detail="CSV needs date, description, amount, type columns")
        # Normalize header names while preserving row values.
        normalized = []
        for row in reader:
            normalized.append({(k or "").strip().lower(): (v or "").strip() for k, v in row.items()})
        rows = [parse_csv_row(row, i + 2) for i, row in enumerate(normalized)]
        return {"rows": rows, "valid_count": sum(r["valid"] for r in rows),
                "invalid_count": sum(not r["valid"] for r in rows)}
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="CSV must be UTF-8 encoded")

@app.post("/api/imports/csv/commit", status_code=201)
async def commit_csv(payload: dict):
    rows = payload.get("rows")
    if not isinstance(rows, list) or not rows:
        raise HTTPException(status_code=400, detail="Provide a non-empty rows array")
    if len(rows) > 2000:
        raise HTTPException(status_code=400, detail="Import is limited to 2,000 rows at a time")
    docs = []
    for row in rows:
        try:
            tx = TransactionCreate.model_validate(row)
            doc = tx.model_dump()
            doc["date"] = tx.date.isoformat()  # Store dates consistently as YYYY-MM-DD strings
            doc["created_at"] = datetime.now(timezone.utc)
            docs.append(doc)
        except Exception as exc:
            raise HTTPException(status_code=422, detail=f"Invalid transaction row: {exc}")
    result = await db.transactions.insert_many(docs)
    return {"imported_count": len(result.inserted_ids)}
