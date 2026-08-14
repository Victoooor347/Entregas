-- ============================================================
-- Ordem de Carregamento — schema para Supabase
-- Cole este arquivo inteiro no SQL Editor do seu projeto Supabase
-- e clique em "Run".
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- Perfis (guarda quem é admin) ----------
create table if not exists public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  email text,
  role text not null default 'user' check (role in ('user','admin')),
  created_at timestamptz default now()
);

-- Cria automaticamente um perfil (role = 'user') quando alguém se cadastra
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email);
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------- Caminhões ----------
create table if not exists public.trucks (
  id uuid primary key default gen_random_uuid(),
  placa text not null,
  motorista text not null,
  transportadora text,
  created_at timestamptz default now()
);

-- ---------- Produtos ----------
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  descricao text not null,
  preco_unitario numeric not null,
  especie text default 'ADUBO',
  created_at timestamptz default now()
);

-- ---------- Ordens ----------
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references auth.users(id),
  data_entrega date,
  hora time,
  nf text,
  transportadora text,
  truck_id uuid references public.trucks(id),
  entrega text,
  condicao_pagamento text,
  conta text,
  portador text,
  especie text,
  items jsonb not null default '[]',
  total_sacos numeric default 0,
  total_valor numeric default 0,
  created_at timestamptz default now()
);

-- ---------- Segurança (RLS) ----------
alter table public.profiles enable row level security;
alter table public.trucks enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;

-- Função auxiliar: o usuário atual é admin?
create or replace function public.is_admin()
returns boolean as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$ language sql security definer stable;

-- Perfis: cada um lê o próprio; admin lê todos
create policy "read own profile" on public.profiles
  for select using (auth.uid() = id or public.is_admin());

-- Caminhões: qualquer logado lê; só admin cria/edita/apaga
create policy "read trucks" on public.trucks
  for select using (auth.role() = 'authenticated');
create policy "admin insert trucks" on public.trucks
  for insert with check (public.is_admin());
create policy "admin update trucks" on public.trucks
  for update using (public.is_admin());
create policy "admin delete trucks" on public.trucks
  for delete using (public.is_admin());

-- Produtos: mesma regra dos caminhões
create policy "read products" on public.products
  for select using (auth.role() = 'authenticated');
create policy "admin insert products" on public.products
  for insert with check (public.is_admin());
create policy "admin update products" on public.products
  for update using (public.is_admin());
create policy "admin delete products" on public.products
  for delete using (public.is_admin());

-- Ordens: qualquer logado cria e lê; apaga quem criou ou o admin
create policy "read orders" on public.orders
  for select using (auth.role() = 'authenticated');
create policy "insert orders" on public.orders
  for insert with check (auth.role() = 'authenticated');
create policy "delete own or admin orders" on public.orders
  for delete using (auth.uid() = created_by or public.is_admin());

-- ============================================================
-- Depois de rodar isso e criar sua própria conta pelo site,
-- volte aqui e rode (trocando pelo seu e-mail) para virar admin:
--
-- update public.profiles set role = 'admin' where email = 'seu@email.com';
-- ============================================================
