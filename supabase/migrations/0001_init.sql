-- ELOS Milestone G1: sync store (single owner)
-- One events table + one devices registry. RLS on every table.
-- sync_push / sync_pull / register_device / note_sync are SECURITY INVOKER
-- functions called via PostgREST with the user's JWT, so RLS applies inside
-- them. server_seq is the identity column of app_events.

-- =========================================================================
-- 1) events
-- =========================================================================
create table if not exists public.app_events (
  id           bigint generated always as identity primary key,
  owner        uuid not null references auth.users (id) on delete cascade,
  event_id     text not null,
  device_id    text not null,
  device_seq   bigint not null,
  raw          jsonb not null,
  received_at  timestamptz not null default now(),
  unique (owner, event_id)
);

create index if not exists app_events_owner_id_idx on public.app_events (owner, id);

alter table public.app_events enable row level security;

drop policy if exists app_events_select on public.app_events;
create policy app_events_select on public.app_events
  for select using (owner = auth.uid());

drop policy if exists app_events_insert on public.app_events;
create policy app_events_insert on public.app_events
  for insert with check (owner = auth.uid());

-- The event log is append-only: no update policy, no delete policy.

-- =========================================================================
-- 2) devices registry
-- =========================================================================
create table if not exists public.devices (
  owner          uuid not null references auth.users (id) on delete cascade,
  device_id      text not null,
  registered_at  timestamptz not null default now(),
  last_synced_at timestamptz,
  primary key (owner, device_id)
);

alter table public.devices enable row level security;

drop policy if exists devices_select on public.devices;
create policy devices_select on public.devices
  for select using (owner = auth.uid());

drop policy if exists devices_insert on public.devices;
create policy devices_insert on public.devices
  for insert with check (owner = auth.uid());

drop policy if exists devices_update on public.devices;
create policy devices_update on public.devices
  for update using (owner = auth.uid());

-- =========================================================================
-- 3) sync_push(p_events jsonb) -> PushResponse-shaped jsonb
--    Input: array of {event_id, device_id, device_seq, raw}
--    Output: {accepted: [{event_id, server_seq, received_at}],
--             rejected: [{event_id, reason}],
--             retryable: []}
-- =========================================================================
create or replace function public.sync_push(p_events jsonb)
returns jsonb
language plpgsql
volatile
security invoker
as $$ declare
  v_owner     uuid := auth.uid();
  v_item      jsonb;
  v_event_id  text;
  v_device_id text;
  v_device_seq bigint;
  v_raw       jsonb;
  v_reason    text;
  v_occurred  timestamptz;
  v_row       public.app_events%rowtype;
  v_new_id    bigint;
  v_received  timestamptz;
  v_accepted  jsonb := '[]'::jsonb;
  v_rejected  jsonb := '[]'::jsonb;
