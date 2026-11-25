/* =========================================================================
   scene3d.js — 3D 크리스마스 트리 씬 (Three.js r149, 로컬 번들)
   -------------------------------------------------------------------------
   · 바깥 CDN 요청 0건: vendor/three.min.js 하나만 씁니다.
   · 구성: 다층 소나무(가지 26단) + 나무 기둥 + 눈 설원 + 밤하늘 별/달/안개
           + 요정 전구 나선 + 장식 92개(메탈릭 볼·별·종·선물·리본)
           + 915회 꼭대기 대형 별 + 입체 눈송이 + 탭 별빛 파티클
   · 조작: 끌어서 360° 회전(수직 제한 · 감쇠 · 평소 자동 회전, 만지면 멈춤)
           두 손가락/휠로 확대·축소. 짧은 탭만 "장식 달기"로 집계합니다.
   · 성능: 픽셀비율 최소화(min(dpr,2)) + 자동 화질 조절 + 그리기 호출 최소화
   ========================================================================= */
window.Scene3D = (function () {
  'use strict';

  var T = window.THREE;
  var L = window.TREE_LAYOUT;

  var api = {};

  /* ── 0. 내부 상태 ─────────────────────────────────────────────────────── */
  var renderer = null, scene = null, camera = null, canvasEl = null, hostEl = null;
  var clock = null, raf = 0, running = false, ready = false, time = 0;

  var treeGroup, branchMesh, ornGroup, threadLines, ornGlow;
  var lightCore, lightGlow, lightWire;
  var topperGroup, topperFlare, topperHalo;
  var glowBack, lightPool, moonSprite;
  var sparks, snow;
  var innerLight, topperLight, keyLight, hemiLight;

  var ornMeshes = [];        // 92개 그룹
  var ornData = L.ornaments;
  var ornGlowBase = [];      // 목표 밝기
  var ornGlowNow = [];       // 현재 밝기
  var popList = [];          // 등장 애니메이션
  var lightLevel = [];       // 전구 72구 점등 정도
  var envMap = null;

  var state = { total: 0, ornaments: 0, stage: 0, topper: false, snowStorm: false, plates: 0 };
  var tapHandler = null;
  var COL_LIGHT_WARM = null, COL_LIGHT_AMBER = null;

  var quality = { dpr: 1, target: 2, frames: 0, acc: 0, lows: 0, his: 0, fps: 60, minGapMs: 0, last: 0 };

  /* ── 1. 작은 도우미 ───────────────────────────────────────────────────── */
  var _color = new T.Color();
  function col(hex) {
    _color.set(hex);
    return _color.clone().convertSRGBToLinear();
  }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function easeOutBack(p) {
    var c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);
  }
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

  function makeCanvas(size) {
    var c = document.createElement('canvas');
    c.width = size; c.height = size;
    return c;
  }

  /* 부드러운 원형 발광 텍스처 */
  function glowTexture(size, core) {
    var c = makeCanvas(size), g = c.getContext('2d');
    var grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(core || 0.16, 'rgba(255,247,225,0.92)');
    grd.addColorStop(0.42, 'rgba(255,226,160,0.34)');
    grd.addColorStop(1, 'rgba(255,210,120,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, size, size);
    var t = new T.CanvasTexture(c);
    t.needsUpdate = true;
    return t;
  }

  /* 십자 별빛(플레어) 텍스처 */
  function flareTexture(size) {
    var c = makeCanvas(size), g = c.getContext('2d');
    var h = size / 2;
    var grd = g.createRadialGradient(h, h, 0, h, h, h);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.2, 'rgba(255,244,214,0.55)');
    grd.addColorStop(1, 'rgba(255,220,150,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, size, size);

    g.globalCompositeOperation = 'lighter';
    var ray = g.createLinearGradient(0, h, size, h);
    ray.addColorStop(0, 'rgba(255,236,190,0)');
    ray.addColorStop(0.5, 'rgba(255,250,232,0.95)');
    ray.addColorStop(1, 'rgba(255,236,190,0)');
    g.fillStyle = ray;
    g.fillRect(0, h - size * 0.022, size, size * 0.044);

    var ray2 = g.createLinearGradient(h, 0, h, size);
    ray2.addColorStop(0, 'rgba(255,236,190,0)');
    ray2.addColorStop(0.5, 'rgba(255,250,232,0.75)');
    ray2.addColorStop(1, 'rgba(255,236,190,0)');
    g.fillStyle = ray2;
    g.fillRect(h - size * 0.016, 0, size * 0.032, size);

    var t = new T.CanvasTexture(c);
    t.needsUpdate = true;
    return t;
  }

  /* ── 2. 환경 반사 (메탈릭 볼이 밤하늘을 비추도록) ─────────────────────── */
  function buildEnvMap() {
    try {
      var size = 32, faces = [];
      for (var i = 0; i < 6; i++) {
        var c = makeCanvas(size), g = c.getContext('2d');
        var grd = g.createLinearGradient(0, 0, 0, size);
        grd.addColorStop(0, i === 2 ? '#101f33' : '#0d1e33');
        grd.addColorStop(0.62, i === 2 ? '#172b40' : '#28425c');
        grd.addColorStop(1, i === 3 ? '#03070c' : '#050b12');
        g.fillStyle = grd;
        g.fillRect(0, 0, size, size);
        if (i !== 3) {   // 지평선 근처의 따뜻한 불빛 띠
          var warm = g.createRadialGradient(size * 0.5, size * 0.66, 0, size * 0.5, size * 0.66, size * 0.6);
          warm.addColorStop(0, 'rgba(255,196,120,0.55)');
          warm.addColorStop(1, 'rgba(255,180,100,0)');
          g.fillStyle = warm;
          g.fillRect(0, 0, size, size);
        }
        faces.push(c);
      }
      var cube = new T.CubeTexture(faces);
      cube.needsUpdate = true;
      cube.encoding = T.sRGBEncoding;
      var pmrem = new T.PMREMGenerator(renderer);
      pmrem.compileCubemapShader();
      var rt = pmrem.fromCubemap(cube);
      pmrem.dispose();
      cube.dispose();
      return rt.texture;
    } catch (e) {
      return null;
    }
  }

  /* ── 3. 나무: 26단 가지를 한 덩어리 지오메트리로 ───────────────────────── */
  function buildFirGeometry() {
    /* 겹겹이 포개진 원뿔(층)로 소나무를 만듭니다.
       각 층은 위(줄기)에서 아래(가지 끝)로 부드럽게 떨어지고,
       층마다 가장자리를 들쭉날쭉하게 해서 진짜 가지처럼 보이게 합니다. */
    var pos = [], nor = [], cols = [];
    var rand = rng(77117);
    var yB = L.TREE.bottom - 0.05, yT = L.TREE.height;
    var tiers = 12;

    var cTop = col('#06200f');
    var cMid = col('#114c2d');
    var cRim = col('#3b9660');
    var cLip = col('#05170d');

    var e1 = new T.Vector3(), e2 = new T.Vector3(), nn = new T.Vector3();

    function tri(a, b, c, x, y, z) {
      e1.subVectors(b, a);
      e2.subVectors(c, a);
      nn.crossVectors(e1, e2).normalize();
      pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
      nor.push(nn.x, nn.y, nn.z, nn.x, nn.y, nn.z, nn.x, nn.y, nn.z);
      cols.push(x.r, x.g, x.b, y.r, y.g, y.b, z.r, z.g, z.b);
    }

    for (var i = 0; i < tiers; i++) {
      var t = i / (tiers - 1);
      var y = yB + (yT - yB) * Math.pow(t, 0.94);
      var r = L.radiusAt(y) * 1.04;
      var h = 1.0 + r * 0.52;
      var N = Math.max(10, Math.round(13 + 12 * (1 - t)));
      var offset = i * 0.55;
      var shade = 0.72 + (1 - t) * 0.3;

      for (var j = 0; j < N; j++) {
        var a0 = offset + (j / N) * Math.PI * 2;
        var a1 = offset + ((j + 1) / N) * Math.PI * 2;
        var am = (a0 + a1) / 2;
        var c0 = Math.cos(a0), s0 = Math.sin(a0);
        var c1 = Math.cos(a1), s1 = Math.sin(a1);
        var cm = Math.cos(am), sm = Math.sin(am);

        var rr0 = r * (0.86 + rand() * 0.14);
        var rr1 = r * (0.86 + rand() * 0.14);
        var rTip = r * (1.0 + rand() * 0.16);
        var d0 = (rand() - 0.5) * 0.12;
        var d1 = (rand() - 0.5) * 0.12;
        var dT = (rand() - 0.5) * 0.22;
        var bright = 0.86 + rand() * 0.3;

        var rTop = Math.max(0.03, r * 0.05);
        var rMid = r * (0.46 + rand() * 0.08);

        var T0 = new T.Vector3(c0 * rTop, y + h, s0 * rTop);
        var T1 = new T.Vector3(c1 * rTop, y + h, s1 * rTop);
        var M0 = new T.Vector3(c0 * rMid, y + h * 0.26, s0 * rMid);
        var M1 = new T.Vector3(c1 * rMid, y + h * 0.26, s1 * rMid);
        var R0 = new T.Vector3(c0 * rr0, y + d0, s0 * rr0);
        var R1 = new T.Vector3(c1 * rr1, y + d1, s1 * rr1);
        var P = new T.Vector3(cm * rTip, y - 0.1 + dT, sm * rTip);

        var cT = cTop.clone().multiplyScalar(shade);
        var cM = cMid.clone().multiplyScalar(shade);
        var cR = cRim.clone().lerp(cMid, 0.35 + rand() * 0.3).multiplyScalar(shade * bright * 0.92);
        var cP = cRim.clone().lerp(cMid, rand() * 0.25).multiplyScalar(shade * bright);

        tri(T0, M0, M1, cT, cM, cM);
        tri(T0, M1, T1, cT, cM, cT);
        tri(M0, R0, P, cM, cR, cP);
        tri(M0, P, M1, cM, cP, cM);
        tri(M1, P, R1, cM, cP, cR);
      }
    }

    // 꼭대기 끝가지
    var spire = new T.ConeGeometry(0.07, 0.5, 7, 2);
    spire.applyMatrix4(new T.Matrix4().makeTranslation(0, L.TREE.height + 0.14, 0));
    var sg = spire.toNonIndexed();
    var sp = sg.attributes.position, sn = sg.attributes.normal;
    for (var k = 0; k < sp.count; k++) {
      pos.push(sp.getX(k), sp.getY(k), sp.getZ(k));
      nor.push(sn.getX(k), sn.getY(k), sn.getZ(k));
      cols.push(cMid.r * 0.7, cMid.g * 0.7, cMid.b * 0.7);
    }

    var g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
    g.setAttribute('color', new T.Float32BufferAttribute(cols, 3));
    g.computeBoundingSphere();
    return g;
  }

  /* 나무 속을 채우는 어두운 원뿔 */
  function buildCoreGeometry() {
    var pts = [];
    var steps = 24;
    for (var i = 0; i <= steps; i++) {
      var t = i / steps;
      var y = L.TREE.bottom - 0.35 + (L.TREE.height + 0.25 - (L.TREE.bottom - 0.35)) * t;
      var r = Math.max(0.04, L.radiusAt(y) * 0.58);
      pts.push(new T.Vector2(r, y));
    }
    return new T.LatheGeometry(pts, 28);
  }

  /* ── 4. 장식 지오메트리 ──────────────────────────────────────────────── */
  function starShape(outer, inner, points) {
    var s = new T.Shape();
    for (var i = 0; i < points * 2; i++) {
      var rr = i % 2 ? inner : outer;
      var a = -Math.PI / 2 + i * Math.PI / points;
      var x = Math.cos(a) * rr, y = Math.sin(a) * rr;
      if (i === 0) s.moveTo(x, y); else s.lineTo(x, y);
    }
    s.closePath();
    return s;
  }

  function mergeGeos(list) {
    var total = 0, prepared = [];
    list.forEach(function (item) {
      var g = item.geo.index ? item.geo.toNonIndexed() : item.geo;
      if (item.matrix) g.applyMatrix4(item.matrix);
      prepared.push(g);
      total += g.attributes.position.count;
    });
    var pos = new Float32Array(total * 3), nor = new Float32Array(total * 3);
    var off = 0;
    prepared.forEach(function (g) {
      pos.set(g.attributes.position.array, off * 3);
      if (g.attributes.normal) nor.set(g.attributes.normal.array, off * 3);
      off += g.attributes.position.count;
    });
    var out = new T.BufferGeometry();
    out.setAttribute('position', new T.BufferAttribute(pos, 3));
    out.setAttribute('normal', new T.BufferAttribute(nor, 3));
    out.computeBoundingSphere();
    return out;
  }

  function buildOrnamentGeometries() {
    var m = new T.Matrix4();

    // 공
    var ball = new T.SphereGeometry(0.205, 18, 13);

    // 별
    var star = new T.ExtrudeGeometry(starShape(0.24, 0.1, 5), {
      depth: 0.05, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 1
    });
    star.center();
    star.computeVertexNormals();

    // 종
    var bellProfile = [
      [0.02, -0.13], [0.07, -0.125], [0.115, -0.10], [0.15, -0.055],
      [0.168, 0.005], [0.172, 0.07], [0.155, 0.115], [0.10, 0.135], [0.045, 0.145], [0.012, 0.15]
    ].map(function (p) { return new T.Vector2(p[0], p[1]); });
    var bellBody = new T.LatheGeometry(bellProfile, 18);
    var clapper = new T.SphereGeometry(0.038, 10, 8);
    var bell = mergeGeos([
      { geo: bellBody },
      { geo: clapper, matrix: new T.Matrix4().makeTranslation(0, -0.15, 0) }
    ]);

    // 선물 상자 + 리본
    var box = new T.BoxGeometry(0.26, 0.22, 0.26);
    var stripA = new T.BoxGeometry(0.055, 0.23, 0.265);
    var stripB = new T.BoxGeometry(0.265, 0.23, 0.055);
    var knot = new T.SphereGeometry(0.045, 10, 8);
    var gift = mergeGeos([
      { geo: box },
      { geo: stripA },
      { geo: stripB },
      { geo: knot, matrix: new T.Matrix4().makeTranslation(0, 0.13, 0) }
    ]);

    // 리본 (매듭) — 고리 두 개 + 늘어뜨린 끝 + 중심 매듭
    var loop = new T.TorusGeometry(0.115, 0.032, 8, 16, Math.PI * 1.3);
    var tail = new T.TorusGeometry(0.05, 0.024, 6, 10, Math.PI * 1.1);
    var matL = new T.Matrix4().makeTranslation(-0.085, 0.015, 0)
      .multiply(new T.Matrix4().makeRotationY(0.25))
      .multiply(new T.Matrix4().makeRotationZ(0.75));
    var matR = new T.Matrix4().makeTranslation(0.085, 0.015, 0)
      .multiply(new T.Matrix4().makeRotationY(-0.25))
      .multiply(new T.Matrix4().makeRotationZ(Math.PI - 0.75));
    var matT = new T.Matrix4().makeTranslation(0.015, -0.115, 0.01)
      .multiply(new T.Matrix4().makeRotationZ(1.9));
    var ribbon = mergeGeos([
      { geo: loop, matrix: matL },
      { geo: loop, matrix: matR },
      { geo: tail, matrix: matT },
      { geo: knot, matrix: new T.Matrix4().makeScale(1.2, 1.2, 1.2) }
    ]);

    return { ball: ball, star: star, bell: bell, gift: gift, ribbon: ribbon };
  }

  function ornamentMaterial(type, hex) {
    var c = col(hex);
    var opt = {
      color: c,
      roughness: 0.35,
      metalness: 0.35,
      envMapIntensity: 1.15
    };
    if (type === 'ball' || type === 'bell' || type === 'star') {
      opt.metalness = 0.82;
      opt.roughness = 0.2;
      opt.envMapIntensity = 1.5;
      opt.emissive = c.clone().multiplyScalar(0.1);
    } else if (type === 'gift') {
      opt.metalness = 0.05;
      opt.roughness = 0.7;
      opt.emissive = c.clone().multiplyScalar(0.05);
    } else {
      opt.metalness = 0.25;
      opt.roughness = 0.45;
      opt.emissive = c.clone().multiplyScalar(0.06);
    }
    return new T.MeshStandardMaterial(opt);
  }

  /* ── 5. 씬 조립 ──────────────────────────────────────────────────────── */
  function addLights() {
    hemiLight = new T.HemisphereLight(0x2b4a6d, 0x07101b, 0.52);
    scene.add(hemiLight);

    keyLight = new T.DirectionalLight(0xcddfff, 0.7);
    keyLight.position.set(-8, 13, 7);
    scene.add(keyLight);

    var rim = new T.DirectionalLight(0xffcf94, 0.85);
    rim.position.set(6.5, 6.5, -9);
    scene.add(rim);

    var rim2 = new T.DirectionalLight(0x7fb6ff, 0.45);
    rim2.position.set(9, 4, 6);
    scene.add(rim2);

    innerLight = new T.PointLight(0xffab52, 0.25, 16, 2);
    innerLight.position.set(0, 3.0, 0);
    scene.add(innerLight);

    topperLight = new T.PointLight(0xffd88a, 0, 18, 2);
    topperLight.position.set(0, 9.9, 0);
    scene.add(topperLight);
  }

  function addSky() {
    var rand = rng(424242);

    // 별 (2겹)
    [1.7, 3.0].forEach(function (size, idx) {
      var n = idx === 0 ? 850 : 150;
      var pos = new Float32Array(n * 3), cols = new Float32Array(n * 3);
      for (var i = 0; i < n; i++) {
        var u = rand() * 2 - 1;
        var phi = rand() * Math.PI * 2;
        var r = 78 + rand() * 34;
        var y = Math.abs(u) * 0.94 + 0.06;
        var s = Math.sqrt(1 - y * y);
        pos[i * 3] = Math.cos(phi) * s * r;
        pos[i * 3 + 1] = y * r;
        pos[i * 3 + 2] = Math.sin(phi) * s * r;
        var warm = rand();
        var c = warm > 0.82 ? col('#ffe0ae') : (warm > 0.55 ? col('#cfe4ff') : col('#ffffff'));
        var b = 0.35 + rand() * 0.65;
        cols[i * 3] = c.r * b; cols[i * 3 + 1] = c.g * b; cols[i * 3 + 2] = c.b * b;
      }
      var g = new T.BufferGeometry();
      g.setAttribute('position', new T.BufferAttribute(pos, 3));
      g.setAttribute('color', new T.BufferAttribute(cols, 3));
      var m = new T.PointsMaterial({
        size: size, sizeAttenuation: false, vertexColors: true,
        transparent: true, opacity: 0.95, depthWrite: false,
        blending: T.AdditiveBlending, map: glowTexture(32, 0.05), fog: false
      });
      var p = new T.Points(g, m);
      p.frustumCulled = false;
      scene.add(p);
    });

    // 달
    var moonTex = glowTexture(256, 0.3);
    moonSprite = new T.Sprite(new T.SpriteMaterial({
      map: moonTex, color: col('#eaf2ff'), transparent: true, opacity: 0.7,
      blending: T.AdditiveBlending, depthWrite: false, fog: false
    }));
    moonSprite.position.set(-17, 17, -52);
    moonSprite.scale.setScalar(4.2);
    scene.add(moonSprite);

    var moonHalo = new T.Sprite(new T.SpriteMaterial({
      map: glowTexture(256, 0.02), color: col('#9fc4ff'), transparent: true, opacity: 0.22,
      blending: T.AdditiveBlending, depthWrite: false, fog: false
    }));
    moonHalo.position.copy(moonSprite.position);
    moonHalo.scale.setScalar(13);
    scene.add(moonHalo);
  }

  function addGround() {
    // 눈 설원 (가운데는 밝고 가장자리는 밤으로 사라짐)
    var size = 512;
    var c = makeCanvas(size), g = c.getContext('2d');
    var grd = g.createRadialGradient(size / 2, size / 2, size * 0.02, size / 2, size / 2, size / 2);
    grd.addColorStop(0, 'rgba(244,249,255,1)');
    grd.addColorStop(0.22, 'rgba(226,238,252,0.98)');
    grd.addColorStop(0.48, 'rgba(186,208,234,0.72)');
    grd.addColorStop(0.72, 'rgba(104,136,172,0.26)');
    grd.addColorStop(1, 'rgba(20,38,58,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, size, size);
    var tex = new T.CanvasTexture(c);
    tex.needsUpdate = true;
    tex.encoding = T.sRGBEncoding;

    var ground = new T.Mesh(
      new T.CircleGeometry(48, 72),
      new T.MeshStandardMaterial({
        map: tex, transparent: true, opacity: 1, roughness: 0.94, metalness: 0.0,
        color: col('#dce8f7'), depthWrite: true
      })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    scene.add(ground);

  }

  /* ── 5-b. 이름 명판이 붙은 우드 기단 ─────────────────────────────────── */
  /* "속초 효성해링턴"이 3D 화면에서도 또렷하게 읽히도록,
     기단(원형 우드 스테이지) 둘레 120° 간격으로 황금 명판 3개를 새깁니다.  */
  var PLINTH = { radius: 4.3, height: 1.42, top: 1.18 };

  function plateTexture() {
    var W = 2048, H = 256;
    var c = document.createElement('canvas');
    c.width = W; c.height = H;
    var g = c.getContext('2d');

    // 우드 바탕
    var bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#2b1d10');
    bg.addColorStop(0.45, '#1d130a');
    bg.addColorStop(1, '#100a05');
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);

    // 나뭇결
    var rand = rng(2026);
    g.globalAlpha = 0.16;
    for (var i = 0; i < 34; i++) {
      var y = rand() * H;
      g.strokeStyle = rand() > 0.5 ? '#5a3a1d' : '#0a0603';
      g.lineWidth = 0.6 + rand() * 2.2;
      g.beginPath();
      g.moveTo(0, y);
      g.bezierCurveTo(W * 0.33, y + (rand() - 0.5) * 18, W * 0.66, y + (rand() - 0.5) * 18, W, y + (rand() - 0.5) * 12);
      g.stroke();
    }
    g.globalAlpha = 1;

    // 황금 테두리
    g.strokeStyle = 'rgba(214,168,86,0.85)';
    g.lineWidth = 5;
    g.strokeRect(18, 18, W - 36, H - 36);
    g.strokeStyle = 'rgba(214,168,86,0.34)';
    g.lineWidth = 2;
    g.strokeRect(32, 32, W - 64, H - 64);

    // 제목 — 속초 효성해링턴
    var title = '속초 효성해링턴';
    var fontTitle = '700 148px "Noto Sans CJK KR", "Noto Sans KR", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif';
    g.font = fontTitle;
    g.textAlign = 'center';
    g.textBaseline = 'middle';

    var spacing = 18;
    var widths = [], total = 0;
    for (var t = 0; t < title.length; t++) {
      var w = g.measureText(title.charAt(t)).width;
      widths.push(w);
      total += w;
    }
    total += spacing * (title.length - 1);

    var goldGrad = g.createLinearGradient(0, 60, 0, 170);
    goldGrad.addColorStop(0, '#fff3cd');
    goldGrad.addColorStop(0.42, '#f7d489');
    goldGrad.addColorStop(0.72, '#d9a63f');
    goldGrad.addColorStop(1, '#f2c877');

    var x = W / 2 - total / 2;
    var yTitle = H * 0.42;
    // 글자 뒤 은은한 그림자
    g.shadowColor = 'rgba(0,0,0,0.85)';
    g.shadowBlur = 12;
    g.shadowOffsetY = 4;
    for (var k = 0; k < title.length; k++) {
      g.fillStyle = goldGrad;
      g.fillText(title.charAt(k), x + widths[k] / 2, yTitle);
      x += widths[k] + spacing;
    }
    g.shadowColor = 'transparent';
    g.shadowBlur = 0;
    g.shadowOffsetY = 0;

    // 부제
    var sub = '플레이스 · 2026';
    g.font = '500 40px "Noto Sans CJK KR", "Noto Sans KR", "Malgun Gothic", sans-serif';
    var subW = g.measureText(sub).width;
    var subSp = 6;
    var sx = W / 2 - (subW + subSp * (sub.length - 1)) / 2;
    g.fillStyle = 'rgba(240,214,160,0.78)';
    for (var s2 = 0; s2 < sub.length; s2++) {
      var ch = sub.charAt(s2);
      var cw = g.measureText(ch).width;
      g.fillText(ch, sx + cw / 2, H * 0.84);
      sx += cw + subSp;
    }

    // 좌우 장식 다이아몬드
    function diamond(cx, cy, r) {
      g.beginPath();
      g.moveTo(cx, cy - r);
      g.lineTo(cx + r * 0.62, cy);
      g.lineTo(cx, cy + r);
      g.lineTo(cx - r * 0.62, cy);
      g.closePath();
      g.fill();
    }
    g.fillStyle = 'rgba(226,182,96,0.8)';
    diamond(76, H * 0.44, 16);
    diamond(W - 76, H * 0.44, 16);

    var tex = new T.CanvasTexture(c);
    tex.needsUpdate = true;
    tex.encoding = T.sRGBEncoding;
    tex.anisotropy = 4;
    return tex;
  }

  function addPlinth() {
    var R = PLINTH.radius, H = PLINTH.height, top = PLINTH.top;

    // 우드 기단
    var wood = new T.Mesh(
      new T.CylinderGeometry(R, R * 1.012, H, 72, 1, false),
      new T.MeshStandardMaterial({ color: col('#2c1c11'), roughness: 0.7, metalness: 0.1 })
    );
    wood.position.y = top - H / 2;
    scene.add(wood);

    // 기단 위 눈
    var snowTop = new T.Mesh(
      new T.CircleGeometry(R * 0.998, 72),
      new T.MeshStandardMaterial({ color: col('#eaf3ff'), roughness: 0.93, metalness: 0 })
    );
    snowTop.rotation.x = -Math.PI / 2;
    snowTop.position.y = top + 0.004;
    scene.add(snowTop);

    // 황금 테두리
    var goldMat = new T.MeshStandardMaterial({
      color: col('#dcb057'), metalness: 0.95, roughness: 0.26,
      emissive: col('#4a3208'), envMapIntensity: 1.6
    });
    [top - 0.015, 0.045].forEach(function (y) {
      var ring = new T.Mesh(new T.TorusGeometry(R * 1.006, 0.032, 8, 110), goldMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = y;
      scene.add(ring);
    });

    // 황금 명판 3개 (120° 간격)
    var tex = plateTexture();
    var plateMat = new T.MeshStandardMaterial({
      map: tex, roughness: 0.44, metalness: 0.3,
      emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.5
    });
    var arc = 1.18;
    var plateH = 1.02;
    for (var k = 0; k < 4; k++) {
      var geo = new T.CylinderGeometry(R * 1.014, R * 1.014, plateH, 56, 1, true, -arc / 2, arc);
      var plate = new T.Mesh(geo, plateMat);
      plate.position.y = top - 0.14 - plateH / 2;
      var holder = new T.Group();
      holder.rotation.y = 0.62 + (k * Math.PI * 2) / 4;   // 첫 명판은 카메라 정면
      holder.add(plate);
      scene.add(holder);
      state.plates += 1;
    }

    // 기단 위 눈더미 (밑동 주변)
    var moundMat = new T.MeshStandardMaterial({ color: col('#edf4ff'), roughness: 0.9, metalness: 0 });
    var rand = rng(9091);
    for (var i = 0; i < 6; i++) {
      var a = (i / 6) * Math.PI * 2 + rand() * 0.6;
      var rad = 0.85 + rand() * 0.9;
      var s = new T.Mesh(new T.SphereGeometry(1, 14, 9), moundMat);
      s.position.set(Math.cos(a) * rad, top - 0.02, Math.sin(a) * rad);
      s.scale.set(0.8 + rand() * 0.7, 0.16 + rand() * 0.1, 0.7 + rand() * 0.6);
      scene.add(s);
    }
  }

  function addTree() {
    treeGroup = new T.Group();
    scene.add(treeGroup);

    treeGroup.position.y = PLINTH.top - L.TREE.bottom - 0.02;

    // 기둥
    var trunk = new T.Mesh(
      new T.CylinderGeometry(0.17, 0.3, 2.4, 12, 1),
      new T.MeshStandardMaterial({ color: col('#5c3a25'), roughness: 0.92, metalness: 0, flatShading: true })
    );
    trunk.position.y = 1.0;
    treeGroup.add(trunk);

    // 속을 채우는 어두운 원뿔 (가지 사이로 밤하늘이 비치지 않게)
    var core = new T.Mesh(buildCoreGeometry(), new T.MeshStandardMaterial({
      color: col('#07281a'), roughness: 0.95, metalness: 0, flatShading: true
    }));
    treeGroup.add(core);

    // 가지
    branchMesh = new T.Mesh(buildFirGeometry(), new T.MeshStandardMaterial({
      vertexColors: true, roughness: 0.78, metalness: 0.02,
      flatShading: true, side: T.DoubleSide
    }));
    treeGroup.add(branchMesh);

    // 탭 판정용 투명 프록시 (화면에 보이지 않음)
    var proxy = new T.Mesh(
      new T.ConeGeometry(3.45, 9.4, 10, 1, true),
      new T.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, side: T.DoubleSide })
    );
    proxy.position.y = 5.3;
    proxy.name = 'hitProxy';
    treeGroup.add(proxy);
    api._proxy = proxy;
  }

  function addOrnaments() {
    ornGroup = new T.Group();
    treeGroup.add(ornGroup);

    var geos = buildOrnamentGeometries();
    var matCache = {};

    var threadPos = new Float32Array(ornData.length * 6);

    ornData.forEach(function (o, i) {
      var g = new T.Group();
      g.position.set(o.x, o.y, o.z);
      g.visible = false;

      var matKey = o.type + o.color;
      if (!matCache[matKey]) matCache[matKey] = ornamentMaterial(o.type, o.color);
      var mesh = new T.Mesh(geos[o.type] || geos.ball, matCache[matKey]);
      var drop = 0.24 * o.scale + 0.04;
      mesh.position.y = -drop;
      mesh.rotation.y = o.angle;
      g.add(mesh);

      // 실 (한 번에 그리는 LineSegments 로 모읍니다)
      threadPos[i * 6] = o.x;
      threadPos[i * 6 + 1] = o.y + 0.04;
      threadPos[i * 6 + 2] = o.z;
      threadPos[i * 6 + 3] = o.x;
      threadPos[i * 6 + 4] = o.y - drop;
      threadPos[i * 6 + 5] = o.z;

      ornGroup.add(g);
      ornMeshes.push(g);
      ornGlowBase.push(0);
      ornGlowNow.push(0);
      g.userData = {
        mesh: mesh, drop: drop, linColor: col(o.color), phase: o.phase, baseY: o.y, index: i
      };
    });

    // 장식 실
    var tg = new T.BufferGeometry();
    tg.setAttribute('position', new T.BufferAttribute(threadPos, 3));
    tg.setDrawRange(0, 0);
    threadLines = new T.LineSegments(tg, new T.LineBasicMaterial({
      color: col('#9fc6b0'), transparent: true, opacity: 0.34, depthWrite: false
    }));
    threadLines.frustumCulled = false;
    treeGroup.add(threadLines);

    // 장식 글로우 (한 번에 그리는 Points)
    var gp = new Float32Array(ornData.length * 3), gc = new Float32Array(ornData.length * 3);
    ornData.forEach(function (o, i) {
      gp[i * 3] = o.x; gp[i * 3 + 1] = o.y - 0.24 * o.scale; gp[i * 3 + 2] = o.z;
    });
    var gg = new T.BufferGeometry();
    gg.setAttribute('position', new T.BufferAttribute(gp, 3));
    gg.setAttribute('color', new T.BufferAttribute(gc, 3));
    ornGlow = new T.Points(gg, new T.PointsMaterial({
      size: 0.5, sizeAttenuation: true, vertexColors: true,
      transparent: true, opacity: 0.9, depthWrite: false, map: glowTexture(64, 0.08),
      blending: T.AdditiveBlending, fog: false
    }));
    ornGlow.frustumCulled = false;
    treeGroup.add(ornGlow);
  }

  function addFairyLights() {
    var lights = L.lights;
    var lp = new Float32Array(lights.length * 3);
    lights.forEach(function (b, i) {
      lp[i * 3] = b.x; lp[i * 3 + 1] = b.y; lp[i * 3 + 2] = b.z;
      lightLevel.push(0);
    });

    var wirePts = lights.map(function (b) { return new T.Vector3(b.x, b.y, b.z); });
    var wireGeo = new T.BufferGeometry().setFromPoints(wirePts);
    lightWire = new T.Line(wireGeo, new T.LineBasicMaterial({
      color: col('#4d6b57'), transparent: true, opacity: 0.5
    }));
    treeGroup.add(lightWire);

    var coreGeo = new T.BufferGeometry();
    coreGeo.setAttribute('position', new T.BufferAttribute(lp.slice(), 3));
    coreGeo.setAttribute('color', new T.BufferAttribute(new Float32Array(lights.length * 3), 3));
    lightCore = new T.Points(coreGeo, new T.PointsMaterial({
      size: 0.095, sizeAttenuation: true, vertexColors: true,
      transparent: true, opacity: 1, depthWrite: false, map: glowTexture(48, 0.2),
      blending: T.AdditiveBlending, fog: false
    }));
    treeGroup.add(lightCore);

    var glowGeo = new T.BufferGeometry();
    glowGeo.setAttribute('position', new T.BufferAttribute(lp.slice(), 3));
    glowGeo.setAttribute('color', new T.BufferAttribute(new Float32Array(lights.length * 3), 3));
    lightGlow = new T.Points(glowGeo, new T.PointsMaterial({
      size: 0.58, sizeAttenuation: true, vertexColors: true,
      transparent: true, opacity: 0.7, depthWrite: false, depthTest: false,
      map: glowTexture(64, 0.05), blending: T.AdditiveBlending, fog: false
    }));
    lightGlow.renderOrder = 3;   // 가지에 가려도 빛무리는 번지도록 (블룸 느낌)
    treeGroup.add(lightGlow);
  }

  function addTopper() {
    topperGroup = new T.Group();
    topperGroup.position.set(0, L.TREE.height + 0.34, 0);
    topperGroup.visible = false;
    treeGroup.add(topperGroup);

    var starGeo = new T.ExtrudeGeometry(starShape(0.72, 0.3, 5), {
      depth: 0.16, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 1
    });
    starGeo.center();
    starGeo.computeVertexNormals();
    var gold = col('#f7c74a');
    var starMat = new T.MeshStandardMaterial({
      color: gold, metalness: 0.95, roughness: 0.16,
      emissive: gold.clone().multiplyScalar(0.35), envMapIntensity: 1.8
    });
    var starMesh = new T.Mesh(starGeo, starMat);
    topperGroup.add(starMesh);
    var starCross = new T.Mesh(starGeo, starMat);
    starCross.rotation.y = Math.PI / 2;
    starCross.scale.setScalar(0.92);
    topperGroup.add(starCross);
    api._topperStar = starMesh;

    topperFlare = new T.Sprite(new T.SpriteMaterial({
      map: flareTexture(256), color: col('#ffe7ac'), transparent: true,
      opacity: 0.55, blending: T.AdditiveBlending, depthWrite: false
    }));
    topperFlare.scale.setScalar(2.1);
    topperGroup.add(topperFlare);

    topperHalo = new T.Sprite(new T.SpriteMaterial({
      map: glowTexture(128, 0.04), color: col('#ffcf7a'), transparent: true,
      opacity: 0.45, blending: T.AdditiveBlending, depthWrite: false
    }));
    topperHalo.scale.setScalar(3.0);
    topperGroup.add(topperHalo);
  }

  function addAtmosphere() {
    // 나무 뒤 은은한 불빛
    glowBack = new T.Sprite(new T.SpriteMaterial({
      map: glowTexture(256, 0.02), color: col('#ffcf88'), transparent: true,
      opacity: 0.1, blending: T.AdditiveBlending, depthWrite: false, fog: false
    }));
    glowBack.position.set(0, 5.0, -4.2);
    glowBack.scale.setScalar(24);
    scene.add(glowBack);

    // 눈 위에 번지는 불빛 웅덩이
    lightPool = new T.Mesh(
      new T.CircleGeometry(8.5, 48),
      new T.MeshBasicMaterial({
        map: glowTexture(256, 0.02), color: col('#ffc978'), transparent: true,
        opacity: 0, blending: T.AdditiveBlending, depthWrite: false
      })
    );
    lightPool.rotation.x = -Math.PI / 2;
    lightPool.position.y = 0.03;
    scene.add(lightPool);
  }

  function addParticles() {
    // 탭 별빛
    var N = 620;
    var sp = new Float32Array(N * 3), sc = new Float32Array(N * 3);
    var sg = new T.BufferGeometry();
    sg.setAttribute('position', new T.BufferAttribute(sp, 3));
    sg.setAttribute('color', new T.BufferAttribute(sc, 3));
    sparks = new T.Points(sg, new T.PointsMaterial({
      size: 0.14, sizeAttenuation: true, vertexColors: true,
      transparent: true, opacity: 1, depthWrite: false, map: glowTexture(48, 0.14),
      blending: T.AdditiveBlending, fog: false
    }));
    sparks.frustumCulled = false;
    scene.add(sparks);
    api._sparks = {
      pos: sp, cols: sc, base: new Float32Array(N * 3),
      vel: new Float32Array(N * 3), life: new Float32Array(N), max: new Float32Array(N), n: 0, N: N
    };

    // 눈송이
    var S = 900;
    var np = new Float32Array(S * 3), nc = new Float32Array(S * 3);
    var nv = new Float32Array(S * 3), nw = new Float32Array(S);
    var rand = rng(31337);
    for (var i = 0; i < S; i++) {
      np[i * 3] = (rand() - 0.5) * 46;
      np[i * 3 + 1] = rand() * 26;
      np[i * 3 + 2] = (rand() - 0.5) * 40;
      nv[i * 3] = (rand() - 0.5) * 0.35;
      nv[i * 3 + 1] = -(0.5 + rand() * 0.85);
      nv[i * 3 + 2] = (rand() - 0.5) * 0.3;
      nw[i] = rand() * Math.PI * 2;
    }
    var ng = new T.BufferGeometry();
    ng.setAttribute('position', new T.BufferAttribute(np, 3));
    ng.setAttribute('color', new T.BufferAttribute(nc, 3));
    snow = new T.Points(ng, new T.PointsMaterial({
      size: 0.13, sizeAttenuation: true, vertexColors: true,
      transparent: true, opacity: 0.9, depthWrite: false, map: glowTexture(32, 0.1),
      blending: T.AdditiveBlending, fog: false
    }));
    snow.frustumCulled = false;
    scene.add(snow);
    api._snow = { pos: np, cols: nc, vel: nv, phase: nw, n: S, level: 0, target: 0.16 };
  }

  /* ── 6. 카메라 · 조작 ─────────────────────────────────────────────────── */
  var orbit = {
    theta: 0.62, phi: 1.38, radius: 16.4, targetRadius: 16.4,
    vTheta: 0, vPhi: 0, dragging: false, pointers: {}, pinchStart: 0, pinchRadius: 0,
    lastInteract: 0, moved: 0, downTime: 0, downX: 0, downY: 0
  };
  var CENTER = new T.Vector3(0, 5.15, 0);

  function applyCamera() {
    var sp = Math.sin(orbit.phi), cp = Math.cos(orbit.phi);
    camera.position.set(
      CENTER.x + orbit.radius * sp * Math.sin(orbit.theta),
      CENTER.y + orbit.radius * cp,
      CENTER.z + orbit.radius * sp * Math.cos(orbit.theta)
    );
    if (camera.position.y < 0.7) camera.position.y = 0.7;
    camera.lookAt(CENTER);
  }

  function fitCamera() {
    var aspect = camera.aspect || 1;
    var fovY = camera.fov * Math.PI / 180;
    var tanY = Math.tan(fovY / 2);
    var distH = (13.4 / 2) / tanY;
    var distW = (10.4 / 2) / (tanY * Math.max(0.45, aspect));
    var d = Math.max(distH, distW) * 1.02;

    orbit.radius = clamp(d, 12, 30);
    orbit.targetRadius = orbit.radius;
  }

  function bindControls() {
    var el = canvasEl;

    function onDown(ev) {
      el.setPointerCapture && el.setPointerCapture(ev.pointerId);
      orbit.pointers[ev.pointerId] = { x: ev.clientX, y: ev.clientY };
      var ids = Object.keys(orbit.pointers);
      if (ids.length === 1) {
        orbit.dragging = true;
        orbit.downX = ev.clientX; orbit.downY = ev.clientY;
        orbit.downTime = performance.now();
        orbit.moved = 0;
        orbit.vTheta = 0; orbit.vPhi = 0;
      } else if (ids.length === 2) {
        var a = orbit.pointers[ids[0]], b = orbit.pointers[ids[1]];
        orbit.pinchStart = Math.hypot(a.x - b.x, a.y - b.y);
        orbit.pinchRadius = orbit.targetRadius;
        orbit.dragging = false;
      }
      orbit.lastInteract = performance.now();
    }

    function onMove(ev) {
      var p = orbit.pointers[ev.pointerId];
      if (!p) return;
      var dx = ev.clientX - p.x, dy = ev.clientY - p.y;
      p.x = ev.clientX; p.y = ev.clientY;
      orbit.lastInteract = performance.now();

      var ids = Object.keys(orbit.pointers);
      if (ids.length >= 2) {
        var a = orbit.pointers[ids[0]], b = orbit.pointers[ids[1]];
        var dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (orbit.pinchStart > 0) {
          orbit.targetRadius = clamp(orbit.pinchRadius * (orbit.pinchStart / Math.max(1, dist)), 11, 26);
        }
        return;
      }

      if (!orbit.dragging) return;
      orbit.moved += Math.abs(dx) + Math.abs(dy);
      orbit.theta -= dx * 0.0062;
      orbit.phi = clamp(orbit.phi - dy * 0.005, 0.62, 1.62);
      orbit.vTheta = -dx * 0.0062;
      orbit.vPhi = -dy * 0.005;
    }

    function onUp(ev) {
      var wasSingle = Object.keys(orbit.pointers).length === 1;
      var p = orbit.pointers[ev.pointerId];
      delete orbit.pointers[ev.pointerId];

      if (wasSingle && p && orbit.moved < 14 && performance.now() - orbit.downTime < 600) {
        var rect = el.getBoundingClientRect();
        var x = ev.clientX - rect.left, y = ev.clientY - rect.top;
        raycastTap(x, y);
      }
      if (!Object.keys(orbit.pointers).length) {
        orbit.dragging = false;
        orbit.lastInteract = performance.now();
      }
    }

    el.addEventListener('pointerdown', onDown, { passive: true });
    el.addEventListener('pointermove', onMove, { passive: true });
    el.addEventListener('pointerup', onUp, { passive: true });
    el.addEventListener('pointercancel', function (ev) {
      delete orbit.pointers[ev.pointerId];
      if (!Object.keys(orbit.pointers).length) orbit.dragging = false;
    }, { passive: true });

    el.addEventListener('wheel', function (ev) {
      ev.preventDefault();
      orbit.targetRadius = clamp(orbit.targetRadius * (1 + ev.deltaY * 0.0012), 11, 26);
      orbit.lastInteract = performance.now();
    }, { passive: false });

    el.addEventListener('contextmenu', function (ev) { ev.preventDefault(); });
  }

  var raycaster = new T.Raycaster();
  var ndc = new T.Vector2();

  function raycastTap(x, y) {
    if (!ready) return;
    var rect = canvasEl.getBoundingClientRect();
    ndc.set((x / rect.width) * 2 - 1, -(y / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    var targets = [];
    if (api._proxy) targets.push(api._proxy);
    if (ornGroup) targets.push(ornGroup);
    var hits = raycaster.intersectObjects(targets, true);
    if (hits.length) {
      var p = hits[0].point.clone();
      burstWorld(p, 22);
      if (tapHandler) tapHandler(x, y, true);
    } else if (tapHandler) {
      tapHandler(x, y, false);
    }
  }

  /* ── 7. 파티클 ───────────────────────────────────────────────────────── */
  function burstWorld(point, count) {
    var S = api._sparks;
    if (!S) return;
    for (var i = 0; i < count; i++) {
      var idx = S.n % S.N; // 링 버퍼
      S.n += 1;
      var a = Math.random() * Math.PI * 2;
      var b = Math.random() * Math.PI - Math.PI / 2;
      var sp = 0.8 + Math.random() * 2.2;
      S.pos[idx * 3] = point.x + (Math.random() - 0.5) * 0.16;
      S.pos[idx * 3 + 1] = point.y + (Math.random() - 0.5) * 0.16;
      S.pos[idx * 3 + 2] = point.z + (Math.random() - 0.5) * 0.16;
      S.vel[idx * 3] = Math.cos(a) * Math.cos(b) * sp;
      S.vel[idx * 3 + 1] = Math.sin(b) * sp + 0.7;
      S.vel[idx * 3 + 2] = Math.sin(a) * Math.cos(b) * sp;
      S.life[idx] = 0;
      S.max[idx] = 0.75 + Math.random() * 0.85;
      var warm = Math.random() > 0.35;
      var c = warm ? col('#ffe3a6') : col('#d6ecff');
      var b = 0.85 + Math.random() * 0.75;
      S.base[idx * 3] = c.r * b; S.base[idx * 3 + 1] = c.g * b; S.base[idx * 3 + 2] = c.b * b;
      S.cols[idx * 3] = S.base[idx * 3];
      S.cols[idx * 3 + 1] = S.base[idx * 3 + 1];
      S.cols[idx * 3 + 2] = S.base[idx * 3 + 2];
    }
    sparks.geometry.attributes.position.needsUpdate = true;
    sparks.geometry.attributes.color.needsUpdate = true;
  }

  function updateSparks(dt) {
    var S = api._sparks;
    if (!S) return;
    var alive = false;
    for (var i = 0; i < S.N; i++) {
      if (S.max[i] <= 0) continue;
      S.life[i] += dt;
      var t = S.life[i] / S.max[i];
      if (t >= 1) {
        S.max[i] = 0;
        S.cols[i * 3] = S.cols[i * 3 + 1] = S.cols[i * 3 + 2] = 0;
        continue;
      }
      alive = true;
      S.vel[i * 3 + 1] -= 2.4 * dt;
      S.vel[i * 3] *= (1 - 1.6 * dt);
      S.vel[i * 3 + 2] *= (1 - 1.6 * dt);
      S.pos[i * 3] += S.vel[i * 3] * dt;
      S.pos[i * 3 + 1] += S.vel[i * 3 + 1] * dt;
      S.pos[i * 3 + 2] += S.vel[i * 3 + 2] * dt;
      // 밝기 감쇠는 색 곱으로 (AdditiveBlending → 검정 = 투명)
      var f = Math.pow(1 - t, 1.6);
      S.cols[i * 3] = S.base[i * 3] * f;
      S.cols[i * 3 + 1] = S.base[i * 3 + 1] * f;
      S.cols[i * 3 + 2] = S.base[i * 3 + 2] * f;
    }
    if (alive) {
      sparks.geometry.attributes.position.needsUpdate = true;
      sparks.geometry.attributes.color.needsUpdate = true;
    }
  }

  function updateSnow(dt) {
    var S = api._snow;
    if (!S) return;
    S.level += (S.target - S.level) * Math.min(1, dt * 1.6);
    var active = Math.round(90 + (S.n - 90) * clamp(S.level, 0, 1));
    for (var i = 0; i < S.n; i++) {
      var on = i < active;
      if (on) {
        S.phase[i] += dt * 1.6;
        S.pos[i * 3] += (S.vel[i * 3] + Math.sin(S.phase[i] * 1.4) * 0.22) * dt;
        S.pos[i * 3 + 1] += S.vel[i * 3 + 1] * dt * (0.7 + 0.5 * S.level);
        S.pos[i * 3 + 2] += S.vel[i * 3 + 2] * dt;
        if (S.pos[i * 3 + 1] < -0.2) {
          S.pos[i * 3 + 1] = 24 + Math.random() * 4;
          S.pos[i * 3] = (Math.random() - 0.5) * 46;
          S.pos[i * 3 + 2] = (Math.random() - 0.5) * 40;
        }
        var b = 0.55 + Math.sin(S.phase[i] * 2.1) * 0.25;
        S.cols[i * 3] = b * 0.92; S.cols[i * 3 + 1] = b * 0.96; S.cols[i * 3 + 2] = b;
      } else {
        S.cols[i * 3] = S.cols[i * 3 + 1] = S.cols[i * 3 + 2] = 0;
      }
    }
    snow.geometry.attributes.position.needsUpdate = true;
    snow.geometry.attributes.color.needsUpdate = true;
  }

  /* ── 8. 진행 반영 ────────────────────────────────────────────────────── */
  function ornamentCountFor(total) {
    if (total < 1) return 0;
    return Math.min(92, 1 + Math.floor(total / 10));
  }
  function stageFor(total) { return Math.max(0, Math.min(9, Math.floor(total / 100))); }

  function showOrnament(i, instant) {
    var g = ornMeshes[i];
    if (!g) return;
    g.visible = true;
    var o = ornData[i];
    ornGlowBase[i] = 0.72;
    if (instant) {
      g.scale.setScalar(1);
      ornGlowNow[i] = ornGlowBase[i];
    } else {
      g.scale.setScalar(0.01);
      ornGlowNow[i] = 0;
      popList.push({ i: i, t: 0, dur: 0.62 });
      var wp = new T.Vector3(o.x, o.y - 0.24 * o.scale, o.z);
      treeGroup.localToWorld(wp);
      burstWorld(wp, 16);
    }
  }

  function setProgress(total, opts) {
    opts = opts || {};
    if (!ready) return;
    var count = ornamentCountFor(total);
    var stage = stageFor(total);

    state.total = total;

    if (count < state.ornaments) {
      for (var k = count; k < ornMeshes.length; k++) {
        ornMeshes[k].visible = false;
        ornGlowBase[k] = 0;
        ornGlowNow[k] = 0;
        ornMeshes[k].scale.setScalar(1);
      }
      popList.length = 0;
    }
    for (var i = state.ornaments; i < count; i++) showOrnament(i, !!opts.instant);
    state.ornaments = count;

    threadLines.geometry.setDrawRange(0, count * 2);
    ornGlow.geometry.setDrawRange(0, count);

    state.stage = stage;
    for (var b = 0; b < lightLevel.length; b++) {
      if (opts.instant) lightLevel[b] = b < stage * L.lightPerStage ? 1 : 0;
    }

    innerLight.intensity = 0.16 + stage * 0.09;
    keyLight.intensity = 0.6 + stage * 0.022;
    hemiLight.intensity = 0.5 + stage * 0.008;
    glowBack.material.opacity = 0.1 + stage * 0.022;
    lightPool.material.opacity = stage * 0.035;
    lightWire.material.opacity = stage > 0 ? 0.5 : 0;

    var done = total >= 915;
    if (done && !state.topper) {
      state.topper = true;
      topperGroup.visible = true;
      topperGroup.scale.setScalar(opts.instant ? 1 : 0.01);
      if (opts.instant) topperGroup.scale.setScalar(1);
      else popList.push({ i: -1, t: 0, dur: 0.9 });
      topperLight.intensity = 1.5;
    } else if (!done && state.topper) {
      state.topper = false;
      topperGroup.visible = false;
      topperLight.intensity = 0;
    }
    if (opts.instant) topperGroup.scale.setScalar(1);
  }

  /* ── 9. 프레임 ───────────────────────────────────────────────────────── */
  function updateControls(dt) {
    var idle = performance.now() - orbit.lastInteract;
    if (!orbit.dragging && idle > 3200) {
      var ease = Math.min(1, (idle - 3200) / 1600);
      orbit.theta += 0.06 * dt * ease;
    }
    if (!orbit.dragging) {
      orbit.theta += orbit.vTheta;
      orbit.phi = clamp(orbit.phi + orbit.vPhi, 0.62, 1.62);
      orbit.vTheta *= 0.9;
      orbit.vPhi *= 0.9;
      if (Math.abs(orbit.vTheta) < 0.0002) orbit.vTheta = 0;
      if (Math.abs(orbit.vPhi) < 0.0002) orbit.vPhi = 0;
    }
    orbit.radius += (orbit.targetRadius - orbit.radius) * Math.min(1, dt * 6);
    applyCamera();
  }

  function updateOrnaments(dt) {
    for (var i = 0; i < popList.length; i++) {
      var p = popList[i];
      p.t += dt;
      var k = Math.min(1, p.t / p.dur);
      if (p.i === -1) {
        topperGroup.scale.setScalar(0.2 + 0.8 * easeOutBack(k));
      } else {
        var g = ornMeshes[p.i];
        if (g) g.scale.setScalar(0.14 + 0.86 * easeOutBack(k));
        ornGlowNow[p.i] = 0.72 * k;
      }
      if (k >= 1) popList.splice(i--, 1);
    }

    for (var j = 0; j < state.ornaments; j++) {
      var g2 = ornMeshes[j];
      if (!g2 || !g2.visible) continue;
      var d = g2.userData;
      g2.rotation.z = Math.sin(time * 0.85 + d.phase) * 0.05;
      g2.rotation.x = Math.cos(time * 0.72 + d.phase) * 0.035;
      if (ornGlowNow[j] !== ornGlowBase[j]) {
        ornGlowNow[j] += (ornGlowBase[j] - ornGlowNow[j]) * Math.min(1, dt * 4);
      }
    }

    var ca = ornGlow.geometry.attributes.color;
    for (var m = 0; m < state.ornaments; m++) {
      var lv = ornGlowNow[m];
      var lc = ornMeshes[m].userData.linColor;
      ca.array[m * 3] = lc.r * lv;
      ca.array[m * 3 + 1] = lc.g * lv;
      ca.array[m * 3 + 2] = lc.b * lv;
    }
    ca.needsUpdate = true;
  }

  function updateLights(dt) {
    var core = lightCore.geometry.attributes.color.array;
    var glow = lightGlow.geometry.attributes.color.array;
    var warm = COL_LIGHT_WARM, warm2 = COL_LIGHT_AMBER;
    var twinkle = 0.86;
    for (var i = 0; i < L.lights.length; i++) {
      var target = i < state.stage * L.lightPerStage ? 1 : 0;
      lightLevel[i] += (target - lightLevel[i]) * Math.min(1, dt * 8);
      var lv = lightLevel[i];
      if (lv < 0.004) { lv = 0; }
      var tw = lv > 0 ? twinkle + Math.sin(time * 2.2 + i * 1.7) * 0.14 : 0;
      core[i * 3] = warm.r * lv * tw;
      core[i * 3 + 1] = warm.g * lv * tw * 0.94;
      core[i * 3 + 2] = warm.b * lv * tw * 0.8;
      var g2 = lv * 0.55 * (0.85 + Math.sin(time * 1.6 + i * 2.1) * 0.15);
      glow[i * 3] = warm2.r * g2;
      glow[i * 3 + 1] = warm2.g * g2 * 0.9;
      glow[i * 3 + 2] = warm2.b * g2 * 0.72;
    }
    lightCore.geometry.attributes.color.needsUpdate = true;
    lightGlow.geometry.attributes.color.needsUpdate = true;

    if (state.topper) {
      topperGroup.rotation.y += dt * 0.55;
      var pulse = 0.82 + Math.sin(time * 1.9) * 0.18;
      topperFlare.material.opacity = 0.42 + pulse * 0.24;
      topperHalo.material.opacity = 0.34 + Math.sin(time * 1.5 + 1) * 0.1;
      topperFlare.material.rotation += dt * 0.2;
    }
    if (moonSprite) moonSprite.material.opacity = 0.78 + Math.sin(time * 0.6) * 0.06;
    glowBack.material.rotation += dt * 0.02;
  }

  function adaptQuality(dt) {
    quality.frames += 1;
    quality.acc += dt;
    if (quality.acc < 1.1) return;
    var fps = quality.frames / quality.acc;
    quality.fps = Math.round(fps);
    quality.frames = 0;
    quality.acc = 0;

    if (fps < 44) {
      quality.lows += 1; quality.his = 0;
      if (quality.lows >= 2 && quality.dpr > 1) {
        quality.dpr = Math.max(1, quality.dpr - 0.25);
        renderer.setPixelRatio(quality.dpr);
        resize();
        quality.lows = 0;
      }
    } else if (fps > 56) {
      quality.his += 1; quality.lows = 0;
      if (quality.his >= 5 && quality.dpr < quality.target) {
        quality.dpr = Math.min(quality.target, quality.dpr + 0.25);
        renderer.setPixelRatio(quality.dpr);
        resize();
        quality.his = 0;
      }
    }
  }

  function frame() {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    var now = performance.now();
    if (quality.minGapMs && now - quality.last < quality.minGapMs) return;
    quality.last = now;
    var dt = Math.min(0.06, clock.getDelta());
    time += dt;

    updateControls(dt);
    updateOrnaments(dt);
    updateLights(dt);
    updateSparks(dt);
    updateSnow(dt);
    renderer.render(scene, camera);
    adaptQuality(dt);
  }

  /* ── 10. 크기 ────────────────────────────────────────────────────────── */
  function resize() {
    if (!renderer || !hostEl) return;
    var w = hostEl.clientWidth || 1;
    var h = hostEl.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    // 크기가 바뀌면 드로잉 버퍼가 새로 만들어져 비므로, 멈춰 있으면 바로 한 번 그려 줍니다.
    if (!running && ready) renderer.render(scene, camera);
  }

  /* ── 11. 공개 API ────────────────────────────────────────────────────── */
  api.init = function (canvas, host, opts) {
    opts = opts || {};
    if (ready) return true;
    if (!T) return false;
    canvasEl = canvas;
    hostEl = host || canvas.parentNode;

    try {
      renderer = new T.WebGLRenderer({
        canvas: canvas, antialias: true, alpha: true,
        powerPreference: 'high-performance',
        preserveDrawingBuffer: !!opts.preserveDraw
      });
    } catch (e) {
      return false;
    }
    if (!renderer || !renderer.getContext()) return false;

    quality.minGapMs = opts.preserveDraw ? 55 : 0;   // 캡처 모드: 렌더 간격을 두어 CPU 양보
    quality.target = Math.min(window.devicePixelRatio || 1, 2);
    quality.dpr = quality.target;
    renderer.setPixelRatio(quality.dpr);
    renderer.outputEncoding = T.sRGBEncoding;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.16;
    renderer.setClearColor(0x000000, 0);

    scene = new T.Scene();
    scene.fog = new T.FogExp2(0x08131f, 0.0145);

    camera = new T.PerspectiveCamera(42, 1, 0.1, 260);
    camera.position.set(0, 7, 16);

    envMap = buildEnvMap();
    if (envMap) scene.environment = envMap;

    COL_LIGHT_WARM = col('#ffdd9c');
    COL_LIGHT_AMBER = col('#ffbe63');

    clock = new T.Clock();

    addLights();
    addSky();
    addGround();
    addPlinth();
    addTree();
    addOrnaments();
    addFairyLights();
    addTopper();
    addAtmosphere();
    addParticles();

    resize();
    fitCamera();
    applyCamera();
    bindControls();

    if (window.ResizeObserver) {
      new window.ResizeObserver(function () { resize(); }).observe(hostEl);
    }
    window.addEventListener('resize', function () { resize(); });
    window.addEventListener('orientationchange', function () {
      setTimeout(function () { resize(); }, 220);
    });

    ready = true;
    setProgress(0, { instant: true });

    running = true;
    frame();
    return true;
  };

  api.setProgress = setProgress;
  api.onTap = function (fn) { tapHandler = fn; };
  api.burstScreen = function (x, y) {
    // 화면 좌표 → 트리 앞 지점으로 별빛 (탭 피드백용 보조)
    var rect = canvasEl.getBoundingClientRect();
    ndc.set((x / rect.width) * 2 - 1, -(y / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    var hits = raycaster.intersectObject(api._proxy, false);
    var p = hits.length ? hits[0].point.clone() : CENTER.clone();
    burstWorld(p, 18);
  };
  api.setView = function (o) {
    o = o || {};
    if (typeof o.azimuth === 'number') { orbit.theta = o.azimuth; orbit.vTheta = 0; }
    if (typeof o.phi === 'number') orbit.phi = clamp(o.phi, 0.62, 1.62);
    if (typeof o.distance === 'number') { orbit.radius = o.distance; orbit.targetRadius = o.distance; }
    if (typeof o.shiftX === 'number') CENTER.x = o.shiftX;
    if (typeof o.shiftY === 'number') CENTER.y = o.shiftY;
    orbit.lastInteract = performance.now() + 1e9;   // 캡처용: 자동 회전 정지
    applyCamera();
  };
  api.setStorm = function (on) {
    if (api._snow) api._snow.target = on ? 1 : 0.16;
  };
  api.resize = function () {
    resize();
  };
  api.renderNow = function () {
    if (renderer) renderer.render(scene, camera);
  };
  api.pause = function () {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  };
  api.resume = function () {
    if (!ready || running) return;
    running = true;
    clock.getDelta();
    quality.last = 0;
    frame();
  };
  api.pixelStats = function () {
    if (!renderer) return null;
    renderer.render(scene, camera);
    var gl = renderer.getContext();
    var W = renderer.domElement.width, H = renderer.domElement.height;
    var buf = new Uint8Array(W * H * 4);
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    var step = Math.max(4, Math.floor(W / 140));
    var green = 0, bright = 0, opaque = 0, total = 0, mx = 0, sum = 0;
    for (var y = 0; y < H; y += step) {
      for (var x = 0; x < W; x += step) {
        var i = (y * W + x) * 4;
        var r = buf[i], g = buf[i + 1], b = buf[i + 2], a = buf[i + 3];
        total++;
        if (a > 200) opaque++;
        if (g > r + 6 && g > b + 3) green++;
        var m = Math.max(r, g, b);
        if (m > 45) bright++;
        if (m > mx) mx = m;
        sum += m;
      }
    }
    return { green: green, bright: bright, opaque: opaque, total: total, max: mx, mean: Math.round(sum / total) };
  };

  api.ornamentCount = function () { return state.ornaments; };
  api.ready = function () { return ready; };
  api.debug = function () {
    var lit = 0;
    for (var i = 0; i < lightLevel.length; i++) if (lightLevel[i] > 0.5) lit += 1;
    return {
      ornaments: state.ornaments,
      stage: state.stage,
      topper: state.topper,
      plates: state.plates,
      litBulbs: lit,
      snowLevel: api._snow ? api._snow.level : 0,
      lights: lightLevel.slice(0, 10).map(function (v) { return Math.round(v * 100) / 100; }),
      calls: renderer ? renderer.info.render.calls : 0,
      triangles: renderer ? renderer.info.render.triangles : 0,
      fps: quality.fps,
      dpr: quality.dpr,
      radius: orbit.radius,
      theta: orbit.theta
    };
  };

  return api;
})();
