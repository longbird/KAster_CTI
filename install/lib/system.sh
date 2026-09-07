#!/usr/bin/env bash
# 단계 system — OS 확인, 패키지, 시간대, Docker.

APT_PACKAGES=(git curl jq python3 ca-certificates gnupg openssl ufw fail2ban)
DOCKER_PACKAGES=(docker.io docker-compose-v2)

phase_system() {
  log "system: OS 확인"
  if [[ -f /etc/os-release ]]; then
    # shellcheck disable=SC1091
    . /etc/os-release
    check_verified "OS" "${ID}-${VERSION_ID}" "${VERIFIED_OS_ID}-${VERIFIED_OS_VERSION}"
  elif [[ "$DRY_RUN" == "true" ]]; then
    warn "/etc/os-release 가 없어 OS 를 확인하지 못했습니다 (dry-run 이라 계속)"
  else
    die "/etc/os-release 가 없습니다. Ubuntu ${VERIFIED_OS_VERSION} 에서 실행하십시오"
  fi

  log "system: 패키지"
  export DEBIAN_FRONTEND=noninteractive
  if [[ -n "${BUNDLE_DIR:-}" && -d "$BUNDLE_DIR/debs" ]]; then
    info "오프라인 번들의 deb 로 설치합니다 ($BUNDLE_DIR/debs)"
    # 로컬 deb 는 ./ 로 시작해야 apt 가 파일로 본다. 이미 깔린 것은 건너뛴다.
    run bash -c "cd '$BUNDLE_DIR/debs' && apt-get install -y --no-install-recommends ./*.deb"
  else
    run apt-get update -q
    run apt-get install -y --no-install-recommends "${APT_PACKAGES[@]}"
    if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
      # docker-ce 가 깔린 서버(예: CI 러너)에 docker.io 를 얹으면 패키지가 충돌한다.
      warn "docker 와 compose 가 이미 있어 Ubuntu docker.io 패키지를 설치하지 않습니다 ($(docker --version))"
    else
      run apt-get install -y --no-install-recommends "${DOCKER_PACKAGES[@]}"
    fi
  fi

  log "system: 시간대·시간 동기화"
  run timedatectl set-timezone Asia/Seoul
  if [[ "$DRY_RUN" != "true" ]]; then
    if timedatectl show -p NTPSynchronized --value 2>/dev/null | grep -q yes; then
      ok "NTP 동기화됨"
    else
      warn "NTP 가 아직 동기화되지 않았습니다. PBX 와 CTI 는 같은 시계를 봐야 합니다 — systemd-timesyncd 상태를 확인하십시오"
    fi
  fi

  log "system: Docker"
  run systemctl enable --now docker
  if [[ "$DRY_RUN" != "true" ]]; then
    need_cmd docker
    docker compose version >/dev/null 2>&1 || die "docker compose v2 가 없습니다 (docker-compose-v2 패키지)"
    ok "$(docker --version) / $(docker compose version --short)"
    if [[ -n "${SUDO_USER:-}" ]]; then
      run usermod -aG docker "$SUDO_USER"
      info "$SUDO_USER 를 docker 그룹에 넣었습니다 (다시 로그인하면 sudo 없이 docker 를 쓸 수 있다)"
    fi
  fi
}
