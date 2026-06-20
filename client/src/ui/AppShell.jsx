import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useState } from 'react';
import {
  BarChart3,
  BookOpen,
  ChevronDown,
  GraduationCap,
  ClipboardList,
  FilePlus2,
  LayoutDashboard,
  ListChecks,
  LogOut,
  NotebookTabs,
  Plus,
  Shield,
  UserPlus,
  Users,
  Video,
} from 'lucide-react';
import { useAuth } from '../features/auth/AuthContext.jsx';

const navByRole = {
  super_admin: {
    dashboard: '/super-admin',
    sections: [
      {
        id: 'manage-admins',
        label: 'Manage Admins',
        icon: Users,
        children: [
          { label: 'Create Admin', to: '/super-admin/admins/create', icon: UserPlus },
          { label: 'View Admins', to: '/super-admin/admins/view', icon: ListChecks },
        ],
      },
      {
        id: 'assessments',
        label: 'Assessments',
        icon: ClipboardList,
        children: [
          { label: 'Overview', to: '/super-admin/assessments', icon: NotebookTabs },
          { label: 'Create Assessment', to: '/super-admin/assessments/create', icon: FilePlus2 },
          { label: 'Assessment Reports', to: '/super-admin/assessments/reports', icon: BarChart3 },
          { label: 'My Assessments', to: '/super-admin/assessments/my', icon: ClipboardList },
        ],
      },
      {
        id: 'courses',
        label: 'Courses',
        icon: GraduationCap,
        children: [
          { label: 'Add Courses', to: '/super-admin/courses/add', icon: Plus },
          { label: 'View Courses', to: '/super-admin/courses/view', icon: ListChecks },
        ],
      },
      {
        id: 'library',
        label: 'Library',
        icon: BookOpen,
        children: [
          { label: 'Add Questions', to: '/super-admin/library/add', icon: Plus },
          { label: 'View Library', to: '/super-admin/library/view', icon: BookOpen },
        ],
      },
    ],
  },
  admin: {
    dashboard: '/admin',
    sections: [
      {
        id: 'assessments',
        label: 'Assessments',
        icon: ClipboardList,
        children: [
          { label: 'Overview', to: '/admin/assessments', icon: NotebookTabs, permission: 'assessment.view' },
          { label: 'Create Assessment', to: '/admin/assessments/create', icon: FilePlus2, permission: 'assessment.create' },
          { label: 'Assessment Reports', to: '/admin/assessments/reports', icon: BarChart3, permission: 'reports.view' },
          { label: 'My Assessments', to: '/admin/assessments/my', icon: ClipboardList, permission: 'assessment.view' },
        ],
      },
      {
        id: 'courses',
        label: 'Courses',
        icon: GraduationCap,
        children: [
          { label: 'Add Courses', to: '/admin/courses/add', icon: Plus, permission: 'course.create' },
          { label: 'View Courses', to: '/admin/courses/view', icon: ListChecks, permission: 'course.view' },
        ],
      },
      {
        id: 'library',
        label: 'Library',
        icon: BookOpen,
        children: [
          { label: 'Add Questions', to: '/admin/library/add', icon: Plus, permission: 'library.create' },
          { label: 'View Library', to: '/admin/library/view', icon: BookOpen, permission: 'library.view' },
        ],
      },
    ],
  },
  student: {
    dashboard: '/student',
    sections: [
      {
        id: 'student-exams',
        label: 'Exams',
        icon: ClipboardList,
        children: [{ label: 'My Exams', to: '/student/exams', icon: NotebookTabs }],
      },
    ],
  },
  proctor: {
    dashboard: '/proctor',
    sections: [
      {
        id: 'monitoring',
        label: 'Monitoring',
        icon: Video,
        children: [
          { label: 'Live Monitoring', to: '/proctor/live', icon: Video },
          { label: 'Alerts', to: '/proctor/alerts', icon: Shield },
        ],
      },
    ],
  },
};

function filterNavConfig(navConfig, role, user) {
  if (role !== 'admin') {
    return navConfig;
  }

  const permissions = new Set(user?.permissions || []);
  const canAccess = (item) => !item.permission || permissions.has(item.permission);

  return {
    ...navConfig,
    sections: (navConfig.sections || [])
      .map((section) => ({
        ...section,
        children: section.children.filter(canAccess),
      }))
      .filter((section) => section.children.length > 0),
  };
}

