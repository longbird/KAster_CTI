# 기능코드 registry 구현 계획

작성일: 2026-08-09
요구 원천: `docs/reference/IPPBX_개발시 참조용_20260104/1_비씨앤 IP PBX 초안_20260104.xlsx` `주요연동` 시트
— "각종 기능코드 생성 | **협의후 진행**"
선행 평가: [`docs/qa/2026-08-09-requirements-vs-implementation-verification.md`](../qa/2026-08-09-requirements-vs-implementation-verification.md) 축 C-11

## 1. 착수 전에 알아야 할 발견

**현재 시스템에 단말에서 다이얼할 수 있는 기능코드는 하나도 없다.**
관리자 `번호 자원` 화면이 `*8`(대리응답)과 `*2`(상담 전환 완료)를 `ACTIVE` 로 표시하지만,
**어느 dialplan 에도 렌더링되지 않는다.**

확인한 근거:

| 확인 대상 | 결과 |
|---|---|
| `infra/asterisk/` 의 `features.conf` | **파일 자체가 없다** |
| dialplan 전체의 `pickupexten` / `Pickup(` / `PickupChan` / `featuremap` | **0건** |
| 렌더러 6종(`pjsip`/`dialplan`/`agent-dialplan`/`queues`/`rtp`/`musiconhold`)의 `*8` | **0건** |
| `apps/admin/.../numbers/numberResources.ts` | `FEATURE_CODE_ROWS` 에 2건 하드코딩 (화면 표시 전용) |

즉 상담원이 전화기에서 `*8` 을 눌러도 **아무 일도 일어나지 않는다.** 대리응답은 오직
CTI 앱의 `POST /calls/:callId/pickup` → AMI `Redirect` 경로로만 동작한다.

### 지금 존재하는 "기능코드"의 실체

이름은 기능코드지만 **성격이 다르다.** 셋 다 상담원이 누르는 코드가 아니라
**서버가 PBX 로 보내는 DTMF** 다.

| 값 | 위치 | 실제 의미 |
|---|---|---|
| `ASTERISK_ATXFER_COMPLETE_CODE` (기본 `*2`) | `asterisk-manager.service.ts:95` | 상담 전환 완료 시 서버가 보내는 DTMF |
| `ASTERISK_HOLD_FEATURE_CODE` (기본 없음) | `calls.service.ts:1375` | 보류 시 서버가 보내는 DTMF. 비우면 보류 기능 자체가 비활성 |
| `ASTERISK_RESUME_FEATURE_CODE` (기본 없음) | `calls.service.ts:1376` | 보류 해제 DTMF |

**이 값들은 env 에 있어 테넌트별로 다르게 줄 수 없고, 바꾸려면 재배포해야 한다.**

## 2. 요구사항 해석

MMC 관점의 "기능코드"는 **사용자가 단말에서 다이얼해 기능을 호출하는 접근 코드**다
(예: `*8` 을 눌러 울리는 벨 당겨받기, `*21` 로 착신전환 설정).

따라서 요구를 충족하려면 두 가지가 모두 필요하다.

1. **코드를 관리하는 registry** — 어떤 코드가 어떤 기능에 매핑되는지, 켜져 있는지, 충돌하지 않는지
2. **코드가 실제로 동작하는 경로** — dialplan 렌더링 + 기능 실행

1번만 만들면 **화면에는 보이는데 눌러도 안 되는** 지금 상태가 확대될 뿐이다.

## 3. 재사용 가능한 기반

이미 검증된 두 가지 패턴이 있어 새로 만들 것이 많지 않다.

**(a) `agent-phone-{내선}` context 의 exact match** — 단축 발신이 이미 이 방식이다.
`agent-dialplan.renderer.ts:214` `renderAgentSpeedDialLines()` 가 코드별 `exten =>` 를 생성한다.
기능코드도 같은 자리에 렌더링하면 된다.

**(b) `System()` 콜백 훅** — 수신거부/Smart ARS 가 이미 쓴다
(`dialplan.renderer.ts:952, 985, 1266`). `KASTER_INTERNAL_SECRET` 을 들고 NestJS 로 콜백한다.
CTI 상태를 알아야 하는 기능(대리응답 대상 선택 등)은 이 경로가 필요하다.

## 4. 선택지

### A안 — 기존 3개 코드만 env → DB 이관 (최소)

`featureCodes` 테이블 + 관리자 화면. 새 기능 없음. 단말 다이얼 없음.

