# P0 운영 준비 완료 체크리스트

작성일: 2026-05-01

## 상태 요약

| P0 항목 | 레포 산출물 | 최종 통과 기준 |
| --- | --- | --- |
| 실시간 이벤트 계약 | `docs/cti-event-contract.md`, 서버/웹/관리자/데스크톱 테스트 | 테스트 통과 및 실서버 WebSocket 이벤트 관찰 |
| 통화 제어 상태 동기화 | 서버 `call.updated`, 웹/데스크톱 ack-only 제거 | 동일 통화가 여러 클라이언트에서 같은 상태로 표시 |
| PBX 설정 반영 검증 | dry-run API/UI, `pbx-config-apply-runbook.md`, `pbx-config-preflight-smoke.ps1` | dry-run 통과, reload, 대표 DID smoke PASS |
| 운영 배포/DB migration | `deploy-prod.sh`, `db-migration-runbook.md`, site template | 백업, migration, restart, health/smoke 증적 |
| 데스크톱 실환경 SIP/미디어 | live test runbook, 증적 템플릿, artifact prepare script | 실제 상담원 PC에서 SIP/오디오/update PASS |

## P0 종료 조건

- [ ] `apps/server` 테스트와 TypeScript 검증 통과
- [ ] `apps/web`, `apps/admin`, `apps/desktop` build 통과
- [ ] PBX dry-run validation 통과
- [ ] 운영 DB 백업 파일 생성 확인
- [ ] 운영 migration 또는 no-schema-change 체크리스트 완료
- [ ] 대표 DID/큐/상담원/착신전환/수신거부 smoke test 완료
- [ ] 데스크톱 실환경 증적 템플릿 완료

## 실환경 증적 보관 위치

- PBX 반영: `docs/qa/pbx-apply-YYYYMMDD-<site>.md`
- 운영 배포: `docs/qa/deploy-YYYYMMDD-<site>.md`
- 데스크톱 테스트: `docs/qa/desktop-live-YYYYMMDD-<site>.md`
