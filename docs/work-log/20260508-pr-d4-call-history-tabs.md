# PR-D4 — 통화내역 탭 분리 + 미연결 강조 (2026-05-08)

> 데스크톱 상담원 앱 — BlueSky 격차 § P0-5
> 참고: `docs/work-log/20260508-desktop-vs-bluesky-gap.md`

## 변경 요약

`CallHistoryPopup` 에 3 종 탭 (연결 / 미연결 / 내선) 도입. 미연결 행은
빨간 배경 + 라벨 강조. 내선 (`direction === 'internal'`) 분리. 콜백 다이얼
버튼은 기존 그대로 (수신 ani 셀에서 발동).

## 변경 사항

### 백엔드 (`apps/server`)

- `apps/server/src/modules/calls/dto/list-calls-query.dto.ts` — `direction` 쿼리 추가 (inbound/outbound/internal).
- `apps/server/src/modules/calls/calls.service.ts` — `listHistory` where 절에 direction 필터 적용.
- `apps/server/src/modules/calls/calls.controller.ts` — Swagger `@ApiQuery({ name: 'direction', ... })`.

> 본 PR 의 데스크톱 UI 는 백엔드 direction 필터 없이도 동작 (클라이언트 분류).
> 백엔드 필터는 향후 admin 리포트나 외부 통합 호출용으로 사용 가능.

### 데스크톱

- `apps/desktop/src/renderer/src/components/CallHistoryPopup.tsx`
  - `CallHistoryTab` = `'connected' | 'missed' | 'internal'`
  - `isMissed` (`!answeredAt && sessionStatus === 'ENDED'`) / `isInternal` (`direction === 'internal'`) helper
  - 탭 strip + 탭별 카운트 배지
  - 키워드 검색은 활성 탭 안에서 동작
  - 미연결 행은 `popup-row--missed` 클래스로 시각 강조 (빨간 배경 + danger 컬러 라벨)
- `apps/desktop/src/renderer/src/styles.css` — popup-tab-strip / popup-tab / popup-tab__count /
  popup-row--missed 스타일.

### 테스트 갱신

- `CallHistoryPopup.test.tsx` — 응답 없는 OUTBOUND 통화는 미연결 탭에서 표시되도록 시나리오 갱신
  (탭 전환 후 통화시간 확인).

## 검증 결과

| 게이트 | 결과 |
|---|---|
| `apps/server` `npx jest --runInBand` | ✅ 32 suites / 203 tests |
| `apps/desktop` `npm test` (vitest) | ✅ 35 files / 155 tests |

## 알려진 한계

- 클라이언트가 한 번에 fetch 하는 행 수는 서버 default (500건). 미연결만 따로 더 멀리 보고 싶으면
  탭별 lazy fetch (백엔드 `direction=inbound&mode=missed` 활용) 가 후속 작업.
- "내선" 탭은 `direction === 'internal'` 일 때만 매치. AMI normalizer 가 internal 통화에
  direction 을 채우지 못하는 환경에선 빈 탭이 됨 — 운영 데이터 확인 필요.
