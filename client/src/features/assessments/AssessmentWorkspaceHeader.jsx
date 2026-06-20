import { NavLink, Link, useLocation } from 'react-router-dom';
import { ArrowLeft, BookOpen, ClipboardList, Settings, UserRoundCheck, Users } from 'lucide-react';
import { PageHeader } from '../../ui/Surface.jsx';

function getRoleBase(pathname) {
  return pathname.startsWith('/super-admin') ? '/super-admin' : '/admin';
}

export function AssessmentWorkspaceHeader({ assessment, active, description }) {
  const location = useLocation();
  const roleBase = getRoleBase(location.pathname);
  const assessmentId = assessment?._id;
  const overviewPath = `${roleBase}/assessments`;

  const tabs = assessmentId
    ? [
        { label: 'Basic', to: `${roleBase}/assessments/${assessmentId}`, icon: ClipboardList, end: true, key: 'basic' },
        { label: 'Students', to: `${roleBase}/assessments/${assessmentId}/students`, icon: Users, key: 'students' },
        { label: 'Proctors', to: `${roleBase}/assessments/${assessmentId}/proctors`, icon: UserRoundCheck, key: 'proctors' },
        { label: 'Questions', to: `${roleBase}/assessments/${assessmentId}/questions`, icon: BookOpen, key: 'questions' },
        { label: 'Settings', to: `${roleBase}/assessments/${assessmentId}/settings`, icon: Settings, key: 'settings' },
      ]
    : [];

  return (
    <div className="space-y-3">
      <PageHeader
        eyebrow="Assessment Workspace"
        title={assessment?.title || 'Assessment'}
        description={description}
        actions={<Link className="secondary-button" to={overviewPath}>
          <ArrowLeft size={16} className="text-brand-500" />
          Back to assessments
        </Link>}
      />

      {tabs.length > 0 ? (
        <div className="panel flex flex-wrap gap-1 p-2">
          {tabs.map((tab) => (
            <NavLink
              key={tab.key}
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                `inline-flex h-10 items-center gap-2 rounded-md px-3 text-sm font-semibold transition ${
                  isActive || active === tab.key
                    ? 'bg-brand-50 text-brand-700 ring-1 ring-brand-100'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950'
                }`
              }
            >
              <tab.icon size={16} className="text-brand-500" />
              {tab.label}
            </NavLink>
          ))}
        </div>
      ) : null}
    </div>
  );
}
