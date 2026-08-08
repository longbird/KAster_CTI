# DOCS_GUIDE.md

KAster_CTI 저장소의 **문서 관리 규칙**이다. 사람과 에이전트(Claude Code, Codex 등) 모두 이 규칙을 따른다.
`CLAUDE.md` / `AGENTS.md` 는 코드 작업 규칙이고, 이 파일은 **문서를 어디에 어떤 이름으로 쓰는지**만 다룬다.

제정일: 2026-08-08
기준 체계: **타입 우선(type-first)**

---

## 1. 핵심 원칙

1. **문서는 반드시 타입 디렉터리 안에 둔다.** `docs/` 최상위에 `.md` 를 새로 만들지 않는다.
2. **파일명에 날짜를 넣는다.** `YYYY-MM-DD-주제-유형.md`. 같은 주제가 날짜순으로 정렬돼야 한다.
3. **한 문서는 한 가지 유형만 담는다.** 설계와 구현 계획을 한 파일에 섞지 않는다.
4. **사용자 노출 문구의 제품명은 `PBX`.** 코드 식별자·API 경로·파일 경로는 기존 계약명(`asterisk` 등) 유지.
5. **문서를 옮기면 그 문서를 가리키던 링크도 같이 고친다.** 끊긴 링크를 남기지 않는다.
6. **완료·검증 주장은 근거와 함께 적는다.** 실행하지 않은 검증을 "통과"로 적지 않는다.

## 2. 디렉터리

| 경로 | 담는 것 | 성격 |
|---|---|---|
| `docs/design/` | 설계, 아키텍처, 스펙, 계약, 제안, 갭 분석 | 지속 — 현재 시스템을 설명 |
| `docs/plans/` | 구현 계획, 로드맵, 범위 정의, 다음 작업 목록 | 시점 — 실행 전 산출물 |
| `docs/operations/` | 운영 절차, 배포/마이그레이션 Runbook, 릴리스 게이트, 체크리스트 | 지속 — 운영자가 따라 하는 절차 |
| `docs/qa/` | 검증 결과, smoke report, 테스트 기록, 증적 JSON | 시점 — 실행 결과 |
| `docs/reviews/` | 외부 문서 검토, 코드/설계 리뷰 의견 | 시점 — 판단 근거 |
| `docs/work-log/` | 날짜별·PR별 작업 로그 | 시점 — 무엇을 했는지 |
| `docs/reference/` | 원본 PDF, 외부 원문, 수정하지 않는 참고자료 | 불변 |
| `docs/chatgpt-archive/` | 수집된 대화 원문과 추출 스크립트 | 불변 아카이브 |

**폐지**: `docs/features/`, `docs/superpowers/`, `docs/proposals/`, `docs/ops/`.
`docs/ops/` 는 만들지 않는다. 운영 문서는 전부 `docs/operations/` 다.

### 생성 산출물 예외
`docs/openapi.json` 은 `apps/server/scripts/export-openapi.ts` 가 경로를 하드코딩한 **생성 산출물**이다.
`docs/` 최상위에 그대로 둔다. 손으로 편집하지 말고 `npm run openapi:export` 로 갱신한다.

## 3. 파일명 규칙

```
YYYY-MM-DD-주제-유형.md
```

- 날짜는 **최초 작성일**. 개정해도 날짜를 바꾸지 않고 문서 안에 `개정일`을 적는다.
- 주제는 소문자 kebab-case, 영문 우선. 기존 한글 파일명은 유지해도 되지만 새로 만들지 않는다.
- 유형 suffix는 아래 표에서 고른다.

| suffix | 의미 | 위치 |
|---|---|---|
| `-design.md` | 설계·아키텍처 | `docs/design/` |
| `-spec.md` | 인터페이스/데이터 계약 | `docs/design/` |
| `-analysis.md` | 분석·갭 분석 | `docs/design/` |
| `-proposal.md` | 제안 (채택 전) | `docs/design/` |
| `-plan.md` | 구현 계획 | `docs/plans/` |
| `-scope.md` | 범위 정의 | `docs/plans/` |
| `-runbook.md` | 운영 절차 | `docs/operations/` |
| `-checklist.md` | 점검 목록 | `docs/operations/` |
| `-verification.md` | 검증 결과 | `docs/qa/` |
| `-report.md` | 실행 결과 리포트 | `docs/qa/` |
| `-review.md` | 검토 의견 | `docs/reviews/` |
| `-worklog.md` | 작업 로그 | `docs/work-log/` |
| `-index.md` | 목록/인덱스 | 해당 디렉터리 |

## 4. 배치 결정 순서

새 문서를 만들 때 위에서부터 처음 맞는 항목을 고른다.

1. 외부에서 받은 원본이고 수정하지 않는가 → `docs/reference/`
2. 남의 문서나 코드에 대한 **판단·의견**인가 → `docs/reviews/`
3. **앞으로 할 일**을 적는가 (계획·범위·로드맵) → `docs/plans/`
4. **실행한 결과**를 적는가 (테스트·검증·증적) → `docs/qa/`
5. **한 것**을 시간순으로 적는가 → `docs/work-log/`
6. 운영자가 **따라 하는 절차**인가 → `docs/operations/`
7. 나머지 (시스템이 **어떻게 생겼는지** 설명) → `docs/design/`

헷갈리면 기준은 하나다: **"이 문서는 6개월 뒤에도 참일까?"**
참이면 `design/`·`operations/` (지속), 아니면 `plans/`·`qa/`·`reviews/`·`work-log/` (시점).

## 5. 인덱스

- `docs/README.md` 는 **인덱스 전용**이다. 규칙은 이 파일(`DOCS_GUIDE.md`)에만 둔다.
- 디렉터리에 문서가 15개를 넘으면 그 디렉터리에 `_index.md` 를 만들어 주제별로 묶는다.
- 인덱스는 문서를 추가·이동할 때 같은 커밋에서 갱신한다.

## 6. 금지 사항

- `docs/` 최상위에 새 `.md` 생성
- 날짜 없는 새 파일명
- 새 타입 디렉터리 임의 생성 (`docs/ops/`, `docs/notes/` 등)
- 계획서 안에 검증 결과를 덮어쓰기 — 검증은 `docs/qa/` 에 별도 문서로
- 실행하지 않은 명령의 출력을 지어내기
- 문서 이동 후 링크 방치

## 7. 새 문서 체크리스트

- [ ] 4장 결정 순서로 디렉터리를 골랐다
- [ ] 파일명이 `YYYY-MM-DD-주제-유형.md` 다
- [ ] 문서 첫머리에 작성일과 대상(코드 경로/커밋/문서)을 적었다
- [ ] 사용자 노출 문구에 `Asterisk` 대신 `PBX` 를 썼다
- [ ] 이 문서를 가리켜야 할 기존 문서에 링크를 추가했다
- [ ] `docs/README.md` 인덱스를 갱신했다
- [ ] 검증을 주장했다면 실제 실행한 명령과 출력 요약을 넣었다
