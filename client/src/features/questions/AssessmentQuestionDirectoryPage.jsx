import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import {
  BookOpen,
  ChevronDown,
  ClipboardList,
  FileQuestion,
  ListFilter,
  Pencil,
  Search,
  ShieldCheck,
  UserRoundCheck,
  X,
} from 'lucide-react';
import { api } from '../../lib/api';
import { EmptyState, MetricCard, PageHeader, SectionPanel } from '../../ui/Surface.jsx';

function getRoleBase(pathname) {
  return pathname.startsWith('/super-admin') ? '/super-admin' : '/admin';
}

function formatDate(value) {
  return value ? new Date(value).toLocaleString() : 'Not set';
}

function statusClass(status) {
  return `status-badge status-${String(status || '').replace(/\s+/g, '_')}`;
}

function statusLabel(status) {
  return String(status || 'mapped').replace(/_/g, ' ');
}

function questionTypeLabel(type) {
  return type === 'one_word' ? 'One word' : 'MCQ';
}

function personLabel(person) {
  return person?.name || person?.email || '-';
}

function QuestionSetModal({ group, expandedQuestionId, onExpandQuestion, onClose }) {
  if (!group) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4">
      <div className="flex max-h-[88vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 bg-slate-50 p-4">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wider text-brand-600">Question Set</p>
            <h2 className="mt-1 truncate text-lg font-bold text-slate-950">{group.heading}</h2>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              {group.courseName}{group.courseId ? ` (${group.courseId})` : ''} · {group.questions.length} question(s) · {group.marks} marks
            </p>
          </div>
          <button className="secondary-button h-8 w-8 p-0" type="button" onClick={onClose} aria-label="Close questions">
            <X size={15} />
          </button>
        </div>

        <div className="grid border-b border-slate-200 bg-white md:grid-cols-3">
          <div className="border-b border-slate-100 px-4 py-3 md:border-b-0 md:border-r">
            <p className="field-label">Faculty</p>
            <p className="mt-1 truncate text-sm font-semibold text-slate-950">{personLabel(group.faculty || group.creator)}</p>
            <p className="truncate text-xs text-slate-500">{group.faculty?.email || group.creator?.email || '-'}</p>
          </div>
          <div className="border-b border-slate-100 px-4 py-3 md:border-b-0 md:border-r">
            <p className="field-label">Moderator</p>
            <p className="mt-1 truncate text-sm font-semibold text-slate-950">{personLabel(group.moderator)}</p>
            <p className="truncate text-xs text-slate-500">{group.moderator?.email || '-'}</p>
          </div>
          <div className="px-4 py-3">
            <p className="field-label">Review status</p>
            <span className={statusClass(group.assignmentStatus || 'mapped')}>{statusLabel(group.assignmentStatus)}</span>
          </div>
        </div>

        <div className="min-h-0 overflow-y-auto p-4">
          <div className="space-y-2">
            {group.questions.map((question, index) => {
              const questionOpen = expandedQuestionId === question._id;
              return (
                <div key={question._id} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                  <button
                    className="grid w-full gap-3 px-3 py-3 text-left hover:bg-slate-50 md:grid-cols-[2.5rem_minmax(0,1fr)_auto] md:items-center"
                    type="button"
                    onClick={() => onExpandQuestion(questionOpen ? '' : question._id)}
                  >
                    <span className="grid h-8 w-8 place-items-center rounded-md border border-slate-200 bg-slate-50 text-xs font-bold text-slate-500">{index + 1}</span>
                    <div className="min-w-0">
                      <p className="line-clamp-2 text-sm font-semibold text-slate-950">{question.questionText}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {questionTypeLabel(question.type)} · {question.difficulty} · +{question.positiveMarks || 0} / -{question.negativeMarks || 0}
                      </p>
                    </div>
                    <ChevronDown size={16} className={questionOpen ? 'rotate-180 text-brand-500 transition' : 'text-brand-500 transition'} />
                  </button>

                  {questionOpen ? (
                    <div className="border-t border-slate-100 bg-slate-50 p-3">
                      <div className="grid gap-3 lg:grid-cols-[1fr_280px]">
                        <div className="rounded-md border border-slate-200 bg-white p-4">
                          <p className="field-label">Answer and solution</p>
                          {question.type === 'mcq' ? (
                            <div className="mt-3 grid gap-2 md:grid-cols-2">
                              {(question.options || []).map((option, optionIndex) => (
                                <div
                                  key={option._id || `${question._id}-${optionIndex}`}
                                  className={`rounded-md border px-3 py-2 text-sm ${
                                    option.isCorrect ? 'border-green-200 bg-green-50 font-semibold text-green-800' : 'border-slate-200 bg-white text-slate-700'
                                  }`}
                                >
                                  {String.fromCharCode(65 + optionIndex)}. {option.text}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="mt-3 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm font-semibold text-green-800">
                              {question.expectedAnswer || 'Expected answer not added'}
                            </div>
                          )}
                          {question.alternateAnswers?.length ? (
                            <p className="mt-3 text-xs leading-5 text-slate-500">
                              Alternate answers: <span className="font-semibold text-slate-700">{question.alternateAnswers.join(', ')}</span>
                            </p>
                          ) : null}
                          {question.explanation ? (
                            <p className="mt-3 text-sm leading-6 text-slate-600">
                              <span className="font-semibold text-slate-900">Solution:</span> {question.explanation}
                            </p>
                          ) : null}
                        </div>
                        <div className="rounded-md border border-slate-200 bg-white p-4">
                          <p className="field-label">Question metadata</p>
                          <dl className="mt-3 space-y-2 text-xs leading-5">
                            <div className="flex justify-between gap-3">
                              <dt className="text-slate-500">Created by</dt>
                              <dd className="max-w-[150px] truncate text-right font-semibold text-slate-700">{personLabel(question.createdByUser)}</dd>
                            </div>
                            <div className="flex justify-between gap-3">
                              <dt className="text-slate-500">Created</dt>
                              <dd className="text-right font-semibold text-slate-700">{formatDate(question.createdAt)}</dd>
                            </div>
                            <div className="flex justify-between gap-3">
                              <dt className="text-slate-500">Updated</dt>
                              <dd className="text-right font-semibold text-slate-700">{formatDate(question.updatedAt)}</dd>
                            </div>
                            <div className="flex justify-between gap-3">
                              <dt className="text-slate-500">Difficulty</dt>
                              <dd className="font-semibold capitalize text-slate-700">{question.difficulty}</dd>
                            </div>
                          </dl>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export function AssessmentQuestionDirectoryPage() {
  const { assessmentId } = useParams();
  const location = useLocation();
  const roleBase = getRoleBase(location.pathname);
  const [assessment, setAssessment] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [filters, setFilters] = useState({ search: '', course: '', type: '', difficulty: '' });
  const [appliedFilters, setAppliedFilters] = useState({ search: '', course: '', type: '', difficulty: '' });
  const [activeQuestionSetKey, setActiveQuestionSetKey] = useState('');
  const [expandedQuestionId, setExpandedQuestionId] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let ignore = false;

    async function load() {
      setIsLoading(true);
      setError('');
      try {
        const [assessmentResponse, questionResponse] = await Promise.all([
          api.get(`/assessments/${assessmentId}`),
          api.get(`/assessments/${assessmentId}/questions`, {
            params: {
              course: appliedFilters.course || undefined,
              type: appliedFilters.type || undefined,
            },
          }),
        ]);

        if (!ignore) {
          setAssessment(assessmentResponse.data.assessment);
          setQuestions(questionResponse.data.items || []);
        }
      } catch (requestError) {
        if (!ignore) setError(requestError.response?.data?.message || 'Unable to load assessment questions.');
      } finally {
        if (!ignore) setIsLoading(false);
      }
    }

    load();
    return () => {
      ignore = true;
    };
  }, [assessmentId, appliedFilters.course, appliedFilters.type]);

  const visibleQuestions = useMemo(() => {
    const search = appliedFilters.search.trim().toLowerCase();
    const difficulty = appliedFilters.difficulty;

    return questions.filter((question) => {
      const matchesSearch = !search || [
        question.questionText,
        question.courseName,
        question.courseId,
        question.sourcePaperHeading,
        question.faculty?.name,
        question.faculty?.email,
        question.moderator?.name,
        question.moderator?.email,
        ...(question.tags || []),
      ].some((value) => String(value || '').toLowerCase().includes(search));
      const matchesDifficulty = !difficulty || question.difficulty === difficulty;
      return matchesSearch && matchesDifficulty;
    });
  }, [appliedFilters.difficulty, appliedFilters.search, questions]);

  const groupedQuestionSets = useMemo(() => {
    const groups = new Map();

    visibleQuestions.forEach((question) => {
      const heading = question.sourcePaperHeading || 'Untitled question set';
      const key = `${question.courseName || 'Unmapped course'}|${question.courseId || ''}|${heading}`;

      if (!groups.has(key)) {
        groups.set(key, {
          key,
          heading,
          courseName: question.courseName || 'Unmapped course',
          courseId: question.courseId || '',
          questions: [],
          marks: 0,
          mcq: 0,
          oneWord: 0,
          faculty: question.faculty,
          moderator: question.moderator,
          creator: question.createdByUser,
          assignmentStatus: question.assignmentStatus,
          updatedAt: question.updatedAt || question.createdAt,
        });
      }

      const group = groups.get(key);
      group.questions.push(question);
      group.marks += Number(question.positiveMarks || 0);
      if (question.type === 'mcq') group.mcq += 1;
      if (question.type === 'one_word') group.oneWord += 1;

      const questionUpdatedAt = question.updatedAt || question.createdAt;
      if (new Date(questionUpdatedAt) > new Date(group.updatedAt || 0)) {
        group.updatedAt = questionUpdatedAt;
      }
    });

    return Array.from(groups.values()).sort((first, second) => (
      first.courseName.localeCompare(second.courseName) || first.heading.localeCompare(second.heading)
    ));
  }, [visibleQuestions]);

  const summary = useMemo(() => {
    const courseKeys = new Set(questions.map((question) => `${question.courseName}|${question.courseId || ''}`));
    const questionSetKeys = new Set(questions.map((question) => (
      `${question.courseName}|${question.courseId || ''}|${question.sourcePaperHeading || 'Untitled question set'}`
    )));
    return {
      total: questions.length,
      sets: questionSetKeys.size,
      mcq: questions.filter((question) => question.type === 'mcq').length,
      oneWord: questions.filter((question) => question.type === 'one_word').length,
      marks: questions.reduce((total, question) => total + Number(question.positiveMarks || 0), 0),
      courses: courseKeys.size,
    };
  }, [questions]);

  const activeQuestionSet = useMemo(
    () => groupedQuestionSets.find((group) => group.key === activeQuestionSetKey),
    [activeQuestionSetKey, groupedQuestionSets]
  );

  function applyFilters() {
    setAppliedFilters(filters);
    setActiveQuestionSetKey('');
    setExpandedQuestionId('');
  }

  return (
    <section className="space-y-5">
      <PageHeader
        eyebrow="Assessment Questions"
        title={assessment?.title || 'Questions'}
        description="View approved and uploaded question sets title-wise, with faculty, moderator, answers, and solution detail in one place."
        actions={(
          <>
            <Link className="secondary-button" to={`${roleBase}/assessments`}>
              Back to assessments
            </Link>
            <Link className="primary-button" to={`${roleBase}/assessments/create?draftId=${assessmentId}&step=questions`}>
              <Pencil size={16} />
              Edit Questions
            </Link>
          </>
        )}
      />

      {error ? <div className="border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div> : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Question sets" value={isLoading ? '...' : summary.sets} icon={BookOpen} />
        <MetricCard label="Questions" value={isLoading ? '...' : summary.total} icon={FileQuestion} />
        <MetricCard label="Courses" value={isLoading ? '...' : summary.courses} icon={ClipboardList} />
        <MetricCard label="MCQ / One word" value={isLoading ? '...' : `${summary.mcq} / ${summary.oneWord}`} icon={ListFilter} />
        <MetricCard label="Marks" value={isLoading ? '...' : summary.marks} icon={ShieldCheck} />
      </div>

      <SectionPanel
        title="Question Set Directory"
        description="Main rows are question headings. Open a heading to inspect all questions, answers, solutions, and review ownership."
        icon={FileQuestion}
      >
        <div className="grid gap-2 border-b border-slate-200 px-3 py-2.5 lg:grid-cols-[1fr_180px_150px_160px_auto]">
          <div className="search-field">
            <Search size={16} className="text-brand-500" />
            <input
              className="h-10 flex-1 border-0 px-2 text-sm outline-none"
              placeholder="Search heading, question, course, faculty"
              value={filters.search}
              onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
            />
          </div>
          <input
            className="field-input"
            placeholder="Course name or ID"
            value={filters.course}
            onChange={(event) => setFilters((current) => ({ ...current, course: event.target.value }))}
          />
          <select
            className="field-input"
            value={filters.type}
            onChange={(event) => setFilters((current) => ({ ...current, type: event.target.value }))}
          >
            <option value="">All types</option>
            <option value="mcq">MCQ</option>
            <option value="one_word">One word</option>
          </select>
          <select
            className="field-input"
            value={filters.difficulty}
            onChange={(event) => setFilters((current) => ({ ...current, difficulty: event.target.value }))}
          >
            <option value="">All difficulty</option>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
          <button className="secondary-button" type="button" onClick={applyFilters}>
            <ListFilter size={16} className="text-brand-500" />
            Apply
          </button>
        </div>

        {isLoading ? (
          <div className="px-4 py-8 text-center text-sm font-semibold text-slate-500">Loading questions...</div>
        ) : groupedQuestionSets.length === 0 ? (
          <EmptyState title="No questions found" description="No question is attached yet, or the current filters do not match any question." />
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Question heading</th>
                  <th>Course</th>
                  <th>Faculty</th>
                  <th>Moderator</th>
                  <th>Questions</th>
                  <th>Marks</th>
                  <th>Status</th>
                  <th>Updated</th>
                  <th className="text-right">Details</th>
                </tr>
              </thead>
              <tbody>
                {groupedQuestionSets.map((group) => (
                  <tr key={group.key} className="align-middle">
                    <td className="min-w-[260px]">
                      <p className="font-semibold text-slate-950">{group.heading}</p>
                      <p className="mt-1 text-xs text-slate-500">{group.mcq} MCQ · {group.oneWord} one word</p>
                    </td>
                    <td className="min-w-[220px]">
                      <p className="font-semibold text-slate-700">{group.courseName}</p>
                      <p className="text-xs text-slate-500">{group.courseId || 'No course ID'}</p>
                    </td>
                    <td className="min-w-[190px]">
                      <div className="flex items-center gap-2">
                        <UserRoundCheck size={15} className="text-brand-500" />
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-slate-700">{personLabel(group.faculty || group.creator)}</p>
                          <p className="truncate text-xs text-slate-500">{group.faculty?.email || group.creator?.email || '-'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="min-w-[190px]">
                      <div className="flex items-center gap-2">
                        <ShieldCheck size={15} className="text-brand-500" />
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-slate-700">{personLabel(group.moderator)}</p>
                          <p className="truncate text-xs text-slate-500">{group.moderator?.email || '-'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="font-semibold text-slate-700">{group.questions.length}</td>
                    <td className="font-semibold text-slate-700">{group.marks}</td>
                    <td><span className={statusClass(group.assignmentStatus || 'mapped')}>{statusLabel(group.assignmentStatus)}</span></td>
                    <td className="min-w-[160px] text-xs leading-5 text-slate-500">{formatDate(group.updatedAt)}</td>
                    <td className="text-right">
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() => {
                          setActiveQuestionSetKey(group.key);
                          setExpandedQuestionId('');
                        }}
                      >
                        <BookOpen size={16} className="text-brand-500" />
                        View questions
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionPanel>

      <QuestionSetModal
        group={activeQuestionSet}
        expandedQuestionId={expandedQuestionId}
        onExpandQuestion={setExpandedQuestionId}
        onClose={() => {
          setActiveQuestionSetKey('');
          setExpandedQuestionId('');
        }}
      />
    </section>
  );
}

export default AssessmentQuestionDirectoryPage;
