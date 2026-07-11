const PHASE_ORDER = ['environment', 'location', 'camera', 'identity', 'fullscreen', 'review'];
const FACE_DISTANCE_THRESHOLD = 0.6;

function needsCamera(settings = {}) {
  return Boolean(settings.cameraRequired || settings.cameraMonitoring || settings.proctoringEnabled);
}

function needsMicrophone(settings = {}) {
  // Whole-attempt evidence always includes microphone audio. Assessment
  // settings only control audio analysis and enforcement rules.
  return true;
}

function getRequiredSetupSteps(assessment = {}) {
  const settings = assessment.settings || {};
  const steps = ['verify', 'browser'];

  if (needsMicrophone(settings)) steps.push('microphone');

  steps.push('location', 'camera', 'identity', 'fullscreen', 'instructions', 'final');
  return steps;
}

const FRESHNESS_PREREQUISITES = {
  camera: 'location',
  identity: 'camera',
  fullscreen: 'identity',
  instructions: 'fullscreen',
  final: 'instructions',
};

function getStepStatus(attempt, key) {
  const step = attempt?.setupSteps?.find((item) => item.key === key);
  if (step?.status !== 'passed') return step?.status;

  const prerequisiteKey = FRESHNESS_PREREQUISITES[key];
  if (!prerequisiteKey) return step.status;
  const prerequisite = attempt?.setupSteps?.find((item) => item.key === prerequisiteKey);
  const completedAt = step.completedAt ? new Date(step.completedAt).getTime() : 0;
  const prerequisiteCompletedAt = prerequisite?.completedAt ? new Date(prerequisite.completedAt).getTime() : 0;

  if (getStepStatus(attempt, prerequisiteKey) !== 'passed') return 'pending';
  if (completedAt && prerequisiteCompletedAt && completedAt < prerequisiteCompletedAt) return 'pending';
  return step.status;
}

function getStepPrerequisites(assessment, key) {
  const required = new Set(getRequiredSetupSteps(assessment));
  const ordered = ['verify', 'browser', 'microphone', 'location', 'camera', 'identity', 'fullscreen', 'instructions'];
  const targetIndex = ordered.indexOf(key);

  if (targetIndex < 0) return [];
  return ordered.slice(0, targetIndex).filter((step) => required.has(step));
}

function getMissingStepPrerequisites(assessment, attempt, key) {
  return getStepPrerequisites(assessment, key).filter((step) => getStepStatus(attempt, step) !== 'passed');
}

function compareFaceDescriptors(selfieDescriptor, idCardDescriptor) {
  if (!Array.isArray(selfieDescriptor) || !Array.isArray(idCardDescriptor)) {
    throw new Error('Both face descriptors are required.');
  }
  if (selfieDescriptor.length !== 128 || idCardDescriptor.length !== 128) {
    throw new Error('Face descriptors are incompatible.');
  }

  const selfieValues = selfieDescriptor.map(Number);
  const idCardValues = idCardDescriptor.map(Number);
  if (selfieValues.some((value) => !Number.isFinite(value)) || idCardValues.some((value) => !Number.isFinite(value))) {
    throw new Error('Face descriptors contain invalid values.');
  }

  const distance = Math.sqrt(
    selfieValues.reduce((total, value, index) => {
      const difference = value - idCardValues[index];
      return total + difference * difference;
    }, 0)
  );
  const matchPercentage = Math.max(0, Math.min(100, (1 - distance / (FACE_DISTANCE_THRESHOLD * 2)) * 100));

  return {
    distance: Number(distance.toFixed(6)),
    matchPercentage: Number(matchPercentage.toFixed(1)),
    status: distance <= FACE_DISTANCE_THRESHOLD ? 'passed' : 'manual_review',
    threshold: FACE_DISTANCE_THRESHOLD,
  };
}

function normalizeIdentityText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function compactIdentityText(value) {
  return normalizeIdentityText(value).replace(/\s+/g, '');
}

function getNameTokens(name) {
  return normalizeIdentityText(name)
    .split(' ')
    .filter((token) => token.length >= 3);
}

