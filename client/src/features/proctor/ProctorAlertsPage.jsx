import { BellRing, ShieldAlert } from 'lucide-react';
import { EmptyState, PageHeader, SectionPanel } from '../../ui/Surface.jsx';

export function ProctorAlertsPage() {
  return (
    <section className="space-y-5">
      <PageHeader
        eyebrow="Proctor Panel"
        title="Alerts"
        description="AI and browser-security alerts will be prioritized here for quick proctor action."
      />

      <SectionPanel title="Realtime Alert Queue" description="Looking away, tab switch, no face, multiple face, and movement alerts will stream into this queue." icon={BellRing}>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Alert</th>
                <th>Severity</th>
                <th>Count</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={5}>
                  <EmptyState title="No alerts right now" description="Confirmed AI/security events will appear here during live exams." />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </SectionPanel>

      <SectionPanel title="UFM Review" description="UFM declarations and reversible admin review will be connected in the next implementation phase." icon={ShieldAlert}>
        <EmptyState title="No UFM cases" description="When a proctor declares UFM, the case will be listed for review." />
      </SectionPanel>
    </section>
  );
}
