# KAster CTI WebRTC PoC 준비도 기반 구현 계획

작성일: 2026-04-19

## 목적

상담원 앱 WebRTC 소프트폰 기능은 다음 작업으로 이어갈 가치가 있지만, 현재 시점의 우선순위는 기능 추가보다 **시스템 완성도와 운영 안정성 확보**다.

따라서 이 문서는 다음 두 가지를 동시에 정리한다.

1. WebRTC PoC를 어떤 구조로 진행할지
2. 그 전에 현재 시스템에서 먼저 닫아야 할 준비 조건이 무엇인지

핵심 원칙은 다음과 같다.

- 지금 당장 WebRTC를 붙이는 것보다, 현재 CTI/PBX 시스템의 완성도를 먼저 높인다.
- WebRTC는 기존 CTI 구조를 뒤엎지 않고, 별도 softphone 계층으로 붙인다.
- PoC는 제한된 범위에서 검증하고, 운영형 확장은 별도 단계로 분리한다.

## 현재 판단

현재 저장소는 아래 성격에 가깝다.

- 상담원 앱은 CTI 제어 UI와 실시간 이벤트 소비 계층이 구현되어 있다.
- 백엔드는 AMI 기반 세션 조립, 콜 제어, 전환 추적, 권한, 기본 운영 기능을 상당 부분 갖췄다.
- Asterisk 설정도 desk phone 중심 PJSIP 구조로는 연결되어 있다.

하지만 WebRTC를 바로 얹기에는 다음 한계가 남아 있다.

### 1. 현재 호 제어 모델이 `내선 = 단일 PJSIP endpoint` 가정에 묶여 있음

- 발신: `PJSIP/${agentExtension}`
- 내선 발신: `PJSIP/${agentExtension}`
- 큐 멤버: `PJSIP/${extension}`
- 당겨받기/전환/종료/음소거도 살아 있는 상담원 leg channel 기준

즉 현재 구조는 "브라우저 단말"과 "데스크폰 단말"을 분리해 다루는 모델이 아니다.

### 2. 프론트에는 SIP/WebRTC 세션 계층이 없음

- 현재 프론트는 REST + Socket.IO 기반 CTI 이벤트만 처리한다.
- 마이크 권한, 오디오 장치 선택, SIP 등록, SDP 세션, 재등록, 미디어 attach 상태가 없다.

### 3. Asterisk 설정이 WebRTC transport 기준이 아님

- 현재는 UDP 중심 PJSIP endpoint 구조다.
- WSS, TLS, DTLS-SRTP, ICE, RTCP mux, TURN 연동 기준이 문서화/자동생성되지 않았다.

### 4. 운영 준비도가 아직 더 중요함

현재 시스템은 다음과 같은 "완성도 우선" 과제가 더 직접적이다.

- 상담원 앱 실사용 흐름 검증
- 호 분배룰 운영 정책 고도화
- 전환 상태머신 고도화
- 권한 모델 정교화
- 운영 스모크/배포 검증 자동화
- Asterisk config render/reload 신뢰도 보강

## 의사결정

현재 시점의 구현 우선순위는 아래와 같이 둔다.

1. 기존 CTI/PBX 시스템 완성도 향상
2. WebRTC PoC 착수 준비도 확보
3. 준비 조건 충족 후 제한된 WebRTC PoC 진행

즉, **WebRTC는 진행 대상이 맞지만 즉시 1순위는 아니다.**

## 목표 상태

WebRTC PoC의 목표는 다음과 같다.

- 상담원 앱 내부에서 브라우저 softphone이 등록된다.
- 특정 상담원은 WebRTC endpoint로 수신/응답/종료가 가능하다.
- 기존 CTI UI, 고객 팝업, 세션 추적, 이벤트 로그와 모순 없이 함께 동작한다.
- PoC 범위에서는 운영 리스크가 큰 기능을 제외하고, 최소 통화 성립 경로를 검증한다.

## PoC 범위

### 포함

- 브라우저 SIP/WebRTC 등록
- 수신
- 응답
- 종료
- 브라우저 로컬 음소거
- 등록 상태/장치 상태 UI

### 제외

- attended transfer
- queue pickup 고도화
- hold/resume 완전 연동
- supervisor 원격 제어
- 다중 단말 동시 등록
- production-grade TURN/외부망 품질 최적화

## 권장 아키텍처

WebRTC는 기존 CTI 소켓 계층 위에 얹지 않고, 아래처럼 분리한다.

### 제어 계층

- 기존 REST API
- 기존 Socket.IO `/ws`
- 기존 AMI 기반 세션 엔진

역할:

