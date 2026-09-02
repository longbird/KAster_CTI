import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = __dirname;
const WRAPPER = 'components/ResponsiveTable.tsx';

function tsxFiles(): [string, string][] {
  const out: [string, string][] = [];
  (function walk(dir: string) {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) {
        walk(p);
        continue;
      }
      if (extname(name) !== '.tsx' || name.includes('.test.')) continue;
      out.push([relative(SRC, p).replace(/\\/g, '/'), readFileSync(p, 'utf8')]);
    }
  })(SRC);
  return out;
}

const files = tsxFiles();

describe('모바일 목록', () => {
  // 원시 <Table> 은 md 이하에서 가로 스크롤로 남는다. 열이 오른쪽 고정까지 붙어 있어
  // 폰에서는 정작 내용이 안 보인다. ResponsiveTable 이 그 자리에서 카드로 바꾼다.
  it('ResponsiveTable 밖에서 antd Table 을 직접 그리지 않는다', () => {
    const offenders = files
      .filter(([name]) => name !== WRAPPER)
      .filter(([, text]) => /<Table(?=<|\s|\/|>)/.test(text))
      .map(([name]) => name);
    expect(offenders).toEqual([]);
  });

  // import 만 남아 있으면 다음 사람이 그대로 <Table> 을 쓴다.
  it('쓰지도 않는 antd Table 을 import 하지 않는다', () => {
    const offenders = files
      .filter(([name]) => name !== WRAPPER)
      .filter(([, text]) => {
        const imp = text.match(/import \{([^}]*)\} from 'antd';/s);
        if (!imp) return false;
        const names = imp[1].split(',').map((n) => n.trim());
        if (!names.includes('Table')) return false;
        return !/(?<![A-Za-z])Table(?![A-Za-z])/.test(text.replace(imp[0], ''));
      })
      .map(([name]) => name);
    expect(offenders).toEqual([]);
  });
});
