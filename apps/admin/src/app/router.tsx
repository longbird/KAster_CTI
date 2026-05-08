import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppLayout } from '../components/AppLayout';
import { AdminDashboardPage } from '../features/dashboard/components/AdminDashboardPage';
import { ForwardingSettingsPage } from '../features/forwarding-settings/ForwardingSettingsPage';
import { LiveCallsPage } from '../features/live-calls/LiveCallsPage';
import { KpiPage } from '../features/kpi/KpiPage';
import { AgentGroupsPage } from '../features/agent-groups/AgentGroupsPage';
import { AgentMonitoringPage } from '../features/agent-monitoring/AgentMonitoringPage';
import { AgentSettingsPage } from '../features/agent-settings/AgentSettingsPage';
import { OutboundRulesPage } from '../features/outbound-rules/OutboundRulesPage';
import { ShareRulesPage } from '../features/share-rules/ShareRulesPage';
import { QueueSettingsPage } from '../features/queue-settings/QueueSettingsPage';
import { BranchSettingsPage } from '../features/branch-settings/BranchSettingsPage';
import { CustomersPage } from '../features/customers/CustomersPage';
import { BlocklistPage } from '../features/blocklist/BlocklistPage';
import { OptOutCustomersPage } from '../features/opt-out-customers/OptOutCustomersPage';
import { PermissionSettingsPage } from '../features/permission-settings/PermissionSettingsPage';
import { PromptSettingsPage } from '../features/prompt-settings/PromptSettingsPage';
import { SmsTemplatesPage } from '../features/sms-templates/SmsTemplatesPage';
import { CallsReportPage } from '../features/reports/CallsReportPage';
import { AmiLogsPage } from '../features/reports/AmiLogsPage';
import { IvrFailuresPage } from '../features/reports/IvrFailuresPage';
import { MissedCallsPage } from '../features/reports/MissedCallsPage';
import { RecordingsPage } from '../features/reports/RecordingsPage';
import { SystemSettingsPage } from '../features/system-settings/SystemSettingsPage';
import { AnnouncementsPage } from '../features/announcements/AnnouncementsPage';
import { AgentsPage } from '../pages/AgentsPage';
import { AsteriskConfigPage } from '../pages/AsteriskConfigPage';
import { MonitoringPage } from '../pages/MonitoringPage';
import { QueuesPage } from '../pages/QueuesPage';
import { NumbersPage } from '../features/numbers/NumbersPage';
import { HistoryPage } from '../features/history/HistoryPage';
import { IntegrationsPage } from '../features/integrations/IntegrationsPage';

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
      { path: 'settings/agent-groups', element: <AgentGroupsPage /> },
      { path: 'settings/outbound-rules', element: <OutboundRulesPage /> },
      { path: 'settings/share-rules', element: <ShareRulesPage /> },
      { path: 'settings/queues',      element: <QueueSettingsPage /> },
      { path: 'settings/forwarding',  element: <ForwardingSettingsPage /> },
      { path: 'settings/prompts',     element: <PromptSettingsPage /> },
      { path: 'settings/sms-templates', element: <SmsTemplatesPage /> },
      { path: 'settings/branches',    element: <BranchSettingsPage /> },
      { path: 'settings/permissions', element: <PermissionSettingsPage /> },
      { path: 'customers',            element: <CustomersPage /> },
      { path: 'opt-out-customers',    element: <OptOutCustomersPage /> },
      { path: 'reports/calls',        element: <CallsReportPage /> },
      { path: 'reports/missed',       element: <MissedCallsPage /> },
      { path: 'reports/recordings',   element: <RecordingsPage /> },
      { path: 'reports/ivr-failures',  element: <IvrFailuresPage /> },
      { path: 'reports/logs',         element: <AmiLogsPage /> },
      { path: 'announcements',        element: <AnnouncementsPage /> },
      { path: 'blocklist',            element: <BlocklistPage /> },
      { path: 'system',               element: <SystemSettingsPage /> },
      { path: 'queues',               element: <QueuesPage /> },
      { path: 'agents',               element: <AgentsPage /> },
      { path: 'monitoring',           element: <MonitoringPage /> },
      { path: 'monitoring/agents',    element: <AgentMonitoringPage /> },
      { path: 'asterisk',             element: <AsteriskConfigPage /> },
      { path: 'numbers',              element: <NumbersPage /> },
      { path: 'history',              element: <HistoryPage /> },
      { path: 'integrations',         element: <IntegrationsPage /> },
    ],
  },
]);
