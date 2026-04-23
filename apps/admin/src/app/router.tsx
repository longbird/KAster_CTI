import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppLayout } from '../components/AppLayout';
import { AdminDashboardPage } from '../features/dashboard/components/AdminDashboardPage';
import { ForwardingSettingsPage } from '../features/forwarding-settings/ForwardingSettingsPage';
import { LiveCallsPage } from '../features/live-calls/LiveCallsPage';
import { KpiPage } from '../features/kpi/KpiPage';
import { AgentSettingsPage } from '../features/agent-settings/AgentSettingsPage';
import { QueueSettingsPage } from '../features/queue-settings/QueueSettingsPage';
import { BranchSettingsPage } from '../features/branch-settings/BranchSettingsPage';
import { CustomersPage } from '../features/customers/CustomersPage';
import { BlocklistPage } from '../features/blocklist/BlocklistPage';
import { PermissionSettingsPage } from '../features/permission-settings/PermissionSettingsPage';
import { PromptSettingsPage } from '../features/prompt-settings/PromptSettingsPage';
import { SmsTemplatesPage } from '../features/sms-templates/SmsTemplatesPage';
import { CallsReportPage } from '../features/reports/CallsReportPage';
import { AmiLogsPage } from '../features/reports/AmiLogsPage';
import { MissedCallsPage } from '../features/reports/MissedCallsPage';
import { RecordingsPage } from '../features/reports/RecordingsPage';
import { SystemSettingsPage } from '../features/system-settings/SystemSettingsPage';
import { AnnouncementsPage } from '../features/announcements/AnnouncementsPage';
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
      { path: 'settings/forwarding',  element: <ForwardingSettingsPage /> },
      { path: 'settings/prompts',     element: <PromptSettingsPage /> },
      { path: 'settings/sms-templates', element: <SmsTemplatesPage /> },
      { path: 'settings/branches',    element: <BranchSettingsPage /> },
      { path: 'settings/permissions', element: <PermissionSettingsPage /> },
      { path: 'customers',            element: <CustomersPage /> },
      { path: 'reports/calls',        element: <CallsReportPage /> },
      { path: 'reports/missed',       element: <MissedCallsPage /> },
      { path: 'reports/recordings',   element: <RecordingsPage /> },
      { path: 'reports/logs',         element: <AmiLogsPage /> },
      { path: 'announcements',        element: <AnnouncementsPage /> },
      { path: 'blocklist',            element: <BlocklistPage /> },
      { path: 'system',               element: <SystemSettingsPage /> },
      { path: 'queues',               element: <QueuesPage /> },
      { path: 'agents',               element: <AgentsPage /> },
      { path: 'monitoring',           element: <MonitoringPage /> },
      { path: 'integrations',         element: <Navigate to="/asterisk" replace /> },
      { path: 'asterisk',             element: <AsteriskConfigPage /> },
    ],
  },
]);
