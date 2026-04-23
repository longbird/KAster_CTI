export function isRemoteDevServerAllowed(env = process.env) {
  return env.ALLOW_REMOTE_DEV_SERVER === 'true';
}

export function resolveDevServerHost(env = process.env) {
  return isRemoteDevServerAllowed(env) ? '0.0.0.0' : '127.0.0.1';
}

export function isLoopbackAddress(address) {
  if (!address) {
    return false;
  }

  const normalized = String(address).replace(/^\[|\]$/g, '');
  return normalized === '127.0.0.1'
    || normalized === '::1'
    || normalized === '::ffff:127.0.0.1';
}

export function createDevServerAccessGuard(env = process.env) {
  return {
    name: 'kaster-dev-server-access-guard',
    configureServer(server) {
      if (isRemoteDevServerAllowed(env)) {
        return;
      }

      server.middlewares.use((req, res, next) => {
        if (isLoopbackAddress(req.socket?.remoteAddress)) {
          next();
          return;
        }

        res.statusCode = 403;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.end('Remote Vite dev server access is disabled. Set ALLOW_REMOTE_DEV_SERVER=true to override.');
      });
    },
  };
}
