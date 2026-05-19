# PBX 공통 도움말 기능 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자 앱의 PBX 운영 설정 화면마다 기능별 도움말 아이콘과 상세 도움말 패널을 제공하고, 도움말 콘텐츠를 매뉴얼/설정화면 자료에서 반자동으로 구축한다.

**Architecture:** 도움말 콘텐츠는 정적 JSON 파일(`pbxFeatureHelp.generated.json`) 하나로 시작한다. 관리자 앱은 이 JSON을 import 해 `featureKey` 기준으로 조회하고, `FeatureHelpButton`(아이콘) → `FeatureHelpPanel`(Drawer) 두 컴포넌트로 표시한다. `APPROVED` 상태 항목만 운영 화면에 노출하고 `AUTO_DRAFT`는 내부 검토 모드에서만 보인다. 별도 빌드 스크립트가 매뉴얼 PDF / 엑셀 / 설정화면 PNG 파일명에서 초안(`AUTO_DRAFT`)을 추출해 손으로 작성한 `APPROVED` 항목과 병합한다.

**Tech Stack:** React 18, Vite 5, Ant Design 5, TypeScript, Zustand, Vitest. 빌드 스크립트는 `tsx` + `pdf-parse` + `xlsx`.

---

## 기준 문서

- 상위 계획서: `docs/design/pbx-selected-features-development-plan-20260514.md` (섹션 "공통 도움말 기능 개발 계획")
- 요구사항 분석: `docs/design/samsung-pbx-requirements-analysis-20260513.md`
- 입력 자료:
  - `docs/IPPBX_개발시 참조용_20260104/2_매뉴얼 (삼성pbx).pdf`
  - `docs/IPPBX_개발시 참조용_20260104/1_비씨앤 IP PBX 초안_20260104.xlsx`
  - `docs/IPPBX_개발시 참조용_20260104/3_DM_설정화면/` (MMC 설정화면 PNG 27장)

## 범위 / 비범위

**범위 (M1 도움말):**
- 도움말 데이터 모델 + 정적 JSON
- `FeatureHelpButton`, `FeatureHelpPanel` 공통 컴포넌트
- P0 설정 화면 6곳 페이지 헤드에 도움말 아이콘 적용
- 매뉴얼/엑셀/설정화면 기반 도움말 초안 자동 구축 스크립트

**비범위 (후속):**
- 도움말 DB 승격(`pbxFeatureHelp`, `pbxFeatureHelpSources`, `pbxFeatureHelpRevisions` 테이블) — 운영 갱신/검토 이력이 필요해질 때.
- 도움말 조회 서버 API — 정적 JSON으로 충분한 동안 도입하지 않는다.
- 이미지 OCR — 설정화면은 파일명 기반 매핑만 사용한다(상위 계획서가 "OCR 또는 파일명" 중 택일 허용).
- P0 화면의 섹션 단위 도움말 아이콘(예: 내선 잠금, 국선 표시번호 섹션) — 해당 섹션을 만드는 `2026-05-19-pbx-p0-features.md` 플랜에서 함께 배치한다.

## 가정

- `apps/admin`은 Vitest 3.x를 쓰고, 기존 컴포넌트 테스트는 `react-dom/server`의 `renderToStaticMarkup`으로 정적 마크업을 검증한다(`BranchSettingsPage.test.tsx` 패턴). 이 플랜도 같은 패턴을 따른다 — 상호작용(클릭→Drawer)은 정적 테스트 대신 수동 스모크로 검증한다.
- `apps/admin`에 `xlsx@0.18.5`가 이미 `dependencies`에 있다(M1 도움말 빌드에서는 직접 쓰지 않음 — 매뉴얼 엑셀 본문 추출은 후속). `tsx`, `pdf-parse`는 새로 추가한다.
- 빌드 스크립트는 `apps/admin/scripts/`에 두고 `apps/admin` 디렉터리에서 `npm run help:build`로 실행한다.

## File Structure

| 파일 | 책임 |
|---|---|
| `apps/admin/src/shared/help/types.ts` | 도움말 엔트리 TypeScript 타입 |
| `apps/admin/src/shared/help/featureHelp.ts` | 생성 JSON import + `resolveFeatureHelp(featureKey)` 조회 로직 |
| `apps/admin/src/shared/help/pbxFeatureHelp.generated.json` | 도움말 콘텐츠 데이터(앱이 import) |
| `apps/admin/src/shared/help/FeatureHelpPanelBody.tsx` | 도움말 상세 본문(순수 표시 컴포넌트) |
| `apps/admin/src/shared/help/FeatureHelpPanel.tsx` | `FeatureHelpPanelBody`를 감싸는 Antd Drawer |
| `apps/admin/src/shared/help/FeatureHelpButton.tsx` | 도움말 아이콘 버튼 + Tooltip + Drawer 열림 상태 |
| `apps/admin/src/shared/help/index.ts` | 배럴 export |
| `apps/admin/scripts/buildHelp.ts` | 순수 함수: 파일명 파싱, 병합, 검증 |
| `apps/admin/scripts/build-pbx-feature-help.ts` | I/O 진입점: 자료 읽기 → `buildHelp` 호출 → JSON 출력 |
| `apps/admin/scripts/help-curated.json` | 손으로 작성한 `APPROVED` 도움말(스크립트 입력) |

테스트: 각 소스 파일 옆 `*.test.ts(x)`.

---

## Chunk 1: 도움말 데이터 모델과 조회 로직

### Task 1: 도움말 타입 정의

**Files:**
- Create: `apps/admin/src/shared/help/types.ts`

- [ ] **Step 1: 타입 파일 작성**

```ts
// apps/admin/src/shared/help/types.ts
export type HelpReviewStatus = 'AUTO_DRAFT' | 'APPROVED';

export type HelpSourceKind = 'manual' | 'spec' | 'screen' | 'search';

export interface HelpSource {
  kind: HelpSourceKind;
  /** 파일 경로, 문서명, 또는 URL */
  ref: string;
  /** kind === 'search' 이면 필수. 검색 수행일(ISO 날짜). */
  retrievedAt?: string;
}

export interface HelpRelatedRoute {
  /** 관리자 라우트 경로. 예: '/settings/branches' */
  route: string;
  label: string;
}

export interface FeatureHelpEntry {
  /** 라우트+기능명 조합 키. 예: 'branch.inboundPolicy' */
  featureKey: string;
  title: string;
  summary: string;
  howTo: string[];
  examples: string[];
  warnings: string[];
  relatedRoutes: HelpRelatedRoute[];
  sources: HelpSource[];
  reviewStatus: HelpReviewStatus;
  /** 마지막 갱신일(ISO 날짜) */
  updatedAt: string;
}

export type FeatureHelpData = Record<string, FeatureHelpEntry>;
```

