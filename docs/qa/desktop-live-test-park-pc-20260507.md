# 데스크톱 상담원 PC 실환경 검증

작성일: 2026-05-07 12:05 KST
테스트 담당: Codex
사이트/센터: 기본 개발 서버 기준

## 1. 환경

| 항목 | 값 |
| --- | --- |
| 상담원 PC OS | Windows 10 Education, 64비트 |
| PC 이름 | `PARK-PC` |
| 내부 IP | `192.168.0.210` |
| 마이크/오디오 장치 | `AMD High Definition Audio Device`, `Realtek High Definition Audio`, `USB 오디오 장치` |
| PBX 서버 주소/포트 | SIP WS `49.247.46.86:8088`, PBX WS path `/ws` |
| CTI 서버 URL | `http://49.247.46.86:3000/api/v1` |
| 상담원 계정/내선 | `agent1001 / 1001` |
| 테스트 DID | 미확정 |
| 데스크톱 앱 버전 | `0.1.0` |
| 실행 파일 | `apps/desktop/release/win-unpacked/KAster Agent.exe` |
| 서버 버전/커밋 | 기본 개발 서버 기준, 커밋 미기록 |

## 2. 시작 전 서버/네트워크 확인

| 시나리오 | 결과 | 증적 |
| --- | --- | --- |
| CTI server ready | PASS | `GET /api/v1/health/ready` -> `ready: true` |
| CTI TCP 연결 | PASS | `Test-NetConnection 49.247.46.86:3000` -> `TcpTestSucceeded: true` |
| SIP WS TCP 연결 | PASS | `Test-NetConnection 49.247.46.86:8088` -> `TcpTestSucceeded: true` |
| agent desktop login API | PASS | `clientType=desktop` 로그인 성공 |
| desktop session API | PASS | `GET /auth/desktop/session` 성공 |
| softphone config 수신 | PASS | `sip:1001@49.247.46.86`, `ws://49.247.46.86:8088/ws`, username `1001` |
| 상담원 상태 API | PASS | `agent1001 / 1001` currentStatus `AVAILABLE` |
| active call baseline | PASS | `GET /calls/active` -> `[]` |
| SIP credential 대조 | FAIL -> FIXED | 서버 최초 응답 `1234567890`, PBX `1001-auth` `SmokeSip123!`; `agent1001.sipPassword`를 `SmokeSip123!`로 보정 |

## 3. 데스크톱 앱 실행

| 시나리오 | 결과 | 증적 |
| --- | --- | --- |
| 앱 프로세스 실행 | PASS | `KAster Agent.exe` 실행, primary PID `140600` |
| 앱 응답 상태 | PASS | process `Responding: true` |
| 로컬 bridge health | PASS | `GET http://127.0.0.1:48125/health` -> `status: ok`, protocol `kaster-agent` |
| CTI 서버 연결 | PASS | primary process TCP connection to `49.247.46.86:80` observed |
| SIP WS 연결 | PASS | renderer/child process TCP connection to `49.247.46.86:8088` observed |

## 4. SIP/통화

| 시나리오 | 결과 | 증적 |
| --- | --- | --- |
| SIP 등록 성공 | PASS | 데스크톱 재실행 후 AMI `pjsip show contacts`에 `1001/sip:t3pne456@61.42.53.61:60216` contact 생성, endpoint `Not in use` |
| 인입 ringing 표시 | NOT RUN | 테스트 DID 미확정 |
| 인입 수락 후 음성 송수신 | NOT RUN | 테스트 DID/현장 음성 확인 필요 |
| 인입 거절 | NOT RUN | 테스트 DID 필요 |
| 발신 | NOT RUN | 테스트 수신 번호/발신 정책 확인 필요 |
| 종료 후 `call.ended` 반영 | NOT RUN | 실제 통화 필요 |
| 서버 재시작 후 복구 | NOT RUN | 통화/등록 기준선 확보 후 수행 |
| 네트워크 단절 후 복구 | NOT RUN | 통화/등록 기준선 확보 후 수행 |

## 5. 오디오 장치

| 시나리오 | 결과 | 증적 |
| --- | --- | --- |
| 장치 목록 OS 감지 | PASS | Realtek/AMD/USB 오디오 장치 `Status: OK` |
| 마이크 선택 저장 | NOT RUN | 앱 화면 조작 필요 |
| 통화 스피커 선택 저장 | NOT RUN | 앱 화면 조작 필요 |
| 벨소리 장치 선택 저장 | NOT RUN | 앱 화면 조작 필요 |
| 통화음과 벨소리 출력 분리 | NOT RUN | 실제 preview/통화음 확인 필요 |
| 앱 재시작 후 설정 유지 | NOT RUN | 장치 선택 후 재시작 필요 |

