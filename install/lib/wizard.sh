#!/usr/bin/env bash
# --wizard — 질문에 답해 site.conf 를 만든다. 비밀은 묻지 않는다 (스크립트가 만든다).

ask() {
  local var="$1" prompt="$2" default="${3:-}" answer
  if [[ -n "$default" ]]; then
    read -r -p "  $prompt [$default]: " answer
  else
    read -r -p "  $prompt: " answer
  fi
  printf -v "$var" '%s' "${answer:-$default}"
}

ask_secret() {
  local var="$1" prompt="$2" answer
  read -r -s -p "  $prompt (비우면 만들어 준다): " answer
  echo
  printf -v "$var" '%s' "$answer"
}

run_wizard() {
  local out="$1"
  echo
  echo "KAster CTI 설치 마법사 — 답은 $out 에 저장된다. 나중에 파일을 고쳐 다시 실행할 수 있다."
  echo
  ask W_SITE_CODE "사이트 코드 (영문 소문자·숫자·하이픈)" "site1"
  ask W_TENANT_NAME "회사(테넌트) 이름" "$W_SITE_CODE 콜센터"
  ask W_SITE_DOMAIN "상담원 웹 도메인" "cti.${W_SITE_CODE}.local"
  ask W_ADMIN_DOMAIN "관리자 콘솔 도메인" "admin.cti.${W_SITE_CODE}.local"
  ask W_API_DOMAIN "API 도메인" "api.cti.${W_SITE_CODE}.local"
  ask W_PUBLIC_SCHEME "앞단 TLS 종료가 있으면 https, 아니면 http" "http"
  ask W_HTTP_PORT "HTTP 포트" "80"
  ask W_PUBLIC_IP "서버 공인 IP (NAT 뒤면 반드시)" "$(detect_public_ip)"
  ask W_ADMIN_LOGIN "첫 관리자 로그인 ID" "admin"
  ask_secret W_ADMIN_PASSWORD "첫 관리자 임시 비밀번호"
  ask W_ADMIN_EXTENSION "첫 관리자 내선" "2000"
  ask W_PLATFORM_ADMIN_LOGIN "플랫폼 관리자 ID (비우면 만들지 않음)" "platform"
  [[ -n "$W_PLATFORM_ADMIN_LOGIN" ]] && ask_secret W_PLATFORM_ADMIN_PASSWORD "플랫폼 관리자 임시 비밀번호"
  ask W_SIP_PORT "상담원 SIP 등록 포트 (UDP)" "48950"
  ask W_TRUNK_SIP_PORT "통신사 트렁크 포트 (비우면 상담원 포트 공용)" ""
  ask W_TRUNK_PEER_IP "통신사 SIP 서버 IP (방화벽 허용용, 모르면 비움)" ""
  ask W_LOCAL_NETS "사내 대역 (쉼표 구분)" "10.0.0.0/8,172.16.0.0/12,192.168.0.0/16"
  ask W_AGENT_DOWNLOADS "상담원 설치 파일 공개 다운로드 (true/false)" "true"
  ask W_BACKUP_CRON "매일 03:00 DB 백업 cron (true/false)" "true"
  ask W_FIREWALL "방화벽 (ufw/none)" "ufw"
  ask W_INSTALL_ROOT "저장소를 둘 경로" "/opt/kaster_cti"
  ask W_REPO_URL "저장소 URL (비우면 지금 이 체크아웃을 복사)" ""

  {
    echo "# install/install.sh --wizard 가 $(date -Iseconds) 에 만든 답안 파일"
    echo "SITE_CODE=$W_SITE_CODE"
    echo "TENANT_NAME=\"$W_TENANT_NAME\""
    echo "SITE_DOMAIN=$W_SITE_DOMAIN"
    echo "ADMIN_DOMAIN=$W_ADMIN_DOMAIN"
    echo "API_DOMAIN=$W_API_DOMAIN"
    echo "PUBLIC_SCHEME=$W_PUBLIC_SCHEME"
    echo "HTTP_PORT=$W_HTTP_PORT"
    echo "PUBLIC_IP=$W_PUBLIC_IP"
    echo "ADMIN_LOGIN=$W_ADMIN_LOGIN"
    echo "ADMIN_PASSWORD=\"$W_ADMIN_PASSWORD\""
    echo "ADMIN_EXTENSION=$W_ADMIN_EXTENSION"
    echo "PLATFORM_ADMIN_LOGIN=$W_PLATFORM_ADMIN_LOGIN"
    echo "PLATFORM_ADMIN_PASSWORD=\"${W_PLATFORM_ADMIN_PASSWORD:-}\""
    echo "SIP_PORT=$W_SIP_PORT"
    echo "TRUNK_SIP_PORT=$W_TRUNK_SIP_PORT"
    echo "TRUNK_PEER_IP=$W_TRUNK_PEER_IP"
    echo "RTP_PORT_RANGE=10000:20000"
    echo "LOCAL_NETS=$W_LOCAL_NETS"
    echo "SIP_SECURITY_PREPARE=true"
    echo "CID_LOGI_TCP_PORT=28002"
    echo "CID_ICON_TCP_PORT=28003"
    echo "CID_CALLMANOR_TCP_PORT=28004"
    echo "AGENT_DOWNLOADS=$W_AGENT_DOWNLOADS"
    echo "AGENT_DOWNLOADS_PORT=5175"
    echo "BACKUP_CRON=$W_BACKUP_CRON"
    echo "FIREWALL=$W_FIREWALL"
    echo "INSTALL_ROOT=$W_INSTALL_ROOT"
    echo "REPO_URL=$W_REPO_URL"
    echo "REPO_REF=main"
    echo "ALLOW_UNVERIFIED=false"
  } >"$out"
  chmod 0600 "$out"
  echo
  echo "저장했다: $out"
}
