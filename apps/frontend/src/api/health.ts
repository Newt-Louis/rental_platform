import api from '@/lib/axios';

export type ComponentStatus = 'up' | 'down' | 'configured' | 'enabled' | 'disabled';

export interface SystemHealth {
  status: 'ok' | 'degraded';
  timestamp: string;
  service: string;
  version?: string;
  components: {
    database: ComponentStatus;
    redis: ComponentStatus;
    ai: ComponentStatus;
    email: ComponentStatus;
    sap: ComponentStatus;
  };
}

export const healthApi = {
  get: () => api.get<SystemHealth>('/health').then((response) => response.data),
};
