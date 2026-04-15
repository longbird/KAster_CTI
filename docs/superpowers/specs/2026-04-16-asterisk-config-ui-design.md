# Asterisk 회선 설정 관리 UI — 설계 명세

**날짜:** 2026-04-16  
**상태:** 승인됨  
**범위:** Admin 웹 대시보드에서 Asterisk PJSIP/Dialplan 설정 전체를 CRUD하고 즉시 반영

---

## 1. 요구사항 요약

| 항목 | 결정 |
|------|------|
| 관리 범위 | SIP 트렁크, 에이전트 내선(agents 연동), DID, IVR 메뉴 |
| 반영 방식 | DB 저장 → .conf 파일 생성 → AMI `module reload` 즉시 반영 |
| 에이전트 내선 | `agents.extension` 기준 PJSIP 섹션 자동 생성 (수동 트리거) |
| IVR | DID → IVR 메뉴 → DTMF 키 → 큐 분기 |
| 배포 환경 | NestJS와 Asterisk 동일 호스트, `fs.writeFileSync` 직접 사용 |

---

## 2. 전체 아키텍처

```
Admin UI (React)
  └─ /asterisk 페이지 (4탭)
       ├─ 트렁크 설정
       ├─ 내선(에이전트 SIP)
       ├─ DID 관리
       └─ IVR 메뉴

       ↓ REST API (JwtAuthGuard + RolesGuard supervisor/admin)
NestJS AsteriskConfigModule
  ├─ AsteriskConfigController   GET/POST/PUT/DELETE
  ├─ AsteriskConfigService      CRUD 비즈니스 로직
  ├─ PjsipRendererService       DB → pjsip.conf 텍스트 생성
  ├─ DialplanRendererService    DB → extensions_inbound/queue.conf 생성
  └─ AsteriskReloadService      파일 쓰기 + AMI "module reload" 전송

       ↓ fs.writeFileSync + AMI Action:Command
Asterisk (/etc/asterisk/)
  ├─ pjsip.conf
  ├─ extensions_inbound.conf
  └─ extensions_queue.conf
```

### 저장 → 반영 흐름

1. UI 저장 → `POST|PUT|DELETE /api/v1/asterisk-config/*`
2. DB 저장 (Prisma transaction)
3. `AsteriskReloadService.reloadAll()` 호출
4. DB 전체 조회 → Renderer로 .conf 텍스트 생성 → `fs.writeFileSync`
5. `AmiConnectionService.sendAction({ Action: 'Command', Command: 'module reload res_pjsip' })`
6. 성공/실패 응답 반환 → UI `notification` 토스트

**실패 처리:** reload 실패해도 DB 변경은 유지. UI에 "reload 실패 — 수동 적용 필요" 경고 + 수동 reload 버튼 표시.

---

## 3. DB 스키마 (신규 테이블 4개)

```prisma
model AsteriskTrunk {
  id            String   @id @default(uuid())
  tenantId      String
  name          String           // 표시명 (예: "KT 회선 1")
  host          String           // TRUNK_IP_OR_DOMAIN
  port          Int      @default(5060)
  username      String           // TRUNK_ID
  password      String           // TRUNK_PASSWORD (암호화 저장 권장)
  fromDomain    String           // from_domain
  codecs        String   @default("alaw,ulaw")
  enabled       Boolean  @default(true)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@unique([tenantId, name])
}

model AsteriskDid {
  id          String   @id @default(uuid())
  tenantId    String
  did         String           // 예: "07012345678"
  description String?
  ivrMenuId   String?          // 연결할 IVR 메뉴 (null이면 큐 직결)
  directQueue String?          // IVR 없이 바로 큐로 (ivrMenuId와 택1)
  enabled     Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  ivrMenu     AsteriskIvrMenu? @relation(fields: [ivrMenuId], references: [id])

  @@unique([tenantId, did])
}

model AsteriskIvrMenu {
  id            String   @id @default(uuid())
  tenantId      String
  name          String
  welcomePrompt String?          // 안내 멘트 파일명 (custom/welcome)
  menuPrompt    String?          // 메뉴 멘트 파일명 (custom/main_menu)
  timeoutSecs   Int      @default(5)
  entries       AsteriskIvrEntry[]
  dids          AsteriskDid[]
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@unique([tenantId, name])
}

model AsteriskIvrEntry {
  id        String   @id @default(uuid())
  menuId    String
  digit     String           // DTMF 키 ("1", "2", ...)
  label     String           // 표시명 (예: "영업팀")
  queueName String           // queues.conf 큐 이름과 매칭
  menu      AsteriskIvrMenu  @relation(fields: [menuId], references: [id], onDelete: Cascade)

  @@unique([menuId, digit])
}
```

**에이전트 내선:** 별도 테이블 없이 기존 `agents.extension` + `loginPasswordHash` 사용하여 PJSIP 섹션 자동 생성.

---

## 4. 백엔드 모듈 구조

```
apps/server/src/modules/asterisk-config/
├─ asterisk-config.module.ts
├─ asterisk-config.controller.ts
├─ asterisk-config.service.ts
├─ asterisk-reload.service.ts
├─ renderers/
│   ├─ pjsip.renderer.ts
│   └─ dialplan.renderer.ts
└─ dto/
    ├─ trunk.dto.ts
    ├─ did.dto.ts
    ├─ ivr-menu.dto.ts
    └─ ivr-entry.dto.ts
```

### REST 엔드포인트

모두 `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles('supervisor','admin')` 적용.

