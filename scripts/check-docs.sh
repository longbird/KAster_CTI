#!/usr/bin/env bash
# DOCS_GUIDE.md 규칙을 실행 가능한 형태로 강제한다.
# 로컬에서도 그대로 돌린다:  bash scripts/check-docs.sh
set -uo pipefail
cd "$(dirname "$0")/.."

fail=0
note() { echo "  - $1"; }
section() { echo; echo "== $1"; }

# 벤더링된 서드파티 툴킷과 과거 기록은 검사 대상이 아니다.
#   .codex/ .lazyweb/ .superpowers/ .agents/  — 외부 툴킷의 예시 경로
#   docs/work-log/                            — 과거 상태를 서술하는 기록물
#   docs/chatgpt-archive/                     — 불변 아카이브
is_excluded() {
  case "$1" in
    .codex/*|.lazyweb/*|.superpowers/*|.agents/*|.claude/*) return 0 ;;
    docs/work-log/*|docs/chatgpt-archive/*) return 0 ;;
    scripts/check-docs.sh|DOCS_GUIDE.md|CLAUDE.md|AGENTS.md) return 0 ;;
    *) return 1 ;;
  esac
}

# ── 1. docs/ 최상위에 새 .md 금지 (README.md 만 허용) ─────────────────────────
section "docs/ 최상위 .md"
# git pathspec 의 '*' 는 '/' 도 매칭하므로 깊이는 정규식으로 거른다.
stray=$(git ls-files docs | grep -E '^docs/[^/]+\.md$' | grep -v '^docs/README\.md$' || true)
if [ -n "$stray" ]; then
  echo "FAIL — docs/ 최상위에는 README.md 만 둔다. 타입 디렉터리로 옮기세요."
  echo "$stray" | while read -r f; do note "$f"; done
  fail=1
else
  echo "OK"
fi

# ── 2. 폐지된 디렉터리 부활 금지 ─────────────────────────────────────────────
section "폐지 디렉터리"
revived=$(git ls-files docs | grep -E '^docs/(features|superpowers|proposals|ops)/' || true)
if [ -n "$revived" ]; then
  echo "FAIL — features/ superpowers/ proposals/ ops/ 는 폐지됐다. 운영 문서는 docs/operations/ 다."
  echo "$revived" | while read -r f; do note "$f"; done
  fail=1
else
  echo "OK"
fi

# ── 3. 폐지 경로를 실제로 가리키는 참조 금지 ─────────────────────────────────
# 산문에서 "이 경로는 폐지됐다" 라고 설명하는 것까지 막으면 규칙을 문서화할 수 없다.
# 그래서 링크 타겟 형태 `](docs/ops/...)` 나 코드 문자열 형태 `"docs/ops/..."` 만 잡는다.
section "폐지 경로 참조"
refs=""
while IFS= read -r f; do
  is_excluded "$f" && continue
  [ -f "$f" ] || continue
  hit=$(grep -nE '(\]\(|["'\''])(\.{0,2}/)?docs/(features|superpowers|proposals|ops)/' "$f" || true)
  [ -n "$hit" ] && refs="${refs}${f}:${hit}"$'\n'
done < <(git ls-files)
if [ -n "${refs//[$'\n']/}" ]; then
  echo "FAIL — 폐지된 경로를 링크/코드에서 참조합니다."
  echo "$refs" | while read -r l; do [ -n "$l" ] && note "$l"; done
  fail=1
else
  echo "OK"
fi

# ── 4. 마크다운 링크가 실제 파일을 가리키는지 ────────────────────────────────
section "마크다운 링크"
broken=0
while IFS= read -r f; do
  is_excluded "$f" && continue
  [ -f "$f" ] || continue
  while IFS= read -r target; do
    [ -n "$target" ] || continue
    case "$target" in
      /*) rel="${target#/}" ;;
      *)  rel="$(dirname "$f")/$target" ;;
    esac
    if [ ! -e "$rel" ]; then
      note "$f -> $target"
      broken=$((broken + 1))
    fi
  done < <(grep -oE '\]\((\.{0,2}/)?[A-Za-z0-9._/가-힣-]+\.(md|pdf|json|png|html|zip|xlsx)\)' "$f" \
            | sed 's/^](//; s/)$//' | sort -u)
done < <(git ls-files '*.md')
if [ "$broken" -gt 0 ]; then
  echo "FAIL — 깨진 링크 ${broken}건"
  fail=1
else
  echo "OK"
fi

echo
if [ "$fail" -ne 0 ]; then
  echo "docs 규칙 위반이 있습니다. 규칙은 DOCS_GUIDE.md 를 보세요."
  exit 1
fi
echo "docs 규칙 통과"
