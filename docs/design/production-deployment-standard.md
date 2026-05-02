# KAster_CTI 운영 배포 표준안

## 목적

이 문서는 현재 저장소의 개발형 배포(`docker-compose.dev.yml`)와 분리된 운영 표준안을 정의한다.
목표는 두 가지다.

1. 실제 운영 서버를 개발형 watch/bind-mount 구조에서 분리한다.
2. 다른 사이트에 재배포할 때 코드 변경 없이 사이트별 설정만 교체할 수 있게 한다.

## 현재 구조의 문제

- `docker-compose.dev.yml`이 `npm install`, `prisma db push --accept-data-loss`, `seed`, `nest start --watch`, `vite dev`를 사용한다.
- 프론트엔드 URL이 배포 파일에 IP로 하드코딩되어 있다.
- 운영용 reverse proxy, immutable image, 롤링 재기동 절차가 없다.
- 동일 서버에 올려도 "운영"과 "원격 개발"이 구분되지 않는다.

이 상태는 빠른 실험에는 유리하지만, 실제 운영과 타 사이트 재배포 기준으로는 부적절하다.

## 표준 원칙

### 1. 개발과 운영을 완전히 분리한다

- 개발: `docker-compose.dev.yml`
- 운영: `deploy/sites/<site-code>/compose.prod.yml`

운영은 bind mount, HMR, `db push`, seed를 금지한다.

### 2. 운영은 immutable image 기준으로 배포한다

- 서버: `apps/server/Dockerfile.prod`
- 상담원 앱: `apps/web/Dockerfile.prod`
- 관리자 앱: `apps/admin/Dockerfile.prod`

운영 컨테이너 안에서는 소스 코드를 수정하지 않는다.

### 3. 사이트별 설정은 코드와 분리한다

사이트별 배포 파일은 아래 구조를 따른다.

```text
deploy/
  sites/
    _template/
      .env.example
      compose.prod.yml
      README.md
      nginx/
        default.conf.template
```

실제 사이트는 `_template`을 복제해 `deploy/sites/site-a/` 같은 디렉터리로 관리한다.

### 4. Asterisk와 CTI 앱을 논리적으로 분리한다

- Asterisk는 별도 서버 또는 최소 별도 VM 권장
- CTI 앱은 API/WS 계층으로 분리
- DB/Redis는 Asterisk와 분리

### 5. 운영 반영은 migrate 기반으로만 수행한다

- 허용: `npx prisma migrate deploy`
- 금지: `npx prisma db push --accept-data-loss`

## 권장 토폴로지

### 소규모 단일 사이트

- Asterisk 1대
- CTI app 1대
- PostgreSQL 1대
- Redis 1대
- Nginx 1대

### 권장 운영

- Asterisk 2대
- CTI app 2대 이상
- PostgreSQL primary/replica
- Redis Sentinel 또는 3노드
- Nginx/Load Balancer 2대

## 도메인 권장안

사이트당 3개 엔드포인트를 권장한다.

- 상담원 앱: `https://cti.example.com`
- 관리자 앱: `https://admin.cti.example.com`
- API/WS: `https://api.cti.example.com`

프론트엔드는 현재 build-time env를 사용하므로 사이트별 URL이 다르면 빌드가 달라진다.
반복 재배포가 많아지면 runtime config 방식으로 전환하는 것이 좋다.

## 환경변수 표준

사이트별 `.env`는 최소 아래 값을 가진다.

- `SITE_CODE`
- `SITE_DOMAIN`
- `ADMIN_DOMAIN`
- `API_DOMAIN`
- `POSTGRES_DB`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `JWT_SECRET`
- `AMI_HOST`
- `AMI_PORT`
- `AMI_USERNAME`
- `AMI_SECRET`
- `AMI_RECONNECT_MS`
- `ASTERISK_NODE_ID`
- `ASTERISK_OUTBOUND_CONTEXT`
- `ASTERISK_ATXFER_COMPLETE_CODE`
- `ASTERISK_HOLD_FEATURE_CODE`
- `ASTERISK_RESUME_FEATURE_CODE`
- `REST_CORS_ORIGIN`
- `WS_CORS_ORIGIN`
- `VITE_API_BASE_URL`
- `VITE_WS_URL`
- `VITE_USE_MOCK`
- `VITE_ACCESS_TOKEN_KEY`

## 배포 절차 표준

### 1. 사전 검증

- 로컬 또는 CI에서 `apps/server`, `apps/web`, `apps/admin` 빌드 검증
- DB 마이그레이션 SQL 검토
- `.env` 값 검증

### 2. 배포

1. 운영 DB 백업
2. 새 이미지 빌드 또는 pull
3. `npx prisma migrate deploy`
4. `server` 재기동
5. `web`, `admin`, `gateway` 재기동
6. 헬스체크 확인

### 3. 사후 확인

- `GET /api/v1/health`
- 상담원 앱 접속
- 관리자 앱 접속
- 로그인
- 대표 큐/호 분배룰 조회
- AMI 연결 상태 확인

## 타 사이트 배포 전략

### 같은 고객사 내 지점 추가

현재 멀티테넌트/브랜치 설계를 사용할 수 있다.
다만 SIP trunk, DID, Asterisk 운용 정책이 지점마다 크게 다르면 독립 스택이 더 안전하다.

### 완전히 다른 고객사

다른 고객사는 독립 사이트로 배포하는 것이 맞다.

- 독립 DB
- 독립 Redis
- 독립 Asterisk
- 독립 `.env`
- 독립 도메인

공통 코드만 공유하고 운영 데이터와 통신 인프라는 섞지 않는다.

## 저장소 반영 범위

이 표준안에 따라 다음 파일을 운영 템플릿으로 제공한다.

- `apps/server/Dockerfile.prod`
- `apps/web/Dockerfile.prod`
- `apps/admin/Dockerfile.prod`
- `apps/web/nginx.prod.conf`
- `apps/admin/nginx.prod.conf`
- `deploy/sites/_template/.env.example`
- `deploy/sites/_template/compose.prod.yml`
- `deploy/sites/_template/nginx/default.conf.template`

## 후속 권장 작업

1. CI에서 이미지 빌드와 registry push 자동화
2. 프론트 runtime config 도입
3. Redis Sentinel 또는 Cluster 표준화

## 현재 제공되는 운영 산출물

- 운영 배포 게이트: `scripts/deploy-prod.sh`
- DB migration runbook: `docs/design/db-migration-runbook.md`
- 사이트 템플릿 운영 절차: `deploy/sites/_template/README.md`
- PBX 설정 반영 runbook: `docs/design/pbx-config-apply-runbook.md`
