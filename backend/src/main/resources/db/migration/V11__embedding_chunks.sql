-- 【R8 例外说明】
-- 正常规则是 Flyway 只增不改。此处删除 V10 新增的两列，理由：
--   1. 这两列从未写入过任何数据。执行前已验证：
--        SELECT count(*) FROM papers WHERE embedding IS NOT NULL  -> 0
--        SELECT count(*) FROM notes  WHERE embedding IS NOT NULL  -> 0
--      回填从未成功，因为 EmbeddingService 只能拿到默认聊天模型（DeepSeek），
--      而 DeepSeek 没有 /embeddings 端点，每次调用都是 404。
--   2. 维度错：vector(1536) 是 OpenAI text-embedding-3-small 的维度，与实际要走的
--      Ollama bge-m3（1024 维）对不上，插入必然报错。
--   3. 形状错（更根本）：papers.embedding 是「一篇论文一个向量」，而 embed 的是整篇
--      pdf_text。研究工具需要的是段落级检索 —— 要知道「哪一段讲了这个」，不是「哪篇
--      大概相关」；且整篇 PDF 远超任何 embedding 模型的上下文。
--   4. 趁列为空迁移成本最低；固化错误 schema 的代价更高。
-- 本次之后不再有例外。

DROP INDEX IF EXISTS papers_embedding_idx;
DROP INDEX IF EXISTS notes_embedding_idx;
ALTER TABLE papers DROP COLUMN IF EXISTS embedding;
ALTER TABLE notes  DROP COLUMN IF EXISTS embedding;

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE embedding_chunk (
    id           BIGSERIAL PRIMARY KEY,
    source_type  VARCHAR(16)  NOT NULL,   -- 'paper' | 'note'
    source_id    BIGINT       NOT NULL,
    chunk_index  INT          NOT NULL,
    page         INT,                     -- paper 才有，note 为 NULL
    char_start   INT,
    char_end     INT,
    text         TEXT         NOT NULL,
    model        VARCHAR(64)  NOT NULL,
    dim          INT          NOT NULL,
    embedding    vector(1024) NOT NULL,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT uq_chunk UNIQUE (source_type, source_id, chunk_index, model)
);

CREATE INDEX embedding_chunk_src_idx ON embedding_chunk (source_type, source_id);
CREATE INDEX embedding_chunk_vec_idx ON embedding_chunk
    USING hnsw (embedding vector_cosine_ops);

-- ------------------------------------------------------------------
-- llm_model 增加 capability：区分聊天模型与 embedding 模型。
-- 此前没有任何配置入口，EmbeddingService 只能通过 resolve(null) 抓默认聊天模型 ——
-- 这是 /embeddings 404 的直接原因。
-- model + dim 也记进 embedding_chunk：换模型时能识别旧向量并重新生成，
-- 不会把两种模型的向量混在一起做距离比较。
-- ------------------------------------------------------------------
ALTER TABLE llm_model ADD COLUMN IF NOT EXISTS capability VARCHAR(16) NOT NULL DEFAULT 'chat';

CREATE INDEX IF NOT EXISTS idx_llm_model_capability ON llm_model (capability) WHERE enabled;

-- 本机 Ollama provider + bge-m3。选 bge-m3 的理由：多语言、CJK 强（库里有中文文献）、
-- 8192 上下文、Apple Silicon 上跑得动。换模型必须同步改上面 vector(1024) 的维度。
INSERT INTO llm_provider (name, kind, base_url, api_key_encrypted, enabled, notes)
VALUES ('Ollama Local', 'ollama', 'http://localhost:11434', NULL, true,
        '本机 Ollama。embedding 走原生 /api/embeddings，无需 API Key。')
ON CONFLICT (name) DO NOTHING;

INSERT INTO llm_model (provider_id, model_id, display_name, context_window,
                       supports_tools, supports_stream, is_default, enabled, capability)
SELECT p.id, 'bge-m3', 'bge-m3 (embedding, 1024d)', 8192, false, false, false, true, 'embedding'
FROM llm_provider p
WHERE p.name = 'Ollama Local'
ON CONFLICT (provider_id, model_id) DO NOTHING;
