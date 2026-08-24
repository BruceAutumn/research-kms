-- Reading state and rating -- Zotero two most common in"Plugin-level"capability. 
--
-- Zotero use them as"Read this one""value not worth re-see"triage, this project never had: 
-- OnepaperPaperafter enter, except ai_status no manual marks outside, 
-- Large library cannot tell read ones, which are keyPoint. 
--
-- read_status: unread / reading / done -- and Zotero   /unread /reading /done Tag Consistent
-- rating: 0-5, 0 Means unrated
ALTER TABLE papers ADD COLUMN IF NOT EXISTS read_status VARCHAR(16) NOT NULL DEFAULT 'unread';
ALTER TABLE papers ADD COLUMN IF NOT EXISTS rating SMALLINT NOT NULL DEFAULT 0;

ALTER TABLE papers DROP CONSTRAINT IF EXISTS papers_read_status_chk;
ALTER TABLE papers ADD CONSTRAINT papers_read_status_chk
    CHECK (read_status IN ('unread', 'reading', 'done'));

ALTER TABLE papers DROP CONSTRAINT IF EXISTS papers_rating_chk;
ALTER TABLE papers ADD CONSTRAINT papers_rating_chk CHECK (rating BETWEEN 0 AND 5);

CREATE INDEX IF NOT EXISTS idx_papers_read_status ON papers (read_status) WHERE NOT trashed;
