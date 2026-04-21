#!/usr/bin/env node

const { spawnSync } = require('node:child_process');

function run(command, args) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  return result;
}

function main() {
  const generateStatus = run('npx', ['prisma', 'generate']);
  if (generateStatus.error) {
    throw generateStatus.error;
  }
  if (generateStatus.status !== 0) {
    process.exit(generateStatus.status ?? 1);
  }

  const migrateResult = run('npx', ['prisma', 'migrate', 'deploy']);
  if (migrateResult.error) {
    throw migrateResult.error;
  }
  if (migrateResult.status === 0) {
    return;
  }

  const combinedOutput = `${migrateResult.stdout ?? ''}\n${migrateResult.stderr ?? ''}`;
  if (!combinedOutput.includes('P3005')) {
    process.exit(migrateResult.status ?? 1);
  }

  console.warn('[prisma:sync] prisma migrate deploy failed. Falling back to prisma db push.');

  const dbPushResult = run('npx', ['prisma', 'db', 'push']);
  if (dbPushResult.error) {
    throw dbPushResult.error;
  }
  if (dbPushResult.status !== 0) {
    process.exit(dbPushResult.status ?? 1);
  }
}

main();
