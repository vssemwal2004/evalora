import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useState } from 'react';
import {
  BarChart3,
  BookOpen,
  Activity,
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
  Settings as SettingsIcon,
  UserPlus,
  UserRoundCog,
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
          { label: 'Overall', to: '/super-admin/assessments', icon: NotebookTabs },
          { label: 'Create Assessment', to: '/super-admin/assessments/create', icon: FilePlus2 },
          { label: 'Assessment Reports', to: '/super-admin/assessments/reports', icon: BarChart3 },
          { label: 'My Assessments', to: '/super-admin/assessments/my', icon: ClipboardList },
          { label: 'Review Assessments', to: '/super-admin/assessments/review', icon: ListChecks },
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
        id: 'students',
        label: 'Students',
        icon: Users,
        children: [
          { label: 'View Students', to: '/super-admin/students/view', icon: ListChecks },
        ],
      },
      {
        id: 'faculty',
        label: 'Faculty',
        icon: UserRoundCog,
        children: [
          { label: 'Create Faculty', to: '/super-admin/faculty/create', icon: UserPlus },
          { label: 'View Faculty', to: '/super-admin/faculty/view', icon: ListChecks },
        ],
      },
      {
        id: 'moderators',
        label: 'Moderators',
        icon: Shield,
        children: [
          { label: 'Create Moderator', to: '/super-admin/moderators/create', icon: UserPlus },
          { label: 'View Moderators', to: '/super-admin/moderators/view', icon: ListChecks },
        ],
      },
      {
        id: 'activity',
        label: 'Log Activity',
        icon: Activity,
        children: [
          { label: 'Activity Logs', to: '/super-admin/activity', icon: Activity },
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
      {
        id: 'settings',
        label: 'Settings',
        icon: SettingsIcon,
        children: [
          { label: 'Account Settings', to: '/super-admin/settings', icon: SettingsIcon },
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
          { label: 'Overall', to: '/admin/assessments', icon: NotebookTabs, permission: 'assessment.view' },
          { label: 'Create Assessment', to: '/admin/assessments/create', icon: FilePlus2, permission: 'assessment.create' },
          { label: 'Assessment Reports', to: '/admin/assessments/reports', icon: BarChart3, permission: 'reports.view' },
          { label: 'My Assessments', to: '/admin/assessments/my', icon: ClipboardList, permission: 'assessment.view' },
          { label: 'Review Assessments', to: '/admin/assessments/review', icon: ListChecks, permission: 'assessment.view' },
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
        id: 'students',
        label: 'Students',
        icon: Users,
        children: [
          { label: 'View Students', to: '/admin/students/view', icon: ListChecks, permission: 'student.view' },
        ],
      },
      {
        id: 'faculty',
        label: 'Faculty',
        icon: UserRoundCog,
        children: [
          { label: 'Create Faculty', to: '/admin/faculty/create', icon: UserPlus, permission: 'faculty.create' },
          { label: 'View Faculty', to: '/admin/faculty/view', icon: ListChecks, permission: 'faculty.view' },
        ],
      },
      {
        id: 'moderators',
        label: 'Moderators',
        icon: Shield,
        children: [
          { label: 'Create Moderator', to: '/admin/moderators/create', icon: UserPlus, permission: 'moderator.create' },
          { label: 'View Moderators', to: '/admin/moderators/view', icon: ListChecks, permission: 'moderator.view' },
        ],
      },
      {
        id: 'activity',
        label: 'Log Activity',
        icon: Activity,
        children: [
          {
            label: 'Activity Logs',
            to: '/admin/activity',
            icon: Activity,
            anyPermissions: ['activity.faculty.view', 'activity.moderator.view', 'audit.view'],
          },
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
      {
        id: 'settings',
        label: 'Settings',
        icon: SettingsIcon,
        children: [
          { label: 'Account Settings', to: '/admin/settings', icon: SettingsIcon },
        ],
      },
    ],
  },
  faculty: {
    dashboard: '/faculty',
    sections: [
      {
        id: 'faculty-work',
        label: 'Assessments',
        icon: ClipboardList,
        children: [
          { label: 'Assigned Work', to: '/faculty', icon: NotebookTabs },
        ],
      },
      {
        id: 'faculty-library',
        label: 'My Library',
        icon: BookOpen,
        children: [
          { label: 'Add Questions', to: '/faculty/library/add', icon: Plus, permission: 'library.create' },
          { label: 'View Library', to: '/faculty/library/view', icon: BookOpen, permission: 'library.view' },
        ],
      },
      {
        id: 'settings',
        label: 'Settings',
        icon: SettingsIcon,
        children: [
          { label: 'Account Settings', to: '/faculty/settings', icon: SettingsIcon },
        ],
      },
    ],
  },
  moderator: {
    dashboard: '/moderator',
    sections: [
      {
        id: 'moderation-work',
        label: 'Reviews',
        icon: Shield,
        children: [
          { label: 'Review Queue', to: '/moderator', icon: NotebookTabs },
        ],
      },
      {
        id: 'settings',
        label: 'Settings',
        icon: SettingsIcon,
        children: [
          { label: 'Account Settings', to: '/moderator/settings', icon: SettingsIcon },
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
  const canAccess = (item) => {
    if (item.anyPermissions) return item.anyPermissions.some((permission) => permissions.has(permission));
    return !item.permission || permissions.has(item.permission);
  };

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
  faculty: 'Faculty',
  moderator: 'Moderator',
  student: 'Student',
  proctor: 'Proctor',
};

function SidebarSection({ section, isOpen, onToggle, sidebarOpen }) {
  const location = useLocation();
  const isSectionActive = section.children.some((child) => location.pathname === child.to || location.pathname.startsWith(`${child.to}/`));
  const expanded = sidebarOpen && (isOpen || isSectionActive);

  return (
    <div className="space-y-1">
      <button
        className={`group relative flex h-10 w-full items-center overflow-hidden rounded-xl border text-[12px] font-semibold transition-all duration-200 ease-out ${
          sidebarOpen ? 'justify-between px-2' : 'justify-center px-0'
        } ${
          expanded || isSectionActive
            ? 'border-brand-100 bg-brand-50/90 text-brand-700 shadow-[0_8px_22px_rgba(249,115,22,0.12)]'
            : 'border-transparent text-slate-600 hover:border-slate-200 hover:bg-slate-50 hover:text-slate-950'
        }`}
        type="button"
        onClick={onToggle}
        title={section.label}
        aria-expanded={expanded}
      >
        {(expanded || isSectionActive) ? <span className="absolute left-0 top-2 h-6 w-1 rounded-r-full bg-brand-500" /> : null}
        <span className={`flex min-w-0 items-center ${sidebarOpen ? 'gap-2' : 'justify-center'}`}>
          <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg transition-all duration-200 ${
            expanded || isSectionActive ? 'bg-white text-brand-600 shadow-sm' : 'bg-slate-100 text-slate-500 group-hover:bg-white group-hover:text-brand-600'
          }`}>
            <section.icon size={15} />
          </span>
          <span className={`overflow-hidden truncate whitespace-nowrap transition-all duration-200 ${sidebarOpen ? 'max-w-[142px] opacity-100' : 'max-w-0 opacity-0'}`}>
            {section.label}
          </span>
        </span>
        {sidebarOpen ? <ChevronDown size={13} className={`shrink-0 text-slate-400 transition-transform duration-200 ${expanded ? 'rotate-180 text-brand-500' : ''}`} /> : null}
      </button>

      <div
        className={`ml-3 overflow-hidden border-l border-slate-200 pl-2.5 transition-all duration-300 ease-out ${
          expanded ? 'max-h-72 translate-x-0 opacity-100' : 'max-h-0 -translate-x-1 opacity-0'
        }`}
      >
        <div className="space-y-0.5 py-1">
          {section.children.map((item) => (
            <NavLink
              key={`${section.id}-${item.label}`}
              to={item.to}
              end
              className={({ isActive }) =>
                `flex h-8 items-center gap-2 rounded-lg px-2 text-[12px] font-semibold transition-all duration-200 ease-out ${
                  isActive
                    ? 'border border-brand-100 bg-white text-brand-700 shadow-sm'
                    : 'border border-transparent text-slate-500 hover:translate-x-0.5 hover:bg-white hover:text-slate-900'
                }`
              }
            >
              <item.icon size={13} className="shrink-0 text-brand-500" />
              <span className="truncate">{item.label}</span>
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
    <div className={`ops-shell ops-shell-${role} min-h-screen bg-[#f6f7f9]`}>
      <aside
        className={`fixed inset-y-0 left-0 z-30 hidden overflow-hidden border-r border-slate-200 bg-white/95 shadow-[10px_0_34px_rgba(15,23,42,0.08)] backdrop-blur-xl transition-all duration-300 ease-out lg:block ${
          isSidebarHovered ? 'w-[226px]' : 'w-[68px]'
        }`}
        onMouseEnter={() => setIsSidebarHovered(true)}
        onMouseLeave={() => setIsSidebarHovered(false)}
      >
        <div className={`flex items-center border-b border-slate-200 transition-all duration-300 ${isSidebarHovered ? 'h-16 justify-start px-4' : 'h-16 justify-center px-2'}`}>
          <img
            src="/logo.webp"
            alt="Evalora"
            className={`object-contain transition-all duration-300 ${isSidebarHovered ? 'h-10 w-32 object-left' : 'h-9 w-10 object-center'}`}
          />
        </div>

        <div className={`overflow-hidden border-b border-slate-100 transition-all duration-300 ${isSidebarHovered ? 'max-h-16 px-3 py-2.5 opacity-100' : 'max-h-0 px-3 py-0 opacity-0'}`}>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-[9px] font-bold uppercase text-slate-400">Workspace</p>
            <p className="mt-0.5 truncate text-[12px] font-bold text-slate-800">{roleTitles[role]}</p>
          </div>
        </div>

        <nav className={`max-h-[calc(100vh-150px)] space-y-1 overflow-y-auto py-3 transition-all duration-300 ${isSidebarHovered ? 'px-2.5' : 'px-2'}`}>
          <NavLink
            to={navConfig.dashboard}
            end
            className={({ isActive }) =>
              `group relative flex h-10 items-center overflow-hidden rounded-xl border text-[12px] font-semibold transition-all duration-200 ease-out ${
                isSidebarHovered ? 'justify-start gap-2 px-2' : 'justify-center px-0'
              } ${
                isActive
                  ? 'border-brand-100 bg-brand-50/90 text-brand-700 shadow-[0_8px_22px_rgba(249,115,22,0.12)]'
                  : 'border-transparent text-slate-600 hover:border-slate-200 hover:bg-slate-50 hover:text-slate-950'
              }`
            }
          >
            {({ isActive }) => (
              <>
                {isActive ? <span className="absolute left-0 top-2 h-6 w-1 rounded-r-full bg-brand-500" /> : null}
                <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg transition-all duration-200 ${
                  isActive ? 'bg-white text-brand-600 shadow-sm' : 'bg-slate-100 text-slate-500 group-hover:bg-white group-hover:text-brand-600'
                }`}>
                  <LayoutDashboard size={15} />
                </span>
                <span className={`overflow-hidden truncate whitespace-nowrap transition-all duration-200 ${isSidebarHovered ? 'max-w-[142px] opacity-100' : 'max-w-0 opacity-0'}`}>
                  Dashboard
                </span>
              </>
            )}
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

        <div className={`absolute inset-x-0 bottom-0 border-t border-slate-200 bg-white/95 p-2 transition-all duration-300 ${isSidebarHovered ? 'opacity-100' : 'opacity-100'}`}>
          <div className={`flex items-center rounded-xl border border-slate-200 bg-slate-50 transition-all duration-300 ${isSidebarHovered ? 'gap-2 px-2.5 py-2' : 'justify-center px-1 py-2'}`}>
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-500 text-xs font-bold text-white shadow-sm">
              {(user?.name || roleTitles[role] || 'E').charAt(0).toUpperCase()}
            </div>
            <div className={`min-w-0 overflow-hidden transition-all duration-200 ${isSidebarHovered ? 'max-w-[132px] opacity-100' : 'max-w-0 opacity-0'}`}>
              <p className="truncate text-[12px] font-bold text-slate-900">{user?.name || roleTitles[role]}</p>
              <p className="truncate text-[10px] font-semibold text-slate-500">{roleTitles[role]}</p>
            </div>
          </div>
        </div>
      </aside>

      <div className="transition-[padding] duration-300 lg:pl-[68px]">
        <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-slate-200 bg-white/95 px-5 backdrop-blur">
          <div>
            <p className="field-label text-brand-600">Evalora</p>
            <h1 className="text-base font-semibold text-slate-950">{user?.name || 'Operations Console'}</h1>
          </div>

          <button className="secondary-button" onClick={logout}>
            <LogOut size={16} className="text-brand-500" />
            Logout
          </button>
        </header>

        <main className="p-4 xl:p-5">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
