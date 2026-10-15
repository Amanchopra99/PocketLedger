from motor.motor_asyncio import AsyncIOMotorClient
from .config import settings

client = AsyncIOMotorClient(settings.mongodb_url)
db = client[settings.mongodb_db]

async def ensure_indexes():
    await db.transactions.create_index([("date", -1)])
    await db.transactions.create_index([("type", 1), ("date", -1)])
    await db.transactions.create_index([("category", 1)])
