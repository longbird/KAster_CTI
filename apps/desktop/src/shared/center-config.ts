export interface CenterConfigInput {
  serverUrl: string;
  channel?: string;
}

export interface CenterConfig {
  serverUrl: string;
  channel: string;
}

export function normalizeCenterConfig(input: CenterConfigInput): CenterConfig {
  const trimmed = input.serverUrl.trim();
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) && !/^https?:\/\//i.test(trimmed)) {
    throw new Error('Center server URL must use http or https.');
  }

  const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const url = new URL(normalized);

  if (!/^https?:$/.test(url.protocol)) {
    throw new Error('Center server URL must use http or https.');
  }

  return {
    serverUrl: url.toString().replace(/\/$/, ''),
    channel: input.channel?.trim() || 'stable',
  };
}
