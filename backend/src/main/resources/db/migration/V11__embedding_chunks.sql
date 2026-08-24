-- [R8 Exampleexternal note]
-- normal rule is Flyway only add not modify. Delete Here V10 Two new columns, reason: 
--   1. These two columns never written. Verified before execution: 
--        SELECT count(*) FROM papers WHERE embedding IS NOT NULL  -> 0
--        SELECT count(*) FROM notes  WHERE embedding IS NOT NULL  -> 0
--      Backfill never succeeded, because EmbeddingService Can only get default chat model(DeepSeek), 
--      And DeepSeek no /embeddings Endpoint, each timeCallall are 404. 
--   2. Dimension Mismatch: vector(1536) is OpenAI text-embedding-3-small dimension, and actual
--      Ollama bge-m3(1024 Dim)Mismatch, Insert will error. 
--   3. Shape Mismatch(moreRootthis): papers.embedding is"One vector per paper", And embed is whole
--      pdf_text. researchToolneedParagraph-levelretrieve -- know"Which paragraph covers this", is not"which paper
--      Largeroughly related"; andWhole PDF far exceed embedding Model context. 
--   4. whileColumnasEmptylowest migration cost; pinError schema higher cost. 
-- no more after thisExampleout. 

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
    page         INT,                     -- paper only then, note as NULL
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
-- llm_model Add capability: Distinguish chat model from embedding Model. 
-- before no anyConfigentry, EmbeddingService only via resolve(null) Grab default chat model --
-- this is /embeddings 404 directOriginalbecause. 
-- model + dim Also log into embedding_chunk: Detect old vectors on model change and regenerate, 
-- Will not mix vectors of two models for distance. 
-- ------------------------------------------------------------------
ALTER TABLE llm_model ADD COLUMN IF NOT EXISTS capability VARCHAR(16) NOT NULL DEFAULT 'chat';

CREATE INDEX IF NOT EXISTS idx_llm_model_capability ON llm_model (capability) WHERE enabled;

-- local Ollama provider + bge-m3. Select bge-m3 reason: multilingual, CJK strong(Library has Chinese papers), 
-- 8192 Context, Apple Silicon runs on. Model change must sync above vector(1024) dimension. 
INSERT INTO llm_provider (name, kind, base_url, api_key_encrypted, enabled, notes)
VALUES ('Ollama Local', 'ollama', 'http://localhost:11434', NULL, true,
        'local Ollama. embedding goOriginalgenerate /api/embeddings, no need API Key. ')
ON CONFLICT (name) DO NOTHING;

INSERT INTO llm_model (provider_id, model_id, display_name, context_window,
                       supports_tools, supports_stream, is_default, enabled, capability)
SELECT p.id, 'bge-m3', 'bge-m3 (embedding, 1024d)', 8192, false, false, false, true, 'embedding'
FROM llm_provider p
WHERE p.name = 'Ollama Local'
ON CONFLICT (provider_id, model_id) DO NOTHING;
