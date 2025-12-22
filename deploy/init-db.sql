-- Rise Local Lead Maker Database Schema
-- Target: MySQL 8.0 on cPanel (apex2600_riselocal)
-- Run: mysql -h localhost -u apex2600_riselocal -p apex2600_riselocal < scripts/init-db.sql

-- ============================================================================
-- LEADS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS leads (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    company VARCHAR(255),
    title VARCHAR(255),
    phone VARCHAR(20),
    website VARCHAR(255),
    industry VARCHAR(100),
    location VARCHAR(255),
    status ENUM('new', 'contacted', 'enriched', 'qualified', 'rejected', 'converted') DEFAULT 'new',
    source ENUM('manual', 'csv_import', 'web_scraper', 'api', 'google_sheets', 'clay', 'other') DEFAULT 'api',
    source_details JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    enrichment_status ENUM('pending', 'in_progress', 'enriched', 'failed', 'skipped') DEFAULT 'pending',
    enrichment_score DECIMAL(5,2) DEFAULT 0,
    notes TEXT,
    deleted_at TIMESTAMP NULL,
    
    INDEX idx_email (email),
    INDEX idx_status (status),
    INDEX idx_source (source),
    INDEX idx_created (created_at),
    INDEX idx_company (company),
    INDEX idx_enrichment (enrichment_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- ENRICHMENT_LOGS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS enrichment_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    lead_id INT NOT NULL,
    provider ENUM('clay', 'anthropic', 'gemini', 'google_places', 'manual') NOT NULL,
    action VARCHAR(50),
    request_data JSON,
    response_data JSON,
    success BOOLEAN DEFAULT TRUE,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    duration_ms INT,
    cost DECIMAL(8,4) DEFAULT 0,
    
    FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
    INDEX idx_lead (lead_id),
    INDEX idx_provider (provider),
    INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- EXPORTS TABLE (Track Sheets exports)
-- ============================================================================
CREATE TABLE IF NOT EXISTS exports (
    id INT AUTO_INCREMENT PRIMARY KEY,
    destination ENUM('google_sheets', 'csv_file', 'salesforce', 'other') NOT NULL,
    status ENUM('pending', 'in_progress', 'success', 'failed') DEFAULT 'pending',
    total_records INT DEFAULT 0,
    exported_records INT DEFAULT 0,
    error_message TEXT,
    export_config JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP NULL,
    duration_ms INT,
    
    INDEX idx_status (status),
    INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- SYNCED_LEADS TABLE (Track what's exported)
-- ============================================================================
CREATE TABLE IF NOT EXISTS synced_leads (
    id INT AUTO_INCREMENT PRIMARY KEY,
    lead_id INT NOT NULL,
    export_id INT,
    destination VARCHAR(100),
    last_synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    synced_data JSON,
    
    UNIQUE KEY unique_lead_dest (lead_id, destination),
    FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
    INDEX idx_export (export_id),
    INDEX idx_destination (destination)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- API_USAGE TABLE (Track API quota)
-- ============================================================================
CREATE TABLE IF NOT EXISTS api_usage (
    id INT AUTO_INCREMENT PRIMARY KEY,
    provider VARCHAR(50) NOT NULL,
    endpoint VARCHAR(255),
    method VARCHAR(10),
    status_code INT,
    request_count INT DEFAULT 1,
    cost DECIMAL(10,6) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_provider (provider),
    INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- SAMPLE DATA (Optional - for testing)
-- ============================================================================
INSERT INTO leads (email, first_name, last_name, company, title, status, source) VALUES
('ana.lopez@example.com', 'Ana', 'Lopez', 'Tech Solutions Inc', 'CEO', 'enriched', 'csv_import'),
('bob.lee@example.com', 'Bob', 'Lee', 'Digital Marketing Ltd', 'Director', 'qualified', 'csv_import'),
('carol.kim@example.com', 'Carol', 'Kim', 'Growth Ventures', 'VP Sales', 'contacted', 'csv_import'),
('dave.rios@example.com', 'Dave', 'Rios', 'Cloud Systems', 'CTO', 'new', 'csv_import')
ON DUPLICATE KEY UPDATE updated_at=CURRENT_TIMESTAMP;

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================
-- Note: Primary indexes created with table definitions above
-- Additional compound indexes for common queries:

ALTER TABLE leads ADD INDEX idx_company_status (company, status);
ALTER TABLE leads ADD INDEX idx_status_created (status, created_at);
ALTER TABLE enrichment_logs ADD INDEX idx_lead_provider (lead_id, provider);

-- ============================================================================
-- VIEWS (Optional)
-- ============================================================================

-- View: Summary of leads by status
CREATE OR REPLACE VIEW leads_summary AS
SELECT 
    status,
    COUNT(*) as count,
    COUNT(DISTINCT company) as unique_companies,
    MIN(created_at) as oldest,
    MAX(created_at) as newest
FROM leads
WHERE deleted_at IS NULL
GROUP BY status;

-- View: Enrichment success rate
CREATE OR REPLACE VIEW enrichment_stats AS
SELECT 
    provider,
    COUNT(*) as total_calls,
    SUM(CASE WHEN success THEN 1 ELSE 0 END) as successful,
    ROUND(100 * SUM(CASE WHEN success THEN 1 ELSE 0 END) / COUNT(*), 2) as success_rate,
    ROUND(AVG(duration_ms), 0) as avg_duration_ms,
    ROUND(SUM(cost), 2) as total_cost
FROM enrichment_logs
GROUP BY provider;

-- ============================================================================
-- STORED PROCEDURES
-- ============================================================================

-- Procedure: Mark leads as exported
DELIMITER //
CREATE PROCEDURE IF NOT EXISTS mark_leads_exported(
    IN p_export_id INT,
    IN p_destination VARCHAR(100)
)
BEGIN
    INSERT INTO synced_leads (lead_id, export_id, destination, synced_data)
    SELECT id, p_export_id, p_destination, 
        JSON_OBJECT('synced_at', NOW(), 'status', status)
    FROM leads
    ON DUPLICATE KEY UPDATE 
        export_id = p_export_id,
        last_synced_at = NOW();
END//
DELIMITER ;

-- Procedure: Get leads pending enrichment
DELIMITER //
CREATE PROCEDURE IF NOT EXISTS get_pending_enrichment(
    IN p_limit INT
)
BEGIN
    SELECT id, email, first_name, last_name, company, title
    FROM leads
    WHERE enrichment_status = 'pending' 
    AND deleted_at IS NULL
    ORDER BY created_at ASC
    LIMIT p_limit;
END//
DELIMITER ;

-- ============================================================================
-- GRANTS & SECURITY
-- ============================================================================
-- The user 'apex2600_riselocal' should have been created with all privileges
-- Verify with: SHOW GRANTS FOR 'apex2600_riselocal'@'localhost';

-- Grant specific privileges if needed:
-- GRANT SELECT, INSERT, UPDATE, DELETE ON apex2600_riselocal.* TO 'apex2600_riselocal'@'localhost';
-- FLUSH PRIVILEGES;

-- ============================================================================
-- CHANGELOG
-- ============================================================================
-- 2024-01-XX: Initial schema creation
-- - leads: Core lead records with status tracking
-- - enrichment_logs: Track enrichment API calls
-- - exports: Monitor data exports to Sheets
-- - synced_leads: Track export history
-- - api_usage: Monitor API quota and costs
