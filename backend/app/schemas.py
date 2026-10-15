from datetime import date, datetime, timezone
from typing import Literal, Optional
from pydantic import BaseModel, Field, ConfigDict, field_validator

TransactionType = Literal["expense", "income"]

class TransactionCreate(BaseModel):
    description: str = Field(min_length=1, max_length=160)
    amount_paise: int = Field(gt=0, description="Amount in INR paise; ₹1 = 100 paise")
    type: TransactionType
    date: date
    category: str = Field(default="Uncategorized", min_length=1, max_length=60)
    payment_method: str = Field(default="Other", max_length=40)
    notes: Optional[str] = Field(default=None, max_length=1000)

    @field_validator("description", "category", "payment_method")
    @classmethod
    def strip_text(cls, value: str) -> str:
        return value.strip()

class TransactionOut(TransactionCreate):
    id: str
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

class CsvPreviewRow(BaseModel):
    row_number: int
    valid: bool
    data: Optional[TransactionCreate] = None
    error: Optional[str] = None

class CsvPreviewOut(BaseModel):
    rows: list[CsvPreviewRow]
    valid_count: int
    invalid_count: int

class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=2000)

class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1, max_length=12)
