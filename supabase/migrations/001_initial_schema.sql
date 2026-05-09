-- Service Mode / JANA — schema inicial Supabase (Fase A: PK uuid, colunas de consulta)
-- Projeto novo ou banco vazio: cole no SQL Editor.
-- Migração a partir do schema antigo (text PK): remova as tabelas de dados ou recrie o projeto (ver SUPABASE_SETUP.md).

create extension if not exists pgcrypto;

-- Perfil do usuário (1 linha por auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  role text not null default 'Atendente',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  using (id = (select auth.uid()));

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert
  with check (id = (select auth.uid()));

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Novo usuário: cria profile (SECURITY DEFINER para ignorar RLS no insert)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'role', 'Gerente')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- updated_at automático (products + commandas)
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop table if exists public.daily_closes cascade;
drop table if exists public.commandas cascade;
drop table if exists public.products cascade;

-- Produtos
create table public.products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  category text not null,
  price numeric(12, 2) not null,
  requires_prep boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists products_user_id_idx on public.products (user_id);

create trigger products_set_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

alter table public.products enable row level security;

drop policy if exists "products_all_own" on public.products;
create policy "products_all_own"
  on public.products for all
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Comandas (documento JSON + colunas para filtros / relatórios)
create table public.commandas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  payload jsonb not null,
  status text not null default 'Aberta',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz
);

create index if not exists commandas_user_id_idx on public.commandas (user_id);

create trigger commandas_set_updated_at
  before update on public.commandas
  for each row execute function public.set_updated_at();

alter table public.commandas enable row level security;

drop policy if exists "commandas_all_own" on public.commandas;
create policy "commandas_all_own"
  on public.commandas for all
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Fechamentos de caixa
create table public.daily_closes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  payload jsonb not null,
  closed_at timestamptz not null,
  date_ymd date not null
);

create index if not exists daily_closes_user_id_idx on public.daily_closes (user_id);
create index if not exists daily_closes_user_date_idx on public.daily_closes (user_id, date_ymd);

alter table public.daily_closes enable row level security;

drop policy if exists "daily_closes_all_own" on public.daily_closes;
create policy "daily_closes_all_own"
  on public.daily_closes for all
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Configuração do app (um documento por usuário)
create table if not exists public.app_config (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  payload jsonb not null
);

alter table public.app_config enable row level security;

drop policy if exists "app_config_all_own" on public.app_config;
create policy "app_config_all_own"
  on public.app_config for all
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