```
GET    /api/v1/asterisk-config/trunks
POST   /api/v1/asterisk-config/trunks
PUT    /api/v1/asterisk-config/trunks/:id
DELETE /api/v1/asterisk-config/trunks/:id

GET    /api/v1/asterisk-config/dids
POST   /api/v1/asterisk-config/dids
PUT    /api/v1/asterisk-config/dids/:id
DELETE /api/v1/asterisk-config/dids/:id

GET    /api/v1/asterisk-config/ivr-menus
POST   /api/v1/asterisk-config/ivr-menus
PUT    /api/v1/asterisk-config/ivr-menus/:id
DELETE /api/v1/asterisk-config/ivr-menus/:id

GET    /api/v1/asterisk-config/agents-sip     # agents 테이블 기반 미리보기
POST   /api/v1/asterisk-config/agents-sip/sync # PJSIP 에이전트 섹션 동기화

POST   /api/v1/asterisk-config/reload         # 수동 reload 트리거
GET    /api/v1/asterisk-config/preview        # .conf 미리보기 (파일 미적용)
```

### PjsipRenderer 출력 예시

```ini
; === 트렁크 섹션 (DB AsteriskTrunk 기반) ===
[trunk-kt-1-auth]
type=auth
auth_type=userpass
username=TRUNK_ID
password=TRUNK_PASSWORD

[trunk-kt-1-aor]
type=aor
contact=sip:TRUNK_IP:5060

[trunk-kt-1]
type=endpoint
transport=transport-udp
context=inbound-main
disallow=all
allow=alaw,ulaw
aors=trunk-kt-1-aor
outbound_auth=trunk-kt-1-auth
...

; === 에이전트 내선 섹션 (agents 테이블 기반) ===
[1001-auth]
type=auth
username=1001
password=<loginPasswordHash 원본 — seed.ts에서 평문 보관 필요>
...
```

> **보안 주의:** 트렁크 패스워드와 에이전트 SIP 패스워드는 .conf 파일에 평문 기재됨. DB에 암호화 저장하고 렌더링 시 복호화하는 방식은 향후 개선 포인트.

### DialplanRenderer 출력 예시

```ini
; extensions_inbound.conf (DID → IVR 매핑)
[inbound-main]
exten => 07012345678,1,NoOp(Inbound DID)
 same => n,Goto(ivr-menu-main,s,1)

; extensions_queue.conf (IVR 메뉴 → 큐)
[ivr-menu-main]
exten => s,1,Answer()
 same => n,Playback(custom/welcome)
 same => n,Background(custom/main_menu)
 same => n,WaitExten(5)
exten => 1,1,Goto(queue-entry,sales,1)
exten => 2,1,Goto(queue-entry,support,1)
exten => t,1,Playback(vm-goodbye)
 same => n,Hangup()
```

---

## 5. 프론트엔드 구조

```
apps/admin/src/
├─ pages/AsteriskConfigPage.tsx
└─ features/asterisk-config/
    ├─ api/asteriskConfigApi.ts
    ├─ hooks/useAsteriskConfig.ts
    ├─ types/asterisk-config.ts
    └─ components/
        ├─ TrunksTab.tsx
        ├─ TrunkForm.tsx          # 추가/수정 모달
        ├─ DidsTab.tsx
        ├─ DidForm.tsx
        ├─ IvrMenusTab.tsx
        ├─ IvrMenuForm.tsx        # 메뉴 + 항목 중첩 편집 모달
        ├─ AgentSipTab.tsx        # 읽기 전용 + "PJSIP 동기화" 버튼
        └─ ConfigPreviewDrawer.tsx # .conf 코드 미리보기
```

### 탭별 UX

| 탭 | 주요 동작 |
|---|---|
| **트렁크** | 테이블 + 추가/수정/삭제. 패스워드 필드 마스킹. 저장 시 자동 reload |
| **DID** | 테이블 + 추가/수정/삭제. IVR 메뉴 또는 큐 직결 선택 드롭다운 |
| **IVR 메뉴** | 메뉴 목록. 메뉴별 항목(키→큐) 인라인 행 추가/삭제 |
| **에이전트 내선** | agents 기반 자동생성 미리보기 테이블. "PJSIP 동기화" 버튼 |

### 공통 UX
- 우측 상단 **".conf 미리보기"** 버튼 → `ConfigPreviewDrawer` (신택스 하이라이팅)
- 저장/삭제 후 reload 결과 `notification` 표시
  - 성공: `"Asterisk 설정이 반영되었습니다"`
  - 실패: `"파일 저장 실패 — 설정은 DB에 저장됨"` + 수동 reload 버튼
- AppLayout 사이드메뉴에 `SettingOutlined` → **"Asterisk 설정"** (`/asterisk`) 추가

---

## 6. 파일 쓰기 경로 설정

서버 환경변수 `.env`에 추가:

```env
ASTERISK_CONF_DIR=/etc/asterisk
```

`AsteriskReloadService`가 이 경로를 참조. 기본값 `/etc/asterisk`.

---

## 7. 마이그레이션

`prisma/migrations/20260416_asterisk_config/` 신규 마이그레이션 1개:
- `AsteriskTrunk`, `AsteriskDid`, `AsteriskIvrMenu`, `AsteriskIvrEntry` 테이블 생성

---

## 8. 구현 제외 범위 (향후)

- 트렁크 패스워드 DB 암호화 (현재: 평문 저장)
- AMI reload 결과 이벤트 기반 확인 (현재: fire-and-forget)
- 에이전트 추가/삭제 시 PJSIP 자동 동기화 (현재: 수동 트리거)
- IVR 다단계 중첩 메뉴
- SSH 기반 원격 Asterisk 파일 배포
