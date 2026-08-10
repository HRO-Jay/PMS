"""
seed_companies.py — Load company_mapping.json into Supabase.

Usage:
    python scripts/seed_companies.py [--env .env]

Reads company_mapping.json (27 companies) and upserts into the `companies` table.
Idempotent: safe to run multiple times.
"""
import os, sys, json, argparse
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client

PROJECT_ROOT = Path(__file__).resolve().parent.parent
MAPPING_FILE = PROJECT_ROOT / "company_mapping.json"


def main():
    parser = argparse.ArgumentParser(description="Seed companies into Supabase")
    parser.add_argument("--env", default=str(PROJECT_ROOT / ".env"), help="Path to .env file")
    args = parser.parse_args()

    load_dotenv(args.env)

    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print("❌ SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env")
        sys.exit(1)

    supabase = create_client(url, key)

    with open(MAPPING_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)

    companies = data["companies"]
    print(f"📋 Loading {len(companies)} companies from {MAPPING_FILE.name}...")

    rows = []
    for c in companies:
        rows.append({
            "code": c["code"],
            "full_name": c["full_name"],
            "short_name": c["short_name"],
            "region": c.get("region", ""),
            "category": c.get("category", ""),
            "social_policy": c.get("social_policy", ""),
            "finance_contact": c.get("finance_contact") or None,
            "seal_person": c.get("seal_person") or None,
            "is_active": True,
        })

    # Upsert by code (idempotent)
    result = supabase.table("companies").upsert(rows, on_conflict="code").execute()

    print(f"✅ Seeded {len(rows)} companies successfully.")
    print(f"   Response: {getattr(result, 'count', 'N/A')} rows affected.")

    # Verify
    verify = supabase.table("companies").select("code, full_name, region").execute()
    print(f"\n📊 Verification — {len(verify.data)} companies in DB:")
    for r in sorted(verify.data, key=lambda x: x["code"]):
        print(f"   {r['code']:25s} | {r['full_name']:35s} | {r['region']}")


if __name__ == "__main__":
    main()
