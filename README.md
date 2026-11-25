# 🎄 속초 효성해링턴 크리스마스 트리 (915회 완성) · 3D

아파트 공식 네이버 카페에서 링크를 눌러 들어오는 **모바일 웹 이벤트**입니다.
설치할 앱도, 로그인도, 경품도 없습니다. 주민이 **카페 닉네임만 한 번** 적고 트리를 콕콕 누르면,
**915번째 손길**에서 트리가 완성됩니다.

| 항목 | 내용 |
| --- | --- |
| 대상 · 채널 | 속초 효성해링턴 플레이스 입주민 · 공식 네이버 카페 공지 링크 |
| 화면 | 모바일 세로 **390 × 844** 최적화 (스크롤 없음, 100dvh) |
| 완성 목표 | **915회** (카페 가입자 915명과 같은 숫자) |
| 장식 규칙 | 0회 민둥 트리 → **1회째 첫 장식** → 이후 **10회마다 1개** → 총 **92개** |
| 마일스톤 | 100 · 200 · 300 · 400 · 500 · 600 · 700 · 800 · 900회 (요정 전구가 8구씩 점등) |
| 완공 연출 | 꼭대기 3D 대형 별 점등 + 화면 전체 입체 눈송이 + 참여 주민 닉네임 목록 |
| 조작 | **끌어서 360° 회전**(수직 제한·감쇠), 두 손가락·휠로 확대, 가만히 두면 아주 천천히 자동 회전 |
| 참여 | 트리를 **짧게 탭**해야 집계 (끌어서 돌리는 동작과 구분) |
| 어뷰징 방지 | **1인 1일 5회**, 연속 터치 **3초 쿨타임** (서버에서도 강제) |
| 수집 정보 | **카페 닉네임 하나뿐** (동·호수·전화번호·이메일 없음) |

트리는 **Three.js(WebGL) 3D 씬**으로 그립니다. 백화점 포토존처럼
다층 소나무 + 눈 덮인 설원 + 밤하늘 별·달 + 은은한 림라이트로 구성되고,
기단(원형 우드 스테이지)에는 **“속초 효성해링턴” 황금 명판**이 90° 간격으로 4개 붙어 있어
어느 방향에서 돌려 봐도 아파트 이름이 보입니다.

---

## 1. 파일 구성

```
christmas-tree-event/
├── index.html            화면 구조 (3D 캔버스 · 진행 카드 · 시트 · 테스트 바)
├── styles.css            디자인 (밤하늘 · 카드 · 애니메이션)
├── app.js                참여 규칙 · 저장 · 소리 · 시트 · 완공 처리
├── scene3d.js            Three.js 3D 씬 (나무·장식·전구·눈·별·명판·카메라 조작)
├── tree-layout.js        3D 장식 92개 / 요정 전구 72구의 좌표 (결정론적 고정값)
├── tree-data.js          (참고) 2D SVG 시절 장식 좌표 — 3D에서는 쓰지 않습니다
├── supabaseClient.js     백엔드 모듈 (Supabase / 로컬 시뮬레이션 자동 전환)
├── supabase_schema.sql   Supabase 테이블 · RPC · 보안 정책 (SQL 편집기에 붙여넣기)
├── vendor/
│   └── three.min.js      Three.js r149 (로컬 번들 · 외부 CDN 요청 0건)
├── assets/og-tree.png    카페 링크 미리보기용 이미지 (1200×630)
└── make-og.py            og-tree.png 재생성 스크립트 (3D 렌더 + 제목 합성)
```

> 헤드리스 검증 스크립트(`verify.py`)와 검증 스크린샷(`preview/`)은 로컬 확인용이라
> 저장소에는 올리지 않습니다(`.gitignore`). 오리지널 폴더에는 그대로 있습니다.

**외부 CDN·폰트 파일이 하나도 없습니다.** Three.js도 `vendor/`에 직접 넣어 두었으므로
네이버 카페 인앱 브라우저에서도 외부 요청 없이 즉시 뜹니다.
소리도 Web Audio로 즉석 합성하므로 음원 파일이 없습니다.

---

## 2. 바로 확인하기

```bash
cd christmas-tree-event
python3 -m http.server 8000
# 폰/PC 브라우저에서 http://localhost:8000/index.html?test=1
```

> `index.html` 파일을 더블클릭해도 되지만, 카카오톡·네이버 인앱 브라우저와 똑같은 조건으로 보려면
> 위처럼 로컬 서버로 여는 편이 정확합니다.

### 🧪 테스트 바 (`?test=1`)

