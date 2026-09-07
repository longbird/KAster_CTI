#!/usr/bin/env bash
# 단계 verify — 설치가 실제로 됐는지 명령으로 확인하고, 1회용 비밀번호를 .env 에서 지우고, 요약을 남긴다.

VERIFY_FAILED=0

check() {
  local name="$1"; shift
  if "$@" >/dev/null 2>&1; then
    ok "$name"
  else
    warn "$name — 실패"
    VERIFY_FAILED=$((VERIFY_FAILED + 1))
  fi
}

health_json() { curl -fsS --max-time 5 http://127.0.0.1:3000/api/v1/health; }

pg_scalar() {
  { compose_cmd exec -T postgres psql -U "$(read_kv "$(site_env)" POSTGRES_USER)" -d "$(read_kv "$(site_env)" POSTGRES_DB)" -tAc "$1" 2>/dev/null || true; } | tr -d '[:space:]'
  return 0
}

phase_verify() {
  if [[ "$DRY_RUN" == "true" ]]; then
    log "verify: dry-run 에서는 확인 항목만 나열합니다"
    info "health(db·redis·ami) · 테넌트/관리자 생성 · 번들 주소 · SIP/3000/CID 포트 · 마커 · 훅 콜백"
    return 0
  fi
  log "verify: 서버 상태"
  local health_file
  health_file="$(mktemp)"
  health_json >"$health_file" 2>/dev/null || true
  check "API 응답 (127.0.0.1:3000)" test -s "$health_file"
  check "DB 정상"    jq -e '.data.checks.db == "ok"' "$health_file"
  check "Redis 정상" jq -e '.data.checks.redis == "ok"' "$health_file"
  check "AMI connected (PBX 로그인)" jq -e '.data.checks.ami == "connected"' "$health_file"
  rm -f "$health_file"

  log "verify: 첫 계정"
  local tenants admins platform_admins
  tenants="$(pg_scalar 'select count(*) from tenants')"
  admins="$(pg_scalar "select count(*) from agents where \"loginId\"='${ADMIN_LOGIN}' and role='admin'")"
  check "테넌트 1건 이상" test "${tenants:-0}" -ge 1
  check "관리자 '$ADMIN_LOGIN' 존재" test "${admins:-0}" -ge 1
  if [[ -n "${PLATFORM_ADMIN_LOGIN:-}" ]]; then
    platform_admins="$(pg_scalar 'select count(*) from "platformAdmins"')"
    check "플랫폼 관리자 존재" test "${platform_admins:-0}" -ge 1
  fi

  log "verify: 프런트 번들에 개발 주소가 없는가"
  local app
  for app in web admin; do
    check "$app 번들에 localhost:3000 없음" bash -c "! docker exec kaster-${SITE_CODE}-${app} sh -c 'grep -rl \"localhost:3000\" /usr/share/nginx/html/assets/ 2>/dev/null | grep -q .'"
  done

  log "verify: 포트·PBX"
  check "SIP $SIP_PORT/udp 대기 중" bash -c "ss -lun | grep -q ':$SIP_PORT '"
  check "5060 이 열려 있지 않음 (chan_sip 꺼짐)" bash -c "! ss -lun | grep -q ':5060 '"
  check "3000 은 127.0.0.1 에만" bash -c "ss -ltn | grep -q '127.0.0.1:3000 ' && ! ss -ltn | grep -q '0.0.0.0:3000 '"
  check "CID 포트 3개" bash -c "for p in $CID_LOGI_TCP_PORT $CID_ICON_TCP_PORT $CID_CALLMANOR_TCP_PORT; do ss -ltn | grep -q \":\$p \" || exit 1; done"
  local marker hook_code
  marker="$(tr -d '[:space:]' <"$MARKER_FILE" 2>/dev/null || true)"
  hook_code="$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/api/v1/health || true)"
  check "PBX 소유 마커 = $SITE_CODE" test "$marker" = "$SITE_CODE"
  check "훅 콜백 경로 (호스트 127.0.0.1:3000 → 200)" test "$hook_code" = "200"
  check "컨테이너가 PBX 설정 디렉터리에 쓸 수 있음" bash -c "docker exec kaster-${SITE_CODE}-server sh -c 'touch $AST_CONF/.kaster-write-test && rm $AST_CONF/.kaster-write-test'"
  check "컨테이너가 멘트 디렉터리에 쓸 수 있음" bash -c "docker exec kaster-${SITE_CODE}-server sh -c 'touch $AST_SOUNDS/.w && rm $AST_SOUNDS/.w'"

  if [[ "$VERIFY_FAILED" -gt 0 ]]; then
    warn "$VERIFY_FAILED 개 항목이 실패했습니다. 1회용 비밀번호는 .env 에 남겨 둡니다 (다시 실행하면 재확인한다)"
  else
    scrub_bootstrap_passwords
  fi
  write_summary
}

