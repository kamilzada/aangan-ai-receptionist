-- Aangan AI receptionist: state tables.
-- Run once in Supabase → SQL Editor → New query → paste → Run.
-- Only the server (service role key) touches these tables; RLS is on with no policies, so the anon key sees nothing.

create table if not exists designers (
  code              text primary key,          -- what the designer types after /start, e.g. "ananya"
  name              text not null,
  calendar_id       text not null,             -- Google Calendar ID shared with the service account
  telegram_chat_id  bigint,                    -- filled in when the designer sends /start <code> to the bot
  active            boolean not null default true,
  sort_order        int not null default 0,    -- round-robin order
  created_at        timestamptz not null default now()
);

-- Small key/value store. Holds the round-robin pointer under key 'roundrobin_last'.
create table if not exists app_state (
  key         text primary key,
  value       text,
  updated_at  timestamptz not null default now()
);

-- Every booking the agent makes. The end-of-call webhook uses it to name the HubSpot deal after the designer.
create table if not exists bookings (
  id             bigserial primary key,
  caller_phone   text not null,
  caller_name    text,
  designer_code  text references designers(code),
  start_at       timestamptz not null,
  event_id       text,
  created_at     timestamptz not null default now()
);
create index if not exists bookings_phone_created on bookings (caller_phone, created_at desc);

-- One row per Vaani call. The primary key makes the end-of-call webhook idempotent.
create table if not exists calls (
  vaani_call_id     text primary key,
  status            text not null default 'processing',   -- processing | done | failed
  call_type         text,
  outcome           text,
  hubspot_call_id   text,
  error             text,
  raw               jsonb,                                -- the payload as Vaani sent it (for building the parser)
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table designers enable row level security;
alter table app_state enable row level security;
alter table bookings  enable row level security;
alter table calls     enable row level security;

-- Seed your designers (edit names and calendar IDs, then run):
-- insert into designers (code, name, calendar_id, sort_order) values
--   ('ananya', 'Ananya', 'xxxxxxxx@group.calendar.google.com', 1),
--   ('rohan',  'Rohan',  'yyyyyyyy@group.calendar.google.com', 2)
-- on conflict (code) do update set name = excluded.name, calendar_id = excluded.calendar_id, sort_order = excluded.sort_order;
