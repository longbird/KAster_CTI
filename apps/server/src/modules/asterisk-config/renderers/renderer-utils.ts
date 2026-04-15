export function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function assertNoNewlines(value: string, field: string): void {
  if (/[\r\n]/.test(value)) {
    throw new Error(`Field "${field}" contains illegal newline characters`);
  }
}
