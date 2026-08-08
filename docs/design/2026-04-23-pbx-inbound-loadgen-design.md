# PBX Inbound Load Generator Design

Date: 2026-04-23

## Summary

PBX 및 CTI 테스트를 위해 외부 PC 또는 Mac에서 실행하는 독립형 인입 부하 테스트 프로그램을 설계한다. 이 도구는 SIP trunk 형태로 PBX의 trunk endpoint에 직접 인입 호출을 생성하고, 응답 후 RTP 미디어를 송출해 실제 연결 여부를 녹취와 세션 이벤트로 확인할 수 있어야 한다.

1차 목표는 다음 세 가지를 하나의 도구로 검증하는 것이다.

- 최대 동시호 검증
- 초당/분당 인입 시도량 검증
- IVR, Queue, 상담원 연결, 종료까지의 전체 콜플로우 검증

## Goals

- 외부 발신기 PC 또는 Mac에서 쉽게 실행 가능한 독립 도구를 제공한다.
- SIP trunk 직접 인입 시나리오를 YAML 파일로 정의하고 반복 실행할 수 있어야 한다.
- 연결 후 무음이 아닌 짧은 비프음을 RTP로 송출해 통화 성립 여부를 청각적으로 확인할 수 있어야 한다.
- 실시간 콘솔 요약과 CSV/JSON 결과 파일을 모두 제공해야 한다.
- 실패 원인을 SIP 응답, 타임아웃, 미디어 실패 등으로 분류해 CTI/PBX 문제를 분석할 수 있어야 한다.
- 1차 버전은 300 동시호 / 30 CPS 수준을 현실적인 상한으로 설계한다.

## Non-Goals

1차 버전에서 다음 항목은 의도적으로 제외한다.

- REGISTER 기반 trunk 연동
- TLS 전송
- 다중 trunk target failover
- 분산 부하발생기 클러스터
- 브라우저 UI 또는 별도 데스크톱 GUI
- 자동 그래프 대시보드
- 운영 통신사별 헤더 정책 자동 프로파일링

## Recommended Approach

권장 구현 방식은 `pjproject`의 `pjsua2`를 사용하는 네이티브 CLI 애플리케이션이다.

선정 이유:

- SIP 세션과 RTP 미디어를 한 엔진 안에서 직접 제어할 수 있다.
- 장기적으로 PBX/CTI 전용 시나리오를 확장하기 쉽다.
- Windows와 macOS용 단일 실행파일 배포 전략과 궁합이 좋다.
- 장기 재사용 도구로 발전시키기에 런타임 의존성이 가장 적다.

Python 또는 Node 기반 래퍼는 개발 속도는 빠를 수 있으나, 설치 단순성과 네이티브 SIP/RTP 안정성 요구를 동시에 만족시키기 어렵다. 따라서 코어와 배포를 모두 네이티브 CLI로 통합하는 방향을 기준선으로 삼는다.

## Proposed Repository Layout

도구는 서버 기능이 아니라 저장소 내 독립 도구로 관리한다.

```text
tools/pbx-loadgen/
  native/                 pjsua2 기반 애플리케이션 소스
  scenarios/              예제 시나리오 YAML
  fixtures/               비프음 WAV 등 미디어 샘플
  docs/                   실행 및 운영 가이드
  scripts/                빌드/패키징 스크립트
```

## Architecture

도구는 아래 5개 구성요소로 나눈다.

### 1. Scenario Loader

- YAML 시나리오 파일을 읽는다.
- 필수 필드, 범위, 상호 제약을 검증한다.
- 실행에 필요한 정규화된 설정 객체를 만든다.

### 2. Call Orchestrator

- CPS와 최대 동시호를 기준으로 새 호출 생성을 스케줄링한다.
- ramp-up, jitter, 총 호출 수 제한을 제어한다.
- 콜별 라이프사이클을 추적하고 종료된 슬롯을 다시 재사용한다.

