# 상담원 포털 UI 리디자인 스펙

**날짜**: 2026-04-20  
**범위**: `apps/web` — FullShell, MiniShell 및 공통 컴포넌트  
**상태**: 승인됨

---

## 1. 디자인 결정 사항

| 항목 | 결정 |
|------|------|
| 테마 | 다크 프로 (배경 `#0d1117`, 패널 `#161b22`) |
| 액센트 컬러 | 에메랄드 `#34d399` / `#059669` |
| 사이드바 | 아이콘 전용 (56px, 툴팁) |
| 폰트 | Inter (현행 유지) |
| 기반 프레임워크 | Tailwind CSS + CSS 변수 (현행 유지) |

---

## 2. 컬러 시스템

```css
/* 배경 계층 */
--bg-base:       #010409;   /* 사이드바, 탑바 */
--bg-surface:    #0d1117;   /* 메인 영역 */
--bg-elevated:   #161b22;   /* 카드, 패널 */
--bg-raised:     #21262d;   /* 버튼, 입력 */

/* 테두리 */
--border-subtle: #21262d;
--border-dim:    #30363d;

/* 텍스트 */
--text-primary:  #e6edf3;
--text-secondary:#8b949e;
--text-muted:    #484f58;

/* 액센트 (에메랄드) */
--accent:        #34d399;
--accent-strong: #059669;
--accent-dim:    rgba(52,211,153,0.12);
--accent-border: rgba(52,211,153,0.25);
--accent-glow:   rgba(52,211,153,0.35);

/* 상태 색상 */
--status-talking: #34d399;   /* 에메랄드 — 통화 중 */
--status-ringing: #d29922;   /* 앰버 — 벨 울림 */
--status-queued:  #8b949e;   /* 그레이 — 대기열 */
--status-danger:  #f85149;   /* 레드 — 종료/오류 */

/* 미니 콜카드 그라디언트 */
--mini-card-from: #052e1a;
--mini-card-to:   #041a0f;
```

---

## 3. Full 모드 레이아웃

```
┌─────────────────────────────────────────────────────────┐
│ TopBar (46px): 페이지 제목 | 상태 배지 | 에이전트 | 미니 전환 │
├────┬──────────────────┬───────────────────────┬──────────┤
│    │  CallListPanel   │     WorkPanel          │ KpiPanel │
│ S  │  (240px)         │     (flex-1)           │ (170px)  │
│ i  │                  │                        │          │
│ d  │  - 검색박스        │  - Hero 콜 카드         │ - 4개    │
│ e  │  - 필터 칩         │  - 컨트롤 버튼 행        │   KPI    │
│ b  │  - 콜 카드 목록    │  - 탭(메모/제어/가이드)  │   아이템  │
│ a  │                  │  - 폼 영역              │          │
│ r  │                  │                        │          │
│    │                  │                        │          │
└────┴──────────────────┴───────────────────────┴──────────┘
```

### 3.1 사이드바 (56px)

- 배경: `--bg-base`
- 상단: 에메랄드 그라디언트 로고 (30×30px, glow 효과)
- 네비 아이콘: 40×40px 클릭 영역, hover/active 상태
- 액티브 인디케이터: 좌측 3px 에메랄드 바 + dim 배경
- 하단: 테마 토글 버튼, 아바타 (이니셜)
- 툴팁: 호버 시 메뉴명 표시

**네비게이션 항목 (기존 4개 유지)**:

| key | Material Symbol 아이콘 | 툴팁 |
|-----|----------------------|------|
| `overview` | `dashboard` | 개요 |
| `call` | `headset_mic` | 콜 센터 |
| `queues` | `stacked_line_chart` | 큐 현황 |
| `history` | `history` | 이력 |

**섹션 전환 모델 변경**: 기존 `fullSection` 스위칭 패턴을 유지하되, 레이아웃은 **항상 4열을 렌더**함. `CallListPanel`과 `KpiPanel`은 항상 표시되며, `WorkPanel` 내부 콘텐츠만 `fullSection` 값에 따라 전환됨. `useUiStore.fullSection` 상태는 그대로 유지.

### 3.2 TopBar (46px)

