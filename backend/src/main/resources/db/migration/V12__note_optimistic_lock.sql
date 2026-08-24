-- Optimistic lock for note autosave. 
--
-- background: 800ms Debounced autosave had neither version nor undo. sameOnepaperNotefullyMayalso open in
-- Vault Module(EditorPane, go saveFile with baseMtime, Has conflict detection)and Reader Right
-- Notes tab(go PUT /notes/{id}, NoteService.update   baseMtime Hardcoded to null, 
-- Conflict detection fully off)-- later silent overwriteWrite first , Body lost silently. 
--
-- use independent version Column not JPA @Version: notes is index table, VaultIndexService will at
-- Rewrite these lines on fs scan, @Version will putIndexnormalWriteAlsojudge asConflict. 
ALTER TABLE notes ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 0;