## 6. 업데이트

| 시나리오 | 결과 | 증적 |
| --- | --- | --- |
| manifest 조회 | NOT RUN | update artifact/session 확인 필요 |
| tokenized download | NOT RUN | update artifact 필요 |
| SHA-256 검증 | NOT RUN | update artifact 필요 |
| 통화 중 설치 차단 | NOT RUN | 실제 통화 상태 필요 |
| 유휴 상태 설치 가능 | NOT RUN | update artifact 필요 |
| 설치 결과 서버 기록 | NOT RUN | update artifact 필요 |

## 7. 현재 차단점

- 테스트 DID가 아직 지정되지 않아 인입 통화 시나리오를 실행하지 못했다.
- 발신 시도 1건은 상담원 단말 응답 전 timeout으로 종료됐다.
- 발신 검증용 수신 번호와 발신 허용 정책은 실제 연결 단계에서 추가 확인이 필요하다.
- 원인은 서버가 데스크톱에 내려준 SIP credential과 PBX `1001-auth` 비밀번호 불일치였다.
- 2026-05-07 12:17 KST 기준 기본 개발 DB에서 `agent1001.sipPassword`를 `SmokeSip123!`로 보정했다.
- 2026-05-07 12:24 KST 데스크톱 앱을 재실행했고, 서버가 내려주는 desktop softphone credential은 `SmokeSip123!`로 확인됐다.
- 재실행 후 PBX AMI CLI 기준 내선 `1001`은 `Not in use`이며 contact가 생성됐다.
- 오디오 장치 저장/preview는 앱 화면 조작과 실제 출력 확인이 필요하다.
- 업데이트 검증은 테스트 artifact 준비가 필요하다.

## 8. 다음 실행 순서

1. 테스트 DID와 caller 번호 확정
2. 단건 인입 통화 실행
3. 앱 ringing 표시, 수락, 음성 송수신, 종료 확인
4. CTI 서버에서 `call.ended` 확인
5. 장치 선택/preview/재시작 유지 확인
6. 발신, 거절, 장애 복구, update flow 순서로 확장

## 10. 발신 시도 1차 분석

발신 시각: 2026-05-07 12:29 KST

입력:

- 상담원 내선: `1001`
- 발신 대상: `01034623453`
- 발신번호: `07052346380`

서버 로그:

- `Originate requested: PJSIP/1001 -> 01034623453@outbound-main-1001`
- 이후 `OriginateResponse` 수신
- 사용자가 종료를 누른 시점에는 `hangup: no active agent leg ... AMI action skipped`

PBX/DB 상태:

- `callSessions`에 `linkedid=1778124577.74` 생성
- `sessionStatus=ENDED`
- `answeredAt=null`
- `endedAt=2026-05-07T03:30:07.370Z`
- AMI 이벤트는 `PJSIP/1001` 채널이 `Ringing` 상태였다가 약 30초 후 `Hangup`됨
- 현재 `core show channels concise` 기준 남아 있는 채널 없음

판정:

- 외부 번호로 나가기 전 상담원 단말 `PJSIP/1001`을 먼저 울리는 originate 1단계에서 종료됐다.
- 상담원 단말 응답이 없어서 외부 대상 번호 연결 단계까지 진행되지 않았다.
- 현재 오류는 PBX 등록 실패가 아니라 발신 originate 흐름에서 상담원 leg 미응답/timeout으로 보는 것이 맞다.

추가 확인:

- 다음 발신 재시도 때 데스크톱 앱에 softphone incoming/ringing UI가 뜨는지 확인한다.
- ringing UI가 뜨면 `받기`를 눌러야 외부 번호 `01034623453@outbound-main-1001` 단계로 넘어간다.
- `outbound-main-1001` dialplan은 현재 `Playback(ss-noservice)` 후 `Hangup()` 형태이므로, 상담원 응답 후에도 실제 통신사 발신 대신 no-service 안내로 종료될 수 있다.

## 11. 발신 즉시 진행 조치

