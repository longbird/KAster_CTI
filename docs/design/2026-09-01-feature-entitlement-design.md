# 기능 자격(entitlement)과 플랫폼 관리자 설계

작성일: 2026-09-01
요구: superadmin 계정이 테넌트별로 기능 노출 여부를 결정한다 (암호화 녹취, ARS 빌더, AI 대시보드 등)
결정 반영: 계정은 **별도 테이블**, 자격 키는 **기능 키 신설** (사용자 결정, 2026-09-01)
개정일: 2026-09-02 — §8 결정 확정 (계정 생성 방식, packet-capture 포함) / D8 추가 (되돌릴 수 없는 기능)
성격: 설계. 구현 계획은 승인 후 별도 `-plan.md`.

---

## 0. 한 줄 요약

**기존 세 겹의 게이트 위에 네 번째 층을 얹는다. 앞의 셋은 "켤 것인가"를 정하고,
이 층은 "켤 수 있는가"를 정한다.**

---

## 1. 현재 상태 (착수 전 실측, 2026-09-01)

이 저장소에는 이미 기능을 막는 장치가 셋 있고, 서로 층이 다르다.

| 층 | 무엇 | 누가 정하나 | 실제 코드 |
|---|---|---|---|
| 1 | env 하드 킬스위치 | 배포/사이트 | `PACKET_CAPTURE_ENABLED`, `CALL_ANALYSIS_ENABLED`, `RECORDING_ENCRYPTION_ENABLED` |
| 2 | 테넌트 토글 | 테넌트 관리자 | `tenantSystemSettings.packetCaptureEnabled` / `.recordingEnabled` |
| 3 | 메뉴 RBAC | 테넌트 관리자 | `MENU_KEYS` × `ROLE_CODES` × `PermissionAction` |

`packet-capture.service.ts` 가 1·2층을 어떻게 겹쳐 쓰는지가 이 저장소의 기존 관용이다.

```ts
if (!this.hardEnabled) throw new ForbiddenException('... (PACKET_CAPTURE_ENABLED)');
const settings = await this.findSettings(tenantId);
if (!settings?.packetCaptureEnabled) throw new ForbiddenException('... 시스템 설정에서 먼저 켜주세요');
```

**빠져 있는 것**: 테넌트 관리자가 2층 토글을 켜는 것을 막을 방법이 없다.
계약하지 않은 기능도 화면에 보이고, 켜면 켜진다.

### 1.1 계정 구조의 제약

- `agents.role` 은 `agent | supervisor | admin` 이고 `ROLE_CODES` 상수에 고정돼 있다
- `agents` 는 `tenantId` 를 가진 **테넌트 소속** 엔티티다
- `refreshTokens` 는 `agentId` + `tenantId` 에 FK 로 묶여 있다
- JWT payload 는 `{ sub, role, extension, tenantId, sid }` 이고 `tenantId` 가 모든 쿼리의 파티션 키다

즉 크로스 테넌트 계정을 `agents` 안에 넣으면 **모든 쿼리의 `tenantId` 조건에 예외 경로를 뚫어야 한다.**
그래서 별도 테이블로 간다.

---

## 2. 설계 결정

### D1 — 플랫폼 관리자는 `agents` 밖의 별도 테이블 (사용자 결정)

`platformAdmins` 를 신설한다. `tenantId` 가 없다.

이 계정은 **상담원이 아니다.** 큐에 배정되지 않고, 통화를 받지 않고, 대시보드·통계·상담원 목록에
나타나지 않는다. `agents` 에 넣으면 그 모든 화면에서 "이 행은 빼야 한다" 는 예외가 생긴다.

대가: 로그인·토큰·가드를 따로 만들어야 한다. 그 대가를 받아들인다.

### D2 — 플랫폼 관리자는 **테넌트 데이터를 읽지 않는다**

권한 범위를 좁게 못 박는다. 할 수 있는 것은 셋뿐이다.