# 계정이 확인되면 .env 의 1회용 비밀번호를 비운다. 부트스트랩은 계정이 있으면 어차피 아무것도 하지 않는다.
scrub_bootstrap_passwords() {
  log "verify: 1회용 비밀번호를 .env 에서 지웁니다 (INSTALL-SUMMARY.txt 에만 남는다)"
  ensure_kv "$(site_env)" TENANT_BOOTSTRAP_ADMIN_PASSWORD ""
  ensure_kv "$(site_env)" PLATFORM_ADMIN_BOOTSTRAP_PASSWORD ""
}

write_summary() {
  local file port_suffix=""
  file="$(site_dir)/INSTALL-SUMMARY.txt"
  [[ "$HTTP_PORT" != "80" ]] && port_suffix=":$HTTP_PORT"
  {
    echo "KAster CTI 설치 요약 — $(date -Iseconds) — 사이트 $SITE_CODE"
    echo "이 파일은 비밀번호를 담고 있다. 금고에 옮기고 지운다."
    echo
    echo "관리자 콘솔   ${PUBLIC_SCHEME}://${ADMIN_DOMAIN}${port_suffix}"
    echo "상담원 웹     ${PUBLIC_SCHEME}://${SITE_DOMAIN}${port_suffix}"
    echo "API           ${PUBLIC_SCHEME}://${API_DOMAIN}${port_suffix}/api/v1"
    [[ "$AGENT_DOWNLOADS" == "true" ]] && echo "설치 파일     http://${PUBLIC_IP}:${AGENT_DOWNLOADS_PORT}/  (agent-artifacts 에 넣은 파일이 보인다)"
    echo
    echo "첫 관리자     ${ADMIN_LOGIN} / ${ADMIN_PASSWORD} / 내선 ${ADMIN_EXTENSION}   ← 로그인 직후 상담원 설정 > 비밀번호 초기화로 바꾼다"
    [[ -n "${PLATFORM_ADMIN_LOGIN:-}" ]] && echo "플랫폼 관리자 ${PLATFORM_ADMIN_LOGIN} / ${PLATFORM_ADMIN_PASSWORD}   ← ${PUBLIC_SCHEME}://${ADMIN_DOMAIN}${port_suffix}/platform/login, 첫 로그인에서 변경 강제"
    echo
    echo "PBX           Asterisk $(asterisk -V 2>/dev/null | awk '{print $2}') · AMI cti_middleware · SIP ${SIP_PORT}/udp · 마커 ${SITE_CODE}"
    echo "사이트 dir    $(site_dir)  (.env 에 DB·JWT·AMI·훅 비밀이 있다 — 백업 대상)"
    echo
    echo "다음 할 일     설치 매뉴얼 11장: 관리자 콘솔에서 트렁크·DID·큐·상담원·멘트를 넣고 PBX 설정을 첫 적용한 뒤 systemctl restart asterisk"
    echo "               설치 매뉴얼 12장: 검증 DID 로 통화 시험 12항목"
    printf '%s\n' "${SUMMARY_LINES[@]}"
  } | write_file "$file" 0600
  log "요약: $file"
  [[ "$DRY_RUN" == "true" ]] || sed 's/^/    /' "$file"
}
