# KAster CTI 공유 개발 서버 배포 절차

작성일: 2026-04-16  
최종 업데이트: 2026-05-01

> 이 문서는 `blueadm@49.247.46.86` 공유 개발 서버용 절차다.
> 정식 운영 배포는 `docs/operations/production-deployment-standard.md`,
> `docs/operations/db-migration-runbook.md`, `scripts/deploy-prod.sh`를 따른다.

## 운영 환경 정보

| 항목 | 값 |
|------|----|
| 원격 서버 | `blueadm@49.247.46.86` |
| 원격 경로 | `/home/blueadm/kaster_cti` |
| 배포 방식 | Docker Compose dev 이름의 원격 개발/검증용 이미지 빌드 배포 |
| Compose 파일 | [`docker-compose.dev.yml`](/D:/Work/AI_Projects/KAster_CTI/docker-compose.dev.yml) |
| Compose 환경파일 | 루트 `.env` (운영 서버 로컬 파일, Git 제외) |
| 기본 배포 도구 | [`scripts/deploy-dev.sh`](/D:/Work/AI_Projects/KAster_CTI/scripts/deploy-dev.sh) |

## 현재 공유 개발/검증 방식의 핵심 전제

- 이 서버는 `docker-compose.dev.yml`이라는 파일명을 쓰지만, 실제로는 server/web/admin 이미지를 빌드해 컨테이너를 교체하는 원격 개발/검증 배포다.
- 따라서 핵심은 `파일 동기화`, `이미지 재빌드`, `컨테이너 교체`, `로그 확인`이다.
- 민감값은 `docker-compose.dev.yml`에 직접 넣지 않고, 원격 루트 `.env`에서 주입한다.
- `server` 컨테이너는 시작 시 아래 순서를 수행한다.
  - `npx prisma migrate deploy`
  - `AUTO_SEED_DEMO_DATA=true`인 경우 demo seed
  - `node dist/src/main.js`

## 이번 장애의 근본 원인

이번 프론트 빈 화면/모듈 누락 장애의 핵심 원인은 `부분 반영이 가능한 원격 개발/검증 방식` 자체다.

- 원격 디렉터리로 관련 파일 여러 개가 함께 배포되지 않으면 중간 불일치 상태가 이미지 빌드 또는 컨테이너 기동 시 노출된다.
- `router`, `page`, `api helper`, `type`이 같이 바뀌는 프론트 변경에서 일부 파일만 수동 복사하면, import/export mismatch가 매우 쉽게 발생한다.
- 수동 복사는 개발 생산성에는 편하지만, 반영 일관성을 보장하지는 않는다.

완전한 근본 해결책은 운영을 `immutable build artifact 배포`로 전환하는 것이다.  
다만 현재 구조를 유지하는 전제에서는 아래 `sync-safe`와 `verify`를 표준 절차로 사용하는 것이 현실적인 1차 해법이다.

## 권장 배포 경로

### 1. 일반 코드 배포

가장 자주 쓰는 경로다.

```bash
git commit -m "feat: ..."
./scripts/deploy-dev.sh sync
```

메모:

- 정상 환경에서는 `rsync` 기반이라 빠르게 끝난다.
- 일반적인 프론트 변경도 원격 반영 후 이미지 재빌드/컨테이너 교체가 필요하다.
- 일반적인 Nest 소스 변경도 `release server` 또는 `sync-safe server`로 재빌드한다.

### 1-1. 프론트 안전 배포

라우터, 페이지, API 모듈, 타입이 같이 바뀌는 프론트 변경은 아래 명령을 기본값으로 사용한다.

```bash
./scripts/deploy-dev.sh sync-safe admin
```

웹 앱은 아래를 사용한다.

```bash
./scripts/deploy-dev.sh sync-safe web
```

이 명령은 아래를 한 번에 수행한다.

- 전체 소스 동기화
- 대상 컨테이너 재시작
- 원격 컨테이너 내부 `npm run build` 검증

즉, HMR 상태를 신뢰하지 않고 “반영 + 초기화 + 정적 검증”까지 묶어 처리한다.

### 2. 최초 설치 / 서버 재구축

```bash
cp .env.example .env   # 로컬 참고용. 운영 서버에는 실제 값으로 별도 생성
./scripts/deploy-dev.sh up
```

메모:

- 원격 디렉터리 동기화 후 `docker compose up -d`까지 수행한다.
- 최초 설치 시 `node_modules` 설치가 포함되어 몇 분 걸릴 수 있다.

### 3. Prisma 스키마 변경 배포

```bash
./scripts/deploy-dev.sh sync
ssh blueadm@49.247.46.86 "
  cd /home/blueadm/kaster_cti && \
  docker exec kaster-server sh -c 'npx prisma migrate deploy'
"
./scripts/deploy-dev.sh restart server
```

메모:

- watch가 살아 있더라도 Prisma 타입/런타임 mismatch가 있으면 `server restart`가 안전하다.
- 운영과 공유 개발/검증 모두 schema 반영은 `migrate deploy` 기준이다.
- 로컬/개발 DB 보정이 꼭 필요할 때만 `ALLOW_PRISMA_DB_PUSH_FALLBACK=true npm run prisma:sync`를 사용한다.

