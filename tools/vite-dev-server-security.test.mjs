import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDevServerAccessGuard,
  isLoopbackAddress,
  resolveDevServerHost,
} from './vite-dev-server-security.mjs';

test('resolveDevServerHost binds to loopback by default', () => {
  assert.equal(resolveDevServerHost({}), '127.0.0.1');
});

test('resolveDevServerHost allows remote bind only with explicit opt-in', () => {
  assert.equal(resolveDevServerHost({ ALLOW_REMOTE_DEV_SERVER: 'true' }), '0.0.0.0');
});

test('isLoopbackAddress recognizes common loopback forms', () => {
  assert.equal(isLoopbackAddress('127.0.0.1'), true);
  assert.equal(isLoopbackAddress('::1'), true);
  assert.equal(isLoopbackAddress('::ffff:127.0.0.1'), true);
  assert.equal(isLoopbackAddress('10.0.0.25'), false);
});

test('dev server guard blocks remote requests when remote dev is not enabled', async () => {
  let middleware;
  const plugin = createDevServerAccessGuard({});

  plugin.configureServer({
    middlewares: {
      use(handler) {
        middleware = handler;
      },
    },
  });

  assert.equal(typeof middleware, 'function');

  const response = {
    statusCode: 200,
    headers: {},
    body: '',
    setHeader(name, value) {
      this.headers[name] = value;
    },
    end(value) {
      this.body = value;
    },
  };

  let nextCalled = false;
  await middleware(
    { socket: { remoteAddress: '10.0.0.25' } },
    response,
    () => {
      nextCalled = true;
    },
  );

  assert.equal(nextCalled, false);
  assert.equal(response.statusCode, 403);
  assert.match(response.body, /Remote Vite dev server access is disabled/);
});

test('dev server guard allows loopback requests', async () => {
  let middleware;
  const plugin = createDevServerAccessGuard({});

  plugin.configureServer({
    middlewares: {
      use(handler) {
        middleware = handler;
      },
    },
  });

  let nextCalled = false;
  await middleware(
    { socket: { remoteAddress: '127.0.0.1' } },
    {},
    () => {
      nextCalled = true;
    },
  );

  assert.equal(nextCalled, true);
});
