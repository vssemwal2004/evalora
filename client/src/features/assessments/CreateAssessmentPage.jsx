import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Bell,
  BookOpen,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Eye,
  FileText,
  FilePlus2,
  Lock,
  Save,
  Settings,
  ShieldCheck,
  UserRoundCheck,
  UserRoundCog,
  Users,
  Video,
} from 'lucide-react';
import { api } from '../../lib/api';
import { AssessmentProctorsPage } from '../proctors/AssessmentProctorsPage.jsx';
import { AssessmentStudentsPage } from '../students/AssessmentStudentsPage.jsx';

const steps = ['Basic', 'Select Courses', 'Add Questions', 'Faculty', 'Moderator', 'Students', 'Proctors', 'Schedule', 'Settings', 'Review'];
const stepIcons = [ClipboardList, ClipboardList, BookOpen, UserRoundCog, ShieldCheck, Users, UserRoundCheck, CalendarClock, Settings, Check];
const stepMeta = [
  { eyebrow: 'Step 1', title: 'Assessment Basics', description: 'Set identity, type, visibility, description, and instructions.' },
  { eyebrow: 'Step 2', title: 'Select Courses', description: 'Choose the master courses that will belong to this assessment.' },
  { eyebrow: 'Step 3', title: 'Question Source & Mapping', description: 'Choose source, select library folders, and map each folder to a selected course.' },
  { eyebrow: 'Step 4', title: 'Faculty Assignment', description: 'Assign faculty by selected course. Use bulk select for available course owners.' },
  { eyebrow: 'Step 5', title: 'Moderator Assignment', description: 'Assign moderators manually for the selected faculty/course paths.' },
  { eyebrow: 'Step 6', title: 'Students', description: 'Add students first, then review the student directory and credentials below.' },
  { eyebrow: 'Step 7', title: 'Proctors', description: 'Add proctors, plan distribution, then review proctor credentials and capacity.' },
  { eyebrow: 'Step 8', title: 'Schedule', description: 'Set exam window and global duration. Assessment password is no longer used.' },
  { eyebrow: 'Step 9', title: 'Security Settings', description: 'Tune proctoring, browser, AI, scoring, and student result settings.' },
  { eyebrow: 'Step 10', title: 'Review & Finish', description: 'Check details, routing, and validation before draft, review, or publish.' },
];
const questionSourceOptions = [
  {
    value: 'faculty',
    label: 'Faculty Questions',
    description: 'Use folders created by faculty for this assessment review path.',
  },
  {
    value: 'both',
    label: 'Admin + Faculty',
    description: 'Use a mixed question source when both teams contribute.',
  },
  {
    value: 'admin',
    label: 'Admin Questions',
    description: 'Use questions created by admin or super admin only.',
  },
];

const defaultSettings = {
  passwordRequired: false,
  proctoringEnabled: false,
  chatEnabled: false,
  warningMessagesEnabled: true,
  ufmActionEnabled: true,
  fullscreenEnabled: true,
  requireFullscreenBeforeStart: true,
  maxFullscreenExits: 3,
  fullscreenAction: 'warn',
  tabSwitchDetection: true,
  maxTabSwitches: 3,
  tabSwitchAction: 'warn',
  copyPasteDisabled: true,
  rightClickDisabled: true,
  shortcutBlocking: true,
  screenshotWarning: true,
  cameraRequired: false,
  cameraMonitoring: false,
  snapshotIntervalSeconds: 30,
  cameraMissingAction: 'warn',
  microphoneRequired: false,
  noiseMonitoring: false,
  noiseThreshold: 70,
  aiProctoringEnabled: false,
  detectNoFace: true,
  detectMultipleFaces: true,
  detectMultiplePersons: true,
  detectMobilePhone: true,
  detectLookingAway: true,
  detectCameraBlocked: true,
  detectionIntervalMs: 1500,
  confidenceThreshold: 0.75,
  violationCooldownSeconds: 10,
  multipleTabDetection: true,
  idleDetection: true,
  idleThresholdMinutes: 5,
  watermarkEnabled: true,
  watermarkOpacity: 0.16,
  watermarkFontSize: 18,
  warningScore: 5,
  pauseScore: 15,
  autoSubmitScore: 30,
  maxWarningCount: 5,
  securityRecheckEnabled: true,
  securityRecheckTimeoutSeconds: 120,
  reminder24Hours: true,
  reminder1Hour: true,
  reminder10Minutes: true,
  showResultToStudent: false,
  negativeMarkingEnabled: false,
  negativeMarkingPercent: 25,
};

const actionOptions = [
  { label: 'Warn only', value: 'warn' },
  { label: 'Pause and recheck', value: 'pause' },
  { label: 'Auto-submit', value: 'autosubmit' },
];

const settingGroups = [
  {
    title: 'Access and Proctoring',
    icon: Lock,
    description: 'Controls live proctoring, chat, warnings, and UFM actions.',
    controls: [
      { type: 'toggle', key: 'proctoringEnabled', label: 'Enable live proctoring' },
      { type: 'toggle', key: 'chatEnabled', label: 'Enable proctor-student chat' },
      { type: 'toggle', key: 'warningMessagesEnabled', label: 'Allow warning messages' },
      { type: 'toggle', key: 'ufmActionEnabled', label: 'Allow UFM action' },
    ],
  },
  {
    title: 'Browser Security',
    icon: ShieldCheck,
    description: 'PeerPrep-style browser controls for fullscreen, tabs, copy/paste, right-click, and shortcuts.',
    controls: [
      { type: 'toggle', key: 'fullscreenEnabled', label: 'Enable fullscreen protection' },
      { type: 'toggle', key: 'requireFullscreenBeforeStart', label: 'Require fullscreen before start' },
      { type: 'number', key: 'maxFullscreenExits', label: 'Max fullscreen exits', min: 0 },
      { type: 'select', key: 'fullscreenAction', label: 'Fullscreen limit action', options: actionOptions },
      { type: 'toggle', key: 'tabSwitchDetection', label: 'Enable tab switch detection' },
      { type: 'number', key: 'maxTabSwitches', label: 'Max tab switches', min: 0 },
      { type: 'select', key: 'tabSwitchAction', label: 'Tab switch limit action', options: actionOptions },
      { type: 'toggle', key: 'copyPasteDisabled', label: 'Disable copy/paste/cut' },
      { type: 'toggle', key: 'rightClickDisabled', label: 'Disable right-click' },
      { type: 'toggle', key: 'shortcutBlocking', label: 'Block restricted shortcuts' },
      { type: 'toggle', key: 'screenshotWarning', label: 'Show screenshot shortcut warning' },
      { type: 'toggle', key: 'multipleTabDetection', label: 'Detect duplicate exam tabs' },
      { type: 'toggle', key: 'idleDetection', label: 'Enable idle detection' },
      { type: 'number', key: 'idleThresholdMinutes', label: 'Idle threshold minutes', min: 1 },
    ],
  },
  {
    title: 'Camera and Microphone',
    icon: Video,
    description: 'Required setup checks and runtime camera/microphone monitoring.',
    controls: [
      { type: 'toggle', key: 'cameraRequired', label: 'Require camera before start' },
      { type: 'toggle', key: 'cameraMonitoring', label: 'Enable camera monitoring' },
      { type: 'number', key: 'snapshotIntervalSeconds', label: 'Snapshot/status interval seconds', min: 5 },
      { type: 'select', key: 'cameraMissingAction', label: 'Camera missing action', options: actionOptions },
      { type: 'toggle', key: 'microphoneRequired', label: 'Require microphone before start' },
      { type: 'toggle', key: 'noiseMonitoring', label: 'Enable noise monitoring' },
      { type: 'number', key: 'noiseThreshold', label: 'Noise threshold', min: 0 },
    ],
  },
  {
    title: 'AI Proctoring',
    icon: Eye,
    description: 'Browser-side AI signals similar to PeerPrep, with cooldown and confidence controls.',
    controls: [
      { type: 'toggle', key: 'aiProctoringEnabled', label: 'Enable browser-side AI proctoring' },
      { type: 'toggle', key: 'detectNoFace', label: 'Detect no face' },
      { type: 'toggle', key: 'detectMultipleFaces', label: 'Detect multiple faces' },
      { type: 'toggle', key: 'detectMultiplePersons', label: 'Detect multiple persons' },
      { type: 'toggle', key: 'detectMobilePhone', label: 'Detect mobile phone' },
      { type: 'toggle', key: 'detectLookingAway', label: 'Detect looking away' },
      { type: 'toggle', key: 'detectCameraBlocked', label: 'Detect camera blocked' },
      { type: 'number', key: 'detectionIntervalMs', label: 'Detection interval ms', min: 500 },
      { type: 'number', key: 'confidenceThreshold', label: 'Confidence threshold', min: 0, step: 0.05 },
      { type: 'number', key: 'violationCooldownSeconds', label: 'Violation cooldown seconds', min: 1 },
    ],
  },
  {
    title: 'Watermark and Enforcement',
    icon: Settings,
    description: 'Student-email watermark, warning score, recheck, and auto-submit thresholds.',
    controls: [
      { type: 'toggle', key: 'watermarkEnabled', label: 'Enable student email watermark' },
      { type: 'number', key: 'watermarkOpacity', label: 'Watermark opacity', min: 0, step: 0.01 },
      { type: 'number', key: 'watermarkFontSize', label: 'Watermark font size', min: 8 },
      { type: 'number', key: 'warningScore', label: 'Warning score threshold', min: 0 },
      { type: 'number', key: 'pauseScore', label: 'Pause/recheck score threshold', min: 0 },
      { type: 'number', key: 'autoSubmitScore', label: 'Auto-submit score threshold', min: 0 },
      { type: 'number', key: 'maxWarningCount', label: 'Maximum warning count', min: 0 },
      { type: 'toggle', key: 'securityRecheckEnabled', label: 'Enable security recheck flow' },
      { type: 'number', key: 'securityRecheckTimeoutSeconds', label: 'Recheck timeout seconds', min: 30 },
    ],
  },
  {
    title: 'Reminder and Result Policy',
    icon: Bell,
    description: 'Manual invitation remains primary; reminders can be configured after invitation.',
    controls: [
      { type: 'toggle', key: 'negativeMarkingEnabled', label: 'Enable percentage negative marking' },
      {
        type: 'select',
        key: 'negativeMarkingPercent',
        label: 'Negative marking percentage',
        options: [
          { label: '25% of question marks', value: 25 },
          { label: '50% of question marks', value: 50 },
          { label: '100% of question marks', value: 100 },
        ],
      },
      { type: 'toggle', key: 'reminder24Hours', label: 'Reminder 24 hours before exam' },
      { type: 'toggle', key: 'reminder1Hour', label: 'Reminder 1 hour before exam' },
      { type: 'toggle', key: 'reminder10Minutes', label: 'Reminder 10 minutes before exam' },
      { type: 'toggle', key: 'showResultToStudent', label: 'Show result to student after submission' },
    ],
  },
];

