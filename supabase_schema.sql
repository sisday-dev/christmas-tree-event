-- =============================================================================
--  우리 아파트 크리스마스 트리 — Supabase 스키마 (2026-11-25)
--  -----------------------------------------------------------------------------
--  Supabase 대시보드 → SQL Editor 에 이 파일 전체를 붙여 넣고 RUN 하면 끝입니다.
--  · tree_taps    : 주민이 누른 손길 1건 = 1행 (닉네임 / 기기ID / 날짜)
--  · tree_config  : 목표 횟수(915) · 1일 제한(5) · 쿨타임(3초) 설정값
--  · tree_tap()   : 손길 1개 추가 (서버에서 1일 5회·3초 쿨타임 강제)
--  · tree_stats() : 현재 총합 + 참여 주민 목록
--  · anon 키로 테이블 직접 접근은 막고(Row Level Security), 위 두 함수만 공개
-- =============================================================================

-- 0) 확장
create extension if not exists pgcrypto;

-- 1) 설정 -------------------------------------------------------------------
 create table if not exists public.tree_config (
  id                int primary key default 1,
  target_clicks     int not null default 915,   -- 완성 목표 (클릭 수)
  daily_limit       int not null default 5,     -- 1인 1일 최대 참여
  cooldown_seconds  int not null default 3,     -- 연속 터치 쿨타임
  constraint tree_config_single_row check (id = 1)
);

insert into public.tree_config (id) values (1)
on conflict (id) do nothing;

-- 2) 손길(클릭) 기록 ---------------------------------------------------------
create table if not exists public.tree_taps (
  id          bigserial primary key,
  nickname    text not null,
  client_id   text not null,
  day         date not null default ((now() at time zone 'Asia/Seoul')::date),
  created_at  timestamptz not null default now(),
  constraint tree_taps_nickname_len check (char_length(nickname) between 1 and 12),
  constraint tree_taps_client_len   check (char_length(client_id) between 6 and 80)
);

create index if not exists tree_taps_client_day_idx on public.tree_taps (client_id, day);
create index if not exists tree_taps_nick_idx       on public.tree_taps (nickname);
create index if not exists tree_taps_created_idx    on public.tree_taps (created_at desc);

-- 3) 보안: anon 은 테이블 직접 접근 불가 (모든 접근은 아래 security definer 함수로)
alter table public.tree_taps   enable row level security;
alter table public.tree_config enable row level security;

revoke all on public.tree_taps   from anon, authenticated;
revoke all on public.tree_config from anon, authenticated;

-- 4) 손길 1개 추가 -----------------------------------------------------------
create or replace function public.tree_tap(p_nickname text, p_client_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nick         text := btrim(regexp_replace(coalesce(p_nickname, ''), '\s+', ' ', 'g'));
  v_client       text := btrim(coalesce(p_client_id, ''));
  v_day          date := (now() at time zone 'Asia/Seoul')::date;
  v_target       int;
  v_daily_limit  int;
  v_cooldown     int;
  v_today_count  int;
  v_last         timestamptz;
  v_total        int;
begin
  select target_clicks, daily_limit, cooldown_seconds
    into v_target, v_daily_limit, v_cooldown
    from public.tree_config where id = 1;

  if char_length(v_nick) < 1 then
    return jsonb_build_object('ok', false, 'error', 'nickname');
  end if;
  v_nick := left(v_nick, 12);

  if char_length(v_client) < 6 then
    return jsonb_build_object('ok', false, 'error', 'client');
  end if;

  select count(*)::int into v_total from public.tree_taps;

  if v_total >= v_target then
    return jsonb_build_object('ok', false, 'error', 'complete', 'total', v_target);
  end if;

  select count(*)::int, max(created_at)
    into v_today_count, v_last
    from public.tree_taps
   where client_id = v_client
     and day = v_day;

  if v_today_count >= v_daily_limit then
    return jsonb_build_object('ok', false, 'error', 'daily', 'total', v_total);
  end if;

  if v_last is not null and (now() - v_last) < make_interval(secs => v_cooldown) then
    return jsonb_build_object(
      'ok', false, 'error', 'cooldown', 'total', v_total,
      'retry_after_ms',
        ceil(extract(epoch from (make_interval(secs => v_cooldown) - (now() - v_last))) * 1000)::int
    );
  end if;

  insert into public.tree_taps (nickname, client_id, day)
  values (v_nick, v_client, v_day);

  select count(*)::int into v_total from public.tree_taps;

  return jsonb_build_object('ok', true, 'total', least(v_total, v_target));
end;
$$;

revoke all on function public.tree_tap(text, text) from public;
grant execute on function public.tree_tap(text, text) to anon, authenticated;

-- 5) 현황 조회 ---------------------------------------------------------------
create or replace function public.tree_stats()
returns jsonb
language sql
security definer
set search_path = public
as $$
  with cfg as (
    select target_clicks from public.tree_config where id = 1
  ),
  totals as (
    select count(*)::int as total from public.tree_taps
  ),
  contrib as (
    select nickname, count(*)::int as count
      from public.tree_taps
     group by nickname
     order by count desc, nickname asc
     limit 300
  )
  select jsonb_build_object(
    'total', least((select total from totals), (select target_clicks from cfg)),
    'contributors', coalesce(
      (select jsonb_agg(jsonb_build_object('nickname', nickname, 'count', count)) from contrib),
      '[]'::jsonb
    )
  );
$$;

revoke all on function public.tree_stats() from public;
grant execute on function public.tree_stats() to anon, authenticated;

-- 6) 관리용 뷰 (대시보드에서만 조회. anon 에게는 권한을 주지 않습니다) ---------
create or replace view public.tree_daily as
select day, count(*) as taps, count(distinct client_id) as devices
  from public.tree_taps
 group by day
 order by day desc;

revoke all on public.tree_daily from anon, authenticated;

-- 7) (선택) 리얼타임을 쓰고 싶다면 아래 주석을 해제하세요.
--    지금 앱은 12초 폴링으로 충분히 동작합니다.
-- alter publication supabase_realtime add table public.tree_taps;

-- 8) 운영 명령 메모 -----------------------------------------------------------
--  · 이벤트 초기화:      truncate table public.tree_taps restart identity;
--  · 목표/제한 바꾸기:   update public.tree_config set target_clicks = 915,
--                          daily_limit = 5, cooldown_seconds = 3 where id = 1;
--  · 오늘 참여 현황:     select * from public.tree_daily limit 7;
--  · 특정 닉네임 삭제:   delete from public.tree_taps where nickname = '닉네임';
-- =============================================================================