- 통화 상태
- 고객 팝업
- 이력/메모
- 권한/정책
- 콜 제어 요청

### 미디어/단말 계층

- 브라우저 softphone store
- SIP.js 또는 동급 브라우저 SIP 클라이언트
- Asterisk PJSIP WSS transport

역할:

- SIP 등록
- 세션 수락/종료
- 오디오 장치 선택
- 마이크 권한
- remote audio attach

### 서버 측 보강

- `me/session`에 softphone 설정 제공
- 상담원별 dial target 선택 정책
- WebRTC endpoint 렌더링
- 큐 멤버의 endpoint 선택 확장

## 구현 원칙

### 원칙 1. CTI와 SIP를 분리한다

현재 Socket.IO는 업무 이벤트 전파용이다. SIP signaling까지 섞으면 상태 결합이 심해지므로 softphone store는 분리한다.

### 원칙 2. 같은 내선을 데스크폰과 웹폰이 공유하지 않는다

PoC는 `1001`과 `1001-web`처럼 별도 endpoint를 두는 방향이 안전하다.

이유:

- 현재 endpoint 가정이 너무 강하다.
- `max_contacts=1` 충돌을 피할 수 있다.
- 기존 desk phone 경로를 깨지 않고 비교 검증이 가능하다.

### 원칙 3. PoC는 "한 명의 상담원, 한 경로"부터 검증한다

처음부터 전체 큐/전체 상담원 대상으로 확장하지 않는다.

### 원칙 4. 서버 음소거와 브라우저 음소거를 구분한다

현재 AMI `MuteAudio`와 브라우저 local track mute는 의미가 다르다. PoC에서는 브라우저 음소거를 별도 상태로 다룬다.

## 선행 조건

WebRTC에 손대기 전에 아래 조건이 먼저 정리되어야 한다.

## Phase 0. 시스템 완성도 우선 항목

### 0-1. 상담원 앱 실사용 흐름 마감

대상:

- 로그인
- 실시간 이벤트
- 최근 이력
- 메모
- 전환
- 종료
- 상태 변경

완료 기준:

- mock 전제 UI 흔적이 줄어든다.
- 실시간 지연/누락에도 화면이 크게 흔들리지 않는다.
- 상담원 앱만으로 기본 근무 흐름이 닫힌다.

### 0-2. 호 분배룰 운영 정책 마감

대상:

- 기본 호 분배룰 정책
- DID directQueue 연결
- queue strategy 운영 규칙
- 멤버 순서/penalty 편집 규칙
- 큐 수정/비활성화 시 참조 관계 보호
- `queues.conf` render/reload 검증

완료 기준:

- 호 분배룰이 단순 CRUD가 아니라 운영 정책으로 닫힌다.
- DID, 큐, 멤버 설정이 서로 충돌하지 않는다.
- WebRTC 착수 전에 "어떤 상담원에게 어떤 endpoint를 울릴지"를 얹을 수 있을 정도로 라우팅 모델이 안정화된다.

### 0-3. 전환 상태머신 고도화

대상:

- attended transfer 중간 상태
- 실패/만료 판정
- 이벤트-요청 상관관계 보강

완료 기준:

- `REQUESTED -> CONSULT_RINGING -> CONSULT_TALKING -> REBRIDGING -> COMPLETED/FAILED/EXPIRED`
  경로가 데이터상 추적 가능하다.

### 0-4. 권한 모델과 운영 제어 정교화

대상:

- action-level 권한
- supervisor/admin operate 경계
- UI와 API 정책 일치

완료 기준:

- 운영자 제어 기능이 예측 가능한 정책으로 닫힌다.

### 0-5. 운영 자동화와 Asterisk 설정 신뢰도 향상

대상:

- config render/reload 검증
- 배포 후 스모크 체크
- SIP 등록/큐 라우팅/발신 점검

완료 기준:

- 운영 점검이 수기 명령 나열이 아니라 반복 가능한 절차가 된다.

## WebRTC 착수 게이트

아래 조건을 만족하면 WebRTC PoC를 시작한다.

- 상담원 앱 real mode 기본 흐름이 안정적으로 닫혀 있음
- 호 분배룰 정책과 DID/queue 라우팅 규칙이 정리되어 있음
- transfer/권한/운영 스모크의 주요 리스크가 1차 해소됨
- Asterisk config render 구조를 안전하게 확장할 수 있음
- 테스트나 수동 검증 절차가 최소한 확보됨

## Phase 1. WebRTC PoC 설계/구현

### 1-1. 프론트 softphone 계층 추가

추가 후보:

