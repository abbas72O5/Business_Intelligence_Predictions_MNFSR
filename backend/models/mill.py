from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime

class MillProfile(BaseModel):
    name: str
    owner_name: str
    location: Optional[str] = None
    installed_spindles: Optional[int] = 0
    installed_rotors: Optional[int] = 0
    created_at: datetime = Field(default_factory=datetime.utcnow)

class MillProfileUpdate(BaseModel):
    name: Optional[str] = None
    owner_name: Optional[str] = None
    location: Optional[str] = None
    installed_spindles: Optional[int] = None
    installed_rotors: Optional[int] = None

class YarnDetail(BaseModel):
    count: str
    quantity: float

class RawMaterial(BaseModel):
    opening: float
    procurement: float
    consumption: float
    closing: float

class PaymentDetail(BaseModel):
    method: str  # e.g., "Cheque", "Draft", "Money Order", "Cash/Transfer"
    details: str

class MillMonthlyReport(BaseModel):
    reporting_month: str  # Format: "YYYY-MM"
    
    # Form A: Cotton Cess Return
    worked_spindles: Optional[int] = 0
    worked_rotors: Optional[int] = 0
    pressed_cotton_kg: float = 0.0
    unpressed_cotton_kg: float = 0.0
    cess_per_bale: float = 0.0
    remitted_amount: float = 0.0
    payment_details: List[PaymentDetail] = []
    
    # General Information
    working_days: int = 0
    shifts: float = 0.0
    yarn_cotton: List[YarnDetail] = []
    yarn_blended: List[YarnDetail] = []
    yarn_synthetic: List[YarnDetail] = []
    
    # Raw Material Position
    raw_material_domestic: Optional[RawMaterial] = None
    raw_material_imported: Optional[RawMaterial] = None
    raw_material_synthetic: Optional[RawMaterial] = None
    
    # Cotton Cess Status
    last_payment_amount: float = 0.0
    last_payment_date: Optional[str] = None
    amount_due: float = 0.0
    outstanding_cess: float = 0.0
    cess_paid_this_month: float = 0.0

    created_at: datetime = Field(default_factory=datetime.utcnow)
