-- 笔记自动保存的乐观锁。
--
-- 背景：800ms 防抖自动保存此前既没有版本号也没有 undo。同一篇笔记完全可能同时开在
-- Vault 模块（EditorPane，走 saveFile 带 baseMtime，有冲突检测）和 Reader 右侧
-- Notes tab（走 PUT /notes/{id}，NoteService.update 把 baseMtime 硬编码成 null，
-- 冲突检测被整条关掉）—— 后写的静默覆盖先写的，正文丢失且无人知晓。
--
-- 用独立 version 列而不是 JPA @Version：notes 是索引表，VaultIndexService 会在
-- 文件系统扫描时重写这些行，@Version 会把索引器的正常写入也判成冲突。
ALTER TABLE notes ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 0;
