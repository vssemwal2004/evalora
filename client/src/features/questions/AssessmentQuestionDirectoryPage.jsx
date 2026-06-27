import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { BookOpen, ChevronDown, ClipboardList, FileQuestion, ListFilter, Pencil, Search } from 'lucide-react';
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

function questionTypeLabel(type) {
  return type === 'one_word' ? 'One word' : 'MCQ';
}

export function AssessmentQuestionDirectoryPage() {
  const { assessmentId } = useParams();
  const location = useLocation();
  const roleBase = getRoleBase(location.pathname);
  const [assessment, setAssessment] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [filters, setFilters] = useState({ search: '', course: '', type: '', difficulty: '' });
  const [appliedFilters, setAppliedFilters] = useState({ search: '', course: '', type: '', difficulty: '' });
  const [expandedId, setExpandedId] = useState('');
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
        ...(question.tags || []),
      ].some((value) => String(value || '').toLowerCase().includes(search));
      const matchesDifficulty = !difficulty || question.difficulty === difficulty;
      return matchesSearch && matchesDifficulty;
    });
  }, [appliedFilters.difficulty, appliedFilters.search, questions]);

  const summary = useMemo(() => {
    const courseKeys = new Set(questions.map((question) => `${question.courseName}|${question.courseId || ''}`));
    return {
      total: questions.length,
      mcq: questions.filter((question) => question.type === 'mcq').length,
      oneWord: questions.filter((question) => question.type === 'one_word').length,
      marks: questions.reduce((total, question) => total + Number(question.positiveMarks || 0), 0),
      courses: courseKeys.size,
    };
  }, [questions]);

  function applyFilters() {
    setAppliedFilters(filters);
    setExpandedId('');
  }

  return (
    <section className="space-y-5">
      <PageHeader
        eyebrow="Assessment Questions"
        title={assessment?.title || 'Questions'}
        description="View every question currently attached to this assessment, with course mapping, marks, answers, and latest update time."
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
        <MetricCard label="Questions" value={isLoading ? '...' : summary.total} icon={FileQuestion} />
        <MetricCard label="MCQ" value={isLoading ? '...' : summary.mcq} icon={ClipboardList} />
        <MetricCard label="One word" value={isLoading ? '...' : summary.oneWord} icon={BookOpen} />
        <MetricCard label="Marks" value={isLoading ? '...' : summary.marks} icon={ListFilter} />
        <MetricCard label="Courses" value={isLoading ? '...' : summary.courses} icon={ClipboardList} />
      </div>

      <SectionPanel
        title="Question Directory"
        description="Use compact filters for course, type, difficulty, text, folder, or tags. Open a row to inspect answers."
        icon={FileQuestion}
      >
        <div className="grid gap-2 border-b border-slate-200 px-3 py-2.5 lg:grid-cols-[1fr_180px_150px_160px_auto]">
          <div className="search-field">
            <Search size={16} className="text-brand-500" />
            <input
              className="h-10 flex-1 border-0 px-2 text-sm outline-none"
              placeholder="Search question, course, folder, tag"
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

        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Question</th>
                <th>Course</th>
                <th>Type</th>
                <th>Difficulty</th>
                <th>Marks</th>
                <th>Updated</th>
                <th className="text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {isLoading ? (
                <tr>
                  <td className="px-4 py-6 text-center text-slate-500" colSpan={8}>
                    Loading questions...
                  </td>
                </tr>
              ) : visibleQuestions.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <EmptyState title="No questions found" description="No question is attached yet, or the current filters do not match any question." />
                  </td>
                </tr>
              ) : (
                visibleQuestions.map((question, index) => (
                  <tr key={question._id} className="align-top">
                    <td className="font-semibold text-slate-500">{index + 1}</td>
                    <td className="min-w-[320px] max-w-[620px]">
                      <p className="line-clamp-2 font-semibold text-slate-950">{question.questionText}</p>
                      {question.sourcePaperHeading ? <p className="mt-1 text-xs text-slate-500">{question.sourcePaperHeading}</p> : null}
                      {question.tags?.length ? (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {question.tags.slice(0, 3).map((tag) => (
                            <span key={tag} className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
                              {tag}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </td>
                    <td className="text-slate-600">
                      {question.courseName}
                      {question.courseId ? <span className="block text-xs text-slate-400">{question.courseId}</span> : null}
                    </td>
                    <td className="text-slate-600">{questionTypeLabel(question.type)}</td>
                    <td><span className={statusClass(question.difficulty)}>{question.difficulty}</span></td>
                    <td className="text-slate-600">+{question.positiveMarks || 0} / -{question.negativeMarks || 0}</td>
                    <td className="min-w-[160px] text-xs leading-5 text-slate-500">{formatDate(question.updatedAt || question.createdAt)}</td>
                    <td className="text-right">
                      <button
                        className="secondary-button h-8 w-8 px-0"
                        type="button"
                        onClick={() => setExpandedId((current) => (current === question._id ? '' : question._id))}
                        aria-label={`View details for question ${index + 1}`}
                      >
                        <ChevronDown size={15} className={expandedId === question._id ? 'rotate-180 text-brand-500 transition' : 'text-brand-500 transition'} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {expandedId ? (
          <div className="border-t border-slate-200 bg-slate-50/70 p-4">
            {visibleQuestions
              .filter((question) => question._id === expandedId)
              .map((question) => (
                <div key={question._id} className="grid gap-4 lg:grid-cols-[1fr_280px]">
                  <div className="rounded-md border border-slate-200 bg-white p-4">
                    <p className="field-label">Answer detail</p>
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
                        <span className="font-semibold text-slate-900">Explanation:</span> {question.explanation}
                      </p>
                    ) : null}
                  </div>
                  <div className="rounded-md border border-slate-200 bg-white p-4 text-sm">
                    <p className="field-label">Question metadata</p>
                    <dl className="mt-3 space-y-2 text-xs leading-5">
                      <div className="flex justify-between gap-3">
                        <dt className="text-slate-500">Created</dt>
                        <dd className="text-right font-semibold text-slate-700">{formatDate(question.createdAt)}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-slate-500">Updated</dt>
                        <dd className="text-right font-semibold text-slate-700">{formatDate(question.updatedAt)}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-slate-500">Order</dt>
                        <dd className="font-semibold text-slate-700">{question.order ?? '-'}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-slate-500">Library source</dt>
                        <dd className="max-w-[150px] truncate text-right font-semibold text-slate-700">{question.sourcePaperHeading || '-'}</dd>
                      </div>
                    </dl>
                  </div>
                </div>
              ))}
          </div>
        ) : null}
      </SectionPanel>
    </section>
  );
}

export default AssessmentQuestionDirectoryPage;
