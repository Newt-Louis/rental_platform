import axios from 'axios';
import { reportClientError } from './telemetry';

const api = axios.create({
  baseURL: (import.meta as any).env?.VITE_API_URL || '/api',
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  // The instance declares `Content-Type: application/json` for the ordinary JSON
  // calls, but axios reads that same header in `transformRequest`: with a
  // FormData body it serialises the form to JSON, turning the attached File into
  // `{}` and sending it as JSON. The upload then fails server-side with a
  // "no file" error that gives no hint about the real cause. Clearing the header
  // here lets the browser emit `multipart/form-data` with its own boundary.
  if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
    config.headers.setContentType(false);
  }

  return config;
});

api.interceptors.response.use(
  (response) => {
    // Handle TransformInterceptor response: { success: true, data: T }
    // Keep paginated responses { success, data: [...], total, page, ... } as-is
    // Only extract non-paginated { success: true, data: {...} }
    if (
      response.data?.success !== undefined &&
      'data' in response.data &&
      !('total' in response.data)
    ) {
      response.data = response.data.data;
    }
    return response;
  },
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    } else if (!error.response || error.response.status >= 500) {
      // 4xx are expected user/validation errors, not reported. A missing
      // response (network failure) or 5xx indicates a real backend/infra
      // problem worth surfacing.
      reportClientError({
        message: `API ${error.config?.method?.toUpperCase() ?? ''} ${error.config?.url ?? ''} failed: ${error.message}`,
        source: 'api-error',
      });
    }
    return Promise.reject(error);
  }
);

export default api;
