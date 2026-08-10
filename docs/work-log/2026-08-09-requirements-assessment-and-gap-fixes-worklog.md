# 요구사항 평가표 작성과 미구현 3건 해소 작업 로그

작업일: 2026-08-09
브랜치: `docs/requirements-implementation-assessment`
기준 커밋: `c8e2f62` (PR #8 병합 시점) → `1dc7b78`

## 1. 무엇을 했나

요청은 두 단계였다.

1. 설계 문서·고객 요구사항과 현재 구현을 대조해 **평가표**를 만든다.
2. 평가에서 나온 **미구현 3건을 작업 목록에 넣고 처리**한다.

결과: 평가표 1건 + 계획서 1건을 쓰고, 미구현 3건을 모두 구현했다.
그 과정에서 **화면이 사실과 다른 결함 1건**을 찾아 함께 고쳤다.

## 2. 커밋

| 커밋 | 내용 |
|---|---|
| `ac73866` | 요구사항 대비 구현 평가표 추가 |
| `0aee5f6` | 당겨받기 2초 이내 1회 중복 억제 |
| `e7afa28` | 서버 버전/빌드 식별 노출 |
| `aa1f254` | 기능코드 registry 계획서 + `*8` 허위 표시 발견 기록 |
| `061cce2` | 기능코드 registry (서버) |
| `8af63b2` | 기능코드 화면 + 번호 자원 행 정정 (관리자) |
| `ef4cc61` | 평가표에 완료 3건 반영 |
| `1dc7b78` | prisma format 이 만든 스키마 전체 재정렬 되돌림 |

변경 규모: 35파일. 신규 테스트 29건.

## 3. 평가표 (`ac73866`)

### 요구사항 원천을 어떻게 고정했나

원본 엑셀 `1_비씨앤 IP PBX 초안_20260104.xlsx` 의 **셀 배경색**을 openpyxl 로 읽어
요구 범위를 확정했다. 상단 안내문이 `1.노랑>적용필요` 이므로 **노란색(`FFFFFF00`) 42건이
요구 범위**이지 MMC 전체 목록이 아니다. 이 구분을 하지 않으면 900개 가까운 MMC 를
전부 요구사항으로 오인한다.

축 5개 / 66건으로 정리했다: MMC 노랑 42, 주요확인 4, 주요연동 11, IPCC 우선순위 4,
내부 설계문서 계약 5.

### 판정 결과

작성 시점 기준 구현 25 / 변경구현 13 / 부분구현 18 / 미지원 8 / 불가능 2.
(3건 해소 후 구현 26 / 부분구현 17)

### 이 문서에서 가장 중요한 것

**`변경구현` 13건이다.** 기능은 있는데 요구서와 이름·형태가 달라 "빠졌다"고 오판되기 쉽다.
특히 MMC 301 서비스 등급은 요구서의 `국제/시외/시내/구내` 4등급이 아니라
`국내/대표번호(15xx·16xx·18xx)/유료(060)/국제` 4카테고리로 재설계돼 있다.
**경계가 다르므로 요구서 기준 검수에서 반드시 지적이 나온다.**

또 원본 요구사항 자체에 모순이 있다. 같은 엑셀 안에서 내선 대역이
`2001~3499`(프로그램 시트) vs `3001~3499`(주요연동 시트), 가상버퍼가
`3501~3999` vs `3501~3799` 로 다르다. 현재 시드 내선은 `1001`/`2001` 이라 **두 안 모두와 어긋난다.**

## 4. 당겨받기 2초 중복 억제 (`0aee5f6`)

요구서 `주요연동` 시트에 **두 번** 적힌 규칙인데 구현에 없었다.
상담원이 키를 연달아 누르면 AMI `Redirect` 가 그대로 여러 번 나갔다.

Redis `SET PX 2000 NX` 로 `(tenantId, agentId)` 단위 선점. 기존
`assertClientCommandNonceUnused` 와 같은 패턴이다.

**설계 판단: 모든 검증을 통과한 뒤에 선점한다.** 거부된 시도가 억제 창을 소모하면
뒤따르는 정상 시도까지 막힌다. 이 동작을 테스트로 고정했다
(`검증을 통과하지 못한 요청은 억제 창을 소모하지 않는다`).

`answer` 가 `pickup` 에 위임하므로 같은 억제 창을 공유한다. 2초 안에 서로 다른 콜을
연달아 받는 것은 실무 흐름이 아니라 그대로 뒀다.

중복은 409 `CONFLICT` 로 반환한다.

## 5. 서버 버전 조회 (`e7afa28`)

MMC 805 대응. 운영 중 "지금 어떤 빌드가 떠 있는가" 를 답할 방법이 없었다.

`GET /admin/settings/system/version` → `version` / `commit` / `buildTime` /
`nodeVersion` / `nodeId` / `startedAt` / `uptimeSeconds`.
버전 노출은 공개 정보가 아니므로 `system` 메뉴 view 권한을 건다.

`commit` / `buildTime` 은 `GIT_COMMIT` / `BUILD_TIME` env 로 주입받고, 없으면
`null` 로 남긴다. **없는 값을 지어내지 않는다.**

### 함정 하나

`package.json` 을 `import` 하면 tsc `rootDir` 이 저장소 루트로 올라가
**`dist/src/main.js` 가 `dist/apps/server/src/main.js` 로 바뀌어 `npm run start` 가 깨진다.**
그래서 실행 시점에 `__dirname` 부터 위로 훑어 읽는다. 소스(`src/modules/admin`)와
빌드 산출물(`dist/src/modules/admin`)의 깊이가 달라 고정 상대경로도 쓸 수 없다.
양쪽 깊이에서 `0.1.0` 을 반환하는 것과 `dist/src/main.js` 유지를 실제로 확인했다.

## 6. 기능코드 registry (`aa1f254` → `061cce2` → `8af63b2`)

### 착수하자마자 나온 발견

**단말에서 다이얼 가능한 기능코드가 하나도 없었다.**

| 확인 대상 | 결과 |
|---|---|
| `infra/asterisk/features.conf` | 파일 없음 |
| dialplan 의 `pickupexten` / `Pickup(` / `PickupChan` / `featuremap` | 0건 |
| 렌더러 6종의 `*8` | 0건 |

그런데 관리자 `번호 자원` 화면은 `*8`(대리응답), `*2`(상담 전환 완료)를 `ACTIVE` 로
표시하고 있었다. `numberResources.ts` 에 하드코딩된 표시 전용 행이었다.
**눌러도 아무 일도 일어나지 않는데 화면은 동작한다고 말하고 있었다.**

또 "기능코드" 라 불리던 env 3개(`ASTERISK_ATXFER_COMPLETE_CODE` /
`ASTERISK_HOLD_FEATURE_CODE` / `ASTERISK_RESUME_FEATURE_CODE`)는 상담원이 누르는 코드가
아니라 **서버가 PBX 로 보내는 DTMF** 였다. 성격이 다른 둘이 같은 이름으로 섞여 있었다.

### 계획서를 먼저 둔 이유

원본 요구서가 이 항목에만 **"협의후 진행"** 이라 적어 뒀고, 카탈로그 범위에 따라
작업량이 8파일에서 12파일 이상으로 달라진다. A/B/C 3안을 정리해 결정을 받았다.
결정: **B안(고정 카탈로그 + 코드값 설정)**, **대리응답 단말 다이얼 연다**, **표기 정정**.

### 계획과 달라진 두 가지

**수신거부를 카탈로그에서 뺐다.** 확인해 보니 `[080-optout-action]` context 의
**고객용 080 IVR 흐름**이지 상담원 기능코드가 아니다. 확정 카탈로그는
대리응답 / 상담 전환 완료 / 보류 / 보류 해제 **4개**다.

**서버 훅이 필요 없어졌다.** 계획에서는 대리응답 대상 채널을 CTI 가 골라 `System()` 훅으로
넘길 생각이었으나, `pjsip.renderer` 가 이미 `named_pickup_group` 을 내보내고 있어
**네이티브 `Pickup()` 한 줄로 끝난다.** 대상 선택과 같은-그룹 제한을 PBX 가 처리하고,
당겨받은 뒤 생기는 `BridgeEnter` 를 SessionEngine 이 받으므로 CTI 세션 추적도 유지된다.

### 설계에서 지킨 선

- **HANDSET_DIAL 만 dialplan 에 렌더링한다.** SERVER_DTMF 를 단말 다이얼로 열면
  CTI 세션 상태와 어긋난다. 이걸 테스트로 고정했다.
- **`code` 는 nullable + unique.** "미설정" 행이 여럿 공존해야 하는데
  Postgres UNIQUE 는 NULL 을 서로 다른 값으로 보므로 이 조합이 성립한다.
- **코드 형식은 `* 또는 # + 숫자 1~6자리`.** 내선·외부발신 패턴과 섞이지 않게 하고
  dialplan 개행 주입을 형식 단계에서 차단한다.
- **registry 우선, 행이 없을 때만 env 폴백.** 행이 있는데 비활성이면 폴백하지 않는다 —
  운영자가 명시적으로 끈 것이다.

### 한쪽만 고치지 않은 부분

`getCallControlCapabilities()` 도 같은 경로로 바꿨다(sync → async + tenantId).
hold 만 DB 를 보고 capabilities 는 env 를 보면 **"UI 는 보류 비활성인데 실제로는 동작"**
하는 어긋남이 생긴다. `auth.service` 호출부와 spec 4곳을 함께 고쳤다.

`asterisk-reload.service` 의 **apply / preview 두 경로 모두**에 배선했다.

## 7. prisma format 되돌림 (`1dc7b78`)

`featureCodes` 모델을 추가하며 `npx prisma format` 을 돌렸더니 스키마 전체가 재정렬돼
diff 에 **공백 변경 1150여 줄**이 섞였다. 실제 변경은 22줄이다.
작업 로그를 쓰며 `git diff --stat` 에서 발견하고 되돌렸다.

교훈: 스키마에 모델을 추가할 때 `prisma format` 을 관성적으로 돌리지 않는다.
`prisma validate` 만으로 충분하다.

## 8. 검증

| 대상 | 결과 |
|---|---|
| `apps/server` 테스트 | **71 suite / 507 test 통과** (작업 전 68 / 474) |
| `apps/server` lint | 통과 |
| `apps/server` build | 통과. `dist/src/main.js` 유지 확인 |
| `apps/admin` 테스트 | **39 file / 143 test 통과** (작업 전 39 / 139) |
| `apps/admin` build | 통과 |
| `prisma validate` / `generate` | 통과 |
| `scripts/check-docs.sh` | 통과 |
| `git diff --check` | 통과 |

TDD 는 RED 확인 후 구현했다. 당겨받기 억제 3건, 버전 5건, 카탈로그 9건,
렌더러 6건, 서비스 10건 모두 실패를 먼저 봤다.

## 9. 하지 못한 것

| 항목 | 이유 | 해소 방법 |
|---|---|---|
| `docs/openapi.json` 갱신 | export 스크립트가 `AppModule` 전체를 부팅해 Postgres/Redis 가 필요한데 **로컬 Docker 데몬 미기동** | `docker compose up -d postgres redis` 후 `npm run openapi:export` |
| `20260809_feature_codes` 마이그레이션 적용 | 같은 이유 | `npm run prisma:sync` |
| 실 PBX 에서 `*8` 당겨받기 동작 | 로컬에 PBX 없음 | `docs/operations/pbx-operational-validation-runbook-20260716.md` |
| `asterisk.featureCodes` 도움말 본문 | 화면의 help key 만 연결했고 본문 미작성 | `apps/admin/scripts/build-pbx-feature-help.ts` |

신규 엔드포인트 3개(`/admin/settings/system/version`, `GET`/`PUT /asterisk-config/feature-codes`)가
OpenAPI 스펙에 빠져 있다. CLAUDE.md 의 "REST 엔드포인트 추가 → `openapi:export`" 규칙 미충족 상태다.

## 10. 남은 판단 (평가표 10장)

개발이 아니라 결정이 필요한 항목이다.

1. **번호대역 확정** — 요구서 내부 모순 2건. 확정 전에는 번호 정책을 코드에 넣지 않는다.
2. **"TAPI 대체(open TSP)" 기대 형태** — 현재는 REST + Socket.IO. 발주 측이 TSP 드라이버
   자체를 기대했다면 별도 제품 범위다.
3. **MMC 301 등급 경계 합의** — 시외·시내 구분이 실제로 필요한지.
4. **"브랜치 그룹"(MMC 315) 용어 확정** — CTI 지사인지 단말 pickup 그룹인지.

구현 대기 중 가장 큰 것은 **콜마너/올플릿 배차 API 연동**(IPCC 우선순위 2)이다.
IPCC 4건 중 유일한 미착수이고 설계는 이미 있다.

## 관련 문서

- 평가표: [`docs/qa/2026-08-09-requirements-vs-implementation-verification.md`](../qa/2026-08-09-requirements-vs-implementation-verification.md)
- 기능코드 계획서: [`docs/plans/2026-08-09-feature-code-registry-plan.md`](../plans/2026-08-09-feature-code-registry-plan.md)
- 선행 매핑표: [`docs/design/pbx-requirements-implementation-mapping-20260716.md`](../design/pbx-requirements-implementation-mapping-20260716.md)
