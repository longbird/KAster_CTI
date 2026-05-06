import crypto from "node:crypto";
import dgram from "node:dgram";
import os from "node:os";
import { writeFileSync } from "node:fs";

const config = JSON.parse(process.env.KASTER_SIP_UAS_CONFIG || "{}");
const startedAt = new Date().toISOString();
const events = [];
const errors = [];
const toTags = new Map();
let registered = false;
let inviteSeen = false;
let ackSeen = false;
let byeSeen = false;
let completed = false;
let registerCseq = 1;

function record(type, payload = {}) {
  const event = { type, at: new Date().toISOString(), ...payload };
  events.push(event);
  if (type === "REGISTER_OK") console.log("REGISTER_OK");
  if (type === "INVITE_IN") console.log(`INVITE_IN from=${payload.from || ""}`);
  if (type === "INVITE_ANSWERED_200") console.log("INVITE_ANSWERED_200");
  if (type === "ACK_IN") console.log("ACK_IN");
  if (type === "BYE_IN") console.log("BYE_IN");
  writeResult();
}

function currentResult(extra = {}) {
  return {
    startedAt,
    endedAt: new Date().toISOString(),
    registered,
    inviteSeen,
    ackSeen,
    byeSeen,
    completed,
    extension: config.extension,
    hostAddress: config.hostAddress,
    port: config.port,
    events,
    errors,
    ...extra,
  };
}

function writeResult(extra = {}) {
  if (!config.outFile) return;
  try {
    writeFileSync(config.outFile, JSON.stringify(currentResult(extra), null, 2));
  } catch (error) {
    errors.push({ at: new Date().toISOString(), message: error instanceof Error ? error.message : String(error) });
  }
}

function localAddress() {
  if (config.contactHost) return config.contactHost;
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && !entry.internal) return entry.address;
    }
  }
  return "127.0.0.1";
}