1. 테넌트 목록 조회 (이름·코드·활성 여부까지. 통화·고객·녹취는 아니다)
2. 테넌트별 기능 자격 조회·변경
3. 자기 계정 관리 (비밀번호 변경)
4. 다른 플랫폼 관리자 계정 생성·비활성화 (§8.1 결정에 따라 추가)

**녹취·전문·고객·통화 이력에 접근하지 않는다.** 이 계정이 뚫리면 모든 테넌트가 뚫리므로,
할 수 있는 일을 처음부터 줄여 둔다. 자격 변경은 전부 감사 로그를 남긴다.

### D3 — 자격 키는 메뉴 키와 별개다 (사용자 결정)

`FEATURE_KEYS` 를 신설한다. 기능과 메뉴는 1:1 이 아니다.

- `recording-encryption` — 메뉴가 없다. 동작이다
- `call-analysis` — 메뉴 여러 개(통화 이력 탭 + 상담분류 설정)에 걸친다
- `ai-insights` — 추이 화면 **안의 탭** 하나다
- `ars-flow-builder` — 메뉴 하나에 대응한다

그래서 `FEATURE_KEYS` → 영향받는 `MENU_KEYS` 매핑을 **한 곳**에 둔다.
한쪽만 고쳐지면 메뉴는 사라졌는데 API 는 열려 있는(또는 반대) 상태가 된다.

초기 기능 키:

| 기능 키 | 이름 | 가리는 메뉴 | 추가로 막는 것 | 회수 |
|---|---|---|---|---|
| `call-analysis` | 통화 AI 분석 | `history` 의 AI 탭, `settings/consult-categories` | 전사·분석 API, 분석 sweep 적재 | 가능 |
| `ai-insights` | AI 인사이트 대시보드 | `trends` 의 AI 탭 | `GET /admin/call-insights` | 가능 |
| `ars-flow-builder` | ARS 플로우 빌더 | (Phase 2 신규 메뉴) | `/admin/ars-flows/*` | 가능 |
| `recording-encryption` | 녹취 암호화 | 없음 | 암호화 활성화 자체 | **불가 (D8)** |
| `packet-capture` | 패킷 캡처 | `system/packet-capture` | 캡처 시작 | 가능 |

`packet-capture` 를 넣는 이유: 이미 1·2층이 있는 기능에도 자격 층이 붙는지 한 번 검증해야
나머지 기능의 겹침 규칙이 확정된다.

### D8 — 녹취 암호화는 **한 방향**이다. 켤 수는 있어도 끌 수 없다

다른 기능은 자격을 회수해도 화면이 사라질 뿐 데이터는 그대로다. 암호화는 다르다.

`RecordingEncryptionService.encryptFile()` 은 암호화 직후 **평문을 지운다**(`fs.unlink`).
그래서 자격을 껐다 켜는 것은 되돌리기가 아니라 **혼합 상태를 만드는 일**이다 —
어떤 녹취는 암호문이고 어떤 녹취는 평문인 저장소가 된다.

진짜 위험은 그다음이다. "지금 암호화가 꺼져 있으니 키도 필요 없겠지" 하고
`RECORDING_ENCRYPTION_KEY` 를 치우면, **그 전에 암호화된 녹취를 영구히 읽을 수 없다.**
보존기간이 기본 1095일이므로 3년치가 한 번에 사라질 수 있다.

**결정**: 기능 정의에 `irreversible` 을 둔다. `recording-encryption` 만 `true` 다.

- 자격을 **켜는** 요청은 받는다 (되돌릴 수 없다는 확인을 받은 뒤)
- 자격을 **끄는** 요청은 API 가 거부한다. 화면에서도 잠긴 상태로 보인다
- 켠 시각(`enabledAt`)을 남긴다. 평문/암호문 경계가 언제인지 나중에 알아야 한다

> `irreversible` 을 서비스에 `if (featureKey === 'recording-encryption')` 로 박지 않는 이유는,
> 기능 카탈로그가 이미 기능별 속성 표이기 때문이다. 판정 로직이 특정 키 이름을 알면 안 된다.

