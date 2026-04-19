import { ControlPanel } from './ControlPanel';
import { CurrentCallPanel } from './CurrentCallPanel';
import type { ActiveCall } from '../types/cti';

interface Props {
  call?: ActiveCall;
  holdEnabled?: boolean;
  minimized: boolean;
  onMinimize: () => void;
  onRestore: () => void;
  onPickup: () => Promise<void>;
  onToggleMute: () => Promise<void>;
  onToggleHold: () => Promise<void>;
  onHangup: () => Promise<void>;
  onSaveMemo: (memo: string, resultCode: string) => Promise<void>;
  onTransfer: (target: string, mode?: 'blind' | 'attended') => Promise<void>;
  onCancelAttendedTransfer: () => Promise<void>;
  onCompleteAttendedTransfer: () => Promise<void>;
}

export function FloatingCallWindow({
  call,
  holdEnabled = false,
  minimized,
  onMinimize,
  onRestore,
  onPickup,
  onToggleMute,
  onToggleHold,
  onHangup,
  onSaveMemo,
  onTransfer,
  onCancelAttendedTransfer,
  onCompleteAttendedTransfer,
}: Props) {
  if (!call) return null;

  if (minimized) {
    return (
      <button
        type="button"
        onClick={onRestore}
        className="fixed bottom-20 right-4 z-[70] flex items-center gap-3 rounded-full bg-primary px-5 py-3 text-left text-white shadow-2xl shadow-primary/30 transition-all hover:translate-y-[-1px] active:scale-95 md:bottom-6 md:right-6"
      >
        <span className="material-symbols-outlined">call</span>
        <span>
          <span className="block text-[10px] font-bold uppercase tracking-widest text-blue-100">
            현재 통화
          </span>
          <span className="block text-sm font-bold">
            {call.customer?.customerName ?? call.ani ?? '미식별 고객'}
          </span>
        </span>
      </button>
    );
  }

  return (
    <aside className="fixed right-4 top-20 z-[70] w-[min(560px,calc(100vw-2rem))] rounded-[28px] border border-white/70 bg-white/95 p-4 shadow-2xl shadow-slate-900/15 backdrop-blur md:right-6 md:top-24">
      <div className="mb-4 flex items-center justify-between gap-3 px-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-slate-400">
            Live Call Popup
          </p>
          <h3 className="font-headline text-lg font-bold text-slate-950">통화 제어 팝업</h3>
        </div>
        <button
          type="button"
          onClick={onMinimize}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition-all hover:bg-slate-200 active:scale-95"
          title="팝업 최소화"
        >
          <span className="material-symbols-outlined">remove</span>
        </button>
      </div>

      <div className="max-h-[calc(100vh-14rem)] space-y-4 overflow-y-auto pr-1 md:max-h-[calc(100vh-8rem)]">
        <CurrentCallPanel
          call={call}
          holdEnabled={holdEnabled}
          onPickup={onPickup}
          onToggleMute={onToggleMute}
          onToggleHold={onToggleHold}
          onHangup={onHangup}
        />
        <ControlPanel
          call={call}
          onSaveMemo={onSaveMemo}
          onTransfer={onTransfer}
          onCancelAttendedTransfer={onCancelAttendedTransfer}
          onCompleteAttendedTransfer={onCompleteAttendedTransfer}
          onHangup={onHangup}
        />
      </div>
    </aside>
  );
}