function getCandidateIdentityMatches(assignment = {}, ocrText = '') {
  const normalizedText = normalizeIdentityText(ocrText);
  const compactText = compactIdentityText(ocrText);
  const matches = [];

  const exactFields = [
    ['email', assignment.email],
    ['examId', assignment.generatedExamId],
    ['applicationNumber', assignment.applicationNumber],
  ];

  for (const [key, value] of exactFields) {
    const compactValue = compactIdentityText(value);
    if (compactValue && compactText.includes(compactValue)) matches.push(key);
  }

  const nameTokens = getNameTokens(assignment.name);
  const matchedNameTokens = nameTokens.filter((token) => normalizedText.includes(token));
  const requiredNameTokens = Math.min(2, nameTokens.length);
  if (requiredNameTokens > 0 && matchedNameTokens.length >= requiredNameTokens) {
    matches.push('name');
  }

  return {
    matches,
    matchedNameTokens,
    normalizedText,
  };
}

function validateIdentityOcr(assignment = {}, ocrText = '', confidence = 0) {
  const text = String(ocrText || '').trim();
  const safeConfidence = Math.max(0, Math.min(100, Number(confidence || 0)));
  const { matches, matchedNameTokens } = getCandidateIdentityMatches(assignment, text);
  const passed = text.length >= 12 && matches.length > 0;

  return {
    status: passed ? 'passed' : 'failed',
    passed,
    confidence: Number(safeConfidence.toFixed(1)),
    matchedFields: matches,
    matchedNameTokens,
    reason: passed
      ? `ID text matched candidate ${matches.join(', ')}.`
      : 'ID text did not match the assigned candidate name, email, exam ID, or application number.',
  };
}

function evaluateIdentityVerification({ assignment, selfieDescriptor, idCardDescriptor, idCardOcrText, idCardOcrConfidence }) {
  const face = compareFaceDescriptors(selfieDescriptor, idCardDescriptor);
  const ocr = validateIdentityOcr(assignment, idCardOcrText, idCardOcrConfidence);
  const status = face.status === 'passed' && ocr.passed ? 'passed' : 'failed';
  let code = 'IDENTITY_VERIFIED';
  let reason = `Face and identity-card details matched the assigned candidate.`;

  if (face.status !== 'passed' && !ocr.passed) {
    code = 'IDENTITY_FACE_AND_TEXT_MISMATCH';
    reason = 'The student photo did not match the ID portrait, and the ID details did not match the assigned candidate.';
  } else if (face.status !== 'passed') {
    code = 'IDENTITY_FACE_MISMATCH';
    reason = 'The student photo did not match the portrait on the identity card. Retake both photos clearly.';
  } else if (!ocr.passed) {
    code = 'IDENTITY_TEXT_MISMATCH';
    reason = ocr.reason;
  }

  return {
    ...face,
    status,
    faceStatus: face.status,
    ocr,
    code,
    reason,
  };
}

function getPhaseProgress(assessment, attempt) {
  const settings = assessment?.settings || {};
  const phaseRequirements = {
    environment: ['browser', ...(needsMicrophone(settings) ? ['microphone'] : [])],
    location: ['location'],
    camera: ['camera'],
    identity: ['identity'],
    fullscreen: ['fullscreen'],
    review: ['instructions'],
  };
  const phases = PHASE_ORDER.map((key) => ({
    key,
    status: phaseRequirements[key].every((step) => getStepStatus(attempt, step) === 'passed') ? 'passed' : 'pending',
  }));
  const firstPendingIndex = phases.findIndex((phase) => phase.status !== 'passed');

  return {
    phases,
    currentPhase: firstPendingIndex === -1 ? 'review' : phases[firstPendingIndex].key,
    highestUnlockedIndex: firstPendingIndex === -1 ? phases.length - 1 : firstPendingIndex,
  };
}

module.exports = {
  FACE_DISTANCE_THRESHOLD,
  PHASE_ORDER,
  compareFaceDescriptors,
  evaluateIdentityVerification,
  getMissingStepPrerequisites,
  getPhaseProgress,
  getRequiredSetupSteps,
  getStepPrerequisites,
  getStepStatus,
  validateIdentityOcr,
  needsCamera,
  needsMicrophone,
};