- 배경: `--bg-base`, 하단 border
- 좌: 페이지 제목 (font-weight 600)
- 중: 상태 배지 — 에메랄드 pill, 점멸 dot, 드롭다운 화살표
- 우: 에이전트 이름·내선 (secondary text), 미니 모드 전환 chip

### 3.3 CallListPanel (240px)

- 패널 헤더: "활성 통화" 레이블 + 에메랄드 카운트 배지
- 검색박스: `--bg-elevated`, 아이콘 + placeholder
- 필터 칩: 전체 / 통화 중 / 대기열 (액티브 칩은 에메랄드 테두리)
- 콜 카드:
  - 기본: `--bg-elevated`, `--border-subtle`
  - 선택됨: 에메랄드 테두리 + `--accent-dim` 배경
  - 상태 레이블: 한글 텍스트 (통화 중 / 벨 울림 / 대기열) + 색상 구분
  - 우측: 경과 시간 (monospace)

### 3.4 WorkPanel

**Hero 콜 카드**
- 그라디언트 배경 (`#0d2818` → `#0a1f14`), 에메랄드 border
- 고객 아바타 (44×44px, 에메랄드 tint)
- 고객명 + 번호/큐 서브텍스트
- 에메랄드 타이머 (28px bold, glow text-shadow)

**컨트롤 버튼 행**
- `당겨받기`: 에메랄드 채움 버튼
- 음소거 / 보류 / 전환: `--bg-elevated` 아이콘 버튼 (36×36px)
- `종료`: 레드 텍스트 + 미묘한 레드 border

**탭 영역**
- 탭: 메모/후처리 · 제어 · 상담 가이드
- 액티브 탭: 에메랄드 하단 border + 에메랄드 텍스트
- 폼 필드: `--bg-elevated` 배경, focus 시 에메랄드 border
- 저장 버튼: 에메랄드 반투명 배경

### 3.5 KpiPanel (170px)

- 4개 KPI 아이템 (카드형)
- 값 (18px bold), 레이블, 델타 (상승=에메랄드, 하락=레드, 경고=앰버)

---

## 4. Mini 모드 레이아웃 (420px 고정 너비)

```
┌───────────────────────────────┐
│  Header                       │
│  ├ 로고 + 에이전트 정보          │
│  └ 상태 배지 (드롭다운)          │
├───────────────────────────────┤
│  요약 그리드 (3열: 상태/통화/큐) │
├───────────────────────────────┤
│  Active Call Card (그라디언트)  │
│  ├ 고객 아바타 + 이름 + 번호     │
│  └ 통화시간(파형) + 전환상태      │
├───────────────────────────────┤
│  빠른 제어 (2×2 그리드)         │
│  음소거 / 보류 / 전환 / 종료     │
├───────────────────────────────┤
│  메모 및 후처리                 │
│  결과코드 / 전환내선 / 메모 / 저장│
└───────────────────────────────┘
```

### 4.1 Mini 헤더

- 배경: `--bg-base`
- 에메랄드 그라디언트 로고 (36×36px, 10px 반경)
- 브랜드명 (에메랄드, uppercase, wide letter-spacing)
- 에이전트명 + 서브텍스트
- 우측 버튼: 테마, 전체 모드 전환, 로그아웃 (레드 tint)
- 상태 배지: 에메랄드 pill (현행과 동일한 드롭다운)

### 4.2 요약 그리드

- 3열, 각 카드 `--bg-elevated` + `--border-subtle`
- 9px 반경
- 레이블 + 값 (bold)

### 4.3 Active Call Card

- 그라디언트: `--mini-card-from` → `--mini-card-to`
- 에메랄드 border (`--accent-border`)
- 의사 요소 glow: `::before` (좌상), `::after` (우하)
- 2열 stats 그리드:
  - 통화시간: 타이머 + 파형 애니메이션 (4개 바, staggered)
  - 전환상태: 텍스트

### 4.4 빠른 제어

- 2×2 그리드, 각 버튼 min-height 70px
- 아이콘 상단 + 레이블 하단 (uppercase bold)
- 종료: 레드 tint (`--status-danger`)

### 4.5 메모 및 후처리

- 배경: `--bg-elevated`
- 결과코드 / 전환내선: 2열 그리드
- 메모 textarea: 4행
- 저장 버튼: 에메랄드 그라디언트, 전체 너비