function token(prefix) {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

function md5(value) {
  return crypto.createHash("md5").update(value).digest("hex");
}

function parseMessage(raw) {
  const [head, body = ""] = raw.split(/\r\n\r\n/);
  const lines = head.split(/\r\n/);
  const firstLine = lines.shift() ?? "";
  const headers = {};
  for (const line of lines) {
    const index = line.indexOf(":");
    if (index > 0) {
      const key = line.slice(0, index).toLowerCase();
      const value = line.slice(index + 1).trim();
      headers[key] = headers[key] ? `${headers[key]}, ${value}` : value;
    }
  }
  return { firstLine, headers, body };
}

function headerParam(value, name) {
  const match = value?.match(new RegExp(`${name}="?([^",]+)"?`, "i"));
  return match?.[1] || "";
}

function parseDigestChallenge(header) {
  const value = header?.replace(/^Digest\s+/i, "") || "";
  return {
    realm: headerParam(value, "realm"),
    nonce: headerParam(value, "nonce"),
    qop: headerParam(value, "qop").split(",")[0],
    opaque: headerParam(value, "opaque"),
    algorithm: headerParam(value, "algorithm") || "MD5",
  };
}

function digestAuthorization({ method, uri, challenge, username, password, nc, cnonce }) {
  const ha1 = md5(`${username}:${challenge.realm}:${password}`);
  const ha2 = md5(`${method}:${uri}`);
  const response = challenge.qop
    ? md5(`${ha1}:${challenge.nonce}:${nc}:${cnonce}:${challenge.qop}:${ha2}`)
    : md5(`${ha1}:${challenge.nonce}:${ha2}`);
  const parts = [
    `Digest username="${username}"`,
    `realm="${challenge.realm}"`,
    `nonce="${challenge.nonce}"`,
    `uri="${uri}"`,
    `response="${response}"`,
    `algorithm=${challenge.algorithm}`,
  ];
  if (challenge.opaque) parts.push(`opaque="${challenge.opaque}"`);
  if (challenge.qop) {
    parts.push(`qop=${challenge.qop}`);
    parts.push(`nc=${nc}`);
    parts.push(`cnonce="${cnonce}"`);
  }
  return parts.join(", ");
}

function toHeaderFor(request) {
  const callId = request.headers["call-id"] || token("call");
  const base = request.headers.to || `<sip:${config.extension}@${config.domain}>`;
  if (/;tag=/i.test(base)) return base;
  if (!toTags.has(callId)) toTags.set(callId, token("to"));
  return `${base};tag=${toTags.get(callId)}`;
}

async function main() {
  const contactHost = localAddress();
  const socket = dgram.createSocket("udp4");
  const localPort = await new Promise((resolve) => {
    socket.bind(Number(config.localPort || 0), "0.0.0.0", () => resolve(socket.address().port));
  });

  const callId = `${token("reg")}@${contactHost}`;
  const fromTag = token("from");
  const registerUri = `sip:${config.domain}:${config.port}`;
  const contact = `<sip:${config.extension}@${contactHost}:${localPort}>`;

  function send(payload, port = config.port, host = config.hostAddress) {
    socket.send(Buffer.from(payload), port, host);
  }

  function registerRequest(authorization) {
    const headers = [
      `REGISTER ${registerUri} SIP/2.0`,
      `Via: SIP/2.0/UDP ${contactHost}:${localPort};branch=z9hG4bK-${token("reg")};rport`,
      "Max-Forwards: 70",
      `From: <sip:${config.extension}@${config.domain}>;tag=${fromTag}`,
      `To: <sip:${config.extension}@${config.domain}>`,
      `Call-ID: ${callId}`,
      `CSeq: ${registerCseq++} REGISTER`,
      `Contact: ${contact};expires=300`,
      "Expires: 300",
      "User-Agent: kaster-smoke-sip-uas",
    ];
    if (authorization) headers.push(`Authorization: ${authorization}`);
    headers.push("Content-Length: 0", "", "");
    return headers.join("\r\n");
  }

  function response(statusLine, request, body = "") {
    const headers = [
      `SIP/2.0 ${statusLine}`,
      request.headers.via ? `Via: ${request.headers.via}` : null,
      request.headers.from ? `From: ${request.headers.from}` : null,
      `To: ${toHeaderFor(request)}`,
      request.headers["call-id"] ? `Call-ID: ${request.headers["call-id"]}` : null,
      request.headers.cseq ? `CSeq: ${request.headers.cseq}` : null,
      `Contact: ${contact}`,
      "Server: kaster-smoke-sip-uas",
    ].filter(Boolean);
    if (body) {
      headers.push("Content-Type: application/sdp", `Content-Length: ${Buffer.byteLength(body)}`, "", body);
    } else {
      headers.push("Content-Length: 0", "", "");
    }
    return headers.join("\r\n");
  }

  function sdp() {
    return [
      "v=0",
      `o=- ${Date.now()} ${Date.now()} IN IP4 ${contactHost}`,
      "s=kaster-smoke-sip-uas",
      `c=IN IP4 ${contactHost}`,
      "t=0 0",
      "m=audio 9 RTP/AVP 0 8 101",
      "a=rtpmap:0 PCMU/8000",
      "a=rtpmap:8 PCMA/8000",
      "a=rtpmap:101 telephone-event/8000",
      "a=fmtp:101 0-16",
      "a=sendrecv",
      "",
    ].join("\r\n");
  }

  socket.on("message", (msg, rinfo) => {
    const parsed = parseMessage(msg.toString("utf8"));
    const first = parsed.firstLine;

    if (first.startsWith("SIP/2.0")) {
      const status = Number(first.split(" ")[1]);
      if (parsed.headers.cseq?.includes("REGISTER") && status === 401) {
        const challenge = parseDigestChallenge(parsed.headers["www-authenticate"]);
        const authorization = digestAuthorization({
          method: "REGISTER",
          uri: registerUri,
          challenge,
          username: config.extension,
          password: config.password,
          nc: "00000001",
          cnonce: token("cnonce"),
        });
        send(registerRequest(authorization));
      } else if (parsed.headers.cseq?.includes("REGISTER") && status >= 200 && status < 300) {
        registered = true;
        record("REGISTER_OK", { local: `${contactHost}:${localPort}` });
      }
      return;
    }

    const method = first.split(" ")[0];
    if (method === "OPTIONS") {
      send(response("200 OK", parsed), rinfo.port, rinfo.address);
      return;
    }
    if (method === "INVITE") {
      inviteSeen = true;
      record("INVITE_IN", { from: `${rinfo.address}:${rinfo.port}` });
      send(response("100 Trying", parsed), rinfo.port, rinfo.address);
      send(response("180 Ringing", parsed), rinfo.port, rinfo.address);
      send(response("200 OK", parsed, sdp()), rinfo.port, rinfo.address);
      record("INVITE_ANSWERED_200");
      return;
    }
    if (method === "ACK") {
      ackSeen = true;
      record("ACK_IN");
      if (Number.isFinite(Number(config.exitAfterAckMs))) {
        setTimeout(() => {
          completed = true;
        }, Math.max(0, Number(config.exitAfterAckMs)));
      }
      return;
    }
    if (method === "BYE") {
      byeSeen = true;
      record("BYE_IN");
      send(response("200 OK", parsed), rinfo.port, rinfo.address);
      completed = true;
      return;
    }
    if (method === "CANCEL") {
      send(response("200 OK", parsed), rinfo.port, rinfo.address);
      completed = true;
    }
  });

  send(registerRequest());
  writeResult({ contactHost });
  const started = Date.now();
  await new Promise((resolve) => {
    const timer = setInterval(() => {
      if (completed) {
        clearInterval(timer);
        resolve();
      } else if (Date.now() - started > Number(config.maxSeconds || 90) * 1000) {
        clearInterval(timer);
        resolve();
      }
    }, 200);
  });

  socket.close();
  const result = currentResult({ contactHost });
  writeResult({ contactHost });
  console.log(`SIP_UAS_RESULT ${JSON.stringify(result)}`);
  if (!registered || !inviteSeen || !ackSeen) process.exit(2);
}

process.on("SIGTERM", () => {
  errors.push({ at: new Date().toISOString(), message: "SIGTERM" });
  writeResult();
  process.exit(143);
});

process.on("SIGINT", () => {
  errors.push({ at: new Date().toISOString(), message: "SIGINT" });
  writeResult();
  process.exit(130);
});

main().catch((error) => {
  errors.push({ at: new Date().toISOString(), message: error instanceof Error ? error.message : String(error) });
  writeResult();
  console.error(error.stack || error.message);
  process.exit(1);
});
