import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Eye, Lock, Settings, ShieldCheck, Video } from 'lucide-react';
import { api } from '../../lib/api';
import { EmptyState, SectionPanel } from '../../ui/Surface.jsx';
import { AssessmentWorkspaceHeader } from './AssessmentWorkspaceHeader.jsx';

const settingGroups = [
  {
    title: 'Access and Proctoring',
    icon: Lock,
    keys: [
      'proctoringEnabled',
      'chatEnabled',
      'proctorGlobalChatEnabled',
      'warningMessagesEnabled',
      'ufmActionEnabled',
      'screenMonitoringEnabled',
      'proctorAlertPopupEnabled',
      'maxStudentsPerProctor',
      'liveStatusPollingSeconds',
      'suspiciousActivityThresholdPerMinute',
    ],
  },
  {
    title: 'Browser Security',
    icon: ShieldCheck,
    keys: ['fullscreenEnabled', 'requireFullscreenBeforeStart', 'maxFullscreenExits', 'fullscreenAction', 'tabSwitchDetection', 'maxTabSwitches', 'tabSwitchAction', 'copyPasteDisabled', 'rightClickDisabled', 'shortcutBlocking', 'screenshotWarning', 'multipleTabDetection', 'idleDetection', 'idleThresholdMinutes'],
  },
  {
    title: 'Camera and Microphone',
    icon: Video,
    keys: ['cameraRequired', 'cameraMonitoring', 'snapshotIntervalSeconds', 'cameraMissingAction', 'microphoneRequired', 'noiseMonitoring', 'noiseThreshold'],
  },
  {
    title: 'AI Proctoring',
    icon: Eye,
    keys: ['aiProctoringEnabled', 'detectNoFace', 'detectMultipleFaces', 'detectMultiplePersons', 'detectMobilePhone', 'detectLookingAway', 'detectCameraBlocked', 'detectionIntervalMs', 'confidenceThreshold', 'violationCooldownSeconds'],
  },
  {
    title: 'Watermark, Enforcement, Reminders',
    icon: Settings,
    keys: ['watermarkEnabled', 'watermarkOpacity', 'watermarkFontSize', 'warningScore', 'pauseScore', 'autoSubmitScore', 'maxWarningCount', 'securityRecheckEnabled', 'securityRecheckTimeoutSeconds', 'negativeMarkingEnabled', 'negativeMarkingPercent', 'reminder24Hours', 'reminder1Hour', 'reminder10Minutes', 'showResultToStudent'],
  },
];

function formatKey(key) {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, (char) => char.toUpperCase());
}

function formatValue(value) {
  if (typeof value === 'boolean') return value ? 'Enabled' : 'Disabled';
  if (value === undefined || value === null || value === '') return 'Not set';
  return String(value);
}

export function AssessmentSettingsPage() {
  const { assessmentId } = useParams();
  const [assessment, setAssessment] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const settings = useMemo(() => assessment?.settings || {}, [assessment]);

  useEffect(() => {
    let ignore = false;

    async function loadAssessment() {
      setIsLoading(true);
      setError('');
      try {
        const response = await api.get(`/assessments/${assessmentId}`);
        if (!ignore) setAssessment(response.data.assessment);
      } catch (requestError) {
        if (!ignore) setError(requestError.response?.data?.message || 'Unable to load assessment settings.');
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
        active="settings"
        description="Review full PeerPrep-style security, proctoring, AI, watermark, and reminder configuration for this assessment."
      />

      {error ? <div className="border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div> : null}

      {isLoading ? (
        <SectionPanel>
          <EmptyState title="Loading settings" />
        </SectionPanel>
      ) : (
        <div className="grid gap-5 xl:grid-cols-2">
          {settingGroups.map((group) => (
            <SectionPanel key={group.title} title={group.title} icon={group.icon}>
              <div className="divide-y divide-slate-200">
                {group.keys.map((key) => (
                  <div className="flex items-center justify-between gap-4 px-4 py-3" key={key}>
                    <p className="text-sm font-medium text-slate-700">{formatKey(key)}</p>
                    <span className={typeof settings[key] === 'boolean' ? `status-badge ${settings[key] ? 'status-active' : 'status-draft'}` : 'text-sm font-semibold text-slate-900'}>
                      {formatValue(settings[key])}
                    </span>
                  </div>
                ))}
              </div>
            </SectionPanel>
          ))}
        </div>
      )}
    </section>
  );
}
