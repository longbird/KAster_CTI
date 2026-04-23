import axios, { type AxiosInstance } from 'axios';
import type { DesktopAgentProfile, DesktopSoftphoneConfig } from '../shared/ipc';

export interface DesktopAuthSession {
  accessToken: string;
  refreshToken: string;
  agent: DesktopAgentProfile;
  softphoneConfig?: DesktopSoftphoneConfig;
}

export interface DesktopCredentialLoginInput {
  loginId: string;
  password: string;
  extension?: string;
}

export interface DesktopWebHandoff {
  handoffToken: string;
  expiresIn: number;
  redirectPath?: string;
}

interface DesktopTokenPair {
  accessToken: string;
  refreshToken: string;
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
    const tokens = await this.requestTokens('/auth/handoff/exchange', { handoffToken });
    return this.hydrateDesktopSession(tokens);
  }

  async refreshSession(refreshToken: string): Promise<DesktopAuthSession> {
    const tokens = await this.requestTokens('/auth/refresh', { refreshToken });
    return this.hydrateDesktopSession(tokens);
  }

  async loginWithCredentials(input: DesktopCredentialLoginInput): Promise<DesktopAuthSession> {
    const tokens = await this.requestTokens('/auth/login', input);
    return this.hydrateDesktopSession(tokens);
  }

  async createWebHandoff(
    accessToken: string,
    input?: { redirectPath?: string },
  ): Promise<DesktopWebHandoff> {
    const response = await this.http.post('/auth/web-handoff', input ?? {}, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    return response.data.data as DesktopWebHandoff;
  }

  async getDesktopSession(accessToken: string): Promise<{
    agent: DesktopAgentProfile;
    softphoneConfig?: DesktopSoftphoneConfig;
  }> {
    const response = await this.http.get('/auth/desktop/session', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    return response.data.data as {
      agent: DesktopAgentProfile;
      softphoneConfig?: DesktopSoftphoneConfig;
    };
  }

  private async hydrateDesktopSession(tokens: DesktopTokenPair): Promise<DesktopAuthSession> {
    const desktopSession = await this.getDesktopSession(tokens.accessToken);
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      agent: desktopSession.agent,
      softphoneConfig: desktopSession.softphoneConfig,
    };
  }

  private async requestTokens(
    path: '/auth/handoff/exchange' | '/auth/refresh' | '/auth/login',
    body: { handoffToken?: string; refreshToken?: string; loginId?: string; password?: string; extension?: string },
  ): Promise<DesktopTokenPair> {
    const response = await this.http.post(path, body);
    return response.data.data as DesktopTokenPair;
  }
}
