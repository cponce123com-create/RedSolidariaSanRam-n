-- Ledger de Confianza para STORM (patrón Trust Pay, Red Solidaria).
-- Renombrar con el timestamp actual según la convención del repo:
--   supabase/migrations/<YYYYMMDDHHMMSS>_ledger_aid_events.sql
--
-- Trazabilidad inmutable de los eventos de ayuda de emergencia: cada evento
-- (pedido, oferta, coordinación, entrega, feedback) se encadena al anterior
-- con SHA-256 (prev_hash). Cualquier edición/borrado directo en la tabla rompe
-- la cadena y la verificación pública lo detecta (broken_at).
--
-- Características:
-- - Append-only: nunca UPDATE/DELETE; un error se revierte con un evento
--   compensatorio (p. ej. event_type='CANCELLED' con resource_ref al error).
-- - Escritura SOLO vía la función append_aid_event (SECURITY DEFINER) que
--   serializa appendes concurrentes con FOR UPDATE por chain_key.
-- - Lectura pública (RLS) para que cualquier miembro de la red verifique.
-- - jsonb::text es CANÓNICO en Postgres (árbol interno ordenado y estable):
--   el mismo payload produce el mismo texto → mismo hash (la lección de
--   canonicalStableStringify de la wave 1 del ledger de patchwork).
-- - now() es estable durante la transacción: hash y created_at del insert
--   comparten el mismo timestamp → la verificación recomputa idéntico.

create extension if not exists pgcrypto;

create table if not exists public.aid_events (
    id           bigserial primary key,
    chain_key    text not null,          -- 'aid:<request_id>' agrupa la cadena
    event_type   text not null,          -- REQUEST|OFFER|ACCEPTED|COORDINATED|DELIVERED|FEEDBACK|CANCELLED|MODERATED
    actor_id     uuid references auth.users (id),
    resource_ref text not null,          -- id del recurso/pedido/ofrecimiento
    payload      jsonb not null default '{}',
    prev_hash    text not null,
    hash         text not null,
    created_at   timestamptz not null default now(),
    -- Un evento de negocio genera EXACTAMENTE una entrada (anti-duplicado):
    unique (event_type, resource_ref)
);

create index if not exists idx_aid_events_chain on public.aid_events (chain_key, id);

-- RLS: el ledger es de solo lectura para todos; la escritura solo ocurre a
-- través de append_aid_event (SECURITY DEFINER), que las mutaciones de negocio
-- pueden invocar con permisos mínimos.
alter table public.aid_events enable row level security;

drop policy if exists "aid_events_public_read" on public.aid_events;
create policy "aid_events_public_read" on public.aid_events
    for select using (true);

-- ─── Append transaccional ────────────────────────────────────────────────────

create or replace function public.append_aid_event(
    p_chain_key   text,
    p_event_type  text,
    p_actor_id    uuid,
    p_resource_ref text,
    p_payload     jsonb default '{}'
) returns public.aid_events
language plpgsql
security definer
set search_path = public
as $$
declare
    v_prev text;
    v_hash text;
    v_row  public.aid_events;
begin
    -- Serializa los appendes de una cadena: dos escrituras concurrentes no
    -- deben heredar el mismo prev_hash (misma lección que el FOR UPDATE de
    -- appendMovement en Red Solidaria).
    perform 1
    from public.aid_events
    where chain_key = p_chain_key
    order by id desc
    limit 1
    for update;

    select coalesce(
        (select hash from public.aid_events
         where chain_key = p_chain_key
         order by id desc
         limit 1),
        'genesis'
    ) into v_prev;

    v_hash := encode(
        digest(
            v_prev || '|' || p_event_type || '|' || coalesce(p_actor_id::text, '') ||
            '|' || p_resource_ref || '|' || p_payload::text || '|' || now()::text,
            'sha256'
        ),
        'hex'
    );

    insert into public.aid_events (chain_key, event_type, actor_id, resource_ref, payload, prev_hash, hash)
    values (p_chain_key, p_event_type, p_actor_id, p_resource_ref, p_payload, v_prev, v_hash)
    returning * into v_row;

    return v_row;
end $$;

-- ─── Verificación pública ────────────────────────────────────────────────────

create or replace function public.verify_aid_chain(p_chain_key text)
returns table (verified boolean, broken_at bigint, root_hash text, event_count bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    r          record;
    v_prev     text := 'genesis';
    v_expected text;
    v_broken   bigint := null;
    v_root     text := null;
    v_count    bigint := 0;
begin
    for r in
        select *
        from public.aid_events
        where chain_key = p_chain_key
        order by id
    loop
        v_count := v_count + 1;
        if r.prev_hash <> v_prev then
            v_broken := r.id;
            exit;
        end if;
        v_expected := encode(
            digest(
                v_prev || '|' || r.event_type || '|' || coalesce(r.actor_id::text, '') ||
                '|' || r.resource_ref || '|' || r.payload::text || '|' || r.created_at::text,
                'sha256'
            ),
            'hex'
        );
        if r.hash <> v_expected then
            v_broken := r.id;
            exit;
        end if;
        v_prev := r.prev_hash; -- noop estético: v_prev se actualiza abajo
        v_prev := r.hash;
        v_root := r.hash;
    end loop;

    return query select (v_broken is null), v_broken, v_root, v_count;
end $$;

-- ─── Uso ─────────────────────────────────────────────────────────────────────
-- Insertar un evento:
--   select public.append_aid_event(
--     'aid:123', 'REQUEST', auth.uid(), 'req:123',
--     '{"category":"water","quantity":10,"urgent":true}'
--   );
--
-- Verificar la cadena de un pedido:
--   select * from public.verify_aid_chain('aid:123');
--   -- verified=true → integridad OK; verified=false + broken_at → manipulación
--
-- Verificar el ledger global (todas las cadenas): la función verifica cada
-- chain_key y reporta las rotas:
--   select chain_key, verified, broken_at from public.aid_events e,
--     lateral public.verify_aid_chain(e.chain_key) v
--   where v.verified = false
--   group by chain_key, verified, broken_at;
