# PBX 설정 반영 Runbook

작성일: 2026-05-01

## 목적

PBX 서버 설정 변경을 preview, diff, dry-run, reload, smoke test 순서로 반영한다.

## 1. 사전 확인

- 관리자 앱에서 `.conf 미리보기 / dry-run`을 연다.
- 검증 요약이 `Dry-run 검증 통과`인지 확인한다.
- 변경 파일 표에서 `changed` 또는 `missing-current` 파일을 확인한다.
- 변경 범위가 요청된 DID, 큐, 내선, 착신전환, 수신거부, 멘트 범위와 일치하는지 확인한다.

PowerShell 확인:

```powershell
D:\Work\AI_Projects\KAster_CTI\scripts\pbx-config-preflight-smoke.ps1 `
  -ApiBaseUrl "https://<site-domain>" `
  -AccessToken "<supervisor-or-admin-access-token>"
```

## 2. 반영

dry-run이 통과하고 변경 범위가 승인되었을 때만 reload를 실행한다.

```powershell
D:\Work\AI_Projects\KAster_CTI\scripts\pbx-config-preflight-smoke.ps1 `
  -ApiBaseUrl "https://<site-domain>" `
  -AccessToken "<supervisor-or-admin-access-token>" `
  -ApplyReload
```

관리자 앱에서 실행하는 경우 `PBX 설정` 메뉴의 수동 reload 버튼을 사용한다.

## 3. 반영 후 smoke

아래 결과를 운영 기록에 남긴다.

| 항목 | 확인 방법 | 통과 기준 |
| --- | --- | --- |
| DID 라우팅 | 대표 DID 1건 인입 | 예상 IVR 또는 큐로 연결 |
| 큐 연결 | 큐 대기/상담원 연결 | `call.created` -> `call.updated` -> `call.ended` 흐름 생성 |
| 상담원 내선 | 테스트 상담원 SIP 등록 | 관리자 SIP 상태가 등록으로 표시 |
| 착신전환 | 전환 조건 DID 인입 | 지정 내선/큐/외부번호로 연결 |
| 수신거부/블랙리스트 | 등록 번호 1건 인입 | 차단 또는 opt-out 흐름으로 진입 |
| 안내 멘트 | 멘트 연결 DID 인입 | 지정 파일이 재생됨 |

## 4. 실패 시 복구

1. 추가 변경을 중지한다.
2. 직전 설정 파일 백업이 있으면 `/etc/asterisk`에 복원한다.
3. PBX 콘솔에서 `dialplan reload`, `module reload res_pjsip`, `queue reload all`을 실행한다.
4. `GET /api/v1/asterisk-config/dry-run`을 다시 호출해 현재 생성본과 복원본 차이를 확인한다.
5. smoke test 1건을 다시 수행한다.

## 5. 완료 증적

- dry-run 결과 JSON 또는 화면 캡처
- 변경 파일 목록
- reload 실행 시각
- smoke test 결과
- 실패 시 복구 명령과 최종 정상 확인
