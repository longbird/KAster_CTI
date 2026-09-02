# 기능 자격 · 플랫폼 관리자 구현 계획

작성일: 2026-09-02
설계서: [`docs/design/2026-09-01-feature-entitlement-design.md`](../design/2026-09-01-feature-entitlement-design.md)
결정 반영: 별도 테이블 / 기능 키 신설 / 부트스트랩 env + 화면 추가 / `packet-capture` 포함 /
**녹취 암호화는 되돌릴 수 없음 (설계 D8)**

---

## 0. 단계

| Phase | 내용 | 상세도 |
|---|---|---|
| 0 | 기능 키 카탈로그 + 판정 서비스 (서버 내부만) | **실행 가능** |
| 1 | 기존 기능에 자격 게이트 결선 + 메뉴 숨김 | **실행 가능** |
| 2 | 플랫폼 관리자 인증 (테이블·부트스트랩·가드) | **실행 가능** |
| 3 | 플랫폼 관리자 화면 | 범위 정의 |

Phase 0·1 을 먼저 하는 이유: **자격 판정이 실제로 동작한 뒤에** 그걸 조작할 계정을 만든다.
순서를 뒤집으면 아무것도 막지 못하는 화면을 먼저 만들게 된다.

Phase 0·1 구간에서는 `tenantFeatureEntitlements` 행이 없으므로 전부 **기능별 기본값**으로 판정된다
(설계 D7). 즉 이 구간만으로도 "신규 기능은 기본 차단" 이 성립한다.

---

## Phase 0 — 기능 키와 판정 서비스

### 0.1 기능 키 카탈로그

`src/common/feature-catalog.ts` — 순수 상수 + 매핑. 이 파일이 진실원이다.

```ts
export const FEATURE_KEYS = [
  'call-analysis',
  'ai-insights',
  'ars-flow-builder',
  'recording-encryption',
  'packet-capture',
] as const;

export interface FeatureDefinition {
  key: FeatureKey;
  name: string;          // 화면에 보이는 한국어 이름
  description: string;
  defaultEnabled: boolean;
  /** 자격이 없을 때 감출 메뉴 키. MENU_KEYS 의 부분집합이어야 한다. */
  menuKeys: string[];
  /** 한 번 켜면 끌 수 없다. 지금은 recording-encryption 만 true (설계 D8). */
  irreversible: boolean;
}
```

| 기능 키 | 기본값 | 감출 메뉴 | 회수 |
|---|---|---|---|
| `call-analysis` | **차단** | `settings/consult-categories` | 가능 |
| `ai-insights` | **차단** | (없음 — `trends` 화면 안의 탭) | 가능 |
| `ars-flow-builder` | **차단** | (Phase 2 에서 메뉴 생기면 추가) | 가능 |
| `recording-encryption` | **차단** | (없음 — 동작) | **불가** |
| `packet-capture` | **허용** | `system/packet-capture` | 가능 |

`packet-capture` 만 기본 허용인 이유는 이미 운영 중이기 때문이다(설계 D7).

**spec 으로 고정할 것**
1. `menuKeys` 의 모든 값이 `MENU_KEYS` 안에 있는가 — 없는 키를 적으면 아무것도 안 감춰지는데
   조용히 통과한다
2. `irreversible` 인 기능은 `defaultEnabled` 가 `false` 인가 — 되돌릴 수 없는 기능이
   기본으로 켜져 있으면 끌 방법이 영영 없다

### 0.2 판정 서비스

`src/common/feature-entitlement.service.ts`

```ts
isEnabled(tenantId: string, featureKey: FeatureKey): Promise<boolean>
listForTenant(tenantId: string): Promise<Record<FeatureKey, boolean>>
assertEnabled(tenantId: string, featureKey: FeatureKey): Promise<void>  // 없으면 403
```

- 행이 없으면 `defaultEnabled`
- 캐시: 테넌트별 30초 in-memory. 자격 변경 시 해당 테넌트 캐시를 즉시 무효화
- `setEnabled()` 는 **되돌릴 수 없는 기능을 끄려는 요청을 거부**한다(설계 D8).
  판정 로직이 특정 키 이름을 알면 안 되므로 카탈로그의 `irreversible` 만 본다
