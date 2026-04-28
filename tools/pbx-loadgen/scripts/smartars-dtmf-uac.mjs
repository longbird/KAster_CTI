import dgram from 'node:dgram';
import os from 'node:os';

const host = process.env.SMARTARS_HOST ?? '49.247.46.86';
const sipPort = Number(process.env.SMARTARS_PORT ?? '36070');
const did = process.env.SMARTARS_DID ?? '07052346380';
const caller = process.env.SMARTARS_CALLER ?? '01011112222';
const digit = process.env.SMARTARS_DTMF ?? '1';
const sequence = process.env.SMARTARS_DTMF_SEQUENCE;
const digitGapMs = Number(process.env.SMARTARS_DTMF_GAP_MS ?? '250');
const holdMs = Number(process.env.SMARTARS_HOLD_MS ?? '6000');
const dtmfDelayMs = Number(process.env.SMARTARS_DTMF_DELAY_MS ?? '1500');
const rtpHostOverride = process.env.SMARTARS_RTP_HOST;

function localAddress() {
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === 'IPv4' && !entry.internal) return entry.address;
    }
  }
  return '127.0.0.1';
}

function randomToken(prefix) {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

function parseHeaders(message) {
  const [head, body = ''] = message.split(/\r\n\r\n/);
  const lines = head.split(/\r\n/);
  const firstLine = lines.shift() ?? '';
  const headers = {};
  for (const line of lines) {
    const idx = line.indexOf(':');
    if (idx > 0) headers[line.slice(0, idx).toLowerCase()] = line.slice(idx + 1).trim();
  }
  return { firstLine, headers, body };
}

function parseSdp(sdp) {
  const connection = sdp.match(/^c=IN IP4 ([^\r\n]+)/m)?.[1];
  const media = sdp.match(/^m=audio (\d+) RTP\/AVP ([^\r\n]+)/m);
  const ptMatch = sdp.match(/^a=rtpmap:(\d+) telephone-event\/8000/im);
  return {
    address: connection,
    port: media ? Number(media[1]) : 0,
    telephoneEventPt: ptMatch ? Number(ptMatch[1]) : 101,
  };
}

function digitCode(value) {
  if (/^[0-9]$/.test(value)) return Number(value);
  if (value === '*') return 10;
  if (value === '#') return 11;
  throw new Error(`unsupported DTMF digit: ${value}`);
}

function parseDtmfSequence() {
  if (!sequence?.trim()) {
    return [{ digit, delayBeforeMs: dtmfDelayMs }];
  }

  return sequence
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean)
    .map((token, index) => {
      const [value, delayRaw] = token.split('@');
      const delayBeforeMs = delayRaw === undefined
        ? (index === 0 ? dtmfDelayMs : digitGapMs)
        : Number(delayRaw);
      return {
        digit: value,
        delayBeforeMs: Number.isFinite(delayBeforeMs) ? Math.max(0, delayBeforeMs) : digitGapMs,
      };
    });
}

function rtpPacket({ pt, seq, timestamp, ssrc, marker, event, end, duration }) {
  const packet = Buffer.alloc(16);
  packet[0] = 0x80;
  packet[1] = (marker ? 0x80 : 0) | (pt & 0x7f);
  packet.writeUInt16BE(seq & 0xffff, 2);
  packet.writeUInt32BE(timestamp >>> 0, 4);
  packet.writeUInt32BE(ssrc >>> 0, 8);
  packet[12] = event;
  packet[13] = (end ? 0x80 : 0) | 10;
  packet.writeUInt16BE(duration & 0xffff, 14);
  return packet;
}