- 데스크톱 앱 발신 경로를 수정해 softphone 등록 상태에서는 서버 `/calls/originate` 콜백 경로 대신 SIP.js direct INVITE를 사용하도록 변경했다.
- `apps/desktop` 빌드와 `release/win-unpacked` 패키징을 완료했고, 새 실행본으로 데스크톱 앱을 재실행했다.
- 현재 서버 시스템 설정의 `allowDirectSipDial`을 `true`로 변경했다.
- 서버 컨테이너의 PBX reload preview는 trunk 발신 dialplan을 생성하지만, 실제 PBX host 설정 파일에는 자동 반영되지 않는 상태를 확인했다.
- 즉시 검증을 위해 AMI CLI로 런타임 `agent-phone-1001` / `outbound-main-1001` dialplan을 trunk `trunk-070-5234-6380` 발신으로 hotpatch했다.
- 주의: AMI CLI hotpatch는 PBX 재시작 또는 파일 기반 dialplan reload 시 사라질 수 있으므로, 운영 배포 전 host PBX 설정 파일 영구 반영 경로를 정리해야 한다.

## 12. 발신 UI/실행 보정

- 데스크톱 앱 발신은 softphone 등록 상태에서만 가능하도록 고정했다. 미등록 상태에서는 서버 콜백형 발신으로 fallback하지 않는다.
- 발신 버튼 클릭은 비동기 처리 상태를 표시하고, 실패 시 화면에 오류 문구를 남기도록 변경했다.
- idle 창 크기를 `440x500`, 최소 `420x460`으로 키워 발신 실패 후 창이 작아져도 발신 버튼이 보이도록 조정했다.
- `apps/desktop` 테스트 123건 통과, 빌드와 `release/win-unpacked` 패키징 완료.
- 2026-05-07 12:50 KST 기준 새 실행본 재실행 및 bridge health 정상 확인.

## 13. 내선 통화 보정

- 내선 목록의 상담원 버튼 클릭 시 즉시 연결하지 않고 확인 팝업을 표시하도록 변경했다.
- 확인 팝업에서 `연결`을 눌러야 내선 통화를 시작한다.
- 내선 통화도 서버 콜백형 `/calls/originate/internal` 경로를 사용하지 않고, 등록된 softphone에서 대상 내선으로 직접 INVITE를 보내도록 변경했다.
- softphone 수신 상태에서 `activeCall`이 없어도 `받기`/`거절` 버튼이 활성화되도록 수정했다.
- PBX 런타임 `agent-phone-1001` context에 내선 패턴 `_[12]XXX -> Dial(PJSIP/${EXTEN},20,...)`을 hotpatch했다.
- `apps/desktop` 테스트 124건 통과, 서버 agent dialplan renderer 단일 테스트 3건 통과.
- 주의: 내선 PBX hotpatch도 런타임 반영이므로 PBX 재시작 또는 파일 기반 dialplan reload 시 사라질 수 있다.

## 14. 대기 화면 크기 보정

- 대기 화면에서 외부 발신 입력이 작은 데스크톱 창에서도 한 줄 배치를 유지하도록 수정했다.
- `desktop-layout`에 내부 세로 스크롤을 허용해 콘텐츠가 창 높이를 넘을 때 아래 영역이 잘리지 않도록 수정했다.
- idle 창 기본 크기를 `440x560`, 최소 `420x520`으로 조정했다.
- `apps/desktop` 테스트 124건 통과, 빌드와 `release/win-unpacked` 패키징 완료.
- 2026-05-07 13:06 KST 기준 새 실행본 재실행 및 bridge health 정상 확인.

## 15. 내선별 로그인/SIP 상태 표시 및 발신 차단

- 서버 `/agents` 응답에 상담원별 `loginStatus`, `activeSession`, `sipRegistration`, `canCall`을 포함하도록 변경했다.
- 로그인 여부는 활성 refresh token 기준으로 판정한다.
- SIP 등록 여부는 PBX AMI `PJSIPShowContacts` 결과의 endpoint/contact 상태 기준으로 판정한다.
- 데스크톱 앱 내선 목록과 전체 상담원 팝업에 내선/상담 상태/로그인 상태/SIP 등록 상태를 표시하도록 변경했다.
- `LOGGED_OUT` 또는 SIP 미등록 상담원은 내선 발신 버튼을 비활성화하고, 클릭/확인 단계에서 발신 요청이 나가지 않도록 차단했다.
- 통화 연결 실패 시 상태 카드에 실패 이유를 남기도록 변경해 화면 전환으로 실패 원인이 사라지지 않게 했다.
- 현재 운영 개발 서버 `/agents` 확인 결과:
  - `1001`: `LOGGED_IN`, SIP 등록 `true`, `canCall=true`
  - `1002`: `LOGGED_OUT`, SIP 등록 `false`, `canCall=false`
  - `2001`: `LOGGED_IN`, SIP 등록 `false`, `canCall=false`