const roleTitles = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  student: 'Student',
  proctor: 'Proctor',
};

function SidebarSection({ section, isOpen, onToggle, sidebarOpen }) {
  const location = useLocation();
  const isSectionActive = section.children.some((child) => location.pathname === child.to || location.pathname.startsWith(`${child.to}/`));
  const expanded = sidebarOpen && (isOpen || isSectionActive);

  return (
    <div className="group/sidebar-section space-y-1">
      <button
        className={`flex h-11 w-full translate-x-0 items-center rounded-md border text-sm font-semibold transition duration-300 ease-out hover:translate-x-1 ${
          sidebarOpen ? 'justify-between px-3' : 'justify-center px-0'
        } ${
          expanded
            ? 'border-brand-200 bg-brand-50 text-brand-700 shadow-sm'
            : 'border-transparent text-slate-700 hover:border-slate-200 hover:bg-slate-50'
        }`}
        type="button"
        onClick={onToggle}
        title={section.label}
      >
        <span className={`flex items-center ${sidebarOpen ? 'gap-3' : 'justify-center'}`}>
          <section.icon size={18} className="text-brand-500" />
          <span className={`overflow-hidden whitespace-nowrap transition-all duration-300 ${sidebarOpen ? 'max-w-[180px] opacity-100' : 'max-w-0 opacity-0'}`}>
            {section.label}
          </span>
        </span>
        {sidebarOpen ? <ChevronDown size={16} className={`text-slate-400 transition-transform duration-300 ${expanded ? 'rotate-180' : ''}`} /> : null}
      </button>

      <div
        className={`ml-4 overflow-hidden border-l border-slate-200 pl-3 transition-all duration-300 ease-out ${
          sidebarOpen ? 'group-hover/sidebar-section:max-h-64 group-hover/sidebar-section:translate-x-0 group-hover/sidebar-section:opacity-100' : ''
        } ${
          expanded ? 'max-h-64 translate-x-0 opacity-100' : 'max-h-0 -translate-x-2 opacity-0'
        }`}
      >
        <div className="space-y-1 py-1">
          {section.children.map((item) => (
            <NavLink
              key={`${section.id}-${item.label}`}
              to={item.to}
              end
              className={({ isActive }) =>
                `flex h-9 translate-x-0 items-center gap-2 rounded-md px-3 text-sm font-medium transition duration-300 ease-out hover:translate-x-1 ${
                  isActive
                    ? 'bg-white text-brand-700 shadow-sm ring-1 ring-brand-100'
                    : 'text-slate-600 hover:bg-white hover:text-slate-950'
                }`
              }
            >
              <item.icon size={15} className="text-brand-500" />
              {item.label}
            </NavLink>
          ))}
        </div>
      </div>
    </div>
  );
}

