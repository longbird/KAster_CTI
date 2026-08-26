# 상담원 데스크톱(C#) 배포 런북

- 날짜: 2026-08-26
- 대상: `apps/desktop-win` (C# / WPF / .NET 8)
- 배포 모델: 운영사 빌드 → 콜센터 서버 → 상담원 앱
  ([2026-04-22 배포 구조 설계](../design/2026-04-22-agent-desktop-update-distribution-design.md))

## 한 줄 요약

로컬에서 `build-release.ps1` 로 설치 파일을 만들고, `publish-desktop-release.sh` 로 콜센터
서버에 올린다. 두 스크립트가 지문(SHA256)을 서로 맞춰 확인하므로 손으로 옮겨 적는 값이 없다.

## 왜 "설치 파일" 이어야 하는가

상담원 앱의 자동 업데이트는 **파일을 받아 지문만 맞추고, 실행은 상담원이 직접** 한다
(`UpdateViewModel` → "설치 파일을 받았습니다. 통화가 없을 때 실행하세요").

그래서 서버에 올리는 산출물은 *실행하면 설치가 되는 파일*이어야 한다. 앱 실행 파일을 그대로
올리면 상담원이 그것을 눌러도 **앱이 한 벌 더 뜰 뿐 업데이트가 되지 않는다.**

## 설치 프로그램의 성질

| 항목 | 값 | 이유 |
|---|---|---|
| 권한 | 관리자 불필요 (`PrivilegesRequired=lowest`) | 앱이 HKCU·`%LOCALAPPDATA%` 에만 쓴다. 관리자가 필요하면 상담원이 스스로 업데이트를 실행할 수 없고, 그것이 곧 업데이트 실패다 |
| 설치 경로 | `%LOCALAPPDATA%\Programs\KAsterAgent` | 위와 같은 이유 |
| 런타임 | 포함 (self-contained win-x64) | 재택 상담원 PC 마다 .NET 8 Desktop Runtime 배포 절차를 만드는 비용이 파일 크기보다 크다 |
| 실행 중 업데이트 | `CloseApplications=yes` | 돌고 있는 앱 위에 덮어쓴다. 프로필마다 뮤텍스 이름이 달라 `AppMutex` 하나로는 다 못 잡으므로, 설치 폴더의 파일을 쥔 프로세스를 전부 찾는 쪽을 쓴다 |
| 설정·토큰 | 지우지 않는다 | `%LOCALAPPDATA%\KAsterCti`. 업데이트 때 로그인 정보와 핫키가 사라지면 안 된다 |
| `AppId` | `{B7F3A6C2-…}` **고정** | 이 값이 "같은 프로그램인가" 의 판정 기준이다. 바꾸면 덮어쓰기가 아니라 두 벌 설치가 된다 |

## 준비물 (빌드 머신, 최초 1회)

```powershell
winget install JRSoftware.InnoSetup     # 설치 파일 컴파일러
# .NET SDK 8 또는 9  (net8.0 을 대상으로 빌드한다)
# Windows SDK        (signtool.exe — 서명할 때만)
```

코드 서명은 [내부 코드서명 런북](../design/agent-desktop-internal-code-signing.md) 을 따른다.
환경변수 `KASTER_SIGN_CERT_SHA1` 또는 `KASTER_SIGN_CERT_SUBJECT` 가 있으면 빌드 스크립트가
게시 결과와 설치 파일을 **둘 다** 서명한다. 없으면 경고만 내고 서명 없이 만든다 —
내부 QA 용이며, 운영 배포에는 `-RequireSign` 을 붙여 서명을 강제한다.

## 1. 빌드

```powershell
cd apps\desktop-win
.\tools\build-release.ps1 -Version 1.0.0            # 내부 QA
.\tools\build-release.ps1 -Version 1.0.0 -RequireSign   # 운영
```

하는 일: 테스트 → 게시(self-contained) → **박힌 버전 되읽어 확인** → 서명 → 설치 파일 →
서명 → SHA256.

산출물은 `apps/desktop-win/release/` 에 둘이다.

```
KAsterAgent-1.0.0-Setup.exe   상담원이 실행하는 파일
release.json                  다음 단계가 읽는 값 (artifactId·sha256·크기)
```

버전을 되읽어 확인하는 이유: `-p:Version` 이 조용히 무시되면 `1.0.0.0` 짜리 배포본이 나가고,
그때부터 모든 자리가 "이미 최신" 으로 보여 업데이트가 **영영 뜨지 않는다.**

## 2. 서버에 올리기

```bash
./scripts/publish-desktop-release.sh --dry-run              # 무엇을 할지만 확인
./scripts/publish-desktop-release.sh --notes "첫 배포"
```

옵션: `--tenant <uuid>` (생략하면 가장 먼저 만들어진 tenant), `--mandatory`,
`--minimum <x.y.z>`, `--release <경로>`.

스크립트가 순서대로 확인하는 것:

1. **로컬 지문 재계산** — `release.json` 이 그 설치 파일의 것이 맞는지. 설치 파일만 다시
   만들고 `release.json` 이 옛것이면 상담원 앱이 받자마자 거부한다.
2. **전송 후 원격 지문 재계산** — 전송 중 깨진 것을 여기서 잡는다.
3. **컨테이너 가시성** — `docker exec kaster-server test -r <경로>`. 마운트가 빠져 있으면
   DB 행만 생기고 상담원은 "받기" 를 누르는 순간 404 를 받는다. 그 실패는 서버 로그에만 남는다.
4. **DB 등록** — `(tenantId, artifactId)` 기준 upsert. 값은 전부 psql 변수로 넘긴다.
5. **되읽기** — 서버가 이 채널에서 실제로 무엇을 고르는지 출력한다.

## 3. 확인

```bash
# 이 채널의 현재 최신
ssh blueadm@49.247.46.86 "docker exec kaster-postgres psql -U kaster -d kaster_cti -x -c \
  'select version, \"artifactId\", \"isActive\", \"publishedAt\" from \"agentDesktopReleases\" \
   where \"isActive\" order by \"publishedAt\" desc limit 3;'"
```

상담원 앱 쪽: 로그인 후 설정 → 정보에서 "새 버전" 표시. 감사 로그는
`agentDesktopUpdateAuditLogs` 에 `update-available` / `download-started` /
`download-verified` / `download-rejected` / `download-failed` 로 쌓인다.

**`download-rejected` 가 보이면 배포된 파일 자체를 의심한다** — 지문이 안 맞았다는 뜻이다.
`download-failed` (서버가 거부·전송 끊김) 와 구분한다.

## 4. 되돌리기

새 릴리스를 내리면 그 앞의 릴리스가 자동으로 다시 최신이 된다 (`publishedAt` 내림차순).

```bash
ssh blueadm@49.247.46.86 "docker exec kaster-postgres psql -U kaster -d kaster_cti -c \
  \"update \\\"agentDesktopReleases\\\" set \\\"isActive\\\" = false, \\\"updatedAt\\\" = now() \
    where \\\"artifactId\\\" = 'agent-win-x64-1.0.1';\""
```

이미 받아 간 상담원은 되돌아가지 않는다. 그 자리는 이전 설치 파일을 다시 받아 실행해야 한다.
그래서 **지난 릴리스 행은 지우지 않고 `isActive` 로만 끈다** — `artifactId` 로 지목해서
다시 켤 수 있어야 한다.

## 산출물 경로

| 위치 | 경로 |
|---|---|
| 호스트 | `/home/blueadm/kaster_cti/agent-artifacts/` |
| 컨테이너 | `/var/lib/kaster/agent-artifacts/` (읽기 전용) |
| DB `filePath` | 컨테이너 경로를 적는다 |

사이트별 운영 배포(`deploy/sites/<site>/`)는 `.env` 의 `AGENT_ARTIFACT_DIR` 로 호스트 경로를
정한다. 기본값은 사이트 디렉터리 아래 `./agent-artifacts` 다.

## 자주 나는 실패

| 증상 | 원인 |
|---|---|
| 상담원 앱에 새 버전이 안 뜬다 | 실행 파일에 버전이 안 박혔다(1.0.0.0) / 릴리스가 `isActive=false` / tenant 가 다르다 |
| "받기" 를 누르면 실패 | 파일이 컨테이너에 안 보인다 (마운트 누락, 경로 오타) |
| 받고 나서 거부 (`download-rejected`) | DB 의 `sha256` 이 실제 파일과 다르다. 파일만 새로 올리고 행을 안 고친 경우 |
| 설치가 반쯤 되다 만다 | 앱이 돌고 있는데 닫히지 않았다. `CloseApplications` 가 못 잡는 경우 상담원에게 앱 종료 후 재실행을 안내한다 |
| SmartScreen 경고 | 서명이 없거나 내부 CA 를 상담원 PC 가 신뢰하지 않는다. 루트 CA 배포를 확인한다 |

## 관련 문서

- [배포 구조 설계](../design/2026-04-22-agent-desktop-update-distribution-design.md)
- [업데이트 API 규격](../design/agent-desktop-update-api.md)
- [내부 코드서명 런북](../design/agent-desktop-internal-code-signing.md)
- [C# 클라이언트 설계](../design/2026-08-20-csharp-desktop-client-design.md)
