import { AppShell } from './layout/AppShell';
import { DesktopHandoffPage } from './pages/DesktopHandoffPage';
import { RequireAuth } from './pages/RequireAuth';

function App() {
  if (window.location.pathname === '/desktop-handoff') {
    return <DesktopHandoffPage />;
  }

  return (
    <RequireAuth>
      <AppShell />
    </RequireAuth>
  );
}

export default App;
