-- 阅读状态与评级 —— Zotero 里最常用的两个「插件级」能力。
--
-- Zotero 用它们做「这篇读没读」「值不值得再看」的分诊，本项目此前完全没有：
-- 一篇文献进来之后，除了 ai_status 之外没有任何人工标记，
-- 库一大就分不清哪些看过、哪些是重点。
--
-- read_status: unread / reading / done —— 与 Zotero 的 /unread /reading /done 标签一致
-- rating: 0-5，0 表示未评级
ALTER TABLE papers ADD COLUMN IF NOT EXISTS read_status VARCHAR(16) NOT NULL DEFAULT 'unread';
ALTER TABLE papers ADD COLUMN IF NOT EXISTS rating SMALLINT NOT NULL DEFAULT 0;

ALTER TABLE papers DROP CONSTRAINT IF EXISTS papers_read_status_chk;
ALTER TABLE papers ADD CONSTRAINT papers_read_status_chk
    CHECK (read_status IN ('unread', 'reading', 'done'));

ALTER TABLE papers DROP CONSTRAINT IF EXISTS papers_rating_chk;
ALTER TABLE papers ADD CONSTRAINT papers_rating_chk CHECK (rating BETWEEN 0 AND 5);

CREATE INDEX IF NOT EXISTS idx_papers_read_status ON papers (read_status) WHERE NOT trashed;
