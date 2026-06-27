import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { BookOpen, CheckCircle2, ChevronDown, ClipboardList, Send, ShieldCheck, Trash2, UserRoundCog } from 'lucide-react';
import { api } from '../../lib/api';
import { EmptyState, PageHeader, SectionPanel } from '../../ui/Surface.jsx';

function getRoleBase(pathname) {
  return pathname.startsWith('/super-admin') ? '/super-admin' : '/admin';
}

function courseKey(course) {
  return `${course.courseName}|${course.courseId || ''}`;
}

function staffCanHandleCourse(person, course) {
  const normalize = (value) => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  const courseValues = new Set([normalize(course.courseName), normalize(course.courseId)].filter(Boolean));
  return (person.assignedCourses || []).some((assignedCourse) =>
    [normalize(assignedCourse.courseName), normalize(assignedCourse.courseCode), normalize(assignedCourse.courseId)]
      .filter(Boolean)
      .some((value) => courseValues.has(value))
  );
}

function courseWorkPercent(status) {
  const values = {
    mapped: 100,
    assigned: 25,
    in_progress: 45,
    submitted: 75,
    rejected: 35,
    approved: 100,
  };
  return values[status] || 0;
}

function courseWorkLabel(status, paperHeading) {
  if (status === 'mapped') return paperHeading || 'Question paper mapped';
  if (status === 'assigned') return 'Assigned to Faculty';
  if (status === 'in_progress') return 'Faculty is creating question paper';
  if (status === 'submitted') return 'Sent to Moderator';
  if (status === 'rejected') return 'Sent back to Faculty';
  if (status === 'approved') return paperHeading || 'Question paper approved';
  return 'Question paper pending';
}

