/**
 * ARS 플로우가 통화 중 외부 조회를 부를 때 쓰는 AGI.
 *
 * dialplan 이 `AGI(kaster-ars-http-lookup.agi, <endpointId>)` 로 부른다.
 * 서버에 물어보고 `ARS_LOOKUP_STATUS` 에 `MATCH`/`NOMATCH`/`ERROR`,
 * `ARS_LOOKUP_VALUE` 에 꺼낸 값을 넣어 준다.
 *
 * `System()` 이 아니라 AGI 인 이유: `SYSTEMSTATUS` 는 성공/실패 두 가지뿐이라 값을 되받을 수 없다.
 *
 * **실패하면 ERROR 다.** `agent-offer` AGI 는 실패 시 ACCEPT 로 열지만 여기는 반대다 —
 * 조회가 안 됐는데 됐다고 하면 엉뚱한 사람이 VIP 큐로 들어간다. 실패는 실패라고 말하고,
 * 통화는 플로우의 실패 갈래로 흐른다. 그 갈래는 검증기가 반드시 있게 한다.
 *
 * 인자를 하나(`endpointId`)만 받는 이유: 나머지 값은 AGI 가 채널에서 직접 읽는다.
 * dialplan 인자에 값이 늘수록 인용 규칙이 깨지기 쉽다.
 */

/** AGI 가 서버에 붙을 때 쓰는 경로. 내부 전용이라 JWT 가 아니라 공유 시크릿을 쓴다. */
export const ARS_HTTP_LOOKUP_PATH = '/api/v1/internal/ars-http-lookup';

/** 서버가 자체 상한(5초)을 갖고 있다. AGI 는 그보다 조금만 더 기다린다. */
const AGI_EXTRA_WAIT_SECONDS = 2;
const SERVER_MAX_TIMEOUT_SECONDS = 5;

export function buildArsHttpLookupAgiScript(httpPort: number, internalSecret: string | null): string {
  const secret = internalSecret ?? '';

  return [
    '#!/usr/bin/env python3',
    'import json',
    'import re',
    'import sys',
    'import urllib.error',
    'import urllib.request',
    '',
    `PORT = ${httpPort}`,
    `SECRET = ${JSON.stringify(secret)}`,
    `PATH = ${JSON.stringify(ARS_HTTP_LOOKUP_PATH)}`,
    `WAIT_SECONDS = ${SERVER_MAX_TIMEOUT_SECONDS + AGI_EXTRA_WAIT_SECONDS}`,
    '',
    'def read_env():',
    '    env = {}',
    '    for line in sys.stdin:',
    '        line = line.rstrip("\\n")',
    '        if line == "":',
    '            break',
    '        key, _, value = line.partition(":")',
    '        env[key.strip()] = value.strip()',
    '    return env',
    '',
    'def command(cmd):',
    '    sys.stdout.write(cmd + "\\n")',
    '    sys.stdout.flush()',
    '    return sys.stdin.readline().strip()',
    '',
    'def get_var(name):',
    '    line = command(f"GET VARIABLE {name}")',
    '    match = re.search(r"result=1 \\((.*)\\)", line or "")',
    '    return match.group(1) if match else ""',
    '',
    'def set_var(name, value):',
    '    command(f"SET VARIABLE {name} {value}")',
    '',
    'env = read_env()',
    'endpoint_id = env.get("agi_arg_1", "") or ""',
    '',
    '# 조회가 안 됐는데 됐다고 하면 엉뚱한 사람이 다른 큐로 들어간다. 기본값은 실패다.',
    'status = "ERROR"',
    'value = ""',
    '',
    'if endpoint_id:',
    '    payload = json.dumps({',
    '        "endpointId": endpoint_id,',
    '        "tenantId": get_var("SMART_ARS_TENANT_ID"),',
    '        "caller": get_var("CALLERID(num)"),',
    '        "collected": get_var("ARS_COLLECTED_DIGITS"),',
    '        "entryDid": get_var("ENTRY_DID"),',
    '        "linkedid": get_var("CHANNEL(linkedid)"),',
    '    }).encode("utf-8")',
    '    request = urllib.request.Request(',
    '        f"http://127.0.0.1:{PORT}{PATH}",',
    '        data=payload,',
    '        method="POST",',
    '        headers={',
    '            "Content-Type": "application/json",',
    '            "X-Kaster-Internal-Secret": SECRET,',
    '        },',
    '    )',
    '    try:',
    '        with urllib.request.urlopen(request, timeout=WAIT_SECONDS) as response:',
    '            body = json.loads(response.read().decode("utf-8") or "{}")',
    '        result = (body.get("data") or body)',
    '        if result.get("status") in ("MATCH", "NOMATCH", "ERROR"):',
    '            status = result["status"]',
    '            value = result.get("value") or ""',
    '    except Exception:',
    '        status = "ERROR"',
    '',
    '# 값은 서버가 이미 깎아서 준다. 그래도 채널에 넣기 전에 한 번 더 잘라낸다 —',
    '# 이 스크립트가 dialplan 변수를 직접 쓰는 마지막 지점이다.',
    'value = re.sub(r"[^0-9A-Za-z_.\\-\\uac00-\\ud7a3]", "", value)[:64]',
    '',
    'set_var("ARS_LOOKUP_STATUS", status)',
    'set_var("ARS_LOOKUP_VALUE", value)',
    '',
  ].join('\n');
}