---

## 5. 애니메이션

| 항목 | 스펙 |
|------|------|
| 상태 dot 점멸 | `pulse` 2s infinite (opacity 1→0.45→1) |
| 파형 바 | `waveform` 0.8s ease-in-out infinite, 4개 바 0.15s 간격 stagger |
| 버튼 hover | `transition: all 150ms` |
| 카드 hover | `border-color` transition |

### 5.1 키프레임 정의 (`styles/index.css` 수정)

```css
/* pulse — 신규 추가 (기존 pulse-green / pulse-red 는 유지) */
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.45; }
}

/* waveform — 기존 정의 교체 (styles/index.css 205–213행)
   기존: 4px→16px, 신규: 3px→12px (Mini 카드 크기에 맞게 조정) */
@keyframes waveform {
  0%, 100% { height: 3px; }
  50%       { height: 12px; }
}
/* 사용: animation: waveform 0.8s ease-in-out infinite;
   4개 바에 각각 animation-delay: 0s, 0.15s, 0.30s, 0.45s
   주의: waveform-bar 클래스는 <div> 요소에 적용 (::before/::after 에 적용 시
   global transition 규칙과 충돌하여 높이가 ease 처리될 수 있음) */
```

---

## 6. CSS 변수 교체 전략

**전략: 별칭 유지 방식** — `styles/index.css`의 `[data-theme='dark']` 블록에 있는 기존 `--color-*` 토큰 값을 새 RGB 값으로 교체. `tailwind.config.js`의 `colorToken()` 헬퍼는 `rgb(var(--color-*) / <alpha-value>)` 합성을 사용하므로 값은 반드시 **공백 구분 RGB 3값** 형식이어야 함. 기존 TSX의 Tailwind 클래스(`bg-surface-container-lowest`, `text-on-surface` 등)는 수정 없이 새 색상을 자동 적용받음. 새 별칭 변수(`--bg-base` 등)는 신규 컴포넌트의 `style={}` 속성에서만 사용하므로 hex 형식 유지.

### `--color-*` 토큰 → 새 값 전체 매핑

