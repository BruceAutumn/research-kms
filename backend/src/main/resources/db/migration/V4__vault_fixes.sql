-- ============================================================
-- V4__vault_fixes.sql -- fix V3 legacy constraint(additive)
-- ============================================================
-- V3 Keep v1   unique(source_note_id, target_title). Same note under new model
-- Can reference same target in forms(Like [[Title]] and [[Title#chapter]]), Old Unique Constraint
-- will reject this legalData. note_links Already index cache(Rebuildable), Only delete here
-- One Indexlevel constraint, not belong DROP TABLE/COLUMN, No Data Loss. 
alter table note_links drop constraint if exists note_links_source_note_id_target_title_key;
