-- Phase 5-R: normalized LLM provider/model layer. Additive only.

create table if not exists llm_provider (
    id bigserial primary key,
    name varchar(64) not null unique,
    kind varchar(32) not null,
    base_url varchar(512) not null,
    api_key_encrypted text,
    extra_headers jsonb not null default '{}'::jsonb,
    enabled boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists llm_model (
    id bigserial primary key,
    provider_id bigint not null references llm_provider(id) on delete cascade,
    model_id varchar(128) not null,
    display_name varchar(128) not null,
    context_window integer,
    supports_tools boolean not null default true,
    supports_stream boolean not null default true,
    is_default boolean not null default false,
    enabled boolean not null default true,
    legacy_model_config_id bigint unique references model_config(id) on delete set null,
    created_at timestamptz not null default now(),
    unique(provider_id, model_id)
);

create unique index if not exists llm_model_single_default on llm_model(is_default) where is_default;
create index if not exists idx_llm_model_provider on llm_model(provider_id);

alter table agents add column if not exists llm_model_id bigint references llm_model(id) on delete set null;
alter table agent_run add column if not exists llm_model_id bigint references llm_model(id) on delete set null;

insert into llm_provider(name, kind, base_url, api_key_encrypted, enabled)
select left(coalesce(nullif(m.provider, ''), 'Provider'), 42) || ' #' || m.id,
       case
           when lower(coalesce(m.provider, '')) like '%anthropic%' or lower(coalesce(m.provider, '')) like '%claude%' then 'anthropic'
           when lower(coalesce(m.provider, '')) like '%ollama%' or lower(coalesce(m.provider, '')) like '%local%' then 'ollama'
           when lower(coalesce(m.provider, '')) like '%mock%' then 'mock'
           else 'openai_compatible'
       end,
       case
           when lower(coalesce(m.provider, '')) like '%mock%' then 'mock://local'
           else coalesce(nullif(m.base_url, ''), 'https://api.openai.com/v1')
       end,
       nullif(m.api_key_enc, ''),
       true
from model_config m
where not exists (
    select 1 from llm_model lm where lm.legacy_model_config_id = m.id
);

insert into llm_model(provider_id, model_id, display_name, context_window, is_default, legacy_model_config_id)
select p.id,
       coalesce(nullif(m.model_name, ''), 'unknown'),
       left(coalesce(nullif(m.name, ''), coalesce(nullif(m.model_name, ''), 'Model')), 128),
       m.context_window,
       m.is_default,
       m.id
from model_config m
join llm_provider p on p.name = left(coalesce(nullif(m.provider, ''), 'Provider'), 42) || ' #' || m.id
where not exists (
    select 1 from llm_model lm where lm.legacy_model_config_id = m.id
);

update agents a
set llm_model_id = lm.id
from llm_model lm
where a.llm_model_id is null and a.model_config_id = lm.legacy_model_config_id;

update agent_run r
set llm_model_id = lm.id
from llm_model lm
where r.llm_model_id is null and r.model_config_id = lm.legacy_model_config_id;

create table if not exists ai_conversation (
    id bigserial primary key,
    user_id bigint not null references users(id) on delete cascade,
    title varchar(256) not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
create index if not exists idx_ai_conversation_user on ai_conversation(user_id, updated_at desc);

create table if not exists ai_message (
    id bigserial primary key,
    conversation_id bigint not null references ai_conversation(id) on delete cascade,
    role varchar(32) not null,
    content text not null,
    created_at timestamptz not null default now()
);
create index if not exists idx_ai_message_conversation on ai_message(conversation_id, id);
