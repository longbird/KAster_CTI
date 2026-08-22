/**
 * 큐가 상담원에게 호를 넘기기 전에 수락/거절을 묻는 AGI.
 *
 * dialplan 이 `AGI(kaster-agent-offer.agi, <내선>, <타임아웃초>)` 로 부른다.
 * 서버에 롱폴을 걸어 상담원의 결정을 기다렸다가 `KASTER_OFFER_RESULT` 에
 * `ACCEPT` / `REJECT` / `TIMEOUT` 중 하나를 넣어 준다.
 *
 * **실패하면 ACCEPT 로 연다.** 서버가 죽었거나 네트워크가 막혔을 때 전부 거절로 처리하면
 * 콜센터가 통째로 멈춘다. 확인 절차가 고장난 것과 전화를 못 받는 것 중에서는 전자가 낫다.
 *
 * `System()` 이 아니라 AGI 인 이유: `SYSTEMSTATUS` 는 성공/실패 두 가지뿐이라
 * ACCEPT/REJECT/TIMEOUT 세 가지를 구분할 수 없다.
 */

import {
  DEFAULT_AGENT_OFFER_TIMEOUT_SECONDS,
  MAX_AGENT_OFFER_TIMEOUT_SECONDS,
  MIN_AGENT_OFFER_TIMEOUT_SECONDS,
} from '../../common/call-routing.constants';

/** AGI 가 서버에 붙을 때 쓰는 경로. 내부 전용이라 JWT 가 아니라 공유 시크릿을 쓴다. */
export const AGENT_OFFER_WAIT_PATH = '/api/v1/internal/agent-offer/wait';

export function buildAgentOfferAgiScript(httpPort: number, internalSecret: string | null): string {
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
    `PATH = ${JSON.stringify(AGENT_OFFER_WAIT_PATH)}`,
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
    'def set_result(value):',
    '    command(f"SET VARIABLE KASTER_OFFER_RESULT {value}")',
    '',
    'env = read_env()',
    'extension = env.get("agi_arg_1", "") or ""',
    // 서버가 받아주는 범위 밖이면 롱폴이 400 을 주고, 아래 except 가 ACCEPT 로 열어버린다.
    // 렌더러가 먼저 깎지만 서버를 부르기 직전인 여기서도 같은 범위로 묶는다.
    'try:',
    `    timeout = min(${MAX_AGENT_OFFER_TIMEOUT_SECONDS}, max(${MIN_AGENT_OFFER_TIMEOUT_SECONDS}, int(env.get("agi_arg_2", "${DEFAULT_AGENT_OFFER_TIMEOUT_SECONDS}") or "${DEFAULT_AGENT_OFFER_TIMEOUT_SECONDS}")))`,
    'except ValueError:',
    `    timeout = ${DEFAULT_AGENT_OFFER_TIMEOUT_SECONDS}`,
    '',
    'linkedid = get_var("CHANNEL(linkedid)")',
    'caller = get_var("CALLERID(num)")',
    '',
    '# 여기서 실패하면 무조건 ACCEPT 다. 확인 절차가 고장났다고 전화를 막으면 안 된다.',
    'result = "ACCEPT"',
    'if extension and linkedid:',
    '    payload = json.dumps({',
    '        "extension": extension,',
    '        "linkedid": linkedid,',
    '        "caller": caller,',
    '        "timeoutSeconds": timeout,',
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
    '        # 서버 롱폴보다 조금 더 기다린다. 우리가 먼저 끊으면 상담원이 수락을 눌렀는데도',
    '        # 결과를 못 받고 다음 사람에게 넘어간다.',
    '        with urllib.request.urlopen(request, timeout=timeout + 3) as response:',
    '            body = json.loads(response.read().decode("utf-8") or "{}")',
    '        decision = (body.get("data") or {}).get("decision") or body.get("decision")',
    '        if decision in ("ACCEPT", "REJECT", "TIMEOUT"):',
    '            result = decision',
    '    except Exception:',
    '        result = "ACCEPT"',
    '',
    'set_result(result)',
    '',
  ].join('\n');
}
