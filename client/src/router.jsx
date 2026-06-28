import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate, useLocation, useParams } from 'react-router-dom';
import { ProtectedRoute } from './features/auth/ProtectedRoute.jsx';
import { AppShell } from './ui/AppShell.jsx';
import { BrandLoader } from './ui/BrandLoader.jsx';

function lazyPage(importer, exportName) {
  return lazy(() => importer().then((module) => ({ default: module[exportName] })));
}

function page(Component, props) {
  return (
    <Suspense fallback={<BrandLoader />}>
      <Component {...props} />
    </Suspense>
  );
}

const LoginPage = lazyPage(() => import('./features/auth/LoginPage.jsx'), 'LoginPage');
const DashboardPlaceholder = lazyPage(() => import('./features/dashboard/DashboardPlaceholder.jsx'), 'DashboardPlaceholder');
const ManageAdminsPage = lazyPage(() => import('./features/super-admin/ManageAdminsPage.jsx'), 'ManageAdminsPage');
const CreateAdminPage = lazyPage(() => import('./features/super-admin/ManageAdminsPage.jsx'), 'CreateAdminPage');
const ViewAdminsPage = lazyPage(() => import('./features/super-admin/ManageAdminsPage.jsx'), 'ViewAdminsPage');
const AssessmentOverviewPage = lazyPage(() => import('./features/assessments/AssessmentOverviewPage.jsx'), 'AssessmentOverviewPage');
const AssessmentReportsPage = lazyPage(() => import('./features/assessments/AssessmentReportsPage.jsx'), 'AssessmentReportsPage');
const MyAssessmentsPage = lazyPage(() => import('./features/assessments/MyAssessmentsPage.jsx'), 'MyAssessmentsPage');
const ReviewAssessmentsPage = lazyPage(() => import('./features/assessments/ReviewAssessmentsPage.jsx'), 'ReviewAssessmentsPage');
const ReviewQuestionMappingPage = lazyPage(() => import('./features/assessments/ReviewQuestionMappingPage.jsx'), 'ReviewQuestionMappingPage');
const CreateAssessmentPage = lazyPage(() => import('./features/assessments/CreateAssessmentPage.jsx'), 'CreateAssessmentPage');
const AddCoursesPage = lazyPage(() => import('./features/courses/CoursesPage.jsx'), 'AddCoursesPage');
const ViewCoursesPage = lazyPage(() => import('./features/courses/CoursesPage.jsx'), 'ViewCoursesPage');
const CreateFacultyPage = lazyPage(() => import('./features/people/PeoplePage.jsx'), 'CreateFacultyPage');
const ViewFacultyPage = lazyPage(() => import('./features/people/PeoplePage.jsx'), 'ViewFacultyPage');
const CreateModeratorPage = lazyPage(() => import('./features/people/PeoplePage.jsx'), 'CreateModeratorPage');
const ViewModeratorPage = lazyPage(() => import('./features/people/PeoplePage.jsx'), 'ViewModeratorPage');
const AddLibraryQuestionsPage = lazyPage(() => import('./features/library/LibraryPage.jsx'), 'AddLibraryQuestionsPage');
const LibraryFolderQuestionsPage = lazyPage(() => import('./features/library/LibraryPage.jsx'), 'LibraryFolderQuestionsPage');
const LibraryPage = lazyPage(() => import('./features/library/LibraryPage.jsx'), 'LibraryPage');
const ViewLibraryPage = lazyPage(() => import('./features/library/LibraryPage.jsx'), 'ViewLibraryPage');
const StudentExamsPage = lazyPage(() => import('./features/student/StudentExamsPage.jsx'), 'StudentExamsPage');
const StudentAttemptPage = lazyPage(() => import('./features/student/StudentAttemptPage.jsx'), 'StudentAttemptPage');
const ProctorLivePage = lazyPage(() => import('./features/proctor/ProctorLivePage.jsx'), 'ProctorLivePage');
const ProctorAlertsPage = lazyPage(() => import('./features/proctor/ProctorAlertsPage.jsx'), 'ProctorAlertsPage');
const AssessmentStudentsPage = lazyPage(() => import('./features/students/AssessmentStudentsPage.jsx'), 'AssessmentStudentsPage');
const AssessmentStudentReviewPage = lazyPage(() => import('./features/students/AssessmentStudentsPage.jsx'), 'AssessmentStudentReviewPage');
const StudentDirectoryPage = lazyPage(() => import('./features/students/StudentDirectoryPage.jsx'), 'StudentDirectoryPage');
const AssessmentProctorsPage = lazyPage(() => import('./features/proctors/AssessmentProctorsPage.jsx'), 'AssessmentProctorsPage');
const AssessmentQuestionDirectoryPage = lazyPage(() => import('./features/questions/AssessmentQuestionDirectoryPage.jsx'), 'AssessmentQuestionDirectoryPage');
const NotFoundPage = lazyPage(() => import('./ui/NotFoundPage.jsx'), 'NotFoundPage');
const AssignedWorkPage = lazyPage(() => import('./features/work/AssignedWorkPage.jsx'), 'AssignedWorkPage');
const WorkWorkspacePage = lazyPage(() => import('./features/work/AssignedWorkPage.jsx'), 'WorkWorkspacePage');
const LandingPage = lazyPage(() => import('./features/landing/LandingPage.jsx'), 'LandingPage');
const SettingsPage = lazyPage(() => import('./features/settings/SettingsPage.jsx'), 'SettingsPage');
const EmailTemplatePage = lazyPage(() => import('./features/settings/EmailTemplatePage.jsx'), 'EmailTemplatePage');
const ActivityLogPage = lazyPage(() => import('./features/activity/ActivityLogPage.jsx'), 'ActivityLogPage');

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
    element: page(LandingPage),
  },
  {
    path: '/login',
    element: page(LoginPage),
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
            element: page(DashboardPlaceholder, { title: 'Super Admin Dashboard' }),
          },
          {
            path: 'admins',
            element: page(ManageAdminsPage),
          },
          {
            path: 'admins/create',
            element: page(CreateAdminPage),
          },
          {
            path: 'admins/view',
            element: page(ViewAdminsPage),
          },
          {
            path: 'activity',
            element: page(ActivityLogPage),
          },
          {
            path: 'assessments',
            element: page(AssessmentOverviewPage),
          },
          {
            path: 'assessments/create',
            element: page(CreateAssessmentPage),
          },
          {
            path: 'assessments/reports',
            element: page(AssessmentReportsPage),
          },
          {
            path: 'assessments/my',
            element: page(MyAssessmentsPage),
          },
          {
            path: 'assessments/review',
            element: page(ReviewAssessmentsPage),
          },
          {
            path: 'assessments/review/:assessmentId/questions',
            element: page(ReviewQuestionMappingPage),
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
            element: page(AssessmentQuestionDirectoryPage),
          },
          {
            path: 'assessments/:assessmentId/students/review',
            element: page(AssessmentStudentReviewPage),
          },
          {
            path: 'assessments/:assessmentId/students',
            element: page(AssessmentStudentsPage),
          },
          {
            path: 'assessments/:assessmentId/proctors',
            element: page(AssessmentProctorsPage),
          },
          {
            path: 'courses/add',
            element: page(AddCoursesPage),
          },
          {
            path: 'courses/view',
            element: page(ViewCoursesPage),
          },
          {
            path: 'students/view',
            element: page(StudentDirectoryPage),
          },
          {
            path: 'faculty/create',
            element: page(CreateFacultyPage),
          },
          {
            path: 'faculty/view',
            element: page(ViewFacultyPage),
          },
          {
            path: 'moderators/create',
            element: page(CreateModeratorPage),
          },
          {
            path: 'moderators/view',
            element: page(ViewModeratorPage),
          },
          {
            path: 'library',
            element: page(LibraryPage),
          },
          {
            path: 'library/add',
            element: page(AddLibraryQuestionsPage),
          },
          {
            path: 'library/view',
            element: page(ViewLibraryPage),
          },
          {
            path: 'library/view/questions',
            element: page(LibraryFolderQuestionsPage),
          },
          {
            path: 'settings',
            element: page(SettingsPage),
          },
          {
            path: 'settings/email-templates',
            element: page(EmailTemplatePage),
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
            element: page(DashboardPlaceholder, { title: 'Admin Dashboard' }),
          },
          {
            path: 'assessments',
            element: page(AssessmentOverviewPage),
          },
          {
            path: 'assessments/create',
            element: page(CreateAssessmentPage),
          },
          {
            path: 'assessments/reports',
            element: page(AssessmentReportsPage),
          },
          {
            path: 'assessments/my',
            element: page(MyAssessmentsPage),
          },
          {
            path: 'assessments/review',
            element: page(ReviewAssessmentsPage),
          },
          {
            path: 'assessments/review/:assessmentId/questions',
            element: page(ReviewQuestionMappingPage),
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
            element: page(AssessmentQuestionDirectoryPage),
          },
          {
            path: 'assessments/:assessmentId/students/review',
            element: page(AssessmentStudentReviewPage),
          },
          {
            path: 'assessments/:assessmentId/students',
            element: page(AssessmentStudentsPage),
          },
          {
            path: 'assessments/:assessmentId/proctors',
            element: page(AssessmentProctorsPage),
          },
          {
            path: 'courses/add',
            element: page(AddCoursesPage),
          },
          {
            path: 'courses/view',
            element: page(ViewCoursesPage),
          },
          {
            path: 'students/view',
            element: page(StudentDirectoryPage),
          },
          {
            path: 'faculty/create',
            element: page(CreateFacultyPage),
          },
          {
            path: 'faculty/view',
            element: page(ViewFacultyPage),
          },
          {
            path: 'moderators/create',
            element: page(CreateModeratorPage),
          },
          {
            path: 'moderators/view',
            element: page(ViewModeratorPage),
          },
          {
            path: 'activity',
            element: page(ActivityLogPage),
          },
          {
            path: 'library',
            element: page(LibraryPage),
          },
          {
            path: 'library/add',
            element: page(AddLibraryQuestionsPage),
          },
          {
            path: 'library/view',
            element: page(ViewLibraryPage),
          },
          {
            path: 'library/view/questions',
            element: page(LibraryFolderQuestionsPage),
          },
          {
            path: 'settings',
            element: page(SettingsPage),
          },
          {
            path: 'settings/email-templates',
            element: page(EmailTemplatePage),
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
            element: page(StudentExamsPage),
          },
          {
            path: 'exams',
            element: page(StudentExamsPage),
          },
          {
            path: 'exams/:assignmentId/attempt',
            element: page(StudentAttemptPage),
          },
        ],
      },
    ],
  },
  {
    element: <ProtectedRoute roles={['faculty']} />,
    children: [
      {
        path: '/faculty',
        element: <AppShell role="faculty" />,
        children: [
          {
            index: true,
            element: page(AssignedWorkPage),
          },
          {
            path: 'work/:assignmentId',
            element: page(WorkWorkspacePage),
          },
          {
            path: 'library',
            element: page(LibraryPage),
          },
          {
            path: 'library/add',
            element: page(AddLibraryQuestionsPage),
          },
          {
            path: 'library/view',
            element: page(ViewLibraryPage),
          },
          {
            path: 'library/view/questions',
            element: page(LibraryFolderQuestionsPage),
          },
          {
            path: 'settings',
            element: page(SettingsPage),
          },
        ],
      },
    ],
  },
  {
    element: <ProtectedRoute roles={['moderator']} />,
    children: [
      {
        path: '/moderator',
        element: <AppShell role="moderator" />,
        children: [
          {
            index: true,
            element: page(AssignedWorkPage),
          },
          {
            path: 'work/:assignmentId',
            element: page(WorkWorkspacePage),
          },
          {
            path: 'settings',
            element: page(SettingsPage),
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
            element: page(DashboardPlaceholder, { title: 'Proctor Monitoring Dashboard' }),
          },
          {
            path: 'live',
            element: page(ProctorLivePage),
          },
          {
            path: 'alerts',
            element: page(ProctorAlertsPage),
          },
        ],
      },
    ],
  },
  {
    path: '*',
    element: page(NotFoundPage),
  },
]);
