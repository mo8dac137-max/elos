create table if not exists public.ai_calls (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  task text not null,
  status text not null check (status in ('ok', 'error')),
  error_code text,
  model text not null default '',
  input_chars integer not null default 0,
  output_chars integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.ai_calls enable row level security;

-- The owner may read (but never write) his own ledger rows from the app.
create policy "owner reads own ai calls"
  on public.ai_calls
  for select
  to authenticated
  using (user_id = auth.uid());

-- Writes happen only inside the edge function with the service role key.
revoke insert, update, delete on public.ai_calls from anon, authenticated;
