import { useEffect } from 'react';
import { EventTimeline } from './components/EventTimeline';
import { PairingScreen } from './components/PairingScreen';
import { SoftphoneShell } from './components/SoftphoneShell';
import { UpdateBanner } from './components/UpdateBanner';
import { useDesktopStore } from './store/useDesktopStore';

export default function App() {
  const {
    bootstrapped,
    pairing,
    agent,
    agentStatus,
    config,
    activeCall,
    events,
    updateState,
    initialize,
    pair,
    mute,
    hangup,
    toggleHold,
    prepareUpdate,
    applyPreparedUpdate,
  } = useDesktopStore();

  useEffect(() => {
    void initialize();
  }, [initialize]);

  if (!bootstrapped || !config || !agent) {
    return <PairingScreen busy={pairing} onSubmit={pair} />;
  }

  return (
    <main className="desktop-layout">
      <div className="desktop-main">
        {updateState ? (
          <UpdateBanner
            message={updateState.message}
            canApply={!activeCall || activeCall.sessionStatus === 'ENDED'}
            busy={Boolean(updateState.preparing || updateState.applying)}
            readyFileName={updateState.preparedFileName}
            onPrepare={prepareUpdate}
            onApply={applyPreparedUpdate}
          />
        ) : null}
        <SoftphoneShell
        config={config}
        agentName={agent.agentName}
        extension={agent.extension}
        agentStatus={agentStatus}
        activeCall={activeCall}
        onMute={mute}
        onHangup={hangup}
        onToggleHold={toggleHold}
      />
      </div>
      <EventTimeline events={events} />
    </main>
  );
}