### 3. SIP Session Engine

- INVITE, provisional response, 200 OK, ACK, BYE, CANCEL 흐름을 처리한다.
- 콜 상태를 표준 상태모델로 유지한다.
- 타임아웃과 오류 응답을 표준 실패 코드로 매핑한다.

### 4. Media Engine

- 200 OK 이후 RTP 세션을 활성화한다.
- 무음 대신 짧은 비프음을 반복 송출한다.
- RTP 송수신 패킷/바이트 및 미디어 활성 여부를 수집한다.

### 5. Reporter

- 콘솔에 실시간 요약을 출력한다.
- 실행 종료 후 CSV 및 JSON 결과 파일을 저장한다.
- 실패 코드별 집계와 실행 메타데이터를 기록한다.

## Execution Model

도구는 사용자가 다음과 같이 실행하는 형태를 목표로 한다.

```bash
pbx-loadgen run -f scenario.yaml
```

실행 시 동작 순서는 다음과 같다.

1. 시나리오 파일을 파싱하고 검증한다.
2. trunk target과 SIP transport 설정을 초기화한다.
3. 지정된 CPS에 따라 INVITE를 생성한다.
4. 응답된 콜은 ACK 후 RTP 비프음을 송출한다.
5. 시나리오에 정의된 유지시간이 지나면 정상 종료한다.
6. 실패 및 타임아웃 콜은 원인 코드를 기록한다.
7. 종료 시 콘솔 요약과 CSV/JSON 리포트를 남긴다.

## Scenario Format

시나리오 파일은 사람이 직접 편집하기 쉬운 YAML을 기본 형식으로 사용한다.

최상위 섹션은 다음 5개로 제한한다.

- `target`
- `load`
- `callFlow`
- `media`
- `reporting`

### target

- `host`: PBX 또는 SBC 주소
- `port`: SIP 포트
- `transport`: 1차는 `udp` 우선
- `requestUriTemplate`: INVITE 대상 URI 템플릿
- `fromDomain`: From 헤더 도메인
- `toDid`: 기본 DID 또는 DID 풀

### load

- `cps`: 초당 시도 호 수
- `maxConcurrent`: 최대 동시 유지 호 수
- `totalCalls`: 전체 시도 호 수
- `rampUpSeconds`: 목표 부하까지 도달하는 시간
- `callStartJitterMs`: 시작 시각 분산 폭

### callFlow

- `callerIdPool`: 발신번호 목록 또는 생성 규칙
- `didPool`: DID 목록
- `answerTimeoutMs`: 응답 대기 시간
- `holdSecondsMin`, `holdSecondsMax`: 통화 유지시간 범위
- `disconnectMode`: 정상 종료 또는 강제 종료 비율

### media

- `beepWavPath`: 비프음 WAV 경로
- `beepIntervalMs`: 반복 주기
- `txGain`: 송신 볼륨

### reporting

- `outputDir`: 결과 파일 저장 경로
- `consoleRefreshMs`: 콘솔 갱신 주기
- `saveFailureDetails`: 실패 상세 저장 여부

## Call State Model

각 호출은 실행 중 고유 `callRunId`를 갖는다. 상태는 다음 순서를 기준으로 한다.

```text
CREATED -> DIALING -> RINGING -> ANSWERED -> MEDIA_ACTIVE -> COMPLETED
```

예외 상태는 다음으로 표준화한다.

- `FAILED`
- `CANCELED`
- `TIMEOUT`

세부 실패 코드는 최소 아래 집합을 지원한다.

- `auth_failed`
- `timeout_no_response`
- `rejected_4xx`
- `server_5xx`
- `media_init_failed`
- `rtp_inactive`
- `transport_error`

이 분류를 통해 trunk 인증/라우팅 문제, PBX 과부하, CTI 추적 누락, RTP 비활성 문제를 서로 구분할 수 있게 한다.

## Reporting Model