begin
  if v_owner is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  if p_events is null or jsonb_typeof(p_events) is distinct from 'array' then
    return jsonb_build_object('error', 'bad_request');
  end if;

  for v_item in select jsonb_array_elements(p_events) loop
    v_reason := null;

    -- structural validation of the wrapper (order matters: nothing that can
    -- throw on a wrong jsonb type is called before its typeof is checked)
    if jsonb_typeof(v_item) is distinct from 'object' then
      v_reason := 'malformed_item';
    elsif coalesce(jsonb_typeof(v_item->'event_id'), 'null') <> 'string'
       or btrim(v_item->>'event_id') = '' then
      v_reason := 'bad_event_id';
    elsif coalesce(jsonb_typeof(v_item->'device_id'), 'null') <> 'string'
       or btrim(v_item->>'device_id') = '' then
      v_reason := 'bad_device_id';
    elsif coalesce(jsonb_typeof(v_item->'device_seq'), 'null') <> 'number'
       or v_item->>'device_seq' !~ '^[1-9][0-9]{0,14}$' then
      v_reason := 'bad_device_seq';
    elsif coalesce(jsonb_typeof(v_item->'raw'), 'null') <> 'object' then
      v_reason := 'bad_raw';
    end if;

    if v_reason is not null then
      v_rejected := v_rejected || jsonb_build_object(
        'event_id', coalesce(v_item->>'event_id', ''),
        'reason', v_reason
      );
      v_reason := null;
      continue;
    end if;

    v_event_id  := v_item->>'event_id';
    v_device_id := v_item->>'device_id';
    v_device_seq := (v_item->>'device_seq')::bigint;
    v_raw       := v_item->'raw';

    -- structural validation of the event itself
    if v_raw->>'event_id' is distinct from v_event_id then
      v_reason := 'event_id_mismatch';
    elsif v_raw->>'payload_type' is distinct from 'item_response' then
      v_reason := 'bad_payload_type';
    elsif v_raw->>'payload_version' is distinct from '1' then
      v_reason := 'bad_payload_version';
    elsif v_raw->>'occurred_at' is null or btrim(v_raw->>'occurred_at') = '' then
      v_reason := 'bad_occurred_at';
    elsif coalesce(jsonb_typeof(v_raw->'unit_refs'), 'null') <> 'array' then
      v_reason := 'bad_unit_refs';
    elsif jsonb_array_length(v_raw->'unit_refs') = 0 then
      v_reason := 'bad_unit_refs';
    elsif coalesce(jsonb_typeof(v_raw->'payload'), 'null') <> 'object' then
      v_reason := 'bad_payload';
    elsif coalesce(btrim(v_raw->'payload'->>'item_id'), '') = '' then
      v_reason := 'bad_payload';
    elsif jsonb_typeof(v_raw->'payload'->'response') is distinct from 'string' then
      v_reason := 'bad_payload';
    else
      begin
        v_occurred := (v_raw->>'occurred_at')::timestamptz;
      exception when others then
        v_reason := 'bad_occurred_at';
      end;
    end if;

    if v_reason is not null then
      v_rejected := v_rejected || jsonb_build_object(
        'event_id', v_event_id,
        'reason', v_reason
      );
      v_reason := null;
      continue;
    end if;

    select * into v_row
    from public.app_events e
    where e.owner = v_owner and e.event_id = v_event_id;

    if v_row is not null then
      -- already stored: idempotent accept when identical, conflict otherwise
      if v_row.raw = v_raw then
        v_accepted := v_accepted || jsonb_build_object(
          'event_id', v_event_id,
          'server_seq', v_row.id,
          'received_at', v_row.received_at::text
        );
      else
        v_rejected := v_rejected || jsonb_build_object(
          'event_id', v_event_id,
          'reason', 'event_id_conflict'
        );
      end if;
    else
      begin
        insert into public.app_events (owner, event_id, device_id, device_seq, raw)
        values (v_owner, v_event_id, v_device_id, v_device_seq, v_raw)
        returning id, received_at into v_new_id, v_received;

        v_accepted := v_accepted || jsonb_build_object(
          'event_id', v_event_id,
          'server_seq', v_new_id,
          'received_at', v_received::text
        );
      exception when unique_violation then
        v_rejected := v_rejected || jsonb_build_object(
          'event_id', v_event_id,
          'reason', 'event_id_conflict'
        );
      end;
    end if;
  end loop;

  return jsonb_build_object(
    'accepted', v_accepted,
    'rejected', v_rejected,
    'retryable', '[]'::jsonb
  );
end;
 $$;

-- =========================================================================
-- 4) sync_pull(p_after bigint, p_limit int) -> PullPage-shaped jsonb
--    {events: [{raw, device_id, device_seq, server_seq, received_at}],
--     next_cursor: max(server_seq) in the page, or p_after when empty}
-- =========================================================================
create or replace function public.sync_pull(
  p_after bigint default 0,
  p_limit int  default 200
)
returns jsonb
language sql
stable
security invoker
as $$   with page as (
    select e.id, e.raw, e.device_id, e.device_seq, e.received_at
    from public.app_events e
    where e.owner = auth.uid()
      and e.id > p_after
    order by e.id asc
    limit least(greatest(coalesce(p_limit, 200), 1), 500)
  )
  select jsonb_build_object(
    'events', coalesce(
      jsonb_agg(
        jsonb_build_object(
          'raw', p.raw,
          'device_id', p.device_id,
          'device_seq', p.device_seq,
          'server_seq', p.id,
          'received_at', p.received_at::text
        ) order by p.id asc
      ),
      '[]'::jsonb
    ),
    'next_cursor', coalesce(max(p.id), coalesce(p_after, 0))
  )
  from page p;
 $$;

-- =========================================================================
-- 5) device registry helpers
-- =========================================================================
create or replace function public.register_device(p_device_id text)
returns void
language sql
volatile
security invoker
as $$   insert into public.devices (owner, device_id)
  values (auth.uid(), btrim(p_device_id))
  on conflict (owner, device_id) do nothing;
 $$;

create or replace function public.note_sync(p_device_id text)
returns void
language sql
volatile
security invoker
as $$   update public.devices
  set last_synced_at = now()
  where owner = auth.uid() and device_id = btrim(p_device_id);
 $$;

-- =========================================================================
-- 6) hardening: only authenticated users may call these functions
-- =========================================================================
revoke execute on function public.sync_push(jsonb) from anon, public;
revoke execute on function public.sync_pull(bigint, int) from anon, public;
revoke execute on function public.register_device(text) from anon, public;
revoke execute on function public.note_sync(text) from anon, public;

grant execute on function public.sync_push(jsonb) to authenticated;
grant execute on function public.sync_pull(bigint, int) to authenticated;
grant execute on function public.register_device(text) to authenticated;
grant execute on function public.note_sync(text) to authenticated;