### 3-1. 서버 안전 배포

```bash
./scripts/deploy-dev.sh sync
ssh blueadm@49.247.46.86 "
  cd /home/blueadm/kaster_cti && \
  docker exec kaster-server sh -c 'npx prisma migrate deploy'
"
./scripts/deploy-dev.sh sync-safe server
```

메모:

- `sync-safe server`는 `server` 컨테이너 재시작 후 `npm run build`까지 확인한다.
- 현재는 테스트까지 자동 수행하지 않는다. 후속으로 `verify-full`을 붙일 수 있다.

## 원격 build 검증 명령

운영 서버에 반영된 코드가 실제로 일관적인지 확인할 때 사용한다.

```bash
./scripts/deploy-dev.sh verify admin
./scripts/deploy-dev.sh verify web
./scripts/deploy-dev.sh verify server
./scripts/deploy-dev.sh verify all
```

## Compose 시크릿 관리

현재 `docker-compose.dev.yml`은 아래 값을 루트 `.env`에서 읽는다.

```env
AMI_USERNAME=cti_middleware
AMI_SECRET=...
```

운영 서버 준비:

```bash
ssh blueadm@49.247.46.86 "
  cd /home/blueadm/kaster_cti && \
  cat > .env <<'EOF'
AMI_USERNAME=cti_middleware
AMI_SECRET=실제_AMI_SECRET
EOF
"
```

메모:

- 루트 `.env`는 `.gitignore`에 의해 Git에서 제외된다.
- 배포 스크립트 `sync`도 `.env`는 전송하지 않는다.
- AMI 비밀값 변경 시에는 `docker-compose.dev.yml`이 아니라 원격 `.env`만 수정하고 `server`를 재생성한다.

## Windows 환경 주의사항

이번 실제 배포에서 아래 문제가 확인됐다.

- [`scripts/deploy-dev.sh`](/D:/Work/AI_Projects/KAster_CTI/scripts/deploy-dev.sh)가 `CRLF` 줄바꿈이면 PowerShell/Git Bash에서 `bash` 실행 시 깨질 수 있다.
- Windows 기본 환경에 `rsync`가 없을 수 있다.
- 로컬 `ssh`가 `C:\Users\Admin\.ssh\config` 권한 문제로 실패할 수 있다.

권장사항:

- 가능하면 `Git Bash` 또는 `WSL`에서 `deploy-dev.sh`를 실행한다.
- `ssh config` 권한 이슈가 있으면 `ssh -F NUL ...` 형태로 우회한다.
- `rsync`가 없는 환경에서는 아래 fallback 절차를 사용한다.

## 배포 실패 시 fallback 절차

### A. 컨테이너/서버 상태 먼저 확인

```bash
ssh -F NUL blueadm@49.247.46.86 "cd /home/blueadm/kaster_cti && docker compose -f docker-compose.dev.yml ps"
ssh -F NUL blueadm@49.247.46.86 "cd /home/blueadm/kaster_cti && docker compose -f docker-compose.dev.yml logs --tail=120 server"
```

### B. 특정 파일만 직접 반영

`rsync/scp/archive`가 불안정하면 텍스트 파일은 이 방식이 가장 안전하다.

PowerShell 예시:

