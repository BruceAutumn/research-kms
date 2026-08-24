ALTER TABLE annotation ADD COLUMN IF NOT EXISTS rects_json TEXT;
ALTER TABLE annotation ADD COLUMN IF NOT EXISTS type VARCHAR(24) NOT NULL DEFAULT 'highlight';
ALTER TABLE annotation ADD COLUMN IF NOT EXISTS sort_key DOUBLE PRECISION;
ALTER TABLE annotation ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_annotation_paper_page ON annotation (paper_id, page, sort_key);