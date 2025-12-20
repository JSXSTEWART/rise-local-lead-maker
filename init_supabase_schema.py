#!/usr/bin/env python3
"""
Initialize Supabase database schema for Rise Local Pipeline
"""

import os
import sys
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    print("❌ Error: SUPABASE_URL and SUPABASE_SERVICE_KEY not set in .env")
    sys.exit(1)

print("\n" + "="*70)
print("RISE LOCAL - SUPABASE SCHEMA INITIALIZATION")
print("="*70)

print(f"\n✓ Using Supabase: {SUPABASE_URL}")

print("\n⚠️  Supabase REST API doesn't support direct SQL execution.")
print("\nTo create the schema, use one of these methods:\n")

print("METHOD 1: Use Supabase Dashboard")
print("1. Go to: https://supabase.com/dashboard")
print("2. Select your project")
print("3. Go to SQL Editor")
print("4. Create a new query and paste the SQL below")
print("5. Click 'Run' to execute\n")

print("SQL TO EXECUTE:")
print("-" * 70)

sql = """CREATE TABLE IF NOT EXISTS leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_name VARCHAR(255) NOT NULL,
    address_full VARCHAR(500),
    address_city VARCHAR(100),
    address_state VARCHAR(2) DEFAULT 'TX',
    address_zip VARCHAR(10),
    phone VARCHAR(20),
    website VARCHAR(500),
    google_rating NUMERIC(3, 2),
    google_review_count INTEGER DEFAULT 0,
    place_id VARCHAR(255),
    status VARCHAR(50) DEFAULT 'new',
    lead_category VARCHAR(50) DEFAULT 'uncategorized',
    prequalification_status VARCHAR(50),
    prequalification_score NUMERIC(3, 2),
    qualification_status VARCHAR(50),
    qualification_score NUMERIC(3, 2),
    pain_score NUMERIC(3, 2),
    visual_score INTEGER DEFAULT 50,
    design_era VARCHAR(100),
    mobile_responsive BOOLEAN DEFAULT TRUE,
    social_facebook VARCHAR(255),
    social_instagram VARCHAR(255),
    social_linkedin VARCHAR(255),
    trust_signals INTEGER DEFAULT 0,
    has_hero_image BOOLEAN DEFAULT FALSE,
    has_clear_cta BOOLEAN DEFAULT FALSE,
    performance_score INTEGER DEFAULT 50,
    mobile_score INTEGER DEFAULT 50,
    seo_score INTEGER DEFAULT 50,
    accessibility_score INTEGER DEFAULT 50,
    has_https BOOLEAN DEFAULT TRUE,
    lcp_ms INTEGER DEFAULT 0,
    fid_ms INTEGER DEFAULT 0,
    cls NUMERIC(5, 3) DEFAULT 0,
    has_gtm BOOLEAN DEFAULT FALSE,
    has_ga4 BOOLEAN DEFAULT FALSE,
    has_ga_universal BOOLEAN DEFAULT FALSE,
    has_facebook_pixel BOOLEAN DEFAULT FALSE,
    has_hotjar BOOLEAN DEFAULT FALSE,
    has_chat_widget BOOLEAN DEFAULT FALSE,
    chat_provider VARCHAR(100),
    has_booking BOOLEAN DEFAULT FALSE,
    booking_provider VARCHAR(100),
    has_crm BOOLEAN DEFAULT FALSE,
    crm_provider VARCHAR(100),
    has_email_marketing BOOLEAN DEFAULT FALSE,
    email_provider VARCHAR(100),
    cms_detected VARCHAR(100),
    has_lead_capture_form BOOLEAN DEFAULT FALSE,
    has_contact_form BOOLEAN DEFAULT FALSE,
    tech_raw_list TEXT,
    tech_count INTEGER DEFAULT 0,
    tech_score INTEGER DEFAULT 0,
    tech_analysis JSONB,
    tech_stack_ai_score INTEGER DEFAULT 0,
    website_type VARCHAR(100),
    cms_platform_ai VARCHAR(100),
    yext_verified BOOLEAN DEFAULT FALSE,
    tdlr_license VARCHAR(100),
    tdlr_status VARCHAR(50),
    tdlr_verified BOOLEAN DEFAULT FALSE,
    bbb_rating VARCHAR(5),
    bbb_verified BOOLEAN DEFAULT FALSE,
    address_type VARCHAR(50),
    owner_name VARCHAR(255),
    owner_email VARCHAR(255),
    contact_email VARCHAR(255),
    email_subject VARCHAR(255),
    email_body TEXT,
    email_generated_at TIMESTAMP,
    email_delivered_at TIMESTAMP,
    delivery_status VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    processed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_prequalification ON leads(prequalification_status);
CREATE INDEX IF NOT EXISTS idx_leads_qualification ON leads(qualification_status);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_category ON leads(lead_category);"""

print(sql)

print("\n" + "="*70)
print("✓ Schema SQL generated. Copy and paste into Supabase SQL Editor.")
print("="*70 + "\n")