- 2026-05-07 13:20 KST 기준 데스크톱 브리지 health 정상 확인.

## 16. 외부 발신번호 표시 및 PBX 발신 실패 원인 확인

- 외부 발신 영역의 발신번호 선택 폭이 부족해 `07052346380`이 잘리는 문제를 수정했다.
- 데스크톱 렌더러 테스트 124건 통과, 빌드 및 `release/win-unpacked` 패키징 완료.
- 새 실행본 재실행 후 bridge health 정상 확인.
- 2026-05-07 13:18:53 KST PBX 로그에서 외부 발신 실패 원인을 확인했다:
  - `endpoint 'trunk-070-5234-6380' was not found`
  - `Unable to create channel of type 'PJSIP' (cause 3 - No route to destination)`
- 현재 PBX에 존재하는 endpoint는 `1001`, `3999`, `trunk-loadgen-smoke-61-42-53-61`이다.
- 즉시 검증을 위해 런타임 `agent-phone-1001` 외부 발신 route를 실제 존재하는 `trunk-loadgen-smoke-61-42-53-61` endpoint로 hotpatch했다.
- 주의: 이 조치는 런타임 hotpatch이므로 PBX 재시작 또는 파일 기반 dialplan reload 시 사라질 수 있다. 운영 반영 전 실제 통신사 trunk endpoint와 서버 설정의 trunk 이름을 일치시켜야 한다.

## 17. PBX 설정 영구 반영

- 원격 서버 `/etc/asterisk`를 `/home/blueadm/kaster_cti/backups/asterisk-conf-20260507-133004.tar.gz`로 백업했다.
- `docker-compose.dev.yml`의 서버 컨테이너를 PBX host 설정 쓰기 모드로 변경했다:
  - `ASTERISK_CONF_DIR=/etc/asterisk`
  - `ASTERISK_SOUNDS_DIR=/var/lib/asterisk/sounds/custom`
  - `/etc/asterisk`와 `/var/lib/asterisk/sounds/custom`을 서버 컨테이너에 volume mount
- 원격 서버 이미지를 재빌드하고 `kaster-server`를 재기동했다.
- 서버 boot sync가 DB 기준 PBX 설정 파일을 `/etc/asterisk`에 생성하고 AMI reload를 실행했다.
- PBX 런타임 확인 결과:
  - `pjsip show endpoint trunk-070-5234-6380`에서 endpoint 인식됨
  - `outbound-main-1001`이 `Dial(PJSIP/${EXTEN}@trunk-070-5234-6380,60,...)`로 파일 기반 반영됨
- `/agents` 기준 `1001`은 `LOGGED_IN`, SIP 등록 `true`, `canCall=true` 상태를 유지한다.

## 18. 외부 발신 UI 및 WebRTC 음성 경로 보정

- 외부 발신번호 select 폭을 150px로 확장하고 버튼 폭을 줄여 `07052346380`이 잘리지 않도록 다시 조정했다.
- 데스크톱 softphone에 미디어 진단을 추가했다:
  - 통화 성립 후 마이크 오디오 트랙 누락 시 `MEDIA_LOCAL_AUDIO_MISSING`
  - 상대 오디오 트랙 누락 시 `MEDIA_REMOTE_AUDIO_MISSING`
  - ICE 실패/끊김 시 `MEDIA_ICE_FAILED` 또는 `MEDIA_ICE_DISCONNECTED`
  - 원격 오디오 재생 실패 시 `MEDIA_PLAYBACK_FAILED`
- 2026-05-07 13:49 KST 기준 새 데스크톱 실행본으로 재시작했고 bridge health 정상 확인.
- 음성 미전달 원인 확인 중 실제 PBX `/etc/asterisk/pjsip.conf`에 NAT/RTP 주소가 누락된 상태를 확인했다.
- 운영 서버 PBX 설정 reload 후 `transport-udp`에 `external_media_address`, `external_signaling_address`, `local_net`이 반영됨을 확인했다.
- 추가로 서버 렌더러를 수정해 WebRTC용 `transport-ws`에도 동일한 NAT/RTP 주소를 영구 반영하도록 변경했다.
- dev 서버 서버 이미지를 재빌드/재기동하고 PBX reload를 다시 실행했다.
- PBX 런타임 `pjsip show transport transport-ws` 확인 결과:
  - `external_media_address=49.247.46.86`
  - `external_signaling_address=49.247.46.86`
  - `local_net=10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`
