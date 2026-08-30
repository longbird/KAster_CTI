/**
 * KAster 캡처 에이전트.
 *
 * 왜 별도 컨테이너인가:
 * server 컨테이너는 자체 네트워크 네임스페이스에 있어서, 그 안에서 dumpcap 을 띄워도
 * 호스트의 SIP(:36070/:48950)·RTP(10000-20000)가 보이지 않는다. 캡처하려면
 * network_mode: host 가 필요한데, server 를 host 네트워크로 옮기면 postgres/redis
 * 서비스명 DNS 와 ports 매핑이 깨진다. 그래서 host 네트워크와 NET_RAW 는 이 작은
 * 프로세스에만 준다.
 *
 * 통신은 공유 볼륨의 유닉스 소켓으로만 한다. 포트를 열지 않으므로 네트워크 노출이 없다.
 *
 * 의존성을 두지 않는다. 이 프로세스가 이 시스템에서 유일하게 NET_RAW 를 가지므로
 * 공급망 표면을 최소로 유지한다.
 */
import { createServer } from 'node:http';
import { spawn, execFile } from 'node:child_process';
import { timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';

const SOCKET_PATH = process.env.CAPTURE_AGENT_SOCKET || '/var/run/kaster/capture.sock';
const SECRET = process.env.KASTER_INTERNAL_SECRET || '';
const DUMPCAP = process.env.PACKET_CAPTURE_DUMPCAP_PATH || '/usr/bin/dumpcap';
const STORAGE_ROOT = resolve(process.env.PACKET_CAPTURE_STORAGE_ROOT || '/var/spool/kaster/packet-capture');
const MAX_FILE_MB = Number(process.env.PACKET_CAPTURE_MAX_FILE_MB || '500');

if (!SECRET) {
  console.error('KASTER_INTERNAL_SECRET 이 필요합니다');
  process.exit(1);
}

/**
 * 입력 규칙은 서버의 capture-filter.util.ts 와 같다.
 * 권한을 가진 쪽에서 한 번 더 검사한다 — 호출자를 신뢰하지 않는다.
 */
const ALLOWED_FILTER = /^[A-Za-z0-9 .:_\-/()[\],]*$/;
const CONTROL_CHARS = /[\x00-\x1f\x7f]/;
const INTERFACE_NAME = /^[A-Za-z0-9_.:-]{1,64}$/;
const MAX_FILTER_LENGTH = 512;

/** 동시에 하나만 돈다. */
let current = null;
let lastResult = null;

function assertValidRequest({ interfaceName, captureFilter, durationSeconds, outputPath }) {
  if (!INTERFACE_NAME.test(interfaceName || '')) {
    throw new Error('인터페이스 이름 형식이 올바르지 않습니다');
  }

  const filter = captureFilter || '';
  if (CONTROL_CHARS.test(filter)) throw new Error('캡처 필터에 제어 문자가 있습니다');
  if (filter.length > MAX_FILTER_LENGTH) throw new Error('캡처 필터가 너무 깁니다');
  if (!ALLOWED_FILTER.test(filter)) throw new Error('캡처 필터에 허용되지 않는 문자가 있습니다');
  if (filter.startsWith('-')) throw new Error('캡처 필터는 - 로 시작할 수 없습니다');

  if (!Number.isInteger(durationSeconds) || durationSeconds < 5 || durationSeconds > 3600) {
    throw new Error('캡처 시간이 허용 범위를 벗어났습니다');
  }

  // 출력 경로는 서버가 만들지만, 권한을 가진 쪽에서 저장소 밖으로 나가지 않는지 확인한다.
  const target = resolve(outputPath || '');
  if (target !== STORAGE_ROOT && !target.startsWith(STORAGE_ROOT + sep)) {
    throw new Error('출력 경로가 캡처 저장소 밖입니다');
  }
  return target;
}

function runDumpcap(target, { interfaceName, captureFilter, durationSeconds }, jobId) {
  const args = [
    '-i', interfaceName,
    '-p',
    '-w', target,
    '-a', `duration:${durationSeconds}`,
    '-a', `filesize:${MAX_FILE_MB * 1024}`,
  ];
  if (captureFilter) args.push('-f', captureFilter);

  mkdirSync(dirname(target), { recursive: true });
  const child = spawn(DUMPCAP, args, { stdio: ['ignore', 'ignore', 'pipe'] });

  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr = (stderr + chunk.toString()).slice(-4000);
  });

  child.on('error', (error) => {
    lastResult = { jobId, exitCode: null, packetCount: null, stderr: error.message };
    current = null;
  });
  child.on('close', (exitCode) => {
    const matched = /Packets captured:\s*(\d+)/i.exec(stderr);
    lastResult = {
      jobId,
      exitCode,
      packetCount: matched ? Number(matched[1]) : null,
      stderr,
    };
    current = null;
  });

  return child;
}

const routes = {
  'GET /status': async () => ({
    available: existsSync(DUMPCAP),
    running: current ? { jobId: current.jobId, startedAt: current.startedAt } : null,
    lastResult,
  }),

  'GET /interfaces': async () =>
    new Promise((resolveResult) => {
      execFile(DUMPCAP, ['-D'], { timeout: 5000 }, (error, stdout) => {
        if (error) return resolveResult({ interfaces: [] });
        const interfaces = String(stdout)
          .split(/\r?\n/)
          .map((line) => /^\s*\d+\.\s*([^\s(]+)/.exec(line)?.[1])
          .filter(Boolean);
        resolveResult({ interfaces });
      });
    }),

  'POST /start': async (body) => {
    if (current) throw new Error('이미 실행 중인 캡처가 있습니다');
    const target = assertValidRequest(body);
    const child = runDumpcap(target, body, body.jobId);
    current = { jobId: body.jobId, child, startedAt: new Date().toISOString() };
    return { started: true, jobId: body.jobId };
  },

  'POST /stop': async (body) => {
    if (!current || current.jobId !== body.jobId) {
      throw new Error('해당 작업이 실행 중이 아닙니다');
    }
    current.child.kill('SIGTERM');
    return { stopped: true, jobId: body.jobId };
  },
};

function authorized(req) {
  const provided = Buffer.from(req.headers['x-kaster-internal-secret'] || '');
  const expected = Buffer.from(SECRET);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 64 * 1024) throw new Error('요청 본문이 너무 큽니다');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString());
}

const server = createServer(async (req, res) => {
  const send = (status, payload) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(payload));
  };

  if (!authorized(req)) return send(401, { error: 'unauthorized' });

  const handler = routes[`${req.method} ${req.url.split('?')[0]}`];
  if (!handler) return send(404, { error: 'not found' });

  try {
    send(200, await handler(await readJson(req)));
  } catch (error) {
    send(400, { error: error.message });
  }
});

// 컨테이너 재시작 시 남은 소켓 파일을 치운다.
mkdirSync(dirname(SOCKET_PATH), { recursive: true });
if (existsSync(SOCKET_PATH)) unlinkSync(SOCKET_PATH);

server.listen(SOCKET_PATH, () => {
  console.log(`capture-agent listening on ${SOCKET_PATH} (dumpcap=${DUMPCAP}, root=${STORAGE_ROOT})`);
});

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    if (current) current.child.kill('SIGTERM');
    server.close(() => process.exit(0));
  });
}