- **멀티노드 주의**: 다른 노드의 캐시는 즉시 지워지지 않는다. 최대 30초 지연을 허용한다
  (자격은 초 단위 정합성이 필요한 값이 아니다). 이 사실을 서비스 주석에 남긴다

`MenuPermissionService` 와 같은 위치·같은 주입 방식을 쓴다.

### 0.3 스키마

설계 §3 의 4개 모델. Phase 0 에서는 `tenantFeatureEntitlements` 와
`tenantFeatureEntitlementAuditLogs` 만 실제로 읽고 쓴다.
`platformAdmins` / `platformAdminRefreshTokens` 는 Phase 2 에서 쓰지만 **마이그레이션은 한 번에** 만든다
(미적용 마이그레이션을 더 늘리지 않는다).

### 0.4 검증

| 주장 | 근거 |
|---|---|
| 카탈로그 정합성 | `feature-catalog.spec.ts` — 모든 `menuKeys` ⊂ `MENU_KEYS` |
| 판정 기본값 | 행 없을 때 기능별 기본값이 나오는가 |
| 판정 우선순위 | 행이 있으면 행이 이긴다 |
| 캐시 무효화 | 변경 후 같은 테넌트 조회가 새 값을 준다 |
| **되돌릴 수 없는 기능** | 켜기는 되고, 끄기는 거부된다. `irreversible=false` 인 기능은 꺼진다 |
| **카탈로그 정합성 2** | `irreversible` 인 기능은 `defaultEnabled=false` |
| 스키마 | `prisma validate` + `generate` |

---

## Phase 1 — 결선

### 1.1 서버 게이트

각 기능의 **진입점 한 곳**에 `assertEnabled` 를 넣는다. 여러 곳에 흩뿌리지 않는다.

| 기능 | 넣을 곳 |
|---|---|
| `call-analysis` | `CallAnalysisController` 전체 + `CallAnalysisReconcileService.sweep` 의 테넌트별 적재 |
| `ai-insights` | `TrendsController.callInsightsQuery` |
| `ars-flow-builder` | `ArsFlowController` 전체 |
| `packet-capture` | `PacketCaptureService.startCapture` — 기존 1·2층 검사 **앞에** |
| `recording-encryption` | `RecordingFinalizerService` 가 자격을 판정해 넘긴다 (아래) |

**`recording-encryption` 은 특별하다.** 지금 `isEnabled()` 는 env 만 보고 동기 함수다.
자격은 비동기 DB 조회라 시그니처가 바뀐다. 호출부는 `RecordingFinalizerService` 뿐이므로
거기서 자격을 먼저 판정해 넘기는 쪽이 파급이 작다 — **암호화 서비스는 그대로 두고
finalizer 가 결정한다.**

자격은 회수될 수 없지만(D8), **복호 경로는 애초에 자격을 보지 않는다.**
자격 판정은 "새 녹취를 암호화할 것인가" 에만 쓰고, "이미 암호화된 것을 읽을 것인가" 에는 쓰지 않는다.
이 둘을 섞으면 언젠가 기존 녹취를 못 듣게 된다. spec 으로 고정한다.

**부팅 경고 (설계 D8)**: 암호화 자격이 켜진 테넌트가 하나라도 있는데
`RECORDING_ENCRYPTION_ENABLED` 가 꺼져 있으면 기동 로그에 크게 남긴다. **막지는 않는다** —
막으면 키를 잃은 사이트가 아예 못 뜬다.

`call-analysis` 의 sweep 게이트는 **적재(reconcile) 지점**에 둔다. 이미 쌓인 job 은 마저 처리한다 —
처리 중인 통화를 어중간하게 남기지 않는다.

### 1.2 메뉴 숨김

`GET /me/session` (또는 권한 조회) 응답에 `enabledFeatures: string[]` 를 싣는다.
`usePermissionStore` 가 `allowedPaths` 를 만들 때 자격 없는 기능의 `menuKeys` 를 뺀다.

화면 안의 탭(`ai-insights`, `call-analysis` 의 이력 탭)은 메뉴 키가 없으므로
`enabledFeatures` 를 직접 보고 탭을 렌더하지 않는다.

**클라이언트는 판단하지 않는다.** 서버가 준 `enabledFeatures` 만 쓴다.

