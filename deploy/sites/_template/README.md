# Site Deployment Template

이 디렉터리는 새 사이트 배포의 시작점이다.

## 사용 순서

1. `_template`을 사이트 코드로 복제한다.
   예: `deploy/sites/acme-callcenter`
2. `.env.example`을 `.env`로 복사하고 사이트 값으로 수정한다.
3. 도메인과 Asterisk AMI 접속 값을 채운다.
4. 운영 서버에서 아래 명령으로 기동한다.

```bash
cd deploy/sites/acme-callcenter
docker compose -f compose.prod.yml --env-file .env up -d --build
```

## 기본 가정

- Asterisk는 외부 또는 별도 서버에 이미 존재한다.
- PostgreSQL/Redis는 같은 compose에서 기동한다.
- TLS는 외부 LB 또는 별도 ingress에서 종료한다.
- 현재 프론트는 build-time env 방식이라 사이트마다 build 값이 달라진다.

## 디렉터리 구성

- `.env.example`: 사이트별 환경변수 템플릿
- `compose.prod.yml`: 운영 compose
- `nginx/default.conf.template`: 상담원/관리자/API 라우팅용 gateway 템플릿
