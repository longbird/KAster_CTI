import { readFileSync } from 'fs';
import { join } from 'path';

describe('Server package manifest', () => {
  const packageJson = JSON.parse(
    readFileSync(join(__dirname, '..', 'package.json'), 'utf8'),
  ) as {
    scripts?: Record<string, string>;
  };

  it('production start script points to the Nest build output entry', () => {
    expect(packageJson.scripts).toMatchObject({
      build: 'nest build',
      start: 'node dist/src/main.js',
    });
  });
});