- 검증:
  - `apps/desktop`: 30개 파일, 124개 테스트 통과
  - `apps/desktop`: production build 통과
  - `apps/desktop`: `pack:dir` 통과 및 새 실행본 재시작
  - `apps/server`: `pjsip.renderer.spec.ts` 11개 테스트 통과
  - `apps/server`: production build 통과
  - dev 서버 `kaster-server` 재배포 및 PBX reload 성공

## 19. 음성 미전달 추가 보정

- 2026-05-07 13:57-13:59 KST RTP debug 창에서는 RTP 로그가 파일에 남지 않았다. 확인 결과 PBX logger가 `NOTICE/WARNING/ERROR`만 파일 기록하도록 설정되어 있었다.
- privileged packet capture도 사용자 재시도와 동기화되지 않아 통화 중 RTP 방향성 증적은 확보하지 못했다.
- PBX `core show codecs audio`에서 `opus` codec 사용 가능을 확인했다.
- 상담원 WebRTC endpoint의 codec 허용값을 `alaw,ulaw`에서 `opus,alaw,ulaw`로 확장했다.
- 상담원 endpoint에 WebRTC 미디어 협상 값을 명시했다:
  - `use_avpf=yes`
  - `media_encryption=dtls`
  - `media_use_received_transport=yes`
  - `dtls_auto_generate_cert=yes`
  - `dtls_verify=fingerprint`
  - `dtls_setup=actpass`
  - `ice_support=yes`
  - `rtcp_mux=yes`
- dev 서버 재배포 및 PBX reload 후 런타임 `pjsip show endpoint 1001`에서 `allow=(opus|alaw|ulaw)` 확인.
- 데스크톱 앱을 재시작해 `1001` SIP contact가 새로 등록됨을 확인했다.
- 검증:
  - `apps/server`: `pjsip.renderer.spec.ts` 11개 테스트 통과
  - `apps/server`: production build 통과
  - dev 서버 `kaster-server` 재배포 및 PBX reload 성공

## 20. 연결 직후 끊김 원인 확인 및 복구

- 2026-05-07 14:12 KST 통화 로그에서 연결 직후 끊김 원인을 확인했다:
  - `No path to translate from PJSIP/trunk-070-5234-6380... to PJSIP/1001...`
  - `Had to drop call because I couldn't make PJSIP/1001... compatible with PJSIP/trunk-070-5234-6380...`
- 직전 `opus` 허용으로 상담원 WebRTC leg가 `opus`, trunk leg가 `alaw`로 협상되면서 PBX가 변환 경로를 만들지 못했다.
- 상담원 endpoint codec을 다시 `alaw,ulaw`로 복구했다.
- WebRTC 미디어 협상 보정값은 유지했다:
  - `use_avpf=yes`, `media_encryption=dtls`, `media_use_received_transport=yes`, `dtls_auto_generate_cert=yes`, `dtls_verify=fingerprint`, `dtls_setup=actpass`, `ice_support=yes`, `rtcp_mux=yes`
- dev 서버 재배포 및 PBX reload 후 런타임 `pjsip show endpoint 1001`에서 `allow=(alaw|ulaw)` 확인.
- 데스크톱 앱 재시작 후 `1001` SIP contact가 새로 등록됨을 확인했다.
- 검증:
  - `apps/server`: `pjsip.renderer.spec.ts` 11개 테스트 통과
  - `apps/server`: production build 통과
  - dev 서버 `kaster-server` 재배포 및 PBX reload 성공

## 9. 최종 판정

- [ ] 모든 P0 필수 시나리오 PASS
- [ ] FAIL 항목이 있으면 운영 반영 전 수정 계획 작성
- [x] 로그/서버 이벤트 1차 증적 작성

현재 판정: 상담원 PC 검증을 시작했고, 서버 연결/desktop session/softphone config/앱 실행/bridge health/SIP WS TCP 연결/SIP 등록까지 확인했다. 다음 검증은 실제 인입 통화와 오디오 송수신이다.