export function ReviewQuestionMappingPage() {
  const { assessmentId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const roleBase = getRoleBase(location.pathname);
  const [assessment, setAssessment] = useState(null);
  const [libraryGroups, setLibraryGroups] = useState([]);
  const [faculty, setFaculty] = useState([]);
  const [moderators, setModerators] = useState([]);
  const [selectedGroups, setSelectedGroups] = useState({});
  const [selectedFaculty, setSelectedFaculty] = useState({});
  const [selectedModerators, setSelectedModerators] = useState({});
  const [expandedCourseId, setExpandedCourseId] = useState('');
  const [busyKey, setBusyKey] = useState('');
  const [isPublishing, setIsPublishing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const reviewSummary = assessment?.reviewSummary || {};
  const progressPercent = Number(reviewSummary.progressPercent || 0);
  const summaryByCourse = useMemo(() => {
    const map = new Map();
    (reviewSummary.courses || []).forEach((course) => {
      map.set(String(course.courseSubdocumentId), course);
    });
    return map;
  }, [reviewSummary.courses]);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const [assessmentResponse, libraryResponse, facultyResponse, moderatorResponse] = await Promise.all([
        api.get(`/assessments/${assessmentId}`),
        api.get('/library/groups'),
        api.get('/people/faculty', { params: { status: 'active', limit: 1000 } }),
        api.get('/people/moderators', { params: { status: 'active', limit: 1000 } }),
      ]);
      const loadedAssessment = assessmentResponse.data.assessment;
      setAssessment(loadedAssessment);
      setLibraryGroups(libraryResponse.data.items || []);
      setFaculty(facultyResponse.data.items || []);
      setModerators(moderatorResponse.data.items || []);
      setSelectedFaculty(
        Object.fromEntries((loadedAssessment.courses || []).map((course) => [course._id, course.facultyId || '']))
      );
      setSelectedModerators(
        Object.fromEntries((loadedAssessment.courses || []).map((course) => [course._id, course.moderatorId || '']))
      );
      setExpandedCourseId((current) => current || loadedAssessment.courses?.[0]?._id || '');
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to load review question mapping.');
    } finally {
      setIsLoading(false);
    }
  }, [assessmentId]);

  useEffect(() => {
    load();
  }, [load]);

  async function refreshAssessment() {
    const response = await api.get(`/assessments/${assessmentId}`);
    setAssessment(response.data.assessment);
  }

  async function mapFromLibrary(course) {
    const paperHeading = selectedGroups[course._id];
    if (!paperHeading) {
      setError('Select a library heading before saving this course.');
      return;
    }

    setBusyKey(`library-${course._id}`);
    setError('');
    setNotice('');
    try {
      await api.post(`/assessments/${assessmentId}/questions/from-library-heading`, {
        paperHeading,
        course: { courseName: course.courseName, courseId: course.courseId },
        source: 'both',
      });
      setNotice(`${course.courseName} questions mapped successfully.`);
      setSelectedGroups((current) => ({ ...current, [course._id]: '' }));
      await refreshAssessment();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to map library questions.');
    } finally {
      setBusyKey('');
    }
  }

  async function removeCourseMapping(course) {
    setBusyKey(`remove-${course._id}`);
    setError('');
    setNotice('');
    try {
      await api.delete(`/assessments/${assessmentId}/questions/course-mapping`, {
        data: { course: { courseName: course.courseName, courseId: course.courseId } },
      });
      setSelectedFaculty((current) => ({ ...current, [course._id]: '' }));
      setSelectedModerators((current) => ({ ...current, [course._id]: '' }));
      setSelectedGroups((current) => ({ ...current, [course._id]: '' }));
      setNotice(`${course.courseName} question paper removed.`);
      await refreshAssessment();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to remove question paper.');
    } finally {
      setBusyKey('');
    }
  }

  async function assignFacultyModerator(course) {
    const facultyId = selectedFaculty[course._id];
    const moderatorId = selectedModerators[course._id];
    const facultyPerson = faculty.find((person) => person._id === facultyId);
    const moderatorPerson = moderators.find((person) => person._id === moderatorId);

    if (!facultyPerson || !moderatorPerson) {
      setError('Select both faculty and moderator before assigning this course.');
      return;
    }

    const nextCourses = (assessment.courses || []).map((item) =>
      item._id === course._id
        ? {
            ...item,
            facultyId: facultyPerson._id,
            facultyName: facultyPerson.name,
            facultyEmail: facultyPerson.email,
            moderatorId: moderatorPerson._id,
            moderatorName: moderatorPerson.name,
            moderatorEmail: moderatorPerson.email,
          }
        : item
    );

    setBusyKey(`assign-${course._id}`);
    setError('');
    setNotice('');
    try {
      const response = await api.patch(`/assessments/${assessmentId}`, {
        courses: nextCourses,
        status: 'review',
        visibility: 'hidden',
      });
      setAssessment(response.data.assessment);
      setNotice(`${course.courseName} sent to faculty. Faculty mail will be sent by the assignment flow.`);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to assign faculty and moderator.');
    } finally {
      setBusyKey('');
    }
  }

  async function publishAssessment() {
    setIsPublishing(true);
    setError('');
    setNotice('');
    try {
      await api.patch(`/assessments/${assessmentId}`, {
        status: 'pending',
        visibility: 'visible',
      });
      setNotice('Assessment published successfully.');
      navigate(`${roleBase}/assessments/my`, { replace: true });
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to publish assessment.');
    } finally {
      setIsPublishing(false);
    }
  }

  return (
    <section className="space-y-5">
      <PageHeader
        eyebrow="Review Assessment"
        title={assessment?.title || 'Edit Questions'}
        description="Map questions course-wise using the library or assign faculty and moderator for review."
        actions={<Link className="secondary-button" to={`${roleBase}/assessments/review`}>Back to review</Link>}
      />

      {error ? <div className="border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div> : null}
      {notice ? <div className="border border-green-200 bg-green-50 px-4 py-3 text-sm font-semibold text-green-700">{notice}</div> : null}

      <SectionPanel title="Question Mapping Progress" icon={ClipboardList}>
        <div className="p-5">
          <div className="flex items-center justify-between text-sm font-semibold text-slate-700">
            <span>{Number(reviewSummary.completed || 0)} of {Number(reviewSummary.total || 0)} course(s) completed</span>
            <span className="text-brand-700">{progressPercent}%</span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
            <div className="h-full rounded-full bg-brand-500 transition-all duration-500" style={{ width: `${progressPercent}%` }} />
          </div>
          {progressPercent === 100 ? (
            <button className="primary-button mt-4" type="button" onClick={publishAssessment} disabled={isPublishing || assessment?.status !== 'review'}>
              <CheckCircle2 size={17} />
              {isPublishing ? 'Publishing' : 'Publish Assessment'}
            </button>
          ) : null}
        </div>
      </SectionPanel>

      <div className="space-y-4">
        {isLoading ? (
          <div className="rounded-lg border border-slate-200 bg-white p-6 text-center text-sm font-semibold text-slate-500">Loading courses...</div>
        ) : (assessment?.courses || []).length === 0 ? (
          <EmptyState title="No courses selected" description="This assessment has no selected courses." />
        ) : (
          assessment.courses.map((course) => {
            const status = summaryByCourse.get(String(course._id));
            const eligibleFaculty = faculty.filter((person) => staffCanHandleCourse(person, course));
            const eligibleModerators = moderators.filter((person) => staffCanHandleCourse(person, course));
            const statusValue = status?.status || 'pending';
            const isOpen = expandedCourseId === course._id;
            const hasCoursePaper = statusValue !== 'pending' || Boolean(status?.paperHeading) || Number(status?.questionCount || course.questionCount || 0) > 0;
            const coursePercent = courseWorkPercent(statusValue);
            const courseLabel = courseWorkLabel(statusValue, status?.paperHeading);

            return (
              <div key={course._id || courseKey(course)} className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-panel">
                <button
                  className="flex w-full items-center justify-between gap-4 bg-white px-5 py-4 text-left transition hover:bg-slate-50"
                  type="button"
                  onClick={() => setExpandedCourseId((current) => (current === course._id ? '' : course._id))}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-950">{course.courseName}</p>
                    <p className="mt-1 text-xs text-slate-500">{course.courseId || 'No course ID'}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className={`status-badge ${status?.completed ? 'status-active' : statusValue === 'pending' ? 'status-pending' : 'status-draft'}`}>
                      {statusValue.replace(/_/g, ' ')}
                    </span>
                    <ChevronDown size={17} className={isOpen ? 'rotate-180 text-brand-500 transition' : 'text-brand-500 transition'} />
                  </div>
                </button>

                {isOpen ? (
                  <div className="border-t border-slate-200 bg-slate-50/60 p-5">
                    {hasCoursePaper ? (
                      <div className="rounded-lg border border-slate-200 bg-white p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="field-label text-brand-600">Question Paper</p>
                            <h3 className="mt-1 text-sm font-semibold text-slate-950">{courseLabel}</h3>
                            <p className="mt-1 text-xs text-slate-500">
                              {Number(status?.questionCount || course.questionCount || 0)} question(s)
                              {status?.paperHeading ? ` / ${status.paperHeading}` : ''}
                            </p>
                          </div>
                          <button
                            className="secondary-button text-red-700 hover:border-red-200 hover:bg-red-50 hover:text-red-700"
                            type="button"
                            onClick={() => removeCourseMapping(course)}
                            disabled={busyKey === `remove-${course._id}`}
                          >
                            <Trash2 size={15} />
                            {busyKey === `remove-${course._id}` ? 'Removing' : 'Remove'}
                          </button>
                        </div>
                        <div className="mt-4">
                          <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
                            <span>{courseLabel}</span>
                            <span className="text-brand-700">{coursePercent}%</span>
                          </div>
                          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                            <div className="h-full rounded-full bg-brand-500 transition-all duration-500" style={{ width: `${coursePercent}%` }} />
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="grid gap-4 xl:grid-cols-2">
                        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="field-label text-brand-600">Select from Library</p>
                              <p className="mt-1 text-sm font-semibold text-slate-950">No question paper mapped</p>
                            </div>
                            <span className="status-badge status-pending">Pending</span>
                          </div>
                          <div className="mt-4 flex flex-wrap gap-2">
                            <select
                              className="field-input min-w-[260px] flex-1"
                              value={selectedGroups[course._id] || ''}
                              onChange={(event) => setSelectedGroups((current) => ({ ...current, [course._id]: event.target.value }))}
                            >
                              <option value="">Select library heading</option>
                              {libraryGroups.map((group) => (
                                <option key={group.paperHeading} value={group.paperHeading}>
                                  {group.paperHeading} ({group.count})
                                </option>
                              ))}
                            </select>
                            <button className="primary-button" type="button" onClick={() => mapFromLibrary(course)} disabled={busyKey === `library-${course._id}`}>
                              <CheckCircle2 size={16} />
                              {busyKey === `library-${course._id}` ? 'Saving' : 'Save'}
                            </button>
                          </div>
                        </div>

                        <div className="rounded-lg border border-slate-200 bg-white p-4">
                          <p className="field-label text-brand-600">Assign Faculty and Moderator</p>
                          <div className="mt-4 grid gap-3 md:grid-cols-2">
                            <select className="field-input" value={selectedFaculty[course._id] || ''} onChange={(event) => setSelectedFaculty((current) => ({ ...current, [course._id]: event.target.value }))}>
                              <option value="">Select faculty</option>
                              {eligibleFaculty.map((person) => <option key={person._id} value={person._id}>{person.name} - {person.email}</option>)}
                            </select>
                            <select className="field-input" value={selectedModerators[course._id] || ''} onChange={(event) => setSelectedModerators((current) => ({ ...current, [course._id]: event.target.value }))}>
                              <option value="">Select moderator</option>
                              {eligibleModerators.map((person) => <option key={person._id} value={person._id}>{person.name} - {person.email}</option>)}
                            </select>
                          </div>
                          <button className="secondary-button mt-4" type="button" onClick={() => assignFacultyModerator(course)} disabled={busyKey === `assign-${course._id}`}>
                            <Send size={16} className="text-brand-500" />
                            {busyKey === `assign-${course._id}` ? 'Assigning' : 'Assign'}
                          </button>
                          <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
                            <span className="inline-flex items-center gap-1 text-slate-600"><UserRoundCog size={13} />{course.facultyName || 'Faculty not assigned'}</span>
                            <span className="inline-flex items-center gap-1 text-slate-600"><ShieldCheck size={13} />{course.moderatorName || 'Moderator not assigned'}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