```css
/* styles/index.css — [data-theme='dark'] 블록 교체 */
/* 값 형식: 공백 구분 R G B (Tailwind alpha 합성 호환) */

/* 배경 계층 */
--color-background:                  13 17 23;   /* #0d1117 */
--color-surface:                     13 17 23;   /* #0d1117 */
--color-surface-container-lowest:    1 4 9;      /* #010409 — 사이드바 */
--color-surface-container-low:       17 23 32;   /* #11171f — hover 배경, #0d1117보다 구분 가능 */
--color-surface-container:           22 27 34;   /* #161b22 — 패널/카드 */
--color-surface-container-high:      33 38 45;   /* #21262d — 버튼/입력 */
--color-surface-container-highest:   48 54 61;   /* #30363d — 최상위 경계 */
--color-surface-variant:             22 27 34;   /* #161b22 */
--color-surface-dim:                 13 17 23;
--color-surface-bright:              33 38 45;
--color-surface-tint:                52 211 153; /* #34d399 에메랄드 */
--color-inverse-surface:             230 237 243;
--color-inverse-on-surface:          22 27 34;

/* 텍스트 */
--color-on-background:               230 237 243; /* #e6edf3 */
--color-on-surface:                  230 237 243; /* #e6edf3 */
--color-on-surface-variant:          139 148 158; /* #8b949e */
--color-outline:                     72 79 88;    /* #484f58 */
--color-outline-variant:             33 38 45;    /* #21262d */

/* Primary (에메랄드) */
--color-primary:                     52 211 153;  /* #34d399 */
--color-on-primary:                  1 4 9;       /* #010409 */
--color-primary-container:           8 40 25;     /* rgba(52,211,153,0.12) 근사 */
--color-on-primary-container:        52 211 153;
--color-primary-fixed:               52 211 153;
--color-primary-fixed-dim:           5 150 105;   /* #059669 */
--color-on-primary-fixed:            1 4 9;
--color-on-primary-fixed-variant:    5 150 105;
--color-inverse-primary:             5 150 105;

/* Error (레드) */
--color-error:                       248 81 73;   /* #f85149 */
--color-on-error:                    1 4 9;
--color-error-container:             46 10 8;     /* rgba(248,81,73,0.15) 근사 */
--color-on-error-container:          248 81 73;

/* Tertiary (앰버 — 경고/벨울림) */
--color-tertiary:                    210 153 34;  /* #d29922 */
--color-on-tertiary:                 1 4 9;
--color-tertiary-container:          42 30 6;
--color-on-tertiary-container:       210 153 34;
--color-tertiary-fixed:              251 191 36;  /* #fbbf24 */
--color-tertiary-fixed-dim:          210 153 34;
--color-on-tertiary-fixed:           1 4 9;
--color-on-tertiary-fixed-variant:   42 30 6;

/* Secondary (뉴트럴 그레이) */
--color-secondary:                   139 148 158; /* #8b949e */
--color-on-secondary:                1 4 9;
--color-secondary-container:         22 27 34;
--color-on-secondary-container:      230 237 243;
--color-secondary-fixed:             33 38 45;
--color-secondary-fixed-dim:         48 54 61;
--color-on-secondary-fixed:          230 237 243;
--color-on-secondary-fixed-variant:  139 148 158;

--gradient-primary-from: #059669;
--gradient-primary-to:   #34d399;

/* 신규 별칭 (신규 컴포넌트 style={} 전용 — hex 형식 유지) */
--bg-base:       #010409;
--bg-surface:    #0d1117;
--bg-elevated:   #161b22;
--bg-raised:     #21262d;
--border-subtle: #21262d;
--border-dim:    #30363d;
--text-primary:  #e6edf3;
--text-secondary:#8b949e;
--text-muted:    #484f58;
--accent:        #34d399;
--accent-strong: #059669;
--accent-dim:    rgba(52,211,153,0.12);
--accent-border: rgba(52,211,153,0.25);
--accent-glow:   rgba(52,211,153,0.35);
--status-talking:#34d399;
--status-ringing:#d29922;
--status-queued: #8b949e;
--status-danger: #f85149;
--mini-card-from:#052e1a;
--mini-card-to:  #041a0f;
```

`tailwind.config.js`의 기존 `colorToken()` 헬퍼와 `colors` 객체는 변경하지 않음 — `[data-theme='dark']` 블록의 `--color-*` 값 교체만으로 모든 Tailwind 색상 클래스가 자동으로 새 팔레트를 적용받음.

**알려진 부수 효과**: `styles/index.css`의 `.btn-primary-gradient` 클래스는 `--gradient-primary-from/to` 변수를 읽음. 위 매핑에서 이 변수를 에메랄드(`#059669` → `#34d399`)로 변경하므로, `MiniShell.tsx`의 저장 버튼과 기존 CTA 버튼 색상이 함께 변경됨 — 의도된 동작임.

---

## 7. 컴포넌트별 변경 범위

| 파일 | 변경 수준 | 내용 |
|------|----------|------|
| `styles/index.css` | 전면 교체 | CSS 변수 재정의 |
| `tailwind.config.js` | **유지** | 변경 없음 — `colorToken()` 헬퍼가 `--color-*` 재지정만으로 자동 반영 |
| `layout/FullShell.tsx` | 리팩터 | TopBar + 3패널 레이아웃 구조화 |
| `layout/MiniShell.tsx` | 리팩터 | 헤더/카드/컨트롤/메모 섹션 스타일 교체 |
| `layout/AppShell.tsx` | 유지 | 모드 디스패처 로직 변경 없음 |
| `components/SideNav.tsx` | 전면 교체 | 아이콘 전용 56px 사이드바 |
| `components/TopAppBar.tsx` | 전면 교체 | 신규 탑바 스타일 |
| `components/CurrentCallPanel.tsx` | 리팩터 | Hero 카드 + 컨트롤 버튼 행 |
| `components/ControlPanel.tsx` | 리팩터 | 탭 + 폼 영역 스타일 |
| `components/KpiPanel.tsx` | 리팩터 | 우측 KPI 스트립으로 이동 |
| `components/AgentStatusTag.tsx` | 리팩터 | 에메랄드 pill 스타일 (TONE 맵 교체) |
| `components/statusMeta.ts` | 수정 | 상태→한글 레이블 매핑 |
| `components/CallListPanel.tsx` | **신규 생성** | 콜 목록, 검색박스, 필터 칩 (FullShell에서 추출) |

