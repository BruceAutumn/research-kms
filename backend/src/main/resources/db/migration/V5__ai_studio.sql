-- Phase 5 AI Studio: additive schema only, no DROP TABLE / DROP COLUMN.
-- app_settings is retained for backwards compatibility but is no longer the source of truth.
-- Existing app_settings values are copied into model_config; after application startup
-- ApiKeyEncryptionMigrator encrypts model_config.api_key into api_key_enc and clears plaintext.

create table if not exists model_config (
    id bigserial primary key,
    user_id bigint not null references users(id) on delete cascade,
    name varchar(128) not null,
    provider varchar(64) not null,
    base_url varchar(512),
    api_key text,
    api_key_enc text,
    model_name varchar(256) not null,
    temperature numeric(3,2) default 0.20,
    max_tokens integer default 4096,
    context_window integer default 128000,
    embedding_model varchar(256),
    is_default boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create unique index if not exists idx_model_config_default_user
    on model_config(user_id) where is_default = true;
create index if not exists idx_model_config_user on model_config(user_id);
comment on table model_config is 'Phase 5 model DIY source of truth. app_settings is retained but no longer read.';
comment on column model_config.api_key is 'Temporary plaintext staging column for one-time migration only; startup migrator encrypts to api_key_enc and sets this NULL.';
comment on column model_config.api_key_enc is 'AES-GCM ciphertext formatted base64(iv):base64(ciphertext+tag).';

insert into model_config(user_id, name, provider, base_url, api_key, model_name, temperature, max_tokens, context_window, is_default)
select s.user_id,
       coalesce(nullif(s.provider, ''), 'Default') || ' Default Model',
       coalesce(nullif(s.provider, ''), 'openai-compatible'),
       s.base_url,
       s.api_key,
       coalesce(nullif(s.model, ''), 'unknown'),
       0.20,
       4096,
       128000,
       true
from app_settings s
where not exists (select 1 from model_config m where m.user_id = s.user_id);

create table if not exists workflow (
    id bigserial primary key,
    user_id bigint not null references users(id) on delete cascade,
    name varchar(128) not null,
    description text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
create index if not exists idx_workflow_user on workflow(user_id);

create table if not exists workflow_step (
    id bigserial primary key,
    workflow_id bigint not null references workflow(id) on delete cascade,
    step_order integer not null,
    tool_name varchar(128) not null,
    prompt text,
    input_mapping jsonb not null default '{}'::jsonb,
    output_key varchar(128),
    condition text,
    retry_policy jsonb not null default '{}'::jsonb,
    enabled boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique(workflow_id, step_order)
);
create index if not exists idx_workflow_step_workflow on workflow_step(workflow_id, step_order);

alter table agents add column if not exists model_config_id bigint references model_config(id) on delete set null;
alter table agents add column if not exists knowledge_scope jsonb not null default '{}'::jsonb;
alter table agents add column if not exists memory_config jsonb not null default '{"enabled":false,"limit":20}'::jsonb;
alter table agents add column if not exists output_config jsonb not null default '{"type":"text"}'::jsonb;
alter table agents add column if not exists permissions jsonb not null default '{"READ_LITERATURE":"Allow","READ_VAULT":"Allow","CREATE_NOTE":"Ask","MODIFY_NOTE":"Ask","DELETE_NOTE":"Deny","MODIFY_METADATA":"Ask","NETWORK":"Ask"}'::jsonb;
alter table agents add column if not exists workflow_id bigint references workflow(id) on delete set null;
alter table agents add column if not exists advanced jsonb not null default '{"maxIterations":12,"timeoutSeconds":300,"retries":0}'::jsonb;
alter table agents add column if not exists pinned boolean not null default false;
alter table agents add column if not exists icon varchar(64);
alter table agents add column if not exists description text;

update agents a
set model_config_id = m.id
from model_config m
where a.model_config_id is null and m.user_id = a.user_id and m.is_default = true;

create table if not exists agent_prompt_version (
    id bigserial primary key,
    agent_id bigint not null references agents(id) on delete cascade,
    version integer not null,
    prompt text,
    created_at timestamptz not null default now(),
    unique(agent_id, version)
);
create index if not exists idx_agent_prompt_version_agent on agent_prompt_version(agent_id, version desc);

insert into agent_prompt_version(agent_id, version, prompt)
select a.id, 1, coalesce(a.prompt, '')
from agents a
where not exists (select 1 from agent_prompt_version v where v.agent_id = a.id);

create table if not exists agent_tool (
    agent_id bigint not null references agents(id) on delete cascade,
    tool_name varchar(128) not null,
    enabled boolean not null default true,
    created_at timestamptz not null default now(),
    primary key(agent_id, tool_name)
);
create index if not exists idx_agent_tool_tool on agent_tool(tool_name);

insert into agent_tool(agent_id, tool_name, enabled)
select a.id,
       case t.name
           when 'search_papers' then 'literature-search'
           when 'read_paper' then 'pdf-reader'
           when 'search_notes' then 'note-reader'
           when 'extract_metadata' then 'metadata-extractor'
           when 'create_note' then 'note-writer'
           when 'add_tag' then 'paper-tagger'
           else t.name
       end,
       true
from agents a
cross join lateral unnest(coalesce(a.tools, ARRAY[]::text[])) as t(name)
on conflict(agent_id, tool_name) do nothing;

create table if not exists tool_config (
    tool_name varchar(128) primary key,
    enabled boolean not null default true,
    config jsonb not null default '{}'::jsonb,
    updated_at timestamptz not null default now()
);

create table if not exists agent_run (
    id bigserial primary key,
    agent_id bigint references agents(id) on delete set null,
    status varchar(32) not null,
    input text,
    context_refs jsonb not null default '[]'::jsonb,
    model_config_id bigint references model_config(id) on delete set null,
    started_at timestamptz not null default now(),
    finished_at timestamptz,
    token_usage jsonb not null default '{}'::jsonb,
    error text
);
create index if not exists idx_agent_run_agent on agent_run(agent_id, started_at desc);
create index if not exists idx_agent_run_status on agent_run(status);

create table if not exists agent_run_step (
    id bigserial primary key,
    agent_run_id bigint not null references agent_run(id) on delete cascade,
    step_order integer not null default 0,
    tool_name varchar(128),
    event_type varchar(64) not null,
    status varchar(32) not null,
    message text,
    input jsonb not null default '{}'::jsonb,
    output jsonb not null default '{}'::jsonb,
    error text,
    duration_ms bigint,
    token_usage jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);
create index if not exists idx_agent_run_step_run on agent_run_step(agent_run_id, id);
create index if not exists idx_agent_run_step_status on agent_run_step(agent_run_id, status);
