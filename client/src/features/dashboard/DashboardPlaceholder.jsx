import { useEffect, useState } from 'react';
import { Activity, ClipboardList, FileText, Mail, ShieldAlert, ShieldCheck, UserCog, UserRoundCog, Users, Video } from 'lucide-react';
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
    { label: 'Published', value: counts.publishedAssessments ?? 0, icon: ShieldCheck },
    { label: 'In Review', value: counts.reviewAssessments ?? 0, icon: FileText },
    { label: 'Students', value: counts.students ?? 0, icon: Users },
    { label: 'Faculty', value: counts.faculty ?? 0, icon: UserRoundCog },
    { label: 'Moderators', value: counts.moderators ?? 0, icon: ShieldAlert },
    { label: 'Proctors', value: counts.proctors ?? 0, icon: Video },
    { label: 'Pending mails', value: counts.pendingMails ?? 0, icon: Mail },
    { label: 'Email templates', value: counts.emailTemplates ?? 0, icon: Mail },
    { label: 'UFM cases', value: counts.ufmCases ?? 0, icon: ShieldAlert },
  ];

  function formatAction(action) {
    const labels = {
      'assessment.create': 'Created assessment',
      'assessment.update': 'Edited assessment',
      'assessment.status.update': 'Changed assessment status',
      'assessment.student.bulk_send_mail': 'Sent student mails',
      'assessment.proctor.bulk_send_mail': 'Sent proctor mails',
      'email.template.update': 'Updated email template',
      'email.template.reset': 'Reset email template',
      'work.submit': 'Faculty submitted questions',
      'work.approve': 'Moderator approved work',
      'work.reject': 'Moderator rejected work',
    };
    return labels[action] || String(action || '').replace(/\./g, ' ');
  }

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
                    <td className="font-medium text-slate-900">{formatAction(item.action)}</td>
                    <td className="text-slate-600">{item.targetType}</td>
                    <td className="text-slate-600">{item.actorName || item.actorRole}</td>
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
