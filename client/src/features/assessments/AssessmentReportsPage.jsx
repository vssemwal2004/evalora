import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { BarChart3, ClipboardList, Download, Search, ShieldAlert, Users } from 'lucide-react';
import { api } from '../../lib/api';
import { EmptyState, MetricCard, PageHeader, SectionPanel } from '../../ui/Surface.jsx';

function getBasePath(pathname) {
  return pathname.startsWith('/super-admin') ? '/super-admin' : '/admin';
}

function statusClass(status) {
  return `status-badge status-${String(status || 'draft').replace(/\s+/g, '_')}`;
}

export function AssessmentReportsPage() {
  const location = useLocation();
  const basePath = useMemo(() => getBasePath(location.pathname), [location.pathname]);
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState('');
  const [course, setCourse] = useState('');
  const [appliedFilters, setAppliedFilters] = useState({ search: '', course: '' });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const loadReports = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const response = await api.get('/assessments', {
        params: {
          search: appliedFilters.search || undefined,
          course: appliedFilters.course || undefined,
        },
      });
      setItems(response.data.items);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to load assessment reports.');
    } finally {
      setIsLoading(false);
    }
  }, [appliedFilters]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const totals = items.reduce(
    (acc, item) => ({
      assessments: acc.assessments + 1,
      students: acc.students + (item.counts?.students || 0),
      proctors: acc.proctors + (item.counts?.proctors || 0),
      questions: acc.questions + (item.counts?.questions || 0),
    }),
    { assessments: 0, students: 0, proctors: 0, questions: 0 }
  );

  return (
    <section className="space-y-5">
      <PageHeader
        eyebrow="Assessment Reports"
        title="Reports"
        description="Review assessment readiness, participation counts, and security/reporting status before detailed analytics are added."
        actions={<button className="secondary-button" type="button" disabled>
          <Download size={16} className="text-brand-500" />
          Export Later
        </button>}
      />

      {error ? <div className="border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div> : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Assessments" value={isLoading ? '...' : totals.assessments} icon={ClipboardList} />
        <MetricCard label="Students" value={isLoading ? '...' : totals.students} icon={Users} />
        <MetricCard label="Questions" value={isLoading ? '...' : totals.questions} icon={BarChart3} />
        <MetricCard label="UFM cases" value="0" icon={ShieldAlert} tone="warning" />
      </div>

      <SectionPanel title="Assessment Report Index" description="Detailed score, violation, mail, and UFM reports will open from this table." icon={BarChart3}>
        <div className="toolbar">
          <div className="search-field">
            <Search size={16} className="text-brand-500" />
            <input
              className="h-10 flex-1 border-0 px-2 text-sm outline-none"
              placeholder="Search assessment or code"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <input
            className="field-input max-w-[240px]"
            placeholder="Course name or ID"
            value={course}
            onChange={(event) => setCourse(event.target.value)}
          />
          <button className="secondary-button" type="button" onClick={() => setAppliedFilters({ search, course })}>
            Apply
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Assessment</th>
                <th>Students</th>
                <th>Questions</th>
                <th>Proctors</th>
                <th>Status</th>
                <th>Report</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {isLoading ? (
                <tr>
                  <td className="text-center text-slate-500" colSpan={6}>Loading reports...</td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <EmptyState title="No report data found" description="Reports appear after assessments are created and assigned." />
                  </td>
                </tr>
              ) : (
                items.map((assessment) => (
                  <tr key={assessment._id}>
                    <td>
                      <p className="font-semibold text-slate-950">{assessment.title}</p>
                      <p className="text-xs text-slate-500">{assessment.assessmentCode}</p>
                    </td>
                    <td className="text-slate-700">{assessment.counts?.students || 0}</td>
                    <td className="text-slate-700">{assessment.counts?.questions || 0}</td>
                    <td className="text-slate-700">{assessment.counts?.proctors || 0}</td>
                    <td><span className={statusClass(assessment.operationalStatus || assessment.status)}>{assessment.operationalStatus || assessment.status}</span></td>
                    <td>
                      <Link className="secondary-button h-8 px-2 text-xs" to={`${basePath}/assessments/${assessment._id}/students`}>
                        Open Data
                      </Link>
                    </td>
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
