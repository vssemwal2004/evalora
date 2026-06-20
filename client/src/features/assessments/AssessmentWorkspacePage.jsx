import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { CalendarClock, ClipboardList, KeyRound, Settings, Users, Video } from 'lucide-react';
import { api } from '../../lib/api';
import { EmptyState, MetricCard, SectionPanel } from '../../ui/Surface.jsx';
import { AssessmentWorkspaceHeader } from './AssessmentWorkspaceHeader.jsx';

function getRoleBase(pathname) {
  return pathname.startsWith('/super-admin') ? '/super-admin' : '/admin';
}

function formatDate(value) {
  return value ? new Date(value).toLocaleString() : 'Not set';
}

function statusClass(status) {
  return `status-badge status-${String(status || 'draft').replace(/\s+/g, '_')}`;
}

export function AssessmentWorkspacePage() {
  const { assessmentId } = useParams();
  const location = useLocation();
  const roleBase = getRoleBase(location.pathname);
  const [assessment, setAssessment] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let ignore = false;

    async function loadAssessment() {
      setIsLoading(true);
      setError('');
      try {
        const response = await api.get(`/assessments/${assessmentId}`);
        if (!ignore) setAssessment(response.data.assessment);
      } catch (requestError) {
        if (!ignore) setError(requestError.response?.data?.message || 'Unable to load assessment workspace.');
      } finally {
        if (!ignore) setIsLoading(false);
      }
    }

    loadAssessment();
    return () => {
      ignore = true;
    };
  }, [assessmentId]);

  return (
    <section className="space-y-5">
      <AssessmentWorkspaceHeader
        assessment={assessment}
        active="basic"
        description="Review assessment basics, course mapping, schedule, counts, and move into students, proctors, questions, or settings."
      />

      {error ? <div className="border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div> : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Courses" value={isLoading ? '...' : assessment?.counts?.courses || 0} icon={ClipboardList} />
        <MetricCard label="Students" value={isLoading ? '...' : assessment?.counts?.students || 0} icon={Users} />
        <MetricCard label="Proctors" value={isLoading ? '...' : assessment?.counts?.proctors || 0} icon={Video} />
        <MetricCard label="Questions" value={isLoading ? '...' : assessment?.counts?.questions || 0} icon={ClipboardList} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
        <SectionPanel title="Basic Details" description="Core assessment identity and schedule." icon={CalendarClock}>
          {isLoading ? (
            <EmptyState title="Loading assessment" />
          ) : assessment ? (
            <div className="grid gap-4 p-5 md:grid-cols-2">
              <div>
                <p className="field-label">Assessment code</p>
                <p className="mt-2 text-sm font-semibold text-slate-950">{assessment.assessmentCode}</p>
              </div>
              <div>
                <p className="field-label">Status</p>
                <p className="mt-2"><span className={statusClass(assessment.operationalStatus || assessment.status)}>{assessment.operationalStatus || assessment.status}</span></p>
              </div>
              <div>
                <p className="field-label">Start time</p>
                <p className="mt-2 text-sm text-slate-700">{formatDate(assessment.startAt)}</p>
              </div>
              <div>
                <p className="field-label">End time</p>
                <p className="mt-2 text-sm text-slate-700">{formatDate(assessment.endAt)}</p>
              </div>
              <div>
                <p className="field-label">Duration</p>
                <p className="mt-2 text-sm text-slate-700">{assessment.globalDurationMinutes || 0} minutes</p>
              </div>
              <div>
                <p className="field-label">Visibility</p>
                <p className="mt-2 text-sm capitalize text-slate-700">{assessment.visibility}</p>
              </div>
              <div className="md:col-span-2">
                <p className="field-label">Description</p>
                <p className="mt-2 text-sm leading-6 text-slate-700">{assessment.description || 'No description added.'}</p>
              </div>
              <div className="md:col-span-2">
                <p className="field-label">Instructions</p>
                <p className="mt-2 text-sm leading-6 text-slate-700">{assessment.instructions || 'No instructions added.'}</p>
              </div>
            </div>
          ) : (
            <EmptyState title="Assessment not found" />
          )}
        </SectionPanel>

        <div className="space-y-5">
          <SectionPanel title="Quick Actions" description="Open assessment sub-workflows." icon={KeyRound}>
            <div className="grid gap-2 p-4">
              <Link className="secondary-button justify-start" to={`${roleBase}/assessments/${assessmentId}/students`}>
                <Users size={16} className="text-brand-500" />
                Manage Students
              </Link>
              <Link className="secondary-button justify-start" to={`${roleBase}/assessments/${assessmentId}/proctors`}>
                <Video size={16} className="text-brand-500" />
                Manage Proctors
              </Link>
              <Link className="secondary-button justify-start" to={`${roleBase}/assessments/${assessmentId}/questions`}>
                <ClipboardList size={16} className="text-brand-500" />
                Manage Questions
              </Link>
              <Link className="secondary-button justify-start" to={`${roleBase}/assessments/${assessmentId}/settings`}>
                <Settings size={16} className="text-brand-500" />
                Review Settings
              </Link>
            </div>
          </SectionPanel>
        </div>
      </div>

      <SectionPanel title="Course Mapping" description="Students and questions are matched by course name or course ID.">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Course Name</th>
                <th>Course ID</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {(assessment?.courses || []).length === 0 ? (
                <tr>
                  <td colSpan={2}><EmptyState title="No courses configured" /></td>
                </tr>
              ) : (
                assessment.courses.map((course) => (
                  <tr key={`${course.courseName}-${course.courseId || 'none'}`}>
                    <td className="font-semibold text-slate-900">{course.courseName}</td>
                    <td className="text-slate-600">{course.courseId || '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </SectionPanel>
    </section>
  );
}
