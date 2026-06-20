import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { BookOpen, CheckCircle2, FilePlus2, ListFilter, Search } from 'lucide-react';
import { api } from '../../lib/api';
import { EmptyState, SectionPanel } from '../../ui/Surface.jsx';
import { AssessmentWorkspaceHeader } from '../assessments/AssessmentWorkspaceHeader.jsx';
import { createEmptyQuestion, QuestionForm } from './QuestionForm.jsx';

function toCourseOptions(courses) {
  return courses.map((course) => ({
    courseName: course.courseName,
    courseId: course.courseCode || course.courseId || '',
  }));
}

function courseKey(course) {
  return `${course.courseName}|${course.courseId || ''}`;
}

function CourseMapModal({ group, courses, selectedCourseKey, onSelect, onCancel, onConfirm, isSaving }) {
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
              {courses.map((course) => (
                <option key={courseKey(course)} value={courseKey(course)}>
                  {course.courseName}
                  {course.courseId ? ` (${course.courseId})` : ''}
                </option>
              ))}
            </select>
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

export function AssessmentQuestionsPage() {
  const { assessmentId } = useParams();
  const [searchParams] = useSearchParams();
  const requestedMode = searchParams.get('mode');
  const selectedHeading = searchParams.get('heading') || '';
  const [assessment, setAssessment] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [masterCourses, setMasterCourses] = useState([]);
  const [libraryGroups, setLibraryGroups] = useState([]);
  const [courseFilter, setCourseFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [courseSearch, setCourseSearch] = useState('');
  const [appliedCourseSearch, setAppliedCourseSearch] = useState('');
  const [librarySearch, setLibrarySearch] = useState('');
  const [appliedLibrarySearch, setAppliedLibrarySearch] = useState('');
  const [form, setForm] = useState(createEmptyQuestion());
  const [addMode, setAddMode] = useState(() => (requestedMode === 'library' || requestedMode === 'create' ? requestedMode : ''));
  const [handledHeading, setHandledHeading] = useState('');
  const [mapDialog, setMapDialog] = useState(null);
  const [selectedCourseKey, setSelectedCourseKey] = useState('');
  const [importResult, setImportResult] = useState(null);
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingCourses, setIsLoadingCourses] = useState(false);
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(false);

  const courseOptions = useMemo(() => toCourseOptions(masterCourses), [masterCourses]);
  const assessmentCourses = assessment?.courses || [];

  const loadAssessment = useCallback(async () => {
    const response = await api.get(`/assessments/${assessmentId}`);
    setAssessment(response.data.assessment);
  }, [assessmentId]);

  const loadQuestions = useCallback(async () => {
    const response = await api.get(`/assessments/${assessmentId}/questions`, {
      params: {
        course: courseFilter || undefined,
        type: typeFilter || undefined,
      },
    });
    setQuestions(response.data.items);
  }, [assessmentId, courseFilter, typeFilter]);

  const loadCourses = useCallback(async () => {
    setIsLoadingCourses(true);
    try {
      const response = await api.get('/courses', {
        params: {
          search: appliedCourseSearch || undefined,
          status: 'active',
          limit: 1000,
        },
      });
      setMasterCourses(response.data.items || []);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to load courses.');
    } finally {
      setIsLoadingCourses(false);
    }
  }, [appliedCourseSearch]);

  const loadLibraryGroups = useCallback(async () => {
    setIsLoadingLibrary(true);
    try {
      const response = await api.get('/library/groups', {
        params: { search: appliedLibrarySearch || undefined },
      });
      setLibraryGroups(response.data.items || []);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to load library headings.');
    } finally {
      setIsLoadingLibrary(false);
    }
  }, [appliedLibrarySearch]);

  useEffect(() => {
    let ignore = false;

    async function loadInitialData() {
      setIsLoading(true);
      setError('');
      try {
        const [assessmentResponse, questionResponse, courseResponse] = await Promise.all([
          api.get(`/assessments/${assessmentId}`),
          api.get(`/assessments/${assessmentId}/questions`),
          api.get('/courses', { params: { status: 'active', limit: 1000 } }),
        ]);

        if (!ignore) {
          const courses = courseResponse.data.items || [];
          const courseOptions = toCourseOptions(courses);
          setAssessment(assessmentResponse.data.assessment);
          setQuestions(questionResponse.data.items);
          setMasterCourses(courses);
          if (courseOptions[0]) {
            setForm(createEmptyQuestion(courseOptions[0]));
            setSelectedCourseKey(courseKey(courseOptions[0]));
          }
        }
      } catch (requestError) {
        if (!ignore) setError(requestError.response?.data?.message || 'Unable to load assessment questions.');
      } finally {
        if (!ignore) setIsLoading(false);
      }
    }

    loadInitialData();
    return () => {
      ignore = true;
    };
  }, [assessmentId]);

  useEffect(() => {
    if (requestedMode === 'library' || requestedMode === 'create') {
      setAddMode(requestedMode);
    }
  }, [requestedMode]);

  useEffect(() => {
    loadCourses();
  }, [loadCourses]);

  useEffect(() => {
    if (addMode === 'library') {
      loadLibraryGroups();
    }
  }, [addMode, loadLibraryGroups]);

  useEffect(() => {
    if (addMode !== 'library' || !selectedHeading || handledHeading === selectedHeading || libraryGroups.length === 0) {
      return;
    }

    const group = libraryGroups.find((item) => item.paperHeading === selectedHeading);

    if (group) {
      setMapDialog(group);
      setImportResult(null);
      setSelectedCourseKey((current) => current || (courseOptions[0] ? courseKey(courseOptions[0]) : ''));
      setHandledHeading(selectedHeading);
    } else if (!isLoadingLibrary) {
      setError(`Selected library heading "${selectedHeading}" was not found.`);
      setHandledHeading(selectedHeading);
    }
  }, [addMode, courseOptions, handledHeading, isLoadingLibrary, libraryGroups, selectedHeading]);

  function selectAddMode(mode) {
    setAddMode(mode);
    setError('');
    setImportResult(null);
  }

  async function refreshAssessmentQuestions() {
    await Promise.all([loadAssessment(), loadQuestions()]);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setIsSaving(true);
    try {
      await api.post(`/assessments/${assessmentId}/questions`, form);
      await refreshAssessmentQuestions();
      const selectedCourse = { courseName: form.courseName, courseId: form.courseId };
      setForm(createEmptyQuestion(selectedCourse));
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to save question.');
    } finally {
      setIsSaving(false);
    }
  }

  async function applyFilters() {
    setError('');
    try {
      await loadQuestions();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to filter questions.');
    }
  }

  function openMapDialog(group) {
    setMapDialog(group);
    setImportResult(null);
    setSelectedCourseKey((current) => current || (courseOptions[0] ? courseKey(courseOptions[0]) : ''));
  }

  async function importLibraryHeading() {
    const selectedCourse = courseOptions.find((course) => courseKey(course) === selectedCourseKey);
    if (!mapDialog || !selectedCourse) return;

    setIsImporting(true);
    setError('');
    try {
      const response = await api.post(`/assessments/${assessmentId}/questions/from-library-heading`, {
        paperHeading: mapDialog.paperHeading,
        course: selectedCourse,
      });
      setImportResult(response.data.summary);
      setMapDialog(null);
      await refreshAssessmentQuestions();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to import library questions.');
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <section className="space-y-5">
      <AssessmentWorkspaceHeader
        assessment={assessment}
        active="questions"
        description="Add questions manually or import a full library heading, then map that question set to a master course."
      />

      {error ? <div className="border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div> : null}
      {importResult ? (
        <div className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm font-semibold text-green-700">
          Imported {importResult.created || 0} question(s). Skipped {importResult.skipped || 0}.
        </div>
      ) : null}

      <SectionPanel title="Add Question" description="Choose how this assessment will receive questions. Course mapping happens during this step." icon={FilePlus2}>
        <div className="grid gap-4 p-5 md:grid-cols-2">
          <button
            className={`rounded-lg border p-4 text-left transition ${addMode === 'library' ? 'border-brand-300 bg-brand-50' : 'border-slate-200 bg-white hover:border-brand-200'}`}
            type="button"
            onClick={() => selectAddMode('library')}
          >
            <BookOpen size={20} className="text-brand-500" />
            <p className="mt-3 text-sm font-semibold text-slate-950">Add Question From Library</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">Import a complete paper-heading folder and map it to one course.</p>
          </button>
          <button
            className={`rounded-lg border p-4 text-left transition ${addMode === 'create' ? 'border-brand-300 bg-brand-50' : 'border-slate-200 bg-white hover:border-brand-200'}`}
            type="button"
            onClick={() => selectAddMode('create')}
          >
            <FilePlus2 size={20} className="text-brand-500" />
            <p className="mt-3 text-sm font-semibold text-slate-950">Create Question</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">Create a single MCQ or one-word question and attach it to a master course.</p>
          </button>
        </div>
      </SectionPanel>

      {addMode === 'library' ? (
        <SectionPanel title="Import From Library" description="Select a full library heading like BTech Phase 10, then map that folder to a course." icon={BookOpen}>
          <div className="toolbar">
            <div className="search-field">
              <Search size={16} className="text-brand-500" />
              <input className="h-10 flex-1 border-0 px-2 text-sm outline-none" placeholder="Search library heading" value={librarySearch} onChange={(event) => setLibrarySearch(event.target.value)} />
            </div>
            <button className="secondary-button" type="button" onClick={() => setAppliedLibrarySearch(librarySearch)}>
              <ListFilter size={16} className="text-brand-500" />
              Apply
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Library Heading</th>
                  <th>Questions</th>
                  <th>MCQ</th>
                  <th>One-word</th>
                  <th>Marks</th>
                  <th>Updated</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {isLoadingLibrary ? (
                  <tr><td className="text-center text-slate-500" colSpan={7}>Loading library headings...</td></tr>
                ) : libraryGroups.length === 0 ? (
                  <tr><td colSpan={7}><EmptyState title="No library headings found" description="Create question folders from the Library section first." /></td></tr>
                ) : (
                  libraryGroups.map((group) => (
                    <tr key={group.paperHeading}>
                      <td className="font-semibold text-slate-950">{group.paperHeading}</td>
                      <td><span className="status-badge status-active">{group.count}</span></td>
                      <td>{group.mcqCount || 0}</td>
                      <td>{group.oneWordCount || 0}</td>
                      <td>{group.totalMarks || 0}</td>
                      <td className="text-slate-500">{new Date(group.lastUpdatedAt).toLocaleString()}</td>
                      <td>
                        <button className="primary-button h-9 px-3 text-xs" type="button" onClick={() => openMapDialog(group)} disabled={courseOptions.length === 0}>
                          Map Course
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {courseOptions.length === 0 ? (
            <div className="border-t border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-600">
              Add master courses from the Courses section before importing library headings.
            </div>
          ) : null}
        </SectionPanel>
      ) : null}

      {addMode === 'create' ? (
        <SectionPanel title="Create Question" description="Select the master course here. If this course is not yet attached to the assessment, it will be added automatically." icon={FilePlus2}>
          <div className="border-b border-slate-200 px-4 py-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="search-field">
                <Search size={16} className="text-brand-500" />
                <input className="h-10 flex-1 border-0 px-2 text-sm outline-none" placeholder="Search master course" value={courseSearch} onChange={(event) => setCourseSearch(event.target.value)} />
              </div>
              <button className="secondary-button" type="button" onClick={() => setAppliedCourseSearch(courseSearch)}>
                Search Courses
              </button>
              {isLoadingCourses ? <span className="text-sm text-slate-500">Loading courses...</span> : null}
            </div>
          </div>
          <div className="p-5">
            {courseOptions.length === 0 ? (
              <EmptyState title="No master courses found" description="Add courses from the Courses section before creating mapped questions." />
            ) : (
              <QuestionForm
                courses={courseOptions}
                value={form}
                onChange={setForm}
                onSubmit={handleSubmit}
                isSaving={isSaving}
              />
            )}
          </div>
        </SectionPanel>
      ) : null}

      <SectionPanel title="Question List" description="Filter by mapped course and question type for quick review.">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-4 py-3">
          <ListFilter size={17} className="text-brand-500" />
          <select className="field-input max-w-[220px]" value={courseFilter} onChange={(event) => setCourseFilter(event.target.value)}>
            <option value="">All courses</option>
            {assessmentCourses.map((course) => (
              <option key={`${course.courseName}|${course.courseId || ''}`} value={course.courseName}>
                {course.courseName}
              </option>
            ))}
          </select>
          <select className="field-input max-w-[180px]" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
            <option value="">All types</option>
            <option value="mcq">MCQ</option>
            <option value="one_word">One-word</option>
          </select>
          <button className="secondary-button" type="button" onClick={applyFilters}>
            Apply
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Question</th>
                <th>Course</th>
                <th>Type</th>
                <th>Marks</th>
                <th>Difficulty</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {isLoading ? (
                <tr>
                  <td className="px-4 py-6 text-center text-slate-500" colSpan={5}>
                    Loading questions...
                  </td>
                </tr>
              ) : questions.length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    <EmptyState title="No questions added yet" description="Use Add Question to create or import course-mapped questions." />
                  </td>
                </tr>
              ) : (
                questions.map((question) => (
                  <tr key={question._id}>
                    <td className="max-w-[520px]">
                      <p className="line-clamp-2 font-medium text-slate-900">{question.questionText}</p>
                    </td>
                    <td className="text-slate-600">
                      {question.courseName}
                      {question.courseId ? <span className="block text-xs text-slate-400">{question.courseId}</span> : null}
                    </td>
                    <td className="text-slate-600">{question.type === 'one_word' ? 'One-word' : 'MCQ'}</td>
                    <td className="text-slate-600">
                      +{question.positiveMarks} / -{question.negativeMarks}
                    </td>
                    <td className="text-slate-600 capitalize">{question.difficulty}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </SectionPanel>

      {mapDialog ? (
        <CourseMapModal
          group={mapDialog}
          courses={courseOptions}
          selectedCourseKey={selectedCourseKey}
          onSelect={setSelectedCourseKey}
          onCancel={() => setMapDialog(null)}
          onConfirm={importLibraryHeading}
          isSaving={isImporting}
        />
      ) : null}
    </section>
  );
}
