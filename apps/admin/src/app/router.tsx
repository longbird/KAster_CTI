import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppLayout } from '../components/AppLayout';
import { AdminDashboardPage } from '../features/dashboard/components/AdminDashboardPage';
import { LiveCallsPage } from '../features/live-calls/LiveCallsPage';
import { KpiPage } from '../features/kpi/KpiPage';
import { AgentSettingsPage } from '../features/agent-settings/AgentSettingsPage';
import { QueueSettingsPage } from '../features/queue-settings/QueueSettingsPage';
import { AgentsPage } from '../pages/AgentsPage';
import { AsteriskConfigPage } from '../pages/AsteriskConfigPage';
import { MonitoringPage } from '../pages/MonitoringPage';
import { QueuesPage } from '../pages/QueuesPage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: 'dashboard', element: <AdminDashboardPage /> },
      { path: 'live-calls', element: <LiveCallsPage /> },
      { path: 'kpi', element: <KpiPage /> },
      { path: 'settings/agents', element: <AgentSettingsPage /> },
      { path: 'settings/queues', element: <QueueSettingsPage /> },
      { path: 'queues', element: <QueuesPage /> },
      { path: 'agents', element: <AgentsPage /> },
      { path: 'monitoring', element: <MonitoringPage /> },
      { path: 'asterisk', element: <AsteriskConfigPage /> },
    ],
  },
]);
