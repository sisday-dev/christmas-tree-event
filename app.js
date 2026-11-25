/* =========================================================================
   app.js — 속초 효성해링턴 크리스마스 트리 (915회 완성) · 3D
   -------------------------------------------------------------------------
   0회: 생초록 3D 소나무 → 1회: 첫 황금 별 장식 → 10회마다 장식 1개(총 92개)
   100회 단위: 요정 전구 1단씩 점등 → 915회: 꼭대기 별 + 입체 눈 + 참여자 목록
   화면은 scene3d.js(Three.js)가 그리고, 이 파일은 규칙·저장·소리·시트를 맡습니다.
   ========================================================================= */
(function () {
  'use strict';

  /* ── 0. 설정 ─────────────────────────────────────────────────────────── */
  const CFG = {
    target: 915,          // 완성까지 필요한 전체 클릭 수
    firstAt: 1,           // 첫 장식이 달리는 클릭
    step: 10,             // 이후 10회마다 장식 1개
    maxOrnaments: 92,     // 장식 총 개수 (1 + 91)
    dailyLimit: 5,        // 1인 1일 최대 참여
    cooldownMs: 3000,     // 연속 터치 쿨타임
    apartment: '속초 효성해링턴 플레이스'
  };

  const KEY = {
    nick: 'xmas915:nick',
    muted: 'xmas915:muted',
    daily: 'xmas915:daily',
    cid: 'xmas915:client'
  };

  const query = new URLSearchParams(location.search);
  const testMode = query.get('test') === '1';

  const $ = function (sel) { return document.querySelector(sel); };

  const el = {
    app: $('#app'),
    stage: $('#stage'),
    scene: $('#scene3d'),
    loading: $('#stageLoading'),
    orbitHint: $('#orbitHint'),
    bar: $('#bar'),
    barFill: $('#barFill'),
    marks: $('#marks'),
    totalNum: $('#totalNum'),
    goalNum: $('#goalNum'),
    stageNote: $('#stageNote'),
    nickBtn: $('#nickBtn'),
    nickName: $('#nickName'),
    remainChip: $('#remainChip'),
    nextText: $('#nextText'),
    pips: $('#pips'),
    hint: $('#hint'),
    toast: $('#toast'),
    muteBtn: $('#muteBtn'),
    muteIcon: $('#muteIcon'),
    sheet: $('#nickSheet'),
    nickForm: $('#nickForm'),
    nickInput: $('#nickInput'),
    nickWarn: $('#nickWarn'),
    done: $('#done'),
    doneCount: $('#doneCount'),
    doneChips: $('#doneChips'),
    doneNote: $('#doneNote'),
    doneClose: $('#doneClose'),
    devbar: $('#devbar'),
    devtab: $('#devTab')
  };

  const state = {
    nickname: '',
    total: 0,
    contributors: [],
    muted: false,
    coolUntil: 0,
    coolTimer: 0,
    daily: { date: '', count: 0 },
    done: false,
    busy: false,
    sheetOpen: false,
    sceneReady: false
  };

  let Scene3D = null;

  /* ── 1. 작은 도우미들 ────────────────────────────────────────────────── */
  function readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch (e) { return fallback; }
  }
  function writeJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* ignore */ }
  }
  function readCookie(name) {
    const parts = ('; ' + document.cookie).split('; ' + name + '=');
    return parts.length === 2 ? decodeURIComponent(parts[1].split(';')[0]) : '';
  }
  function writeCookie(name, value, days) {
    try {
      document.cookie = name + '=' + encodeURIComponent(value) +
        '; max-age=' + (days * 86400) + '; path=/; SameSite=Lax';
    } catch (e) { /* ignore */ }
  }
  function todayKST() {
    return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  }
  function clientId() {
    let id = readJSON(KEY.cid, '');
    if (typeof id !== 'string' || id.length < 6) id = readCookie('xmas_cid');
    if (typeof id !== 'string' || id.length < 6) {
      id = 'c-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    }
    writeJSON(KEY.cid, id);
    writeCookie('xmas_cid', id, 365);
    return id;
  }
  function loadNickname() {
    const saved = readJSON(KEY.nick, '');
    if (typeof saved === 'string' && saved.trim()) return saved.trim();
    const cookie = readCookie('xmas_nick');
    return cookie.trim() || '';
  }
  function saveNickname(nick) {
    writeJSON(KEY.nick, nick);
    writeCookie('xmas_nick', nick, 180);
  }
  function loadDaily() {
    const d = readJSON(KEY.daily, null);
    const today = todayKST();
    if (d && d.date === today && typeof d.count === 'number') return { date: today, count: d.count };
    return { date: today, count: 0 };
  }
  function saveDaily() { writeJSON(KEY.daily, state.daily); }

  let toastTimer = 0;
  function toast(message) {
    el.toast.textContent = message;
    el.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.toast.classList.remove('show'); }, 2400);
  }

  /* ── 2. 소리 (Web Audio 합성 — 음원 파일 없음) ───────────────────────── */
  const Sound = {
    ctx: null,
    master: null,
    muted: false,
    noteIndex: 0,

    init: function () {
      if (this.ctx) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 0.5;
        this.master.connect(this.ctx.destination);
      } catch (e) { this.ctx = null; }
    },
    unlock: function () {
      this.init();
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(function () {});
    },
    setMuted: function (muted) {
      this.muted = muted;
      if (this.master) this.master.gain.value = muted ? 0 : 0.5;
    },
    bell: function (freq, when, dur, vol) {
      const c = this.ctx;
      if (!c || this.muted) return;
      const t = c.currentTime + (when || 0);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vol || 0.11, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + (dur || 0.55));
      g.connect(this.master);
      [
        { type: 'triangle', mult: 1, gain: 1 },
        { type: 'sine', mult: 2.01, gain: 0.3 },
        { type: 'sine', mult: 3.03, gain: 0.12 }
      ].forEach(function (v) {
        const o = c.createOscillator();
        o.type = v.type;
        o.frequency.value = freq * v.mult;
        const og = c.createGain();
        og.gain.value = v.gain;
        o.connect(og);
        og.connect(g);
        o.start(t);
        o.stop(t + (dur || 0.55) + 0.05);
      });
    },
    noise: function (when, dur, vol) {
      const c = this.ctx;
      if (!c || this.muted) return;
      const len = Math.floor(c.sampleRate * (dur || 0.25));
      const buf = c.createBuffer(1, len, c.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.2);
      const src = c.createBufferSource();
      src.buffer = buf;
      const hp = c.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 3200;
      const g = c.createGain();
      g.gain.value = vol || 0.05;
      src.connect(hp);
      hp.connect(g);
      g.connect(this.master);
      src.start(c.currentTime + (when || 0));
    },
    tap: function () {
      const scale = [783.99, 880.0, 987.77, 1046.5, 1174.66, 1318.51];
      const f = scale[this.noteIndex++ % scale.length];
      this.bell(f, 0, 0.42, 0.075);
      this.noise(0, 0.18, 0.025);
    },
    ornament: function () {
      const arp = [659.25, 987.77, 1318.51];
      for (let i = 0; i < arp.length; i++) this.bell(arp[i], i * 0.075, 0.5, 0.1);
      this.noise(0, 0.3, 0.035);
    },
    milestone: function () {
      const arp = [523.25, 659.25, 783.99, 1046.5];
      for (let i = 0; i < arp.length; i++) this.bell(arp[i], i * 0.11, 0.9, 0.12);
    },
    complete: function () {
      const chord = [523.25, 659.25, 783.99, 1046.5, 1318.51];
      for (let i = 0; i < chord.length; i++) this.bell(chord[i], 0.06 * i, 1.9, 0.11);
      this.bell(2093, 0.05, 1.2, 0.05);
      this.noise(0.02, 0.9, 0.03);
    }
  };

  /* ── 3. 장식 수 계산 ─────────────────────────────────────────────────── */
  function ornamentCountFor(total) {
    if (total < CFG.firstAt) return 0;
    return Math.min(CFG.maxOrnaments, 1 + Math.floor(total / CFG.step));
  }

  function stageFor(total) {
    return Math.max(0, Math.min(9, Math.floor(total / 100)));
  }

  function buildMarks() {
    const frag = document.createDocumentFragment();
    for (let i = 1; i <= 9; i++) {
      const s = document.createElement('span');
      s.style.left = ((i * 100) / CFG.target * 100).toFixed(3) + '%';
      frag.appendChild(s);
    }
    el.marks.appendChild(frag);
  }

  function buildPips() {
    const frag = document.createDocumentFragment();
    for (let i = 0; i < 10; i++) frag.appendChild(document.createElement('i'));
    el.pips.appendChild(frag);
  }

  /* ── 4. 3D 씬 연결 ───────────────────────────────────────────────────── */
  function bootScene() {
    if (!window.Scene3D) return false;
    let ok = false;
    try {
      ok = window.Scene3D.init(el.scene, el.stage, { preserveDraw: testMode });
    } catch (e) {
      ok = false;
    }
    if (!ok) {
      el.loading.classList.add('fail');
      el.loading.innerHTML = '<span>이 기기에서는 3D 화면을 켤 수 없어요.<br />트리는 계속 함께 만들 수 있어요.</span>';
      el.stage.classList.add('no3d');
      return false;
    }
    Scene3D = window.Scene3D;
    state.sceneReady = true;
    el.loading.classList.add('off');
    Scene3D.onTap(function (x, y, hit) {
      if (state.sheetOpen) return;
      engageTap(x, y, hit);
    });
    return true;
  }

  let hintTimer = 0;
  function hideOrbitHint() {
    if (!el.orbitHint || el.orbitHint.classList.contains('off')) return;
    el.orbitHint.classList.add('off');
    clearTimeout(hintTimer);
  }
  function scheduleHintHide() {
    clearTimeout(hintTimer);
    hintTimer = setTimeout(hideOrbitHint, 9000);
  }

  /* ── 5. 진행 상황 그리기 ─────────────────────────────────────────────── */
  function noteFor(total) {
    if (total >= CFG.target) return '🎉 915번의 손길로 트리가 완성됐어요';
    const stage = stageFor(total);
    if (stage === 0) {
      return total === 0
        ? '아직 민둥 트리예요 · 첫 장식을 달아 주세요'
        : total + '번째 손길! 트리가 조금씩 채워지고 있어요';
    }
    const lines = {
      100: '트리에 불이 들어오기 시작했어요',
      200: '트리가 한결 환해졌어요',
      300: '반짝임이 가지마다 번져요',
      400: '장식이 제법 풍성해졌어요',
      500: '트리의 절반을 채웠어요',
      600: '불빛이 점점 따뜻해져요',
      700: '우리 아파트가 환해졌어요',
      800: '이제 마지막 구간이에요',
      900: '완성이 눈앞이에요'
    };
    return (stage * 100) + '번째 장식! ' + (lines[stage * 100] || '트리가 밝아지고 있어요');
  }

  function renderNext() {
    const total = state.total;
    let html, filled, done = false;

    if (total >= CFG.target) {
      html = '트리 완성! <b>915</b>번의 손길이 모였어요';
      filled = 10;
      done = true;
    } else if (total === 0) {
      html = '첫 장식까지 <b>1</b>번 남았어요!';
      filled = 0;
    } else if (total >= 910) {
      html = '완공까지 <b>' + (CFG.target - total) + '</b>번 남았어요!';
      filled = Math.round(((total - 910) / (CFG.target - 910)) * 10);
    } else {
      const next = (Math.floor(total / CFG.step) + 1) * CFG.step;
      html = '다음 장식까지 <b>' + (next - total) + '</b>번 남았어요!';
      filled = Math.round(((total % CFG.step) / CFG.step) * 10);
    }

    el.nextText.innerHTML = html;
    el.nextText.classList.toggle('complete', done);
    const pips = el.pips.children;
    for (let i = 0; i < pips.length; i++) pips[i].classList.toggle('on', i < filled);
  }

  function renderAll() {
    const total = state.total;
    el.totalNum.textContent = String(total);
    el.goalNum.textContent = String(CFG.target);
    el.barFill.style.width = Math.max(0, Math.min(100, (total / CFG.target) * 100)) + '%';
    el.bar.setAttribute('aria-valuenow', String(total));
    el.bar.setAttribute('aria-valuemax', String(CFG.target));
    el.stageNote.textContent = noteFor(total);
    renderNext();
    refreshNickChip();
    if (Scene3D) Scene3D.setStorm(total >= CFG.target);
  }

  function refreshNickChip() {
    const left = Math.max(0, CFG.dailyLimit - state.daily.count);
    el.nickName.textContent = state.nickname || '닉네임';
    el.remainChip.textContent = '오늘 ' + left + '번';
    if (state.nickname) el.nickBtn.setAttribute('aria-label', state.nickname + ' 님의 닉네임 바꾸기');
  }

  /* ── 6. 진행 반영 ────────────────────────────────────────────────────── */
  function applyTotal(nextTotal, prevTotal, opts) {
    opts = opts || {};
    const next = Math.max(0, Math.min(CFG.target, Math.round(nextTotal)));
    const before = typeof prevTotal === 'number' ? prevTotal : state.total;
    const wasDone = state.done;
    state.total = next;
    state.done = next >= CFG.target;

    if (Scene3D) Scene3D.setProgress(next, { instant: !!opts.silent });
    renderAll();

    const beforeCount = ornamentCountFor(before);
    const afterCount = ornamentCountFor(next);
    if (!opts.silent && afterCount > beforeCount) Sound.ornament();

    if (!wasDone && state.done) {
      if (opts.silent) return;               // 첫 로딩에서 이미 완성된 트리: 축하 창은 띄우지 않음
      setTimeout(function () {
        showDone();
        Sound.complete();
        if (Scene3D) Scene3D.setStorm(true);
      }, 520);
      return;
    }
    if (next > before && !opts.silent) {
      const crossed = Math.floor(next / 100) * 100;
      if (crossed >= 100 && crossed <= 900 && crossed > Math.floor(before / 100) * 100) {
        toast('🎉 ' + crossed + '번째 장식! 트리에 불이 밝아졌어요');
        Sound.milestone();
      }
    }
  }

  /* ── 7. 클릭 처리 ────────────────────────────────────────────────────── */
  function cooldownLeft() {
    return Math.max(0, state.coolUntil - Date.now());
  }

  function startCooldown() {
    clearInterval(state.coolTimer);
    const tick = function () {
      const left = cooldownLeft();
      if (left <= 0) {
        clearInterval(state.coolTimer);
        state.coolTimer = 0;
        el.hint.classList.remove('cooling');
        el.stage.classList.remove('cooling');
        setHint();
        return;
      }
      el.hint.classList.add('cooling');
      el.stage.classList.add('cooling');
      el.hint.textContent = '조금만! ' + Math.ceil(left / 1000) + '초 뒤에 다시 눌러 주세요';
    };
    tick();
    state.coolTimer = setInterval(tick, 180);
  }

  function setHint() {
    el.hint.classList.remove('warn');
    if (state.daily.count >= CFG.dailyLimit) {
      el.hint.classList.add('warn');
      el.hint.textContent = '오늘 ' + CFG.dailyLimit + '번 다 채웠어요 · 내일 또 만나요';
      return;
    }
    el.hint.textContent = state.done
      ? '눈이 내리는 완성된 트리예요 🎄'
      : '트리를 콕 눌러 장식을 달아 주세요';
  }

  async function engageTap(x, y, hitTree) {
    Sound.unlock();
    hideOrbitHint();

    if (!hitTree) {
      if (Scene3D) Scene3D.burstScreen(x, y);
      toast('트리를 콕 눌러 주세요');
      return;
    }

    if (!state.nickname) { openNickSheet(); return; }

    if (state.done) {
      Sound.tap();
      toast('이미 완성된 트리예요 🎄');
      return;
    }

    if (cooldownLeft() > 0) {
      toast(Math.ceil(cooldownLeft() / 1000) + '초 뒤에 다시 눌러 주세요');
      return;
    }

    if (state.daily.count >= CFG.dailyLimit) {
      toast('오늘 ' + CFG.dailyLimit + '번 다 채웠어요 · 내일 또 만나요!');
      setHint();
      return;
    }

    if (state.busy) return;
    state.busy = true;

    Sound.tap();

    const before = state.total;
    let res = null;
    try {
      res = await TreeBackend.tap(state.nickname, clientId());
    } catch (e) {
      res = { ok: false, error: 'network' };
    } finally {
      state.busy = false;
    }

    if (res && res.ok) {
      state.daily.count += 1;
      saveDaily();
      state.coolUntil = Date.now() + CFG.cooldownMs;
      startCooldown();
      applyTotal(res.total, before);
      setHint();
      TreeBackend.stats().then(function (s) {
        if (s) state.contributors = s.contributors;
      }).catch(function () {});
    } else if (res && res.error === 'cooldown') {
      state.coolUntil = Date.now() + (res.retryAfter > 0 ? res.retryAfter : CFG.cooldownMs);
      startCooldown();
      toast('잠깐! 연속으로는 안 돼요');
    } else if (res && res.error === 'daily') {
      state.daily.count = CFG.dailyLimit;
      saveDaily();
      refreshNickChip();
      setHint();
      toast('오늘 ' + CFG.dailyLimit + '번 다 채웠어요 · 내일 또 만나요!');
    } else if (res && res.error === 'nickname') {
      openNickSheet();
      toast('닉네임을 다시 확인해 주세요');
    } else {
      toast('연결이 잠깐 불안정해요. 다시 눌러 주세요');
    }
  }

  function bindStage() {
    // 3D 씬이 있으면 캔버스가 탭/드래그를 직접 처리합니다 (scene3d.js)
    // 3D를 못 켠 기기에서는 화면 아무 곳이나 눌러도 참여되도록 대체 처리합니다.
    if (!state.sceneReady) {
      el.stage.addEventListener('click', function (ev) {
        if (state.sheetOpen) return;
        const rect = el.stage.getBoundingClientRect();
        engageTap(ev.clientX - rect.left, ev.clientY - rect.top, true);
      });
    }

    el.stage.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter' || ev.key === ' ' || ev.key === 'Spacebar') {
        ev.preventDefault();
        engageTap(el.stage.clientWidth / 2, el.stage.clientHeight / 2, true);
      }
    });

    el.stage.addEventListener('pointerdown', function () { hideOrbitHint(); }, { once: true, passive: true });
  }

  /* ── 8. 닉네임 시트 ──────────────────────────────────────────────────── */
  function openNickSheet() {
    state.sheetOpen = true;
    el.sheet.hidden = false;
    el.nickWarn.textContent = '';
    el.nickInput.value = state.nickname || '';
    setTimeout(function () {
      try { el.nickInput.focus(); el.nickInput.select(); } catch (e) { /* ignore */ }
    }, 140);
  }

  function closeNickSheet() {
    state.sheetOpen = false;
    el.sheet.hidden = true;
    try { el.nickInput.blur(); } catch (e) { /* ignore */ }
    if (state.nickname) setHint();
    scheduleHintHide();
  }

  function submitNick(ev) {
    if (ev) ev.preventDefault();
    const raw = el.nickInput.value.replace(/\s+/g, ' ').trim();
    if (!raw) {
      el.nickWarn.textContent = '닉네임을 한 글자 이상 적어 주세요.';
      return;
    }
    if (raw.length > 12) {
      el.nickWarn.textContent = '12자까지 쓸 수 있어요.';
      return;
    }
    const changed = state.nickname !== raw;
    state.nickname = raw;
    saveNickname(raw);
    refreshNickChip();
    closeNickSheet();
    if (changed) toast(raw + ' 님, 반가워요! 🎄');
    Sound.unlock();
    Sound.tap();
  }

  /* ── 9. 완공 화면 ────────────────────────────────────────────────────── */
  function renderDoneChips(list) {
    el.doneChips.innerHTML = '';
    const sorted = (list || []).slice().sort(function (a, b) { return b.count - a.count; });
    const max = 30;
    const shown = sorted.slice(0, max);
    shown.forEach(function (c) {
      const s = document.createElement('span');
      s.className = 'chip';
      s.textContent = c.nickname;
      el.doneChips.appendChild(s);
    });
    if (sorted.length > max) {
      const more = document.createElement('span');
      more.className = 'chip more';
      more.textContent = '+' + (sorted.length - max) + '명';
      el.doneChips.appendChild(more);
    }
    if (!sorted.length) {
      const s = document.createElement('span');
      s.className = 'chip more';
      s.textContent = '아직 참여자 기록이 없어요';
      el.doneChips.appendChild(s);
    }
    el.doneCount.textContent = String(sorted.length);
    const hasSample = sorted.some(function (c) { return c.nickname.indexOf('샘플') === 0; });
    el.doneNote.hidden = !hasSample;
  }

  async function showDone() {
    let list = state.contributors;
    try {
      const s = await TreeBackend.stats();
      if (s) { list = s.contributors; state.contributors = s.contributors; }
    } catch (e) { /* 저장된 목록으로 표시 */ }
    renderDoneChips(list);
    el.done.hidden = false;
  }

  /* ── 10. 개발 테스트 바 ──────────────────────────────────────────────── */
  function showDevbar(show) {
    el.devbar.hidden = !show;
    el.devtab.hidden = show;
    document.body.classList.toggle('dev-open', show);
  }

  async function devJumpTo(next) {
    const before = state.total;
    if (!state.nickname) { openNickSheet(); return; }
    await TreeBackend.devSetTotal(next, state.nickname);
    state.coolUntil = 0;
    clearInterval(state.coolTimer);
    state.coolTimer = 0;
    el.hint.classList.remove('cooling');
    el.stage.classList.remove('cooling');
    const s = await TreeBackend.stats();
    if (s) state.contributors = s.contributors;
    applyTotal(next, before);
    setHint();
  }

  async function devReset() {
    await TreeBackend.resetLocal();
    const before = state.total;
    state.contributors = [];
    state.daily = { date: todayKST(), count: 0 };
    state.coolUntil = 0;
    saveDaily();
    clearInterval(state.coolTimer);
    state.coolTimer = 0;
    el.hint.classList.remove('cooling', 'warn');
    el.stage.classList.remove('cooling');
    el.done.hidden = true;
    if (Scene3D) Scene3D.setStorm(false);
    applyTotal(0, before, { silent: true });
    setHint();
    toast('테스트 데이터를 초기화했어요');
  }

  function setupDev() {
    // 실서버(remote) 모드에서는 공용 트리를 흉내 낼 수 없으므로 테스트 바를 숨깁니다.
    if (TreeBackend.mode !== 'local') {
      el.devbar.hidden = true;
      el.devtab.hidden = true;
      document.body.classList.remove('dev-open');
      return;
    }
    showDevbar(true);
    el.devbar.addEventListener('click', function (ev) {
      const btn = ev.target.closest ? ev.target.closest('button[data-dev]') : null;
      if (!btn) return;
      const act = btn.getAttribute('data-dev');
      if (act === 'hide') { showDevbar(false); return; }
      if (act === 'reset') { devReset(); return; }
      const prev = state.total;
      let next;
      if (act === 'done') next = CFG.target;
      else if (act === '100' || act === '500') next = Number(act);
      else next = Math.min(CFG.target, prev + Number(act));
      if (next === prev) {
        if (act === 'done') showDone();
        return;
      }
      devJumpTo(next);
    });
    el.devtab.addEventListener('click', function () { showDevbar(true); });
  }

  /* ── 11. 시작 ────────────────────────────────────────────────────────── */
  function applyMuted() {
    el.muteBtn.setAttribute('aria-pressed', state.muted ? 'true' : 'false');
    el.muteBtn.setAttribute('aria-label', state.muted ? '효과음 켜기' : '효과음 끄기');
    el.muteIcon.textContent = state.muted ? '🔇' : '🔊';
    Sound.setMuted(state.muted);
  }

  function bindEvents() {
    bindStage();

    el.muteBtn.addEventListener('click', function () {
      state.muted = !state.muted;
      writeJSON(KEY.muted, state.muted);
      applyMuted();
      if (!state.muted) { Sound.unlock(); Sound.tap(); }
    });

    el.nickBtn.addEventListener('click', openNickSheet);
    el.nickForm.addEventListener('submit', submitNick);

    const scrim = el.sheet.querySelector('[data-close-nick]');
    if (scrim) {
      scrim.addEventListener('click', function () {
        if (state.nickname) closeNickSheet();
        else {
          el.nickWarn.textContent = '이벤트에 참여하려면 닉네임이 필요해요.';
          el.nickInput.focus();
        }
      });
    }

    el.doneClose.addEventListener('click', function () {
      el.done.hidden = true;
      if (Scene3D) Scene3D.setStorm(true);
    });

    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) Sound.unlock();
    });
  }

  async function init() {
    buildMarks();
    buildPips();

    state.muted = readJSON(KEY.muted, false) === true;
    state.daily = loadDaily();
    state.nickname = loadNickname();

    applyMuted();
    refreshNickChip();

    bootScene();
    state.done = state.total >= CFG.target;
    renderAll();
    setHint();

    bindEvents();
    if (!state.nickname) openNickSheet();
    else scheduleHintHide();
    if (testMode) setupDev();

    /* 검증용 훅 */
    window.__xmas = {
      CFG: CFG,
      state: state,
      mode: TreeBackend.mode,
      ornamentCountFor: ornamentCountFor,
      stageFor: stageFor,
      applyTotal: applyTotal,
      setNickname: function (n) { el.nickInput.value = n; submitNick(); },
      openNickSheet: openNickSheet,
      tapCenter: function () { engageTap(el.stage.clientWidth / 2, el.stage.clientHeight / 2, true); },
      stats: function () { return TreeBackend.stats(); },
      scene: function () { return Scene3D ? Scene3D.debug() : null; },
      reset: devReset
    };

    /* 공용 기록 불러오기 — 느린 네트워크에서도 트리는 먼저 그려집니다 */
    TreeBackend.stats().then(function (s) {
      if (!s) return;
      state.contributors = s.contributors || [];
      const next = Math.max(0, Math.min(CFG.target, s.total || 0));
      if (next !== state.total) applyTotal(next, state.total, { silent: true });
      else renderAll();
    }).catch(function () { /* 오프라인이어도 화면은 그대로 동작 */ });

    TreeBackend.subscribe(function (s) {
      if (!s) return;
      state.contributors = s.contributors || state.contributors;
      const next = Math.max(0, Math.min(CFG.target, s.total || 0));
      if (next !== state.total) applyTotal(next, state.total);
      else if (!el.done.hidden) renderDoneChips(state.contributors);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
