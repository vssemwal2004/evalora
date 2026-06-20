import { createBrowserRouter, Navigate, useLocation, useParams } from 'react-router-dom';
import { ProtectedRoute } from './features/auth/ProtectedRoute.jsx';
import { AppShell } from './ui/AppShell.jsx';
import { LoginPage } from './features/auth/LoginPage.jsx';
import { DashboardPlaceholder } from './features/dashboard/DashboardPlaceholder.jsx';
import { CreateAdminPage, ManageAdminsPage, ViewAdminsPage } from './features/super-admin/ManageAdminsPage.jsx';
import { AssessmentOverviewPage } from './features/assessments/AssessmentOverviewPage.jsx';
import { AssessmentReportsPage } from './features/assessments/AssessmentReportsPage.jsx';
import { MyAssessmentsPage } from './features/assessments/MyAssessmentsPage.jsx';
import { CreateAssessmentPage } from './features/assessments/CreateAssessmentPage.jsx';
import { AddCoursesPage, ViewCoursesPage } from './features/courses/CoursesPage.jsx';
import { AddLibraryQuestionsPage, LibraryFolderQuestionsPage, LibraryPage, ViewLibraryPage } from './features/library/LibraryPage.jsx';
import { StudentExamsPage } from './features/student/StudentExamsPage.jsx';
import { StudentAttemptPage } from './features/student/StudentAttemptPage.jsx';
import { ProctorLivePage } from './features/proctor/ProctorLivePage.jsx';
import { ProctorAlertsPage } from './features/proctor/ProctorAlertsPage.jsx';
import { AssessmentStudentsPage } from './features/students/AssessmentStudentsPage.jsx';
import { AssessmentProctorsPage } from './features/proctors/AssessmentProctorsPage.jsx';
import { NotFoundPage } from './ui/NotFoundPage.jsx';

function AssessmentBuilderRedirect({ step = 'basic' }) {
  const { assessmentId } = useParams();
  const location = useLocation();
  const roleBase = location.pathname.startsWith('/super-admin') ? '/super-admin' : '/admin';
  const stepQuery = step ? `&step=${step}` : '';

  return <Navigate to={`${roleBase}/assessments/create?draftId=${assessmentId}${stepQuery}`} replace />;
}

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Navigate to="/login" replace />,
  },
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    element: <ProtectedRoute roles={['super_admin']} />,
    children: [
      {
        path: '/super-admin',
        element: <AppShell role="super_admin" />,
        children: [
          {
            index: true,
            element: <DashboardPlaceholder title="Super Admin Dashboard" />,
          },
          {
            path: 'admins',
            element: <ManageAdminsPage />,
          },
          {
            path: 'admins/create',
            element: <CreateAdminPage />,
          },
          {
            path: 'admins/view',
            element: <ViewAdminsPage />,
          },
          {
            path: 'assessments',
            element: <AssessmentOverviewPage />,
          },
          {
            path: 'assessments/create',
            element: <CreateAssessmentPage />,
          },
          {
            path: 'assessments/reports',
            element: <AssessmentReportsPage />,
          },
          {
            path: 'assessments/my',
            element: <MyAssessmentsPage />,
          },
          {
            path: 'assessments/:assessmentId',
            element: <AssessmentBuilderRedirect />,
          },
          {
            path: 'assessments/:assessmentId/settings',
            element: <AssessmentBuilderRedirect step="settings" />,
          },
          {
            path: 'assessments/:assessmentId/questions',
            element: <AssessmentBuilderRedirect step="questions" />,
          },
          {
            path: 'assessments/:assessmentId/students',
            element: <AssessmentStudentsPage />,
          },
          {
            path: 'assessments/:assessmentId/proctors',
            element: <AssessmentProctorsPage />,
          },
          {
            path: 'courses/add',
            element: <AddCoursesPage />,
          },
          {
            path: 'courses/view',
            element: <ViewCoursesPage />,
          },
          {
            path: 'library',
            element: <LibraryPage />,
          },
          {
            path: 'library/add',
            element: <AddLibraryQuestionsPage />,
          },
          {
            path: 'library/view',
            element: <ViewLibraryPage />,
          },
          {
            path: 'library/view/questions',
            element: <LibraryFolderQuestionsPage />,
          },
        ],
      },
    ],
  },
  {
    element: <ProtectedRoute roles={['admin']} />,
    children: [
      {
        path: '/admin',
        element: <AppShell role="admin" />,
        children: [
          {
            index: true,
            element: <DashboardPlaceholder title="Admin Dashboard" />,
          },
          {
            path: 'assessments',
            element: <AssessmentOverviewPage />,
          },
          {
            path: 'assessments/create',
            element: <CreateAssessmentPage />,
          },
          {
            path: 'assessments/reports',
            element: <AssessmentReportsPage />,
          },
          {
            path: 'assessments/my',
            element: <MyAssessmentsPage />,
          },
          {
            path: 'assessments/:assessmentId',
            element: <AssessmentBuilderRedirect />,
          },
          {
            path: 'assessments/:assessmentId/settings',
            element: <AssessmentBuilderRedirect step="settings" />,
          },
          {
            path: 'assessments/:assessmentId/questions',
            element: <AssessmentBuilderRedirect step="questions" />,
          },
          {
            path: 'assessments/:assessmentId/students',
            element: <AssessmentStudentsPage />,
          },
          {
            path: 'assessments/:assessmentId/proctors',
            element: <AssessmentProctorsPage />,
          },
          {
            path: 'courses/add',
            element: <AddCoursesPage />,
          },
          {
            path: 'courses/view',
            element: <ViewCoursesPage />,
          },
          {
            path: 'library',
            element: <LibraryPage />,
          },
          {
            path: 'library/add',
            element: <AddLibraryQuestionsPage />,
          },
          {
            path: 'library/view',
            element: <ViewLibraryPage />,
          },
          {
            path: 'library/view/questions',
            element: <LibraryFolderQuestionsPage />,
          },
        ],
      },
    ],
  },
  {
    element: <ProtectedRoute roles={['student']} />,
    children: [
      {
        path: '/student',
        element: <AppShell role="student" />,
        children: [
          {
            index: true,
            element: <StudentExamsPage />,
          },
          {
            path: 'exams',
            element: <StudentExamsPage />,
          },
          {
            path: 'exams/:assignmentId/attempt',
            element: <StudentAttemptPage />,
          },
        ],
      },
    ],
  },
  {
    element: <ProtectedRoute roles={['proctor']} />,
    children: [
      {
        path: '/proctor',
        element: <AppShell role="proctor" />,
        children: [
          {
            index: true,
            element: <DashboardPlaceholder title="Proctor Monitoring Dashboard" />,
          },
          {
            path: 'live',
            element: <ProctorLivePage />,
          },
          {
            path: 'alerts',
            element: <ProctorAlertsPage />,
          },
        ],
      },
    ],
  },
  {
    path: '*',
    element: <NotFoundPage />,
  },
]);