주소 끝에 **`?test=1`** 을 붙였을 때만 화면 아래에 나타납니다. (일반 주민에게는 보이지 않습니다)

| 버튼 | 동작 |
| --- | --- |
| `+1` | 1회 추가 |
| `+10` | 10회 추가 (장식 1개) |
| `100회` | 100회 상태로 점프 (장식 11개 · 전구 1단 점등) |
| `500회` | 500회 상태로 점프 (장식 51개 · 전구 5단 점등) |
| `915 완공` | 완공 연출 (장식 92개 · 꼭대기 별 · 눈 · 참여자 목록) |
| `초기화` | 이 기기의 진행 상황을 0으로 |
| `−` | 테스트 바 접기 (오른쪽 아래 🧪 로 다시 열기) |

테스트 바로 점프할 때는 1일 5회·3초 쿨타임이 적용되지 않습니다.
(Supabase 키를 넣어 **실서버 모드**가 되면 테스트 바는 자동으로 숨겨집니다 — 공용 기록을 흉내 낼 수 없기 때문입니다.)
완공 화면의 `샘플·...` 닉네임은 **미리보기용 가짜 참여자**이며, 화면에도 "테스트 모드"라고 표시됩니다.

---

## 3. 3D 씬 구성 (`scene3d.js`)

| 요소 | 구현 |
| --- | --- |
| 소나무 | 겹겹이 포개진 **12층 원뿔 가지**(층마다 들쭉날쭉한 가지 끝) + 나무 기둥 + 속을 채우는 어두운 원뿔 · 약 1만 폴리곤 |
| 설원 | 반경 48의 눈밭(가장자리로 갈수록 밤으로 사라지는 방사형 캔버스 텍스처) + 눈더미 |
| 기단 · 명판 | 반경 4.3 우드 스테이지 + 황금 테두리 + **“속초 효성해링턴” 명판 4개**(90° 간격, CanvasTexture + emissive) |
| 장식 92개 | 황금각(137.5°) 나선으로 360° 배치 · 메탈릭 볼 / 황금 별 / 종 / 선물 상자 / 리본 · 환경맵 반사 + 발광 헤일로 |
| 요정 전구 | 나무를 감는 나선 72구(9단계 × 8구) · 100회 단위로 한 단씩 점등, 은은한 트윙클 |
| 꼭대기 별 | 915회에 점등되는 입체 황금 별 2장(십자) + 플레어 + 회전 |
| 밤하늘 | 별 1,000개(2겹) · 달 + 헤일로 · FogExp2 안개 · 은은한 뒤편 불빛 |
| 눈 | 3D 눈송이 900개(평소 90개, 완공 시 화면 전체로 확산) |
| 탭 반응 | 누른 지점에서 3D 별빛 파티클 22개 + 징글 |
| 조작 | 직접 만든 오빗 컨트롤러 — 수직각 0.62~1.62 rad 제한, 관성 감쇠, 3.2초 뒤 자동 회전 재개, 핀치/휠 줌 |

### 성능

- 픽셀비율 `Math.min(devicePixelRatio, 2)` 로 시작해, 프레임이 44fps 아래로 떨어지면 자동으로 1.0까지 낮춥니다(적응형 화질).
- 장식은 재질·지오메트리를 공유하고, 실·글로우는 각각 1번의 그리기 호출(LineSegments / Points)로 모았습니다.
- 완공(장식 92개) 기준 **약 45,000 폴리곤 · 127 draw call**. 390×844 화면에서 가볍게 돕니다.
- `?test=1` 로 열면 캡처가 안정하도록 `preserveDrawingBuffer` 를 켭니다(그림은 동일).

---

## 4. Supabase 연결 (실제 공동 누적)

키를 비워 두면 **로컬 시뮬레이션 모드**로 동작합니다(같은 기기 안에서만 누적).
아래 5단계만 하면 주민 모두가 하나의 트리를 함께 채우는 **실서버 모드**로 자동 전환됩니다.

1. <https://supabase.com> 가입 → **New project** (무료 티어, 리전은 `Northeast Asia (Seoul)` 권장)
2. 왼쪽 **SQL Editor** → `supabase_schema.sql` 내용을 통째로 붙여넣고 **RUN**
3. **Project Settings → API** 에서 두 값을 복사
   - `Project URL` (예: `https://abcdefghijkl.supabase.co`)
   - `anon` `public` 키
4. `supabaseClient.js` 맨 위 `CONFIG` 에 붙여넣기

   ```js
   const CONFIG = {
     SUPABASE_URL: 'https://abcdefghijkl.supabase.co',
     SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9....',
     ...
   };
   ```

