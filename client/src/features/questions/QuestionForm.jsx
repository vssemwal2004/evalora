import { Plus, Save, Trash2 } from 'lucide-react';

const emptyOption = { text: '', isCorrect: false };

export function createEmptyQuestion(defaultCourse = {}) {
  return {
    type: 'mcq',
    courseName: defaultCourse.courseName || '',
    courseId: defaultCourse.courseId || '',
    questionText: '',
    options: [
      { text: '', isCorrect: true },
      { text: '', isCorrect: false },
      { text: '', isCorrect: false },
      { text: '', isCorrect: false },
    ],
    expectedAnswer: '',
    alternateAnswers: '',
    positiveMarks: 1,
    negativeMarks: 0,
    difficulty: 'medium',
    saveToLibrary: true,
  };
}

export function QuestionForm({ courses = [], value, onChange, onSubmit, isSaving, submitLabel = 'Save Question' }) {
  function updateField(field, fieldValue) {
    onChange({ ...value, [field]: fieldValue });
  }

  function updateOption(index, field, fieldValue) {
    onChange({
      ...value,
      options: value.options.map((option, optionIndex) =>
        optionIndex === index
          ? {
              ...option,
              [field]: fieldValue,
            }
          : field === 'isCorrect' && fieldValue
            ? { ...option, isCorrect: false }
            : option
      ),
    });
  }

  function addOption() {
    onChange({ ...value, options: [...value.options, emptyOption] });
  }

  function removeOption(index) {
    if (value.options.length <= 2) return;
    onChange({ ...value, options: value.options.filter((_, optionIndex) => optionIndex !== index) });
  }

  function selectCourse(courseKey) {
    const course = courses.find((item) => `${item.courseName}|${item.courseId || ''}` === courseKey);
    if (!course) return;
    onChange({ ...value, courseName: course.courseName, courseId: course.courseId || '' });
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <label className="field-label">Question type</label>
          <select className="field-input mt-2" value={value.type} onChange={(event) => updateField('type', event.target.value)}>
            <option value="mcq">MCQ</option>
            <option value="one_word">One-word</option>
          </select>
        </div>
        <div>
          <label className="field-label">Course</label>
          {courses.length > 0 ? (
            <select
              className="field-input mt-2"
              value={`${value.courseName}|${value.courseId || ''}`}
              onChange={(event) => selectCourse(event.target.value)}
            >
              <option value="|">Select course</option>
              {courses.map((course) => (
                <option key={`${course.courseName}|${course.courseId || ''}`} value={`${course.courseName}|${course.courseId || ''}`}>
                  {course.courseName}
                  {course.courseId ? ` (${course.courseId})` : ''}
                </option>
              ))}
            </select>
          ) : (
            <input
              className="field-input mt-2"
              value={value.courseName}
              onChange={(event) => updateField('courseName', event.target.value)}
              placeholder="Course name"
            />
          )}
        </div>
        <div>
          <label className="field-label">Difficulty</label>
          <select
            className="field-input mt-2"
            value={value.difficulty}
            onChange={(event) => updateField('difficulty', event.target.value)}
          >
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </div>
      </div>

      <div>
        <label className="field-label">Question text</label>
        <textarea
          className="field-input mt-2 h-28 py-3"
          value={value.questionText}
          onChange={(event) => updateField('questionText', event.target.value)}
          placeholder="Enter the question exactly as it should appear in the exam."
        />
      </div>

      {value.type === 'mcq' ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="field-label">Options</label>
            <button className="secondary-button h-8 px-2 text-xs" type="button" onClick={addOption}>
              <Plus size={14} className="text-brand-500" />
              Add
            </button>
          </div>
          {value.options.map((option, index) => (
            <div className="grid gap-2 md:grid-cols-[40px_1fr_auto]" key={index}>
              <label className="grid h-11 place-items-center border border-slate-300 bg-slate-50">
                <input
                  type="radio"
                  checked={option.isCorrect}
                  onChange={() => updateOption(index, 'isCorrect', true)}
                  aria-label={`Correct option ${index + 1}`}
                />
              </label>
              <input
                className="field-input"
                value={option.text}
                onChange={(event) => updateOption(index, 'text', event.target.value)}
                placeholder={`Option ${index + 1}`}
              />
              <button className="secondary-button h-11 px-3" type="button" onClick={() => removeOption(index)}>
                <Trash2 size={15} className="text-brand-500" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="field-label">Expected answer</label>
            <input
              className="field-input mt-2"
              value={value.expectedAnswer}
              onChange={(event) => updateField('expectedAnswer', event.target.value)}
              placeholder="Exact expected answer"
            />
          </div>
          <div>
            <label className="field-label">Alternate answers</label>
            <input
              className="field-input mt-2"
              value={value.alternateAnswers}
              onChange={(event) => updateField('alternateAnswers', event.target.value)}
              placeholder="Comma separated"
            />
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="field-label">Positive marks</label>
          <input
            className="field-input mt-2"
            type="number"
            min="0"
            value={value.positiveMarks}
            onChange={(event) => updateField('positiveMarks', event.target.value)}
          />
        </div>
        <div>
          <label className="field-label">Negative marks</label>
          <input
            className="field-input mt-2"
            type="number"
            min="0"
            value={value.negativeMarks}
            onChange={(event) => updateField('negativeMarks', event.target.value)}
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
        <input
          type="checkbox"
          checked={value.saveToLibrary}
          onChange={(event) => updateField('saveToLibrary', event.target.checked)}
        />
        Save this question to library
      </label>

      <button className="primary-button" type="submit" disabled={isSaving}>
        <Save size={16} />
        {isSaving ? 'Saving' : submitLabel}
      </button>
    </form>
  );
}
