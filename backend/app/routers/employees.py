"""
Employees API router — CRUD + bulk import for employee roster.
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_db
from app.models.all_models import Employee, Company
from app.schemas.employee import EmployeeCreate, EmployeeUpdate, EmployeeResponse
from app.utils.encryption import encrypt_value, decrypt_value, mask_value

router = APIRouter(prefix="/api/employees", tags=["employees"])


@router.get("/", response_model=list[EmployeeResponse])
async def list_employees(
    company_code: Optional[str] = Query(None, description="按公司筛选"),
    tax_type: Optional[str] = Query(None, description="按计税模式筛选"),
    is_active: Optional[bool] = Query(True, description="是否在职"),
    search: Optional[str] = Query(None, description="按姓名或工号搜索"),
    db: AsyncSession = Depends(get_db),
):
    """List employees with optional filters."""
    stmt = select(Employee)

    if company_code:
        stmt = stmt.where(Employee.company_code == company_code)
    if tax_type:
        stmt = stmt.where(Employee.tax_type == tax_type)
    if is_active is not None:
        stmt = stmt.where(Employee.is_active == is_active)
    if search:
        stmt = stmt.where(
            (Employee.name.ilike(f"%{search}%"))
            | (Employee.employee_no.ilike(f"%{search}%"))
        )

    stmt = stmt.order_by(Employee.company_code, Employee.employee_no)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/{employee_id}", response_model=EmployeeResponse)
async def get_employee(employee_id: int, db: AsyncSession = Depends(get_db)):
    """Get a single employee by ID."""
    result = await db.execute(
        select(Employee).where(Employee.id == employee_id)
    )
    employee = result.scalar_one_or_none()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    return employee


@router.post("/", response_model=EmployeeResponse, status_code=201)
async def create_employee(
    data: EmployeeCreate, db: AsyncSession = Depends(get_db),
):
    """Create a new employee."""
    # Validate company_code exists
    result = await db.execute(
        select(Company).where(Company.code == data.company_code)
    )
    company = result.scalar_one_or_none()
    if not company:
        raise HTTPException(
            status_code=400,
            detail=f"Company code '{data.company_code}' not found. "
                   f"Use one of the 27 registered companies.",
        )

    # Check for duplicate employee_no
    existing = await db.execute(
        select(Employee).where(Employee.employee_no == data.employee_no)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=409,
            detail=f"Employee number '{data.employee_no}' already exists.",
        )

    employee = Employee(
        employee_no=data.employee_no,
        name=data.name,
        company_code=data.company_code,
        company_full_name=company.full_name,
        department=data.department,
        position=data.position,
        tax_type=data.tax_type,
        social_status=data.social_status,
        social_base=data.social_base,
        housing_fund_base=data.housing_fund_base,
        bank_account=encrypt_value(data.bank_account),
        id_number=encrypt_value(data.id_number),
        join_date=data.join_date,
        leave_date=data.leave_date,
    )
    db.add(employee)
    await db.flush()
    return employee


@router.put("/{employee_id}", response_model=EmployeeResponse)
async def update_employee(
    employee_id: int, data: EmployeeUpdate, db: AsyncSession = Depends(get_db),
):
    """Update an existing employee."""
    result = await db.execute(
        select(Employee).where(Employee.id == employee_id)
    )
    employee = result.scalar_one_or_none()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    update_data = data.model_dump(exclude_unset=True)

    # If company_code changed, validate and update full_name
    if "company_code" in update_data:
        new_code = update_data["company_code"]
        comp_result = await db.execute(
            select(Company).where(Company.code == new_code)
        )
        company = comp_result.scalar_one_or_none()
        if not company:
            raise HTTPException(status_code=400, detail=f"Company code '{new_code}' not found")
        update_data["company_full_name"] = company.full_name

    # Encrypt sensitive fields if provided
    if "bank_account" in update_data:
        update_data["bank_account"] = encrypt_value(update_data["bank_account"])
    if "id_number" in update_data:
        update_data["id_number"] = encrypt_value(update_data["id_number"])

    for key, value in update_data.items():
        setattr(employee, key, value)

    await db.flush()
    return employee


@router.delete("/{employee_id}", status_code=204)
async def delete_employee(employee_id: int, db: AsyncSession = Depends(get_db)):
    """Soft-delete an employee (set is_active=False)."""
    result = await db.execute(
        select(Employee).where(Employee.id == employee_id)
    )
    employee = result.scalar_one_or_none()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    employee.is_active = False
    await db.flush()
    return None


@router.get("/company/{company_code}", response_model=dict)
async def get_company_roster(
    company_code: str, db: AsyncSession = Depends(get_db),
):
    """Get the full roster for a specific company."""
    result = await db.execute(
        select(Employee)
        .where(Employee.company_code == company_code, Employee.is_active == True)
        .order_by(Employee.employee_no)
    )
    employees = result.scalars().all()

    result = await db.execute(
        select(Company).where(Company.code == company_code)
    )
    company = result.scalar_one_or_none()

    return {
        "company": {
            "code": company.code if company else company_code,
            "full_name": company.full_name if company else company_code,
            "region": company.region if company else "",
        },
        "employee_count": len(employees),
        "employees": employees,
    }
