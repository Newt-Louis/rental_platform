import api from '@/lib/axios';

export interface EmailSettings {
  isEnabled: boolean;
  smtpHost: string | null;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string | null;
  emailFrom: string | null;
  hasPassword: boolean;
  updatedAt: string;
}

export interface UpdateEmailSettingsPayload {
  isEnabled?: boolean;
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure?: boolean;
  smtpUser?: string;
  smtpPass?: string;
  emailFrom?: string;
}

export const emailSettingsApi = {
  getSettings: (): Promise<EmailSettings> => api.get('/email-settings').then((r) => r.data),
  update: (payload: UpdateEmailSettingsPayload): Promise<EmailSettings> =>
    api.put('/email-settings', payload).then((r) => r.data),
  sendTest: (to?: string) => api.post('/email-settings/test', { to }).then((r) => r.data),
};