### 1.3 검증

| 주장 | 근거 |
|---|---|
| 자격 없으면 403 | 각 컨트롤러 spec |
| 자격 없으면 메뉴가 빠진다 | `usePermissionStore` / `menuConfig` 테스트 |
| 숨김과 403 이 함께 간다 | 기능별로 두 검사를 한 spec 파일에 둔다 |
| 기존 기능 무회귀 | `packet-capture` 기본 허용이므로 기존 spec 그대로 통과 |
| 암호화 회수 후에도 재생 | 복호 경로 spec |

---

## Phase 2 — 플랫폼 관리자 인증

### 2.1 파일 구성

```
src/modules/platform-admin/
  platform-admin.module.ts
  platform-auth.controller.ts        + spec   ← /platform/auth/*
  platform-auth.service.ts           + spec   ← 로그인·refresh·비밀번호 변경
  platform-admin.guard.ts            + spec   ← scope: 'platform' 만 통과
  platform-admin-bootstrap.service.ts + spec  ← 계정 0건일 때만 1회
  platform-tenants.controller.ts     + spec   ← 테넌트 목록 (이름·코드·활성만)
  platform-entitlements.controller.ts + spec  ← 자격 조회·변경 + 이력
  platform-admins.controller.ts      + spec   ← 계정 생성·비활성화
  dto/
```

### 2.2 토큰 격리 — **이 Phase 의 핵심**

같은 `JWT_SECRET` 을 쓰되 payload 에 `scope` 를 넣는다.

- 플랫폼 토큰: `{ sub, scope: 'platform' }` — `tenantId` 없음
- 기존 토큰: `scope` 없음 (또는 `'tenant'`)

**양방향 거부를 spec 으로 고정한다.**

1. `JwtAuthGuard` 는 `scope === 'platform'` 토큰을 거부한다
2. `PlatformAdminGuard` 는 `scope !== 'platform'` 토큰을 거부한다

기존 `JwtAuthGuard` 를 고쳐야 하므로 **기존 인증 spec 이 전부 그대로 통과하는지**를 함께 본다.

### 2.3 부트스트랩

`PlatformAdminBootstrapService` — `OnModuleInit` 에서 1회.

```
PLATFORM_ADMIN_BOOTSTRAP_LOGIN=
PLATFORM_ADMIN_BOOTSTRAP_PASSWORD=
```

- `platformAdmins` 가 **0건일 때만** 생성. 1건이라도 있으면 아무것도 하지 않는다
- 만들어진 계정은 `mustChangePassword=true`
- env 가 비어 있으면 조용히 넘어간다 (기존 사이트가 이것 때문에 못 뜨면 안 된다)
- 생성 시 로그를 남긴다. 비밀번호는 **로그에 찍지 않는다**

`deploy-prod.sh` 의 필수 env 목록에는 **넣지 않는다** — 이미 계정이 있는 사이트는
이 값이 필요 없는데 필수로 걸면 배포가 막힌다. 대신 문서에 적는다.

### 2.4 비밀번호 변경 강제

`mustChangePassword=true` 인 계정은 로그인은 되지만, **비밀번호 변경 외의 모든 플랫폼 API 가 403** 이다.
가드에서 처리한다. 로그인 응답에 `mustChangePassword: true` 를 실어 화면이 바로 변경 폼을 띄운다.

### 2.5 자격 변경 API

```
GET   /platform/tenants                          테넌트 목록
GET   /platform/tenants/:tenantId/entitlements   기능별 현재 값 + 기본값 + 출처(행/기본값)
PUT   /platform/tenants/:tenantId/entitlements/:featureKey   { enabled, note, acknowledgeIrreversible? }
GET   /platform/tenants/:tenantId/entitlements/history       변경 이력
```

변경할 때마다 `tenantFeatureEntitlementAuditLogs` 에 이전값·이후값·누가·언제·IP 를 남긴다.
변경 직후 해당 테넌트의 판정 캐시를 무효화한다.

**되돌릴 수 없는 기능(D8)**:
- 끄는 요청(`enabled: false`)은 409 로 거부한다
- 켜는 요청은 `acknowledgeIrreversible: true` 가 없으면 400 으로 거부한다 —
  실수로 누르는 것과 알고 누르는 것을 구분한다