```powershell
Get-Content -LiteralPath 'D:\Work\AI_Projects\KAster_CTI\apps\server\src\modules\asterisk-config\asterisk-reload.service.ts' -Raw `
| ssh -F NUL blueadm@49.247.46.86 "cat > '/home/blueadm/kaster_cti/apps/server/src/modules/asterisk-config/asterisk-reload.service.ts'"
```

메모:

- 이 방식은 `텍스트 소스 파일` 반영에는 신뢰도가 높았다.
- 다만 이 방식은 `응급 복구 전용`으로만 사용해야 한다.
- 라우터/페이지/API helper처럼 함께 바뀌는 프론트 파일은 개별 복사보다 `sync-safe admin`이 우선이다.
- 원격 파일 권한이 root-owned인 경우 일반 사용자 `blueadm`로 덮어쓰지 못할 수 있다. 이 경우는 컨테이너/운영 ownership부터 확인해야 한다.

### C. 서버 재기동

```bash
ssh -F NUL blueadm@49.247.46.86 "cd /home/blueadm/kaster_cti && docker compose -f docker-compose.dev.yml restart server"
```

### D. 로그 재확인

```bash
ssh -F NUL blueadm@49.247.46.86 "cd /home/blueadm/kaster_cti && docker compose -f docker-compose.dev.yml logs --tail=120 server"
```

## 컨테이너 제어

전체 재시작:

```bash
./scripts/deploy-dev.sh restart
```

서버만 재시작:

```bash
./scripts/deploy-dev.sh restart server
```

전체 종료:

```bash
./scripts/deploy-dev.sh down
```

프로세스 상태 확인:

```bash
./scripts/deploy-dev.sh ps
```

원격 build 검증:

```bash
./scripts/deploy-dev.sh verify admin
./scripts/deploy-dev.sh verify web
./scripts/deploy-dev.sh verify server
```

## 로그 확인

서버 로그:

```bash
./scripts/deploy-dev.sh logs
```

관리자 앱 로그:

```bash
./scripts/deploy-dev.sh logs admin
```

상담원 앱 로그:

```bash
./scripts/deploy-dev.sh logs web
```

Windows/ssh fallback:

```bash
ssh -F NUL blueadm@49.247.46.86 "cd /home/blueadm/kaster_cti && docker compose -f docker-compose.dev.yml logs --tail=120 server"
```

관리자 앱 안정 배포:

```bash
./scripts/deploy-dev.sh sync-safe admin
```

## 서비스 접속 URL

| 서비스 | URL |
|--------|-----|
| NestJS API | [http://49.247.46.86:3000/api/v1](http://49.247.46.86:3000/api/v1) |
| Swagger | [http://49.247.46.86:3000/docs](http://49.247.46.86:3000/docs) |
| 상담원 앱 | [http://49.247.46.86:5173](http://49.247.46.86:5173) |
| 관리자 앱 | [http://49.247.46.86:5174](http://49.247.46.86:5174) |

## 배포 후 검증 절차

### 1. 헬스체크

```bash
curl http://49.247.46.86:3000/api/v1/health
```

정상 기준:

- `success: true`
- `checks.db = up`
- `checks.redis = up`
- `checks.ami = connected`

### 2. 로그인 확인

기본 supervisor 계정:

- `loginId`: `supervisor1`
- `password`: `Password123!`
- `extension`: `2001`

확인 엔드포인트:

```http
POST /api/v1/auth/login
```

### 3. 읽기 스모크 테스트

- `GET /api/v1/agents`
- `GET /api/v1/queues`
- `GET /api/v1/asterisk-config/preview`
- 관리자 앱 `http://49.247.46.86:5174`

### 4. 변경 경로 스모크 테스트

운영 위험이 큰 기능은 읽기만 확인하지 말고 실제 왕복을 확인한다.

권장:

- 임시 큐 1건 생성
- `preview`에 반영되는지 확인
- 다시 삭제
- 이후 `/health` 재확인

## 이번 배포에서 확인된 운영 제약

### 1. 현재 운영 dev 서버는 호스트 Asterisk를 직접 사용한다

현재 [`docker-compose.dev.yml`](/D:/Work/AI_Projects/KAster_CTI/docker-compose.dev.yml) 기준 `server` 컨테이너는 아래 방식으로 호스트 Asterisk와 연결된다.

- `extra_hosts: host.docker.internal:host-gateway`
- `AMI_HOST=host.docker.internal`
- `AMI_SECRET`은 루트 `.env`에서 주입
- `/etc/asterisk:/etc/asterisk` bind mount

영향:

- `AsteriskReloadService`가 컨테이너 안에서 호스트 `/etc/asterisk`에 직접 `pjsip.conf`, `queues.conf` 등을 쓸 수 있다.
- `queue reload all` 등 AMI reload도 같은 호스트 Asterisk에 바로 전송된다.

주의:

- 호스트 `/etc/asterisk`의 파일 권한은 `asterisk:asterisk` 기준이라, 일반 계정 `blueadm`으로는 직접 읽기/grep이 안 될 수 있다.
- 권한 확인이 필요하면 `sudo` 또는 Asterisk 계정 권한으로 확인해야 한다.
- 마운트가 빠지면 이전처럼 앱은 떠도 conf write/reload는 skip 상태가 된다.

### 2. Watch 환경은 "부분 반영 후 즉시 장애" 가능성이 있다

소스가 원격에 반영되면 Nest watch가 즉시 다시 컴파일한다. 따라서:

- 관련 파일 일부만 반영되면 DI/타입 mismatch로 서버가 바로 죽을 수 있다.
- Prisma schema 변경은 소스보다 늦게 반영되면 런타임 mismatch가 날 수 있다.
- 배포 직후 로그를 바로 확인해야 한다.

## 권장 체크리스트

- 로컬에서 먼저 `build`와 `test` 통과 확인
- 프론트 다중 파일 변경이면 `sync-safe admin|web`
- 서버 변경이면 `sync` + 필요 시 `migrate deploy` + `sync-safe server`
- Prisma 변경 시 `migrate deploy`
- `verify admin|web|server`로 원격 build 확인
- 해당 서비스 로그 확인
- `/health` 확인
- 로그인 확인
- 주요 GET API 확인
- 변경 기능 왕복 테스트 1회
- 재차 `/health` 확인

## 참고

- 공유 개발/검증 배포 스크립트: [`scripts/deploy-dev.sh`](/D:/Work/AI_Projects/KAster_CTI/scripts/deploy-dev.sh)
- 공유 개발/검증 Compose: [`docker-compose.dev.yml`](/D:/Work/AI_Projects/KAster_CTI/docker-compose.dev.yml)
