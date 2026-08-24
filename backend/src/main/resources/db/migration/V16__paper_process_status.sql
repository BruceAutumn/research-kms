-- V16: 论文处理状态 process_status（PROCESSING / READY / ERROR / DUPLICATE）
-- 产品方案 4.6 节：每篇论文都有处理状态
ALTER TABLE papers ADD COLUMN IF NOT EXISTS process_status VARCHAR(16) NOT NULL DEFAULT 'READY';