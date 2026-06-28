import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, BookOpen, CheckCircle2, Search, Send, ShieldCheck, Trash2, UserRoundCog, Users } from 'lucide-react';
import { api } from '../../lib/api';
import { EmptyState } from '../../ui/Surface.jsx';

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

function courseWorkLabel(status, paperHeading) {
  if (status === 'mapped') return paperHeading || 'Question paper mapped';
  if (status === 'assigned') return 'Assigned to Faculty';
  if (status === 'in_progress') return 'Faculty is creating question paper';
  if (status === 'submitted') return 'Sent to Moderator';
  if (status === 'rejected') return 'Sent back to Faculty';
  if (status === 'approved') return paperHeading || 'Question paper approved';
  return 'Question paper pending';
}

function courseStatusMeta(status, completed) {
  if (completed) {
    return {
      label: status === 'approved' ? 'Approved' : 'Ready',
      className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
      dot: 'bg-emerald-500',
      filter: 'completed',
    };
  }

  const meta = {
    assigned: {
      label: 'Assigned',
      className: 'border-sky-200 bg-sky-50 text-sky-700',
      dot: 'bg-sky-500',
      filter: 'working',
    },
    in_progress: {
      label: 'In progress',
      className: 'border-sky-200 bg-sky-50 text-sky-700',
      dot: 'bg-sky-500',
      filter: 'working',
    },
    submitted: {
      label: 'Moderator review',
      className: 'border-violet-200 bg-violet-50 text-violet-700',
      dot: 'bg-violet-500',
      filter: 'working',
    },
    rejected: {
      label: 'Changes needed',
      className: 'border-rose-200 bg-rose-50 text-rose-700',
      dot: 'bg-rose-500',
      filter: 'working',
    },
    mapped: {
      label: 'Mapped',
      className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
      dot: 'bg-emerald-500',
      filter: 'completed',
    },
  };

  return meta[status] || {
    label: 'Pending',
    className: 'border-amber-200 bg-amber-50 text-amber-700',
    dot: 'bg-amber-500',
    filter: 'pending',
  };
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
  const [courseSearch, setCourseSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [activePanel, setActivePanel] = useState('questions');
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
  const courses = useMemo(() => assessment?.courses || [], [assessment?.courses]);
  const courseStats = useMemo(() => {
    const total = courses.length;
    const completed = courses.filter((course) => summaryByCourse.get(String(course._id))?.completed).length;
    const assigned = courses.filter((course) => {
      const status = summaryByCourse.get(String(course._id))?.status;
      return ['assigned', 'in_progress', 'submitted', 'rejected'].includes(status);
    }).length;

    return {
      total,
      completed,
      assigned,
      pending: Math.max(total - completed - assigned, 0),
    };
  }, [courses, summaryByCourse]);
  const filteredCourses = useMemo(() => {
    const normalizedSearch = courseSearch.trim().toLowerCase();

    return courses.filter((course) => {
      const status = summaryByCourse.get(String(course._id));
      const statusMeta = courseStatusMeta(status?.status || 'pending', Boolean(status?.completed));
      const matchesFilter = statusFilter === 'all' || statusMeta.filter === statusFilter;
      const haystack = `${course.courseName || ''} ${course.courseId || ''}`.toLowerCase();
      return matchesFilter && (!normalizedSearch || haystack.includes(normalizedSearch));
    });
  }, [courseSearch, courses, statusFilter, summaryByCourse]);
  const activeCourse = useMemo(() => {
    if (!courses.length) return null;
    return courses.find((course) => course._id === expandedCourseId) || filteredCourses[0] || courses[0];
  }, [courses, expandedCourseId, filteredCourses]);
  const activeCourseStatus = activeCourse ? summaryByCourse.get(String(activeCourse._id)) : null;
  const activeStatusValue = activeCourseStatus?.status || 'pending';
  const activeStatusMeta = courseStatusMeta(activeStatusValue, Boolean(activeCourseStatus?.completed));
  const activeHasCoursePaper = Boolean(
    activeCourse
      && (['mapped', 'approved'].includes(activeStatusValue)
        || activeCourseStatus?.paperHeading
        || Number(activeCourseStatus?.questionCount || activeCourse.questionCount || 0) > 0)
  );
  const activeCourseLabel = courseWorkLabel(activeStatusValue, activeCourseStatus?.paperHeading);
  const eligibleFaculty = useMemo(
    () => (activeCourse ? faculty.filter((person) => staffCanHandleCourse(person, activeCourse)) : []),
    [activeCourse, faculty]
  );
  const eligibleModerators = useMemo(
    () => (activeCourse ? moderators.filter((person) => staffCanHandleCourse(person, activeCourse)) : []),
    [activeCourse, moderators]
  );
  const selectedFacultyPerson = eligibleFaculty.find((person) => person._id === selectedFaculty[activeCourse?._id]);
  const selectedModeratorPerson = eligibleModerators.find((person) => person._id === selectedModerators[activeCourse?._id]);

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
    <section className="space-y-3">
      <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[11px] font-bold uppercase text-brand-600">Question Setup</p>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-bold text-slate-600">
                {courseStats.completed}/{courseStats.total} ready
              </span>
              <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${
                progressPercent === 100
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border-sky-200 bg-sky-50 text-sky-700'
              }`}>
                {progressPercent}%
              </span>
            </div>
            <h1 className="mt-1 truncate text-lg font-semibold text-slate-950">{assessment?.title || 'Add Questions'}</h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="hidden items-center overflow-hidden rounded-md border border-slate-200 text-xs font-bold text-slate-600 md:flex">
              <span className="px-2.5 py-1.5">Total {courseStats.total}</span>
              <span className="border-l border-slate-200 px-2.5 py-1.5 text-emerald-700">Ready {courseStats.completed}</span>
              <span className="border-l border-slate-200 px-2.5 py-1.5 text-sky-700">Review {courseStats.assigned}</span>
              <span className="border-l border-slate-200 px-2.5 py-1.5 text-amber-700">Pending {courseStats.pending}</span>
            </div>
            <Link className="secondary-button h-9 px-3 text-xs" to={`${roleBase}/assessments/review`}>
              <ArrowLeft size={14} />
              Back
            </Link>
            <button
              className="primary-button h-9 px-3 text-xs"
              type="button"
              onClick={publishAssessment}
              disabled={isPublishing || assessment?.status !== 'review' || progressPercent !== 100}
              title={progressPercent === 100 ? 'Publish assessment' : 'Complete all courses before publishing'}
            >
              <CheckCircle2 size={15} />
              {isPublishing ? 'Publishing' : 'Publish'}
            </button>
          </div>
        </div>
      </div>

      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700">{error}</div> : null}
      {notice ? <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700">{notice}</div> : null}

      {isLoading ? (
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm font-semibold text-slate-500">Loading courses...</div>
      ) : courses.length === 0 ? (
        <EmptyState title="No courses selected" description="This assessment has no selected courses." />
      ) : (
        <div className="grid gap-3 xl:grid-cols-[minmax(300px,340px)_minmax(0,1fr)]">
          <aside className="self-start overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm xl:sticky xl:top-16">
            <div className="border-b border-slate-200 p-2.5">
              <div className="search-field h-9">
                <Search size={15} className="text-slate-400" />
                <input
                  className="h-8 flex-1 border-0 bg-transparent px-2 text-sm outline-none"
                  placeholder="Search course name or code"
                  value={courseSearch}
                  onChange={(event) => setCourseSearch(event.target.value)}
                />
              </div>
              <div className="mt-2 flex gap-1 overflow-x-auto">
                {[
                  ['all', 'All'],
                  ['pending', 'Pending'],
                  ['working', 'Review'],
                  ['completed', 'Ready'],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setStatusFilter(value)}
                    className={`h-8 shrink-0 rounded-md border px-3 text-xs font-bold transition ${
                      statusFilter === value
                        ? 'border-sky-200 bg-sky-50 text-sky-700'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-950'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="mt-2 px-1 text-[11px] font-bold uppercase text-slate-400">{filteredCourses.length} of {courses.length} courses</p>
            </div>

            <div className="max-h-[calc(100vh-222px)] min-h-[360px] overflow-y-auto">
              {filteredCourses.length === 0 ? (
                <p className="px-3 py-8 text-center text-sm font-semibold text-slate-500">No courses match the current filters.</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {filteredCourses.map((course) => {
                    const status = summaryByCourse.get(String(course._id));
                    const statusMeta = courseStatusMeta(status?.status || 'pending', Boolean(status?.completed));
                    const isActive = activeCourse?._id === course._id;
                    const courseHasPaper = ['mapped', 'approved'].includes(status?.status)
                      || Boolean(status?.paperHeading)
                      || Number(status?.questionCount || course.questionCount || 0) > 0;
                    const courseHasFacultyRoute = ['assigned', 'in_progress', 'submitted', 'rejected'].includes(status?.status);

                    return (
                      <button
                        key={course._id || courseKey(course)}
                        type="button"
                        onClick={() => {
                          setExpandedCourseId(course._id);
                          setActivePanel(courseHasFacultyRoute && !courseHasPaper ? 'team' : 'questions');
                        }}
                        className={`w-full border-l-2 px-3 py-2 text-left transition ${
                          isActive
                            ? 'border-l-sky-500 bg-sky-50/80'
                            : 'border-l-transparent bg-white hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-[13px] font-bold text-slate-950">{course.courseName}</p>
                            <p className="mt-0.5 truncate text-[11px] font-semibold text-slate-500">{course.courseId || 'No course ID'}</p>
                          </div>
                          <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${statusMeta.className}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${statusMeta.dot}`} />
                            {statusMeta.label}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </aside>

          <section className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            {activeCourse ? (
              <>
                <div className="border-b border-slate-200 px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold text-slate-950">{activeCourse.courseName}</p>
                      <p className="mt-0.5 text-xs font-semibold text-slate-500">{activeCourse.courseId || 'No course ID'}</p>
                    </div>
                    <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-bold ${activeStatusMeta.className}`}>
                      <span className={`h-2 w-2 rounded-full ${activeStatusMeta.dot}`} />
                      {activeStatusMeta.label}
                    </span>
                  </div>

                  <div className="mt-3 grid grid-cols-2 rounded-md border border-slate-200 bg-slate-50 p-1">
                    {[
                      ['questions', 'Add from Library', BookOpen],
                      ['team', 'Send to Faculty', Users],
                    ].map(([value, label, Icon]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setActivePanel(value)}
                        className={`inline-flex h-9 items-center justify-center gap-2 rounded px-3 text-sm font-bold transition ${
                          activePanel === value
                            ? 'bg-white text-sky-700 shadow-sm'
                            : 'text-slate-600 hover:bg-white/70 hover:text-slate-950'
                        }`}
                      >
                        <Icon size={15} />
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="p-4">
                  {activePanel === 'questions' ? (
                    <div>
                      {activeHasCoursePaper ? (
                        <div className="rounded-md border border-emerald-200 bg-emerald-50/60 p-3">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-slate-950">{activeCourseLabel}</p>
                              <p className="mt-0.5 text-xs font-semibold text-slate-600">
                                {Number(activeCourseStatus?.questionCount || activeCourse.questionCount || 0)} question(s)
                                {activeCourseStatus?.paperHeading ? ` / ${activeCourseStatus.paperHeading}` : ''}
                              </p>
                            </div>
                            <button
                              className="secondary-button text-red-700 hover:border-red-200 hover:bg-red-50 hover:text-red-700"
                              type="button"
                              onClick={() => removeCourseMapping(activeCourse)}
                              disabled={busyKey === `remove-${activeCourse._id}`}
                            >
                              <Trash2 size={15} />
                              {busyKey === `remove-${activeCourse._id}` ? 'Removing' : 'Remove'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-md border border-slate-200 bg-white p-3">
                          <div className="flex flex-wrap gap-2">
                            <select
                              id="library-heading"
                              className="field-input min-w-[280px] flex-1"
                              value={selectedGroups[activeCourse._id] || ''}
                              onChange={(event) => setSelectedGroups((current) => ({ ...current, [activeCourse._id]: event.target.value }))}
                            >
                              <option value="">Select library heading</option>
                              {libraryGroups.map((group) => (
                                <option key={group.paperHeading} value={group.paperHeading}>
                                  {group.paperHeading} ({group.count})
                                </option>
                              ))}
                            </select>
                            <button
                              className="primary-button"
                              type="button"
                              onClick={() => mapFromLibrary(activeCourse)}
                              disabled={busyKey === `library-${activeCourse._id}`}
                            >
                              <CheckCircle2 size={16} />
                              {busyKey === `library-${activeCourse._id}` ? 'Adding' : 'Add Questions'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : null}

                  {activePanel === 'team' ? (
                    activeHasCoursePaper ? (
                      <div className="rounded-md border border-emerald-200 bg-emerald-50/60 p-3">
                        <p className="text-sm font-semibold text-slate-950">Questions already added.</p>
                        <p className="mt-1 text-xs font-semibold text-slate-600">Remove them first to use faculty route.</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="grid gap-3 lg:grid-cols-2">
                          <div>
                            <label className="field-label" htmlFor="faculty-select">Faculty ({eligibleFaculty.length})</label>
                            <select
                              id="faculty-select"
                              className="field-input mt-2"
                              value={selectedFaculty[activeCourse._id] || ''}
                              onChange={(event) => setSelectedFaculty((current) => ({ ...current, [activeCourse._id]: event.target.value }))}
                            >
                              <option value="">Select faculty</option>
                              {eligibleFaculty.map((person) => <option key={person._id} value={person._id}>{person.name} - {person.email}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="field-label" htmlFor="moderator-select">Moderator ({eligibleModerators.length})</label>
                            <select
                              id="moderator-select"
                              className="field-input mt-2"
                              value={selectedModerators[activeCourse._id] || ''}
                              onChange={(event) => setSelectedModerators((current) => ({ ...current, [activeCourse._id]: event.target.value }))}
                            >
                              <option value="">Select moderator</option>
                              {eligibleModerators.map((person) => <option key={person._id} value={person._id}>{person.name} - {person.email}</option>)}
                            </select>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 p-2.5">
                          <div className="flex flex-wrap gap-1.5 text-xs font-semibold">
                            <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-600">
                              <UserRoundCog size={13} />
                              {selectedFacultyPerson?.name || activeCourse.facultyName || 'Faculty pending'}
                            </span>
                            <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-600">
                              <ShieldCheck size={13} />
                              {selectedModeratorPerson?.name || activeCourse.moderatorName || 'Moderator pending'}
                            </span>
                          </div>
                          <button
                            className="primary-button"
                            type="button"
                            onClick={() => assignFacultyModerator(activeCourse)}
                            disabled={busyKey === `assign-${activeCourse._id}`}
                          >
                            <Send size={16} />
                              {busyKey === `assign-${activeCourse._id}` ? 'Sending' : 'Send'}
                          </button>
                        </div>
                      </div>
                    )
                  ) : null}
                </div>
              </>
            ) : (
              <EmptyState title="Select a course" description="Choose a course from the left list to manage its question workflow." />
            )}
          </section>
        </div>
      )}
    </section>
  );
}
