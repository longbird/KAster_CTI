import axios, { type AxiosInstance } from 'axios';
import { persistArtifact, verifySha256 } from './download-store';

export interface DesktopUpdateArtifact {
  artifactId: string;
  version: string;
  fileName: string;
  size: number;
  sha256: string;
}

export interface DesktopUpdateManifest {
  latestVersion: string;
  mandatory: boolean;
  artifacts: DesktopUpdateArtifact[];
}

export interface PreparedDesktopUpdate {
  version: string;
  fileName: string;
  filePath: string;
  verified: boolean;
  mandatory: boolean;
}

function compareVersion(left: string, right: string) {
  const leftParts = left.split(/[.-]/).map((part) => Number.parseInt(part, 10) || 0);
  const rightParts = right.split(/[.-]/).map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const diff = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (diff !== 0) {
      return diff;
    }
  }
  return 0;
}

export class UpdateClient {
  private readonly http: AxiosInstance;

  constructor(
    baseUrl: string,
    accessToken: string,
    private readonly artifactTempDir?: string,
  ) {
    this.http = axios.create({
      baseURL: `${baseUrl}/api/v1`,
      timeout: 15000,
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  }

  async pollManifest(params: {
    deviceId: string;
    currentVersion: string;
    channel: string;
  }): Promise<DesktopUpdateManifest | null> {
    const sessionToken = await this.createUpdateSession(params.deviceId, params.currentVersion);
    const manifest = await this.http.get('/agent-updates/manifest', {
      headers: {
        Authorization: `Bearer ${sessionToken}`,
      },
      params: {
        currentVersion: params.currentVersion,
        channel: params.channel,
      },
    });

    const data = (manifest.data.data ?? null) as DesktopUpdateManifest | null;
    if (!data || compareVersion(data.latestVersion, params.currentVersion) <= 0) {
      return null;
    }

    return data;
  }

  async prepareUpdate(params: {
    deviceId: string;
    currentVersion: string;
    channel: string;
  }): Promise<PreparedDesktopUpdate | null> {
    if (!this.artifactTempDir) {
      throw new Error('Artifact temp directory is missing.');
    }

    const manifest = await this.pollManifest(params);
    const artifact = manifest?.artifacts?.[0];
    if (!manifest || !artifact) {
      return null;
    }

    const sessionToken = await this.createUpdateSession(params.deviceId, params.currentVersion);
    const downloadInit = await this.http.post(
      '/agent-updates/download-init',
      {
        artifactId: artifact.artifactId,
        currentVersion: params.currentVersion,
      },
      {
        headers: {
          Authorization: `Bearer ${sessionToken}`,
        },
      },
    );

    const downloadData = downloadInit.data.data as {
      artifactId: string;
      version: string;
      downloadUrl: string;
      downloadToken: string;
      sha256: string;
    };

    await this.report({
      eventType: 'download_started',
      currentAppVersion: params.currentVersion,
      targetVersion: downloadData.version,
      artifactId: downloadData.artifactId,
      metadata: { channel: params.channel },
    });

    const artifactResponse = await this.http.get<ArrayBuffer>(this.normalizeArtifactUrl(downloadData.downloadUrl), {
      headers: {
        Authorization: `Bearer ${downloadData.downloadToken}`,
      },
      responseType: 'arraybuffer',
    });

    const filePath = await persistArtifact(
      this.artifactTempDir,
      artifact.fileName,
      new Uint8Array(artifactResponse.data),
    );
    const verified = await verifySha256(filePath, downloadData.sha256);

    await this.report({
      eventType: verified ? 'download_completed' : 'install_failed',
      currentAppVersion: params.currentVersion,
      targetVersion: downloadData.version,
      artifactId: downloadData.artifactId,
      metadata: verified ? { filePath } : { filePath, reason: 'sha256_mismatch' },
    });

    return {
      version: downloadData.version,
      fileName: artifact.fileName,
      filePath,
      verified,
      mandatory: manifest.mandatory,
    };
  }

  private async createUpdateSession(deviceId: string, currentVersion: string) {
    const session = await this.http.post('/agent-updates/session', {
      deviceId,
      currentVersion,
    });

    return session.data.data.updateSessionToken as string;
  }

  private async report(params: {
    eventType: string;
    currentAppVersion: string;
    targetVersion: string;
    artifactId: string;
    metadata?: Record<string, unknown>;
  }) {
    await this.http.post('/agent-updates/report', params);
  }

  private normalizeArtifactUrl(downloadUrl: string) {
    if (downloadUrl.startsWith('/api/v1/')) {
      return downloadUrl.replace(/^\/api\/v1/, '');
    }

    if (downloadUrl.startsWith('/agent-updates/')) {
      return downloadUrl;
    }

    return `/agent-updates/${downloadUrl.replace(/^\/+/, '')}`;
  }
}
