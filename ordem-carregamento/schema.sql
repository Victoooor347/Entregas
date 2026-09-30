-- ============================================================
-- Ordem de Carregamento — schema para Supabase
--
-- Use este arquivo para montar um banco DO ZERO:
-- cole tudo no SQL Editor do seu projeto Supabase e clique em "Run".
--
-- Se o seu banco já está em uso, NÃO rode este arquivo — use migracao.sql.
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- Perfis (guarda quem é admin) ----------
create table if not exists public.profiles (
  id         uuid references auth.users(id) on delete cascade primary key,
  email      text,
  role       text not null default 'user' check (role in ('user','admin')),
  created_at timestamptz default now()
);

-- Cria automaticamente um perfil (role = 'user') quando alguém se cadastra
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------- Caminhões ----------
create table if not exists public.trucks (
  id             uuid primary key default gen_random_uuid(),
  placa          text not null,
  motorista      text not null,
  transportadora text,
  created_at     timestamptz default now()
);

-- ---------- Produtos ----------
-- Não guarda preço: o preço é digitado item a item, dentro de cada ordem.
create table if not exists public.products (
  id         uuid primary key default gen_random_uuid(),
  descricao  text not null,
  unidade    text not null default 'Sacos 50kg',   -- "Sacos 50kg", "Bags 1000kg", ...
  especie    text default 'FERTILIZANTE',
  created_at timestamptz default now()
);

-- ---------- Ordens ----------
-- produtores (jsonb) guarda os itens agrupados por produtor:
-- [ { nome, subtotalSacos, subtotalValor,
--     items: [ { productId, descricao, unidade, quantidade, preco, total, pagamento } ] } ]
create table if not exists public.orders (
  id             uuid primary key default gen_random_uuid(),
  created_by     uuid references auth.users(id),   -- quem montou a ordem
  data_entrega   date,
  hora           time,
  nf             text,
  transportadora text,
  truck_id       uuid references public.trucks(id),
  motorista      text,                             -- motorista desta viagem
  produtores     jsonb not null default '[]',
  status         text not null default 'agendada' check (status in ('agendada','entregue')),
  entregue_por   uuid references auth.users(id),   -- quem confirmou a entrega
  entregue_em    timestamptz,
  total_sacos    numeric default 0,
  total_valor    numeric default 0,
  created_at     timestamptz default now()
);

create index if not exists orders_status_idx       on public.orders (status);
create index if not exists orders_data_entrega_idx on public.orders (data_entrega);
create index if not exists orders_truck_id_idx     on public.orders (truck_id);

-- A autoria não pode ser reescrita numa edição: como qualquer pessoa logada
-- pode editar qualquer ordem, isto garante que created_by continue confiável.
create or replace function public.orders_manter_autoria()
returns trigger
language plpgsql
as $$
begin
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  return new;
end;
$$;

drop trigger if exists orders_manter_autoria on public.orders;
create trigger orders_manter_autoria
  before update on public.orders
  for each row execute procedure public.orders_manter_autoria();

-- ============================================================
-- Segurança (RLS)
--
-- Regra geral: qualquer pessoa logada cria, edita, marca como entregue
-- e apaga ordens — quem fez o quê fica registrado em created_by e
-- entregue_por. Só admin mexe no cadastro de caminhões e produtos.
-- ============================================================

alter table public.profiles enable row level security;
alter table public.trucks   enable row level security;
alter table public.products enable row level security;
alter table public.orders   enable row level security;

-- Função auxiliar: o usuário atual é admin?
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- ---------- Perfis ----------
-- Todo mundo logado lê os perfis: é assim que a tela mostra o nome de
-- quem criou a ordem e de quem confirmou a entrega.
drop policy if exists "read own profile"                on public.profiles;
drop policy if exists "any authenticated can read profiles" on public.profiles;
drop policy if exists "read profiles"                   on public.profiles;
create policy "read profiles" on public.profiles
  for select to authenticated using (true);

-- ---------- Caminhões: qualquer logado lê, só admin cadastra ----------
drop policy if exists "read trucks"         on public.trucks;
drop policy if exists "admin insert trucks" on public.trucks;
drop policy if exists "admin update trucks" on public.trucks;
drop policy if exists "admin delete trucks" on public.trucks;

create policy "read trucks"         on public.trucks for select to authenticated using (true);
create policy "admin insert trucks" on public.trucks for insert to authenticated with check (public.is_admin());
create policy "admin update trucks" on public.trucks for update to authenticated using (public.is_admin());
create policy "admin delete trucks" on public.trucks for delete to authenticated using (public.is_admin());

-- ---------- Produtos: mesma regra dos caminhões ----------
drop policy if exists "read products"         on public.products;
drop policy if exists "admin insert products" on public.products;
drop policy if exists "admin update products" on public.products;
drop policy if exists "admin delete products" on public.products;

create policy "read products"         on public.products for select to authenticated using (true);
create policy "admin insert products" on public.products for insert to authenticated with check (public.is_admin());
create policy "admin update products" on public.products for update to authenticated using (public.is_admin());
create policy "admin delete products" on public.products for delete to authenticated using (public.is_admin());

-- ---------- Ordens: todo mundo logado faz tudo ----------
drop policy if exists "read orders"                        on public.orders;
drop policy if exists "insert orders"                      on public.orders;
drop policy if exists "update orders"                      on public.orders;
drop policy if exists "delete orders"                      on public.orders;
drop policy if exists "creator or admin can update orders" on public.orders;
drop policy if exists "delete own or admin orders"         on public.orders;

create policy "read orders" on public.orders
  for select to authenticated using (true);

-- o with check impede alguém de criar uma ordem assinada com o nome de outro
create policy "insert orders" on public.orders
  for insert to authenticated with check (auth.uid() = created_by);

create policy "update orders" on public.orders
  for update to authenticated using (true) with check (true);

create policy "delete orders" on public.orders
  for delete to authenticated using (true);

-- ============================================================
-- Depois de rodar isso e criar sua própria conta pelo site,
-- volte aqui e rode (trocando pelo seu e-mail) para virar admin:
--
-- update public.profiles set role = 'admin' where email = 'seu@email.com';
-- ============================================================
