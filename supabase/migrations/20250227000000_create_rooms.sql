-- Tabla rooms para RetroCAM
create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  short_code text unique,
  created_at timestamptz not null default now()
);

-- RLS: permitir lectura e inserción anónima para el MVP (sin auth)
alter table public.rooms enable row level security;

create policy "Allow anonymous read and insert"
  on public.rooms
  for all
  using (true)
  with check (true);
