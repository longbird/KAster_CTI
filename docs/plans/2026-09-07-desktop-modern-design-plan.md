# Desktop Modern Design Implementation Plan

> 승인된 디자인을 이 세션에서 구현하고 검증한다. 범위: apps/desktop-win.

**Goal:** 승인된 PBX 상담원 시안을 실제 WPF 화면과 통일된 아이콘으로 적용한다.

**Architecture:** 기존 ViewModel/Command와 창 크기를 유지하고 XAML 리소스와 배치를 수정한다. 아이콘 원본을 앱과 트레이가 공유하도록 구성한다.

**Tech Stack:** .NET 8 WPF, XAML, 기존 xUnit, SVG/ICO.

## 1. 공통 디자인과 아이콘
- [ ] Themes/Palette.Light.xaml, Palette.Dark.xaml, Tokens.xaml: 인디고 팔레트, 16/10 반경, 둥근 입력, 역할별 hover/focus, 공통 아이콘 리소스.
- [ ] 앱/작업표시줄/트레이에 동일한 브랜드 원본 적용. 트레이 상태 배지와 캐시/Dispose 보존.

## 2. 화면
- [ ] Views/LoginView.xaml: 브랜드 헤더/인사말과 입력 폼. 기존 PasswordChanged/명령/옵션 보존.
- [ ] Views/IdleView.xaml: 대기 헤드셋/상태 카드/바닥 도구. 당겨받기 목록, 전화기 안내, 발신 상태와 업데이트 보존.
- [ ] Views/TalkingView.xaml, RingingView.xaml: 번호/시간/메모/제어 아이콘. 동적 버튼과 통화 종료 계약 유지.

## 3. 검증 및 전달
- [ ] dotnet build apps/desktop-win/KAster.Desktop.sln -c Release
- [ ] dotnet test apps/desktop-win/KAster.Desktop.sln -c Release --no-build
- [ ] 실제 WPF 화면을 서버 접속 없이 렌더: 로그인/대기/등록 안내/발신/통화/수신, 두 테마 및 최소 크기.
- [ ] 변경 범위와 바인딩 검토, 검증 문서/인덱스 갱신, 완료 변경 커밋.
