process.env.NODE_ENV = 'test';

const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const {
  FACE_DISTANCE_THRESHOLD,
  compareFaceDescriptors,
  evaluateIdentityVerification,
  getMissingStepPrerequisites,
  getPhaseProgress,
  getRequiredSetupSteps,
  validateIdentityOcr,
} = require('../src/services/examSetup.service');

function attemptWith(...keys) {
  return {
    setupSteps: keys.map((key) => ({ key, status: 'passed' })),
  };
}

describe('student exam setup sequencing', () => {
  const assessment = {
    settings: {
      cameraRequired: true,
      microphoneRequired: true,
    },
  };

  it('uses the camera phase after location and before identity', () => {
    assert.deepEqual(getRequiredSetupSteps(assessment), [
      'verify',
      'browser',
      'microphone',
      'location',
      'camera',
      'identity',
      'fullscreen',
      'instructions',
      'final',
    ]);
  });

  it('does not unlock identity until environment, location, and camera checks pass', () => {
    const attempt = attemptWith('verify', 'browser', 'microphone', 'location');
    assert.deepEqual(getMissingStepPrerequisites(assessment, attempt, 'identity'), ['camera']);
  });

  it('requires the dedicated camera phase even when proctoring settings are off', () => {
    const steps = getRequiredSetupSteps({ settings: {} });
    assert.ok(steps.includes('camera'));
    assert.deepEqual(getMissingStepPrerequisites({ settings: {} }, attemptWith('verify', 'browser', 'location'), 'identity'), ['camera']);
  });

  it('requires a fresh camera check after location before identity can continue', () => {
    const attempt = {
      setupSteps: [
        { key: 'verify', status: 'passed', completedAt: new Date('2026-01-01T10:00:00Z') },
        { key: 'browser', status: 'passed', completedAt: new Date('2026-01-01T10:01:00Z') },
        { key: 'microphone', status: 'passed', completedAt: new Date('2026-01-01T10:02:00Z') },
        { key: 'camera', status: 'passed', completedAt: new Date('2026-01-01T10:03:00Z') },
        { key: 'location', status: 'passed', completedAt: new Date('2026-01-01T10:04:00Z') },
      ],
    };

    assert.deepEqual(getMissingStepPrerequisites(assessment, attempt, 'identity'), ['camera']);
  });

  it('allows completed earlier phases while unlocking only the first incomplete phase', () => {
    const attempt = attemptWith('verify', 'browser', 'microphone', 'location', 'camera');
    const progress = getPhaseProgress(assessment, attempt);

    assert.equal(progress.currentPhase, 'identity');
    assert.equal(progress.highestUnlockedIndex, 3);
    assert.deepEqual(progress.phases.map((phase) => phase.status), ['passed', 'passed', 'passed', 'pending', 'pending', 'pending']);
  });
});

describe('server-derived identity comparison', () => {
  it('computes a pass without trusting a client-provided percentage or status', () => {
    const selfie = Array.from({ length: 128 }, () => 0.1);
    const card = Array.from({ length: 128 }, () => 0.1);
    const result = compareFaceDescriptors(selfie, card, 0.6);

    assert.equal(result.distance, 0);
    assert.equal(result.matchPercentage, 100);
    assert.equal(result.status, 'passed');
  });

  it('rejects incompatible descriptors', () => {
    assert.throws(
      () => compareFaceDescriptors(Array(128).fill(0), Array(64).fill(0), 0.6),
      /incompatible/
    );
  });

  it('uses the server-owned face distance threshold at the real pass boundary', () => {
    const selfie = Array(128).fill(0);
    const passingCard = Array(128).fill(0);
    const failingCard = Array(128).fill(0);
    passingCard[0] = FACE_DISTANCE_THRESHOLD - 0.01;
    failingCard[0] = FACE_DISTANCE_THRESHOLD + 0.01;

    const passing = compareFaceDescriptors(selfie, passingCard, 0.1);
    const failing = compareFaceDescriptors(selfie, failingCard, 1.5);

    assert.equal(passing.status, 'passed');
    assert.equal(failing.status, 'manual_review');
    assert.equal(passing.threshold, FACE_DISTANCE_THRESHOLD);
    assert.equal(failing.threshold, FACE_DISTANCE_THRESHOLD);
  });

  it('rejects non-finite or incorrectly sized face descriptors', () => {
    const valid = Array(128).fill(0);
    const invalid = Array(128).fill(0);
    invalid[4] = Number.NaN;

    assert.throws(() => compareFaceDescriptors(valid, invalid), /invalid values/);
    assert.throws(() => compareFaceDescriptors(valid, Array(127).fill(0)), /incompatible/);
  });

  it('passes only when ID OCR text matches the assigned candidate', () => {
    const descriptor = Array.from({ length: 128 }, () => 0.1);
    const result = evaluateIdentityVerification({
      assignment: {
        name: 'Aarav Sharma',
        email: 'aarav@example.com',
        generatedExamId: 'EVL-2026-A1',
        applicationNumber: 'APP-42',
      },
      selfieDescriptor: descriptor,
      idCardDescriptor: descriptor,
      threshold: 0.6,
      idCardOcrText: 'Government Identity Card Name Aarav Sharma DOB 2001',
      idCardOcrConfidence: 86,
    });

    assert.equal(result.status, 'passed');
    assert.deepEqual(result.ocr.matchedFields, ['name']);
  });

  it('fails random ID images even when face descriptors match', () => {
    const descriptor = Array.from({ length: 128 }, () => 0.1);
    const result = evaluateIdentityVerification({
      assignment: {
        name: 'Aarav Sharma',
        email: 'aarav@example.com',
        generatedExamId: 'EVL-2026-A1',
        applicationNumber: 'APP-42',
      },
      selfieDescriptor: descriptor,
      idCardDescriptor: descriptor,
      threshold: 0.6,
      idCardOcrText: 'Evalora secure access learning platform logo',
      idCardOcrConfidence: 91,
    });

    assert.equal(result.status, 'failed');
    assert.equal(result.ocr.passed, false);
  });

  it('fails OCR when no candidate field is found', () => {
    const result = validateIdentityOcr(
      { name: 'Meera Iyer', email: 'meera@example.com', generatedExamId: 'EVL-9' },
      'National Identity Card Rahul Verma DOB 2000',
      74
    );

    assert.equal(result.status, 'failed');
    assert.deepEqual(result.matchedFields, []);
  });
});
