import { useState } from 'react';
import type { DesktopTransferHotkeySlot } from '../../../shared/ipc';

const ALL_SLOTS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

export function TransferHotkeyEditor({
  slots,
  onSave,
}: {
  slots: DesktopTransferHotkeySlot[];
  onSave: (next: DesktopTransferHotkeySlot[]) => Promise<void> | void;
}) {
  const [draft, setDraft] = useState<Record<number, DesktopTransferHotkeySlot>>(() => {
    const map: Record<number, DesktopTransferHotkeySlot> = {};
    for (const slot of slots) {
      map[slot.slot] = slot;
    }
    return map;
  });

  const updateSlot = (slot: number, patch: Partial<DesktopTransferHotkeySlot>) => {
    const current = draft[slot] ?? { slot, label: '', target: '', mode: 'blind' as const };
    const next = { ...current, ...patch };
    setDraft({ ...draft, [slot]: next });
  };

  const removeSlot = (slot: number) => {
    const next = { ...draft };
    delete next[slot];
    setDraft(next);
    void onSave(Object.values(next));
  };

  const persist = () => {
    const list = Object.values(draft).filter((s) => s.target.trim().length > 0);
    void onSave(list);
  };

  return (
    <div className="hotkey-editor">
      {ALL_SLOTS.map((slot) => {
        const value = draft[slot];
        const filled = Boolean(value?.target);
        return (
          <div key={slot} className={`hotkey-row${filled ? ' hotkey-row--filled' : ''}`}>
            <span className="hotkey-row__index">{slot}</span>
            <input
              type="text"
              placeholder="라벨"
              value={value?.label ?? ''}
              onChange={(event) => updateSlot(slot, { label: event.target.value })}
              onBlur={persist}
              maxLength={20}
            />
            <input
              type="text"
              placeholder="내선/번호"
              value={value?.target ?? ''}
              onChange={(event) => updateSlot(slot, { target: event.target.value })}
              onBlur={persist}
              maxLength={32}
            />
            <select
              value={value?.mode ?? 'blind'}
              onChange={(event) => {
                updateSlot(slot, { mode: event.target.value as 'blind' | 'attended' });
                persist();
              }}
            >
              <option value="blind">바로</option>
              <option value="attended">상담</option>
            </select>
            <button
              type="button"
              className="secondary-button"
              onClick={() => removeSlot(slot)}
              disabled={!filled}
              aria-label={`슬롯 ${slot} 비우기`}
            >
              비우기
            </button>
          </div>
        );
      })}
    </div>
  );
}