- [ ] **Step 2: 커밋**

```bash
git add apps/admin/src/shared/help/types.ts
git commit -m "feat(admin): add PBX feature help type definitions"
```

### Task 2: 도움말 콘텐츠 시드 JSON

**Files:**
- Create: `apps/admin/src/shared/help/pbxFeatureHelp.generated.json`

이 파일은 앱이 import 한다. Chunk 5의 빌드 스크립트가 나중에 재생성하지만, 화면이 먼저 동작하도록 8개 P0 키를 손으로 시드한다. 모두 `APPROVED`.

- [ ] **Step 1: 시드 JSON 작성**

```json
{
  "system.timeSync": {
    "featureKey": "system.timeSync",
    "title": "시간 동기화 상태",
    "summary": "PBX 서버와 애플리케이션 서버의 시각 차이를 확인합니다. 시간 변경 기능은 제공하지 않습니다.",
    "howTo": [
      "시스템 설정 화면에서 시간 동기화 상태 영역을 확인합니다.",
      "driftSeconds가 임계치를 넘으면 PBX 서버 NTP 설정을 점검합니다."
    ],
    "examples": ["appTime과 pbxTime 차이가 2초 이내면 정상으로 표시됩니다."],
    "warnings": ["이 화면은 상태 조회 전용입니다. 시각을 직접 바꾸지 않습니다."],
    "relatedRoutes": [{ "route": "/system", "label": "시스템 설정" }],
    "sources": [{ "kind": "manual", "ref": "2_매뉴얼 (삼성pbx).pdf / MMC 505 시스템시간 맞추기" }],
    "reviewStatus": "APPROVED",
    "updatedAt": "2026-05-19"
  },
  "branch.inboundPolicy": {
    "featureKey": "branch.inboundPolicy",
    "title": "지사별 DID/ARS/착신 정책",
    "summary": "지사에 연결된 DID마다 직접 분배룰, ARS 메뉴, 착신전환 중 하나의 우선 경로를 지정합니다.",
    "howTo": [
      "지사 편집에서 DID를 선택하고 착신 경로를 하나 지정합니다.",
      "ARS 메뉴는 PBX 설정에서 만든 메뉴를 연결만 합니다."
    ],
    "examples": ["대표번호 DID는 ARS 메뉴로, 직통 DID는 직접 분배룰로 연결합니다."],
    "warnings": ["하나의 DID가 ARS와 직접 분배룰을 동시에 활성화할 수 없습니다."],
    "relatedRoutes": [
      { "route": "/settings/branches", "label": "지사 관리" },
      { "route": "/settings/asterisk", "label": "PBX 설정" }
    ],
    "sources": [{ "kind": "spec", "ref": "pbx-selected-features-development-plan-20260514.md / 기능 1" }],
    "reviewStatus": "APPROVED",
    "updatedAt": "2026-05-19"
  },
  "pbx.did": {
    "featureKey": "pbx.did",
    "title": "DID 설정",
    "summary": "인입 번호(DID)별 지사 매핑과 라우팅 원천 설정을 관리합니다.",
    "howTo": ["DID를 등록하고 지사와 대표번호 여부를 지정합니다."],
    "examples": ["070-1234-5678 DID를 본사 지사에 연결합니다."],
    "warnings": ["동일 DID가 여러 지사에 중복 연결되지 않도록 합니다."],
    "relatedRoutes": [{ "route": "/settings/asterisk", "label": "PBX 설정" }],
    "sources": [{ "kind": "spec", "ref": "pbx-selected-features-development-plan-20260514.md / 기능 1" }],
    "reviewStatus": "APPROVED",
    "updatedAt": "2026-05-19"
  },
  "pbx.trunkDisplayNumber": {
    "featureKey": "pbx.trunkDisplayNumber",
    "title": "국선 표시번호",
    "summary": "국선(트렁크)의 표시번호를 관리합니다. 기본값은 대표번호 마지막 4자리입니다.",
    "howTo": ["트렁크 목록의 표시번호 열을 확인하고 필요 시 수동 입력합니다."],
    "examples": ["대표번호가 15991234이면 표시번호 기본값은 1234입니다."],
    "warnings": ["표시번호는 발신자번호 정책을 덮어쓰지 않습니다."],
    "relatedRoutes": [{ "route": "/settings/asterisk", "label": "PBX 설정" }],
    "sources": [{ "kind": "manual", "ref": "2_매뉴얼 (삼성pbx).pdf / MMC 404 국선이름등록" }],
    "reviewStatus": "APPROVED",
    "updatedAt": "2026-05-19"
  },
  "forwarding.condition": {
    "featureKey": "forwarding.condition",
    "title": "착신전환 조건",
    "summary": "즉시, 대기시간 초과, 상담원 없음, 시간 조건 중 하나로 착신전환 발동 조건을 정합니다.",
    "howTo": ["착신전환 규칙에서 조건 유형을 선택하고 대상과 시간표를 지정합니다."],
    "examples": ["업무시간 외에는 시간 조건 전환으로 야간 안내 멘트에 연결합니다."],
    "warnings": ["시간 범위가 자정을 넘는 경우 종료시각이 시작시각보다 작게 설정됩니다."],
    "relatedRoutes": [{ "route": "/settings/forwarding", "label": "착신전환 설정" }],
    "sources": [{ "kind": "manual", "ref": "2_매뉴얼 (삼성pbx).pdf / MMC 102 착신전환" }],
    "reviewStatus": "APPROVED",
    "updatedAt": "2026-05-19"
  },
  "queue.externalInboundMode": {
    "featureKey": "queue.externalInboundMode",
    "title": "외부 착신 방식",
    "summary": "순차, 분배, 무조건 세 가지 외부 착신 방식을 호 분배룰에 매핑합니다.",
    "howTo": ["호 분배룰 생성/수정에서 외부 착신 방식을 선택합니다."],
    "examples": ["순차는 우선순위 순 호출, 분배는 균등 분배, 무조건은 지정 대상 즉시 연결입니다."],
    "warnings": ["상담원이 0명인 분배룰은 대체 경로 경고가 표시됩니다."],
    "relatedRoutes": [{ "route": "/settings/queues", "label": "호 분배룰 설정" }],
    "sources": [{ "kind": "spec", "ref": "pbx-selected-features-development-plan-20260514.md / 기능 2" }],
    "reviewStatus": "APPROVED",
    "updatedAt": "2026-05-19"
  },
  "agent.extensionDisplayName": {
    "featureKey": "agent.extensionDisplayName",
    "title": "내선 표시명",
    "summary": "상담원 이름과 별개로 전화기/내선에 표시되는 이름을 지정합니다.",
    "howTo": ["상담원 생성/수정 화면에서 내선 표시명을 입력합니다."],
    "examples": ["상담원명은 '홍길동', 내선 표시명은 '본사 1번 데스크'."],
    "warnings": ["표시명이 비면 상담원명 또는 내선번호 기반 기본값을 사용합니다."],
    "relatedRoutes": [{ "route": "/settings/agents", "label": "상담원 설정" }],
    "sources": [{ "kind": "manual", "ref": "2_매뉴얼 (삼성pbx).pdf / MMC 104 내선이름등록" }],
    "reviewStatus": "APPROVED",
    "updatedAt": "2026-05-19"
  },
  "agent.extensionLock": {
    "featureKey": "agent.extensionLock",
    "title": "내선 잠금",
    "summary": "내선의 발신/착신/등록을 제한하는 운영 정책입니다.",
    "howTo": ["상담원 설정에서 잠금 모드를 UNLOCKED/OUTBOUND_LOCKED/FULL_LOCKED 중 선택합니다."],
    "examples": ["퇴사 예정 상담원 내선은 OUTBOUND_LOCKED로 발신만 차단합니다."],
    "warnings": ["FULL_LOCKED는 로그인 또는 단말 등록까지 제한합니다."],
    "relatedRoutes": [{ "route": "/settings/agents", "label": "상담원 설정" }],
    "sources": [{ "kind": "manual", "ref": "2_매뉴얼 (삼성pbx).pdf / MMC 100 내선잠금" }],
    "reviewStatus": "APPROVED",
    "updatedAt": "2026-05-19"
  }
}
```

