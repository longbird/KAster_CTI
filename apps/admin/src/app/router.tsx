import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppLayout } from '../components/AppLayout';
import { AdminDashboardPage } from '../features/dashboard/components/AdminDashboardPage';
import { AgentsPage } from '../pages/AgentsPage';
import { MonitoringPage } from '../pages/MonitoringPage';
import { QueuesPage } from '../pages/QueuesPage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: 'dashboard', element: <AdminDashboardPage /> },
      { path: 'queues', element: <QueuesPage /> },
      { path: 'agents', element: <AgentsPage /> },
      { path: 'monitoring', element: <MonitoringPage /> },
    ],
  },
]);