5. 새로고침 → 콘솔에서 `window.TreeBackend.mode` 가 `'remote'` 인지 확인

### 무엇이 서버에서 강제되나

- `tree_tap(nickname, client_id)` 함수 하나로만 기록됩니다.
  - 같은 기기(`client_id`)가 **하루 5회**를 넘으면 거절
  - 같은 기기의 마지막 기록에서 **3초**가 안 지났으면 거절(남은 ms 반환)
  - 총합이 목표(915)에 닿으면 그 뒤로는 기록하지 않음
- 테이블에는 **RLS가 켜져 있고 정책이 없습니다.** anon 키로는 `select`도 `insert`도 불가능하고,
  위 두 함수(SECURITY DEFINER)만 실행할 수 있습니다.
- 날짜는 **한국 시간(Asia/Seoul)** 기준으로 잘립니다. (자정에 하루 제한이 초기화)

### 운영 명령 (SQL Editor)

```sql
-- 이벤트 초기화
truncate table public.tree_taps restart identity;

-- 목표 · 제한 바꾸기
update public.tree_config set target_clicks = 915, daily_limit = 5, cooldown_seconds = 3 where id = 1;

-- 오늘 참여 현황
select * from public.tree_daily limit 7;

-- 특정 닉네임 기록 삭제 (부정 참여 정리)
delete from public.tree_taps where nickname = '닉네임';
```

> 앱은 **12초마다** 새로 읽어 다른 주민이 단 장식을 반영합니다(화면 복귀 시 즉시 갱신).
> 더 즉각적인 반응이 필요하면 `supabase_schema.sql` 맨 아래 리얼타임 주석을 풀고
> `supabaseClient.js` 의 `subscribe()` 만 supabase-js 채널로 바꾸면 됩니다.

---

## 5. GitHub Pages 배포 (무료) · 배포 완료

