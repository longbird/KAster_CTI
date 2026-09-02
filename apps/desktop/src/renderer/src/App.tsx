import { useEffect } from 'react';
import { AgentListPopup } from './components/AgentListPopup';
import { AnnouncementBannerStack } from './components/AnnouncementBannerStack';
import { CallHistoryPopup } from './components/CallHistoryPopup';
import { DesktopLoginScreen } from './components/DesktopLoginScreen';
import { DialpadPopup } from './components/DialpadPopup';
import { PairingScreen } from './components/PairingScreen';
import { QueueMonitorPanel } from './components/QueueMonitorPanel';
import { SoftphoneShell } from './components/SoftphoneShell';
import { UpdateBanner } from './components/UpdateBanner';
import { useDesktopStore } from './store/useDesktopStore';
import { watchTheme } from './theme';

export default function App() {
  const hash = typeof window !== 'undefined' ? window.location.hash : '';
  if (hash === '#/history-popup') {
    return <CallHistoryPopup />;
  }
  if (hash === '#/agent-list-popup') {
    return <AgentListPopup />;
  }
  if (hash.startsWith('#/dialpad-popup')) {
    return <DialpadPopup />;
  }

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
    audioPermission,
    refreshingAudioDevices,
    audioPreferences,
    audioDevices,
    audioCapabilities,
    generalPreferences,
    softphone,
    callCapabilities,
    callerIds,
    defaultCallerId,
    agentDirectory,
    updateState,
    initialize,
    login,
    pair,
    connectWithProtocol,
    showPairingDiagnostics,
    showLogin,
    reconnectRuntime,
    changeAgentStatus,
    originate,
    originateInternal,
    openCallHistoryPopup,
    openAgentListPopup,
    openDialpadPopup,
    pickup,
    mute,
    hangup,
    toggleHold,
    transfer,
    cancelAttendedTransfer,
    completeAttendedTransfer,
    prepareUpdate,
    dismissUpdate,
    applyPreparedUpdate,
    refreshAudioDevices,
    requestAudioPermission,
    updateAudioPreferences,
    updateGeneralPreferences,
    playOutputPreview,
    playRingPreview,
    startSoftphone,
    stopSoftphone,
    answerSoftphoneCall,
    rejectSoftphoneCall,
    hangupSoftphoneCall,
    sendSoftphoneDtmf,
    announcements,
    dismissAnnouncement,
    queueSummary,
    queueArrivalFlashAt,
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

  // 'system' 인 동안에는 OS 설정 변화도 따라간다.
  useEffect(() => watchTheme(generalPreferences.themeMode), [generalPreferences.themeMode]);

  useEffect(() => {
    if (!desktopApi?.onProtocolConnect) {
      return;
    }

    return desktopApi.onProtocolConnect((payload) => {
      void connectWithProtocol(payload);
    });
  }, [connectWithProtocol, desktopApi]);

  useEffect(() => {
    if (!desktopApi?.onHistoryOriginateRequest) {
      return;
    }

    return desktopApi.onHistoryOriginateRequest((payload) => {
      void (async () => {
        try {
          await originate(payload.phoneNumber);
          await desktopApi.completeHistoryOriginateRequest({
            requestId: payload.requestId,
            ok: true,
            message: '발신 요청 완료',
          });
        } catch (error) {
          await desktopApi.completeHistoryOriginateRequest({
            requestId: payload.requestId,
            ok: false,
            message: error instanceof Error ? error.message : '발신 요청 실패',
          });
        }
      })();
    });
  }, [desktopApi, originate]);

  useEffect(() => {
    if (!desktopApi?.onSoftphoneDtmfRequest) {
      return;
    }

    return desktopApi.onSoftphoneDtmfRequest((payload) => {
      void (async () => {
        try {
          await sendSoftphoneDtmf(payload.digit);
          await desktopApi.completeSoftphoneDtmfRequest({
            requestId: payload.requestId,
            ok: true,
            message: `${payload.digit} 전송 완료`,
          });
        } catch (error) {
          await desktopApi.completeSoftphoneDtmfRequest({
            requestId: payload.requestId,
            ok: false,
            message: error instanceof Error ? error.message : 'DTMF 전송 실패',
          });
        }
      })();
    });
  }, [desktopApi, sendSoftphoneDtmf]);

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
        <QueueMonitorPanel queueSummary={queueSummary} flashAt={queueArrivalFlashAt} />
        <AnnouncementBannerStack
          announcements={announcements}
          onDismiss={dismissAnnouncement}
        />
        {updateState ? (
          <UpdateBanner
            message={updateState.message}
            canApply={updateBlockReason === '지금 적용 가능'}
            statusText={updateBlockReason}
            busy={Boolean(updateState.preparing || updateState.applying)}
            readyFileName={updateState.preparedFileName}
            onPrepare={prepareUpdate}
            onApply={applyPreparedUpdate}
            onDismiss={dismissUpdate}
          />
        ) : null}
        <SoftphoneShell
          config={config}
          agentName={agent.agentName}
          agentId={agent.agentId}
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
          callCapabilities={callCapabilities}
          callerIds={callerIds}
          defaultCallerId={defaultCallerId}
          agentDirectory={agentDirectory}
          onPickup={pickup}
          onChangeAgentStatus={changeAgentStatus}
          onReconnectRuntime={reconnectRuntime}
          onOriginate={originate}
          onOriginateInternal={originateInternal}
          onOpenCallHistoryPopup={openCallHistoryPopup}
          onOpenAgentListPopup={openAgentListPopup}
          onOpenDialpadPopup={openDialpadPopup}
          onMute={mute}
          onHangup={hangup}
          onToggleHold={toggleHold}
          onTransfer={transfer}
          onCancelAttendedTransfer={cancelAttendedTransfer}
          onCompleteAttendedTransfer={completeAttendedTransfer}
          onRefreshAudioDevices={refreshAudioDevices}
          onRequestAudioPermission={requestAudioPermission}
          onChangeAudioPreferences={updateAudioPreferences}
          generalPreferences={generalPreferences}
          onChangeGeneralPreferences={updateGeneralPreferences}
          onPlayOutputPreview={playOutputPreview}
          onPlayRingPreview={playRingPreview}
          onStartSoftphone={startSoftphone}
          onStopSoftphone={stopSoftphone}
          onAnswerSoftphoneCall={answerSoftphoneCall}
          onRejectSoftphoneCall={rejectSoftphoneCall}
          onHangupSoftphoneCall={hangupSoftphoneCall}
        />
      </div>
    </main>
  );
}
