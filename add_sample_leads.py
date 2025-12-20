#!/usr/bin/env python3
"""
Add sample leads to Supabase for testing the pipeline

This script inserts test data to validate the pre-qualification pipeline
"""

import os
import sys
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    print("❌ Error: SUPABASE_URL and SUPABASE_SERVICE_KEY not set in .env")
    sys.exit(1)

# Initialize Supabase client
supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

# Sample leads for testing
SAMPLE_LEADS = [
    {
        "business_name": "ABC Electric Services",
        "address_full": "123 Main St, Dallas, TX 75201",
        "address_city": "Dallas",
        "address_state": "TX",
        "address_zip": "75201",
        "phone": "(214) 555-0101",
        "website": "https://abcelectric.com",
        "google_rating": 4.5,
        "google_review_count": 47,
        "place_id": "ChIJN1blFLsCVIkRkknOnKV2wGk",
        "status": "new",
        "lead_category": "uncategorized",
    },
    {
        "business_name": "Smith's HVAC & Plumbing",
        "address_full": "456 Oak Ave, Houston, TX 77002",
        "address_city": "Houston",
        "address_state": "TX",
        "address_zip": "77002",
        "phone": "(713) 555-0202",
        "website": "https://smithshvac.local",
        "google_rating": 4.2,
        "google_review_count": 89,
        "place_id": "ChIJIQBpAG2qQIYR_6128GljmTQ",
        "status": "new",
        "lead_category": "uncategorized",
    },
    {
        "business_name": "Green Landscape Solutions",
        "address_full": "789 Pine Rd, Austin, TX 78701",
        "address_city": "Austin",
        "address_state": "TX",
        "address_zip": "78701",
        "phone": "(512) 555-0303",
        "website": "https://greenlandscape.biz",
        "google_rating": 4.8,
        "google_review_count": 156,
        "place_id": "ChIJ0-2u0vmrVIYRi9-Q-VXypIM",
        "status": "new",
        "lead_category": "uncategorized",
    },
    {
        "business_name": "Modern Dental Practice",
        "address_full": "321 Elm St, San Antonio, TX 78201",
        "address_city": "San Antonio",
        "address_state": "TX",
        "address_zip": "78201",
        "phone": "(210) 555-0404",
        "website": "https://moderndental.com",
        "google_rating": 4.7,
        "google_review_count": 203,
        "place_id": "ChIJm2jy4YjQQIYRoQzBHWrEqfI",
        "status": "new",
        "lead_category": "uncategorized",
    },
    {
        "business_name": "TechStart Consulting",
        "address_full": "555 Tech Blvd, Austin, TX 78704",
        "address_city": "Austin",
        "address_state": "TX",
        "address_zip": "78704",
        "phone": "(512) 555-0505",
        "website": "https://techstartconsulting.io",
        "google_rating": 4.9,
        "google_review_count": 42,
        "place_id": "ChIJ1234567890abcdefghij",
        "status": "new",
        "lead_category": "uncategorized",
    },
]

def main():
    print("\n" + "="*70)
    print("RISE LOCAL - ADD SAMPLE LEADS")
    print("="*70)
    
    print(f"\n✓ Connected to Supabase: {SUPABASE_URL}")
    print(f"✓ Total sample leads to insert: {len(SAMPLE_LEADS)}")
    
    try:
        # Insert leads
        response = supabase.table("leads").insert(SAMPLE_LEADS).execute()
        
        if response.data:
            print(f"\n✅ Successfully inserted {len(response.data)} sample leads!")
            print("\nInserted leads:")
            for lead in response.data:
                print(f"  • {lead['business_name']} ({lead['address_city']}, {lead['address_state']})")
                print(f"    → ID: {lead['id']}")
                print(f"    → Website: {lead['website']}")
        else:
            print("\n⚠️  No data returned from insert")
            
    except Exception as e:
        print(f"\n❌ Error inserting leads: {str(e)}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    
    print("\n" + "="*70)
    print("✓ Sample leads added! Ready to test the pipeline.")
    print("="*70)
    print("\nNext steps:")
    print("1. Run: python run_prequalification_batch.py --limit 1")
    print("2. Monitor the FREE scrapers in action")
    print("3. Check Supabase for qualification results")
    print("="*70 + "\n")

if __name__ == "__main__":
    main()