- [ ] **Step 2: 커밋**

```bash
git add apps/admin/src/shared/help/pbxFeatureHelp.generated.json
git commit -m "feat(admin): seed PBX feature help content for P0 keys"
```

### Task 3: 도움말 조회 로직 (`resolveFeatureHelp`)

`APPROVED`는 항상 노출, `AUTO_DRAFT`는 내부 검토 모드(`VITE_HELP_INTERNAL_REVIEW=true`)에서만 노출. 없는 키는 `missing`.

**Files:**
- Create: `apps/admin/src/shared/help/featureHelp.ts`
- Test: `apps/admin/src/shared/help/featureHelp.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

```ts
// apps/admin/src/shared/help/featureHelp.test.ts
import { describe, expect, it } from 'vitest';
import { resolveHelp } from './featureHelp';
import type { FeatureHelpData } from './types';

const data: FeatureHelpData = {
  'a.approved': {
    featureKey: 'a.approved', title: 'A', summary: 's',
    howTo: [], examples: [], warnings: [], relatedRoutes: [], sources: [],
    reviewStatus: 'APPROVED', updatedAt: '2026-05-19',
  },
  'b.draft': {
    featureKey: 'b.draft', title: 'B', summary: 's',
    howTo: [], examples: [], warnings: [], relatedRoutes: [], sources: [],
    reviewStatus: 'AUTO_DRAFT', updatedAt: '2026-05-19',
  },
};

