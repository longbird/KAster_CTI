# PBX 설정 생성 매핑

작성일: 2026-05-01

## 목적

관리자 입력값이 어떤 PBX 서버 설정 파일로 렌더링되는지 운영자가 추적할 수 있게 한다.

## 입력값별 출력

| 관리자 입력 | 서버 저장/조회 | 생성 파일 | 주요 출력 |
| --- | --- | --- | --- |
| SIP Trunk | `asteriskTrunk` | `pjsip.conf` | `trunk-*-auth`, `trunk-*-aor`, `trunk-*`, `trunk-*-identify` |
| 상담원 내선/SIP 비밀번호 | `agents`, `tenantSystemSettings.defaultSipPassword` | `pjsip.conf`, `extensions_agent.conf` | 내선 endpoint/auth/aor, `agent-phone-*`, `from-queue` |
| DID | `asteriskDid` | `extensions_inbound.conf` | `inbound-main` DID entry |
| DID 직통 큐 | `asteriskDid.directQueue`, `queues` | `extensions_inbound.conf`, `extensions_queue.conf`, `queues.conf` | `Goto(queue-entry,...)`, queue member |
| IVR 메뉴 | `asteriskIvrMenu`, `asteriskIvrEntry`, `asteriskPrompt` | `extensions_queue.conf` | `ivr-menu-*`, DTMF route, prompt playback |
| 착신전환 | `asteriskForwardingRules` | `extensions_inbound.conf`, `extensions_queue.conf` | `forwarding-rule-*`, `forward-dispatch` |
| 지사별 안내 멘트 | `branches.settingsProfile.prompts`, `asteriskPrompt` | `extensions_inbound.conf`, `musiconhold_kaster_prompts.conf` | `Playback(...)`, prompt MOH class |
| 080 수신거부 | `branches.settingsProfile.blocklist080`, `asteriskBlocklistEntry` | `extensions_inbound.conf`, `extensions_queue.conf` | `080-optout-*`, hook script call |
| Smart ARS | `branches.settingsProfile.smartArs` | `extensions_inbound.conf`, `extensions_queue.conf` | `smart-ars-*`, queue/transfer/SMS/opt-out actions |
| 블랙리스트 | `asteriskBlocklistEntry` | `extensions_inbound.conf` | `blocked-ani` routing |

## 운영 차단 기준

- 활성 DID는 IVR 메뉴 또는 직통 큐 중 하나가 있어야 한다.
- IVR 메뉴가 참조하는 큐와 프롬프트는 활성 상태여야 한다.
- SIP Trunk 인증은 username/password가 동시에 있거나 동시에 없어야 한다.
- TIME_RANGE 착신전환은 시작/종료 시간과 요일이 있어야 한다.
- 프롬프트 파일은 `ASTERISK_SOUNDS_DIR` 하위에 실제 재생 가능한 파일로 배포되어야 한다.

## Dry-run 확인 위치

- API: `GET /api/v1/asterisk-config/dry-run`
- 관리자: `.conf 미리보기 / dry-run`
- 스크립트: `scripts/pbx-config-preflight-smoke.ps1`
