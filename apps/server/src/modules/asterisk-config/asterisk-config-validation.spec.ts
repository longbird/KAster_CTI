import {
  diffRenderedConfFiles,
  validateRenderedConfFiles,
  type RenderedConfFiles,
} from './asterisk-config-validation';

const validFiles: RenderedConfFiles = {
  pjsip: '[global]\ntype=global\n\n[transport-udp]\ntype=transport\n',
  extensionsInbound: '[inbound-main]\nexten => 07012345678,1,NoOp(test)\n',
  extensionsQueue: '[queue-entry]\nexten => s,1,NoOp(queue)\n',
  extensionsAgent: '[from-queue]\nexten => 1001,1,NoOp(agent)\n',
  queues: '[sales]\nstrategy=ringall\n',
};

describe('asterisk config validation', () => {
  it('accepts a complete rendered PBX config set', () => {
    const result = validateRenderedConfFiles(validFiles);

    expect(result.ok).toBe(true);
    expect(result.checks.every((check) => check.status === 'pass')).toBe(true);
  });

  it('fails when a required context is missing from the rendered config', () => {
    const result = validateRenderedConfFiles({
      ...validFiles,
      extensionsQueue: '[other]\nexten => s,1,NoOp(other)\n',
    });

    expect(result.ok).toBe(false);
    expect(result.checks).toContainEqual({
      name: 'extensions_queue.conf contains [queue-entry]',
      status: 'fail',
      detail: 'Required context [queue-entry] was not rendered.',
    });
  });

  it('fails when a rendered file contains unresolved template placeholders', () => {
    const result = validateRenderedConfFiles({
      ...validFiles,
      pjsip: '[global]\ntype=global\npassword=${SECRET}\n',
    });

    expect(result.ok).toBe(false);
    expect(result.checks).toContainEqual({
      name: 'pjsip.conf has no unresolved placeholders',
      status: 'fail',
      detail: 'Found unresolved ${...} placeholder text.',
    });
  });

  it('summarizes changed, unchanged, and missing current files for preview diff', () => {
    const result = diffRenderedConfFiles(validFiles, {
      'pjsip.conf': validFiles.pjsip,
      'extensions_inbound.conf': '[inbound-main]\nexten => old,1,NoOp(old)\n',
    });

    expect(result).toEqual([
      {
        fileName: 'pjsip.conf',
        status: 'unchanged',
        addedLines: 0,
        removedLines: 0,
      },
      {
        fileName: 'extensions_inbound.conf',
        status: 'changed',
        addedLines: 1,
        removedLines: 1,
      },
      {
        fileName: 'extensions_queue.conf',
        status: 'missing-current',
        addedLines: 2,
        removedLines: 0,
      },
      {
        fileName: 'extensions_agent.conf',
        status: 'missing-current',
        addedLines: 2,
        removedLines: 0,
      },
      {
        fileName: 'queues.conf',
        status: 'missing-current',
        addedLines: 2,
        removedLines: 0,
      },
    ]);
  });
});