### 7.1 CallListPanel 추출 명세

- **출처**: `layout/FullShell.tsx`의 `fullSection === 'call'` 분기에 인라인된 콜 목록(검색 Input + 필터 Select + 콜 카드 목록) 추출
- **상태 소유**: `useCtiStore`를 직접 구독 (props 드릴링 없음)
- **Section 3.3 UI 교체**: 기존 Antd `Input` + `Select` 필터를 Section 3.3의 커스텀 검색박스 + 필터 칩 UI로 교체

```ts
// props 없음 — 스토어 직접 구독
export function CallListPanel() {
  const { activeCalls, selectedCallId, selectCall } = useCtiStore();
  // ...
}
```

### 7.2 AgentStatusTag TONE 맵

```ts
// 기존 Tailwind 컬러 클래스 → 새 CSS 변수 기반 인라인 스타일로 교체
const TONE: Record<AgentStatusCode, { dot: string; text: string; bg: string; border: string }> = {
  AVAILABLE: {
    dot:  'var(--status-talking)',   // #34d399
    text: 'var(--status-talking)',
    bg:   'var(--accent-dim)',
    border:'var(--accent-border)',
  },
  TALKING: {
    dot:  'var(--status-talking)',   // #34d399 — 통화 중은 생산적 상태, red 아님
    text: 'var(--status-talking)',
    bg:   'var(--accent-dim)',
    border:'var(--accent-border)',
  },
  RINGING: {
    dot:  'var(--status-ringing)',
    text: 'var(--status-ringing)',
    bg:   'rgba(210,153,34,0.10)',
    border:'rgba(210,153,34,0.25)',
  },
  AFTER_CALL_WORK: {
    dot:  '#8b949e',
    text: '#8b949e',
    bg:   'rgba(139,148,158,0.10)',
    border:'rgba(139,148,158,0.20)',
  },
  BREAK: {
    dot:  '#d29922',
    text: '#d29922',
    bg:   'rgba(210,153,34,0.08)',
    border:'rgba(210,153,34,0.20)',
  },
  MEAL: {
    dot:  '#d29922',
    text: '#d29922',
    bg:   'rgba(210,153,34,0.08)',
    border:'rgba(210,153,34,0.20)',
  },
  TRAINING: {
    dot:  '#8b949e',
    text: '#8b949e',
    bg:   'rgba(139,148,158,0.08)',
    border:'rgba(139,148,158,0.18)',
  },
  MANUAL_PAUSED: {
    dot:  '#8b949e',
    text: '#8b949e',
    bg:   'rgba(139,148,158,0.08)',
    border:'rgba(139,148,158,0.18)',
  },
};
```

---

## 8. 유지 사항

- 모든 비즈니스 로직 (`useCtiStore`, API 호출, 이벤트 핸들러) **변경 없음**
- Mock/Real 이중 모드 구조 유지
- `VITE_USE_MOCK` 플래그 동작 유지
- 라우터, 인증 흐름 변경 없음
- 기존 컴포넌트 파일 유지 (스타일만 교체)

---

## 9. 비범위 (Out of Scope)

- 신규 기능 추가 없음
- Admin 앱 (`apps/admin`) 미포함
- 다크/라이트 토글 동작 — 현행 유지, 라이트 팔레트 재정의는 후속 작업
- **알려진 임시 회귀**: CSS 변수 교체 후 라이트 모드 팔레트가 일시적으로 깨짐. 이는 의도된 트레이드오프이며 별도 후속 작업으로 처리 예정

---

## 10. 참고 목업

`.superpowers/brainstorm/53772-1776690424/` 하위 (프로젝트 루트, `.gitignore` 적용):
- `design-direction.html` — A/B/C 방향 비교
- `accent-color.html` — 액센트 컬러 4종 비교
- `sidebar-style.html` — 사이드바 A/B 비교
- `full-and-mini.html` — 최종 승인 목업 (Full + Mini 나란히)
