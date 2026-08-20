# 문서 인덱스

> 문서를 **어디에 어떤 이름으로** 쓰는지는 저장소 루트 [`DOCS_GUIDE.md`](../DOCS_GUIDE.md) 에 있다.
> 이 파일은 인덱스 전용이다. 규칙을 여기에 다시 적지 않는다.

정리 기준일: 2026-08-08 (타입 우선 체계로 일괄 재배치)

## 디렉터리

| 경로 | 담는 것 | 문서 수 | 세부 목록 |
|---|---|---:|---|
| [`design/`](design/) | 설계·아키텍처·계약·분석·제안 | 34 | [`design/_index.md`](design/_index.md) |
| [`plans/`](plans/) | 구현 계획·로드맵·범위·다음 작업 | 51 | [`plans/_index.md`](plans/_index.md) |
| [`operations/`](operations/) | 운영 절차·배포/마이그레이션 Runbook·릴리스 게이트 | 15 | [`operations/_index.md`](operations/_index.md) |
| [`qa/`](qa/) | 검증 결과·smoke report·증적 | 52 | [`qa/_index.md`](qa/_index.md) |
| [`reviews/`](reviews/) | 외부 문서·설계 검토 의견 | 1 | 아래 참조 |
| [`work-log/`](work-log/) | 날짜별·PR별 작업 로그 | 25 | [`work-log/_index.md`](work-log/_index.md) |
| [`reference/`](reference/) | 원본 PDF·외부 원문 (수정 안 함) | 12 | [`reference/README.md`](reference/README.md) |
| [`chatgpt-archive/`](chatgpt-archive/) | 대화 원문 아카이브 + 추출 스크립트 | — | — |

`openapi.json` 은 `apps/server` 의 `npm run openapi:export` 가 생성하는 산출물이다. 손으로 고치지 않는다.

## 처음 읽을 문서

| 목적 | 문서 |
|---|---|
| 시스템 전체 설계 | [`design/system-design.md`](design/system-design.md) |
| 멀티노드·장애복구 운영 아키텍처 | [`design/operations-architecture.md`](design/operations-architecture.md) |
| CTI 이벤트 계약 | [`design/cti-event-contract.md`](design/cti-event-contract.md) |
| 외부 CTI 연동 API | [`design/2026-08-07-external-cti-api-guide.md`](design/2026-08-07-external-cti-api-guide.md) |
| C# 데스크톱 클라이언트 설계 | [`design/2026-08-20-csharp-desktop-client-design.md`](design/2026-08-20-csharp-desktop-client-design.md) |
| C# 데스크톱 클라이언트 1단계 계획 | [`plans/2026-08-20-csharp-desktop-client-phase1-plan.md`](plans/2026-08-20-csharp-desktop-client-phase1-plan.md) |
| 현재 진행 계획 | [`plans/project-integrated-plan.md`](plans/project-integrated-plan.md) · [`plans/project-next-tasks.md`](plans/project-next-tasks.md) |
| 운영 배포 | [`operations/production-deployment-standard.md`](operations/production-deployment-standard.md) · [`operations/deployment-runbook.md`](operations/deployment-runbook.md) |
| 설치 준비 | [`operations/2026-08-10-installation-scenario-prep-checklist.md`](operations/2026-08-10-installation-scenario-prep-checklist.md) |
| DB 마이그레이션 | [`operations/db-migration-runbook.md`](operations/db-migration-runbook.md) |
| PBX 설정 반영 | [`operations/pbx-config-apply-runbook.md`](operations/pbx-config-apply-runbook.md) |
| 기획 원본 (PDF) | [`reference/01_project_overview.pdf`](reference/01_project_overview.pdf) · [`02_practical_design.pdf`](reference/02_practical_design.pdf) · [`03_db_api_asterisk_spec.pdf`](reference/03_db_api_asterisk_spec.pdf) |
| 요구사항 대비 구현 현황 | [`qa/2026-08-09-requirements-vs-implementation-verification.md`](qa/2026-08-09-requirements-vs-implementation-verification.md) |

## operations/

세부 목록은 [`operations/_index.md`](operations/_index.md) 를 참조한다.

## reviews/

| 문서 | 대상 |
|---|---|
| `2026-08-08-db-ha-resilience-design-review.md` | `K-CTI_DB_백업_복구_이중화_장애대응_설계서_v1.0.docx` 검토 |
