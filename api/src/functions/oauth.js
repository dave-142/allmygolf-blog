const { app } = require('@azure/functions');
const crypto = require('crypto');

const SITE = 'https://www.allmy.golf';
const REDIRECT_URI = `${SITE}/api/callback`;

// The state value protects the login flow. It is signed with your client secret.
function sign(value) {
  return crypto
    .createHmac('sha256', process.env.GITHUB_CLIENT_SECRET)
    .update(value)
    .digest('hex');
}

function makeState() {
  const payload = `${Date.now()}.${crypto.randomBytes(8).toString('hex')}`;
  return `${payload}.${sign(payload)}`;
}

function verifyState(state) {
  if (!state) return false;
  const parts = state.split('.');
  if (parts.length !== 3) return false;
  const a = Buffer.from(parts[2]);
  const b = Buffer.from(sign(`${parts[0]}.${parts[1]}`));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  return Date.now() - Number(parts[0]) < 10 * 60 * 1000;
}

// Sends the result back to the Decap login window, but only to your own site.
function page(message) {
  const script = `
(function () {
  var msg = ${JSON.stringify(message).replace(/</g, '\\u003c')};
  var allowed = ${JSON.stringify(SITE)};
  function receive(e) {
    if (e.origin !== allowed) return;
    window.opener.postMessage(msg, e.origin);
    window.removeEventListener('message', receive, false);
  }
  window.addEventListener('message', receive, false);
  window.opener.postMessage('authorizing:github', allowed);
})();`;
  return {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
    body: `<!doctype html><html><body><p>Signing in...</p><script>${script}</script></body></html>`,
  };
}

function failure(text) {
  return page('authorization:github:error:' + JSON.stringify({ message: text }));
}

app.http('auth', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'auth',
  handler: async () => {
    const params = new URLSearchParams({
      client_id: process.env.GITHUB_CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      state: makeState(),
    });
    return {
      status: 302,
      headers: { Location: `https://github.com/login/oauth/authorize?${params}` },
    };
  },
});

app.http('callback', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'callback',
  handler: async (request) => {
    const code = request.query.get('code');
    if (!code || !verifyState(request.query.get('state'))) {
      return failure('Invalid login request');
    }
    try {
      const res = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          client_id: process.env.GITHUB_CLIENT_ID,
          client_secret: process.env.GITHUB_CLIENT_SECRET,
          code,
          redirect_uri: REDIRECT_URI,
        }),
      });
      const data = await res.json();
      if (!data.access_token) {
        return failure(data.error_description || 'Login failed');
      }
      return page(
        'authorization:github:success:' +
          JSON.stringify({ token: data.access_token, provider: 'github' })
      );
    } catch (err) {
      return failure('Login failed');
    }
  },
});