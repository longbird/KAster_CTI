# Asterisk 회선 설정 관리 UI — 설계 명세

**날짜:** 2026-04-16  
**상태:** 검토 완료  
**범위:** Admin 웹 대시보드에서 Asterisk PJSIP/Dialplan 설정 전체를 CRUD하고 즉시 반영

---

## 1. 요구사항 요약

| 항목 | 결정 |
|------|------|
| 관리 범위 | SIP 트렁크, 에이전트 내선(agents 연동), DID, IVR 메뉴 |
| 반영 방식 | DB 저장 → .conf 파일 생성 → AMI `module reload res_pjsip` + `dialplan reload` 즉시 반영 |
| 에이전트 내선 | `agents.extension` + `agents.sipPassword` 기준 PJSIP 섹션 자동 생성 (수동 트리거) |
| IVR | DID → IVR 메뉴 → DTMF 키 → 큐 분기 (단일 레벨, 재시도 없음) |
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
  └─ AsteriskReloadService      파일 쓰기 + AMI reload (fire-and-forget + debounce)

       ↓ fs.writeFileSync + AMI Action:Command
Asterisk (/etc/asterisk/)
  ├─ pjsip.conf
  ├─ extensions_inbound.conf
  └─ extensions_queue.conf
```

### 저장 → 반영 흐름

1. UI 저장 → `POST|PUT|DELETE /api/v1/asterisk-config/*`
2. DB 저장 (Prisma transaction)
3. `AsteriskReloadService.reloadAll()` 호출 (5초 debounce — 연속 저장 시 마지막 호출만 실행)
4. DB 전체 조회 → Renderer로 .conf 텍스트 생성 → `fs.writeFileSync`
5. AMI `module reload res_pjsip` → AMI `dialplan reload` (순차 전송)
6. **AMI 응답은 fire-and-forget** — `sendAction`이 `void` 반환이므로 reload 성공 여부를 프로그래밍적으로 확인할 수 없음. 파일 쓰기 성공 여부만 판단 기준으로 사용.
7. 파일 쓰기 성공 → `{ success: true }` 반환, UI 성공 토스트
8. 파일 쓰기 실패 → `{ success: false, error: ... }` 반환, UI 경고 + 수동 reload 버튼 표시

**실패 처리 명확화:**
- DB 저장 성공 + 파일 쓰기 실패 → DB 변경 유지, UI에 "설정은 저장됨, Asterisk 반영 실패" 경고
- 수동 reload 버튼: `POST /api/v1/asterisk-config/reload` 재호출

---

## 3. DB 스키마

### 3-1. 기존 `agents` 테이블 변경

`sipPassword` 컬럼 추가. SIP 비밀번호는 Asterisk `pjsip.conf`에 **평문**으로 기재되어야 하므로, `loginPasswordHash`(bcrypt one-way hash)를 재사용할 수 없음. 별도 컬럼 필요.

```prisma
model agents {
  // ... 기존 필드 유지 ...
  sipPassword String?   // Asterisk PJSIP 인증용 평문 비밀번호 (nullable: 미설정 시 내선 제외)
}
```

마이그레이션: `ALTER TABLE agents ADD COLUMN "sipPassword" TEXT;`  
UI: AgentSipTab에서 내선별 sipPassword 설정 가능. null이면 해당 에이전트는 PJSIP 섹션에서 제외.

### 3-2. 신규 테이블 4개

```prisma
model AsteriskTrunk {
  id            String   @id @default(uuid()) @db.Uuid
  tenantId      String   @db.Uuid
  name          String           // 표시명 (예: "KT 회선 1")
  host          String           // TRUNK_IP_OR_DOMAIN
  port          Int      @default(5060)
  username      String           // TRUNK_ID
  password      String           // TRUNK_PASSWORD (v1: 평문, 향후 AES-256-GCM 암호화 예정)
  fromDomain    String           // from_domain
  codecs        String   @default("alaw,ulaw")
  enabled       Boolean  @default(true)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  tenant        tenants  @relation(fields: [tenantId], references: [tenantId])

  @@unique([tenantId, name])
}

model AsteriskDid {
  id          String   @id @default(uuid()) @db.Uuid
  tenantId    String   @db.Uuid
  did         String           // 예: "07012345678"
  description String?
  ivrMenuId   String?  @db.Uuid  // 연결할 IVR 메뉴 (null이면 directQueue 사용)
  directQueue String?            // 직결 큐 이름 (ivrMenuId와 XOR)
  enabled     Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  tenant      tenants          @relation(fields: [tenantId], references: [tenantId])
  ivrMenu     AsteriskIvrMenu? @relation(fields: [ivrMenuId], references: [id])

  @@unique([tenantId, did])
}

model AsteriskIvrMenu {
  id            String   @id @default(uuid()) @db.Uuid
  tenantId      String   @db.Uuid
  name          String
  welcomePrompt String?          // 안내 멘트 파일명 (예: custom/welcome)
  menuPrompt    String?          // 메뉴 멘트 파일명 (예: custom/main_menu)
  timeoutSecs   Int      @default(5)
  entries       AsteriskIvrEntry[]
  dids          AsteriskDid[]
  tenant        tenants  @relation(fields: [tenantId], references: [tenantId])
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@unique([tenantId, name])
}

model AsteriskIvrEntry {
  id        String   @id @default(uuid()) @db.Uuid
  tenantId  String   @db.Uuid           // 명시적 테넌트 키 (기존 패턴 준수)
  menuId    String   @db.Uuid
  digit     String           // DTMF 키 ("1", "2", ...)
  label     String           // 표시명 (예: "영업팀")
  queueName String           // 큐 이름 (AsteriskConfigService에서 queues 테이블 대조 검증)
  menu      AsteriskIvrMenu  @relation(fields: [menuId], references: [id], onDelete: Cascade)

  @@unique([menuId, digit])
}
```

### 3-3. `tenants` 모델 back-relation 추가

```prisma
model tenants {
  // ... 기존 필드 및 relations 유지 ...
  asteriskTrunks   AsteriskTrunk[]
  asteriskDids     AsteriskDid[]
  asteriskIvrMenus AsteriskIvrMenu[]
}
```

`AsteriskIvrEntry`는 `AmiConnectionService` 경유 접근이므로 tenants 직접 back-relation 불필요. tenantId 컬럼은 존재하지만 FK 제약은 menuId → AsteriskIvrMenu(tenantId 공유) 경로로 간접 보장.

### 3-4. 유효성 규칙

**DID XOR 제약 (ivrMenuId vs directQueue):**
- DB 레벨 CHECK 제약 추가: `CHECK ((ivrMenuId IS NULL) != (directQueue IS NULL))`
- DialplanRenderer 방어 로직: 양쪽 모두 null인 경우 해당 DID는 렌더링에서 제외 + WARNING 로그

**큐 이름 검증:**
- `AsteriskConfigService`에서 저장 전 `directQueue` 및 `AsteriskIvrEntry.queueName`을 `queues` 테이블(`@@unique([tenantId, queueName])`)과 대조 검증
- 존재하지 않는 큐 이름이면 `400 Bad Request` 반환

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
    ├─ ivr-menu.dto.ts      # entries[] 중첩 포함
    └─ ivr-entry.dto.ts
```

### REST 엔드포인트

모두 `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles('supervisor','admin')` 적용.  
`tenantId`는 `request.user.tenantId` (JWT payload)에서 추출.

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
POST   /api/v1/asterisk-config/ivr-menus        # entries[] 중첩 생성
PUT    /api/v1/asterisk-config/ivr-menus/:id    # entries[] 인라인 diff (아래 참고)
DELETE /api/v1/asterisk-config/ivr-menus/:id

GET    /api/v1/asterisk-config/agents-sip       # tenantId = request.user.tenantId
POST   /api/v1/asterisk-config/agents-sip/sync  # PJSIP 에이전트 섹션 동기화 + reload

POST   /api/v1/asterisk-config/reload           # 수동 reload (debounce 타이머 clear 후 즉시 실행)
GET    /api/v1/asterisk-config/preview          # 현재 DB 기준 .conf 미리보기 (파일 미적용)
```

### IVR 메뉴 업데이트 요청 바디 (entries 인라인 관리)

`PUT /ivr-menus/:id` 요청 시 `entries` 배열 전체를 전송. 서비스 레이어에서 기존 entries를 삭제 후 재삽입(replace strategy).

```typescript
// IvrMenuDto
{
  name: string
  welcomePrompt?: string
  menuPrompt?: string
  timeoutSecs?: number    // default 5
  entries: {
    digit: string         // "1"~"9", "#", "*"
    label: string
    queueName: string
  }[]
}
```

별도 `/entries` 서브 리소스 엔드포인트 없음. 메뉴와 항목은 항상 함께 저장.

### preview 응답 형식

```typescript
// GET /preview 응답 data 필드
{
  pjsip: string                // pjsip.conf 전체 텍스트
  extensionsInbound: string    // extensions_inbound.conf 전체 텍스트
  extensionsQueue: string      // extensions_queue.conf 전체 텍스트
}
```

표준 envelope: `{ success: true, data: { pjsip, extensionsInbound, extensionsQueue } }`

### reload debounce

`AsteriskReloadService`에 `reloadTimer: NodeJS.Timeout | null` 보유.  
`reloadAll()` 호출 시 기존 타이머 clear → 5초 후 실행. 5초 내 추가 저장이 들어오면 타이머 리셋.  
`POST /reload` (수동)는 기존 debounce 타이머를 clear하고 즉시 실행.

### reload 시퀀스

```typescript
// AsteriskReloadService.executeReload()
await writeConfFiles()   // fs.writeFileSync — 실패 시 throw, 이후 AMI 전송 안 함
amiConnection.sendAction({ Action: 'Command', Command: 'module reload res_pjsip' })
// 짧은 대기 없이 순차 전송 (Asterisk가 두 Command를 순서대로 처리)
amiConnection.sendAction({ Action: 'Command', Command: 'dialplan reload' })
// sendAction은 void 반환 → AMI 응답 확인 불가 (fire-and-forget)
// 파일 쓰기 성공 = 응답 성공으로 간주
```

### PjsipRenderer 출력 예시

```ini
; === 트렁크 섹션 (AsteriskTrunk 테이블 기반) ===
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
from_user=TRUNK_ID
from_domain=TRUNK_IP
direct_media=no
rtp_symmetric=yes
force_rport=yes
rewrite_contact=yes

; === 에이전트 내선 섹션 (agents 테이블, sipPassword IS NOT NULL 조건) ===
[1001-auth]
type=auth
auth_type=userpass
username=1001
password=SIP_PASSWORD_PLAINTEXT

[1001-aor]
type=aor
max_contacts=1

[1001]
type=endpoint
context=agent-phone
disallow=all
allow=alaw,ulaw
auth=1001-auth
aors=1001-aor
callerid=AgentName <1001>
direct_media=no
rtp_symmetric=yes
force_rport=yes
rewrite_contact=yes
```

### DialplanRenderer 출력 예시

```ini
; extensions_inbound.conf
[inbound-main]
exten => 07012345678,1,NoOp(Inbound DID ${EXTEN})
 same => n,Goto(ivr-menu-main,s,1)

; IVR 없이 큐 직결인 경우
exten => 07099999999,1,NoOp(Inbound DID ${EXTEN})
 same => n,Goto(queue-entry,sales,1)

; extensions_queue.conf
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

**IVR 동작 명세:** 단일 레벨 메뉴. 키 미입력 시 `t` extension → 안내 멘트 후 종료. 재시도(repeat) 로직 없음. 렌더러는 retry 코드를 생성하지 않음.

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
        ├─ TrunkForm.tsx              # 추가/수정 모달, 패스워드 마스킹
        ├─ DidsTab.tsx
        ├─ DidForm.tsx                # ivrMenuId / directQueue XOR 선택 UI
        ├─ IvrMenusTab.tsx
        ├─ IvrMenuForm.tsx            # 메뉴 + entries[] 인라인 편집 모달
        ├─ AgentSipTab.tsx            # sipPassword 설정 + "PJSIP 동기화" 버튼
        └─ ConfigPreviewDrawer.tsx    # react-syntax-highlighter로 .conf 코드 표시
```

### 탭별 UX

| 탭 | 주요 동작 |
|---|---|
| **트렁크** | 테이블 + 추가/수정/삭제. 패스워드 필드 마스킹. 저장 시 자동 reload |
| **DID** | 테이블 + 추가/수정/삭제. "IVR 연결" 또는 "큐 직결" 라디오 + 드롭다운. XOR 강제 |
| **IVR 메뉴** | 메뉴 목록. 편집 모달에서 entries 행 추가/삭제 (전체 replace 저장) |
| **에이전트 내선** | agents 테이블 기반 테이블. sipPassword 인라인 편집. "PJSIP 동기화" 버튼 |

### 공통 UX
- 우측 상단 **".conf 미리보기"** 버튼 → `ConfigPreviewDrawer`
  - `react-syntax-highlighter` + `ini` 언어 사용
  - pjsip / extensions_inbound / extensions_queue 탭 전환
- 저장/삭제 후 reload 결과 `notification` 표시
  - 파일 쓰기 성공: `"Asterisk 설정이 적용되었습니다 (AMI reload 전송됨)"`
  - 파일 쓰기 실패: `"설정은 저장됨 — Asterisk 반영 실패"` + 수동 reload 버튼
- AppLayout 사이드메뉴에 `SettingOutlined` → **"Asterisk 설정"** (`/asterisk`) 추가

---

## 6. 환경변수 추가 (`apps/server/.env.example`)

```env
ASTERISK_CONF_DIR=/etc/asterisk
# 향후 트렁크 패스워드 암호화 시 사용할 키 (v1에서는 미사용, 미리 추가)
# ASTERISK_TRUNK_ENCRYPT_KEY=change_me_32bytes
```

---

## 7. 마이그레이션

`prisma/migrations/20260416_asterisk_config/` 신규 마이그레이션:

1. `agents` 테이블에 `sipPassword TEXT` 컬럼 추가
2. `AsteriskTrunk`, `AsteriskDid`, `AsteriskIvrMenu`, `AsteriskIvrEntry` 테이블 생성
3. `AsteriskDid`에 XOR CHECK 제약 추가:  
   `CHECK (("ivrMenuId" IS NULL) != ("directQueue" IS NULL))`
4. `tenants` 모델 back-relation 반영 (Prisma schema only, DB DDL 불필요)

---

## 8. 보안 고려사항

| 항목 | v1 처리 | 향후 개선 |
|------|---------|-----------|
| 트렁크 패스워드 | DB 평문 저장 | AES-256-GCM 암호화 (`ASTERISK_TRUNK_ENCRYPT_KEY`) |
| 에이전트 sipPassword | DB 평문 저장 | 동일 암호화 |
| .conf 파일 권한 | 구현 시 `chmod 640` + `chown asterisk` 명시 | - |
| preview 엔드포인트 | 평문 패스워드 노출 위험 → 응답에서 패스워드 마스킹 처리 | - |

---

## 9. 구현 제외 범위 (향후)

- 트렁크/에이전트 패스워드 DB 암호화
- AMI Command ActionID 기반 응답 확인 (`sendAction` 확장 필요)
- 에이전트 추가/삭제 시 PJSIP 자동 동기화 (현재: 수동 트리거)
- IVR 다단계 중첩 메뉴
- SSH 기반 원격 Asterisk 파일 배포
- reload 후 Asterisk 상태 확인 (`core show channels` AMI 조회)
