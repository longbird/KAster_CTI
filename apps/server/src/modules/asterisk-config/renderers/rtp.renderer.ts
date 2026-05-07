export interface RtpRendererInput {
  rtpStart: number;
  rtpEnd: number;
  stunAddress: string | null;
}

export function renderRtp(input: RtpRendererInput): string {
  const lines = [
    '[general]',
    `rtpstart=${input.rtpStart}`,
    `rtpend=${input.rtpEnd}`,
    'icesupport=true',
  ];

  if (input.stunAddress?.trim()) {
    lines.push(`stunaddr=${input.stunAddress.trim()}`);
  }

  return `${lines.join('\n')}\n`;
}
