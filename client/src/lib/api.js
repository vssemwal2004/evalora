import axios from 'axios';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('evalora_token');

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const response = error.response;

    if (response?.status === 401 && response.data?.code === 'MULTIPLE_LOGIN_DETECTED') {
      const message =
        response.data.message ||
        'Multiple login detected. This account was opened on another device, so this session has been logged out.';

      localStorage.removeItem('evalora_token');
      localStorage.removeItem('evalora_user');
      window.sessionStorage.setItem('evalora_auth_message', message);
      window.dispatchEvent(new window.CustomEvent('evalora:auth-expired', { detail: { message } }));
    }

    return Promise.reject(error);
  }
);
