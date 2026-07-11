import { api } from './api';

function dataUrlToBlob(dataUrl) {
  const [header, payload] = String(dataUrl || '').split(',');
  const mime = header?.match(/^data:(.*?);base64$/)?.[1];
  if (!mime || !payload) {
    throw new Error('Invalid captured evidence image.');
  }

  const binary = window.atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new window.Blob([bytes], { type: mime });
}

function normalizeContentType(type) {
  return String(type || 'application/octet-stream').split(';')[0].trim().toLowerCase();
}

async function uploadIdentityThroughApi(blob, { assignmentId, filename, contentType }) {
  try {
    const response = await api.post('/storage/r2/upload-identity', blob, {
      params: { assignmentId, filename },
      headers: { 'Content-Type': contentType },
    });
    return response.data;
  } catch (error) {
    console.error('Secure identity upload failed', {
      assignmentId,
      filename,
      status: error.response?.status,
      code: error.code,
    });
    if (error.response) throw error;
    const uploadError = new Error('We could not securely upload your verification photo. Check your connection, then try again.');
    uploadError.code = 'EVIDENCE_UPLOAD_FAILED';
    throw uploadError;
  }
}

async function uploadEvidenceThroughApi(blob, { category, assignmentId, filename, contentType }) {
  try {
    const response = await api.post('/storage/r2/upload-evidence', blob, {
      params: { category, assignmentId, filename },
      headers: { 'Content-Type': contentType },
    });
    return response.data;
  } catch (error) {
    console.error('Secure evidence upload failed', {
      category,
      assignmentId,
      filename,
      status: error.response?.status,
      code: error.code,
    });
    if (error.response) throw error;
    const uploadError = new Error('We could not securely upload exam evidence. Check your connection, then try again.');
    uploadError.code = 'EVIDENCE_UPLOAD_FAILED';
    throw uploadError;
  }
}

export async function uploadEvidenceBlob(blob, { category, assignmentId, filename }) {
  const contentType = normalizeContentType(blob.type);
  if (category === 'identity') {
    return uploadIdentityThroughApi(blob, { assignmentId, filename, contentType });
  }
  if (['snapshot', 'clip', 'recording'].includes(category)) {
    return uploadEvidenceThroughApi(blob, { category, assignmentId, filename, contentType });
  }

  let response;
  try {
    response = await api.post('/storage/r2/presign', {
      category,
      assignmentId,
      filename,
      contentType,
      size: blob.size,
    });
  } catch (error) {
    const message = error.response?.data?.message || error.message || 'Cloudflare R2 upload URL could not be created.';
    console.error('R2 presign failed', { category, assignmentId, filename, message, error });
    const uploadError = new Error('We could not prepare the secure photo upload. Check your connection, then try again.');
    uploadError.code = 'EVIDENCE_UPLOAD_FAILED';
    throw uploadError;
  }

  const upload = response.data;
  let uploadResponse;
  try {
    uploadResponse = await window.fetch(upload.uploadUrl, {
      method: 'PUT',
      body: blob,
      headers: {
        'Content-Type': contentType,
      },
    });
  } catch (error) {
    console.error('Evidence upload connection failed', { category, assignmentId, filename, error });
    const uploadError = new Error('We could not securely upload your verification photo. Check your connection, then try again.');
    uploadError.code = 'EVIDENCE_UPLOAD_FAILED';
    throw uploadError;
  }

  if (!uploadResponse.ok) {
    const details = await uploadResponse.text().catch(() => '');
    console.error('R2 upload failed', {
      category,
      assignmentId,
      filename,
      status: uploadResponse.status,
      details,
    });
    const uploadError = new Error('Your verification photo could not be uploaded. Keep this page open and try again.');
    uploadError.code = 'EVIDENCE_UPLOAD_FAILED';
    throw uploadError;
  }

  return {
    key: upload.key,
    url: upload.publicUrl,
    contentType,
    size: blob.size,
  };
}

export async function uploadEvidenceDataUrl(dataUrl, { category, assignmentId, filename }) {
  return uploadEvidenceBlob(dataUrlToBlob(dataUrl), { category, assignmentId, filename });
}
