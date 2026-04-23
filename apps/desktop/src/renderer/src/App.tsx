import { useEffect } from 'react';
import { DesktopLoginScreen } from './components/DesktopLoginScreen';
import { EventTimeline } from './components/EventTimeline';
import { PairingScreen } from './components/PairingScreen';
import { SoftphoneShell } from './components/SoftphoneShell';
import { UpdateBanner } from './components/UpdateBanner';
import { useDesktopStore } from './store/useDesktopStore';

export default function App() {
  const desktopApi =
    typeof window !== 'undefined' && 'desktopApi' in window ? window.desktopApi : null;
  const {
    bootstrapped,
    pairing,
    authView,
    loginPending,
    authError,
    agent,
    agentStatus,
    runtimeConnection,
    config,
    activeCall,
    events,
    audioPermission,
    refreshingAudioDevices,
    audioPreferences,
    audioDevices,
    audioCapabilities,
    softphone,
    updateState,
    initialize,
    login,
    pair,
    connectWithProtocol,
    showPairingDiagnostics,
    showLogin,
    reconnectRuntime,
    originate,
    pickup,
    mute,
    hangup,
    toggleHold,
    transfer,
    cancelAttendedTransfer,
    completeAttendedTransfer,
    prepareUpdate,
    applyPreparedUpdate,
    refreshAudioDevices,
    requestAudioPermission,
    updateAudioPreferences,
    playOutputPreview,
    playRingPreview,
    startSoftphone,
    stopSoftphone,
    answerSoftphoneCall,
    rejectSoftphoneCall,
    hangupSoftphoneCall,
  } = useDesktopStore();
  const updateBlockReason =
    activeCall && activeCall.sessionStatus !== 'ENDED'
      ? 'CTI 통화 종료 후 적용'
      : softphone?.session
        ? 'softphone 통화 종료 후 적용'
        : runtimeConnection === 'reconnecting'
          ? 'runtime 재연결 후 적용'
          : '지금 적용 가능';

  useEffect(() => {
    void initialize();
  }, [initialize]);

  useEffect(() => {
    if (!desktopApi?.onProtocolConnect) {
      return;
    }

    return desktopApi.onProtocolConnect((payload) => {
      void connectWithProtocol(payload);
    });
  }, [connectWithProtocol, desktopApi]);

  useEffect(() => {
    if (!desktopApi?.setWindowMode) {
      return;
    }

    const mode = !config || !agent ? 'compact' : 'full';
    void desktopApi.setWindowMode(mode);
  }, [agent, config, desktopApi]);

  if (!bootstrapped) {
    return (
      <section className="auth-screen">
        <div className="login-card panel boot-card">
          <h1>KAster Agent Desktop</h1>
          <p>초기화 중...</p>
        </div>
      </section>
    );
  }

  if (!config || !agent) {
    if (authView === 'pairing') {
      return <PairingScreen busy={pairing} onBack={showLogin} onSubmit={pair} />;
    }

    return (
      <DesktopLoginScreen
        busy={loginPending}
        error={authError}
        serverUrl={config?.serverUrl ?? ''}
        serverUrlRequired={!config}
        onSubmit={(input) => {
          void login(input);
        }}
        onTogglePairing={showPairingDiagnostics}
      />
    );
  }

  return (
    <main className="desktop-layout">
      <div className="desktop-main">
        {updateState ? (
          <UpdateBanner
            message={updateState.message}
            canApply={updateBlockReason === '지금 적용 가능'}
            statusText={updateBlockReason}
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
          runtimeConnection={runtimeConnection}
          activeCall={activeCall}
          audioPermission={audioPermission}
          refreshingAudioDevices={refreshingAudioDevices}
          audioPreferences={audioPreferences}
          audioDevices={audioDevices}
          audioCapabilities={audioCapabilities}
          softphone={softphone}
          onPickup={pickup}
          onReconnectRuntime={reconnectRuntime}
          onOriginate={originate}
          onMute={mute}
          onHangup={hangup}
          onToggleHold={toggleHold}
          onTransfer={transfer}
          onCancelAttendedTransfer={cancelAttendedTransfer}
          onCompleteAttendedTransfer={completeAttendedTransfer}
          onRefreshAudioDevices={refreshAudioDevices}
          onRequestAudioPermission={requestAudioPermission}
          onChangeAudioPreferences={updateAudioPreferences}
          onPlayOutputPreview={playOutputPreview}
          onPlayRingPreview={playRingPreview}
          onStartSoftphone={startSoftphone}
          onStopSoftphone={stopSoftphone}
          onAnswerSoftphoneCall={answerSoftphoneCall}
          onRejectSoftphoneCall={rejectSoftphoneCall}
          onHangupSoftphoneCall={hangupSoftphoneCall}
        />
      </div>
      <EventTimeline events={events} />
    </main>
  );
}