배포 주소: **<https://sisday-dev.github.io/christmas-tree-event/>**
(저장소: <https://github.com/sisday-dev/christmas-tree-event> · `main` / `/ (root)`)

1. GitHub에 새 저장소를 만듭니다. (예: `christmas-tree`)
2. 이 폴더의 파일을 **저장소 루트**에 그대로 올립니다. (`index.html` 이 루트에 오도록)
   `vendor/three.min.js`(약 600KB)도 함께 올려야 3D가 뜹니다.
   ```bash
   git init && git add . && git commit -m "christmas tree event 3d"
   git branch -M main
   git remote add origin https://github.com/<아이디>/christmas-tree.git
   git push -u origin main
   ```
3. 저장소 **Settings → Pages** → Source: `Deploy from a branch` → Branch: `main` / `/ (root)` → **Save**
4. 1~2분 뒤 `https://<아이디>.github.io/christmas-tree/` 로 열립니다.

### 배포 후 꼭 할 일

- ✅ `index.html` 의 `og:url` · `og:image` 는 **전체 주소**로 넣어 두었습니다.
  ```html
  <meta property="og:url" content="https://sisday-dev.github.io/christmas-tree-event/" />
  <meta property="og:image" content="https://sisday-dev.github.io/christmas-tree-event/assets/og-tree.png" />
  ```
  (상대 경로는 카페·카톡 미리보기에서 이미지가 안 뜰 수 있습니다.)
- 카페에 올릴 주소는 **`?test=1` 없는 주소**입니다.
- 폰에서 링크를 열어 **3D 회전**, **소리(첫 터치)**, **3초 쿨타임**, **5회 제한**을 한 번씩 확인하세요.
- 구형 기기에서 3D가 안 뜨면 안내 문구가 뜨고, 화면을 눌러 참여는 계속됩니다.

---

## 6. 카페 공지 · 운영 팁

- **오픈 당일 공지 고정**: "링크 누르고 닉네임만 적으면 끝, 하루 5번까지"를 첫 줄에.
- **돌려 보는 재미**를 한 줄 넣으세요: "트리를 손가락으로 돌려 볼 수 있어요."
- **하루 3번 정도 현황 스크린샷**을 공지 댓글로 올리면 참여율이 크게 올라갑니다(트리가 눈에 보이니까요).
- **100회 달성 시점**에 "벌써 불이 들어왔어요" 한 번 더 공지 → 초반 점화.
- **미달 대비**: 12/23~24에 목표에 못 미쳐도 **날짜 고정 점등식**으로 마무리한다는 안내를 미리 넣어 두면
  "안 되면 어쩌지" 불안이 줄어듭니다.
- 완공 화면을 캡처해 **카페 대문/공지**에 올리면 다음 이벤트의 참여 기반이 됩니다.

---

## 7. 숫자·문구 바꾸는 곳

| 바꾸고 싶은 것 | 파일 | 위치 |
| --- | --- | --- |
| 아파트 이름(헤더) | `index.html` | `.brand-kicker` 문구 |
| 아파트 이름(3D 명판) | `scene3d.js` | `plateTexture()` 의 `title` · `sub` |
| 완성 목표(915) | `app.js` `CFG.target`, `index.html` `#goalNum`·`aria-valuemax`, `supabase_schema.sql` `target_clicks` | 4곳 함께 |
| 1일 제한 · 쿨타임 | `app.js` `CFG.dailyLimit`·`CFG.cooldownMs`, `supabase_schema.sql` `daily_limit`·`cooldown_seconds` | 함께 |
| 나무 크기·비율 | `tree-layout.js` `TREE.height`·`radius`·`taper` | 3D 나무·장식 좌표가 함께 바뀜 |
| 장식 개수 · 위치 | `tree-layout.js` `buildOrnaments()` (92개 고정), `app.js` `CFG.maxOrnaments` | 목표 ÷ 10 + 1 |
| 안내 문구 | `app.js` `noteFor()` / `index.html` `#hint` | — |

> 목표를 915가 아닌 다른 수로 바꿀 때는 **장식 개수 = 1 + ⌊목표/10⌋** 이 되도록
> `tree-layout.js` 의 장식 개수(`n = 92`)와 `app.js` `CFG.maxOrnaments` 를 함께 고쳐야 합니다.

---

## 8. 개인정보 · 어뷰징

- 저장하는 값: **카페 닉네임(최대 12자)**, 기기 식별용 임의 문자열, 누른 시각. 그 외 없음.
- 닉네임은 브라우저 `localStorage` + `Cookie`(180일) 두 곳에 저장해, 시크릿 모드·저장소 초기화에도
  다시 입력하지 않도록 했습니다. **동·호수는 처음부터 받지 않습니다.**
- 경품·추첨이 없으므로 당첨자 확인용 개인정보 수집도 없습니다.
- 부정 참여는 서버에서 `client_id` 기준으로 막습니다. (기기를 바꾸면 새 참여자로 계산됩니다 —
  가족이 각자 참여하는 것은 막지 않기 위한 의도적인 선택입니다.)

---

## 9. 알려진 한계

- 키를 넣지 않은 **로컬 모드**에서는 진행 상황이 그 기기에만 쌓입니다(데모용).
- 다른 주민의 참여 반영은 **12초 폴링**입니다(실시간 스트리밍 아님).
- 3D(WebGL)를 지원하지 않는 아주 오래된 브라우저에서는 안내 문구가 뜨고, 화면을 눌러 참여만 됩니다.
- iOS 사파리·네이버 인앱 브라우저는 **첫 터치 전까지 소리를 막습니다** — 첫 터치에서 자동으로 열립니다.
- `prefers-reduced-motion` 설정을 켠 사용자에게는 팝·반짝임 애니메이션을 줄입니다.

---

## 10. 검증

```bash
python3 verify.py        # 필요: playwright + chromium (WebGL), Pillow
python3 make-og.py       # 필요: playwright + Pillow (og-tree.png 재생성)
```

`verify.py` 가 확인하는 것

- WebGL 3D 씬이 **실제로 그려졌는지** — GL 픽셀(초록·발광 비율)과 저장된 스크린샷 픽셀을 함께 검사
- 콘솔 오류 0건, 외부 도메인 요청 0건, `vendor/three.min.js` 로컬 로드 확인
- 0회 민둥 트리 → 1회 첫 장식 → 100회(장식 11개·전구 8구) → 915회(장식 92개·별·눈·참여자 목록)
- 장식 92개가 3D 나무 표면 안쪽에 서로 겹치지 않게 있는지 · 요정 전구 72구 · “속초 효성해링턴” 명판 4개
- 3초 쿨타임 / 1일 5회 제한 / **드래그는 집계되지 않고 짧은 탭만 집계**
- 닉네임·음소거·진행 상황 저장(새로고침·쿠키 백업), `?test=1` 없이는 테스트 바가 보이지 않는지
- 스크린샷은 `preview/` 에 저장됩니다: `3d-0-bare.png`, `3d-1-first-ornament.png`,
  `3d-100-milestone.png`, `3d-915-complete.png`, `3d-915-sheet.png`, `3d-desktop-1280.png`