**env 는 여전히 끌 수 있다는 점에 주의한다.** 자격은 잠갔지만 `RECORDING_ENCRYPTION_ENABLED=false`
로 바꾸는 것은 이 설계가 막지 못한다(D4 — env 가 최종 거부권). 그래서 **부팅 시 경고**를 넣는다:
암호화 자격이 켜진 테넌트가 하나라도 있는데 env 가 꺼져 있으면 기동 로그에 크게 남긴다.
막지는 않는다 — 막으면 키를 잃은 사이트가 아예 못 뜬다.

### D4 — 겹침 규칙: **자격이 최상위 게이트, env 가 최종 거부권**

```
env 하드 킬스위치  →  자격(superadmin)  →  테넌트 토글  →  메뉴 RBAC
   "이 서버가          "이 테넌트가        "지금 켜져       "이 사람이
    할 수 있나"          가질 수 있나"        있나"           보는가"
```

읽는 순서는 위와 같지만 **거부권은 env 가 끝까지 갖는다.** env 가 꺼져 있으면 자격이 있어도 못 한다
(서버에 사이드카가 없거나 키가 없는 상태에서 켜지면 런타임에 실패할 뿐이다).

자격이 없으면:
- 메뉴가 **보이지 않는다** (요구의 "감출지")
- API 는 403 이다 (숨기기만 하면 URL 로 들어올 수 있다)
- 테넌트 토글은 **읽지도 않는다.** 켜져 있어도 무효다
- 이미 켜져 있던 테넌트에서 자격을 회수하면 → 다음 요청부터 막힌다. 데이터는 지우지 않는다

### D5 — 판정은 서버가 한 곳에서

`FeatureEntitlementService.isEnabled(tenantId, featureKey)` 하나가 진실원이다.
각 모듈이 자기 방식으로 판단하면 어긋난다.

기존 `MenuPermissionService` 와 같은 위치(`src/common/`)에 두고 같은 방식으로 주입한다.
캐시는 짧게(수십 초) 둔다 — 자격 변경이 즉시 반영돼야 하지만 매 요청 DB 조회는 과하다.

### D6 — 화면에서 숨기는 것도 서버가 정한 목록으로

관리자 앱은 이미 `usePermissionStore.allowedPaths` 로 메뉴를 거른다
(`filterMenuByAllowedPaths`). 자격도 **같은 경로**로 흘린다 —
`GET /me/session` 또는 권한 조회 응답에 `enabledFeatures: string[]` 를 실어 보내고,
`allowedPaths` 계산에서 자격 없는 기능의 메뉴 키를 뺀다.

클라이언트가 기능 목록을 스스로 판단하지 않는다. 서버가 준 목록만 쓴다.

### D7 — 기본값은 **켜짐**, 신규 기능은 **꺼짐**

- 이미 운영 중인 기능(`packet-capture`)은 기존 사이트에서 갑자기 사라지면 안 된다 → 기본 허용
- 이번에 새로 만든 기능(`call-analysis`, `ai-insights`, `ars-flow-builder`)은 기본 차단

행이 없을 때의 판정을 기능 키별 기본값 상수로 둔다. "행이 없으면 무조건 허용/차단" 같은
단일 규칙은 둘 중 하나를 반드시 틀리게 만든다.

---

## 3. 데이터 모델 (초안)

