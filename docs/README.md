# PBX 문서 정리 규칙

작성일: 2026-08-02

## 기본 원칙

- 새로 생성하는 운영/설계/계획/검증 문서는 기능별 디렉터리 아래에 둔다.
- 파일명은 `YYYY-MM-DD-주제-문서유형.md` 형식을 사용한다.
- 사용자에게 노출되는 제품명은 `PBX`로 적는다.
- 내부 코드명, API path, 파일 path는 기존 계약명을 그대로 쓸 수 있다.
- 같은 기능의 문서는 날짜순 정렬이 가능해야 한다.

## 디렉터리 기준

| 위치 | 용도 |
| --- | --- |
| `docs/features/<feature>/` | 기능별 설계, 구현 계획, 운영 runbook, 검증 기록 |
| `docs/qa/` | 과거 QA 산출물과 대량 smoke report 보관 |
| `docs/reference/` | 원본 PDF, 외부 원문, 변경하지 않는 참고자료 |
| `docs/chatgpt-archive/` | 수집된 대화 원문과 분석 아카이브 |
| `docs/work-log/` | 날짜별 작업 로그 |

## 문서 유형 suffix

| suffix | 의미 |
| --- | --- |
| `-design.md` | 설계 |
| `-plan.md` | 구현 계획 |
| `-runbook.md` | 운영 절차 |
| `-verification.md` | 검증 결과 |
| `-analysis.md` | 분석 리포트 |
| `-index.md` | 기능별 문서 인덱스 |

## 예시

```text
docs/features/outbound-dialing/2026-08-02-client-originated-outbound-command-plan.md
docs/features/pbx-security/2026-08-02-pbx-sip-security-hardening-runbook.md
```

## 정리 방식

기존 문서는 한 번에 대량 이동하지 않는다. 기능 작업을 재개하거나 문서를 수정할 때 해당 기능 디렉터리로 이동하고, 문서명에 날짜가 없으면 최초 작성일 또는 확인 가능한 기준일을 붙인다.
