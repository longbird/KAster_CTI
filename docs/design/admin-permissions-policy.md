# 관리자 권한 Enforcement 기준

작성일: 2026-05-01

## 목적

관리자 앱의 메뉴 노출 기준과 CTI 서버 API 강제 기준을 같은 권한 단위로 맞춘다. UI에서 버튼이 보이지 않더라도 API를 직접 호출하면 성공하는 경로를 운영 전 차단한다.

## 액션 기준

| 액션 | 의미 | UI 기준 | 서버 기준 |
| --- | --- | --- | --- |
| view | 화면 또는 목록 조회 | 메뉴/탭 노출 | `assertMenuAction(..., 'view')` |
| create | 새 운영 데이터 생성 | 등록 버튼 노출 | `assertMenuAction(..., 'create')` |
| update | 기존 운영 데이터 수정 | 수정 버튼 노출 | `assertMenuAction(..., 'update')` |
| delete | 비활성화 또는 삭제 | 삭제 버튼 노출 | `assertMenuAction(..., 'delete')` |
| operate | reload, 상태 변경, 구성원 배정, 통화 제어 같은 운영 명령 | 실행 버튼 노출 | `assertMenuAction(..., 'operate')` |
| export | CSV, 녹취 다운로드, 리포트 반출 | 내보내기 버튼 노출 | `assertMenuAction(..., 'export')` |

## 메뉴와 API 매핑

| 메뉴 키 | 대표 API | 필요한 액션 |
| --- | --- | --- |
| dashboard | `GET /admin/dashboard` | view |
| live-calls | `GET /calls/active`, `POST /calls/:id/*` | view, operate |
| queues | `GET /queues/summary` | view, export |
| agents | `GET /agents`, `POST /agents/:id/status` | view, operate, export |
| reports/calls | `GET /calls/history` | view, export |
| reports/recordings | `GET /calls/recordings/*` | view, export |
| settings/agents | `POST/PATCH/DELETE /agents/*` | view, create, update, delete, operate |
| settings/queues | `POST/PATCH/DELETE /queues/*`, `PUT /queues/:id/members` | view, create, update, delete, operate |
| settings/forwarding | `GET/POST/PUT/DELETE /asterisk-config/forwarding-rules` | view, create, update, delete |
| settings/prompts | `GET/POST/PUT/DELETE /asterisk-config/prompts`, `POST /asterisk-config/prompts/upload` | view, create, update, delete |
| settings/permissions | `GET/POST /admin/settings/permissions/*` | view, operate |
| blocklist | `GET/POST/PUT/DELETE /asterisk-config/blocklist` | view, create, update, delete |
| asterisk | trunk, DID, IVR, SIP, preview, dry-run, reload | view, create, update, delete, operate |
| monitoring | 운영 metric 화면 | view, operate |

## 예외 기준

- `GET /admin/settings/permissions/current`는 메뉴 bootstrap API다. 이 API에 `settings/permissions:view`를 요구하면 권한 목록을 로드할 수 없으므로 JWT와 supervisor/admin 역할만 요구한다.
- 상담원 본인의 상태 변경, 본인 내선 기반 내선 발신, 본인 pickup은 상담원 업무 흐름이므로 기본 인증으로 허용한다. supervisor/admin이 같은 API로 운영 제어를 수행할 때는 `live-calls:operate` 또는 `agents:operate`를 요구한다.
- Prometheus raw metric 성격의 endpoint는 운영 화면 권한과 별도로 배포/네트워크 레벨 보호를 병행한다.

## 구현 기준

- 클라이언트는 서버가 반환한 `permissions/current` 결과만으로 메뉴를 구성한다. admin/supervisor라는 이유로 전체 메뉴를 다시 합치지 않는다.
- 서버는 메뉴 키가 화면과 다를 때 `assertAnyMenuAction`으로 운영 화면 키와 설정 화면 키를 함께 허용한다.
- export는 view와 분리한다. 조회 가능하지만 반출은 금지되는 역할을 만들 수 있어야 한다.
