# PBX 상담원 현대화 검증

- 날짜: 2026-09-07
- 범위: Windows 클라이언트 WPF 디자인, 공통 스타일, 앱/트레이 아이콘.
- 설계: [승인된 현대화 디자인](../design/2026-09-07-desktop-modern-design.md)

## 실행 결과

| 검증 | 결과 |
|---|---|
| Release 솔루션 빌드 | 성공, 경고 0 / 오류 0 |
| 기존 테스트, 트레이 및 발신 키패드 회귀 테스트 | 724 통과, 실패 0, 건너뜀 0 |
| WPF 오프라인 렌더 | 8개 상태 × 2개 테마 × 2개 크기 + 발신 키패드 2개 테마 = 34개 PNG 생성 |
| 육안 확인 | 로그인 최소 크기, 대기, 등록 안내, 당겨받기, 통화, 키패드, 수신 최소 크기 확인 |
| 디자인/코드 검토 | 기존 명령/바인딩/조건부 기능 유지, 추가 수정 필요 사항 없음 |
| win-x64 런타임 포함 빌드 | 성공; bin/modern-design에 실행 파일과 종속 파일 생성 |

최초 렌더에서 입력란의 글자 아래쪽이 잘리는 문제를 발견했다. 공통 입력 템플릿의 중복 패딩을 제거하고 다시 렌더해 아이디와 내선 값이 온전히 보이는 것을 확인했다.
트레이는 WPF Application 없이도 포함된 리소스를 읽는다. 추가한 3개 테스트는 캐시 재사용, 테마 변경 후 무효화, 상태/주의 프레임의 배지 변경과 브랜드 유지 여부를 검증한다.

발신 키패드용 테스트 3개를 추가했다. 숫자를 눌러도 서버 요청과 DTMF 전송이 발생하지 않고 실제 발신 번호 바인딩만 갱신되는지, 선택 교체/커서 위치 삭제/전체 삭제/빈 값 삭제, 읽기 전용 또는 비활성 입력란 보호를 확인한다. 렌더 도구는 IdleView의 키패드가 실제 번호 필드에 연결되는지도 검증한다. 팝업 패널 자체와 최소 크기의 입력란/키패드 열기 버튼은 실제 WPF 렌더로 확인했다.

## 재현

저장소 루트에서 실행한다.

~~~powershell
dotnet build apps/desktop-win/KAster.Desktop.sln -c Release
dotnet test apps/desktop-win/KAster.Desktop.sln -c Release --no-build
pwsh -NoProfile -STA -File apps/desktop-win/tools/render-design-preview.ps1 -OutputDirectory "$env:TEMP/pbx-design-preview"
dotnet publish apps/desktop-win/src/KAster.Desktop.App/KAster.Desktop.App.csproj -c Release -r win-x64 --self-contained true -o apps/desktop-win/src/KAster.Desktop.App/bin/modern-design
~~~

아이콘은 아래 명령으로 동일한 WPF Geometry에서 다시 만든다.

~~~powershell
powershell -NoProfile -STA -File apps/desktop-win/tools/make-app-icon.ps1
~~~

## 실제 WPF 렌더 증적

데이터는 오프라인 예시다. 아래 이미지는 HTML 시안이 아닌 빌드한 WPF View를 직접 렌더한 결과다. 네이티브 창 테두리를 제외한 콘텐츠 영역으로, 최소 창은 대기/로그인 420×520, 통화 420×540, 수신 400×380에 대응한다.

- [대기](2026-09-07-desktop-modern-design/idle-light-normal.png)
- [발신 키패드 라이트](2026-09-07-desktop-modern-design/dial-pad-light.png)
- [발신 키패드 다크](2026-09-07-desktop-modern-design/dial-pad-dark.png)
- [통화](2026-09-07-desktop-modern-design/talking-light-normal.png)
- [로그인 최소 크기](2026-09-07-desktop-modern-design/login-light-minimum.png)
- [전화기 등록 안내 최소 크기](2026-09-07-desktop-modern-design/setup-light-minimum.png)
- [다크 당겨받기/발신번호/업데이트](2026-09-07-desktop-modern-design/waiting-dark-minimum.png)
- [다크 통화 최소 크기](2026-09-07-desktop-modern-design/talking-dark-minimum.png)
- [다크 키패드 및 고객 정보 버튼](2026-09-07-desktop-modern-design/keypad-dark-minimum.png)
- [수신 최소 크기](2026-09-07-desktop-modern-design/ringing-light-minimum.png)

## 검증 범위의 한계

실제 PBX 로그인/발신/수신, 장시간 운영, OS 트레이 위치와 고DPI 다중 모니터의 실제 상호작용은 이번 오프라인 검증에 포함하지 않았다. 서버 배포/자동 업데이트 등록/설치본 덮어쓰기는 수행하지 않았다. 로컬 실행본은 런타임을 포함하므로 폴더 전체를 유지한 상태로 KAster.Desktop.App.exe를 실행한다.
