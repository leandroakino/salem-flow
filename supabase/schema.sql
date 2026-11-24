-- =====================================================================
-- Salém Flow — banco de dados (Supabase / PostgreSQL)
-- Rode este arquivo inteiro no SQL Editor do projeto salem-flow-sp.
-- Pode ser rodado mais de uma vez sem estragar nada.
-- =====================================================================

-- 1) Tabelas: uma por coleção. "data" guarda o documento; "at" é derivado dele (usado para ordenar).
do $$
declare c text;
begin
  foreach c in array array['users','products','clients','orders','stock','replen','matreq','moves','losses','confs','mural','log']
  loop
    execute format($f$
      create table if not exists public.%I (
        id text primary key,
        data jsonb not null default '{}'::jsonb,
        at bigint generated always as (nullif(data->>'at','')::bigint) stored,
        updated_at timestamptz not null default now()
      )$f$, c);
    execute format('alter table public.%I enable row level security', c);
    execute format('create index if not exists %I on public.%I (at desc)', c||'_at_idx', c);
  end loop;
end $$;

-- Configurações internas (ex.: chave do link da TV). Só o administrador acessa.
create table if not exists public.app_settings (key text primary key, value text not null);
alter table public.app_settings enable row level security;

-- 2) Funções auxiliares: quem é o usuário logado e qual o perfil dele
create or replace function public.app_role() returns text
language sql stable security definer set search_path = '' as $$
  select u.data->>'role' from public.users u
  where u.data->>'authId' = auth.uid()::text and coalesce((u.data->>'active')::boolean, true)
  limit 1
$$;

create or replace function public.app_name() returns text
language sql stable security definer set search_path = '' as $$
  select u.data->>'name' from public.users u
  where u.data->>'authId' = auth.uid()::text and coalesce((u.data->>'active')::boolean, true)
  limit 1
$$;

-- 3) Numeração dos pedidos (nunca repete, mesmo com dois atendentes ao mesmo tempo)
create sequence if not exists public.order_seq start 1;
create or replace function public.next_order_number() returns bigint
language sql security definer set search_path = '' as $$
  select case when public.app_role() in ('admin','atendimento') then nextval('public.order_seq') end
$$;

-- 4) Atualização parcial de um documento (equivale a "mesclar campos")
create or replace function public.doc_update(p_coll text, p_id text, p jsonb) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  if p_coll not in ('users','products','clients','orders','stock','replen','matreq','moves','losses','confs','mural','log') then
    raise exception 'coleção inválida';
  end if;
  execute format('update public.%I set data = data || $1, updated_at = now() where id = $2', p_coll) using p, p_id;
end $$;

-- 5) Primeiro acesso: só funciona enquanto não existe nenhum usuário; cria o administrador
create or replace function public.bootstrap_admin(p_name text) returns text
language plpgsql security definer set search_path = '' as $$
declare v_id text;
begin
  if auth.uid() is null then raise exception 'faça login primeiro'; end if;
  if exists (select 1 from public.users) then raise exception 'o sistema já foi configurado'; end if;
  v_id := 'u' || substr(md5(random()::text || clock_timestamp()::text), 1, 8);
  insert into public.users(id, data) values (v_id, jsonb_build_object('name', p_name, 'role', 'admin', 'active', true, 'authId', auth.uid()::text));
  insert into public.app_settings(key, value) values ('tv_token', md5(random()::text || clock_timestamp()::text || auth.uid()::text)) on conflict do nothing;
  return v_id;
end $$;

-- 6) Painel da TV sem login: só quem tem a chave do link enxerga, e só os dados mínimos
create or replace function public.tv_feed(p_token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_token is null or not exists (select 1 from public.app_settings where key = 'tv_token' and value = p_token) then
    return null;
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', o.id, 'num', o.data->'num', 'status', o.data->'status', 'statusAt', o.data->'statusAt',
      'type', o.data->'type', 'date', o.data->'date', 'time', o.data->'time', 'noTime', o.data->'noTime',
      'items', (select coalesce(jsonb_agg(jsonb_build_object('name', i->'name', 'qty', i->'qty')), '[]'::jsonb) from jsonb_array_elements(coalesce(o.data->'items','[]'::jsonb)) i)))
    from public.orders o
    where o.data->>'status' in ('liberado','aguardando_prod','em_producao','aguardando_material','bloqueado','finalizado','pronto_subir','divergencia')
  ), '[]'::jsonb);
end $$;

-- 7) Regras de acesso (RLS) por perfil
do $$
declare
  r record; p record;
