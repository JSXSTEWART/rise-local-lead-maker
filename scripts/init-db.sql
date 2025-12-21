-- Rise Local Lead Maker - Database Schema
-- This file is auto-run by MySQL container on first startup

CREATE TABLE IF NOT EXISTS leads (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) UNIQUE,
  first_name VARCHAR(255),
  last_name VARCHAR(255),
  company VARCHAR(255),
  title VARCHAR(255),
  phone VARCHAR(100),
  website VARCHAR(500),
  linkedin_url VARCHAR(500),
  location VARCHAR(255),
  industry VARCHAR(255),
  company_size VARCHAR(100),
  enriched_at DATETIME,
  source VARCHAR(100),
  status ENUM('new', 'enriching', 'enriched', 'failed') DEFAULT 'new',
  metadata JSON,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_leads_email (email),
  INDEX idx_leads_status (status),
  INDEX idx_leads_source (source),
  INDEX idx_leads_company (company),
  INDEX idx_leads_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