- 켤 때 `enabledAt` 을 기록한다 (평문/암호문 경계)

### 2.6 검증

| 주장 | 근거 |
|---|---|
| 토큰 격리 (양방향) | 두 가드 spec. **Red-Green** 으로 |
| 부트스트랩 1회성 | 계정 1건 있을 때 아무것도 안 하는지 |
| 부트스트랩 env 없어도 부팅 | 빈 env 로 `onModuleInit` |
| 비밀번호 변경 강제 | `mustChangePassword` 계정이 다른 API 에서 403 |
| 감사 로그 | 변경마다 행이 남는지, 이전값이 맞는지 |
| 암호화 자격 끄기 거부 | 409, 그리고 DB 값이 그대로인지 |
| 확인 없는 켜기 거부 | `acknowledgeIrreversible` 없으면 400 |
| 플랫폼 계정이 테넌트 데이터 못 봄 | 테넌트 업무 API 에 플랫폼 토큰 → 403 |

---

## Phase 3 — 플랫폼 화면 (범위)

- `apps/admin` 안 `/platform/*`, **지연 로드**
- `/platform/login` — 별도 로그인. `mustChangePassword` 면 변경 폼으로
- 테넌트 목록 → 테넌트별 기능 자격 격자(체크박스) + 변경 이력
- **되돌릴 수 없는 기능은 켜기 전에 확인 대화상자**를 띄우고, 켜진 뒤에는 잠긴 상태로 보인다.
  "되돌릴 수 없음" 을 켜기 **전에** 보여야 의미가 있다
- 플랫폼 관리자 계정 관리 (생성·비활성화)
- 플랫폼 토큰은 기존 `kaster.access_token` 과 **다른 localStorage 키**를 쓴다 —
  같은 키를 쓰면 관리자 앱과 서로 로그아웃시킨다

---

## 마이그레이션 적용

사용자 결정(2026-09-02): **자격 작업까지 끝낸 뒤 3건을 한 번에 적용한다.**

1. `20260901_call_analysis`
2. `20260901_ars_flow`
3. `20260902_feature_entitlement` (이번)

적용 시점에 확인할 것: `npm run prisma:sync`, 적용 후 서버 부팅, 부트스트랩 계정 생성 로그,
그리고 그동안 미뤄 둔 **실 DB 대조 검증**(인사이트 SQL, 분석 파이프라인).

---

## 위험과 대응

| 위험 | 대응 |
|---|---|
| 플랫폼 토큰으로 테넌트 API 호출 | 2.2 양방향 거부, Red-Green |
| 테넌트 토큰으로 플랫폼 API 호출 | 위와 같음 |
| `JwtAuthGuard` 수정이 기존 인증을 깬다 | 기존 인증 spec 전량 통과를 함께 확인 |
| 자격 회수로 기존 녹취 재생 불가 | 1.1 — 복호 경로는 자격을 아예 보지 않는다. spec 고정 |
| 암호화 자격을 실수로 켬 | 2.5 — `acknowledgeIrreversible` 확인 + 화면 대화상자 |
| 암호화 켠 뒤 env 로 끄고 키 분실 | 1.1 부팅 경고 + 운영 문서. 코드로는 막지 않는다 |
| 멀티노드 캐시 지연 | 0.2 — 최대 30초. 주석에 명시 |
| 기능↔메뉴 매핑 오타 | 0.1 — `menuKeys ⊂ MENU_KEYS` spec |
| 부트스트랩 env 가 운영 비밀번호로 굳음 | 2.4 — 첫 로그인 변경 강제 |
| 기존 사이트에서 기능이 사라짐 | `packet-capture` 기본 허용 |

---

## 승인 요청

**Phase 0 착수 승인이 필요하다.** 되돌리기 비싼 결정은 둘이다.

- **0.1** — 기능 키를 메뉴 키와 별개로 두고, 기능→메뉴 매핑을 카탈로그 한 곳에 둔다
- **0.1/0.2** — `irreversible` 을 카탈로그 속성으로 두고, 판정 서비스가 특정 키 이름을 모르게 한다
- **2.2** — 별도 시크릿이 아니라 같은 `JWT_SECRET` + `scope` 로 토큰을 가른다
