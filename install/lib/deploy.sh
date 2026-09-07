#!/usr/bin/env bash
# 단계 firewall · deploy — ufw 규칙, 이미지(온라인 빌드 또는 번들 반입), 기동, 백업 cron.

phase_firewall() {
  if [[ "$FIREWALL" != "ufw" ]]; then
    log "firewall: FIREWALL=$FIREWALL — 건너뜁니다"
    return 0
  fi
  log "firewall: ufw"
  need_cmd ufw
  # SSH 를 먼저 열지 않고 enable 하면 원격 세션이 끊긴다.
  run ufw allow OpenSSH
  run ufw allow "${HTTP_PORT}/tcp"
  [[ "$PUBLIC_SCHEME" == "https" ]] && run ufw allow 443/tcp
  run ufw allow "${SIP_PORT}/udp"
  run ufw allow "${RTP_PORT_RANGE}/udp"
  if [[ -n "${TRUNK_SIP_PORT:-}" ]]; then
    if [[ -n "${TRUNK_PEER_IP:-}" ]]; then
      run ufw allow from "$TRUNK_PEER_IP" to any port "$TRUNK_SIP_PORT" proto udp
    else
      warn "TRUNK_PEER_IP 가 비어 있어 트렁크 포트 $TRUNK_SIP_PORT 를 전체에 엽니다. 통신사 IP 를 알면 site.conf 에 적고 다시 실행하십시오"
      run ufw allow "${TRUNK_SIP_PORT}/udp"
    fi
  fi
  local net port
  IFS=',' read -ra nets <<<"$LOCAL_NETS"
  for net in "${nets[@]}"; do
    for port in "$CID_LOGI_TCP_PORT" "$CID_ICON_TCP_PORT" "$CID_CALLMANOR_TCP_PORT"; do
      run ufw allow from "$net" to any port "$port" proto tcp
    done
  done
  [[ "$AGENT_DOWNLOADS" == "true" ]] && run ufw allow "${AGENT_DOWNLOADS_PORT}/tcp"
  run ufw --force enable
  [[ "$DRY_RUN" == "true" ]] || ufw status numbered | sed 's/^/    /'
}

# 번들의 images.tar 를 올리고 사이트 이름으로 태그를 맞춘다.
load_bundle_images() {
  log "deploy: 번들 이미지 반입"
  run docker load -i "$BUNDLE_DIR/images.tar"
  local app
  for app in server web admin capture-agent; do
    if [[ "$DRY_RUN" == "true" ]] || docker image inspect "kaster/bundle-${app}:latest" >/dev/null 2>&1; then
      run docker tag "kaster/bundle-${app}:latest" "kaster/${SITE_CODE}-${app}:latest"
    fi
  done
}

phase_deploy() {
  local extra=()
  if [[ -n "${BUNDLE_DIR:-}" && -f "$BUNDLE_DIR/images.tar" ]]; then
    load_bundle_images
    extra+=(--no-build)
    if [[ "$DRY_RUN" != "true" ]]; then
      local bundle_vite
      bundle_vite="$(jq -r '.viteApiBaseUrl // empty' "$BUNDLE_DIR/manifest.json" 2>/dev/null || true)"
      if [[ -n "$bundle_vite" && "$bundle_vite" != "$(read_kv "$(site_env)" VITE_API_BASE_URL)" ]]; then
        die "번들의 상담원·관리자 이미지는 $bundle_vite 로 만들어졌는데 이 사이트의 API 주소는 $(read_kv "$(site_env)" VITE_API_BASE_URL) 입니다. 번들을 이 사이트 값으로 다시 만드십시오"
      fi
    fi
  else
    info "온라인 빌드. Docker Hub 가 막힌 곳이면 install/make-offline-bundle.sh 로 만든 번들을 --bundle 로 주십시오"
  fi

  # 배포 스크립트의 health 는 API 도메인으로 붙는다. 설치 시점엔 DNS 가 없을 수 있어 여기서 127.0.0.1 로 직접 기다린다.
  extra+=(--skip-health)
  log "deploy: scripts/deploy-prod.sh (env 검사 → 마커 검사 → 빌드 → 기동)"
  if [[ "$DRY_RUN" == "true" ]]; then
    run bash "$(repo_src)/scripts/deploy-prod.sh" --site-dir "$(site_dir)" "${extra[@]}"
    return 0
  fi
  bash "$(repo_src)/scripts/deploy-prod.sh" --site-dir "$(site_dir)" "${extra[@]}" 2>&1 | sed 's/^/    /'
  [[ "${PIPESTATUS[0]}" -eq 0 ]] || die "배포 스크립트가 실패했습니다. 위 출력을 보십시오"

  log "deploy: 서버 준비 대기 (127.0.0.1:3000/api/v1/health/ready, 최대 120초)"
  local i
  for i in $(seq 1 60); do
    if curl -fsS --max-time 3 http://127.0.0.1:3000/api/v1/health/ready >/dev/null 2>&1; then
      ok "준비됨 ($((i * 2))초)"
      break
    fi
    sleep 2
    if [[ "$i" -eq 60 ]]; then
      compose_cmd logs --tail=80 server | sed 's/^/    /' || true
      die "서버가 120초 안에 준비되지 않았습니다"
    fi
  done

  if [[ "$BACKUP_CRON" == "true" ]]; then
    log "deploy: 백업 cron (매일 03:00 → $(site_dir)/backups)"
    write_file "/etc/cron.d/kaster-${SITE_CODE}-backup" 0644 <<EOF
# KAster CTI 설치 스크립트. DB 를 매일 덤프하고 마지막 성공 시각을 남긴다 (관리자 콘솔 시스템 모니터링에 보인다).
SHELL=/bin/bash
0 3 * * * root cd $(site_dir) && docker compose -f compose.prod.yml --env-file .env exec -T postgres sh -c 'pg_dump -U "\$POSTGRES_USER" "\$POSTGRES_DB"' | gzip -c > backups/postgres-\$(date +\\%Y\\%m\\%d).sql.gz && date -Iseconds > backups/status && find backups -name 'postgres-*.sql.gz' -mtime +14 -delete
EOF
  fi
}
