#!/usr/bin/env bash
# 상담원 데스크톱 릴리스를 콜센터 서버에 올린다.
#
# 사용법:
#   ./scripts/publish-desktop-release.sh                      # release.json 대로 올림
#   ./scripts/publish-desktop-release.sh --dry-run            # 무엇을 할지만 보여줌
#   ./scripts/publish-desktop-release.sh --notes "첫 배포"
#   ./scripts/publish-desktop-release.sh --mandatory          # 강제 업데이트로 표시
#
# 전제:
#   1. apps/desktop-win/tools/build-release.ps1 로 release/ 를 먼저 만들어 둔다.
#   2. SSH 키가 원격 authorized_keys 에 있어 password 없이 붙는다.
#
# 이 스크립트가 지키는 것:
#   - 올리기 전에 로컬 파일의 지문을 다시 계산해 release.json 과 맞춘다.
#     (설치 파일만 새로 만들고 release.json 이 옛것이면 클라이언트가 받자마자 거부한다)
#   - 올린 뒤 원격에서 지문을 한 번 더 계산해 맞춘다. 전송 중 깨진 것을 여기서 잡는다.
#   - 서버 컨테이너가 그 경로를 실제로 볼 수 있는지 확인한다. 마운트가 빠져 있으면
#     DB 행만 생기고 상담원은 다운로드 단계에서 404 를 받는다.

set -euo pipefail

REMOTE="${KASTER_REMOTE:-blueadm@49.247.46.86}"
HOST_ARTIFACT_DIR="${KASTER_ARTIFACT_DIR:-/home/blueadm/kaster_cti/agent-artifacts}"
CONTAINER_ARTIFACT_DIR="${KASTER_CONTAINER_ARTIFACT_DIR:-/var/lib/kaster/agent-artifacts}"
PG_CONTAINER="${KASTER_PG_CONTAINER:-kaster-postgres}"
SERVER_CONTAINER="${KASTER_SERVER_CONTAINER:-kaster-server}"
PG_USER="${KASTER_PG_USER:-kaster}"
PG_DB="${KASTER_PG_DB:-kaster_cti}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RELEASE_DIR="${REPO_ROOT}/apps/desktop-win/release"
RELEASE_JSON="${RELEASE_DIR}/release.json"

TENANT_ID=""
NOTES=""
MANDATORY="false"
MIN_REQUIRED=""
DRY_RUN="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --tenant)          TENANT_ID="$2"; shift 2 ;;
    --release)         RELEASE_JSON="$2"; RELEASE_DIR="$(cd "$(dirname "$2")" && pwd)"; shift 2 ;;
    --notes)           NOTES="$2"; shift 2 ;;
    --minimum)         MIN_REQUIRED="$2"; shift 2 ;;
    --mandatory)       MANDATORY="true"; shift ;;
    --dry-run)         DRY_RUN="true"; shift ;;
    *) echo "알 수 없는 인자: $1" >&2; exit 1 ;;
  esac
done

command -v jq >/dev/null 2>&1 || { echo "jq 가 필요합니다." >&2; exit 1; }
[[ -f "$RELEASE_JSON" ]] || { echo "release.json 이 없습니다: $RELEASE_JSON" >&2; exit 1; }

ARTIFACT_ID="$(jq -r '.artifactId' "$RELEASE_JSON")"
VERSION="$(jq -r '.version' "$RELEASE_JSON")"
CHANNEL="$(jq -r '.channel' "$RELEASE_JSON")"
FILE_NAME="$(jq -r '.fileName' "$RELEASE_JSON")"
SIZE_BYTES="$(jq -r '.sizeBytes' "$RELEASE_JSON")"
SHA256="$(jq -r '.sha256' "$RELEASE_JSON")"
SIGNED="$(jq -r '.signed' "$RELEASE_JSON")"

LOCAL_FILE="${RELEASE_DIR}/${FILE_NAME}"
[[ -f "$LOCAL_FILE" ]] || { echo "설치 파일이 없습니다: $LOCAL_FILE" >&2; exit 1; }

