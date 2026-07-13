import api from '@/lib/axios';

export const brandingApi = {
  getSettings: () => api.get('/branding').then((r) => r.data),
  uploadLogo: (formData: FormData) =>
    api.post('/branding/logo', formData, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data),
  uploadBackground: (formData: FormData) =>
    api.post('/branding/background', formData, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data),
  removeLogo: () => api.delete('/branding/logo').then((r) => r.data),
  removeBackground: () => api.delete('/branding/background').then((r) => r.data),
};
