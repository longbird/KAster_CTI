import { createBrowserRouter, Navigate } from 'react-router-dom';
import { PlatformLayout } from './components/PlatformLayout';
import { RequirePlatformAuth } from './components/RequirePlatformAuth';
import { PlatformAdminsPage } from './PlatformAdminsPage';
import { PlatformLoginPage } from './PlatformLoginPage';
import { PlatformTenantEntitlementsPage } from './PlatformTenantEntitlementsPage';
import { PlatformTenantsPage } from './PlatformTenantsPage';

/**
 * 플랫폼 화면 전용 라우터. 관리자 라우터(`src/app/router.tsx`)와 섞지 않는다 —
 * 그쪽은 `RequireAuth`(테넌트 관리자 로그인) 안쪽에 있어서 플랫폼 로그인 화면을 담을 수 없다.
 */
export const platformRouter = createBrowserRouter([
  { path: '/platform/login', element: <PlatformLoginPage /> },
  {
    path: '/platform',
    element: (
      <RequirePlatformAuth>
        <PlatformLayout />
      </RequirePlatformAuth>
    ),
    children: [
      { index: true, element: <PlatformTenantsPage /> },
      { path: 'tenants/:tenantId', element: <PlatformTenantEntitlementsPage /> },
      { path: 'admins', element: <PlatformAdminsPage /> },
    ],
  },
  // 플랫폼 영역 안의 모르는 경로는 테넌트 목록으로 되돌린다.
  { path: '*', element: <Navigate to="/platform" replace /> },
]);
