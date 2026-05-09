# KAster CTI Site Deployment Layout

이 디렉터리는 site별 운영 배포 구성을 담는다.

## 구성 원칙

- `_template`은 새 site를 만들기 위한 기준본이다.
- 실제 운영 site는 `_template`을 복사해서 `deploy/sites/<site-code>` 형태로 만든다.
- site별 `.env`에는 secret이 들어가므로 커밋하지 않는다.
- 운영 검증은 `docs/operations/p3-release-preflight-20260506.md` 순서를 따른다.

## 새 site 생성 순서

```bash
cp -R deploy/sites/_template deploy/sites/<site-code>
cp deploy/sites/<site-code>/.env.example deploy/sites/<site-code>/.env
```

그 다음 `.env`의 다음 값을 site에 맞게 채운다.

- `SITE_CODE`
- `SITE_DOMAIN`
- `ADMIN_DOMAIN`
- `API_DOMAIN`
- `HTTP_PORT`
- `POSTGRES_*`
- `JWT_SECRET`
- `AMI_*`
- `ASTERISK_*`
- `REST_CORS_ORIGIN`
- `WS_CORS_ORIGIN`
- `VITE_API_BASE_URL`
- `VITE_WS_URL`

## 배포 명령

리허설 또는 첫 기동:

```bash
scripts/deploy-prod.sh --site-dir deploy/sites/<site-code> --skip-backup
```

기존 운영 site 재배포:

```bash
scripts/deploy-prod.sh --site-dir deploy/sites/<site-code>
```

## 배포 전 중단 조건

다음 조건이면 배포를 중단한다.

- `.env` 필수값 누락
- 기본 secret 사용
- HTTP 포트 충돌
- PBX AMI 접속 불가
- DB backup 미수행
- migration status 실패
- API/WebSocket URL과 CORS 설정 불일치
- PBX 설정 owner marker 불일치
- PBX smoke gate 실패

## PBX 설정 owner guard

PBX 설정 반영 전 다음 marker를 확인한다.

```text
/etc/asterisk/.kaster-cti-config-owner
```

marker가 다른 site code를 가리키면 설정 반영과 reload를 중단한다.

## 현재 한계

- image registry 기반 pull/restart 절차는 아직 별도 자동화가 필요하다.