begin
  -- apaga políticas antigas para poder rodar de novo
  for p in select policyname, tablename from pg_policies where schemaname='public' and tablename in ('users','products','clients','orders','stock','replen','matreq','moves','losses','confs','mural','log','app_settings') loop
    execute format('drop policy if exists %I on public.%I', p.policyname, p.tablename);
  end loop;

  -- tabela | quem lê | quem grava (inclui apagar)
  for r in select * from (values
    ('users',    array['admin','atendimento','producao','entregador'], array['admin']),
    ('products', array['admin','atendimento','producao','entregador'], array['admin']),
    ('clients',  array['admin','atendimento'],                         array['admin','atendimento']),
    ('stock',    array['admin','atendimento','producao'],              array['admin','atendimento','producao']),
    ('replen',   array['admin','atendimento','producao'],              array['admin','atendimento','producao']),
    ('matreq',   array['admin','atendimento','producao'],              array['admin','atendimento','producao']),
    ('moves',    array['admin','atendimento','producao'],              array['admin','atendimento','producao']),
    ('losses',   array['admin','atendimento','producao'],              array['admin','atendimento','producao']),
    ('confs',    array['admin','atendimento','producao','entregador'], array['admin','atendimento','producao','entregador']),
    ('mural',    array['admin','atendimento','producao','entregador'], array['admin','atendimento','producao','entregador'])
  ) as t(tbl, readers, writers) loop
    execute format('create policy "ler" on public.%I for select to authenticated using (public.app_role() = any(%L))', r.tbl, r.readers);
    execute format('create policy "gravar" on public.%I for insert to authenticated with check (public.app_role() = any(%L))', r.tbl, r.writers);
    execute format('create policy "alterar" on public.%I for update to authenticated using (public.app_role() = any(%L)) with check (public.app_role() = any(%L))', r.tbl, r.writers, r.writers);
    execute format('create policy "apagar" on public.%I for delete to authenticated using (public.app_role() = any(%L))', r.tbl, r.writers);
  end loop;

  -- pedidos: entregador só vê os pedidos que são dele; apagar só administrador
  create policy "ler" on public.orders for select to authenticated using (
    public.app_role() in ('admin','atendimento','producao')
    or (public.app_role() = 'entregador' and data->'delivery'->>'driver' = public.app_name()));
  create policy "gravar" on public.orders for insert to authenticated with check (public.app_role() in ('admin','atendimento'));
  create policy "alterar" on public.orders for update to authenticated
    using (public.app_role() in ('admin','atendimento','producao') or (public.app_role() = 'entregador' and data->'delivery'->>'driver' = public.app_name()))
    with check (public.app_role() in ('admin','atendimento','producao','entregador'));
  create policy "apagar" on public.orders for delete to authenticated using (public.app_role() = 'admin');

  -- histórico (log): todos escrevem, só administrador lê
  create policy "gravar" on public.log for insert to authenticated with check (public.app_role() is not null);
  create policy "ler" on public.log for select to authenticated using (public.app_role() = 'admin');
  create policy "apagar" on public.log for delete to authenticated using (public.app_role() = 'admin');

  -- configurações: só administrador
  create policy "tudo" on public.app_settings for all to authenticated using (public.app_role() = 'admin') with check (public.app_role() = 'admin');
end $$;

-- 8) Permissões da API (a concessão automática está desligada neste projeto)
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.users, public.products, public.clients, public.orders, public.stock, public.replen,
  public.matreq, public.moves, public.losses, public.confs, public.mural, public.log, public.app_settings to authenticated;
revoke all on function public.app_role(), public.app_name(), public.next_order_number(), public.doc_update(text,text,jsonb), public.bootstrap_admin(text), public.tv_feed(text) from public, anon, authenticated;
grant execute on function public.app_role(), public.app_name(), public.next_order_number(), public.doc_update(text,text,jsonb), public.bootstrap_admin(text) to authenticated;
grant execute on function public.tv_feed(text) to anon, authenticated;
grant usage on sequence public.order_seq to authenticated;

-- 9) Tempo real: a tela atualiza sozinha quando alguém muda um pedido
do $$
declare c text;
begin
  foreach c in array array['users','products','clients','orders','stock','replen','matreq','moves','losses','confs','mural','log']
  loop
    begin execute format('alter publication supabase_realtime add table public.%I', c);
    exception when duplicate_object then null; end;
  end loop;
end $$;

-- 10) Fotos: pasta pública com nomes aleatórios; só equipe logada envia
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos', 'fotos', true, 2097152, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set public = true, file_size_limit = 2097152;

drop policy if exists "fotos enviar" on storage.objects;
create policy "fotos enviar" on storage.objects for insert to authenticated
  with check (bucket_id = 'fotos' and public.app_role() in ('admin','atendimento','producao'));
drop policy if exists "fotos apagar" on storage.objects;
create policy "fotos apagar" on storage.objects for delete to authenticated
  using (bucket_id = 'fotos' and public.app_role() = 'admin');

-- 11) Administrador define nova senha para alguém da equipe (sem precisar de e-mail)
create or replace function public.admin_set_password(p_auth_id uuid, p_pw text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if public.app_role() is distinct from 'admin' then raise exception 'apenas o administrador'; end if;
  if length(coalesce(p_pw,'')) < 6 then raise exception 'senha curta'; end if;
  if not exists (select 1 from public.users u where u.data->>'authId' = p_auth_id::text) then raise exception 'usuário inexistente'; end if;
  update auth.users set encrypted_password = extensions.crypt(p_pw, extensions.gen_salt('bf')), updated_at = now() where id = p_auth_id;
end $$;
revoke all on function public.admin_set_password(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_set_password(uuid, text) to authenticated;
