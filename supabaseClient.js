/* =========================================================================
   supabaseClient.js — 공용 트리 백엔드 (Supabase 연동 모듈)
   -------------------------------------------------------------------------
   · SUPABASE_URL / SUPABASE_ANON_KEY 가 채워져 있으면  → 'remote' 모드
     (PostgREST RPC 로 서버 쪽에서 1인 1일 5회 · 3초 쿨타임을 강제)
   · 비어 있으면                                       → 'local' 모드
     (같은 기기 브라우저 저장소에서 공동 트리를 흉내 내는 시뮬레이션)
   · 두 모드의 함수 모양은 같아서 app.js 는 모드를 몰라도 됩니다.
   · 12초마다 새로 읽어 와서 다른 주민이 단 장식을 화면에 반영합니다.
   ========================================================================= */
window.TreeBackend = (function () {
  'use strict';

  /* ── 1. 설정 ─────────────────────────────────────────────────────────── */
  const CONFIG = {
    SUPABASE_URL: '',        // 예: 'https://abcdefghijkl.supabase.co'
    SUPABASE_ANON_KEY: '',   // 예: 'eyJhbGciOiJIUzI1NiIsInR5cCI6...'
    POLL_MS: 12000,          // 다른 주민의 참여를 다시 읽어 오는 주기
    RPC_TAP: 'tree_tap',
    RPC_STATS: 'tree_stats',
    REQUEST_TIMEOUT_MS: 8000
  };

  const LS_TREE = 'xmas915:tree';      // local 모드의 "공용 트리"
  const SAMPLE_NICKS = [
    '샘플·산타러버', '샘플·트리장인', '샘플·눈꽃', '샘플·호두까기',
    '샘플·루돌프', '샘플·진저브레드', '샘플·캐롤', '샘플·양말도둑',
    '샘플·별지기', '샘플·초코우유', '샘플·겨울나무', '샘플·메리크리스마스'
  ];

  const configured =
    /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(String(CONFIG.SUPABASE_URL).trim()) &&
    String(CONFIG.SUPABASE_ANON_KEY).trim().length > 20;

  const mode = configured ? 'remote' : 'local';
  const baseUrl = String(CONFIG.SUPABASE_URL).trim().replace(/\/+$/, '');
  let pollTimer = null;
  const listeners = new Set();

  /* ── 2. local 저장소 ---------------------------------------------------- */
  function readLocal() {
    try {
      const raw = localStorage.getItem(LS_TREE);
      const j = raw ? JSON.parse(raw) : null;
      if (j && typeof j.total === 'number' && j.contributors && typeof j.contributors === 'object') {
        return { total: Math.max(0, Math.floor(j.total)), contributors: j.contributors };
      }
    } catch (e) { /* 저장소를 못 쓰면 새로 시작 */ }
    return { total: 0, contributors: {} };
  }

  function writeLocal(model) {
    try { localStorage.setItem(LS_TREE, JSON.stringify(model)); } catch (e) { /* ignore */ }
  }

  function toList(contributors) {
    return Object.keys(contributors)
      .map(function (nickname) { return { nickname: nickname, count: contributors[nickname] }; })
      .filter(function (c) { return c.count > 0; })
      .sort(function (a, b) { return b.count - a.count || a.nickname.localeCompare(b.nickname); });
  }

  function localStats() {
    const m = readLocal();
    return { total: m.total, contributors: toList(m.contributors) };
  }

  /* ── 3. remote 요청 ----------------------------------------------------- */
  function headers() {
    return {
      'apikey': CONFIG.SUPABASE_ANON_KEY,
      'Authorization': 'Bearer ' + CONFIG.SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
  }

  function rpc(name, body) {
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(function () { ctrl.abort(); }, CONFIG.REQUEST_TIMEOUT_MS) : null;
    return fetch(baseUrl + '/rest/v1/rpc/' + name, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(body || {}),
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    }).finally(function () { if (timer) clearTimeout(timer); });
  }

  function normalizeStats(payload) {
    const p = payload || {};
    const total = Math.max(0, Math.floor(Number(p.total) || 0));
    const list = Array.isArray(p.contributors) ? p.contributors : [];
    return {
      total: total,
      contributors: list.map(function (c) {
        return { nickname: String(c.nickname || ''), count: Number(c.count) || 0 };
      }).filter(function (c) { return c.nickname; })
    };
  }

  /* ── 4. 공개 API -------------------------------------------------------- */
  function stats() {
    if (mode === 'remote') {
      return rpc(CONFIG.RPC_STATS, {}).then(normalizeStats);
    }
    return Promise.resolve(localStats());
  }

  /**
   * 장식 하나 달기.
   * @returns {Promise<{ok:boolean, total:number, error?:string, retryAfter?:number}>}
   *   error: 'cooldown' | 'daily' | 'nickname' | 'network'
   */
  function tap(nickname, clientId) {
    if (mode === 'remote') {
      return rpc(CONFIG.RPC_TAP, { p_nickname: nickname, p_client_id: clientId })
        .then(function (r) {
          const res = r || {};
          if (res.ok === false) {
            return {
              ok: false,
              total: Number(res.total) || 0,
              error: String(res.error || 'unknown'),
              retryAfter: Number(res.retry_after_ms) || Number(res.retry_after) * 1000 || 0
            };
          }
          return { ok: true, total: Math.max(0, Math.floor(Number(res.total) || 0)) };
        })
        .catch(function () {
          return { ok: false, total: 0, error: 'network' };
        });
    }

    // local 시뮬레이션
    const m = readLocal();
    m.total += 1;
    m.contributors[nickname] = (m.contributors[nickname] || 0) + 1;
    writeLocal(m);
    return Promise.resolve({ ok: true, total: m.total });
  }

  /** 다른 주민의 참여를 주기적으로 반영. cb({total, contributors}) */
  function subscribe(cb) {
    if (typeof cb !== 'function') return function () {};
    listeners.add(cb);
    if (mode === 'remote' && !pollTimer) {
      const tick = function () {
        if (document.hidden) return;
        stats().then(function (s) { listeners.forEach(function (fn) { fn(s); }); }).catch(function () {});
      };
      pollTimer = setInterval(tick, CONFIG.POLL_MS);
      document.addEventListener('visibilitychange', function () {
        if (!document.hidden) tick();
      });
    }
    return function () { listeners.delete(cb); };
  }

  /* ── 5. 테스트(local) 전용 ---------------------------------------------- */
  function devSetTotal(nextTotal, nickname) {
    if (mode !== 'local') return Promise.resolve(null);
    const m = readLocal();
    const target = Math.max(0, Math.floor(nextTotal));
    let delta = target - m.total;
    if (delta === 0) return Promise.resolve(m);

    if (delta < 0) { // 되돌리기: 전체를 다시 계산
      m.total = target;
      const keys = Object.keys(m.contributors);
      m.contributors = {};
      if (target > 0 && nickname) m.contributors[nickname] = target;
      else if (target > 0) m.contributors[keys[0] || '주민'] = target;
      writeLocal(m);
      return Promise.resolve(m);
    }

    const rest = nickname ? Math.max(0, Math.min(delta, Math.round(delta * 0.18))) : 0;
    let left = delta - rest;
    let i = 0;
    while (left > 0) {
      const who = SAMPLE_NICKS[i % SAMPLE_NICKS.length];
      const give = Math.min(left, Math.ceil(delta / SAMPLE_NICKS.length) || 1);
      m.contributors[who] = (m.contributors[who] || 0) + give;
      left -= give;
      i += 1;
      if (i > 400) break;
    }
    if (rest > 0) m.contributors[nickname] = (m.contributors[nickname] || 0) + rest;
    m.total = target;
    writeLocal(m);
    return Promise.resolve(m);
  }

  function reset() {
    if (mode === 'local') { try { localStorage.removeItem(LS_TREE); } catch (e) {} }
    listeners.forEach(function (fn) { fn({ total: 0, contributors: [] }); });
    return Promise.resolve(true);
  }

  return {
    mode: mode,
    configured: configured,
    config: CONFIG,
    stats: stats,
    tap: tap,
    subscribe: subscribe,
    devSetTotal: devSetTotal,
    resetLocal: reset
  };
})();
