# 데스크톱 실환경 테스트 증적 템플릿

작성일:
테스트 담당:
사이트/센터:

## 1. 환경

| 항목 | 값 |
| --- | --- |
| 상담원 PC OS |  |
| 공인 IP / 내부 IP |  |
| 마이크 장치 |  |
| 통화 스피커 장치 |  |
| 벨소리 장치 |  |
| PBX 서버 주소/포트 |  |
| CTI 서버 URL |  |
| 상담원 계정/내선 |  |
| 테스트 DID |  |
| 데스크톱 앱 버전 |  |
| 서버 버전/커밋 |  |

## 2. SIP/통화

| 시나리오 | 결과 | 증적 |
| --- | --- | --- |
| SIP 등록 성공 | PASS/FAIL |  |
| 인입 ringing 표시 | PASS/FAIL |  |
| 인입 수락 후 음성 송수신 | PASS/FAIL |  |
| 인입 거절 | PASS/FAIL |  |
| 발신 | PASS/FAIL |  |
| 종료 후 `call.ended` 반영 | PASS/FAIL |  |
| 서버 재시작 후 복구 | PASS/FAIL |  |
| 네트워크 단절 후 복구 | PASS/FAIL |  |

## 3. 오디오 장치

| 시나리오 | 결과 | 증적 |
| --- | --- | --- |
| 마이크 선택 저장 | PASS/FAIL |  |
| 통화 스피커 선택 저장 | PASS/FAIL |  |
| 벨소리 장치 선택 저장 | PASS/FAIL |  |
| 통화음과 벨소리 출력 분리 | PASS/FAIL |  |
| 앱 재시작 후 설정 유지 | PASS/FAIL |  |

## 4. 업데이트

| 시나리오 | 결과 | 증적 |
| --- | --- | --- |
| manifest 조회 | PASS/FAIL |  |
| tokenized download | PASS/FAIL |  |
| SHA-256 검증 | PASS/FAIL |  |
| 통화 중 설치 차단 | PASS/FAIL |  |
| 유휴 상태 설치 가능 | PASS/FAIL |  |
| 설치 결과 서버 기록 | PASS/FAIL |  |

## 5. 최종 판정

- [ ] 모든 P0 필수 시나리오 PASS
- [ ] FAIL 항목이 있으면 운영 반영 전 수정 계획 작성
- [ ] 로그/스크린샷/서버 이벤트 증적 첨부
