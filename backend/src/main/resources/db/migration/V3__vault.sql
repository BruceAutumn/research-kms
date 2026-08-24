-- ============================================================
-- V3__vault.sql — Knowledge Vault 索引缓存（additive migration）
-- ============================================================
-- ⚠️ 重要：自本 migration 起，notes / note_links / note_properties
--    全部是「磁盘 .md 文件的索引缓存」，真相来源是 Vault 目录下的文件。
--    这些表可随时清空后经 POST /api/vault/reindex 全量重建，删除/清空它们
--    不会丢失任何知识数据（数据在 .md 文件里）。请勿再把这三张表当作
--    笔记的真相来源（除 legacy /api/notes/{id} 兼容路径外，正文一律读文件）。
--
-- 本文件为纯 additive：只加列/加表/建索引，无 DROP TABLE / DROP COLUMN。
-- ============================================================

-- notes：扩列作索引用途。content 列保留但不再是真相来源（对 Vault 索引行
-- 不再存全文正文，全文搜索走 search_vector；legacy 兼容行不受影响）。
alter table notes
  add column path          varchar(1024),             -- Vault 内相对路径（如 01-Projects/x.md），legacy 行为 NULL
  add column mtime         bigint,                    -- 文件 mtime（epoch millis），用于冲突检测
  add column content_hash  varchar(64),               -- 正文 sha-256，用于变更比对
  add column indexed_at    timestamptz,               -- 最近一次索引时间
  add column search_vector tsvector;                  -- 全文检索 token 索引（非原文），来源仍是文件

-- path 唯一（仅限 Vault 索引行）。同时允许不同文件夹存在同名笔记，
-- 因此原 unique(user_id,title) 约束不再适用，降级为非唯一索引：
-- （旧约束为 unique index，删除一个索引不属于 DROP TABLE/COLUMN，语义上
--   是「同名文件允许存在于不同目录」的必备前提，见 docs/PHASE_4_REPORT.md）
drop index if exists idx_notes_user_title;
create index idx_notes_user_title on notes(user_id, title);
create unique index idx_notes_path on notes(path) where path is not null;
create index idx_notes_search on notes using gin(search_vector);

-- note_links：扩列，从「按标题」升级为「按路径 + 标题」的索引形态。
-- target_title 保留（legacy backlinks 查询与未解析链接仍用它）。
alter table note_links
  add column source_path varchar(1024),               -- 源文件相对路径
  add column target_path varchar(1024),               -- 目标文件相对路径（已解析时）
  add column target_raw  varchar(512),                -- [[]] 内原始文本（不含 [[ 与 ]]）
  add column alias       varchar(512),                -- [[标题|别名]] 的别名
  add column resolved    boolean not null default false;  -- 目标文件是否存在

create index idx_note_links_target_path on note_links(target_path) where target_path is not null;
create index idx_note_links_source_path on note_links(source_path) where source_path is not null;
create index idx_note_links_target_title on note_links(target_title);

-- note_properties：frontmatter 解析结果的索引缓存（新表）。
create table note_properties (
  id          bigserial primary key,
  note_id     bigint not null references notes(id) on delete cascade,
  key         varchar(128) not null,
  value       text,
  value_type  varchar(32) not null default 'text',    -- text/number/date/list/checkbox/link
  unique (note_id, key)
);
create index idx_note_properties_key on note_properties(key);
