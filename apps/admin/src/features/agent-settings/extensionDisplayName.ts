export interface ExtensionDisplayNameSource {
  agentName?: string | null;
  extension?: string | null;
  extensionDisplayName?: string | null;
}

export function formatExtensionDisplayName(source: ExtensionDisplayNameSource): string {
  const displayName = source.extensionDisplayName?.trim();
  if (displayName) return displayName;

  const agentName = source.agentName?.trim();
  const extension = source.extension?.trim();
  if (agentName && extension) return `${agentName} / ${extension}`;
  return agentName || extension || '-';
}
