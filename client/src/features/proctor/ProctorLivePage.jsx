import { MessageSquare, ShieldAlert, Users, Video } from 'lucide-react';
import { EmptyState, MetricCard, PageHeader, SectionPanel } from '../../ui/Surface.jsx';

export function ProctorLivePage() {
  return (
    <section className="space-y-5">
      <PageHeader
        eyebrow="Proctor Panel"
        title="Live Monitoring"
        description="Proctors will monitor assigned students only. Video streams open on selection, while the grid stays lightweight for scale."
      />

      <div className="grid gap-3 md:grid-cols-4">
        <MetricCard label="Assigned students" value="0" icon={Users} />
        <MetricCard label="Online" value="0" icon={Video} />
        <MetricCard label="Alerts" value="0" icon={ShieldAlert} tone="warning" />
        <MetricCard label="Open chats" value="0" icon={MessageSquare} />
      </div>

      <SectionPanel title="Student Monitoring Grid" description="Status cards, risk score, chat, warning, and UFM actions will be managed here." icon={Video}>
        <EmptyState title="No active monitoring session" description="Assigned students will appear here when an exam is live." />
      </SectionPanel>
    </section>
  );
}
