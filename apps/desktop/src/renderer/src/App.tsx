import { useEffect } from 'react';
import { EventTimeline } from './components/EventTimeline';
import { PairingScreen } from './components/PairingScreen';
import { SoftphoneShell } from './components/SoftphoneShell';
import { useDesktopStore } from './store/useDesktopStore';

export default function App() {
  const { bootstrapped, pairing, config, events, initialize, pair } = useDesktopStore();

  useEffect(() => {
    void initialize();
  }, [initialize]);

  if (!bootstrapped || !config) {
    return <PairingScreen busy={pairing} onSubmit={pair} />;
  }

  return (
    <main className="desktop-layout">
      <SoftphoneShell config={config} />
      <EventTimeline events={events} />
    </main>
  );
}
