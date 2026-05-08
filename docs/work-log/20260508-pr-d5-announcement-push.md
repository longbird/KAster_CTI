# PR-D5 — 공지사항 푸시 표시 (P1-6)

> 격차 문서 § 3 P1-6 항목. admin 에서 등록한 공지를 데스크톱 상담원 앱에 실시간 토스트/배너로 표시.

## 변경 범위

### 서버
- `src/modules/realtime/realtime-events.ts` — `ANNOUNCEMENT_PUSHED='announcement.pushed'` 이벤트 키 추가.
- `src/modules/admin/admin.module.ts` — `EventsModule` 의존성 추가.
- `src/modules/admin/admin.service.ts` — `EventBusService` 주입. `createAnnouncement` / `updateAnnouncement` 성공 시 tenant 범위 publish.
  - `updateMany` 결과 `count > 0` 일 때만 발행 (없는 행 갱신은 noop).

### 데스크톱
- `src/shared/cti.ts` — `AnnouncementPushPayload` 타입 + `CtiEvent` discriminated union 에 `announcement.pushed` 추가.
- `src/main/cti-runtime.ts` — `EVENT_NAMES` 에 `announcement.pushed` 추가. WS 이벤트는 기존 `desktop:event` 채널로 그대로 흐름.
- `src/renderer/src/store/useDesktopStore.ts`
  - `AnnouncementBanner` 인터페이스 export.
  - 스토어에 `announcements: AnnouncementBanner[]` (max 5, 같은 id 는 dedupe-replace) + `dismissAnnouncement(id)` 액션.
  - `reduceEvent` 에 `announcement.pushed` case 추가. 시그니처 확장으로 모든 case 가 announcements 패스스루.
- `src/renderer/src/components/AnnouncementBannerStack.tsx` (신규) — 스택형 배너 UI (제목·작성자·시각·본문, 닫기 버튼). pinned 공지는 좌측 보더·배경 강조.
- `src/renderer/src/App.tsx` — `UpdateBanner` 위에 `AnnouncementBannerStack` 마운트.
- `src/renderer/src/styles.css` — `.announcement-stack`, `.announcement-banner`, `.announcement-banner--pinned` 등 스타일.

## 테스트

- 서버 (`apps/server`)
  - `test/admin.service.announcements.spec.ts` (신규) — create 시 publish 호출, update 시 count==0 이면 미발행 / count>0 이면 발행.
  - `test/admin.service.optout.spec.ts` — `AdminService` 생성자 시그니처 확장 반영 (eventBus mock 추가).
  - `test/admin-permissions.integration.spec.ts` — `EventBusService` provider 추가.
  - 결과: **33 suites / 205 tests pass**.

- 데스크톱 (`apps/desktop`)
  - `src/renderer/src/store/useDesktopStore.test.ts` — announcement.pushed 이벤트 누적·dedupe·dismiss 검증 케이스 추가.
  - 결과: **35 files / 156 tests pass**.

## 검증 명령

```
cd apps/server && npm run build       # exit 0
cd apps/server && npx jest --runInBand # 205/205
cd apps/desktop && npm test           # 156/156
```

## 영향 범위 / 회귀 메모

- `AdminService` 생성자에 `EventBusService` 추가. NestJS DI 컨텍스트에선 `AdminModule` 이 `EventsModule` 을 import 하므로 자동 주입. 단위 테스트에서 직접 `new AdminService(...)` 하던 두 곳(`admin.service.optout.spec.ts`, `admin-permissions.integration.spec.ts`)은 stub 추가.
- 데스크톱 `reduceEvent` 시그니처에 `currentAnnouncements` 매개변수 + `announcements` 반환 키 추가. 모든 case 가 패스스루 형태로 갱신.
- 멀티노드 배포에서도 동작. `EventBusService.publish` 가 Redis Pub/Sub 채널 (`kaster:cti:events`) 로 발행 → 각 노드 sub 가 `RealtimeGateway.broadcast(event, payload, tenantId)` 를 호출 → tenant 룸에 join 한 데스크톱 클라이언트에만 전달.
