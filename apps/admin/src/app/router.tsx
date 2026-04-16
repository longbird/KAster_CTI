import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppLayout } from '../components/AppLayout';
import { AdminDashboardPage } from '../features/dashboard/components/AdminDashboardPage';
import { LiveCallsPage } from '../features/live-calls/LiveCallsPage';
import { KpiPage } from '../features/kpi/KpiPage';
import { AgentSettingsPage } from '../features/agent-settings/AgentSettingsPage';
import { QueueSettingsPage } from '../features/queue-settings/QueueSettingsPage';
import { BranchSettingsPage } from '../features/branch-settings/BranchSettingsPage';
import { PermissionSettingsPage } from '../features/permission-settings/PermissionSettingsPage';
import { CallsReportPage } from '../features/reports/CallsReportPage';
import { AmiLogsPage } from '../features/reports/AmiLogsPage';
import { MissedCallsPage } from '../features/reports/MissedCallsPage';
import { RecordingsPage } from '../features/reports/RecordingsPage';
import { AnnouncementsPage } from '../features/announcements/AnnouncementsPage';
import { StubPage } from '../features/stub/StubPage';
import { AgentsPage } from '../pages/AgentsPage';
import { AsteriskConfigPage } from '../pages/AsteriskConfigPage';
import { MonitoringPage } from '../pages/MonitoringPage';
import { QueuesPage } from '../pages/QueuesPage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true,                  element: <Navigate to="/dashboard" replace /> },
      { path: 'dashboard',            element: <AdminDashboardPage /> },
      { path: 'live-calls',           element: <LiveCallsPage /> },
      { path: 'kpi',                  element: <KpiPage /> },
      { path: 'settings/agents',      element: <AgentSettingsPage /> },
      { path: 'settings/queues',      element: <QueueSettingsPage /> },
      { path: 'settings/forwarding',  element: <StubPage title="착신전환 설정" /> },
      { path: 'settings/prompts',     element: <StubPage title="멘트 관리" /> },
      { path: 'settings/branches',    element: <BranchSettingsPage /> },
      { path: 'settings/permissions', element: <PermissionSettingsPage /> },
      { path: 'reports/calls',        element: <CallsReportPage /> },
      { path: 'reports/missed',       element: <MissedCallsPage /> },
      { path: 'reports/recordings',   element: <RecordingsPage /> },
      { path: 'reports/logs',         element: <AmiLogsPage /> },
      { path: 'announcements',        element: <AnnouncementsPage /> },
      { path: 'blocklist',            element: <StubPage title="080 수신거부 관리" /> },
      { path: 'system',               element: <StubPage title="시스템 설정" /> },
      { path: 'queues',               element: <QueuesPage /> },
      { path: 'agents',               element: <AgentsPage /> },
      { path: 'monitoring',           element: <MonitoringPage /> },
      { path: 'asterisk',             element: <AsteriskConfigPage /> },
    ],
  },
]);
