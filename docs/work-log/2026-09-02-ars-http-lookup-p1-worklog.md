# ARS `HTTP_LOOKUP` P1 작업 기록

작성일: 2026-09-02
설계서: [`../design/2026-09-02-ars-http-lookup-design.md`](../design/2026-09-02-ars-http-lookup-design.md)
계획서: [`../plans/2026-09-02-ars-http-lookup-p1-plan.md`](../plans/2026-09-02-ars-http-lookup-p1-plan.md)

P1 = 엔드포인트 레지스트리 + 조회 서비스 + 테스트 호출. **통화 경로는 건드리지 않았다.**

---

## 1. 승인으로 확정된 결정

설계서 §11 의 권고안 3개가 그대로 확정됐다 (2026-09-02).

1. `NOMATCH` 와 `ERROR` 를 하나의 `FALSE` 간선으로 묶는다 → P2 에서 쓴다
2. 조회 중 안내는 노드에 둔다 → P2 에서 쓴다
3. 엔드포인트 등록·수정·삭제는 **admin 전용** → P1 에 적용됨 (조회는 supervisor 도 가능)

---

## 2. 넣은 것

```
src/modules/ars-http-lookup/
  safe-target.util.ts          SSRF 주소 검사 (순수 + 리졸버 주입)
  response-extract.util.ts     점 표기 추출 + 값 깎기 + match 판정 (순수)
  request-mapping.util.ts      요청 조립 — 고정 5개 출처만 (순수)
  circuit-breaker.ts           5회/60초 → 60초 열림, 반열림 1건 (순수 + 시계 주입)
  endpoint-secret.util.ts      AES-256-GCM (순수)
  ars-http-lookup.service.ts   위 다섯을 엮어 fetch 를 부른다
  ars-http-endpoints.service.ts CRUD. 자격증명은 쓰기 전용
  ars-http-endpoints.controller.ts
```

관리자 화면은 **PBX 설정 안의 "외부 조회" 탭**이다. `ars-http-lookup` 자격이 없으면 탭 자체를 만들지 않는다.

---

## 3. 설계에서 온 것 중 코드에 그대로 남은 판단

- **실패는 예외가 아니라 결과다.** `ArsHttpLookupService.lookup()` 은 던지지 않고 항상
  `LookupOutcome` 을 준다. P2 의 AGI 가 그것을 `FALSE` 간선으로 바꾼다.
- **재시도 없음.** 통화 중 재시도는 고객 대기를 배로 늘린다. 코드에 재시도 경로가 아예 없다.
- **주소 검사를 등록·호출 두 시점에.** 등록 때만 하면 나중에 DNS 를 바꿔치기해 우회할 수 있다.
- **`dns.lookup` 을 쓴다.** `dns.resolve4` 가 아니다 — `fetch` 가 실제로 쓰는 것과 같은 해석기여야
  검사가 의미를 갖는다.
- **`NOMATCH` 는 차단기의 성공이다.** "그 고객이 없다" 는 엔드포인트가 건강하다는 뜻이다.
- **본문을 상한까지만 읽는다.** `response.text()` 는 크기와 무관하게 전부 버퍼링한다.
  스트림 리더로 64KB 에서 끊는다.

---

## 4. 만들면서 잡은 것

### 4.1 시계가 0 에서 시작하면 차단기가 안 열렸다

`if (!state.openedAt)` 이 `openedAt = 0` 을 falsy 로 읽어 열림 상태가 사라졌다.
테스트가 시계를 0 에서 시작해서 드러났다. `=== null` 로 판정하도록 고쳤다.

실제 운영에서는 `Date.now()` 라 0 이 나올 일이 없지만, **판정을 값의 진위에 맡긴 것 자체가 결함**이다.

### 4.2 `strict: false` 에서 판별 유니온을 믿을 수 없다

`{ ok: true; value } | { ok: false; reason }` 좁히기가 동작하지 않았다.
한 모양(`{ ok, value?, reason? }`)으로 바꿨다. 이 저장소의 tsconfig 전제에 맞춘 것이다.

### 4.3 기능 개수를 숫자로 박아둔 테스트

`feature-entitlement.service.spec.ts` 가 `toHaveLength(5)` 였다. 카탈로그에 기능을 더할 때마다
숫자를 고치게 두지 않고 `FEATURE_KEYS.length` 로 바꿨다.

---

## 5. 검증 결과 (2026-09-02 실행)

| 항목 | 명령 | 결과 |
|---|---|---|
| 스키마 | `npx prisma validate` | valid |
| 클라이언트 | `npx prisma generate` | 성공 |
| 순수 유틸 | `npx jest src/modules/ars-http-lookup` | 88 passed / 7 suites |
| 실 소켓 왕복 | `npx jest test/ars-http-lookup.integration.spec.ts` | 9 passed |
| 서버 전체 | `npm test` | **1470 passed / 159 suites, 실패 0** |
| 서버 린트 | `npm run lint` | 0 error |
| 서버 빌드 | `npm run build` | exit 0 |
| 관리자 테스트 | `npx vitest run` | 311 passed / 57 files |
| 관리자 타입체크 | `npx tsc -b` | 오류 0 |
| 관리자 빌드 | `npx vite build` | 성공 |
| OpenAPI | `npm run openapi:export` | 엔드포인트 5개 반영 |

**Red-Green (계획서 §5)**: `safe-target.util` 의 링크로컬 차단을 제거하니 4건이 실패했고,
되돌리니 15건 전부 통과했다. 검사가 실제로 그 일을 하고 있다.

**시크릿이 API 로 새지 않는다**도 spec 으로 고정했다 —
목록·단건 응답에 `authSecretEnc` 도 평문도 없고 `hasSecret` 만 있다.

### 5.1 못 한 검증

**마이그레이션을 실제 DB 에 적용하지 못했다.** 로컬 Postgres 가 떠 있지 않다
(Docker Desktop 미실행). `prisma validate` / `generate` 까지만 확인했다.

`20260902_ars_http_endpoints/migration.sql` 은 저장소의 기존 패턴대로 손으로 썼고,
**적용 전에는 이 기능이 동작하지 않는다.** 배포 전에 `npm run prisma:sync` 로 확인해야 한다.

---

## 6. 남은 것

### P2 — 통화 경로 연결

- `kaster-ars-http-lookup.agi` (Python3, `kaster-agent-offer.agi` 와 같은 방식)
- 내부 엔드포인트 (AGI → NestJS, `KASTER_INTERNAL_SECRET`)
- `HTTP_LOOKUP` 노드 + 컴파일러 + 편집기
- 검증기 10~14 (설계서 §7). **11번(폴백 간선 필수)이 설계 §5 전체를 강제하는 검사다**
- 지표 `kaster_ars_http_lookup_*`

### P3 — 파일럿 DID 실통화

### 이번에 하지 않은 것

- 조회 로그를 DB 에 남기지 않는다 (설계 §8). 지표와 로거까지만 두기로 했다
- 엔드포인트별 동시 실행 상한(20)은 **노드 프로세스 안의 카운터**다.
  멀티노드로 띄우면 노드 수만큼 곱해진다. 통화 경로가 붙는 P2 에서 다시 볼 지점이다
