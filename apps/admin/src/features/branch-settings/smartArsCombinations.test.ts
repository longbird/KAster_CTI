import { describe, expect, it } from 'vitest';
import { buildSmartArsAvailableActionCombinations } from './BranchEditModal';

describe('buildSmartArsAvailableActionCombinations', () => {
  it('builds runnable Smart ARS combinations from available queue and prompt choices', () => {
    expect(buildSmartArsAvailableActionCombinations({
      queueIds: ['queue-1'],
      promptIds: ['prompt-1'],
    })).toEqual([
      { digit: '0', actionType: 'QUEUE_ROUTE', queueId: 'queue-1' },
      { digit: '1', actionType: 'OPT_OUT' },
      { digit: '2', actionType: 'PLAY_PROMPT', promptId: 'prompt-1' },
    ]);
  });

  it('omits actions that cannot run without required settings', () => {
    expect(buildSmartArsAvailableActionCombinations({
      queueIds: [],
      promptIds: [],
    })).toEqual([
      { digit: '0', actionType: 'OPT_OUT' },
    ]);
  });
});
