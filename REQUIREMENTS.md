# REQUIREMENTS.md - KAster_CTI

상태: 작성 중
작성일: 2026-05-09

이 문서는 CC5W 흐름에서 요구사항의 고정 입력으로 쓰기 위한 루트 인덱스입니다.
현재 프로젝트 요구사항의 상세 원천은 아래 문서와 실제 코드 상태입니다.

## 요구사항 원천

- `docs/plans/project-integrated-plan.md`
- `docs/design/system-design.md`
- `docs/plans/project-current-analysis-next-actions-20260506.md`
- `docs/plans/project-next-actions.md`
- `docs/plans/project-next-tasks.md`
- `CODEBASE_MAP.md`
- `AGENTS.md`
- `CLAUDE.md`

## 현재 범위

- PBX 서버 설정/연동
- IVR/Smart ARS
- CTI 서버 API, AMI 이벤트 처리, Redis, WebSocket, Prisma DB
- 상담원 웹 앱
- 관리자 앱
- Windows 데스크톱 소프트폰
- 운영 배포, 모니터링, QA 문서/스크립트

## 운영 제약

- 사용자에게 노출되는 제품명과 문구는 `PBX`로 통일합니다.
- 내부 구현명, API 경로, 파일 경로처럼 이미 계약된 식별자는 기존 명칭을 유지할 수 있습니다.
- 실제 운영 검증이 필요한 항목은 로컬 테스트만으로 완료 처리하지 않습니다.
- Prisma schema 변경 후에는 `prisma generate`와 migration 검증을 함께 수행합니다.
- 관리자 메뉴 추가/변경 시 프론트 메뉴 권한과 서버 권한 기본값을 함께 확인합니다.

## 미확정 항목

- CC5W 기준 요구사항 Frozen 여부
- 운영 서버별 배포 절차와 rollback 절차의 최종 표준
- 실제 PBX/AMI 필드 변형에 대한 사이트별 검증 결과
- 누적 Prisma migration의 운영 DB 적용 상태

## 다음 단계

1. PM/운영자가 위 원천 문서 중 현재 기준으로 유효한 문서를 확정합니다.
2. `REQUIREMENTS.md`를 상세 요구사항 문서로 확장하거나, 특정 문서를 Frozen 입력으로 지정합니다.
3. 이후 CC5W `/analyst`, `/architect`, `/pm` 단계로 진행합니다.
