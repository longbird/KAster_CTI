import axios, { type AxiosInstance } from 'axios';
import type { DesktopAgentProfile } from '../shared/ipc';

export interface DesktopAuthSession {
  accessToken: string;
  refreshToken: string;
  agent: DesktopAgentProfile;
}

export class DesktopAuthClient {
  private readonly http: AxiosInstance;

  constructor(baseUrl: string) {
    this.http = axios.create({
      baseURL: `${baseUrl}/api/v1`,
      timeout: 10000,
    });
  }

  async exchangeHandoff(handoffToken: string): Promise<DesktopAuthSession> {
    return this.requestSession('/auth/handoff/exchange', { handoffToken });
  }

  async refreshSession(refreshToken: string): Promise<DesktopAuthSession> {
    return this.requestSession('/auth/refresh', { refreshToken });
  }

  private async requestSession(
    path: '/auth/handoff/exchange' | '/auth/refresh',
    body: { handoffToken?: string; refreshToken?: string },
  ): Promise<DesktopAuthSession> {
    const response = await this.http.post(path, body);
    return response.data.data as DesktopAuthSession;
  }
}
