#!/usr/bin/env python3
"""
Add missing columns to leads table in Supabase
"""

print("\n" + "="*70)
print("SUPABASE - ADD MISSING COLUMNS")
print("="*70)

print("\nSQL to execute in Supabase SQL Editor:")
print("-" * 70)

sql = """
-- Add missing columns to leads table
ALTER TABLE leads ADD COLUMN IF NOT EXISTS address_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS address_verified_at TIMESTAMP;
"""

print(sql)

print("-" * 70)
print("\nINSTRUCTIONS:")
print("1. Go to Supabase Dashboard → SQL Editor")
print("2. Create a new query")
print("3. Paste the SQL above")
print("4. Click 'Run'")
print("\nThis will add the missing columns needed by the pipeline.")
print("="*70 + "\n")
