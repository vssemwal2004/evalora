import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
const UNSAFE_METHODS = new Set(['post', 'put', 'patch', 'delete']);

let csrfToken = null;
let csrfPromise = null;

export const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
});

const csrfApi = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
});

function isUnsafeRequest(config) {
  return UNSAFE_METHODS.has(String(config.method || 'get').toLowerCase());
}

function isCsrfExempt(config) {
  const url = String(config.url || '');
  return url.includes('/auth/login') || url.includes('/auth/csrf');
}

export function setCsrfToken(nextToken) {
  csrfToken = nextToken || null;
}

export function clearCsrfToken() {
  csrfToken = null;
  csrfPromise = null;
}

async function getCsrfToken() {
  if (csrfToken) return csrfToken;
  if (!csrfPromise) {
    const token = localStorage.getItem('evalora_token');
    csrfPromise = csrfApi
      .get('/auth/csrf', {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })
      .then((response) => {
        csrfToken = response.data?.csrfToken || null;
        return csrfToken;
      })
      .finally(() => {
        csrfPromise = null;
      });
  }
  return csrfPromise;
}

api.interceptors.request.use(async (config) => {
  config.headers = config.headers || {};
  const token = localStorage.getItem('evalora_token');

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  if (isUnsafeRequest(config) && !isCsrfExempt(config)) {
    const nextCsrfToken = await getCsrfToken();
    if (nextCsrfToken) {
      config.headers['X-CSRF-Token'] = nextCsrfToken;
    }
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const response = error.response;

    if (response?.status === 403 && response.data?.code === 'CSRF_TOKEN_INVALID' && !error.config?._csrfRetry) {
      clearCsrfToken();
      const retryConfig = { ...error.config, _csrfRetry: true };
      const nextCsrfToken = await getCsrfToken();
      if (nextCsrfToken) {
        retryConfig.headers = {
          ...(retryConfig.headers || {}),
          'X-CSRF-Token': nextCsrfToken,
        };
        return api.request(retryConfig);
      }
    }

    if (response?.status === 401 && response.data?.code === 'MULTIPLE_LOGIN_DETECTED') {
      const message =
        response.data.message ||
        'Multiple login detected. This account was opened on another device, so this session has been logged out.';

      localStorage.removeItem('evalora_token');
      localStorage.removeItem('evalora_user');
      clearCsrfToken();
      window.sessionStorage.setItem('evalora_auth_message', message);
      window.dispatchEvent(new window.CustomEvent('evalora:auth-expired', { detail: { message } }));
    }

    return Promise.reject(error);
  }
);