# release.json 이 이 파일의 것이 맞는지. 이것을 건너뛰면 지문이 어긋난 채 올라가고,
# 상담원 앱은 받은 다음에야 거부한다 — 그때는 이미 배포가 나간 뒤다.
ACTUAL_SHA="$(sha256sum "$LOCAL_FILE" | cut -d' ' -f1)"
if [[ "$ACTUAL_SHA" != "$SHA256" ]]; then
  echo "지문이 다릅니다. release.json 이 이 설치 파일의 것이 아닙니다." >&2
  echo "  release.json : $SHA256" >&2
  echo "  실제 파일    : $ACTUAL_SHA" >&2
  exit 1
fi

ACTUAL_SIZE="$(stat -c%s "$LOCAL_FILE" 2>/dev/null || stat -f%z "$LOCAL_FILE")"
if [[ "$ACTUAL_SIZE" != "$SIZE_BYTES" ]]; then
  echo "크기가 다릅니다: release.json=$SIZE_BYTES, 실제=$ACTUAL_SIZE" >&2
  exit 1
fi

if [[ "$SIGNED" != "true" ]]; then
  echo ">>> 경고: 서명되지 않은 설치 파일입니다. 운영 배포에는 서명본을 쓰십시오."
fi

if [[ -z "$TENANT_ID" ]]; then
  TENANT_ID="$(ssh "$REMOTE" "docker exec ${PG_CONTAINER} psql -U ${PG_USER} -d ${PG_DB} -t -A -c 'select \"tenantId\" from tenants order by \"createdAt\" limit 1;'" | tr -d '\r')"
  echo ">>> tenant 를 지정하지 않아 가장 먼저 만들어진 것을 씁니다: ${TENANT_ID}"
fi

CONTAINER_PATH="${CONTAINER_ARTIFACT_DIR}/${FILE_NAME}"

cat <<INFO
>>> 올릴 릴리스
    tenant     : ${TENANT_ID}
    channel    : ${CHANNEL}
    version    : ${VERSION}
    artifactId : ${ARTIFACT_ID}
    fileName   : ${FILE_NAME}
    filePath   : ${CONTAINER_PATH}
    size       : ${SIZE_BYTES}
    sha256     : ${SHA256}
    mandatory  : ${MANDATORY}
    서명       : $([[ "$SIGNED" == "true" ]] && echo 있음 || echo 없음)
INFO

if [[ "$DRY_RUN" == "true" ]]; then
  echo ">>> --dry-run 이라 여기서 멈춥니다."
  exit 0
fi

# --- 1. 파일 전송 ----------------------------------------------------------
echo ">>> 전송"
ssh "$REMOTE" "mkdir -p ~/.kaster-upload"
scp -q "$LOCAL_FILE" "${REMOTE}:~/.kaster-upload/${FILE_NAME}"

echo ">>> 원격 지문 확인 후 배치"
ssh "$REMOTE" "bash -s" <<REMOTE_SCRIPT
set -euo pipefail
staged="\$HOME/.kaster-upload/${FILE_NAME}"
remote_sha="\$(sha256sum "\$staged" | cut -d' ' -f1)"
if [[ "\$remote_sha" != "${SHA256}" ]]; then
  echo "전송 중 파일이 달라졌습니다: \$remote_sha" >&2
  exit 1
fi

# sudo 를 쓰지 않는다. 배포 계정이 이 디렉터리에 직접 쓸 수 있어야 한다 —
# 비대화형 SSH 에서 sudo 는 비밀번호를 물을 수 없어 배포가 여기서 멈춘다.
#
# 디렉터리를 새로 만들어 소유자를 바꾸는 방법은 쓰지 않는다. 컨테이너가 이 경로를
# bind mount 로 물고 있어서, 디렉터리를 갈아치우면 컨테이너는 옛 것을 계속 보고
# 새로 놓은 파일이 안 보인다. 같은 디렉터리의 소유자만 바꿔야 한다.
if [[ ! -w "${HOST_ARTIFACT_DIR}" ]]; then
  echo "" >&2
  echo "${HOST_ARTIFACT_DIR} 에 쓸 수 없습니다. 서버에서 한 번만 실행해 주세요:" >&2
  echo "" >&2
  echo "    sudo chown \$(id -un):\$(id -gn) ${HOST_ARTIFACT_DIR}" >&2
  echo "" >&2
  exit 1
fi

