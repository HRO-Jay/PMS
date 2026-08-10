"""
Salary API router — Payroll calculation, records, and exports.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import select, and_, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_db
from app.models.all_models import Employee, SalaryRecord, Company
from app.schemas.salary import (
    SalaryRecordCreate, SalaryRecordUpdate, SalaryRecordResponse,
    PayrollRunRequest, PayrollRunResponse,
)
from app.services.calculator import PayrollCalculator
from app.services.excel_export import generate_salary_detail

router = APIRouter(prefix="/api/salary", tags=["salary"])


@router.get("/records", response_model=list[SalaryRecordResponse])
async def list_salary_records(
    period: str = Query(..., pattern=r"^\d{4}-\d{2}$"),
    company_code: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Get salary records for a given period, optionally filtered by company."""
    stmt = (
        select(SalaryRecord)
        .join(Employee, SalaryRecord.employee_id == Employee.id)
        .where(SalaryRecord.period == period)
    )
    if company_code:
        stmt = stmt.where(Employee.company_code == company_code)

    stmt = stmt.order_by(Employee.company_code, Employee.employee_no)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/records/{record_id}", response_model=SalaryRecordResponse)
async def get_salary_record(record_id: int, db: AsyncSession = Depends(get_db)):
    """Get a single salary record by ID."""
    result = await db.execute(
        select(SalaryRecord).where(SalaryRecord.id == record_id)
    )
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="Salary record not found")
    return record


@router.post("/records", response_model=SalaryRecordResponse, status_code=201)
async def create_salary_manual_entry(
    data: SalaryRecordCreate, db: AsyncSession = Depends(get_db),
):
    """Create a salary record with manual wage inputs. Triggers auto-calculation."""
    # Validate employee exists
    result = await db.execute(
        select(Employee).where(Employee.id == data.employee_id)
    )
    emp = result.scalar_one_or_none()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")

    # Check for duplicate period
    existing = await db.execute(
        select(SalaryRecord).where(
            and_(
                SalaryRecord.employee_id == data.employee_id,
                SalaryRecord.period == data.period,
            )
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=409,
            detail=f"Salary record already exists for employee {data.employee_id} in {data.period}",
        )

    record = SalaryRecord(**data.model_dump())
    db.add(record)
    await db.flush()

    # Auto-calculate
    calculator = PayrollCalculator(db, data.period)
    record = await calculator.calculate_single_employee(data.employee_id)

    return record


@router.put("/records/{record_id}", response_model=SalaryRecordResponse)
async def update_salary_record(
    record_id: int, data: SalaryRecordUpdate, db: AsyncSession = Depends(get_db),
):
    """Update manual wage inputs and recalculate."""
    result = await db.execute(
        select(SalaryRecord).where(SalaryRecord.id == record_id)
    )
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="Salary record not found")

    if record.is_locked:
        raise HTTPException(
            status_code=403,
            detail=f"Record is locked: {record.locked_reason or 'No reason provided'}",
        )

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(record, key, value)

    await db.flush()

    # Recalculate
    calculator = PayrollCalculator(db, record.period)
    record = await calculator.calculate_single_employee(
        record.employee_id, force_recalc=True,
    )

    return record


@router.post("/run", response_model=PayrollRunResponse)
async def run_payroll_cycle(
    request: PayrollRunRequest, db: AsyncSession = Depends(get_db),
):
    """
    Run a full payroll calculation cycle.

    If employee_ids is provided, only those employees are calculated.
    Otherwise, all active employees are processed.
    """
    calculator = PayrollCalculator(db, request.period)

    if request.employee_ids:
        success_ids = []
        errors = []
        for eid in request.employee_ids:
            try:
                await calculator.calculate_single_employee(
                    eid, force_recalc=request.force_recalc,
                )
                success_ids.append(eid)
            except Exception as e:
                errors.append({"emp_id": eid, "error": str(e)})
        success_count = len(success_ids)
        error_count = len(errors)
        total = len(request.employee_ids)
    else:
        results = await calculator.run_full_cycle()
        success_count = len(results["success"])
        error_count = len(results["errors"])
        errors = results["errors"]
        total = success_count + error_count

    # Calculate totals
    result = await db.execute(
        select(
            func.sum(SalaryRecord.wage_subtotal),
            func.sum(SalaryRecord.tax_amount),
            func.sum(SalaryRecord.net_pay),
            func.sum(SalaryRecord.total_cost),
        ).where(SalaryRecord.period == request.period)
    )
    totals = result.one_or_none()

    return PayrollRunResponse(
        period=request.period,
        total_employees=total,
        success_count=success_count,
        error_count=error_count,
        errors=errors,
        total_wages=totals[0] if totals else None,
        total_tax=totals[1] if totals else None,
        total_net_pay=totals[2] if totals else None,
        total_cost=totals[3] if totals else None,
    )


@router.get("/export/{period}")
async def export_salary(
    period: str, company_code: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Export salary data for a period as an Excel file."""
    stmt = (
        select(SalaryRecord, Employee, Company)
        .join(Employee, SalaryRecord.employee_id == Employee.id)
        .outerjoin(Company, Employee.company_code == Company.code)
        .where(SalaryRecord.period == period)
    )
    if company_code:
        stmt = stmt.where(Employee.company_code == company_code)

    stmt = stmt.order_by(Employee.company_code, Employee.employee_no)
    result = await db.execute(stmt)
    rows = result.all()

    excel_file = generate_salary_detail(rows, period)

    return StreamingResponse(
        excel_file,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f"attachment; filename=salary_{period}.xlsx"
        },
    )