리포트는 실행 단위 요약과 콜 단위 상세를 함께 남긴다.

### Console Summary

실시간 콘솔에는 다음 지표를 주기적으로 보여준다.

- 현재 진행 중 호출 수
- 누적 시도 수
- 연결 성공 수
- 실패 수
- 실측 CPS
- peak concurrent
- 최근 오류 코드 분포

### JSON Summary

JSON에는 실행 전체 메타데이터와 최종 집계를 남긴다.

- 실행 시작/종료 시각
- 사용한 시나리오 파일
- target 정보
- 설정된 CPS / 동시호 / 총 호출 수
- 성공률
- ASR
- 평균 응답 시간
- 평균 유지 시간
- 실패 코드별 건수
- RTP 통계 요약

### CSV Detail

CSV는 호출 단위 분석용으로 저장한다.

- `callRunId`
- 시작 시각
- `from`
- `toDid`
- SIP 최종 응답코드
- 연결 여부
- answer latency
- 유지 시간
- 종료 사유
- RTP 송수신 패킷/바이트
- 실패 코드

## CLI Commands

1차 명령은 최소 4개로 제한한다.

- `run`: 실제 부하 테스트 실행
- `validate`: 시나리오 문법과 값 검증
- `dry-run`: 네트워크 연결 없이 스케줄만 시뮬레이션
- `report`: 기존 JSON 결과 파일을 읽어 요약 출력

이 구성은 사용자가 실제 부하 실행 전 시나리오를 안전하게 검증하고, 저장된 결과를 재분석할 수 있게 한다.

## Phase 1 Scope

1차 버전은 운영에 투입 가능한 최소 완성형에 집중한다.

포함 범위:

- SIP trunk 직접 인입
- UDP 전송
- 단일 target
- 단일 시나리오 파일 실행
- 300 동시호 / 30 CPS 수준
- 응답 후 RTP 비프음 송출
- 실시간 콘솔 집계
- CSV/JSON 결과 저장

제외 범위:

- TLS
- REGISTER trunk
- 다중 target failover
- 분산 부하발생기
- GUI

## Verification Strategy

검증은 3단계로 나눈다.

### 1. Configuration Verification

- `validate`로 시나리오 유효성 검증
- `dry-run`으로 스케줄링 결과 확인

### 2. Functional Verification

- 단일 호출 실행
- 소규모 동시호 실행
- SIP 응답, RTP 비프음, 녹취 확인

### 3. Load Verification

- 콜플로우 검증
- CPS 점진 증가
- 동시호 점진 증가

이 순서를 지키면 dialplan 문제, RTP 문제, 고부하 문제를 분리해서 분석할 수 있다.

## Risks And Constraints

- 300 동시호 / 30 CPS는 발신기 PC 성능, 네트워크, PBX 수용력에 함께 의존한다.
- RTP 비프음 송출은 실제 통화 확인에는 유리하지만 CPU와 네트워크 사용량을 증가시킨다.
- 통신사 또는 SBC 정책에 따라 From, Contact, Request-URI 포맷 조정이 필요할 수 있다.
- 1차는 단일 target 기준이므로 이중화 trunk 구조 검증에는 직접 사용하기 어렵다.

## Implementation Direction

다음 계획 단계에서는 아래 순서로 구현을 분해한다.

1. `tools/pbx-loadgen/` 기본 구조 생성
2. 시나리오 스키마와 `validate/dry-run` 구현
3. pjsua2 기반 단일 콜 세션 구현
4. 비프음 RTP 송출 구현
5. 오케스트레이터와 동시호/CPS 제어 구현
6. CSV/JSON 리포터 구현
7. Windows/macOS 패키징 스크립트 추가

이 설계는 장기 재사용 가능한 PBX 인입 부하 테스트 도구를 목표로 하며, PBX와 CTI의 실제 운영 리스크를 재현 가능한 형태로 검증하는 것을 우선순위로 둔다.
