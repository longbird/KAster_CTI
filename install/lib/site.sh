#!/usr/bin/env bash
# 단계 site — 저장소 배치, 사이트 디렉터리, .env 생성, compose 문법 검사.

# 저장소를 INSTALL_ROOT 에 둔다. 우선순위: 번들 > 이미 그 안에서 실행 중 > REPO_URL clone > 실행 중인 체크아웃 복사.
place_repo() {
  log "site: 저장소 → $INSTALL_ROOT"
  if [[ -n "${BUNDLE_DIR:-}" && -f "$BUNDLE_DIR/repo.tgz" ]]; then
    run install -d "$INSTALL_ROOT"
    run tar -xzf "$BUNDLE_DIR/repo.tgz" -C "$INSTALL_ROOT"
    ok "번들의 저장소 스냅샷을 풀었습니다"
  elif [[ "$SCRIPT_ROOT" == "$INSTALL_ROOT" ]]; then
    ok "이미 $INSTALL_ROOT 안에서 실행 중입니다"
  elif [[ -d "$INSTALL_ROOT/.git" ]]; then
    if [[ -n "${REPO_URL:-}" ]]; then
      run git -C "$INSTALL_ROOT" fetch --all --tags
      run git -C "$INSTALL_ROOT" checkout "$REPO_REF"
      run git -C "$INSTALL_ROOT" pull --ff-only
    fi
    ok "기존 체크아웃을 씁니다"
  elif [[ -n "${REPO_URL:-}" ]]; then
    run git clone --branch "$REPO_REF" "$REPO_URL" "$INSTALL_ROOT"
  else
    info "REPO_URL 이 비어 있어 실행 중인 체크아웃($SCRIPT_ROOT)을 복사합니다"
    run install -d "$INSTALL_ROOT"
    run bash -c "cd '$SCRIPT_ROOT' && tar --exclude=node_modules --exclude=.git --exclude='deploy/sites/*/.env' -cf - . | tar -xf - -C '$INSTALL_ROOT'"
  fi
  [[ "$DRY_RUN" == "true" || -f "$INSTALL_ROOT/deploy/sites/_template/compose.prod.yml" ]] \
    || die "$INSTALL_ROOT 에 저장소가 없습니다 (deploy/sites/_template/compose.prod.yml 없음)"
}

# 사이트 디렉터리. 이미 있으면 .env 는 건드리지 않고 compose·nginx 만 템플릿 최신으로 맞춘다.
place_site_dir() {
  local dir tpl
  dir="$(site_dir)"; tpl="$INSTALL_ROOT/deploy/sites/_template"
  log "site: 사이트 디렉터리 $dir"
  run install -d "$dir/nginx" "$dir/backups" "$dir/agent-artifacts"
  run install -m 0644 "$tpl/compose.prod.yml" "$dir/compose.prod.yml"
  run install -m 0644 "$tpl/nginx/default.conf.template" "$dir/nginx/default.conf.template"
  if [[ ! -f "$(site_env)" ]]; then
    run install -m 0600 "$tpl/.env.example" "$(site_env)"
    ok ".env 를 템플릿에서 새로 만들었습니다"
  else
    ok ".env 가 이미 있어 비밀은 유지하고 빠진 값만 채웁니다"
  fi
}

# 비밀은 .env 에 이미 있으면 그대로, 없으면 만든다. 그래서 다시 실행해도 바뀌지 않는다.
keep_or_make_secret() {
  local key="$1" existing
  existing="$(read_kv "$(site_env)" "$key")"
  case "$existing" in
    ""|change_me|change_me_*|replace_with_*|kaster) rand_secret 32 ;;
    *) printf '%s' "$existing" ;;
  esac
}

