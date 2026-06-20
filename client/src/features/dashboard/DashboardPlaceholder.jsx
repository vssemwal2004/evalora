import { useEffect, useState } from 'react';
import { Activity, AlertTriangle, ClipboardList, Mail, ShieldAlert, UserCog, Users, Video } from 'lucide-react';
import { api } from '../../lib/api';
import { EmptyState, MetricCard, PageHeader, SectionPanel } from '../../ui/Surface.jsx';

export function DashboardPlaceholder({ title }) {
  const [summary, setSummary] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let ignore = false;

    async function loadSummary() {
      try {
        const response = await api.get('/dashboard/summary');
        if (!ignore) {
          setSummary(response.data);
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    }

    loadSummary();

    return () => {
      ignore = true;
    };
  }, []);

  const counts = summary?.counts || {};
  const metrics = [
    { label: 'Admins', value: counts.admins ?? '-', icon: UserCog },
    { label: 'Assessments', value: counts.assessments ?? 0, icon: ClipboardList },
    { label: 'Students', value: counts.students ?? 0, icon: Users },
    { label: 'Proctors', value: counts.proctors ?? 0, icon: Video },
    { label: 'Active exams', value: counts.activeAssessments ?? 0, icon: Activity },
    { label: 'Pending mails', value: counts.pendingMails ?? 0, icon: Mail },
    { label: 'UFM cases', value: counts.ufmCases ?? 0, icon: ShieldAlert },
    { label: 'Open alerts', value: 0, icon: AlertTriangle },
  ];

  return (
    <section className="space-y-5">
      <PageHeader
        eyebrow="Operations"
        title={title}
        description="Live operational summary for assessments, users, mail status, and security signals."
      />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <MetricCard
            key={metric.label}
            label={metric.label}
            value={isLoading ? '...' : metric.value}
            icon={metric.icon}
            tone={metric.label === 'UFM cases' || metric.label === 'Open alerts' ? 'warning' : 'default'}
          />
        ))}
      </div>

      <SectionPanel title="Recent Activity" description="Latest sensitive actions and audit events." icon={Activity}>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Action</th>
                <th>Target</th>
                <th>Actor role</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {(summary?.recentActivity || []).length === 0 ? (
                <tr>
                  <td colSpan={4}>
                    <EmptyState title="No audit activity yet" description="Important admin actions will appear here after the workflow starts." />
                  </td>
                </tr>
              ) : (
                summary.recentActivity.map((item) => (
                  <tr key={item._id}>
                    <td className="font-medium text-slate-900">{item.action}</td>
                    <td className="text-slate-600">{item.targetType}</td>
                    <td className="text-slate-600">{item.actorRole}</td>
                    <td className="text-slate-500">{new Date(item.createdAt).toLocaleString()}</td>
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