```prisma
model platformAdmins {
  platformAdminId String    @id @default(uuid()) @db.Uuid
  loginId         String    @unique @db.VarChar(64)
  displayName     String    @db.VarChar(128)
  passwordHash    String    @db.Text
  isActive        Boolean   @default(true)
  /// 부트스트랩 env 로 만든 계정은 첫 로그인에서 반드시 비밀번호를 바꿔야 한다.
  /// env 파일에 남은 값이 그대로 운영 비밀번호가 되는 것을 막는다.
  mustChangePassword Boolean @default(false)
  lastLoginAt     DateTime? @db.Timestamptz(6)
  createdAt       DateTime  @default(now()) @db.Timestamptz(6)
  updatedAt       DateTime  @updatedAt @db.Timestamptz(6)
}

model platformAdminRefreshTokens {
  refreshTokenId  String    @id @default(uuid()) @db.Uuid
  platformAdminId String    @db.Uuid
  tokenHash       String    @unique @db.VarChar(64)
  issuedAt        DateTime  @default(now()) @db.Timestamptz(6)
  expiresAt       DateTime  @db.Timestamptz(6)
  revokedAt       DateTime? @db.Timestamptz(6)
  userAgent       String?   @db.VarChar(255)
  ipAddress       String?   @db.VarChar(64)
}

model tenantFeatureEntitlements {
  entitlementId   String   @id @default(uuid()) @db.Uuid
  tenantId        String   @db.Uuid
  featureKey      String   @db.VarChar(64)
  enabled         Boolean
  /// 처음 켠 시각. 되돌릴 수 없는 기능(D8)의 평문/암호문 경계를 나중에 알아야 한다.
  enabledAt       DateTime? @db.Timestamptz(6)
  note            String?
  updatedByAdminId String? @db.Uuid
  createdAt       DateTime @default(now()) @db.Timestamptz(6)
  updatedAt       DateTime @updatedAt @db.Timestamptz(6)

  @@unique([tenantId, featureKey])
  @@index([tenantId])
}

model tenantFeatureEntitlementAuditLogs {
  auditLogId      String   @id @default(uuid()) @db.Uuid
  tenantId        String   @db.Uuid
  featureKey      String   @db.VarChar(64)
  platformAdminId String?  @db.Uuid
  beforeEnabled   Boolean?
  afterEnabled    Boolean
  note            String?
  clientIp        String?  @db.VarChar(64)
  createdAt       DateTime @default(now()) @db.Timestamptz(6)

  @@index([tenantId, createdAt(sort: Desc)])
}
```

`tenantFeatureEntitlements` 에 행이 **없으면** D7 의 기능별 기본값을 쓴다.
감사 로그를 별도 테이블로 두는 이유는 `callRecordingAccessAuditLogs` / `packetCaptureAccessAuditLogs` 와
같은 관용을 따르기 위해서다 — 이 저장소는 위험한 조작마다 감사 테이블을 따로 둔다.

---

## 4. 인증 경로

플랫폼 관리자는 상담원과 **다른 로그인 경로**를 쓴다.

| | 상담원/관리자 | 플랫폼 관리자 |
|---|---|---|
| 로그인 | `POST /auth/login` (loginId + extension) | `POST /platform/auth/login` (loginId + password) |
| JWT payload | `{ sub, role, extension, tenantId, sid }` | `{ sub, scope: 'platform' }` — **tenantId 가 없다** |
| 가드 | `JwtAuthGuard` + `RolesGuard` | `PlatformAdminGuard` |
| refresh | `refreshTokens` | `platformAdminRefreshTokens` |

**같은 `JWT_SECRET` 을 쓰되 payload 에 `scope` 를 넣어 구분한다.**
`JwtAuthGuard` 는 `scope: 'platform'` 토큰을 거부하고, `PlatformAdminGuard` 는 그 반대다.
한쪽 토큰으로 다른 쪽 API 를 부를 수 없어야 한다 — 이 검사가 이 설계에서 가장 중요한 한 줄이다.

> 대안으로 별도 시크릿(`PLATFORM_JWT_SECRET`)을 두는 방법도 있다. 더 안전하지만 env 가 하나 늘고
> 운영에서 잊히기 쉽다. **`scope` 검사를 양쪽 가드의 spec 으로 고정하는 것**으로 대신한다.

---

## 5. 관리 화면

기존 관리자 앱(`apps/admin`) 안에 **`/platform/*` 경로**로 둔다. 별도 앱을 만들지 않는다.

- 로그인 화면이 분리된다 (`/platform/login`)
- 플랫폼 관리자로 로그인하면 기존 좌측 메뉴 전체가 사라지고 플랫폼 메뉴만 남는다
- 화면 둘: **테넌트 목록**, **테넌트별 기능 자격** (체크박스 격자 + 변경 이력)

