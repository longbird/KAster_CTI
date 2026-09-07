#!/usr/bin/env bash
# 단계 asterisk — 검증된 apt 패키지, 사람이 넣는 기본 파일, 디렉터리·권한, 소유 마커, SIP 스캔 차단.

ASTERISK_PACKAGES=(asterisk asterisk-config asterisk-modules asterisk-core-sounds-en asterisk-core-sounds-en-gsm asterisk-moh-opsound-gsm)
AST_CONF=/etc/asterisk
AST_SOUNDS=/var/lib/asterisk/sounds/custom
AST_MOH=/var/lib/asterisk/moh
AST_MONITOR=/var/spool/asterisk/monitor
MARKER_FILE="$AST_CONF/.kaster-cti-config-owner"

phase_asterisk() {
  log "asterisk: 패키지"
  export DEBIAN_FRONTEND=noninteractive
  if [[ -n "${BUNDLE_DIR:-}" && -d "$BUNDLE_DIR/debs" ]]; then
    info "오프라인 번들의 deb 에 포함되어 있습니다 (system 단계에서 설치됨)"
  else
    run apt-get install -y --no-install-recommends "${ASTERISK_PACKAGES[@]}"
  fi
  if [[ "$DRY_RUN" != "true" ]]; then
    need_cmd asterisk
    local ver
    ver="$(asterisk -V 2>/dev/null | sed -E 's/^Asterisk ([0-9]+\.[0-9]+\.[0-9]+).*/\1/')"
    check_verified "Asterisk" "$ver" "$VERIFIED_ASTERISK_VERSION"
  fi

  log "asterisk: 사람이 넣는 기본 파일 (extensions.conf · extensions_transfer.conf · manager.conf · http.conf)"
  run install -m 0644 -o asterisk -g asterisk "$(repo_src)/infra/asterisk/extensions.conf" "$AST_CONF/extensions.conf"
  run install -m 0644 -o asterisk -g asterisk "$(repo_src)/infra/asterisk/extensions_transfer.conf" "$AST_CONF/extensions_transfer.conf"
  render_manager_conf
  write_file "$AST_CONF/http.conf" 0644 asterisk:asterisk <<'EOF'
; KAster CTI 설치 스크립트가 쓴 파일. 웹소켓(WebRTC 소프트폰)용. 서버가 reload 때 res_http_websocket 을 올린다.
[general]
enabled=yes
bindaddr=0.0.0.0
bindport=8088
EOF
  # 설계는 chan_pjsip 만 쓴다. chan_sip 이 5060 을 잡고 있으면 스캔 표적이 된다.
  if [[ "$DRY_RUN" != "true" && -f "$AST_CONF/modules.conf" ]]; then
    ensure_line "$AST_CONF/modules.conf" "noload => chan_sip.so"
  fi

  log "asterisk: 디렉터리·권한 (컨테이너가 멘트·훅 스크립트·설정을 쓴다)"
  run install -d -m 0755 -o asterisk -g asterisk "$AST_SOUNDS" "$AST_MOH" "$AST_MONITOR"
  local wav
  for wav in "$(repo_src)"/infra/asterisk/sounds/custom/*.wav; do
    [[ -f "$wav" ]] || continue
    run install -m 0644 -o asterisk -g asterisk "$wav" "$AST_SOUNDS/$(basename "$wav")"
  done
  run chown asterisk:asterisk "$AST_CONF"
  run chmod 0755 "$AST_CONF"

  log "asterisk: 소유 마커 ($MARKER_FILE)"
  if [[ -f "$MARKER_FILE" ]]; then
    local current
    current="$(tr -d '[:space:]' <"$MARKER_FILE")"
    if [[ "$current" != "$SITE_CODE" ]]; then
      die "이 PBX 설정은 이미 '$current' 가 소유합니다. 다른 사이트의 PBX 를 덮어쓰지 않습니다. 정말 이 사이트 것이면 마커를 지우고 다시 실행하십시오"
    fi
    ok "마커가 이미 $SITE_CODE 입니다"
  else
    printf '%s\n' "$SITE_CODE" | write_file "$MARKER_FILE" 0644 asterisk:asterisk
  fi

  log "asterisk: 서비스"
  run systemctl enable --now asterisk
  run systemctl restart asterisk

  if [[ "$SIP_SECURITY_PREPARE" == "true" ]]; then
    log "asterisk: SIP 스캔 차단 (security 로그 + fail2ban, 포트 $SIP_PORT)"
    if [[ "$DRY_RUN" == "true" ]]; then
      bash "$(repo_src)/scripts/pbx-sip-security-prepare.sh" --sip-port "$SIP_PORT" | sed 's/^/    /'
    else
      bash "$(repo_src)/scripts/pbx-sip-security-prepare.sh" --sip-port "$SIP_PORT" --apply | sed 's/^/    /'
    fi
  fi

  if [[ "$DRY_RUN" != "true" ]]; then
    # 재시작 직후에는 CLI 소켓이 아직 없을 수 있다. 최대 20초 기다린다.
    local i
    for i in $(seq 1 10); do
      if asterisk -rx "manager show settings" 2>/dev/null | grep -Eq "Manager \(AMI\):[[:space:]]+Yes"; then
        ok "AMI 켜짐 (5038)"
        break
      fi
      sleep 2
      [[ "$i" -eq 10 ]] && die "AMI 가 켜지지 않았습니다. asterisk -rx 'manager show settings' 를 확인하십시오"
    done
  fi
}

# infra/asterisk/manager.conf 를 바탕으로 secret 과 permit 만 바꾼다. AMI_SECRET 은 site.sh 가 .env 에 넣는 값과 1:1.
render_manager_conf() {
  local src
  src="$(repo_src)/infra/asterisk/manager.conf"
  [[ -f "$src" ]] || die "저장소에 $src 가 없습니다"
  {
    echo "; KAster CTI 설치 스크립트가 infra/asterisk/manager.conf 에서 만든 파일. secret 은 사이트 .env 의 AMI_SECRET 과 같다."
    sed -E \
      -e "s/^secret = .*/secret = ${AMI_SECRET}/" \
      -e "s#^permit = 10\.0\.0\.0/255\.0\.0\.0#permit = 10.0.0.0/255.0.0.0\npermit = 172.16.0.0/255.240.0.0#" \
      "$src"
  } | write_file "$AST_CONF/manager.conf" 0640 asterisk:asterisk
}
