-- ============================================================
-- V4__vault_fixes.sql — 修正 V3 遗留约束（additive）
-- ============================================================
-- V3 保留了 v1 的 unique(source_note_id, target_title)。新模型下同一笔记
-- 可以以不同形态引用同一目标（如 [[标题]] 与 [[标题#章节]]），旧唯一约束
-- 会拒绝这种合法数据。note_links 已是索引缓存（可重建），此处仅删除
-- 一个索引级约束，不属于 DROP TABLE/COLUMN，无数据损失。
alter table note_links drop constraint if exists note_links_source_note_id_target_title_key;
