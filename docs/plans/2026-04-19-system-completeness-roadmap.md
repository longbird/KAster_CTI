# KAster CTI 시스템 완성도 우선 로드맵

작성일: 2026-04-19

## 목적

현재 저장소는 WebRTC 같은 다음 확장 기능을 논의할 수 있을 정도로 커졌지만, 우선순위는 새 기능 추가보다 **운영형 시스템 완성도 확보**에 있다.

이 문서는 현재 시점의 최신 우선순위를 한 장으로 정리한다.

## 핵심 판단

- WebRTC는 유효한 다음 단계다.
- 하지만 지금은 호 분배룰, 전환, 권한, 운영 자동화처럼 기존 CTI/PBX 구조의 완성도를 먼저 높이는 편이 전체 리스크가 낮다.
- 특히 호 분배룰은 이미 CRUD가 구현되어 있지만, 운영 규칙과 보호 장치까지 닫힌 상태는 아니다.

## 현재 상태 요약

### 이미 구현된 기반

- 상담원 앱 real mode 로그인/이력/실시간/콜 제어 1차 구현
- 전환/종료/메모/상태변경 API
- 관리자 큐/상담원/Asterisk 설정 UI 1차 구현
- `queues.conf` 렌더링과 Asterisk reload 연동
- DID와 direct queue 연결 구조
- 기본 호 분배룰 자동 보장 로직

### 아직 덜 닫힌 영역

- attended transfer 상태머신 정교화
- 호 분배룰 운영 정책 정교화
- action-level 권한 모델
- 운영 스모크/배포 검증 자동화
- Asterisk 변경 반영 검증과 수동 체크리스트의 자동화 전환

## 우선순위

1. 전환 상태머신 완성
2. 호 분배룰 운영형 완성
3. 권한 모델 2차
4. 운영 자동화와 PBX 검증
5. 상담원 앱 실사용 마감
6. WebRTC PoC 준비도 점검
7. WebRTC PoC

## 1. 전환 상태머신 완성

목표:

- `REQUESTED -> CONSULT_RINGING -> CONSULT_TALKING -> REBRIDGING -> COMPLETED/FAILED/EXPIRED`
  경로를 데이터와 UI에서 일관되게 추적

완료 기준:

- API 요청과 후속 AMI 이벤트가 안정적으로 상관관계 매칭됨
- 취소/실패/만료가 운영 화면과 데이터에 분리되어 보임

## 2. 호 분배룰 운영형 완성

현재 구현 범위는 큐 CRUD와 멤버 관리, DID directQueue, `queues.conf` 리로드까지는 들어가 있다.

다음 단계는 "편집 가능" 상태를 넘어서 "운영 규칙이 닫힌 상태"로 가는 것이다.

### 닫아야 할 항목

- 기본 호 분배룰의 정의와 보호 규칙
- DID가 참조 중인 큐의 수정/비활성화 가드
- 멤버 순서와 penalty의 의미를 UI/서버에서 명확히 분리
- 전략값(`rrmemory`, `leastrecent`, `fewestcalls`, `random`, `linear`)의 운영 기본값과 사용 정책
- 저장 전/후 라우팅 영향 확인 절차
- `queues.conf` 반영 결과 검증

### 구현 포인트

- 관리자 UI에 default-rule guardrail 추가
- penalty/member-order 편집 UX 보강
- DID/분배룰 참조 관계 표시
- Asterisk 반영 상태 점검 또는 preview 강화
- 관련 테스트 추가

완료 기준:

- 운영자가 분배룰을 수정해도 예상치 못한 착신 공백이 생기지 않는다.
- DID, 큐, 멤버 관리가 서로 분리된 화면이 아니라 하나의 라우팅 정책으로 읽힌다.

## 3. 권한 모델 2차

목표:

- 메뉴 접근이 아니라 액션 단위로 정책을 닫는다.

중점:

- `view/create/update/delete/operate/export`
- supervisor/admin 분리
- 버튼 노출과 서버 권한 일치

## 4. 운영 자동화와 PBX 검증

목표:

- Asterisk 설정 변경이 수동 확인에 의존하지 않도록 전환

중점:

- health
- SIP registration
- inbound DID routing
- queue routing
- PBX reload
- click-to-call

## 5. 상담원 앱 실사용 마감

목표:

- 실시간 이벤트 누락/지연에도 UI가 크게 흔들리지 않도록 보강
- 기본 근무 흐름을 앱 기준으로 닫음

## 6. WebRTC PoC 준비도 점검

아래가 충족되면 WebRTC를 시작한다.

- 전환 상태머신의 주요 리스크 해소
- 호 분배룰 정책 정리
- 운영 스모크 절차 확보
- Asterisk config 확장 신뢰도 확보

## 7. WebRTC PoC

PoC는 별도 문서 기준으로 진행한다.

참조:

- [2026-04-19-webrtc-poc-readiness-plan.md](/D:/Work/AI_Projects/KAster_CTI/docs/plans/2026-04-19-webrtc-poc-readiness-plan.md)

## 결론

지금 시점의 최신 해석은 아래와 같다.

- WebRTC는 "바로 구현할 1순위 기능"이 아니다.
- 호 분배룰은 "이미 구현된 완료 영역"도 아니다.
- 현재 우선순위는 **기존 CTI/PBX 운영 규칙을 먼저 닫고, 그 다음 WebRTC를 붙이는 것**이다.