- 얻는 것: 테넌트별 값 분리, 재배포 없이 변경, `*8` 허위 표시 제거
- **못 얻는 것: 요구사항의 "기능코드 생성" 본래 의미(단말 다이얼)를 충족하지 못한다**
- 규모: 스키마 1 + 마이그레이션 1 + 서비스/컨트롤러 2 + UI 1 + 소비처 3 ≈ 8파일

### B안 — 고정 카탈로그 + 코드값 설정 (권장)

시스템이 지원하는 기능을 **고정 목록**으로 두고, 각 기능의 **코드 값과 활성 여부만** 테넌트가 정한다.

카탈로그 후보:

| 기능 | 기본 코드 | 실행 방식 | 비고 |
|---|---|---|---|
| 대리응답 | `*8` | `System()` 훅 → CTI 가 대상 콜 선택 | 같은 그룹 제한은 기존 `assertPickupAllowed` 재사용 |
| 상담 전환 완료 | `*2` | 서버 발신 DTMF (현행 유지) | 단말 다이얼 아님 |
| 보류 / 보류 해제 | 미설정 | 서버 발신 DTMF (현행 유지) | 비우면 비활성 (현행 동작 유지) |
| 수신거부 등록 | 기존 훅 | `System()` 훅 (이미 있음) | registry 로 코드값만 노출 |

- 얻는 것: 코드 충돌 검증(`/numbers` 인덱스와 통합), 테넌트별 값, 실제 동작
- 규모: A안 + dialplan 렌더러 + 훅 엔드포인트 + 렌더러 spec ≈ 12파일
- **자유 입력이 아닌 이유: PBX 는 코드가 "무엇을 하는지" 알아야 한다.**
  임의 코드를 만들 수 있게 하면 매핑할 동작이 없다

### C안 — 자유 정의 registry

운영자가 코드와 동작(전달 대상)을 자유 조합. 단축 발신과 기능이 겹치고,
동작 목록이 결국 고정 카탈로그라 B안과 실질 차이가 없으면서 검증만 복잡해진다. **비권장.**

## 5. 권장

**B안.** 근거는 세 가지다.

1. 요구사항의 본래 의미(단말 다이얼)를 충족하는 최소 안이다.
2. 기존 단축 발신·`System()` 훅 패턴을 그대로 재사용하므로 새 아키텍처가 없다.
3. 고정 카탈로그라 코드값 검증(`/numbers` 충돌 인덱스)과 도움말 연결이 결정적이다.

## 6. B안 구현 단계

| 단계 | 내용 | 검증 |
|---:|---|---|
| 1 | `featureCodes` 모델 + 마이그레이션 (`tenantId`, `featureKey`, `code`, `enabled`) — `@@unique([tenantId, featureKey])`, `@@unique([tenantId, code])` | `npm run prisma:sync` |
| 2 | 카탈로그 상수 + 코드값 검증 (내선/DID/큐/단축발신 패턴 충돌 거부) | 순수 함수 spec |
| 3 | CRUD API (`/asterisk-config/feature-codes`) + 메뉴 권한 키 | 서비스 spec |
| 4 | `agent-dialplan.renderer.ts` 에 기능코드 exten 렌더링 | `agent-dialplan.renderer.spec.ts` |
| 5 | 대리응답 `System()` 훅 엔드포인트 (`KASTER_INTERNAL_SECRET` 검증) | 통합 spec |
| 6 | 관리자 UI 탭 + `numberResources.ts` 를 registry 기반으로 교체 | vitest |
| 7 | 기존 env 3개를 registry 값으로 대체하고 env 는 fallback 으로만 유지 | 기존 calls spec 갱신 |

각 단계 통과 후 커밋. `docs/openapi.json` 갱신 포함.

## 7. 결정이 필요한 것

1. **카탈로그 범위** — 위 4개로 시작할지, 착신전환 on/off·DND 토글·즉시 녹취 시작 등을 넣을지.
   요구서가 "협의후 진행"이라 적은 지점이다.
2. **대리응답을 단말 다이얼로도 열지** — 현재는 CTI 앱 전용이다. 단말에서 `*8` 을 허용하면
   CTI 를 거치지 않는 경로가 생겨 세션 상태 추적과 권한 검증이 훅 구현에 의존하게 된다.
3. **`*8` / `*2` 허위 표시의 임시 조치** — registry 완성 전까지
   (a) 화면에서 제거, (b) "CTI 앱 전용 · 단말 다이얼 불가"로 표기 정정, (c) 그대로 둔다.

## 8. 이 계획이 다루지 않는 것

- 단말 키버튼 매핑 (MMC 722/723) — PBX 계층에서 불가능. 별도 판단은 평가표 4.5 참조
- 개인별 단축 다이얼 (MMC 105) — 기능코드가 아니라 단축 발신 확장 영역
