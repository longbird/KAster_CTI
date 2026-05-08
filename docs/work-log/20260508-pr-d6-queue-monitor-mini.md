# PR-D6 — 대기열 모니터링 미니 패널 (P1-7)

> 격차 문서 § 3 P1-7 항목. compact/full 영역 상단에 "대기 N / 최대대기 mm:ss" 띠를 노출하고, 큐 신규 도착 시 attention flash.

## 변경 범위

### 데스크톱 — 신규 채널/이벤트 없음 (재사용)
서버 측 `queue.summary.updated` WS 이벤트는 이미 `EVENT_NAMES` 에 포함되어 흐른다 (PR-D5 에서 추가된 announcement 와 같은 경로). 추가 IPC/네트워크 변경 없음.

### 데스크톱 store
- `src/renderer/src/store/useDesktopStore.ts`
  - 상태에 `queueSummary: QueueSummary[]`, `queueArrivalFlashAt: string | null` 추가.
  - `reduceEvent` 시그니처에 `currentQueueSummary`, `currentQueueArrivalFlashAt` 추가. 모든 case 가 패스스루.
  - `queue.summary.updated` case 에서:
    - 새 payload 의 `waitingCount` 합산이 이전 합산보다 크면 `queueArrivalFlashAt = new Date().toISOString()` 으로 갱신 (도착 신호).
    - 동일/감소 시에는 기존 값 유지 (passthrough).
  - 초기값: `queueSummary: []`, `queueArrivalFlashAt: null`.

### 데스크톱 UI
- `src/renderer/src/components/QueueMonitorPanel.tsx` (신규)
  - props: `queueSummary`, `flashAt`. 모든 큐의 `waitingCount` 합과 `longestWaitSeconds` 의 최댓값을 표시.
  - `flashAt` 변경 시 내부 state 로 `flashing=true` 잠시 활성화 → CSS 애니메이션으로 attention flash. 2.4 초 후 자동 해제.
  - `queueSummary.length === 0` 이면 렌더 자체 생략 (운영 환경에서 큐 미수신 시 노이즈 방지).
- `src/renderer/src/App.tsx`
  - `QueueMonitorPanel` 임포트. `queueSummary`, `queueArrivalFlashAt` 스토어에서 destructure. `AnnouncementBannerStack` 위에 마운트 (compact/full 모두 적용).
- `src/renderer/src/styles.css`
  - `.queue-monitor`, `.queue-monitor--has-waiting`, `.queue-monitor--flash`, `@keyframes queue-monitor-flash`, `.queue-monitor__metric/__label/__value` 추가. 평소엔 muted, 대기 ≥ 1 이면 amber 톤, flash 중엔 빨간색 펄스.

## 테스트

- `src/renderer/src/store/useDesktopStore.test.ts`
  - 신규 케이스: "queue.summary.updated 는 큐 요약을 저장하고 대기 증가 시 flashAt 을 갱신한다".
    - 0 → 1 도착: `queueArrivalFlashAt` 신규 발급.
    - 1 → 0 감소: passthrough (기존 값 유지).
    - 0 → 2 도착: `queueArrivalFlashAt` 재갱신.
  - `Date.prototype.toISOString` 카운터 mock 으로 timestamp 단조 증가 보장 (ms-collision 회피).
- 결과: **35 files / 157 tests pass**.

## 검증 명령

```
cd apps/desktop && npm test    # 157/157
cd apps/desktop && npm run build  # exit 0
```

## 영향 범위 / 회귀 메모

- `reduceEvent` 시그니처 확장. 모든 case 가 새 두 필드를 패스스루로 갱신. `bindRuntimeEvents` 의 호출부도 동일하게 두 필드 전달하도록 갱신.
- 신규 컴포넌트는 App 의 `desktop-main` 레이아웃 최상단 (Announcement 위) 에 마운트. 큐 미수신 환경에선 자동 비표시 (DOM 없음).
- 멀티노드 / RealtimeGateway 측 변경 없음. 서버는 이미 `queue.summary.updated` 를 tenant 룸에 발행 중.
- 운영 도착 알림은 시각만 — 윈도우 포커스 가로채기/소리 없음. 통화 중 운영자에게 방해되지 않음.
