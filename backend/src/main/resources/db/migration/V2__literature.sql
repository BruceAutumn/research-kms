-- ============================================================
-- Phase 3 Literature —— 纯 additive migration（无 DROP / 无丢数据）
-- 复用 papers / paper_metadata，新增 Collection / 标注 / 快照 / AI 提取落库。
-- ============================================================

-- papers 按需扩列（全部带默认值或可空，不丢数据）
alter table papers
    add column if not exists volume          varchar(64),
    add column if not exists pages           varchar(64),
    add column if not exists url             varchar(512),
    add column if not exists ai_status       varchar(32) not null default 'NOT_PROCESSED',
    add column if not exists favorite        boolean not null default false,
    add column if not exists trashed         boolean not null default false,
    add column if not exists date_modified   timestamptz,
    add column if not exists last_opened_at  timestamptz;

create index if not exists idx_papers_ai_status on papers(ai_status);
create index if not exists idx_papers_trashed  on papers(trashed);

-- 用户自建 Collection：树形（parent_id 自引用），多对多挂 Paper
create table collection (
    id          bigserial primary key,
    user_id     bigint not null references users(id),
    parent_id   bigint references collection(id) on delete cascade,
    name        varchar(256) not null,
    sort_order  int not null default 0,
    created_at  timestamptz not null default now()
);
create index idx_collection_user   on collection(user_id);
create index idx_collection_parent on collection(parent_id);

-- 关键语义：同一篇 Paper 可以属于多个 Collection（物理数据不复制）
create table collection_item (
    id            bigserial primary key,
    collection_id bigint not null references collection(id) on delete cascade,
    paper_id      bigint not null references papers(id) on delete cascade,
    created_at    timestamptz not null default now(),
    unique (collection_id, paper_id)
);
create index idx_collection_item_paper on collection_item(paper_id);

-- PDF 标注：坐标存 jsonb（PDF 页面坐标系归一化矩形列表）
create table annotation (
    id            bigserial primary key,
    user_id       bigint not null references users(id),
    paper_id      bigint not null references papers(id) on delete cascade,
    page          int not null,
    position      jsonb,
    selected_text text,
    color         varchar(16) not null default 'yellow',
    comment       text,
    created_at    timestamptz not null default now()
);
create index idx_annotation_paper on annotation(paper_id);

-- AI 写入前的元数据快照（可回滚、可追溯）
create table metadata_snapshot (
    id         bigserial primary key,
    paper_id   bigint not null references papers(id) on delete cascade,
    snapshot   jsonb not null,
    reason     varchar(128),
    created_at timestamptz not null default now()
);
create index idx_snapshot_paper on metadata_snapshot(paper_id);

-- AI 提取结果落库：保留 AI 原值 + 用户修正值 + 置信度 + 状态机
create table ai_extraction (
    id              bigserial primary key,
    paper_id        bigint not null references papers(id) on delete cascade,
    field           varchar(128) not null,
    field_group     varchar(32) not null default 'custom',
    original_value  text,
    extracted_value text,
    confidence      numeric(5,4),
    status          varchar(16) not null default 'PENDING',
    user_value      text,
    model_used      varchar(128),
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);
create index idx_ai_extraction_paper on ai_extraction(paper_id);
create index idx_ai_extraction_status on ai_extraction(status);
