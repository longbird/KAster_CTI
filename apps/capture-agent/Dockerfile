# 캡처 에이전트: 이 시스템에서 유일하게 NET_RAW 를 갖는 컨테이너.
# 의존성을 설치하지 않는다 (index.mjs 는 Node 표준 모듈만 쓴다).
FROM node:22-bookworm-slim

# wireshark-common 이 /usr/bin/dumpcap 를 제공한다.
# noninteractive 를 주지 않으면 debconf 가 비루트 캡처 허용 여부를 물어보며 빌드가 멈춘다.
# 여기서는 "아니오"(setcap 안 함)가 맞다 — 권한은 compose 의 cap_add 로 준다.
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update \
  && apt-get install -y --no-install-recommends wireshark-common \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY apps/capture-agent/index.mjs ./index.mjs

CMD ["node", "index.mjs"]
