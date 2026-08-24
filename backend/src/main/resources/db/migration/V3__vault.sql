-- ============================================================
-- V3__vault.sql -- Knowledge Vault Index Cache(additive migration)
-- ============================================================
-- ! important: since migration start, notes / note_links / note_properties
--    All are"Disk .md File index cache", Source of truth is Vault Files under dir. 
--    theseTableCan withwhenClearafter through POST /api/vault/reindex Full Rebuild, Delete/Clear them
--    will not lose any knowledgeData(Data in .md in file). Do not treat these three tables as
--    Source of truth for notes(except legacy /api/notes/{id} Besides compat path, Body always reads file). 
--
-- thisFileas pure additive: only addColumn/addTable/Build Index, no DROP TABLE / DROP COLUMN. 
-- ============================================================

-- notes: Extend columns for search. content Column kept but no longer source of truth(To Vault Index Row
-- no longer storeFull TextBody, Full-text search via search_vector; legacy Compat lines unaffected). 
alter table notes
  add column path          varchar(1024),             -- Vault Inner Relative Path(Like 01-Projects/x.md), legacy Behavior NULL
  add column mtime         bigint,                    -- File mtime(epoch millis), used forConflict Detection
  add column content_hash  varchar(64),               -- Body sha-256, for changeCompare
  add column indexed_at    timestamptz,               -- Last index time
  add column search_vector tsvector;                  -- Full-text Search token Index(non-Originaltext), Source still file

-- path uniqueOne(only Vault Index Row). also allow differentFolderexistSame NameNote, 
-- thereforeOriginal unique(user_id,title) constraint no longer applies, degrade to non-uniqueOneIndex: 
-- (Old constraint is unique index, Delete an index not in DROP TABLE/COLUMN, Semantically
--   is"Same-name files allowed in different dirs" Prerequisite, see docs/PHASE_4_REPORT.md)
drop index if exists idx_notes_user_title;
create index idx_notes_user_title on notes(user_id, title);
create unique index idx_notes_path on notes(path) where path is not null;
create index idx_notes_search on notes using gin(search_vector);

-- note_links: Extend Column, from"By Title"upgrade to"By Path + Title" Indexform. 
-- target_title Keep(legacy backlinks Query and unresolved links still use it). 
alter table note_links
  add column source_path varchar(1024),               -- Source File Relative Path
  add column target_path varchar(1024),               -- targetFileRelative Path(Parsedwhen)
  add column target_raw  varchar(512),                -- [[]] Inner raw text(not contain [[ and ]])
  add column alias       varchar(512),                -- [[Title|elseName]] otherName
  add column resolved    boolean not null default false;  -- targetFilewhether exists

create index idx_note_links_target_path on note_links(target_path) where target_path is not null;
create index idx_note_links_source_path on note_links(source_path) where source_path is not null;
create index idx_note_links_target_title on note_links(target_title);

-- note_properties: frontmatter Index cache of parse result(New Table). 
create table note_properties (
  id          bigserial primary key,
  note_id     bigint not null references notes(id) on delete cascade,
  key         varchar(128) not null,
  value       text,
  value_type  varchar(32) not null default 'text',    -- text/number/date/list/checkbox/link
  unique (note_id, key)
);
create index idx_note_properties_key on note_properties(key);
