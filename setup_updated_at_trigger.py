#!/usr/bin/env python3
"""
Setup updated_at trigger for Supabase leads table

This SQL creates a trigger that automatically updates the updated_at
timestamp whenever a row is modified.
"""

print("\n" + "="*70)
print("SUPABASE - UPDATED_AT TRIGGER SETUP")
print("="*70)

print("\nSQL to execute in Supabase SQL Editor:")
print("-" * 70)

sql = """
-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on leads table
CREATE TRIGGER update_leads_updated_at
BEFORE UPDATE ON public.leads
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();
"""

print(sql)

print("-" * 70)
print("\nINSTRUCTIONS:")
print("1. Go to Supabase Dashboard → SQL Editor")
print("2. Create a new query")
print("3. Paste the SQL above")
print("4. Click 'Run'")
print("\nThis will automatically update 'updated_at' on every row modification.")
print("="*70 + "\n")