function getOverviewPath(pathname) {
  return pathname.startsWith('/super-admin') ? '/super-admin/assessments' : '/admin/assessments';
}

function getRoleBase(pathname) {
  return pathname.startsWith('/super-admin') ? '/super-admin' : '/admin';
}

function createDefaultCode() {
  const year = new Date().getFullYear();
  const random = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `EVL-${year}-${random}`;
}

function formatDateTimeInput(value) {
  if (!value) {
    return '';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function formatReviewDateTime(value) {
  if (!value) return 'Not scheduled';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not scheduled';
  return date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

function assessmentToForm(assessment) {
  return {
    title: assessment.title || '',
    assessmentCode: assessment.assessmentCode || createDefaultCode(),
    type: assessment.type || 'exam',
    description: assessment.description || '',
    instructions: assessment.instructions || '',
    internalNote: assessment.internalNote || '',
    visibility: assessment.visibility || 'hidden',
    status: assessment.status || 'draft',
    startAt: formatDateTimeInput(assessment.startAt),
    endAt: formatDateTimeInput(assessment.endAt),
    globalDurationMinutes: assessment.globalDurationMinutes || 60,
    courses: assessment.courses || [],
    settings: {
      ...defaultSettings,
      ...(assessment.settings || {}),
    },
  };
}

function getStepIndex(value) {
  const stepMap = {
    basic: 0,
    courses: 1,
    questions: 2,
    faculty: 3,
    moderator: 4,
    students: 5,
    proctors: 6,
    schedule: 7,
    settings: 8,
    review: 9,
  };

  return stepMap[value] ?? 0;
}

function parseFolderParam(value) {
  return String(value || '')
    .split('||')
    .map((item) => item.trim())
    .filter(Boolean);
}

function toCourseOptions(courses) {
  return courses.map((course) => ({
    courseName: course.courseName,
    courseId: course.courseCode || course.courseId || '',
  }));
}

function courseKey(course) {
  return `${course.courseName}|${course.courseId || ''}`;
}

function CourseMapModal({ group, courses, selectedCourseKey, usedCourseKeys, onSelect, onCancel, onConfirm, isSaving }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/35 px-4 py-6">
      <div className="w-full max-w-xl rounded-lg border border-slate-200 bg-white shadow-2xl">
        <div className="border-b border-slate-200 px-5 py-4">
          <p className="text-base font-semibold text-slate-950">Map Course Before Import</p>
          <p className="mt-1 text-sm text-slate-500">
            "{group.paperHeading}" will be imported as one question set and attached to the selected course.
          </p>
        </div>
        <div className="space-y-4 p-5">
          <div>
            <label className="field-label">Course</label>
            <select className="field-input mt-2" value={selectedCourseKey} onChange={(event) => onSelect(event.target.value)}>
              <option value="">Select course</option>
              {courses.map((course) => {
                const key = courseKey(course);
                const isMappedElsewhere = usedCourseKeys.has(key);

                return (
                  <option key={key} value={key} disabled={isMappedElsewhere}>
                    {course.courseName}
                    {course.courseId ? ` (${course.courseId})` : ''}
                    {isMappedElsewhere ? ' - already mapped' : ''}
                  </option>
                );
              })}
            </select>
            <p className="mt-2 text-xs text-slate-500">Each course can be linked to only one library folder in this assessment.</p>
          </div>
          <div className="rounded-md border border-brand-100 bg-brand-50 px-4 py-3 text-sm font-semibold text-brand-700">
            {group.count} question(s) and {group.totalMarks || 0} mark(s) will be mapped to this course.
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
            <button className="secondary-button" type="button" onClick={onCancel} disabled={isSaving}>
              Cancel
            </button>
            <button className="primary-button" type="button" onClick={onConfirm} disabled={isSaving || !selectedCourseKey}>
              <CheckCircle2 size={16} />
              {isSaving ? 'Importing...' : 'Confirm Import'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SettingControl({ control, value, onChange }) {
  if (control.type === 'toggle') {
    return (
      <label className="flex min-h-12 items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm transition hover:border-brand-200 hover:bg-brand-50/40">
        <span className="text-sm font-medium text-slate-700">{control.label}</span>
        <input
          className="h-4 w-4 accent-orange-500"
          type="checkbox"
          checked={Boolean(value)}
          onChange={(event) => onChange(control.key, event.target.checked)}
        />
      </label>
    );
  }

  if (control.type === 'select') {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
        <label className="field-label">{control.label}</label>
        <select className="field-input mt-2" value={value} onChange={(event) => onChange(control.key, event.target.value)}>
          {control.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <label className="field-label">{control.label}</label>
      <input
        className="field-input mt-2"
        type="number"
        min={control.min}
        step={control.step || 1}
        value={value}
        onChange={(event) => onChange(control.key, Number(event.target.value))}
      />
    </div>
  );
}

function SettingsPanel({ settings, onChange }) {
  return (
    <div className="space-y-4">
      {settingGroups.map((group) => (
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm" key={group.title}>
          <div className="flex items-start gap-3 border-b border-slate-200 bg-white px-4 py-3">
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-brand-100 bg-brand-50 text-brand-600">
              <group.icon size={18} />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-slate-950">{group.title}</h3>
              <p className="mt-1 text-xs leading-5 text-slate-500">{group.description}</p>
            </div>
          </div>
          <div className="grid gap-3 bg-slate-50/60 p-4 md:grid-cols-2 xl:grid-cols-3">
            {group.controls.map((control) => (
              <SettingControl
                key={control.key}
                control={control}
                value={settings[control.key]}
                onChange={onChange}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function staffCanHandleCourse(person, course) {
  const normalize = (value) => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  const assessmentValues = new Set([
    normalize(course.courseName),
    normalize(course.courseId),
    normalize(course.courseCode),
  ].filter(Boolean));

  return (person.assignedCourses || []).some((assignedCourse) => {
    const staffValues = [
      normalize(assignedCourse.courseName),
      normalize(assignedCourse.courseCode),
      normalize(assignedCourse.courseId),
    ].filter(Boolean);

    return staffValues.some((value) => assessmentValues.has(value));
  });
}

function StaffAssignmentPanel({ label, icon: Icon, courses, people, roleKey, onAssign, onBulkAssign, required }) {
  const idKey = `${roleKey}Id`;
  const displayCourses = useMemo(() => {
    return courses;
  }, [courses]);
  const assignedCourseByPersonId = useMemo(() => {
    const map = new Map();

    displayCourses.forEach((course) => {
      if (course[idKey]) {
        map.set(course[idKey], courseKey(course));
      }
    });

    return map;
  }, [displayCourses, idKey]);
  const assignedCount = displayCourses.filter((course) => course[idKey]).length;
  const eligibleCourseCount = displayCourses.filter((course) => people.some((person) => staffCanHandleCourse(person, course))).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-brand-100 bg-brand-50 text-brand-600">
            <Icon size={18} />
          </span>
          <div>
            <p className="field-label text-brand-600">Choose {label}</p>
            <p className="mt-1 text-sm font-semibold text-slate-950">
              {assignedCount} of {displayCourses.length} course(s) assigned
            </p>
            {required ? <p className="mt-1 text-xs font-semibold text-amber-700">{label} is required for this review path.</p> : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="status-badge status-active">{eligibleCourseCount} eligible</span>
          <button
            className="secondary-button h-9 px-3 text-xs"
            type="button"
            onClick={() => onBulkAssign(displayCourses, people, roleKey, false)}
            disabled={eligibleCourseCount === 0}
          >
            Select All Available
          </button>
          <button
            className="secondary-button h-9 px-3 text-xs"
            type="button"
            onClick={() => onBulkAssign(displayCourses, people, roleKey, true)}
            disabled={assignedCount === 0}
          >
            Clear All
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Course</th>
                <th>{label}</th>
                <th>Allowed People</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {displayCourses.length === 0 ? (
                <tr>
                  <td colSpan={3} className="text-center text-slate-500">
                    Add active {label.toLowerCase()} course assignments before choosing reviewers.
                  </td>
                </tr>
              ) : (
                displayCourses.map((course) => {
                  const eligiblePeople = people.filter((person) => staffCanHandleCourse(person, course));
                  const currentId = course[idKey] || '';
                  const currentCourseKey = courseKey(course);
                  const selectablePeopleCount = eligiblePeople.filter((person) => {
                    const assignedCourseKey = assignedCourseByPersonId.get(person._id);
                    return roleKey !== 'faculty' || !assignedCourseKey || assignedCourseKey === currentCourseKey;
                  }).length;

                  return (
                    <tr key={`${roleKey}-${course.courseName}-${course.courseId}`}>
                      <td>
                        <p className="font-semibold text-slate-950">{course.courseName}</p>
                        <p className="text-xs text-slate-500">{course.courseId || '-'}</p>
                      </td>
                      <td>
                        <select
                          className="field-input min-w-[260px]"
                          value={currentId}
                          onChange={(event) => {
                            const person = eligiblePeople.find((item) => item._id === event.target.value);
                            onAssign(course, person || null);
                          }}
                        >
                          <option value="">Select {label.toLowerCase()}</option>
                          {eligiblePeople.map((person) => {
                            const assignedCourseKey = assignedCourseByPersonId.get(person._id);
                            const assignedElsewhere = roleKey === 'faculty' && assignedCourseKey && assignedCourseKey !== currentCourseKey;

                            return (
                              <option key={person._id} value={person._id} disabled={assignedElsewhere}>
                                {person.name} - {person.email}
                                {assignedElsewhere ? ' - already selected' : ''}
                              </option>
                            );
                          })}
                        </select>
                      </td>
                      <td className="text-xs leading-5 text-slate-500">
                        {eligiblePeople.length > 0 ? (
                          <span>
                            {roleKey === 'faculty' ? `${selectablePeopleCount} available / ${eligiblePeople.length} eligible` : `${eligiblePeople.length} available`}
                            {currentId ? ` / selected ${eligiblePeople.find((person) => person._id === currentId)?.name || 'person'}` : ''}
                          </span>
                        ) : `No active ${label.toLowerCase()} assigned to this course`}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function CreateAssessmentPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const draftId = searchParams.get('draftId') || '';
  const requestedStep = searchParams.get('step') || 'basic';
  const sourceParam = searchParams.get('source') || 'both';
  const selectedFolderNames = useMemo(() => parseFolderParam(searchParams.get('folders')), [searchParams]);
  const overviewPath = useMemo(() => getOverviewPath(location.pathname), [location.pathname]);
  const roleBase = useMemo(() => getRoleBase(location.pathname), [location.pathname]);
  const [activeStep, setActiveStep] = useState(0);
  const [maxUnlockedStep, setMaxUnlockedStep] = useState(0);
  const [draftAssessment, setDraftAssessment] = useState(null);
  const [isLoadingDraft, setIsLoadingDraft] = useState(Boolean(draftId));
  const [isSaving, setIsSaving] = useState(false);
  const [masterCourses, setMasterCourses] = useState([]);
  const [courseSearch, setCourseSearch] = useState('');
  const [faculty, setFaculty] = useState([]);
  const [moderators, setModerators] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [selectedFolderDetails, setSelectedFolderDetails] = useState([]);
  const [questionSource, setQuestionSource] = useState(questionSourceOptions.some((option) => option.value === sourceParam) ? sourceParam : 'both');
  const [expandedFolder, setExpandedFolder] = useState('');
  const [expandedQuestion, setExpandedQuestion] = useState('');
  const [mapDialog, setMapDialog] = useState(null);
  const [selectedCourseKey, setSelectedCourseKey] = useState('');
  const [importResult, setImportResult] = useState(null);
  const [isLoadingSelectedFolders, setIsLoadingSelectedFolders] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    title: '',
    assessmentCode: createDefaultCode(),
    type: 'exam',
    description: '',
    instructions: '',
    internalNote: '',
    visibility: 'hidden',
    status: 'draft',
    startAt: '',
    endAt: '',
    globalDurationMinutes: 60,
    courses: [],
    settings: defaultSettings,
  });

  useEffect(() => {
    let ignore = false;

    async function loadDraft() {
      if (!draftId) {
        setIsLoadingDraft(false);
        return;
      }

      setIsLoadingDraft(true);
      setError('');

      try {
        const response = await api.get(`/assessments/${draftId}`);

        if (ignore) {
          return;
        }

        const assessment = response.data.assessment;
        const stepIndex = getStepIndex(requestedStep);
        setDraftAssessment(assessment);
        setForm(assessmentToForm(assessment));
        setMaxUnlockedStep(steps.length - 1);
        setActiveStep(stepIndex);
      } catch (requestError) {
        if (!ignore) {
          setError(requestError.response?.data?.message || 'Unable to load draft assessment.');
        }
      } finally {
        if (!ignore) {
          setIsLoadingDraft(false);
        }
      }
    }

    loadDraft();

    return () => {
      ignore = true;
    };
  }, [draftId, requestedStep]);

  useEffect(() => {
    if (questionSourceOptions.some((option) => option.value === sourceParam)) {
      setQuestionSource(sourceParam);
    }
  }, [sourceParam]);

  const basicValidation = useMemo(() => {
    const issues = [];
    if (!form.title.trim()) issues.push('Assessment title is required.');
    if (!form.assessmentCode.trim()) issues.push('Assessment code is required.');
    return issues;
  }, [form.assessmentCode, form.title]);

  const isDraftSaved = Boolean(draftAssessment?._id);
  const isEditingDraft = Boolean(draftId || draftAssessment?._id);
  const assessmentCourses = useMemo(
    () => (draftAssessment?.courses?.length ? draftAssessment.courses : form.courses || []),
    [draftAssessment?.courses, form.courses]
  );
  const courseOptions = useMemo(() => toCourseOptions(assessmentCourses), [assessmentCourses]);
  const selectedCourseKeys = useMemo(() => new Set(assessmentCourses.map((course) => courseKey(course))), [assessmentCourses]);
  const filteredMasterCourses = useMemo(() => {
    const query = courseSearch.trim().toLowerCase();

    if (!query) {
      return masterCourses;
    }

    return masterCourses.filter((course) => {
      const haystack = `${course.courseName || ''} ${course.courseCode || course.courseId || ''}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [courseSearch, masterCourses]);
  const allVisibleCoursesSelected = filteredMasterCourses.length > 0 && filteredMasterCourses.every((course) =>
    selectedCourseKeys.has(courseKey({ courseName: course.courseName, courseId: course.courseCode || course.courseId || '' }))
  );
  const courseValidation = useMemo(() => {
    if (assessmentCourses.length === 0) {
      return ['Select at least one course before adding questions.'];
    }

    return [];
  }, [assessmentCourses.length]);

  const hasQuestionMapping = questions.length > 0;
  const hasFacultyAssignments = useMemo(
    () => assessmentCourses.some((course) => Boolean(course.facultyId)),
    [assessmentCourses]
  );
  const hasModeratorForFacultyAssignments = useMemo(
    () => assessmentCourses.every((course) => !course.facultyId || Boolean(course.moderatorId)),
    [assessmentCourses]
  );
  const hasDuplicateFacultyAssignments = useMemo(() => {
    const assignedIds = assessmentCourses.map((course) => course.facultyId).filter(Boolean);
    return new Set(assignedIds).size !== assignedIds.length;
  }, [assessmentCourses]);

  const validation = useMemo(() => {
    const issues = [...basicValidation, ...courseValidation];
    if (!hasQuestionMapping && !hasFacultyAssignments) {
      issues.push('Select at least one faculty when no library questions are mapped.');
    }
    if (hasDuplicateFacultyAssignments) {
      issues.push('Each faculty can be assigned to one course only.');
    }
    if (hasFacultyAssignments && !hasModeratorForFacultyAssignments) {
      issues.push('Assign moderator for every selected faculty course.');
    }
    if (!form.globalDurationMinutes || Number(form.globalDurationMinutes) < 1) issues.push('Duration must be at least 1 minute.');
    return issues;
  }, [basicValidation, courseValidation, form.globalDurationMinutes, hasDuplicateFacultyAssignments, hasFacultyAssignments, hasModeratorForFacultyAssignments, hasQuestionMapping]);

  const mappedFolders = useMemo(() => {
    const map = new Map();

    questions.forEach((question) => {
      if (!question.sourcePaperHeading || map.has(question.sourcePaperHeading)) {
        return;
      }

      map.set(question.sourcePaperHeading, {
        courseName: question.courseName,
        courseId: question.courseId,
      });
    });

    return map;
  }, [questions]);
  const usedCourseKeys = useMemo(
    () => new Set(Array.from(mappedFolders.values()).map((course) => courseKey(course))),
    [mappedFolders]
  );
  const hasAvailableCourseForMapping = useMemo(
    () => courseOptions.some((course) => !usedCourseKeys.has(courseKey(course))),
    [courseOptions, usedCourseKeys]
  );
  const mappedImportedFolders = useMemo(() => {
    const grouped = new Map();

    questions.forEach((question) => {
      if (!question.sourcePaperHeading) {
        return;
      }

      if (!grouped.has(question.sourcePaperHeading)) {
        grouped.set(question.sourcePaperHeading, {
          paperHeading: question.sourcePaperHeading,
          questions: [],
          count: 0,
          totalMarks: 0,
          mcqCount: 0,
          oneWordCount: 0,
        });
      }

      const group = grouped.get(question.sourcePaperHeading);
      group.questions.push(question);
      group.count += 1;
      group.totalMarks += Number(question.positiveMarks || 0);
      if (question.type === 'mcq') group.mcqCount += 1;
      if (question.type === 'one_word') group.oneWordCount += 1;
    });

    return Array.from(grouped.values());
  }, [questions]);
  const visibleFolderDetails = useMemo(() => {
    const merged = new Map();

    selectedFolderDetails.forEach((folder) => {
      merged.set(folder.paperHeading, folder);
    });

    mappedImportedFolders.forEach((folder) => {
      if (!merged.has(folder.paperHeading)) {
        merged.set(folder.paperHeading, folder);
      }
    });

    return Array.from(merged.values());
  }, [mappedImportedFolders, selectedFolderDetails]);
  const hasFolderWorkflow = selectedFolderNames.length > 0 || visibleFolderDetails.length > 0;

  const readiness = [
    { label: 'Basic', done: Boolean(form.title && form.assessmentCode) },
    { label: 'Courses', done: assessmentCourses.length > 0 },
    { label: 'Draft', done: isDraftSaved },
    { label: 'Schedule', done: Boolean(form.globalDurationMinutes) },
    { label: 'Settings', done: true },
  ];
  const ActiveStepIcon = stepIcons[activeStep] || ClipboardList;
  const activeStepMeta = stepMeta[activeStep] || { eyebrow: `Step ${activeStep + 1}`, title: steps[activeStep], description: '' };
  const progressPercent = Math.round(((activeStep + 1) / steps.length) * 100);

  useEffect(() => {
    let ignore = false;

    async function loadCourses() {
      try {
        const response = await api.get('/courses', {
          params: {
            status: 'active',
            limit: 1000,
          },
        });

        if (ignore) {
          return;
        }

        setMasterCourses(response.data.items || []);
      } catch (requestError) {
        if (!ignore) {
          setError(requestError.response?.data?.message || 'Unable to load courses.');
        }
      }
    }

    loadCourses();

    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    setSelectedCourseKey((current) => {
      if (current && courseOptions.some((course) => courseKey(course) === current)) {
        return current;
      }

      return courseOptions[0] ? courseKey(courseOptions[0]) : '';
    });
  }, [courseOptions]);

  useEffect(() => {
    let ignore = false;

    async function loadPeople() {
      try {
        const [facultyResponse, moderatorResponse] = await Promise.all([
          api.get('/people/faculty', { params: { status: 'active', limit: 1000 } }),
          api.get('/people/moderators', { params: { status: 'active', limit: 1000 } }),
        ]);

        if (!ignore) {
          setFaculty(facultyResponse.data.items || []);
          setModerators(moderatorResponse.data.items || []);
        }
      } catch (requestError) {
        if (!ignore && requestError.response?.status !== 403) {
          setError(requestError.response?.data?.message || 'Unable to load faculty and moderators.');
        }
      }
    }

    loadPeople();

    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    let ignore = false;

    async function loadSelectedFolders() {
      if (selectedFolderNames.length === 0) {
        setSelectedFolderDetails([]);
        return;
      }

      setIsLoadingSelectedFolders(true);

      try {
        const responses = await Promise.all(
          selectedFolderNames.map((paperHeading) =>
            api.get('/library/questions', {
              params: {
                paperHeading,
                source: questionSource,
                limit: 500,
              },
            })
          )
        );

        if (ignore) {
          return;
        }

        setSelectedFolderDetails(
          selectedFolderNames.map((paperHeading, index) => {
            const folderQuestions = responses[index].data.items || [];
            return {
              paperHeading,
              questions: folderQuestions,
              count: folderQuestions.length,
              totalMarks: folderQuestions.reduce((total, question) => total + Number(question.positiveMarks || 0), 0),
              mcqCount: folderQuestions.filter((question) => question.type === 'mcq').length,
              oneWordCount: folderQuestions.filter((question) => question.type === 'one_word').length,
            };
          })
        );
      } catch (requestError) {
        if (!ignore) {
          setError(requestError.response?.data?.message || 'Unable to load selected library folders.');
        }
      } finally {
        if (!ignore) {
          setIsLoadingSelectedFolders(false);
        }
      }
    }

    loadSelectedFolders();

    return () => {
      ignore = true;
    };
  }, [questionSource, selectedFolderNames]);

  useEffect(() => {
    let ignore = false;

    async function loadQuestions() {
      if (!draftAssessment?._id) {
        setQuestions([]);
        return;
      }

      try {
        const response = await api.get(`/assessments/${draftAssessment._id}/questions`);

        if (!ignore) {
          setQuestions(response.data.items || []);
        }
      } catch (requestError) {
        if (!ignore) {
          setError(requestError.response?.data?.message || 'Unable to load assessment questions.');
        }
      }
    }

    loadQuestions();

    return () => {
      ignore = true;
    };
  }, [draftAssessment?._id]);

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function updateSetting(field, value) {
    setForm((current) => ({
      ...current,
      settings: {
        ...current.settings,
        [field]: value,
      },
    }));
  }

  function buildAssessmentCourse(course) {
    return {
      courseName: course.courseName,
      courseId: course.courseCode || course.courseId || '',
      questionCount: 0,
      studentCount: 0,
      eligibleStudentCount: 0,
    };
  }

  function setAssessmentCourseList(nextCourses) {
    setForm((current) => ({ ...current, courses: nextCourses }));
    setDraftAssessment((current) => (current ? { ...current, courses: nextCourses } : current));
  }

  function toggleAssessmentCourse(course) {
    const normalizedCourse = buildAssessmentCourse(course);
    const key = courseKey(normalizedCourse);
    const isSelected = selectedCourseKeys.has(key);

    if (isSelected && usedCourseKeys.has(key)) {
      setError('This course already has mapped questions. Remove that mapping before removing the course.');
      return;
    }

    setError('');
    const nextCourses = isSelected
      ? assessmentCourses.filter((item) => courseKey(item) !== key)
      : [...assessmentCourses, normalizedCourse];
    setAssessmentCourseList(nextCourses);
  }

  function selectVisibleCourses() {
    const byKey = new Map(assessmentCourses.map((course) => [courseKey(course), { ...course }]));

    filteredMasterCourses.forEach((course) => {
      const normalizedCourse = buildAssessmentCourse(course);
      const key = courseKey(normalizedCourse);
      if (!byKey.has(key)) {
        byKey.set(key, normalizedCourse);
      }
    });

    setError('');
    setAssessmentCourseList(Array.from(byKey.values()));
  }

  function clearUnmappedCourses() {
    const nextCourses = assessmentCourses.filter((course) => usedCourseKeys.has(courseKey(course)));
    setError(nextCourses.length === assessmentCourses.length ? 'Mapped courses cannot be cleared until their questions are removed.' : '');
    setAssessmentCourseList(nextCourses);
  }

  function assignCoursePerson(course, person, roleKey) {
    const idKey = `${roleKey}Id`;
    const nameKey = `${roleKey}Name`;
    const emailKey = `${roleKey}Email`;

    let matched = false;
    const nextCourses = assessmentCourses.map((item) => {
      if (courseKey(item) !== courseKey(course)) {
        return item;
      }

      matched = true;
      return {
        ...item,
        [idKey]: person?._id || '',
        [nameKey]: person?.name || '',
        [emailKey]: person?.email || '',
      };
    });

    if (!matched && person) {
      nextCourses.push({
        courseName: course.courseName,
        courseId: course.courseId || '',
        questionCount: 0,
        studentCount: 0,
        eligibleStudentCount: 0,
        [idKey]: person._id,
        [nameKey]: person.name,
        [emailKey]: person.email,
      });
    }

    setForm((current) => ({ ...current, courses: nextCourses }));
    setDraftAssessment((current) => (current ? { ...current, courses: nextCourses } : current));
  }

  function bulkAssignCoursePeople(targetCourses, availablePeople, roleKey, clear = false) {
    const idKey = `${roleKey}Id`;
    const nameKey = `${roleKey}Name`;
    const emailKey = `${roleKey}Email`;
    const byKey = new Map(assessmentCourses.map((course) => [courseKey(course), { ...course }]));
    const assignedPersonIds = new Set(
      Array.from(byKey.values())
        .map((course) => course[idKey])
        .filter(Boolean)
    );

    targetCourses.forEach((course) => {
      const key = courseKey(course);
      const existing = byKey.get(key) || {
        courseName: course.courseName,
        courseId: course.courseId || '',
        questionCount: 0,
        studentCount: 0,
        eligibleStudentCount: 0,
      };

      if (clear) {
        if (byKey.has(key)) {
          if (existing[idKey]) assignedPersonIds.delete(existing[idKey]);
          byKey.set(key, {
            ...existing,
            [idKey]: '',
            [nameKey]: '',
            [emailKey]: '',
          });
        }
        return;
      }

      if (existing[idKey]) {
        byKey.set(key, existing);
        return;
      }

      const person = availablePeople.find((item) =>
        staffCanHandleCourse(item, course) && (roleKey !== 'faculty' || !assignedPersonIds.has(item._id))
      );
      if (!person) return;

      if (roleKey === 'faculty') assignedPersonIds.add(person._id);

      byKey.set(key, {
        ...existing,
        [idKey]: person._id,
        [nameKey]: person.name,
        [emailKey]: person.email,
      });
    });

    const nextCourses = Array.from(byKey.values());
    setForm((current) => ({ ...current, courses: nextCourses }));
    setDraftAssessment((current) => (current ? { ...current, courses: nextCourses } : current));
  }

  function buildAssessmentPayload() {
    const payload = {
      ...form,
      globalDurationMinutes: Number(form.globalDurationMinutes),
      courses: assessmentCourses,
      settings: { ...form.settings, passwordRequired: false },
    };
    return payload;
  }

  function getStepIssues(step) {
    if (step === 0) {
      return basicValidation;
    }

    if (step === 1) {
      return courseValidation;
    }

    if (step === 3 && !hasQuestionMapping && !hasFacultyAssignments) {
      return ['Select at least one faculty when no library questions are mapped.'];
    }

    if (step === 3 && hasDuplicateFacultyAssignments) {
      return ['Each faculty can be assigned to one course only.'];
    }

    if (step === 4 && hasFacultyAssignments && !hasModeratorForFacultyAssignments) {
      return ['Assign moderator for every selected faculty course.'];
    }

    if (step === 7 && (!form.globalDurationMinutes || Number(form.globalDurationMinutes) < 1)) {
      return ['Duration must be at least 1 minute.'];
    }

    return [];
  }

  function getValidationStep(issues) {
    if (issues.some((issue) => issue.includes('title') || issue.includes('code'))) {
      return 0;
    }

    if (issues.some((issue) => issue.includes('at least one course'))) {
      return 1;
    }

    if (issues.some((issue) => issue.includes('Duration'))) {
      return 7;
    }

    if (issues.some((issue) => issue.includes('faculty'))) {
      return 3;
    }

    if (issues.some((issue) => issue.includes('moderator'))) {
      return 4;
    }

    return steps.length - 1;
  }

  async function saveAssessmentDraft({ requireFullValidation = false } = {}) {
    setError('');
    const issues = requireFullValidation ? validation : basicValidation;

    if (issues.length > 0) {
      setActiveStep(getValidationStep(issues));
      setError(issues[0]);
      return null;
    }

    setIsSaving(true);

    try {
      const payload = buildAssessmentPayload();
      const response = draftAssessment?._id
        ? await api.patch(`/assessments/${draftAssessment._id}`, payload)
        : await api.post('/assessments', payload);
      const assessment = response.data.assessment;
      setDraftAssessment(assessment);
      return assessment;
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to save assessment draft.');
      return null;
    } finally {
      setIsSaving(false);
    }
  }

  async function ensureQuestionDraft() {
    const assessment = await saveAssessmentDraft({ requireFullValidation: false });

    if (assessment?._id) {
      setMaxUnlockedStep((current) => Math.max(current, 2));
    }

    return assessment;
  }

  async function refreshAssessment(assessmentId) {
    if (!assessmentId) {
      return null;
    }

    const response = await api.get(`/assessments/${assessmentId}`);
    const assessment = response.data.assessment;
    setDraftAssessment(assessment);
    setForm(assessmentToForm(assessment));
    return assessment;
  }

  async function refreshQuestions(assessmentId = draftAssessment?._id) {
    if (!assessmentId) {
      setQuestions([]);
      return;
    }

    const response = await api.get(`/assessments/${assessmentId}/questions`);
    setQuestions(response.data.items || []);
  }

  async function handleNext() {
    const stepIssues = getStepIssues(activeStep);

    if (stepIssues.length > 0) {
      setError(stepIssues[0]);
      return;
    }

    if (activeStep === 0 || activeStep === 1 || activeStep >= 3) {
      const assessment = await saveAssessmentDraft({ requireFullValidation: false });

      if (!assessment) {
        return;
      }
    }

    const nextStep = Math.min(activeStep + 1, steps.length - 1);
    setMaxUnlockedStep((current) => Math.max(current, nextStep));
    setActiveStep(nextStep);
  }

  function openStep(index) {
    if (index <= maxUnlockedStep) {
      setActiveStep(index);
      setError('');
    }
  }

  async function handleSubmit(event) {
    event?.preventDefault();
    const assessment = await saveAssessmentDraft({ requireFullValidation: false });
    if (assessment) {
      navigate(overviewPath, { replace: true });
    }
  }

  async function handlePublish() {
    setError('');

    if (questions.length === 0) {
      setActiveStep(2);
      setError('Add at least one question before publishing the assessment.');
      return;
    }

    setIsPublishing(true);

    try {
      const assessment = await saveAssessmentDraft({ requireFullValidation: true });

      if (!assessment?._id) {
        return;
      }

      const response = await api.patch(`/assessments/${assessment._id}`, {
        ...buildAssessmentPayload(),
        status: 'pending',
        visibility: 'visible',
      });
      setDraftAssessment(response.data.assessment);
      navigate(overviewPath, { replace: true });
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to publish assessment.');
    } finally {
      setIsPublishing(false);
    }
  }

  async function handleReviewAssessment() {
    setError('');
    setIsPublishing(true);

    try {
      const assessment = await saveAssessmentDraft({ requireFullValidation: true });

      if (!assessment?._id) {
        return;
      }

      const response = await api.patch(`/assessments/${assessment._id}`, {
        ...buildAssessmentPayload(),
        status: 'review',
        visibility: 'hidden',
      });
      setDraftAssessment(response.data.assessment);
      navigate(`${roleBase}/assessments/review`, { replace: true });
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to move assessment to review.');
    } finally {
      setIsPublishing(false);
    }
  }

  async function handleSaveDraftClick() {
    const assessment = await saveAssessmentDraft({ requireFullValidation: false });
    if (assessment?._id) {
      setMaxUnlockedStep((current) => Math.max(current, assessmentCourses.length > 0 ? 2 : 1));
    }
  }

  async function openQuestionLibrary(mode) {
    if (assessmentCourses.length === 0) {
      setActiveStep(1);
      setError('Select at least one course before adding questions.');
      return;
    }

    if (questionSource === 'faculty') {
      setError('Faculty source means faculty will add questions during review. Continue to the Faculty step instead of importing or creating questions here.');
      return;
    }

    const assessment = await ensureQuestionDraft();

    if (assessment?._id) {
      const path = mode === 'create' ? `${roleBase}/library/add` : `${roleBase}/library/view`;
      navigate(`${path}?assessmentId=${assessment._id}&source=${questionSource}`, { replace: true });
    }
  }

  function openMapDialog(folder) {
    if (mappedFolders.has(folder.paperHeading)) {
      return;
    }

    setMapDialog(folder);
    setImportResult(null);
    const firstAvailableCourse = courseOptions.find((course) => !usedCourseKeys.has(courseKey(course)));
    setSelectedCourseKey(firstAvailableCourse ? courseKey(firstAvailableCourse) : '');
  }

  async function importLibraryHeading() {
    const assessment = await ensureQuestionDraft();
    const selectedCourse = courseOptions.find((course) => courseKey(course) === selectedCourseKey);

    if (!assessment?._id || !mapDialog || !selectedCourse) {
      return;
    }

    setIsImporting(true);
    setError('');

    try {
      const response = await api.post(`/assessments/${assessment._id}/questions/from-library-heading`, {
        paperHeading: mapDialog.paperHeading,
        course: selectedCourse,
        source: questionSource,
      });
      setImportResult(response.data.summary);
      setMapDialog(null);
      await Promise.all([refreshAssessment(assessment._id), refreshQuestions(assessment._id)]);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to import library questions.');
    } finally {
      setIsImporting(false);
    }
  }

  if (isLoadingDraft) {
    return (
      <section className="space-y-5">
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-panel">
          <p className="text-sm font-semibold text-slate-700">Loading draft assessment...</p>
          <p className="mt-1 text-xs text-slate-500">Evalora is preparing the saved builder data.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-5">
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-panel">
        <div className="grid gap-4 border-b border-slate-200 px-4 py-4 lg:grid-cols-[1fr_280px]">
          <div className="min-w-0">
            <p className="field-label text-brand-600">Assessment Builder</p>
            <h2 className="mt-1 text-lg font-semibold leading-tight text-slate-950">
              {isEditingDraft ? 'Edit Draft Assessment' : 'Create Assessment'}
            </h2>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">
              {isEditingDraft
                ? 'Update saved draft details, add questions, and continue the same assessment setup without creating a duplicate draft.'
                : 'Configure exam basics, select courses, add questions, schedule, review routing, and security rules.'}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-center justify-between text-xs font-semibold uppercase text-slate-500">
              <span>Builder Progress</span>
              <span className="text-brand-600">{progressPercent}%</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
              <div className="h-full rounded-full bg-brand-500 transition-all duration-500" style={{ width: `${progressPercent}%` }} />
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold text-slate-950">{steps[activeStep]}</p>
              <span className={`text-xs font-semibold ${isDraftSaved ? 'text-green-700' : 'text-slate-500'}`}>
                {isDraftSaved ? 'Draft saved' : 'Not saved'}
              </span>
            </div>
            <button className="secondary-button mt-3 h-9 w-full justify-center text-xs" type="button" onClick={handleSaveDraftClick} disabled={isSaving}>
              <Save size={16} className="text-brand-500" />
              {isSaving ? 'Saving Draft' : isDraftSaved ? 'Update Draft' : 'Save in Draft'}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 px-4 py-3">
          {readiness.map((item) => (
            <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${item.done ? 'border-green-200 bg-green-50 text-green-700' : 'border-slate-200 bg-slate-50 text-slate-500'}`} key={item.label}>
              {item.label}: {item.done ? 'Ready' : 'Missing'}
            </span>
          ))}
          <span className="inline-flex items-center gap-2 rounded-full border border-brand-100 bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
            Question Mapping: After draft
          </span>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[244px_minmax(0,1fr)]">
      <aside className="panel sticky top-20 h-max overflow-hidden">
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
          <p className="field-label text-brand-600">Builder</p>
          <h2 className="mt-1 text-sm font-semibold text-slate-950">Setup Steps</h2>
        </div>
        <div className="space-y-1.5 p-2.5">
          {steps.map((step, index) => {
            const isLocked = index > maxUnlockedStep;
            const isComplete = index < maxUnlockedStep;

            return (
              <button
                key={step}
                className={`flex w-full translate-x-0 items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-xs font-semibold transition duration-300 ease-out ${
                  activeStep === index
                    ? 'border-brand-300 bg-brand-50 text-brand-700 shadow-sm'
                    : 'border-transparent text-slate-600 hover:border-slate-200 hover:bg-slate-50'
                } ${isLocked ? 'cursor-not-allowed opacity-45' : 'hover:translate-x-1'}`}
                type="button"
                onClick={() => openStep(index)}
                disabled={isLocked}
              >
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-current text-[11px]">
                  {isComplete ? <Check size={14} /> : index + 1}
                </span>
                <span>{step}</span>
              </button>
            );
          })}
        </div>
      </aside>

      <main className="panel overflow-hidden border-slate-200">
        <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-brand-100 bg-brand-50 text-brand-600">
            <ActiveStepIcon size={17} />
          </span>
          <div className="min-w-0">
            <p className="field-label text-brand-600">{activeStepMeta.eyebrow}</p>
            <h2 className="mt-0.5 text-sm font-semibold text-slate-950">{activeStepMeta.title}</h2>
            <p className="mt-0.5 text-xs leading-5 text-slate-500">{activeStepMeta.description}</p>
          </div>
        </div>

        <div className="bg-slate-50/50 p-4">
          {error ? <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div> : null}

          {activeStep === 0 ? (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 bg-white px-4 py-3">
                <p className="field-label text-brand-600">Assessment Identity</p>
                <h3 className="mt-1 text-sm font-semibold text-slate-950">Basic details</h3>
                <p className="mt-1 text-xs leading-5 text-slate-500">Keep this concise; these values appear in tables, mails, and review screens.</p>
              </div>
              <div className="grid gap-3 p-4 md:grid-cols-2">
                <div>
                  <label className="field-label">Assessment title</label>
                  <input className="field-input mt-2" value={form.title} onChange={(event) => updateField('title', event.target.value)} />
                </div>
                <div>
                  <label className="field-label">Assessment code</label>
                  <input className="field-input mt-2" value={form.assessmentCode} onChange={(event) => updateField('assessmentCode', event.target.value.toUpperCase())} />
                </div>
                <div>
                  <label className="field-label">Type</label>
                  <select className="field-input mt-2" value={form.type} onChange={(event) => updateField('type', event.target.value)}>
                    <option value="exam">Exam</option>
                    <option value="assessment">Assessment</option>
                    <option value="practice">Practice</option>
                  </select>
                </div>
                <div>
                  <label className="field-label">Visibility</label>
                  <select className="field-input mt-2" value={form.visibility} onChange={(event) => updateField('visibility', event.target.value)}>
                    <option value="hidden">Hidden</option>
                    <option value="visible">Visible</option>
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="field-label">Description</label>
                  <textarea className="field-input mt-2 h-24 py-3" value={form.description} onChange={(event) => updateField('description', event.target.value)} />
                </div>
                <div className="md:col-span-2">
                  <label className="field-label">Instructions</label>
                  <textarea className="field-input mt-2 h-28 py-3" value={form.instructions} onChange={(event) => updateField('instructions', event.target.value)} />
                </div>
              </div>
            </div>
          ) : null}

          {activeStep === 1 ? (
            <div className="space-y-4">
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
                  <div>
                    <p className="field-label text-brand-600">Assessment Courses</p>
                    <h3 className="mt-1 text-sm font-semibold text-slate-950">Select courses for this assessment</h3>
                    <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">
                      The next steps will only use these selected courses for question mapping, faculty assignment, student entry, and review routing.
                    </p>
                  </div>
                  <span className="status-badge status-active">{assessmentCourses.length} selected</span>
                </div>

                <div className="grid gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 lg:grid-cols-[1fr_auto]">
                  <div className="relative">
                    <input
                      className="field-input pl-10"
                      value={courseSearch}
                      onChange={(event) => setCourseSearch(event.target.value)}
                      placeholder="Search course name or code"
                    />
                    <ClipboardList className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-brand-500" size={16} />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      className="secondary-button h-10 px-3 text-xs"
                      type="button"
                      onClick={selectVisibleCourses}
                      disabled={filteredMasterCourses.length === 0 || allVisibleCoursesSelected}
                    >
                      Select All Visible
                    </button>
                    <button
                      className="secondary-button h-10 px-3 text-xs"
                      type="button"
                      onClick={clearUnmappedCourses}
                      disabled={assessmentCourses.length === 0}
                    >
                      Clear Unmapped
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th className="w-12">
                          <input
                            className="h-4 w-4 accent-orange-500"
                            type="checkbox"
                            checked={allVisibleCoursesSelected}
                            onChange={() => {
                              if (allVisibleCoursesSelected) {
                                const visibleKeys = new Set(filteredMasterCourses.map((course) =>
                                  courseKey({ courseName: course.courseName, courseId: course.courseCode || course.courseId || '' })
                                ));
                                setAssessmentCourseList(assessmentCourses.filter((course) => !visibleKeys.has(courseKey(course)) || usedCourseKeys.has(courseKey(course))));
                              } else {
                                selectVisibleCourses();
                              }
                            }}
                            disabled={filteredMasterCourses.length === 0}
                          />
                        </th>
                        <th>Course</th>
                        <th>Course Code</th>
                        <th>Status</th>
                        <th>Selection</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {filteredMasterCourses.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-8 text-center text-sm font-semibold text-slate-500">
                            No active courses found. Add courses from the Courses section first.
                          </td>
                        </tr>
                      ) : (
                        filteredMasterCourses.map((course) => {
                          const normalizedCourse = buildAssessmentCourse(course);
                          const key = courseKey(normalizedCourse);
                          const selected = selectedCourseKeys.has(key);
                          const mapped = usedCourseKeys.has(key);

                          return (
                            <tr key={course._id || key} className={selected ? 'bg-brand-50/40' : ''}>
                              <td>
                                <input
                                  className="h-4 w-4 accent-orange-500"
                                  type="checkbox"
                                  checked={selected}
                                  onChange={() => toggleAssessmentCourse(course)}
                                />
                              </td>
                              <td>
                                <p className="font-semibold text-slate-950">{course.courseName}</p>
                                {mapped ? <p className="mt-1 text-xs font-semibold text-amber-700">Question mapping is attached</p> : null}
                              </td>
                              <td className="font-semibold text-slate-700">{course.courseCode || course.courseId || '-'}</td>
                              <td>
                                <span className="status-badge status-active">{course.status || 'active'}</span>
                              </td>
                              <td>
                                <button
                                  className={selected ? 'secondary-button h-9 px-3 text-xs' : 'primary-button h-9 px-3 text-xs'}
                                  type="button"
                                  onClick={() => toggleAssessmentCourse(course)}
                                >
                                  {selected ? (mapped ? 'Selected' : 'Remove') : 'Add Course'}
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-3">
                  <p className="text-xs font-semibold text-slate-500">
                    {assessmentCourses.length > 0
                      ? `${assessmentCourses.length} course(s) will be used in the remaining builder steps.`
                      : 'Select at least one course to continue.'}
                  </p>
                  <button className="primary-button h-9 px-3 text-xs" type="button" onClick={handleNext} disabled={isSaving || assessmentCourses.length === 0}>
                    Use Selected Courses
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {activeStep === 2 ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="field-label text-brand-600">Question Source</p>
                    <h3 className="mt-1 text-sm font-semibold text-slate-950">Choose whose library questions will be used</h3>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      This controls which folders appear in the library and which questions are imported into this assessment.
                    </p>
                  </div>
                  <span className="status-badge status-active">{questions.length} added</span>
                </div>
                <div className="mt-4 grid gap-3 lg:grid-cols-3">
                  {questionSourceOptions.map((option) => {
                    const selected = questionSource === option.value;
                    return (
                      <button
                        key={option.value}
                        className={`min-h-24 rounded-xl border p-4 text-left transition-all duration-200 ${
                          selected
                            ? 'border-brand-300 bg-brand-50 text-brand-700 shadow-sm'
                            : 'border-slate-200 bg-white text-slate-600 hover:border-brand-200 hover:bg-slate-50'
                        }`}
                        type="button"
                        onClick={() => {
                          setQuestionSource(option.value);
                          setSelectedFolderDetails([]);
                          setImportResult(null);
                        }}
                      >
                        <span className="flex items-center justify-between gap-3">
                          <span className="text-sm font-semibold">{option.label}</span>
                          <span className={`grid h-5 w-5 place-items-center rounded-full border text-[10px] ${selected ? 'border-brand-500 bg-brand-500 text-white' : 'border-slate-300 text-slate-400'}`}>
                            {selected ? <Check size={12} /> : null}
                          </span>
                        </span>
                        <span className="mt-2 block text-xs leading-5 text-slate-500">{option.description}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                <div>
                  <p className="field-label text-brand-600">Question Mapping</p>
                  <p className="mt-1 text-sm font-semibold text-slate-950">Choose folders from the library, then map each folder to one course.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    className="primary-button h-9 px-3 text-xs"
                    type="button"
                    onClick={() => openQuestionLibrary('import')}
                    disabled={isSaving || questionSource === 'faculty'}
                    title={questionSource === 'faculty' ? 'Faculty source is handled after faculty assignment.' : 'Import questions from library'}
                  >
                    <BookOpen size={15} />
                    Import Questions
                  </button>
                  <button
                    className="secondary-button h-9 px-3 text-xs"
                    type="button"
                    onClick={() => openQuestionLibrary('create')}
                    disabled={isSaving || questionSource === 'faculty'}
                    title={questionSource === 'faculty' ? 'Faculty source is handled after faculty assignment.' : 'Create questions in library'}
                  >
                    <FilePlus2 size={15} />
                    Create In Library
                  </button>
                </div>
              </div>

              {basicValidation.length > 0 || courseValidation.length > 0 ? (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-700">
                  Complete Basic details and select assessment courses before adding questions.
                </div>
              ) : null}

              {importResult ? (
                <div className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm font-semibold text-green-700">
                  Imported {importResult.created || 0} question(s). Skipped {importResult.skipped || 0}.
                </div>
              ) : null}

              {!hasFolderWorkflow ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <button
                    className={`rounded-xl border border-brand-200 bg-brand-50 p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-brand-300 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:bg-brand-50`}
                    type="button"
                    onClick={() => openQuestionLibrary('import')}
                    disabled={isSaving || questionSource === 'faculty'}
                    title={questionSource === 'faculty' ? 'Faculty source is handled after faculty assignment.' : 'Import questions from library'}
                  >
                    <BookOpen size={22} className="text-brand-500" />
                    <p className="mt-4 text-sm font-semibold text-slate-950">Import Questions</p>
                    <p className="mt-2 text-xs leading-5 text-slate-500">Open View Library, select multiple folders, then return here for course mapping.</p>
                  </button>

                  <button
                    className="rounded-xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-brand-300 hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:bg-white"
                    type="button"
                    onClick={() => openQuestionLibrary('create')}
                    disabled={isSaving || questionSource === 'faculty'}
                    title={questionSource === 'faculty' ? 'Faculty source is handled after faculty assignment.' : 'Create questions in library'}
                  >
                    <FilePlus2 size={22} className="text-brand-500" />
                    <p className="mt-4 text-sm font-semibold text-slate-950">Create Question</p>
                    <p className="mt-2 text-xs leading-5 text-slate-500">Create questions in the library first, then return with that folder selected.</p>
                  </button>
                </div>
              ) : (
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-4">
                    <div className="flex items-start gap-3">
                      <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-brand-100 bg-brand-50 text-brand-600">
                        <BookOpen size={18} />
                      </span>
                      <div>
                        <h3 className="text-sm font-semibold text-slate-950">Selected Library Folders</h3>
                        <p className="mt-1 text-xs leading-5 text-slate-500">Folders are closed by default. Open a folder to inspect questions, then map that folder to one course.</p>
                      </div>
                    </div>
                    <button className="secondary-button h-9 px-3 text-xs" type="button" onClick={() => openQuestionLibrary('import')}>
                      <BookOpen size={15} className="text-brand-500" />
                      Add More Folders
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs font-medium text-slate-600">
                    <span className="rounded-full border border-brand-100 bg-brand-50 px-3 py-1 text-brand-700">
                      {mappedFolders.size} of {visibleFolderDetails.length} folder(s) mapped
                    </span>
                    <span>One course code can be used only once in this assessment.</span>
                    {!hasAvailableCourseForMapping && visibleFolderDetails.some((folder) => !mappedFolders.has(folder.paperHeading)) ? (
                      <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-amber-700">
                        All available courses are already mapped.
                      </span>
                    ) : null}
                  </div>

                  {isLoadingSelectedFolders ? (
                    <div className="p-6 text-center text-sm font-semibold text-slate-500">Loading selected folders...</div>
                  ) : (
                    <div className="divide-y divide-slate-200">
                      {visibleFolderDetails.map((folder, folderIndex) => {
                        const mappedCourse = mappedFolders.get(folder.paperHeading);
                        const isFolderOpen = expandedFolder === folder.paperHeading;

                        return (
                          <div className="bg-white" key={folder.paperHeading}>
                            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                              <button
                                className="flex min-w-0 flex-1 items-center gap-3 text-left"
                                type="button"
                                onClick={() => setExpandedFolder((current) => (current === folder.paperHeading ? '' : folder.paperHeading))}
                              >
                                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                                  {folderIndex + 1}
                                </span>
                                {isFolderOpen ? <ChevronDown size={17} className="shrink-0 text-brand-500" /> : <ChevronRight size={17} className="shrink-0 text-brand-500" />}
                                <span className="min-w-0">
                                  <span className="block truncate text-sm font-semibold text-slate-950">{folder.paperHeading}</span>
                                  <span className="mt-1 block text-xs text-slate-500">
                                    {folder.count} questions · {folder.mcqCount} MCQ · {folder.oneWordCount} one-word · {folder.totalMarks} marks
                                  </span>
                                </span>
                              </button>

                              <div className="flex flex-wrap items-center gap-2">
                                {mappedCourse ? (
                                  <span className="status-badge status-active">
                                    Mapped: {mappedCourse.courseName}{mappedCourse.courseId ? ` (${mappedCourse.courseId})` : ''}
                                  </span>
                                ) : null}
                                <button
                                  className={mappedCourse ? 'secondary-button h-9 px-3 text-xs' : 'primary-button h-9 px-3 text-xs'}
                                  type="button"
                                  onClick={() => openMapDialog(folder)}
                                  disabled={Boolean(mappedCourse) || courseOptions.length === 0 || folder.count === 0 || !hasAvailableCourseForMapping}
                                >
                                  {mappedCourse ? 'Mapped' : 'Map Course'}
                                </button>
                              </div>
                            </div>

                            {isFolderOpen ? (
                              <div className="border-t border-slate-200 bg-slate-50/60 px-5 py-4">
                                <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                                  <table className="data-table">
                                    <thead>
                                      <tr>
                                        <th></th>
                                        <th>Question</th>
                                        <th>Type</th>
                                        <th>Marks</th>
                                        <th>Difficulty</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-200">
                                      {folder.questions.map((question) => {
                                        const questionKey = `${folder.paperHeading}-${question._id}`;
                                        const isQuestionOpen = expandedQuestion === questionKey;

                                        return (
                                          <tr key={question._id}>
                                            <td className="align-top">
                                              <button
                                                className="secondary-button h-8 w-8 px-0"
                                                type="button"
                                                onClick={() => setExpandedQuestion((current) => (current === questionKey ? '' : questionKey))}
                                              >
                                                {isQuestionOpen ? <ChevronDown size={15} className="text-brand-500" /> : <ChevronRight size={15} className="text-brand-500" />}
                                              </button>
                                            </td>
                                            <td className="max-w-[620px] align-top">
                                              <p className="line-clamp-2 font-semibold text-slate-950">{question.questionText}</p>
                                              {isQuestionOpen ? (
                                                <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-600">
                                                  <p className="text-sm font-semibold text-slate-800">{question.questionText}</p>
                                                  {question.type === 'mcq' ? (
                                                    <div className="mt-3 space-y-1">
                                                      {(question.options || []).map((option, optionIndex) => (
                                                        <p key={option._id || optionIndex} className={option.isCorrect ? 'font-semibold text-green-700' : ''}>
                                                          {optionIndex + 1}. {option.text} {option.isCorrect ? '(correct)' : ''}
                                                        </p>
                                                      ))}
                                                    </div>
                                                  ) : (
                                                    <p className="mt-3"><span className="font-semibold">Answer:</span> {question.expectedAnswer || '-'}</p>
                                                  )}
                                                </div>
                                              ) : null}
                                            </td>
                                            <td className="align-top">{question.type === 'one_word' ? 'One-word' : 'MCQ'}</td>
                                            <td className="align-top">{question.positiveMarks || 0}</td>
                                            <td className="align-top capitalize">{question.difficulty}</td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {courseOptions.length === 0 ? (
                    <div className="border-t border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-600">
                      Select assessment courses before mapping folders.
                    </div>
                  ) : null}
                </div>
              )}
              {questionSource === 'faculty' ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold leading-5 text-amber-800">
                  Faculty question source is selected. Admin question import/create is disabled; go next and assign faculty so they can add or edit questions in review flow.
                </div>
              ) : null}
            </div>
          ) : null}

          {activeStep === 3 ? (
            <StaffAssignmentPanel
              label="Faculty"
              icon={UserRoundCog}
              courses={assessmentCourses}
              people={faculty}
              roleKey="faculty"
              onAssign={(course, person) => assignCoursePerson(course, person, 'faculty')}
              onBulkAssign={bulkAssignCoursePeople}
              required={!hasQuestionMapping}
            />
          ) : null}

          {activeStep === 4 ? (
            <StaffAssignmentPanel
              label="Moderator"
              icon={ShieldCheck}
              courses={assessmentCourses.filter((course) => course.facultyId)}
              people={moderators}
              roleKey="moderator"
              onAssign={(course, person) => assignCoursePerson(course, person, 'moderator')}
              onBulkAssign={bulkAssignCoursePeople}
              required={hasFacultyAssignments}
            />
          ) : null}

          {activeStep === 5 ? (
            draftAssessment?._id ? (
              <AssessmentStudentsPage assessmentId={draftAssessment._id} embedded />
            ) : (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm font-semibold text-amber-700">
                Save the assessment draft before adding students.
              </div>
            )
          ) : null}

          {activeStep === 6 ? (
            draftAssessment?._id ? (
              <AssessmentProctorsPage assessmentId={draftAssessment._id} embedded />
            ) : (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm font-semibold text-amber-700">
                Save the assessment draft before adding proctors.
              </div>
            )
          ) : null}

          {activeStep === 7 ? (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 bg-white px-4 py-3">
                <p className="field-label text-brand-600">Exam Window</p>
                <h3 className="mt-1 text-sm font-semibold text-slate-950">Schedule and duration</h3>
                <p className="mt-1 text-xs leading-5 text-slate-500">Students receive individual credentials after publish. No common assessment password is required.</p>
              </div>
              <div className="grid gap-3 p-4 md:grid-cols-3">
                <div>
                  <label className="field-label">Start time</label>
                  <input className="field-input mt-2" type="datetime-local" value={form.startAt} onChange={(event) => updateField('startAt', event.target.value)} />
                </div>
                <div>
                  <label className="field-label">End time</label>
                  <input className="field-input mt-2" type="datetime-local" value={form.endAt} onChange={(event) => updateField('endAt', event.target.value)} />
                </div>
                <div>
                  <label className="field-label">Global duration minutes</label>
                  <input className="field-input mt-2" type="number" min="1" value={form.globalDurationMinutes} onChange={(event) => updateField('globalDurationMinutes', event.target.value)} />
                </div>
              </div>
            </div>
          ) : null}

          {activeStep === 8 ? <SettingsPanel settings={form.settings} onChange={updateSetting} /> : null}

          {activeStep === 9 ? (
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-4">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <FileText size={18} className="text-brand-500" />
                  <p className="mt-3 text-xs font-semibold uppercase text-slate-500">Question Mapping</p>
                  <p className="mt-1 text-sm font-semibold text-slate-950">{questions.length} question(s)</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <CalendarClock size={18} className="text-brand-500" />
                  <p className="mt-3 text-xs font-semibold uppercase text-slate-500">Duration</p>
                  <p className="mt-1 text-2xl font-semibold text-slate-950">{form.globalDurationMinutes || 0}m</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <Video size={18} className="text-brand-500" />
                  <p className="mt-3 text-xs font-semibold uppercase text-slate-500">Proctoring</p>
                  <p className="mt-1 text-sm font-semibold text-slate-950">{form.settings.proctoringEnabled ? 'Enabled' : 'Disabled'}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <ShieldCheck size={18} className="text-brand-500" />
                  <p className="mt-3 text-xs font-semibold uppercase text-slate-500">Security</p>
                  <p className="mt-1 text-sm font-semibold text-slate-950">{form.settings.aiProctoringEnabled ? 'AI enabled' : 'Manual rules'}</p>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="field-label text-brand-600">Assessment detail</p>
                    <h3 className="mt-1 text-lg font-semibold text-slate-950">{form.title || 'Untitled assessment'}</h3>
                    <p className="mt-1 text-sm text-slate-500">{form.assessmentCode || 'No code'} / {form.type || 'exam'}</p>
                  </div>
                  <span className="status-badge status-review">
                    {(draftAssessment?.status || form.status || 'draft').replace(/_/g, ' ')}
                  </span>
                </div>

                <div className="mt-5 grid gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200 md:grid-cols-2">
                  {[
                    ['Start', formatReviewDateTime(form.startAt)],
                    ['End', formatReviewDateTime(form.endAt)],
                    ['Courses', String(assessmentCourses.length)],
                    ['Faculty selected', String(assessmentCourses.filter((course) => course.facultyId).length)],
                    ['Moderators selected', String(assessmentCourses.filter((course) => course.moderatorId).length)],
                    ['Students and proctors', `${draftAssessment?.counts?.students || 0} students / ${draftAssessment?.counts?.proctors || 0} proctors`],
                  ].map(([label, value]) => (
                    <div className="bg-slate-50 p-3" key={label}>
                      <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
                      <p className="mt-1 text-sm font-semibold text-slate-950">{value}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <div className="border-b border-slate-200 px-5 py-4">
                  <p className="field-label text-brand-600">Review routing</p>
                  <p className="mt-1 text-sm font-semibold text-slate-950">Faculty and moderator assignments by course</p>
                </div>
                <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                  <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Course</th>
                      <th className="px-4 py-3">Questions</th>
                      <th className="px-4 py-3">Faculty</th>
                      <th className="px-4 py-3">Moderator</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {assessmentCourses.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-6 text-center text-sm font-semibold text-slate-500">
                          No course routing selected yet.
                        </td>
                      </tr>
                    ) : (
                      assessmentCourses.map((course) => (
                        <tr key={`review-${courseKey(course)}`}>
                          <td className="px-4 py-3">
                            <p className="font-semibold text-slate-950">{course.courseName}</p>
                            <p className="text-xs text-slate-500">{course.courseId || '-'}</p>
                          </td>
                          <td className="px-4 py-3 font-semibold text-slate-700">{course.questionCount || 0}</td>
                          <td className="px-4 py-3 text-slate-700">{course.facultyName || 'Not selected'}</td>
                          <td className="px-4 py-3 text-slate-700">{course.moderatorName || 'Not selected'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {validation.length > 0 ? (
                <div className="rounded-md border border-red-200 bg-red-50 p-4">
                  <p className="text-sm font-semibold text-red-700">Resolve before saving</p>
                  <ul className="mt-2 space-y-1 text-sm text-red-700">
                    {validation.map((issue) => (
                      <li key={issue}>{issue}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 p-4 text-sm font-semibold text-green-700">
                  <Check size={17} />
                  Assessment draft is ready to save.
                </div>
              )}

              {validation.length === 0 && questions.length === 0 ? (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-700">
                  Add at least one question before publishing.
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="flex justify-between border-t border-slate-200 bg-slate-50 px-5 py-4">
          <button className="secondary-button" type="button" onClick={() => setActiveStep((step) => Math.max(step - 1, 0))}>
            Back
          </button>
          {activeStep < steps.length - 1 ? (
            <button className="primary-button" type="button" onClick={handleNext} disabled={isSaving}>
              {isSaving && (activeStep === 0 || activeStep === 1 || activeStep >= 3) ? 'Saving Draft' : 'Next'}
            </button>
          ) : (
            <div className="flex flex-wrap justify-end gap-2">
              <button className="secondary-button" type="button" onClick={handleSubmit} disabled={isSaving || isPublishing || basicValidation.length > 0}>
                <Save size={17} className="text-brand-500" />
                {isSaving ? 'Saving draft' : 'Save Draft'}
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={handleReviewAssessment}
                disabled={isSaving || isPublishing || validation.length > 0 || !hasFacultyAssignments}
              >
                <ShieldCheck size={17} className="text-brand-500" />
                {isPublishing ? 'Sending review' : 'Review Assessment'}
              </button>
              <button
                className="primary-button"
                type="button"
                onClick={handlePublish}
                disabled={isSaving || isPublishing || validation.length > 0 || questions.length === 0}
              >
                <CheckCircle2 size={17} />
                {isPublishing ? 'Publishing' : 'Publish Assessment'}
              </button>
            </div>
          )}
        </div>
      </main>
    </div>

    {mapDialog ? (
      <CourseMapModal
        group={mapDialog}
        courses={courseOptions}
        selectedCourseKey={selectedCourseKey}
        usedCourseKeys={usedCourseKeys}
        onSelect={setSelectedCourseKey}
        onCancel={() => setMapDialog(null)}
        onConfirm={importLibraryHeading}
        isSaving={isImporting}
      />
    ) : null}

    </section>
  );
}
