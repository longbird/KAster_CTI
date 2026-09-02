import { ARS_HTTP_LOOKUP_PATH, buildArsHttpLookupAgiScript } from './ars-http-lookup-agi';

const SCRIPT = buildArsHttpLookupAgiScript(3000, 'internal-secret-1');

describe('buildArsHttpLookupAgiScript', () => {
  it('python3 스크립트로 시작한다', () => {
    expect(SCRIPT.startsWith('#!/usr/bin/env python3')).toBe(true);
  });

  it('내부 시크릿을 헤더로 보낸다', () => {
    expect(SCRIPT).toContain('"X-Kaster-Internal-Secret": SECRET');
    expect(SCRIPT).toContain('SECRET = "internal-secret-1"');
  });

  it('서버 포트와 내부 경로를 박아 넣는다', () => {
    expect(SCRIPT).toContain('PORT = 3000');
    expect(SCRIPT).toContain(`PATH = ${JSON.stringify(ARS_HTTP_LOOKUP_PATH)}`);
  });

  it('시크릿이 없어도 스크립트는 만들어진다 — 부팅을 막지 않는다', () => {
    expect(buildArsHttpLookupAgiScript(3000, null)).toContain('SECRET = ""');
  });

  it('실패의 기본값이 ERROR 다 — 조회가 안 됐는데 됐다고 하면 안 된다', () => {
    expect(SCRIPT).toContain('status = "ERROR"');
    expect(SCRIPT).not.toContain('status = "MATCH"');
  });

  it('인자는 엔드포인트 하나만 받고 나머지는 채널에서 읽는다', () => {
    expect(SCRIPT).toContain('env.get("agi_arg_1", "")');
    expect(SCRIPT).not.toContain('agi_arg_2');
    for (const variable of ['SMART_ARS_TENANT_ID', 'ARS_COLLECTED_DIGITS', 'ENTRY_DID', 'CHANNEL(linkedid)']) {
      expect(SCRIPT).toContain(`get_var("${variable}")`);
    }
  });

  it('결과를 두 채널 변수에 넣는다', () => {
    expect(SCRIPT).toContain('set_var("ARS_LOOKUP_STATUS", status)');
    expect(SCRIPT).toContain('set_var("ARS_LOOKUP_VALUE", value)');
  });

  it('채널에 넣기 전에 값을 한 번 더 깎는다 — dialplan 변수를 쓰는 마지막 지점이다', () => {
    expect(SCRIPT).toMatch(/re\.sub\(r"\[\^[^"]+\]", "", value\)\[:64\]/);
  });

  it('서버 상한보다 조금만 더 기다린다', () => {
    expect(SCRIPT).toContain('WAIT_SECONDS = 7');
  });

  it('모르는 status 는 받아들이지 않는다', () => {
    expect(SCRIPT).toContain('if result.get("status") in ("MATCH", "NOMATCH", "ERROR"):');
  });
});
