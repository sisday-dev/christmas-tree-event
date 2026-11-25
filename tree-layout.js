/* =========================================================================
   tree-layout.js — 3D 트리의 수학 좌표 (결정론적 · 고정값)
   -------------------------------------------------------------------------
   · 나무 실루엣(반지름 곡선)과 장식 92개 / 요정 전구 72구의 3D 좌표를 만듭니다.
   · 같은 입력이면 언제나 같은 자리가 나오므로, 새로고침해도 트리 모양이
     흔들리지 않고 마일스톤별 장식 위치가 항상 같습니다.
   · 좌표계: y축이 위. 나무 밑동이 y=0, 꼭대기가 y≈9.6. 단위는 m(미터) 감각.

   규칙 (2D 시절과 동일)
     [0]        → 1회째 손길의 첫 장식 (황금 별)
     [1] ~ [91] → 10·20·…·910회째 손길마다 하나씩  (총 92개)
     전구 72구  → 100회 단위 9단계로 나뉘어 차례로 점등
   ========================================================================= */
window.TREE_LAYOUT = (function () {
  'use strict';

  var TREE = {
    height: 9.4,      // 꼭대기 y
    bottom: 0.72,     // 잎이 시작되는 y
    radius: 3.72,     // 밑동 반지름
    taper: 0.88       // 위로 갈수록 가늘어지는 정도
  };

  /* 나무 표면 반지름 — y 높이에서의 가지 끝 반지름 */
  function radiusAt(y) {
    var t = (y - TREE.bottom) / (TREE.height - TREE.bottom);
    if (t < 0) t = 0;
    if (t > 1) t = 1;
    return TREE.radius * Math.pow(1 - t, TREE.taper) + 0.09;
  }

  /* 결정론적 난수 (mulberry32) */
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  var TYPES = ['ball', 'ball', 'ball', 'star', 'bell', 'gift', 'ribbon'];
  var COLORS = ['#e0443f', '#f2b53c', '#e7eef7', '#1f9e74', '#e06a86', '#f6dfb2'];

  /* ── 장식 92개: 위에서 아래로, 황금각 나선으로 360도 배치 ───────────── */
  function buildOrnaments() {
    var rand = rng(20261225);
    var list = [];
    var n = 92;
    for (var i = 0; i < n; i++) {
      var t = i / (n - 1);                       // 0 = 꼭대기, 1 = 밑동
      var y = 8.86 - (8.86 - 1.55) * Math.pow(t, 0.72);
      var angle = 0.55 + i * 2.399963;           // 황금각(137.5°) — 겹치지 않는 나선
      var r = radiusAt(y) * (0.86 + rand() * 0.05);
      var jitterY = (rand() - 0.5) * 0.13;
      var scale = 0.86 + t * 0.3 + rand() * 0.05;

      var type, color;
      if (i === 0) {
        type = 'star'; color = '#f6c453';
        scale = 1.5;
      } else {
        type = TYPES[Math.floor(rand() * TYPES.length)];
        color = COLORS[Math.floor(rand() * COLORS.length)];
        if (color === '#f6dfb2' && rand() > 0.4) color = '#f2b53c';
      }

      list.push({
        index: i,
        type: type,
        color: color,
        x: Math.cos(angle) * r,
        y: y + jitterY,
        z: Math.sin(angle) * r,
        angle: angle,
        scale: scale,
        phase: rand() * Math.PI * 2
      });
    }
    return list;
  }

  /* ── 요정 전구 72구: 나무를 감는 나선, 아래 → 위 순서 ───────────────── */
  function buildLights() {
    var n = 72;
    var perStage = 8;        // 9단계 × 8구 = 72구
    var yTop = 9.32, yBottom = 2.0;
    var list = [];
    for (var i = 0; i < n; i++) {
      var u = i / (n - 1);
      var y = yBottom + (yTop - yBottom) * u;
      var angle = 0.2 + u * Math.PI * 2 * 5.3;
      var r = radiusAt(y) * 1.16 + 0.06;
      list.push({
        index: i,
        stage: Math.floor(i / perStage),
        x: Math.cos(angle) * r,
        y: y,
        z: Math.sin(angle) * r
      });
    }
    return list;
  }

  return {
    TREE: TREE,
    radiusAt: radiusAt,
    ornaments: buildOrnaments(),
    lights: buildLights(),
    lightStages: 9,
    lightPerStage: 8
  };
})();
