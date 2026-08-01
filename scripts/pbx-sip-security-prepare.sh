#!/usr/bin/env bash
set -euo pipefail

SIP_PORT="${SIP_PORT:-36070}"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODE="dry-run"

usage() {
  cat <<USAGE
Usage: $0 [--apply] [--sip-port PORT]

Prepares PBX SIP security logging and automatic scan blocking files.
Default mode is dry-run. Use --apply on the PBX host as root.

Environment:
  SIP_PORT          UDP SIP port to protect. Default: 36070
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --apply)
      MODE="apply"
      shift
      ;;
    --sip-port)
      SIP_PORT="${2:?missing port after --sip-port}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if ! [[ "$SIP_PORT" =~ ^[0-9]+$ ]] || (( SIP_PORT < 1 || SIP_PORT > 65535 )); then
  echo "Invalid SIP_PORT: $SIP_PORT" >&2
  exit 2
fi

require_root_for_apply() {
  if [[ "$MODE" == "apply" && "${EUID:-$(id -u)}" -ne 0 ]]; then
    echo "--apply must be run as root because it writes /etc and reloads services." >&2
    exit 1
  fi
}

run() {
  if [[ "$MODE" == "apply" ]]; then
    "$@"
  else
    printf '[dry-run] '
    printf '%q ' "$@"
    printf '\n'
  fi
}

ensure_security_logger() {
  local logger_conf="/etc/asterisk/logger.conf"
  local stamp backup
  stamp="$(date +%Y%m%d%H%M%S)"
  backup="/var/backups/kaster-pbx-hardening/${stamp}"

  if [[ "$MODE" == "apply" ]]; then
    [[ -f "$logger_conf" ]] || { echo "Missing $logger_conf" >&2; exit 1; }
    mkdir -p "$backup"
    cp -a "$logger_conf" "$backup/logger.conf.before"
    if grep -Eq '^[[:space:]]*;?[[:space:]]*security[[:space:]]*=>' "$logger_conf"; then
      sed -i -E 's/^[[:space:]]*;[[:space:]]*(security[[:space:]]*=>.*)$/\1/' "$logger_conf"
    else
      awk '
        /^\[logfiles\]/ && !done { print; print "security => security"; done=1; next }
        { print }
        END { if (!done) { print ""; print "[logfiles]"; print "security => security" } }
      ' "$logger_conf" > "${logger_conf}.tmp"
      mv "${logger_conf}.tmp" "$logger_conf"
    fi
    touch /var/log/asterisk/security
    chown asterisk:asterisk /var/log/asterisk/security 2>/dev/null || true
    chmod 0640 /var/log/asterisk/security 2>/dev/null || true
    if command -v asterisk >/dev/null 2>&1; then
      asterisk -rx "logger reload" || true
    fi
    echo "logger.conf backup: $backup/logger.conf.before"
  else
    echo "[dry-run] enable 'security => security' in $logger_conf"
    echo "[dry-run] create /var/log/asterisk/security and reload logger"
  fi
}

install_fail2ban() {
  local filter_src="$REPO_DIR/infra/security/pbx-sip-hardening/fail2ban/asterisk-pjsip-scan.conf"
  local jail_src="$REPO_DIR/infra/security/pbx-sip-hardening/fail2ban/kaster-pbx-sip.conf.example"
  local jail_tmp="/tmp/kaster-pbx-sip.conf"

  sed "s/port = 36070/port = ${SIP_PORT}/; s/port=\"36070\"/port=\"${SIP_PORT}\"/" "$jail_src" > "$jail_tmp"
  run install -m 0644 "$filter_src" /etc/fail2ban/filter.d/asterisk-pjsip-scan.conf
  run install -m 0644 "$jail_tmp" /etc/fail2ban/jail.d/kaster-pbx-sip.conf

  if [[ "$MODE" == "apply" ]]; then
    if command -v fail2ban-client >/dev/null 2>&1; then
      systemctl reload fail2ban || systemctl restart fail2ban || true
      fail2ban-client status kaster-pbx-sip || true
    else
      echo "fail2ban is not installed. Install fail2ban before enabling automatic bans." >&2
    fi
  fi
}

print_nftables_hint() {
  cat <<HINT

nftables rate-limit template:
  $REPO_DIR/infra/security/pbx-sip-hardening/nftables/pbx-sip-rate-limit.nft.example

Edit trusted IPs before applying. Current defaults include the observed carrier/test IPs only.
Apply manually after review:
  sudo nft -f infra/security/pbx-sip-hardening/nftables/pbx-sip-rate-limit.nft.example
HINT
}

require_root_for_apply
ensure_security_logger
install_fail2ban
print_nftables_hint
