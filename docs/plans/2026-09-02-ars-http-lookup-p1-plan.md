# ARS `HTTP_LOOKUP` P1 구현 계획 — 엔드포인트 레지스트리와 조회 서비스

작성일: 2026-09-02
설계서: [`../design/2026-09-02-ars-http-lookup-design.md`](../design/2026-09-02-ars-http-lookup-design.md) (2026-09-02 승인)
범위: **P1 만.** 통화 경로를 전혀 건드리지 않는다.

승인 시 확정된 결정 3개 (설계서 §11 권고안 그대로):

1. `NOMATCH` 와 `ERROR` 를 하나의 `FALSE` 간선으로 묶는다
2. 조회 중 안내는 **노드**에 둔다 (엔드포인트가 아니라)
3. 엔드포인트 등록·수정·삭제는 **admin 전용**

1·2 는 P2 에서 쓰인다. P1 에서는 3만 즉시 적용된다.

---

## 1. 이 단계의 합격 기준

**관리자 화면에서 외부 API 를 등록하고 "테스트 호출" 을 눌러 실제 응답과 판정 결과를 볼 수 있다.**
전화는 아직 이 경로를 타지 않는다.

P1 이 끝나면 외부 연동의 어려운 부분(인증 형태·주소·응답 구조·값 추출)이 전부 맞춰져 있어야 한다.
P2 는 거기에 dialplan 을 붙이는 일만 남는다.

---

## 2. 스키마 (신규 마이그레이션 1개)

```prisma
model arsHttpEndpoints {
  endpointId     String   @id @default(uuid()) @db.Uuid
  tenantId       String   @db.Uuid
  name           String   @db.VarChar(128)
  description    String?
  method         String   @default("GET") @db.VarChar(8)
  url            String   @db.VarChar(512)
  /// 무엇을 보낼지. { "파라미터명": "CALLER|COLLECTED|ENTRY_DID|LINKEDID|LITERAL:..." }
  requestMapping Json     @default("{}")
  authType       String   @default("NONE") @db.VarChar(16)
  /// 헤더 이름. authType=HEADER 일 때만 쓴다.
  authHeaderName String?  @db.VarChar(64)
  /// AES-256-GCM 암호문. API 로 절대 나가지 않는다.
  authSecretEnc  String?
  resultPath     String   @db.VarChar(256)
  matchMode      String   @default("EXISTS") @db.VarChar(16)
  matchValue     String?  @db.VarChar(256)
  timeoutMs      Int      @default(2000)
  isActive       Boolean  @default(true)
  createdAt      DateTime @default(now()) @db.Timestamptz(6)
  updatedAt      DateTime @updatedAt @db.Timestamptz(6)

  tenant tenants @relation(fields: [tenantId], references: [tenantId], onDelete: Cascade)

  @@unique([tenantId, name])
  @@index([tenantId, isActive])
}
```

P2 에서 `arsFlowNodes.config` 가 `endpointId` 를 가리키지만 **FK 를 걸지 않는다** — config 는 Json 이다.
대신 검증기 10번이 실재를 확인한다(설계서 §7).

기존 마이그레이션은 편집하지 않는다. `npm run prisma:sync` 로 generate + deploy 를 함께 검증한다.

---

## 3. 파일 구성

```
src/modules/ars-http-lookup/
  ars-http-lookup.module.ts
  ars-http-endpoints.controller.ts
  ars-http-endpoints.service.ts     + spec   ← CRUD. 시크릿은 쓰기 전용
  ars-http-lookup.service.ts        + spec   ← 조회 수행 (P2 의 AGI 도 이걸 부른다)
  endpoint-secret.util.ts           + spec   ← AES-256-GCM (순수)
  safe-target.util.ts               + spec   ← SSRF 주소 검사 (순수 + 리졸버 주입)
  circuit-breaker.ts                + spec   ← 상태 기계 (순수 + 시계 주입)
  request-mapping.util.ts           + spec   ← 요청 조립 (순수)
  response-extract.util.ts          + spec   ← 점 표기 추출 + 값 깎기 + match 판정 (순수)
  dto/
```

순수 함수 5개가 이 단계의 본체다. 서비스는 그 위의 껍데기다.

---

## 4. 작업 순서 (TDD)

1. 스키마 + 마이그레이션 → `prisma:sync`
2. `endpoint-secret.util` — 왕복, 키 형식(hex/base64 32바이트), 키 없을 때 명확한 오류
3. `safe-target.util` — **Red-Green 대상.** 링크로컬·루프백·사설대역·리다이렉트 거부
4. `response-extract.util` — 점 표기, 없는 경로 → `NOMATCH`, 값 깎기(64자·금지문자) → `ERROR`
5. `request-mapping.util` — 5개 고정 값만, `GET` 쿼리 / `POST` 본문
6. `circuit-breaker` — 5회/60초 → 열림 60초, half-open 1건
7. `ars-http-lookup.service` — 위 다섯을 엮고 `fetch` 를 부른다. 실 소켓 통합 spec 1개
8. `ars-http-endpoints.service` + 컨트롤러 + DTO + write-availability 등록
9. 기능 카탈로그 `ars-http-lookup` 키 + env 킬 스위치
10. 관리자 화면 (등록 폼 + 테스트 호출)
11. `npm run openapi:export`

---

## 5. 검증 방법 (완료 판정 근거)

| 주장 | 근거 명령 |
|---|---|
| 스키마 반영 | `npm run prisma:sync` exit 0 |
| 순수 단위 | `npx jest src/modules/ars-http-lookup` — 실패 0 |
| 실 소켓 왕복 | `npx jest test/ars-http-lookup.integration.spec.ts` |
| 전체 회귀 | `cd apps/server && npm test` — 실패 0 |
| 린트·빌드 | `npm run lint` / `npm run build` |
| 관리자 | `npx vitest run` + `npx tsc -b` |
| OpenAPI | `npm run openapi:export` 후 diff 존재 |

**Red-Green 대상**: `safe-target.util` 의 링크로컬 차단.
`169.254.169.254` 로 실패하는 테스트를 먼저 만들고, 검사를 넣어 통과시키고, 검사를 빼면 다시 실패해야 한다.

**시크릿이 API 로 새지 않는다**는 것도 spec 으로 고정한다 — 조회 응답에 `hasSecret` 만 있고
`authSecretEnc` 도 평문도 없어야 한다.

---

## 6. P1 에서 하지 않는 것

- AGI 스크립트, 컴파일러, `HTTP_LOOKUP` 노드, 검증기 10~14 (전부 P2)
- 지표(`kaster_ars_http_lookup_*`) — 통화 경로가 붙는 P2 에서 의미가 생긴다
- 파일럿 DID 실통화 (P3)

---

## 7. 위험과 미리 정한 대응

| 위험 | 대응 | 어디서 |
|---|---|---|
| 등록 화면이 SSRF 통로가 됨 | 등록·호출 **두 시점 모두** 주소 검사 | 4-3 |
| 시크릿이 조회 API 로 샘 | 응답 DTO 에 `hasSecret` 만. spec 으로 고정 | 5 |
| 외부 문자열이 dialplan 으로 흘러감 | 값 깎기. 통과 못하면 자르지 않고 `ERROR` | 4-4 |
| 죽은 엔드포인트에 매 요청 2초 | 차단기 | 4-6 |
| 테스트 호출이 운영 API 를 두드림 | 테스트도 같은 차단기·상한을 탄다 | 4-7 |
