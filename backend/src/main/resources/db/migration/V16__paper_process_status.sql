-- V16: Paper Process Status process_status(PROCESSING / READY / ERROR / DUPLICATE)
-- Product Plan 4.6 section: Each paper has process status
ALTER TABLE papers ADD COLUMN IF NOT EXISTS process_status VARCHAR(16) NOT NULL DEFAULT 'READY';