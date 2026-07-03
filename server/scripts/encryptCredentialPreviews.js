const connectDB = require('../src/config/db');
const User = require('../src/models/User');
const AssessmentStudent = require('../src/models/AssessmentStudent');
const AssessmentProctor = require('../src/models/AssessmentProctor');
const AssessmentAssignment = require('../src/models/AssessmentAssignment');
const { isEncryptedValue } = require('../src/utils/fieldEncryption');

const targets = [
  { label: 'users', Model: User },
  { label: 'assessment_students', Model: AssessmentStudent },
  { label: 'assessment_proctors', Model: AssessmentProctor },
  { label: 'assessment_assignments', Model: AssessmentAssignment },
];

async function encryptModel({ label, Model }) {
  let scanned = 0;
  let encrypted = 0;
  const cursor = Model.find({ passwordPreview: { $exists: true, $ne: '' } })
    .select('+passwordPreview')
    .cursor();

  for await (const document of cursor) {
    scanned += 1;
    const rawValue = document.$__getValue('passwordPreview');
    if (!rawValue || isEncryptedValue(rawValue)) continue;

    document.passwordPreview = document.passwordPreview;
    await document.save({ validateBeforeSave: false });
    encrypted += 1;
  }

  console.log(`${label}: encrypted ${encrypted}/${scanned} credential preview(s).`);
  return { label, scanned, encrypted };
}

async function main() {
  const connection = await connectDB();
  if (!connection) {
    throw new Error('MONGO_URI is required to encrypt credential previews.');
  }

  const results = [];
  for (const target of targets) {
    results.push(await encryptModel(target));
  }

  await connection.disconnect();
  const totalEncrypted = results.reduce((sum, item) => sum + item.encrypted, 0);
  console.log(`Done. Encrypted ${totalEncrypted} credential preview(s).`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