render_env() {
  local env public_port_suffix="" api_base ws_base cors
  env="$(site_env)"
  log "site: .env 채우기"

  POSTGRES_PASSWORD="$(keep_or_make_secret POSTGRES_PASSWORD)"
  JWT_SECRET="$(keep_or_make_secret JWT_SECRET)"
  AMI_SECRET="$(keep_or_make_secret AMI_SECRET)"
  KASTER_INTERNAL_SECRET="$(keep_or_make_secret KASTER_INTERNAL_SECRET)"

  [[ "$HTTP_PORT" != "80" ]] && public_port_suffix=":$HTTP_PORT"
  api_base="${PUBLIC_SCHEME}://${API_DOMAIN}${public_port_suffix}"
  ws_base="$api_base"
  cors="${PUBLIC_SCHEME}://${SITE_DOMAIN}${public_port_suffix},${PUBLIC_SCHEME}://${ADMIN_DOMAIN}${public_port_suffix}"

  ensure_kv "$env" SITE_CODE "$SITE_CODE"
  ensure_kv "$env" SITE_DOMAIN "$SITE_DOMAIN"
  ensure_kv "$env" ADMIN_DOMAIN "$ADMIN_DOMAIN"
  ensure_kv "$env" API_DOMAIN "$API_DOMAIN"
  ensure_kv "$env" HTTP_PORT "$HTTP_PORT"
  ensure_kv "$env" POSTGRES_DB kaster_cti
  ensure_kv "$env" POSTGRES_USER kaster_app
  ensure_kv "$env" POSTGRES_PASSWORD "$POSTGRES_PASSWORD"
  ensure_kv "$env" JWT_SECRET "$JWT_SECRET"
  ensure_kv "$env" AMI_HOST host.docker.internal
  ensure_kv "$env" AMI_PORT 5038
  ensure_kv "$env" AMI_USERNAME cti_middleware
  ensure_kv "$env" AMI_SECRET "$AMI_SECRET"
  ensure_kv "$env" AMI_RECONNECT_MS 5000
  ensure_kv "$env" ASTERISK_NODE_ID "${SITE_CODE}-pbx-a"
  ensure_kv "$env" ASTERISK_OUTBOUND_CONTEXT outbound-main
  ensure_kv "$env" ASTERISK_CONF_DIR "$AST_CONF"
  ensure_kv "$env" ASTERISK_CONF_OWNER_ID "$SITE_CODE"
  ensure_kv "$env" ASTERISK_CONF_ALLOW_SHARED_WRITE false
  ensure_kv "$env" ASTERISK_SOUNDS_DIR "$AST_SOUNDS"
  ensure_kv "$env" ASTERISK_MOH_DIR "$AST_MOH"
  ensure_kv "$env" ASTERISK_EXTERNAL_MEDIA_ADDRESS "$PUBLIC_IP"
  ensure_kv "$env" ASTERISK_EXTERNAL_SIGNALING_ADDRESS "$PUBLIC_IP"
  ensure_kv "$env" ASTERISK_LOCAL_NETS "$LOCAL_NETS"
  ensure_kv "$env" ASTERISK_RTP_STUN_ADDRESS ""
  ensure_kv "$env" ASTERISK_TRUNK_SIP_PORT "${TRUNK_SIP_PORT:-}"
  ensure_kv "$env" KASTER_INTERNAL_SECRET "$KASTER_INTERNAL_SECRET"
  ensure_kv "$env" CID_LOGI_TCP_PORT "$CID_LOGI_TCP_PORT"
  ensure_kv "$env" CID_ICON_TCP_PORT "$CID_ICON_TCP_PORT"
  ensure_kv "$env" CID_CALLMANOR_TCP_PORT "$CID_CALLMANOR_TCP_PORT"
  ensure_kv "$env" RECORDING_STORAGE_ROOT "$AST_MONITOR"
  ensure_kv "$env" AGENT_ARTIFACT_DIR ./agent-artifacts
  ensure_kv "$env" AGENT_DOWNLOADS_ENABLED "$AGENT_DOWNLOADS"
  ensure_kv "$env" AGENT_DOWNLOADS_PORT "$AGENT_DOWNLOADS_PORT"
  ensure_kv "$env" REST_CORS_ORIGIN "$cors"
  ensure_kv "$env" WS_CORS_ORIGIN "$cors"
  ensure_kv "$env" VITE_API_BASE_URL "${api_base}/api/v1"
  ensure_kv "$env" VITE_WS_URL "$ws_base"
  ensure_kv "$env" VITE_USE_MOCK false
  ensure_kv "$env" VITE_ACCESS_TOKEN_KEY kaster.access_token
  ensure_kv "$env" SOFTPHONE_ENABLED true
  ensure_kv "$env" SOFTPHONE_SIP_SERVER "${PUBLIC_IP}:${SIP_PORT}"
  ensure_kv "$env" SOFTPHONE_SIP_DOMAIN "$PUBLIC_IP"
  ensure_kv "$env" SOFTPHONE_SIP_TRANSPORT udp
  ensure_kv "$env" AUTO_SEED_DEMO_DATA false
  ensure_kv "$env" RESILIENCE_BACKUP_STATUS_FILE "$([[ "$BACKUP_CRON" == "true" ]] && printf '/var/lib/kaster/backups/status')"

  # 첫 계정. 비밀번호는 1회용 — verify 단계가 계정 생성을 확인한 뒤 .env 에서 지운다.
  ADMIN_PASSWORD="${ADMIN_PASSWORD:-$(read_kv "$env" TENANT_BOOTSTRAP_ADMIN_PASSWORD)}"
  ADMIN_PASSWORD="${ADMIN_PASSWORD:-$(rand_password 14)}"
  ensure_kv "$env" TENANT_BOOTSTRAP_CODE "$SITE_CODE"
  ensure_kv "$env" TENANT_BOOTSTRAP_NAME "$TENANT_NAME"
  ensure_kv "$env" TENANT_BOOTSTRAP_ADMIN_LOGIN "$ADMIN_LOGIN"
  ensure_kv "$env" TENANT_BOOTSTRAP_ADMIN_PASSWORD "$ADMIN_PASSWORD"
  ensure_kv "$env" TENANT_BOOTSTRAP_ADMIN_EXTENSION "$ADMIN_EXTENSION"
  if [[ -n "${PLATFORM_ADMIN_LOGIN:-}" ]]; then
    PLATFORM_ADMIN_PASSWORD="${PLATFORM_ADMIN_PASSWORD:-$(read_kv "$env" PLATFORM_ADMIN_BOOTSTRAP_PASSWORD)}"
    PLATFORM_ADMIN_PASSWORD="${PLATFORM_ADMIN_PASSWORD:-$(rand_password 14)}"
    ensure_kv "$env" PLATFORM_ADMIN_BOOTSTRAP_LOGIN "$PLATFORM_ADMIN_LOGIN"
    ensure_kv "$env" PLATFORM_ADMIN_BOOTSTRAP_PASSWORD "$PLATFORM_ADMIN_PASSWORD"
  fi
  run chmod 0600 "$env"

  if [[ "$DRY_RUN" != "true" ]]; then
    compose_cmd config >/dev/null || die "compose 문법 검사 실패: docker compose -f $(site_compose) --env-file $env config"
    ok "compose config 통과"
  fi
}

phase_site() {
  place_repo
  place_site_dir
  render_env
}