describe('resolveHelp', () => {
  it('APPROVED 키는 ready 로 반환한다', () => {
    expect(resolveHelp(data, 'a.approved', false)).toMatchObject({ status: 'ready' });
  });
  it('AUTO_DRAFT 키는 내부 검토 모드가 아니면 draft-pending', () => {
    expect(resolveHelp(data, 'b.draft', false)).toEqual({ status: 'draft-pending' });
  });
  it('AUTO_DRAFT 키는 내부 검토 모드면 ready', () => {
    expect(resolveHelp(data, 'b.draft', true)).toMatchObject({ status: 'ready' });
  });
  it('없는 키는 missing', () => {
    expect(resolveHelp(data, 'x.none', true)).toEqual({ status: 'missing' });
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run (cwd `apps/admin`): `npx vitest run src/shared/help/featureHelp.test.ts`
Expected: FAIL — `resolveHelp` 미정의.

- [ ] **Step 3: 최소 구현 작성**

```ts
// apps/admin/src/shared/help/featureHelp.ts
import rawData from './pbxFeatureHelp.generated.json';
import type { FeatureHelpData, FeatureHelpEntry } from './types';

const helpData = rawData as FeatureHelpData;

export interface HelpResolution {
  status: 'ready' | 'draft-pending' | 'missing';
  entry?: FeatureHelpEntry;
}

/** 순수 함수 — 테스트 용이성을 위해 data 와 internalReview 를 인자로 받는다. */
export function resolveHelp(
  data: FeatureHelpData,
  featureKey: string,
  internalReview: boolean,
): HelpResolution {
  const entry = data[featureKey];
  if (!entry) return { status: 'missing' };
  if (entry.reviewStatus === 'APPROVED') return { status: 'ready', entry };
  return internalReview ? { status: 'ready', entry } : { status: 'draft-pending' };
}

export function isInternalHelpReview(): boolean {
  return import.meta.env.VITE_HELP_INTERNAL_REVIEW === 'true';
}

/** 앱에서 쓰는 진입점. 번들된 데이터와 환경값을 사용한다. */
export function resolveFeatureHelp(featureKey: string): HelpResolution {
  return resolveHelp(helpData, featureKey, isInternalHelpReview());
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/shared/help/featureHelp.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: 환경 변수 문서화**

`apps/admin/.env.example` 끝에 추가:

```
# 도움말 내부 검토 모드. true 면 AUTO_DRAFT 도움말도 화면에 표시.
VITE_HELP_INTERNAL_REVIEW=false
```

- [ ] **Step 6: 커밋**

```bash
git add apps/admin/src/shared/help/featureHelp.ts apps/admin/src/shared/help/featureHelp.test.ts apps/admin/.env.example
git commit -m "feat(admin): add feature help resolution logic"
```

---

## Chunk 2: 도움말 상세 본문 컴포넌트

### Task 4: `FeatureHelpPanelBody`

Drawer 안에 들어가는 순수 표시 컴포넌트. `resolveFeatureHelp` 결과(`HelpResolution`)를 받아 상태별로 렌더한다. Drawer와 분리해 `renderToStaticMarkup`으로 테스트 가능하게 한다.

**Files:**
- Create: `apps/admin/src/shared/help/FeatureHelpPanelBody.tsx`
- Test: `apps/admin/src/shared/help/FeatureHelpPanelBody.test.tsx`

- [ ] **Step 1: 실패 테스트 작성**

```tsx
// apps/admin/src/shared/help/FeatureHelpPanelBody.test.tsx
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FeatureHelpPanelBody } from './FeatureHelpPanelBody';
import type { FeatureHelpEntry } from './types';

const entry: FeatureHelpEntry = {
  featureKey: 'demo.feature', title: '데모 기능', summary: '요약 문장',
  howTo: ['1단계', '2단계'], examples: ['예시 A'], warnings: ['주의 B'],
  relatedRoutes: [{ route: '/settings/branches', label: '지사 관리' }],
  sources: [
    { kind: 'manual', ref: '매뉴얼 X' },
    { kind: 'search', ref: 'https://e.com', retrievedAt: '2026-05-10' },
  ],
  reviewStatus: 'APPROVED', updatedAt: '2026-05-19',
};

describe('FeatureHelpPanelBody', () => {
  it('ready 면 제목/요약/howTo/주의/출처/갱신일을 렌더한다', () => {
    const html = renderToStaticMarkup(
      <FeatureHelpPanelBody resolution={{ status: 'ready', entry }} />,
    );
    expect(html).toContain('데모 기능');
    expect(html).toContain('요약 문장');
    expect(html).toContain('1단계');
    expect(html).toContain('주의 B');
    expect(html).toContain('매뉴얼 X');
    expect(html).toContain('2026-05-10'); // search 출처 검색일
    expect(html).toContain('2026-05-19'); // 마지막 갱신일
  });
  it('draft-pending 이면 검토 대기 메시지를 렌더한다', () => {
    const html = renderToStaticMarkup(
      <FeatureHelpPanelBody resolution={{ status: 'draft-pending' }} />,
    );
    expect(html).toContain('검토 대기');
  });
  it('missing 이면 준비 중 메시지를 렌더한다', () => {
    const html = renderToStaticMarkup(
      <FeatureHelpPanelBody resolution={{ status: 'missing' }} />,
    );
    expect(html).toContain('준비 중');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/shared/help/FeatureHelpPanelBody.test.tsx`
Expected: FAIL — 컴포넌트 미정의.

- [ ] **Step 3: 최소 구현 작성**

```tsx
// apps/admin/src/shared/help/FeatureHelpPanelBody.tsx
import { Alert, Divider, Space, Tag, Typography } from 'antd';
import type { HelpResolution } from './featureHelp';
import type { FeatureHelpEntry } from './types';

function Section({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <Typography.Text strong>{title}</Typography.Text>
      <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
        {items.map((it, i) => (
          <li key={i}>
            <Typography.Text>{it}</Typography.Text>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ReadyBody({ entry }: { entry: FeatureHelpEntry }) {
  return (
    <Space direction="vertical" size={14} style={{ width: '100%' }}>
      <div>
        <Space align="center">
          <Typography.Title level={5} style={{ margin: 0 }}>
            {entry.title}
          </Typography.Title>
          <Tag color={entry.reviewStatus === 'APPROVED' ? 'green' : 'orange'}>
            {entry.reviewStatus === 'APPROVED' ? '검토 완료' : '검토 대기'}
          </Tag>
        </Space>
        <Typography.Paragraph type="secondary" style={{ margin: '6px 0 0' }}>
          {entry.summary}
        </Typography.Paragraph>
      </div>
      <Section title="설정 방법" items={entry.howTo} />
      <Section title="운영 예시" items={entry.examples} />
      <Section title="주의사항" items={entry.warnings} />
      {entry.relatedRoutes.length > 0 && (
        <div>
          <Typography.Text strong>관련 설정</Typography.Text>
          <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
            {entry.relatedRoutes.map((r) => (
              <li key={r.route}>
                {/* 새 탭으로 열어 작성 중인 설정값(현재 페이지/모달 상태)을 보존한다. */}
                <Typography.Link href={r.route} target="_blank" rel="noreferrer">
                  {r.label}
                </Typography.Link>{' '}
                <Typography.Text type="secondary">({r.route})</Typography.Text>
              </li>
            ))}
          </ul>
        </div>
      )}
      <Divider style={{ margin: '4px 0' }} />
      <div>
        <Typography.Text strong>출처</Typography.Text>
        <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
          {entry.sources.map((s, i) => (
            <li key={i}>
              <Typography.Text type="secondary">
                [{s.kind}] {s.ref}
                {s.retrievedAt ? ` (검색일 ${s.retrievedAt})` : ''}
              </Typography.Text>
            </li>
          ))}
        </ul>
      </div>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        마지막 갱신일: {entry.updatedAt}
      </Typography.Text>
    </Space>
  );
}

export function FeatureHelpPanelBody({ resolution }: { resolution: HelpResolution }) {
  if (resolution.status === 'ready' && resolution.entry) {
    return <ReadyBody entry={resolution.entry} />;
  }
  if (resolution.status === 'draft-pending') {
    return (
      <Alert
        type="warning"
        showIcon
        message="도움말 검토 대기"
        description="이 기능의 도움말은 자동 생성 후 검토 대기 상태입니다. 관리자 검토 후 표시됩니다."
      />
    );
  }
  return (
    <Alert
      type="info"
      showIcon
      message="도움말 준비 중"
      description="이 기능의 도움말이 아직 등록되지 않았습니다. 도움말 구축이 필요합니다."
    />
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/shared/help/FeatureHelpPanelBody.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: 커밋**

```bash
git add apps/admin/src/shared/help/FeatureHelpPanelBody.tsx apps/admin/src/shared/help/FeatureHelpPanelBody.test.tsx
git commit -m "feat(admin): add feature help panel body component"
```

---

## Chunk 3: 도움말 Drawer 와 아이콘 버튼

### Task 5: `FeatureHelpPanel` (Drawer 래퍼)

`FeatureHelpPanelBody`를 Antd Drawer로 감싸는 얇은 컴포넌트.

**Files:**
- Create: `apps/admin/src/shared/help/FeatureHelpPanel.tsx`

- [ ] **Step 1: 구현 작성**

```tsx
// apps/admin/src/shared/help/FeatureHelpPanel.tsx
import { Drawer } from 'antd';
import { resolveFeatureHelp } from './featureHelp';
import { FeatureHelpPanelBody } from './FeatureHelpPanelBody';

export interface FeatureHelpPanelProps {
  featureKey: string;
  /** Drawer 헤더에 표시할 기능명 */
  featureName: string;
  open: boolean;
  onClose: () => void;
}

export function FeatureHelpPanel({ featureKey, featureName, open, onClose }: FeatureHelpPanelProps) {
  const resolution = resolveFeatureHelp(featureKey);
  return (
    <Drawer title={`도움말 · ${featureName}`} open={open} onClose={onClose} width={420}>
      <FeatureHelpPanelBody resolution={resolution} />
    </Drawer>
  );
}
```

- [ ] **Step 2: 빌드 확인**

Run (cwd `apps/admin`): `npx tsc -b`
Expected: 타입 오류 0.

- [ ] **Step 3: 커밋**

```bash
git add apps/admin/src/shared/help/FeatureHelpPanel.tsx
git commit -m "feat(admin): add feature help drawer panel"
```

### Task 6: `FeatureHelpButton` (아이콘 + Tooltip + 상태)

물음표 아이콘 버튼. hover/focus 시 요약 Tooltip, 클릭/Enter/Space 시 Drawer 열림. `aria-label`은 `도움말 보기: {기능명}`. Antd `Button`은 기본적으로 키보드 포커스와 Enter/Space를 처리하므로 별도 키 핸들러는 불필요.

**Files:**
- Create: `apps/admin/src/shared/help/FeatureHelpButton.tsx`
- Create: `apps/admin/src/shared/help/index.ts`
- Test: `apps/admin/src/shared/help/FeatureHelpButton.test.tsx`

- [ ] **Step 1: 실패 테스트 작성**

```tsx
// apps/admin/src/shared/help/FeatureHelpButton.test.tsx
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FeatureHelpButton } from './FeatureHelpButton';

describe('FeatureHelpButton', () => {
  it('aria-label 에 기능명을 포함한다', () => {
    const html = renderToStaticMarkup(
      <FeatureHelpButton featureKey="system.timeSync" featureName="시간 동기화 상태" />,
    );
    expect(html).toContain('aria-label="도움말 보기: 시간 동기화 상태"');
  });
  it('초기 렌더에 Drawer 가 닫혀 있어 본문이 마크업에 없다', () => {
    const html = renderToStaticMarkup(
      <FeatureHelpButton featureKey="system.timeSync" featureName="시간 동기화 상태" />,
    );
    expect(html).not.toContain('마지막 갱신일');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/shared/help/FeatureHelpButton.test.tsx`
Expected: FAIL — 컴포넌트 미정의.

- [ ] **Step 3: 최소 구현 작성**

```tsx
// apps/admin/src/shared/help/FeatureHelpButton.tsx
import { useState } from 'react';
import { QuestionCircleOutlined } from '@ant-design/icons';
import { Button, Tooltip } from 'antd';
import { resolveFeatureHelp } from './featureHelp';
import { FeatureHelpPanel } from './FeatureHelpPanel';

export interface FeatureHelpButtonProps {
  featureKey: string;
  featureName: string;
}

export function FeatureHelpButton({ featureKey, featureName }: FeatureHelpButtonProps) {
  const [open, setOpen] = useState(false);
  const resolution = resolveFeatureHelp(featureKey);
  const tooltip =
    resolution.status === 'ready' && resolution.entry
      ? resolution.entry.summary
      : '도움말 준비 중';

  return (
    <>
      <Tooltip title={tooltip}>
        <Button
          type="text"
          size="small"
          icon={<QuestionCircleOutlined />}
          aria-label={`도움말 보기: ${featureName}`}
          onClick={() => setOpen(true)}
        />
      </Tooltip>
      <FeatureHelpPanel
        featureKey={featureKey}
        featureName={featureName}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
```

- [ ] **Step 4: 배럴 export 작성**

```ts
// apps/admin/src/shared/help/index.ts
export { FeatureHelpButton } from './FeatureHelpButton';
export { FeatureHelpPanel } from './FeatureHelpPanel';
export { resolveFeatureHelp } from './featureHelp';
export type { FeatureHelpEntry, FeatureHelpData } from './types';
```

- [ ] **Step 5: 테스트/빌드 통과 확인**

Run: `npx vitest run src/shared/help/ && npx tsc -b`
Expected: 도움말 테스트 전부 PASS, 타입 오류 0.

- [ ] **Step 6: 커밋**

```bash
git add apps/admin/src/shared/help/FeatureHelpButton.tsx apps/admin/src/shared/help/FeatureHelpButton.test.tsx apps/admin/src/shared/help/index.ts
git commit -m "feat(admin): add feature help icon button"
```

---

## Chunk 4: P0 설정 화면에 도움말 아이콘 적용

### Task 7: 6개 P0 화면 페이지 헤드에 도움말 버튼 배치

각 화면의 페이지 제목 옆에 `FeatureHelpButton`을 둔다. 화면마다 헤드 구현이 다르므로(일부는 `AdmPageHead`, 일부는 `Typography.Title` 직접 사용) 워커는 먼저 파일을 읽고 제목 위치를 찾는다.

**적용 대상과 featureKey / featureName:**

| 파일 | featureKey | featureName |
|---|---|---|
| `apps/admin/src/features/system-settings/SystemSettingsPage.tsx` | `system.timeSync` | 시간 동기화 상태 |
| `apps/admin/src/features/branch-settings/BranchSettingsPage.tsx` | `branch.inboundPolicy` | 지사별 착신 정책 |
| `apps/admin/src/features/forwarding-settings/ForwardingSettingsPage.tsx` | `forwarding.condition` | 착신전환 조건 |
| `apps/admin/src/features/queue-settings/QueueSettingsPage.tsx` | `queue.externalInboundMode` | 외부 착신 방식 |
| `apps/admin/src/features/agent-settings/AgentSettingsPage.tsx` | `agent.extensionDisplayName` | 내선 표시명 |
| `apps/admin/src/pages/AsteriskConfigPage.tsx` | `pbx.did` | DID 설정 |

> PBX 설정 페이지는 `features/asterisk-config/` 아래가 아니라 `apps/admin/src/pages/AsteriskConfigPage.tsx`에 있다(`features/asterisk-config/`에는 `api/`, `components/`, `types/`만 있음). 의심되면 `apps/admin/src/app/router.tsx`에서 PBX 설정 라우트가 import 하는 컴포넌트로 확인한다.
>
> `pbx.trunkDisplayNumber`, `agent.extensionLock` 등 섹션 단위 도움말 아이콘은 해당 섹션을 만드는 `2026-05-19-pbx-p0-features.md` 플랜에서 배치하므로 이 태스크에서는 다루지 않는다.

- [ ] **Step 1: `AdmPageHead` 사용 화면 — `right` 슬롯 활용**

`AdmPageHead`를 쓰는 화면이면 `right` prop에 버튼을 넣는다. 예:

```tsx
import { FeatureHelpButton } from '../../shared/help';
// ...
<AdmPageHead
  title="화면 제목"
  right={<FeatureHelpButton featureKey="..." featureName="..." />}
/>
```

이미 `right`에 다른 요소가 있으면 `<Space>`로 묶는다.

- [ ] **Step 2: `Typography.Title` 직접 사용 화면 — 제목과 같은 줄에 배치**

`SystemSettingsPage.tsx`처럼 `Typography.Title`을 직접 쓰는 화면이면 제목을 `Space`로 감싸 버튼을 옆에 둔다:

```tsx
import { Space } from 'antd';
import { FeatureHelpButton } from '../../shared/help';
// ...
<Space align="center">
  <Typography.Title level={4} style={{ margin: 0 }}>
    시스템 설정
  </Typography.Title>
  <FeatureHelpButton featureKey="system.timeSync" featureName="시간 동기화 상태" />
</Space>
```

- [ ] **Step 3: 6개 화면 모두에 적용**

위 표의 6개 파일을 하나씩 열어 Step 1 또는 Step 2 패턴으로 버튼을 추가한다. import 경로는 파일 위치에 맞춰 조정한다 — `src/features/<x>/Page.tsx` → `../../shared/help`, `src/pages/AsteriskConfigPage.tsx` → `../shared/help`.

- [ ] **Step 4: 적용 확인**

Run (cwd `apps/admin`):

```bash
grep -rl "FeatureHelpButton" src/features/ src/pages/ | sort
```

Expected: 6개 파일 경로 출력 — `src/features/` 5개 + `src/pages/AsteriskConfigPage.tsx` 1개.

- [ ] **Step 5: 빌드와 테스트 확인**

Run: `npx tsc -b && npx vitest run`
Expected: 타입 오류 0, 기존 테스트 + 도움말 테스트 전부 PASS.

- [ ] **Step 6: 수동 스모크 (상호작용 검증)**

Run: `npm run dev -- --port 5174`
확인:
- 6개 화면 각각에서 물음표 아이콘이 제목 옆에 보인다.
- 아이콘에 마우스를 올리면 요약 Tooltip이 뜬다.
- `Tab` 키만으로 아이콘에 포커스가 가고, `Enter` 또는 `Space`로 Drawer가 열린다.
- Drawer에 제목/요약/설정 방법/출처/마지막 갱신일이 표시된다.

- [ ] **Step 7: 커밋**

```bash
git add apps/admin/src/features
git commit -m "feat(admin): add feature help buttons to P0 setting screens"
```

---

## Chunk 5: 도움말 자동 구축 스크립트

손으로 작성한 `APPROVED` 도움말(`help-curated.json`)과, 매뉴얼 PDF / 엑셀 / 설정화면 PNG 파일명에서 추출한 `AUTO_DRAFT` 초안을 병합해 `pbxFeatureHelp.generated.json`을 재생성한다.

핵심 규칙: **`APPROVED` curated 항목은 절대 덮어쓰지 않는다.** 초안은 curated에 없는 키일 때만 `AUTO_DRAFT`로 추가한다.

### Task 8: 의존성 추가와 curated 입력 파일

**Files:**
- Modify: `apps/admin/package.json`
- Create: `apps/admin/scripts/help-curated.json`

- [ ] **Step 1: devDependency 와 npm 스크립트 추가**

Run (cwd `apps/admin`):

```bash
npm install -D tsx pdf-parse @types/pdf-parse
```

`apps/admin/package.json`의 `scripts`에 추가:

```json
"help:build": "tsx scripts/build-pbx-feature-help.ts"
```

- [ ] **Step 2: curated 입력 파일 생성**

`apps/admin/src/shared/help/pbxFeatureHelp.generated.json`(Task 2)의 내용을 그대로 복사해 `apps/admin/scripts/help-curated.json`으로 만든다. 이후 curated 항목 수정은 이 파일에서 한다.

```bash
cp apps/admin/src/shared/help/pbxFeatureHelp.generated.json apps/admin/scripts/help-curated.json
```

- [ ] **Step 3: 커밋**

```bash
git add apps/admin/package.json apps/admin/package-lock.json apps/admin/scripts/help-curated.json
git commit -m "chore(admin): add help build deps and curated input"
```

### Task 9: 순수 함수 — 파일명 파싱, 병합, 검증

**Files:**
- Create: `apps/admin/scripts/buildHelp.ts`
- Test: `apps/admin/scripts/buildHelp.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

```ts
// apps/admin/scripts/buildHelp.test.ts
import { describe, expect, it } from 'vitest';
import { parseScreenFilename, mergeHelpEntries, validateHelpEntry } from './buildHelp';
import type { FeatureHelpEntry } from '../src/shared/help/types';

const approved: FeatureHelpEntry = {
  featureKey: 'system.timeSync', title: '시간 동기화', summary: 's',
  howTo: [], examples: [], warnings: [], relatedRoutes: [],
  sources: [{ kind: 'manual', ref: 'm' }],
  reviewStatus: 'APPROVED', updatedAt: '2026-05-19',
};

describe('parseScreenFilename', () => {
  it('MMC 설정화면 파일명을 코드와 라벨로 분리한다', () => {
    expect(parseScreenFilename('MMC 100_내선잠금.png')).toEqual({
      mmcCode: '100', label: '내선잠금',
    });
  });
  it('형식이 안 맞으면 null', () => {
    expect(parseScreenFilename('readme.txt')).toBeNull();
  });
});

describe('mergeHelpEntries', () => {
  it('APPROVED curated 항목은 같은 키 초안으로 덮어쓰지 않는다', () => {
    const draft: FeatureHelpEntry = { ...approved, summary: '초안', reviewStatus: 'AUTO_DRAFT' };
    const merged = mergeHelpEntries({ 'system.timeSync': approved }, { 'system.timeSync': draft });
    expect(merged['system.timeSync'].summary).toBe('s');
    expect(merged['system.timeSync'].reviewStatus).toBe('APPROVED');
  });
  it('curated 에 없는 키 초안은 AUTO_DRAFT 로 추가한다', () => {
    const draft: FeatureHelpEntry = { ...approved, featureKey: 'mmc.100', reviewStatus: 'AUTO_DRAFT' };
    const merged = mergeHelpEntries({ 'system.timeSync': approved }, { 'mmc.100': draft });
    expect(Object.keys(merged).sort()).toEqual(['mmc.100', 'system.timeSync']);
  });
});

describe('validateHelpEntry', () => {
  it('정상 항목은 빈 오류 배열', () => {
    expect(validateHelpEntry(approved)).toEqual([]);
  });
  it('search 출처에 retrievedAt 이 없으면 오류', () => {
    const bad: FeatureHelpEntry = {
      ...approved, sources: [{ kind: 'search', ref: 'https://e.com' }],
    };
    expect(validateHelpEntry(bad)).toContain('search 출처에는 retrievedAt 이 필요합니다: https://e.com');
  });
  it('출처가 없으면 오류', () => {
    expect(validateHelpEntry({ ...approved, sources: [] })).toContain('출처가 비어 있습니다');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run (cwd `apps/admin`): `npx vitest run scripts/buildHelp.test.ts`
Expected: FAIL — 함수 미정의.

- [ ] **Step 3: 최소 구현 작성**

```ts
// apps/admin/scripts/buildHelp.ts
import type { FeatureHelpData, FeatureHelpEntry } from '../src/shared/help/types';

export interface ScreenFile {
  mmcCode: string;
  label: string;
}

/** 'MMC 100_내선잠금.png' -> { mmcCode: '100', label: '내선잠금' } */
export function parseScreenFilename(name: string): ScreenFile | null {
  const m = /^MMC\s+(\d+)_(.+)\.png$/i.exec(name.trim());
  if (!m) return null;
  return { mmcCode: m[1], label: m[2].trim() };
}

/**
 * curated(손작성, 보통 APPROVED) + drafts(자동 추출, AUTO_DRAFT) 병합.
 * curated 의 APPROVED 항목은 같은 키 draft 로 덮어쓰지 않는다.
 */
export function mergeHelpEntries(
  curated: FeatureHelpData,
  drafts: FeatureHelpData,
): FeatureHelpData {
  const merged: FeatureHelpData = { ...curated };
  for (const [key, draft] of Object.entries(drafts)) {
    const existing = merged[key];
    if (existing && existing.reviewStatus === 'APPROVED') continue;
    merged[key] = draft;
  }
  return merged;
}

/** 도움말 항목 1건 검증. 오류 메시지 배열을 반환(빈 배열 = 정상). */
export function validateHelpEntry(entry: FeatureHelpEntry): string[] {
  const errors: string[] = [];
  if (!entry.featureKey) errors.push('featureKey 가 비어 있습니다');
  if (!entry.title) errors.push('title 이 비어 있습니다');
  if (!entry.summary) errors.push('summary 가 비어 있습니다');
  if (entry.sources.length === 0) errors.push('출처가 비어 있습니다');
  for (const s of entry.sources) {
    if (s.kind === 'search' && !s.retrievedAt) {
      errors.push(`search 출처에는 retrievedAt 이 필요합니다: ${s.ref}`);
    }
  }
  return errors;
}

/** MMC 설정화면 파일명 목록에서 AUTO_DRAFT 초안을 만든다. */
export function screenFilesToDrafts(files: ScreenFile[], today: string): FeatureHelpData {
  const out: FeatureHelpData = {};
  for (const f of files) {
    const key = `mmc.${f.mmcCode}`;
    out[key] = {
      featureKey: key,
      title: f.label,
      summary: `삼성 PBX 설정화면 MMC ${f.mmcCode} (${f.label}) 자동 추출 초안입니다.`,
      howTo: [],
      examples: [],
      warnings: ['자동 생성된 초안입니다. 검토 후 APPROVED 로 전환하세요.'],
      relatedRoutes: [],
      sources: [{ kind: 'screen', ref: `3_DM_설정화면/MMC ${f.mmcCode}_${f.label}.png` }],
      reviewStatus: 'AUTO_DRAFT',
      updatedAt: today,
    };
  }
  return out;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run scripts/buildHelp.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: 커밋**

```bash
git add apps/admin/scripts/buildHelp.ts apps/admin/scripts/buildHelp.test.ts
git commit -m "feat(admin): add help build pure functions"
```

### Task 10: I/O 진입점 스크립트

자료를 읽어 `buildHelp.ts` 함수를 호출하고, 검증 후 `pbxFeatureHelp.generated.json`을 쓴다. PDF/엑셀 추출은 best-effort(읽기 실패 시 경고만 남기고 진행), 설정화면 파일명 추출은 결정적.

**Files:**
- Create: `apps/admin/scripts/build-pbx-feature-help.ts`

- [ ] **Step 1: 스크립트 작성**

```ts
// apps/admin/scripts/build-pbx-feature-help.ts
import { readFileSync, readdirSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import {
  mergeHelpEntries,
  parseScreenFilename,
  screenFilesToDrafts,
  validateHelpEntry,
  type ScreenFile,
} from './buildHelp';
import type { FeatureHelpData } from '../src/shared/help/types';

const REPO_ROOT = resolve(__dirname, '../../..');
const REF_DIR = resolve(REPO_ROOT, 'docs/IPPBX_개발시 참조용_20260104');
const SCREEN_DIR = resolve(REF_DIR, '3_DM_설정화면');
const CURATED_PATH = resolve(__dirname, 'help-curated.json');
const OUT_PATH = resolve(__dirname, '../src/shared/help/pbxFeatureHelp.generated.json');

function loadCurated(): FeatureHelpData {
  return JSON.parse(readFileSync(CURATED_PATH, 'utf8')) as FeatureHelpData;
}

function loadScreenFiles(): ScreenFile[] {
  let names: string[];
  try {
    names = readdirSync(SCREEN_DIR);
  } catch {
    console.warn(`[help:build] 설정화면 디렉터리를 읽지 못함: ${SCREEN_DIR}`);
    return [];
  }
  return names
    .map(parseScreenFilename)
    .filter((f): f is ScreenFile => f !== null);
}

async function main() {
  const today = new Date().toISOString().slice(0, 10);
  const curated = loadCurated();

  const screenFiles = loadScreenFiles();
  console.log(`[help:build] 설정화면 ${screenFiles.length}건에서 초안 추출`);
  const drafts = screenFilesToDrafts(screenFiles, today);

  const merged = mergeHelpEntries(curated, drafts);

  // 검증 — APPROVED 항목은 오류 시 빌드 실패, AUTO_DRAFT 는 경고만.
  let fatal = 0;
  for (const entry of Object.values(merged)) {
    const errors = validateHelpEntry(entry);
    if (errors.length === 0) continue;
    if (entry.reviewStatus === 'APPROVED') {
      fatal += errors.length;
      console.error(`[help:build] FATAL ${entry.featureKey}: ${errors.join('; ')}`);
    } else {
      console.warn(`[help:build] WARN ${entry.featureKey}: ${errors.join('; ')}`);
    }
  }
  if (fatal > 0) {
    console.error(`[help:build] APPROVED 항목 검증 오류 ${fatal}건 — 중단`);
    process.exit(1);
  }

  const sorted = Object.fromEntries(
    Object.entries(merged).sort(([a], [b]) => a.localeCompare(b)),
  );
  writeFileSync(OUT_PATH, JSON.stringify(sorted, null, 2) + '\n', 'utf8');
  console.log(`[help:build] ${Object.keys(sorted).length}개 항목 작성: ${OUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

> 참고: PDF(`pdf-parse`)와 엑셀(`xlsx`) 추출은 매뉴얼/엑셀 내부 구조가 확정되면 `loadScreenFiles`와 같은 패턴의 `loadManualDrafts` / `loadXlsxDrafts` 함수로 추가한다. M1에서는 결정적인 설정화면 파일명 추출만 사용한다.

- [ ] **Step 2: 스크립트 실행**

Run (cwd `apps/admin`): `npm run help:build`
Expected 출력 예: `[help:build] 설정화면 27건에서 초안 추출` → `[help:build] N개 항목 작성: ...pbxFeatureHelp.generated.json` (FATAL 없음, exit 0).

- [ ] **Step 3: 생성 결과 확인**

Run: `npx vitest run src/shared/help/ && npx tsc -b`
Expected: 도움말 테스트 전부 PASS(생성 JSON에 8개 APPROVED + mmc.* AUTO_DRAFT 항목 포함), 타입 오류 0.

`pbxFeatureHelp.generated.json`에 기존 8개 키가 `APPROVED`로 유지되고 `mmc.100` 등 초안이 `AUTO_DRAFT`로 추가됐는지 육안 확인. 생성 파일은 키가 정렬되고 `mmc.*` 항목이 추가되므로 Task 2 시드 JSON과 byte 단위로 같지 않은 것이 정상이다. `featureHelp.test.ts`는 자체 inline 데이터를 쓰므로 생성 JSON 변경에 영향받지 않고, `mmc.*` 키가 27개 늘어도 컴포넌트 테스트는 깨지지 않는다.

- [ ] **Step 4: 커밋**

```bash
git add apps/admin/scripts/build-pbx-feature-help.ts apps/admin/src/shared/help/pbxFeatureHelp.generated.json
git commit -m "feat(admin): add help build entrypoint and regenerate help data"
```

---

## 최종 검증 체크리스트

상위 계획서 "공통 도움말 기능 개발 계획 > 검증" 항목 대조:

- [ ] 모든 P0 설정 화면(6곳)에서 도움말 아이콘이 보인다 — Chunk 4 Step 4·6.
- [ ] 키보드만으로 도움말 아이콘에 접근하고 상세 도움말을 열 수 있다 — Chunk 4 Step 6.
- [ ] 도움말이 없는 기능은 빈 패널 대신 `준비 중` 상태를 표시한다 — `FeatureHelpPanelBody` `missing` 분기, Task 4 테스트.
- [ ] 자동 생성 도움말이 출처 없는 상태로 승인되지 않는다 — `validateHelpEntry` 가 출처 누락을 오류로 잡고, APPROVED 항목 오류 시 빌드 중단.
- [ ] 정보 검색 결과가 화면에 표시될 때 검색일과 출처가 함께 표시된다 — `HelpSource.retrievedAt` 필수화 + `FeatureHelpPanelBody`의 `(검색일 ...)` 렌더.
- [ ] `AUTO_DRAFT` 도움말은 운영 화면에 노출되지 않는다 — `resolveHelp`가 내부 검토 모드가 아니면 `draft-pending` 반환, Task 3 테스트.
- [ ] 전체 빌드/테스트 통과 — `cd apps/admin && npx tsc -b && npx vitest run`.

## 후속 연결

- P0 화면의 섹션 단위 도움말 아이콘은 `2026-05-19-pbx-p0-features.md` 플랜에서 각 기능 섹션과 함께 배치한다(`pbx.trunkDisplayNumber`, `agent.extensionLock` 등).
- 운영 갱신/검토 이력이 필요해지면 정적 JSON을 DB 테이블(`pbxFeatureHelp` 등)로 승격하고 조회 API를 추가한다.
- 매뉴얼 PDF / 엑셀 본문 기반 초안 추출(`loadManualDrafts`, `loadXlsxDrafts`)은 자료 내부 구조 확정 후 `build-pbx-feature-help.ts`에 추가한다.
