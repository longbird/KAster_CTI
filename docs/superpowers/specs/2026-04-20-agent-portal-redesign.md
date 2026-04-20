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

## 4. Mini 모드 레이아웃 (400px 고정 너비)

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

---

## 6. CSS 변수 교체 전략

기존 `styles/index.css`의 Material Design 3 토큰을 위 컬러 시스템으로 교체:

- `--md-sys-color-primary` → `--accent`
- `--md-sys-color-surface` → `--bg-surface`
- `--md-sys-color-surface-container` → `--bg-elevated`
- 기타 토큰 매핑 구현 시 정의

Tailwind `tailwind.config.js`에 CSS 변수 참조 추가하여 `bg-bg-surface`, `text-accent` 등 유틸리티 클래스 사용 가능하게 함.

---

## 7. 컴포넌트별 변경 범위

| 파일 | 변경 수준 | 내용 |
|------|----------|------|
| `styles/index.css` | 전면 교체 | CSS 변수 재정의 |
| `tailwind.config.js` | 수정 | CSS 변수 참조 추가 |
| `layout/FullShell.tsx` | 리팩터 | TopBar + 3패널 레이아웃 구조화 |
| `layout/MiniShell.tsx` | 리팩터 | 헤더/카드/컨트롤/메모 섹션 스타일 교체 |
| `layout/AppShell.tsx` | 유지 | 모드 디스패처 로직 변경 없음 |
| `components/SideNav.tsx` | 전면 교체 | 아이콘 전용 56px 사이드바 |
| `components/TopAppBar.tsx` | 전면 교체 | 신규 탑바 스타일 |
| `components/CurrentCallPanel.tsx` | 리팩터 | Hero 카드 + 컨트롤 버튼 행 |
| `components/ControlPanel.tsx` | 리팩터 | 탭 + 폼 영역 스타일 |
| `components/KpiPanel.tsx` | 리팩터 | 우측 KPI 스트립으로 이동 |
| `components/AgentStatusTag.tsx` | 리팩터 | 에메랄드 pill 스타일 |
| `components/statusMeta.ts` | 수정 | 상태→한글 레이블 매핑 |

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

---

## 10. 참고 목업

`docs/superpowers/brainstorm/53772-1776690424/` 하위:
- `design-direction.html` — A/B/C 방향 비교
- `accent-color.html` — 액센트 컬러 4종 비교
- `sidebar-style.html` — 사이드바 A/B 비교
- `full-and-mini.html` — 최종 승인 목업 (Full + Mini 나란히)