async function main() {
  const localIp = localAddress();
  const sip = dgram.createSocket('udp4');
  const rtp = dgram.createSocket('udp4');
  const callId = `${randomToken('call')}@${localIp}`;
  const fromTag = randomToken('tag');
  const branch = `z9hG4bK-${randomToken('branch')}`;
  const localSipPort = await new Promise((resolve) => {
    sip.bind(0, '0.0.0.0', () => resolve(sip.address().port));
  });
  const localRtpPort = await new Promise((resolve) => {
    rtp.bind(0, '0.0.0.0', () => resolve(rtp.address().port));
  });

  let toHeader = `<sip:${did}@${host}>`;
  let inviteOk = false;
  let completed = false;
  let remoteRtp = null;
  let cseq = 1;

  const sendSip = (payload) => sip.send(Buffer.from(payload), sipPort, host);
  const request = (method, extra = '') => [
    `${method} sip:${did}@${host}:${sipPort} SIP/2.0`,
    `Via: SIP/2.0/UDP ${localIp}:${localSipPort};branch=${method === 'INVITE' ? branch : `z9hG4bK-${randomToken('branch')}`};rport`,
    'Max-Forwards: 70',
    `From: <sip:${caller}@${localIp}>;tag=${fromTag}`,
    `To: ${toHeader}`,
    `Call-ID: ${callId}`,
    `CSeq: ${cseq++} ${method}`,
    `Contact: <sip:${caller}@${localIp}:${localSipPort}>`,
    'User-Agent: kaster-smartars-dtmf-uac',
    extra,
  ].filter(Boolean).join('\r\n');

  const sdp = [
    'v=0',
    `o=- ${Date.now()} ${Date.now()} IN IP4 ${localIp}`,
    's=kaster-smartars-dtmf-uac',
    `c=IN IP4 ${localIp}`,
    't=0 0',
    `m=audio ${localRtpPort} RTP/AVP 0 8 101`,
    'a=rtpmap:0 PCMU/8000',
    'a=rtpmap:8 PCMA/8000',
    'a=rtpmap:101 telephone-event/8000',
    'a=fmtp:101 0-16',
    'a=sendrecv',
    '',
  ].join('\r\n');

  const invite = request('INVITE', [
    'Allow: INVITE, ACK, BYE, CANCEL, OPTIONS',
    'Supported: replaces, timer',
    'Content-Type: application/sdp',
    `Content-Length: ${Buffer.byteLength(sdp)}`,
    '',
    sdp,
  ].join('\r\n'));

  sip.on('message', (msg) => {
    const parsed = parseHeaders(msg.toString('utf8'));
    if (!parsed.firstLine.startsWith('SIP/2.0')) return;
    const status = Number(parsed.firstLine.split(' ')[1]);
    if (status >= 200 && status < 300 && parsed.headers.cseq?.includes('INVITE')) {
      inviteOk = true;
      toHeader = parsed.headers.to;
  remoteRtp = parseSdp(parsed.body);
      if (rtpHostOverride) {
        remoteRtp.address = rtpHostOverride;
      }
      const ack = [
        `ACK sip:${did}@${host}:${sipPort} SIP/2.0`,
        `Via: SIP/2.0/UDP ${localIp}:${localSipPort};branch=${branch};rport`,
        'Max-Forwards: 70',
        `From: <sip:${caller}@${localIp}>;tag=${fromTag}`,
        `To: ${toHeader}`,
        `Call-ID: ${callId}`,
        'CSeq: 1 ACK',
        `Contact: <sip:${caller}@${localIp}:${localSipPort}>`,
        'Content-Length: 0',
        '',
        '',
      ].join('\r\n');
      sendSip(ack);
    }
  });

  sendSip(invite);

  await new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      if (inviteOk && remoteRtp?.address && remoteRtp.port) {
        clearInterval(timer);
        resolve();
      } else if (Date.now() - started > 12000) {
        clearInterval(timer);
        reject(new Error('INVITE was not answered with RTP SDP'));
      }
    }, 100);
  });

  const pt = remoteRtp.telephoneEventPt;
  const ssrc = Math.floor(Math.random() * 0xffffffff);
  let seq = Math.floor(Math.random() * 0xffff);
  let rtpTimestamp = Math.floor(Math.random() * 0xffffffff);

  const sentDigits = [];
  const sentEvents = [];
  const startedAt = Date.now();
  for (const item of parseDtmfSequence()) {
    await new Promise((resolve) => setTimeout(resolve, item.delayBeforeMs));

    const event = digitCode(item.digit);
    const sentAtMs = Date.now() - startedAt;
    rtpTimestamp = (rtpTimestamp + Math.max(1600, Math.trunc(item.delayBeforeMs * 8))) >>> 0;
    const timestamp = rtpTimestamp;
    for (const duration of [160, 320, 480, 640]) {
      rtp.send(rtpPacket({ pt, seq: seq++, timestamp, ssrc, marker: duration === 160, event, end: false, duration }), remoteRtp.port, remoteRtp.address);
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
    for (let i = 0; i < 3; i += 1) {
      rtp.send(rtpPacket({ pt, seq: seq++, timestamp, ssrc, marker: false, event, end: true, duration: 800 }), remoteRtp.port, remoteRtp.address);
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
    sentDigits.push(item.digit);
    sentEvents.push({ digit: item.digit, sentAtMs });
  }

  await new Promise((resolve) => setTimeout(resolve, Math.max(0, holdMs - (Date.now() - startedAt))));

  const bye = request('BYE', ['Content-Length: 0', '', ''].join('\r\n'));
  sendSip(bye);
  await new Promise((resolve) => setTimeout(resolve, 500));
  completed = true;
  sip.close();
  rtp.close();

  console.log(JSON.stringify({
    completed,
    callId,
    did,
    caller,
    digit: sequence ? sentDigits.join('') : digit,
    sentDigits,
    sentEvents,
    remoteRtp,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
