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

/** `System()` 인자로 넘길 값을 홑따옴표로 감싼다. 값 안의 홑따옴표는 셸 규칙대로 끊어 붙인다. */
export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}