- `apps/web/src/softphone/client.ts`
- `apps/web/src/softphone/types.ts`
- `apps/web/src/softphone/media.ts`
- `apps/web/src/store/useSoftphoneStore.ts`

작업:

- SIP.js 도입
- register/unregister
- incoming session 처리
- accept/hangup
- local mute
- 장치 목록 로드
- 마이크 권한 오류 상태 표시

완료 기준:

- 브라우저 softphone 등록 상태를 UI에서 확인할 수 있다.

### 1-2. 서버 세션 응답에 softphoneConfig 제공

대상:

- `GET /me/session`
- `apps/web/src/api/realApi.ts`

작업:

- `softphoneConfig.enabled`
- `softphoneConfig.sipUri`
- `softphoneConfig.wsServer`
- `softphoneConfig.authorizationUsername`
- `softphoneConfig.displayName`
- `softphoneConfig.iceServers`

완료 기준:

- 프론트가 별도 하드코딩 없이 softphone 설정을 받아 초기화할 수 있다.

### 1-3. Asterisk WebRTC endpoint 렌더링

대상:

- `pjsip.renderer.ts`
- `AsteriskReloadService`
- `infra/asterisk/pjsip.conf`

작업:

- `transport-wss`
- TLS
- DTLS-SRTP
- ICE
- RTCP mux
- opus/alaw/ulaw codec 정책
- WebRTC endpoint 템플릿 추가

완료 기준:

- 특정 상담원에 대해 WebRTC endpoint conf를 생성할 수 있다.

### 1-4. 상담원 dial target 선택 로직 추가

대상:

- 발신
- 내선 발신
- 큐 멤버
- 필요 시 pickup 대상

작업:

- `agentExtension` 대신 `agentDialTarget` 개념 도입
- PoC에서는 `PJSIP/1001-web` 또는 `PJSIP/1001` 중 하나만 선택

완료 기준:

- PoC 대상 상담원은 WebRTC endpoint로 정상 착신된다.

### 1-5. 최소 UI 보강

대상:

- 상단 바 또는 상태 패널
- 현재 통화 패널

표시 항목:

- `미등록`
- `등록 중`
- `등록됨`
- `통화 중`
- `오디오 장치 오류`
- `마이크 권한 거부`

완료 기준:

- 상담원이 softphone 상태를 스스로 확인할 수 있다.

## Phase 2. PoC 검증

검증 시나리오:

1. 로그인
2. softphone 등록 성공
3. 수신 착신
4. 응답
5. 통화 종료
6. 재등록
7. 외부 발신

추가 확인:

- 고객 팝업이 기존 CTI 이벤트와 어긋나지 않는지
- call session / call legs 추적이 유지되는지
- desk phone 경로를 깨지 않는지

## Phase 3. 운영형 확장 판단

PoC가 통과되면 아래를 운영형 확장 후보로 본다.

- hold/resume 정교화
- transfer WebRTC 호환성
- queue pickup 연동
- 다중 단말 정책
- TURN 기반 외부망 안정화
- softphone 상태 모니터링
- supervisor 관제 기능

이 단계는 PoC 통과 후 별도 문서로 분리한다.

## 우선순위 결론

현재 우선순위는 아래와 같다.

1. 기존 시스템 완성도 향상
2. WebRTC 착수 게이트 충족
3. 제한된 범위의 WebRTC PoC
4. PoC 통과 후 운영형 확장

즉, 다음 작업 세션에서 WebRTC를 바로 구현하기보다는 먼저 아래를 다시 확인하고 시작한다.

- 상담원 앱 실사용 마감 상태
- 호 분배룰 정책 정리 상태
- 전환 상태머신 진척
- 운영 스모크/배포 신뢰도
- Asterisk config 확장 안정성

## 다음 세션 시작점

다음에 WebRTC 작업을 실제 시작할 때는 아래 순서로 들어간다.

1. `apps/web` softphone store/타입/클라이언트 골격 추가
2. `me/session` softphoneConfig 응답 추가
3. `pjsip.renderer.ts`에 WebRTC transport/endpoint 렌더링 추가
4. PoC 대상 상담원 1명 기준 endpoint 생성
5. 등록/수신/응답/종료 시나리오 검증

## 메모

현재 시점에서 WebRTC는 "좋은 다음 단계"이지 "지금 가장 먼저 붙일 기능"은 아니다.

이 판단은 보수적 선택이 아니라, 현재 저장소가 이미 CTI/PBX 운영형 구조로 커진 상태에서 **기능 확장보다 정합성과 운영 완성도를 먼저 닫는 편이 전체 일정 리스크를 더 낮추기 때문**이다.
