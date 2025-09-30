-- Enhanced Borgmatic Statistics Database Schema
-- Improved to capture all requested data points

-- Drop tables if they exist (for clean reinstall)
DROP TABLE IF EXISTS backup_archives CASCADE;
DROP TABLE IF EXISTS repository_stats CASCADE;
DROP TABLE IF EXISTS backup_sources CASCADE;
DROP TABLE IF EXISTS database_backups CASCADE;
DROP TABLE IF EXISTS pruning_config CASCADE;
DROP TABLE IF EXISTS repositories CASCADE;

-- Create repositories table to track different backup repositories
CREATE TABLE repositories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    path VARCHAR(500) NOT NULL,
    location_type VARCHAR(20) NOT NULL CHECK (location_type IN ('local', 'remote')),
    repository_id VARCHAR(64) UNIQUE, -- The Borg repository ID
    encryption_mode VARCHAR(50),
    size_on_disk_bytes BIGINT, -- Physical size of repository on disk
    last_modified TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create repository statistics table for overall repo metrics
CREATE TABLE repository_stats (
    id SERIAL PRIMARY KEY,
    repository_id INTEGER REFERENCES repositories(id) ON DELETE CASCADE,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    total_archives INTEGER NOT NULL,
    total_size_bytes BIGINT NOT NULL,
    total_compressed_size_bytes BIGINT NOT NULL,
    total_deduplicated_size_bytes BIGINT NOT NULL,
    unique_chunks INTEGER,
    total_chunks INTEGER,
    unique_csize BIGINT,
    total_csize BIGINT,
    compression_ratio DECIMAL(5,2),
    deduplication_ratio DECIMAL(5,2)
);

-- Create individual backup archives table
CREATE TABLE backup_archives (
    id SERIAL PRIMARY KEY,
    repository_id INTEGER REFERENCES repositories(id) ON DELETE CASCADE,
    archive_name VARCHAR(255) NOT NULL,
    archive_hash VARCHAR(64) NOT NULL,
    hostname VARCHAR(255),
    username VARCHAR(100),
    comment TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE,
    duration_seconds DECIMAL(10,2),
    original_size_bytes BIGINT NOT NULL,
    compressed_size_bytes BIGINT NOT NULL,
    deduplicated_size_bytes BIGINT NOT NULL,
    number_of_files INTEGER,
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(repository_id, archive_hash)
);

-- Create table for backup source directories
CREATE TABLE backup_sources (
    id SERIAL PRIMARY KEY,
    repository_id INTEGER REFERENCES repositories(id) ON DELETE CASCADE,
    source_path VARCHAR(500) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    added_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(repository_id, source_path)
);

-- Create table for database backup tracking
CREATE TABLE database_backups (
    id SERIAL PRIMARY KEY,
    archive_id INTEGER REFERENCES backup_archives(id) ON DELETE CASCADE,
    database_type VARCHAR(50) NOT NULL CHECK (database_type IN ('postgresql', 'mariadb', 'mysql', 'mongodb', 'sqlite')),
    database_name VARCHAR(255) NOT NULL,
    hostname VARCHAR(255),
    size_bytes BIGINT,
    backup_path VARCHAR(500),
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create table for pruning configuration
CREATE TABLE pruning_config (
    id SERIAL PRIMARY KEY,
    repository_id INTEGER REFERENCES repositories(id) ON DELETE CASCADE,
    keep_daily INTEGER,
    keep_weekly INTEGER,
    keep_monthly INTEGER,
    keep_yearly INTEGER,
    keep_within VARCHAR(50),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(repository_id)
);

-- Create summary statistics view
CREATE VIEW backup_summary AS
SELECT 
    r.name as repository_name,
    r.location_type,
    r.path as repository_path,
    COUNT(DISTINCT ba.id) as total_backups,
    MAX(ba.created_at) as last_backup_time,
    EXTRACT(EPOCH FROM (NOW() - MAX(ba.created_at)))/3600 as hours_since_last_backup,
    SUM(ba.original_size_bytes) as total_original_size,
    SUM(ba.compressed_size_bytes) as total_compressed_size,
    SUM(ba.deduplicated_size_bytes) as total_deduplicated_size,
    AVG(ba.duration_seconds) as avg_backup_duration,
    COUNT(DISTINCT db.id) as total_database_backups
FROM repositories r
LEFT JOIN backup_archives ba ON r.id = ba.repository_id
LEFT JOIN database_backups db ON ba.id = db.archive_id
GROUP BY r.id, r.name, r.location_type, r.path;

-- Create view for recent backup status
CREATE VIEW recent_backup_status AS
SELECT 
    r.name as repository_name,
    r.location_type,
    ba.archive_name,
    ba.created_at,
    ba.duration_seconds,
    ba.number_of_files,
    ba.original_size_bytes,
    ba.deduplicated_size_bytes,
    ROUND((1 - (ba.deduplicated_size_bytes::DECIMAL / NULLIF(ba.original_size_bytes, 0))) * 100, 2) as dedup_savings_percent
FROM repositories r
JOIN backup_archives ba ON r.id = ba.repository_id
WHERE ba.created_at = (
    SELECT MAX(created_at) 
    FROM backup_archives 
    WHERE repository_id = r.id
)
ORDER BY ba.created_at DESC;

-- Create indexes for better query performance
CREATE INDEX idx_repository_stats_timestamp ON repository_stats(timestamp);
CREATE INDEX idx_repository_stats_repo_id ON repository_stats(repository_id);
CREATE INDEX idx_backup_archives_created_at ON backup_archives(created_at);
CREATE INDEX idx_backup_archives_repo_id ON backup_archives(repository_id);
CREATE INDEX idx_database_backups_archive_id ON database_backups(archive_id);
CREATE INDEX idx_backup_sources_repo_id ON backup_sources(repository_id);

-- Create a function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers to automatically update updated_at
CREATE TRIGGER update_repositories_updated_at 
    BEFORE UPDATE ON repositories 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_pruning_config_updated_at 
    BEFORE UPDATE ON pruning_config 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Function to get latest backup status for each repository
CREATE OR REPLACE FUNCTION get_backup_health_status()
RETURNS TABLE (
    repository_name VARCHAR,
    location_type VARCHAR,
    last_backup TIMESTAMP WITH TIME ZONE,
    hours_since_backup NUMERIC,
    health_status VARCHAR
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        r.name,
        r.location_type,
        MAX(ba.created_at) as last_backup,
        EXTRACT(EPOCH FROM (NOW() - MAX(ba.created_at)))/3600 as hours_since,
        CASE 
            WHEN EXTRACT(EPOCH FROM (NOW() - MAX(ba.created_at)))/3600 < 24 THEN 'healthy'
            WHEN EXTRACT(EPOCH FROM (NOW() - MAX(ba.created_at)))/3600 < 48 THEN 'warning'
            ELSE 'critical'
        END as status
    FROM repositories r
    LEFT JOIN backup_archives ba ON r.id = ba.repository_id
    GROUP BY r.id, r.name, r.location_type;
END;
$$ LANGUAGE plpgsql;