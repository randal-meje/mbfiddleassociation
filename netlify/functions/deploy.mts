import type { Context } from '@netlify/functions';

// Triggered by the "Deploy site" button in Sanity Studio. Verifies the caller is a
// logged-in Sanity user for this project, then POSTs to the Netlify build hook.
// The build hook URL is kept server-side so it never ends up in the Studio bundle.

const ALLOWED_ORIGINS = new Set([
  'https://mbfiddleassociation.sanity.studio',
  'http://localhost:3333',
]);

function corsHeaders(origin: string | null): Record<string, string> {
  const allow = origin && ALLOWED_ORIGINS.has(origin) ? origin : '';
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    Vary: 'Origin',
  };
}

export default async (req: Request, _context: Context): Promise<Response> => {
  const origin = req.headers.get('origin');
  const headers = corsHeaders(origin);

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers });
  }

  const projectId = process.env.PUBLIC_SANITY_PROJECT_ID;
  const buildHook = process.env.NETLIFY_BUILD_HOOK_URL;
  if (!projectId || !buildHook) {
    return new Response('Server not configured', { status: 500, headers });
  }

  const auth = req.headers.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) {
    return new Response('Unauthorized', { status: 401, headers });
  }

  // Hit Sanity's users/me with the caller's token; a 200 means the token is valid
  // for this project, which is sufficient authorization to fire a rebuild.
  const verify = await fetch(`https://${projectId}.api.sanity.io/v2024-10-01/users/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!verify.ok) {
    return new Response('Unauthorized', { status: 401, headers });
  }

  const hook = await fetch(buildHook, { method: 'POST' });
  if (!hook.ok) {
    return new Response('Build hook failed', { status: 502, headers });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
};