export function AppShell({ role }) {
  const [isSidebarHovered, setIsSidebarHovered] = useState(false);
  const location = useLocation();
  const { logout, user } = useAuth();
  const navConfig = filterNavConfig(navByRole[role] || navByRole.admin, role, user);
  const [openSections, setOpenSections] = useState(() =>
    Object.fromEntries((navConfig.sections || []).map((section) => [section.id, section.id === 'assessments']))
  );

  if (role === 'student') {
    if (location.pathname.includes('/attempt')) {
      return (
        <div className="student-theme min-h-screen bg-[#f6f7f9]">
          <Outlet />
        </div>
      );
    }

    return (
      <div className="student-theme min-h-screen bg-[#f6f7f9]">
        <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
          <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between px-5 sm:px-6">
            <NavLink to="/student" className="flex items-center gap-3" aria-label="Evalora exam dashboard">
              <img src="/logo.webp" alt="Evalora" className="h-10 w-auto max-w-[160px] object-contain object-left" />
            </NavLink>
            <div className="flex items-center gap-3">
              <div className="hidden text-right sm:block">
                <p className="text-sm font-semibold text-slate-900">{user?.name || 'Student'}</p>
                <p className="text-xs text-slate-500">Student portal</p>
              </div>
              <div className="grid h-9 w-9 place-items-center rounded-md border border-brand-100 bg-brand-50 text-sm font-semibold text-brand-700">
                {(user?.name || 'S').charAt(0).toUpperCase()}
              </div>
              <button className="secondary-button hidden sm:inline-flex" onClick={logout}>
                <LogOut size={16} className="text-brand-500" />
                Logout
              </button>
              <button className="grid h-10 w-10 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 sm:hidden" onClick={logout} aria-label="Logout">
                <LogOut size={17} />
              </button>
            </div>
          </div>
        </header>
        <main>
          <Outlet />
        </main>
      </div>
    );
  }

  function toggleSection(sectionId) {
    setOpenSections((current) => ({
      ...current,
      [sectionId]: !current[sectionId],
    }));
  }

  return (
    <div className="min-h-screen bg-[#f6f7f9]">
      <aside
        className={`fixed inset-y-0 left-0 z-30 hidden overflow-hidden border-r border-slate-200 bg-white shadow-[8px_0_30px_rgba(15,23,42,0.08)] transition-all duration-300 ease-out lg:block ${
          isSidebarHovered ? 'w-[292px]' : 'w-[84px]'
        }`}
        onMouseEnter={() => setIsSidebarHovered(true)}
        onMouseLeave={() => setIsSidebarHovered(false)}
      >
        <div className={`flex items-center border-b border-slate-200 transition-all duration-300 ${isSidebarHovered ? 'h-24 justify-start px-4' : 'h-20 justify-center px-2'}`}>
          <img
            src="/logo.webp"
            alt="Evalora"
            className={`object-contain transition-all duration-300 ${isSidebarHovered ? 'h-20 w-60 object-left' : 'h-12 w-14 object-center'}`}
          />
        </div>

        <div className={`overflow-hidden border-b border-slate-100 transition-all duration-300 ${isSidebarHovered ? 'max-h-24 px-5 py-4 opacity-100' : 'max-h-0 px-5 py-0 opacity-0'}`}>
          <p className="field-label text-slate-400">Workspace</p>
          <p className="mt-1 truncate text-sm font-semibold text-slate-900">{roleTitles[role]}</p>
        </div>

        <nav className={`max-h-[calc(100vh-96px)] space-y-2 overflow-y-auto py-5 transition-all duration-300 ${isSidebarHovered ? 'px-4' : 'px-3'}`}>
          <NavLink
            to={navConfig.dashboard}
            end
            className={({ isActive }) =>
              `flex h-11 translate-x-0 items-center rounded-md border text-sm font-semibold transition duration-300 ease-out hover:translate-x-1 ${
                isSidebarHovered ? 'justify-start gap-3 px-3' : 'justify-center px-0'
              } ${
                isActive
                  ? 'border-brand-300 bg-brand-50 text-brand-700'
                  : 'border-transparent text-slate-700 hover:border-slate-200 hover:bg-slate-50'
              }`
            }
          >
            <LayoutDashboard size={18} className="text-brand-500" />
            <span className={`overflow-hidden whitespace-nowrap transition-all duration-300 ${isSidebarHovered ? 'max-w-[180px] opacity-100' : 'max-w-0 opacity-0'}`}>
              Dashboard
            </span>
          </NavLink>

          {(navConfig.sections || []).map((section) => (
            <SidebarSection
              key={section.id}
              section={section}
              isOpen={Boolean(openSections[section.id])}
              sidebarOpen={isSidebarHovered}
              onToggle={() => toggleSection(section.id)}
            />
          ))}
        </nav>
      </aside>

      <div className="transition-[padding] duration-300 lg:pl-[84px]">
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-slate-200 bg-white/95 px-6 backdrop-blur">
          <div>
            <p className="field-label text-brand-600">Evalora</p>
            <h1 className="text-base font-semibold text-slate-950">{user?.name || 'Operations Console'}</h1>
          </div>

          <button className="secondary-button" onClick={logout}>
            <LogOut size={16} className="text-brand-500" />
            Logout
          </button>
        </header>

        <main className="p-5 xl:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
