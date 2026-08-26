; PBX 상담원 데스크톱 설치 프로그램.
;
; 빌드는 tools/build-release.ps1 이 한다. 여기를 직접 ISCC 로 부르지 않는다 —
; PublishDir 과 AppVersion 을 밖에서 넣어 줘야 하고, 그 두 값이 빠지면
; 엉뚱한 폴더를 0.0.0 으로 포장한 설치 파일이 조용히 나온다.

#ifndef AppVersion
  #error AppVersion 을 /DAppVersion=x.y.z 로 넘겨야 합니다.
#endif

#ifndef PublishDir
  #error PublishDir 을 /DPublishDir=<게시 폴더> 로 넘겨야 합니다.
#endif

#ifndef OutputDir
  #error OutputDir 을 /DOutputDir=<설치 파일을 놓을 폴더> 로 넘겨야 합니다.
#endif

#define AppName "PBX 상담원"
#define AppExeName "KAster.Desktop.App.exe"

[Setup]
; 이 값이 곧 "같은 프로그램인가" 의 판정 기준이다. 절대 바꾸지 않는다 —
; 바꾸면 업데이트가 덮어쓰기가 아니라 두 벌 설치가 된다.
AppId={{B7F3A6C2-1D48-4E9A-9C31-5A0E2F7D4B86}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
AppPublisher=KAster
VersionInfoVersion={#AppVersion}

; 관리자 권한을 요구하지 않는다.
;
; 앱은 이미 HKCU 와 %LOCALAPPDATA% 에만 쓰도록 만들어져 있다
; (ProtocolRegistration · AutoStartRegistration · AppPaths). 상담원 PC 에는
; 관리자 권한이 없고, Program Files 에 넣으면 상담원이 스스로 업데이트를
; 실행할 수 없다. 자동 업데이트는 파일만 받아 두고 "통화가 없을 때 실행하세요"
; 라고 말하는 구조라, 실행에 관리자 권한이 필요하면 그것이 곧 업데이트 실패다.
PrivilegesRequired=lowest
DefaultDirName={autopf}\KAsterAgent

; 이미 깔린 자리가 있으면 경로를 다시 묻지 않는다. 물으면 상담원이 다른 폴더를
; 골라 두 벌이 되고, 옛 실행 파일이 시작 프로그램에 남는다.
DisableDirPage=auto
DisableProgramGroupPage=yes

ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

; 업데이트는 돌고 있는 앱 위에 덮어쓴다. 닫지 않으면 파일이 잠겨 설치가 반쯤 되다 만다.
; 프로필마다 뮤텍스 이름이 달라 AppMutex 하나로는 다 못 잡는다 (SingleInstanceNames).
; CloseApplications 는 설치 폴더의 파일을 쥐고 있는 프로세스를 전부 찾으므로 프로필과 무관하다.
CloseApplications=yes
RestartApplications=no
AppMutex=Local\KAsterCtiDesktop-default

OutputDir={#OutputDir}
OutputBaseFilename=KAsterAgent-{#AppVersion}-Setup
SetupIconFile=..\src\KAster.Desktop.App\Assets\kaster-agent.ico
UninstallDisplayIcon={app}\{#AppExeName}
UninstallDisplayName={#AppName}

Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern

[Languages]
Name: "korean"; MessagesFile: "compiler:Languages\Korean.isl"

[Tasks]
Name: "desktopicon"; Description: "바탕 화면에 아이콘 만들기"; GroupDescription: "추가 아이콘:"

[Files]
Source: "{#PublishDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\{#AppName}"; Filename: "{app}\{#AppExeName}"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExeName}"; Tasks: desktopicon

[Registry]
; 앱이 뜰 때 스스로 거는 값들이다. 여기서 다시 걸지는 않고 지우기만 맡는다 —
; 지우지 않으면 앱을 지운 뒤에도 웹에서 누른 링크가 없는 실행 파일을 부른다.
Root: HKCU; Subkey: "Software\Classes\kastercti"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\kaster-agent"; Flags: uninsdeletekey
; deletevalue 를 붙이면 안 된다 — 그 플래그는 지울 때가 아니라 설치할 때 값을 지운다.
; 업데이트마다 상담원의 자동 시작이 조용히 꺼진다.
; 프로필을 쓰는 자리는 이름이 "KAsterCtiAgent.<프로필>" 이라 여기서 못 잡는다 (AutoStartEntry).
; 그 자리는 제거 뒤 항목이 남지만, 없는 실행 파일을 가리키는 것뿐이라 윈도우가 무시한다.
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueName: "KAsterCtiAgent"; ValueType: none; Flags: uninsdeletevalue

[Run]
Filename: "{app}\{#AppExeName}"; Description: "{#AppName} 실행"; Flags: nowait postinstall skipifsilent

; 설정·토큰(%LOCALAPPDATA%\KAsterCti)은 지우지 않는다. 업데이트가 제거 후 설치로
; 이뤄지는 경우가 있고, 그때 로그인 정보와 핫키가 함께 사라지면 안 된다.
