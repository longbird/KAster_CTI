export interface RenderedConfFiles {
  pjsip: string;
  rtp: string;
  extensionsInbound: string;
  extensionsQueue: string;
  extensionsAgent: string;
  queues: string;
}

export interface ConfigValidationCheck {
  name: string;
  status: 'pass' | 'fail';
  detail: string;
}

export interface ConfigValidationResult {
  ok: boolean;
  checks: ConfigValidationCheck[];
}

export interface ConfigDiffSummary {
  fileName: string;
  status: 'changed' | 'unchanged' | 'missing-current';
  addedLines: number;
  removedLines: number;
}

export const RENDERED_CONF_FILE_NAMES: Array<{
  key: keyof RenderedConfFiles;
  fileName: string;
  requiredContext?: string;
  /**
   * dialplan 파일은 Asterisk 변수를 정상적으로 담는다 (예: EXTEN, CALLERID).
   * 그걸 "미해결 placeholder" 로 잡으면 세 파일이 영원히 검증 실패가 되고,
   * 그 패널은 아무도 안 보게 된다. 반대로 pjsip·rtp·queues 에 남아 있으면
   * 렌더가 덜 된 것이므로 계속 잡는다.
   */
  allowsDialplanVariables?: boolean;
}> = [
  { key: 'pjsip', fileName: 'pjsip.conf', requiredContext: 'global' },
  { key: 'rtp', fileName: 'rtp.conf', requiredContext: 'general' },
  { key: 'extensionsInbound', fileName: 'extensions_inbound.conf', requiredContext: 'inbound-main', allowsDialplanVariables: true },
  { key: 'extensionsQueue', fileName: 'extensions_queue.conf', requiredContext: 'queue-entry', allowsDialplanVariables: true },
  { key: 'extensionsAgent', fileName: 'extensions_agent.conf', requiredContext: 'from-queue', allowsDialplanVariables: true },
  { key: 'queues', fileName: 'queues.conf' },
];

function pass(name: string, detail: string): ConfigValidationCheck {
  return { name, status: 'pass', detail };
}

function fail(name: string, detail: string): ConfigValidationCheck {
  return { name, status: 'fail', detail };
}

function countLines(content: string): number {
  if (!content) return 0;
  return content.split(/\r?\n/).filter((line) => line.length > 0).length;
}

function normalizeLines(content: string): string[] {
  return content.replace(/\r\n/g, '\n').split('\n');
}

export function validateRenderedConfFiles(files: RenderedConfFiles): ConfigValidationResult {
  const checks: ConfigValidationCheck[] = [];

  for (const item of RENDERED_CONF_FILE_NAMES) {
    const content = files[item.key] ?? '';
    const displayName = item.fileName;

    checks.push(
      content.trim()
        ? pass(`${displayName} is not empty`, `Rendered ${countLines(content)} non-empty lines.`)
        : fail(`${displayName} is not empty`, 'Rendered content is empty.'),
    );

    checks.push(
      item.allowsDialplanVariables
        ? pass(
            `${displayName} has no unresolved placeholders`,
            'Dialplan file — Asterisk variable syntax is expected here, so this check is skipped.',
          )
        : content.includes('${')
          ? fail(`${displayName} has no unresolved placeholders`, 'Found unresolved ${...} placeholder text.')
          : pass(`${displayName} has no unresolved placeholders`, 'No unresolved ${...} placeholder text found.'),
    );

    checks.push(
      content.includes('\0')
        ? fail(`${displayName} has no NUL bytes`, 'Found a NUL byte in rendered content.')
        : pass(`${displayName} has no NUL bytes`, 'No NUL bytes found.'),
    );

    if (item.requiredContext) {
      const expected = `[${item.requiredContext}]`;
      checks.push(
        content.includes(expected)
          ? pass(`${displayName} contains ${expected}`, `Required context ${expected} is present.`)
          : fail(`${displayName} contains ${expected}`, `Required context ${expected} was not rendered.`),
      );
    }
  }

  return {
    ok: checks.every((check) => check.status === 'pass'),
    checks,
  };
}

export function diffRenderedConfFiles(
  rendered: RenderedConfFiles,
  currentFiles: Partial<Record<string, string>>,
): ConfigDiffSummary[] {
  return RENDERED_CONF_FILE_NAMES.map(({ key, fileName }) => {
    const nextLines = normalizeLines(rendered[key] ?? '');
    const current = currentFiles[fileName];

    if (current === undefined) {
      return {
        fileName,
        status: 'missing-current',
        addedLines: countLines(rendered[key] ?? ''),
        removedLines: 0,
      };
    }

    if (current.replace(/\r\n/g, '\n') === (rendered[key] ?? '').replace(/\r\n/g, '\n')) {
      return { fileName, status: 'unchanged', addedLines: 0, removedLines: 0 };
    }

    const currentLineSet = new Map<string, number>();
    normalizeLines(current).forEach((line) => {
      currentLineSet.set(line, (currentLineSet.get(line) ?? 0) + 1);
    });

    let addedLines = 0;
    for (const line of nextLines) {
      const count = currentLineSet.get(line) ?? 0;
      if (count > 0) {
        currentLineSet.set(line, count - 1);
      } else if (line.length > 0) {
        addedLines += 1;
      }
    }

    const renderedLineSet = new Map<string, number>();
    nextLines.forEach((line) => {
      renderedLineSet.set(line, (renderedLineSet.get(line) ?? 0) + 1);
    });

    let removedLines = 0;
    for (const line of normalizeLines(current)) {
      const count = renderedLineSet.get(line) ?? 0;
      if (count > 0) {
        renderedLineSet.set(line, count - 1);
      } else if (line.length > 0) {
        removedLines += 1;
      }
    }

    return { fileName, status: 'changed', addedLines, removedLines };
  });
}
