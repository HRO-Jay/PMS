"""
Attendance API router.
"""
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_db
from app.models.all_models import AttendanceRecord, Employee

router = APIRouter(prefix="/api/attendance", tags=["attendance"])


class AttendanceCreate(BaseModel):
    employee_id: int
    period: str = Field(..., pattern=r"^\d{4}-\d{2}$")
    sick_days: Decimal = Field(default=Decimal("0"), max_digits=5, decimal_places=1)
    personal_days: Decimal = Field(default=Decimal("0"), max_digits=5, decimal_places=1)
    annual_leave: Decimal = Field(default=Decimal("0"), max_digits=5, decimal_places=1)
    overtime_days: Decimal = Field(default=Decimal("0"), max_digits=5, decimal_places=1)
    adjustment_amount: Decimal = Field(default=Decimal("0"), max_digits=12, decimal_places=2)


class AttendanceUpdate(BaseModel):
    sick_days: Decimal | None = Field(None, max_digits=5, decimal_places=1)
    personal_days: Decimal | None = Field(None, max_digits=5, decimal_places=1)
    annual_leave: Decimal | None = Field(None, max_digits=5, decimal_places=1)
    overtime_days: Decimal | None = Field(None, max_digits=5, decimal_places=1)
    adjustment_amount: Decimal | None = Field(None, max_digits=12, decimal_places=2)


@router.get("/")
async def get_attendance(
    period: str = Query(..., pattern=r"^\d{4}-\d{2}$"),
    employee_id: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Get attendance records for a given period."""
    stmt = select(AttendanceRecord, Employee).join(
        Employee, AttendanceRecord.employee_id == Employee.id
    ).where(AttendanceRecord.period == period)

    if employee_id:
        stmt = stmt.where(AttendanceRecord.employee_id == employee_id)

    stmt = stmt.order_by(Employee.company_code, Employee.employee_no)
    result = await db.execute(stmt)
    rows = result.all()

    return {
        "period": period,
        "total": len(rows),
        "records": [
            {
                "id": rec.id,
                "employee_id": rec.employee_id,
                "employee_no": emp.employee_no,
                "name": emp.name,
                "sick_days": float(rec.sick_days) if rec.sick_days else 0,
                "personal_days": float(rec.personal_days) if rec.personal_days else 0,
                "annual_leave": float(rec.annual_leave) if rec.annual_leave else 0,
                "overtime_days": float(rec.overtime_days) if rec.overtime_days else 0,
                "adjustment_amount": float(rec.adjustment_amount) if rec.adjustment_amount else 0,
            }
            for rec, emp in rows
        ],
    }


@router.post("/", status_code=201)
async def create_attendance(
    data: AttendanceCreate, db: AsyncSession = Depends(get_db),
):
    """Create or update an attendance record (upsert by employee_id + period)."""
    # Check employee exists
    result = await db.execute(
        select(Employee).where(Employee.id == data.employee_id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Employee not found")

    # Upsert
    result = await db.execute(
        select(AttendanceRecord).where(
            and_(
                AttendanceRecord.employee_id == data.employee_id,
                AttendanceRecord.period == data.period,
            )
        )
    )
    existing = result.scalar_one_or_none()

    if existing:
        existing.sick_days = data.sick_days
        existing.personal_days = data.personal_days
        existing.annual_leave = data.annual_leave
        existing.overtime_days = data.overtime_days
        existing.adjustment_amount = data.adjustment_amount
        record = existing
    else:
        record = AttendanceRecord(**data.model_dump())
        db.add(record)

    await db.flush()
    return {"id": record.id, "status": "created" if not existing else "updated"}
