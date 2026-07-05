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

export async function uploadEvidenceBlob(blob, { category, assignmentId, filename }) {
  const contentType = normalizeContentType(blob.type);
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
    throw new Error(`Cloudflare R2 is not ready: ${message}`);
  }

  const upload = response.data;
  const uploadResponse = await window.fetch(upload.uploadUrl, {
    method: 'PUT',
    body: blob,
    headers: {
      'Content-Type': contentType,
    },
  });

  if (!uploadResponse.ok) {
    const details = await uploadResponse.text().catch(() => '');
    console.error('R2 upload failed', {
      category,
      assignmentId,
      filename,
      status: uploadResponse.status,
      details,
    });
    throw new Error(`Evidence upload to Cloudflare R2 failed (${uploadResponse.status}). Check bucket CORS and token permissions.`);
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
