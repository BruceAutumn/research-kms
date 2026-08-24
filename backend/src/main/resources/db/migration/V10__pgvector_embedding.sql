CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE papers ADD COLUMN IF NOT EXISTS embedding vector(1536);
ALTER TABLE notes  ADD COLUMN IF NOT EXISTS embedding vector(1536);

CREATE INDEX IF NOT EXISTS papers_embedding_idx ON papers USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS notes_embedding_idx  ON notes  USING hnsw (embedding vector_cosine_ops);