create table users (
  id          bigserial primary key,
  username    varchar(64) not null unique,
  created_at  timestamptz not null default now()
);

create table papers (
  id          bigserial primary key,
  user_id     bigint not null references users(id),
  title       varchar(512) not null,
  authors     varchar(1024),
  journal     varchar(256),
  year        int,
  doi         varchar(128),
  abstract    text,
  tags        text[]      not null default '{}',
  pdf_path    varchar(512),
  pdf_text    text,                    -- PDFBox extractedFull Text, provide AI Read
  created_at  timestamptz not null default now()
);
create index idx_papers_user on papers(user_id);

-- User Custom Metadata: OneLineOne Field
-- note: this kind key-value Flexible but hard to numeric filter(E.g. Capacity > 200). 
-- v1 For now, Leave a line in code TODO comment says futureMaymigrate to jsonb. 
create table paper_metadata (
  id        bigserial primary key,
  paper_id  bigint not null references papers(id) on delete cascade,
  key       varchar(128) not null,
  value     text,
  unique (paper_id, key)
);

create table notes (
  id          bigserial primary key,
  user_id     bigint not null references users(id),
  title       varchar(512) not null,
  content     text not null default '',
  properties  jsonb not null default '{}',   -- Obsidian style properties
  paper_id    bigint references papers(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index idx_notes_user_title on notes(user_id, title);

create table note_links (
  id              bigserial primary key,
  source_note_id  bigint not null references notes(id) on delete cascade,
  target_title    varchar(512) not null,     -- storeTitleRather than id, allow link to non-existingNote
  unique (source_note_id, target_title)
);

create table agents (
  id          bigserial primary key,
  user_id     bigint not null references users(id),
  name        varchar(128) not null,
  model       varchar(128),
  prompt      text,
  tools       text[] not null default '{}',
  created_at  timestamptz not null default now()
);

create table app_settings (
  id           bigserial primary key,
  user_id      bigint not null unique references users(id),
  provider     varchar(64),      -- openai / deepseek / qwen / claude / local
  base_url     varchar(256),
  model        varchar(128),
  api_key      text
);

insert into users (username) values ('local');
