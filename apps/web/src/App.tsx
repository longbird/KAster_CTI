import { AppShell } from './layout/AppShell';
import { RequireAuth } from './pages/RequireAuth';

function App() {
  return (
    <RequireAuth>
      <AppShell />
    </RequireAuth>
  );
}

export default App;
