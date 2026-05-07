# Site Deployment Template

이 디렉터리는 새 사이트 배포의 시작점이다.

## 사용 순서

1. `_template`을 사이트 코드로 복제한다.
   예: `deploy/sites/acme-callcenter`
2. `.env.example`을 `.env`로 복사하고 사이트 값으로 수정한다.
3. 도메인과 PBX AMI 접속 값을 채운다.
4. 운영 서버에서 아래 명령으로 기동한다.

```bash
cd deploy/sites/acme-callcenter
docker compose -f compose.prod.yml --env-file .env config
docker compose -f compose.prod.yml --env-file .env up -d --build
```

## 기본 가정

- PBX 서버는 외부 또는 별도 서버에 이미 존재한다.
- PostgreSQL/Redis는 같은 compose에서 기동한다.
- TLS는 외부 LB 또는 별도 ingress에서 종료한다.
- 현재 프론트는 build-time env 방식이라 사이트마다 build 값이 달라진다.
- 현재 저장소에는 `scripts/deploy-prod.sh`가 없으므로 compose 명령을 기준으로 배포한다.
- 배포 전 `docs/operations/p3-release-preflight-20260506.md`의 중단 조건을 확인한다.

## 디렉터리 구성

- `.env.example`: 사이트별 환경변수 템플릿
- `compose.prod.yml`: 운영 compose
- `nginx/default.conf.template`: 상담원/관리자/API 라우팅용 gateway 템플릿

## PBX 설정 owner guard

PBX 설정 반영 전 다음 marker를 확인한다.

```text
/etc/asterisk/.kaster-cti-config-owner
```

marker가 현재 site code와 다르면 설정 반영과 reload를 중단한다.