별도 앱을 만들지 않는 이유는 빌드·배포·인증 클라이언트를 하나 더 유지할 값어치가 없기 때문이다.
대신 **번들에서 플랫폼 화면을 지연 로드**해 일반 관리자가 내려받지 않게 한다.

---

## 6. 위험과 대응

| 위험 | 대응 |
|---|---|
| 플랫폼 계정 탈취 = 전 테넌트 노출 | D2 — 테넌트 업무 데이터에 접근 자체를 안 만든다 |
| 상담원 토큰으로 플랫폼 API 호출 | JWT `scope` 검사를 양쪽 가드에 두고 spec 으로 고정 |
| 플랫폼 토큰으로 테넌트 API 호출 | 위와 같음 (반대 방향도 막는다) |
| 자격 회수 후에도 API 가 열려 있음 | D5 — 판정 서비스 한 곳. 캐시 TTL 을 짧게 |
| 메뉴는 숨겼는데 URL 로 들어옴 | D4 — 숨김과 403 을 항상 함께 |
| 기존 사이트에서 기능이 갑자기 사라짐 | D7 — 기존 기능은 기본 허용 |
| 기능↔메뉴 매핑이 어긋남 | D3 — 매핑을 한 곳에 두고 spec 으로 고정 |
| 자격을 누가 언제 바꿨는지 모름 | 감사 로그 테이블 + 화면에 변경 이력 |
| **암호화 자격 회수 → 혼합 저장소** | D8 — 끄는 요청을 API 가 거부한다 |
| **암호화 켠 뒤 키 분실 → 3년치 유실** | D8 — 부팅 시 경고. 운영 문서에 "키를 절대 잃지 말 것" 명시 |
| 암호화 자격은 잠갔는데 env 로 꺼짐 | D8 — 부팅 경고. 막지는 않는다(키 잃은 사이트가 못 뜨면 더 나쁘다) |

---

## 7. 이 설계가 만들지 않는 것

- 플랫폼 관리자의 테넌트 업무 데이터 조회 (D2)
- 요금제·과금 개념 — 자격은 on/off 뿐이다. 사용량 한도는 여기 없다
- 암호화된 녹취를 되돌리는(복호해서 평문으로 되돌리는) 기능 — 만들지 않는다
- 기능별 세부 옵션 (예: "AI 분석은 되지만 감정만") — 필요해지면 그때 확장한다
- 별도 프론트엔드 앱 (§5)
- 기존 세 층의 대체 — 넷은 함께 쓰인다 (D4)

---

## 8. 결정이 필요한 것

두 가지 모두 2026-09-02 에 결정됐다.

### 8.1 계정 생성 → **부트스트랩 env + 화면에서 추가**

- **첫 계정만** `PLATFORM_ADMIN_BOOTSTRAP_LOGIN` / `_PASSWORD` 로 만든다.
  `platformAdmins` 가 **0건일 때만** 동작하고, 계정이 생기면 이후 부팅에서는 아무것도 하지 않는다.
- 그 계정은 `mustChangePassword=true` 로 만들어져 **첫 로그인에서 비밀번호를 바꿔야** 진행된다.
  env 파일에 남은 값은 1회용 초기 비밀번호이지 운영 비밀번호가 아니다.
- **두 번째 계정부터는 플랫폼 관리자 화면에서** 만든다.

CLI(b)를 고르지 않은 이유: 운영 이미지는 `dist` 로 돌아 ts-node·devDependencies 가 없을 수 있어
별도 진입점을 넣어야 하고, 배포 자동화에 얹히지 않아 사이트마다 사람이 손으로 한 단계를 더 밟는다.
시드(a)를 고르지 않은 이유: `prisma/seed.ts` 는 데모 데이터 생성기이고 `deploy-prod.sh` 가 부르지도 않는다.

### 8.2 `packet-capture` 를 자격 대상에 → **넣는다**

이미 1·2층이 있는 기능에 4층이 겹칠 때 무슨 일이 생기는지 실측해야
나머지 기능의 겹침 규칙(D4)이 확정된다. 기본값은 허용이라 기존 사이트 영향은 없다.