install -m 0644 "\$staged" "${HOST_ARTIFACT_DIR}/${FILE_NAME}"
rm -f "\$staged"
echo "    배치 완료: ${HOST_ARTIFACT_DIR}/${FILE_NAME}"
REMOTE_SCRIPT

# --- 2. 서버 컨테이너가 그 파일을 보는가 -----------------------------------
# DB 행만 넣고 마운트를 확인하지 않으면, 상담원은 "새 버전 있음" 을 보고 눌렀을 때
# 다운로드 단계에서 404 를 받는다. 그 실패는 서버 로그에만 남는다.
echo ">>> 컨테이너 가시성 확인"
ssh "$REMOTE" "docker exec ${SERVER_CONTAINER} sh -c 'test -r \"${CONTAINER_PATH}\"'" \
  || { echo "서버 컨테이너가 ${CONTAINER_PATH} 를 읽지 못합니다. compose 의 agent-artifacts 마운트를 확인하세요." >&2; exit 1; }
echo "    OK"

# --- 3. DB 등록 ------------------------------------------------------------
# 값은 전부 psql 변수로 넘긴다. 파일 이름과 메모는 사람이 적는 값이라 SQL 에 직접 잇지 않는다.
echo ">>> DB 등록"
ssh "$REMOTE" "docker exec -i ${PG_CONTAINER} psql -U ${PG_USER} -d ${PG_DB} \
  -v tenant='${TENANT_ID}' \
  -v channel='${CHANNEL}' \
  -v version='${VERSION}' \
  -v artifact='${ARTIFACT_ID}' \
  -v filename='${FILE_NAME}' \
  -v filepath='${CONTAINER_PATH}' \
  -v filesize='${SIZE_BYTES}' \
  -v sha='${SHA256}' \
  -v mandatory='${MANDATORY}' \
  -v minreq='${MIN_REQUIRED}' \
  -v notes='${NOTES}' \
  -v ON_ERROR_STOP=1" <<'SQL'
INSERT INTO "agentDesktopReleases" (
  "releaseId", "tenantId", "channel", "version", "artifactId",
  "fileName", "filePath", "fileSizeBytes", "sha256",
  "mandatory", "minimumRequiredVersion", "notes",
  "isActive", "publishedAt", "createdAt", "updatedAt"
) VALUES (
  gen_random_uuid(), :'tenant'::uuid, :'channel', :'version', :'artifact',
  :'filename', :'filepath', :'filesize'::bigint, :'sha',
  :'mandatory'::boolean, NULLIF(:'minreq', ''), NULLIF(:'notes', ''),
  true, now(), now(), now()
)
ON CONFLICT ("tenantId", "artifactId") DO UPDATE SET
  "channel"                = EXCLUDED."channel",
  "version"                = EXCLUDED."version",
  "fileName"               = EXCLUDED."fileName",
  "filePath"               = EXCLUDED."filePath",
  "fileSizeBytes"          = EXCLUDED."fileSizeBytes",
  "sha256"                 = EXCLUDED."sha256",
  "mandatory"              = EXCLUDED."mandatory",
  "minimumRequiredVersion" = EXCLUDED."minimumRequiredVersion",
  "notes"                  = EXCLUDED."notes",
  "isActive"               = true,
  "publishedAt"            = now(),
  "updatedAt"              = now();
SQL

# --- 4. 되읽기 -------------------------------------------------------------
# 넣었다고 말하기 전에 서버가 실제로 무엇을 최신으로 고르는지 확인한다.
echo ">>> 등록 결과 (이 채널에서 서버가 고를 릴리스)"
ssh "$REMOTE" "docker exec ${PG_CONTAINER} psql -U ${PG_USER} -d ${PG_DB} -x -c \
  'select \"version\",\"artifactId\",\"fileName\",\"filePath\",\"fileSizeBytes\",\"sha256\",\"mandatory\",\"isActive\",\"publishedAt\" \
   from \"agentDesktopReleases\" \
   where \"tenantId\" = '\''${TENANT_ID}'\''::uuid and \"channel\" = '\''${CHANNEL}'\'' and \"isActive\" \
   order by \"publishedAt\" desc limit 1;'"

echo ""
echo ">>> 완료. 상담원 앱에서 ${VERSION} 이 최신으로 보입니다."
