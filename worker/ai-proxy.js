// Proxy per l'IA di Marquee (Cloudflare Worker): tiene la chiave Anthropic fuori dal sito pubblico.
// Accetta solo richieste a /v1/messages che arrivano dal sito indicato in ALLOWED_ORIGIN.
export default {
  async fetch(req, env) {
    const origin = req.headers.get('Origin') ?? ''
    const ok = origin === env.ALLOWED_ORIGIN
    const cors = {
      'Access-Control-Allow-Origin': ok ? origin : 'null',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': req.headers.get('Access-Control-Request-Headers') ?? '*',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    }
    if (req.method === 'OPTIONS') return new Response(null, { status: ok ? 204 : 403, headers: cors })
    const url = new URL(req.url)
    if (!ok || req.method !== 'POST' || url.pathname !== '/v1/messages') return new Response('Forbidden', { status: 403, headers: cors })
    const headers = new Headers({
      'content-type': 'application/json',
      'x-api-key': env.ANTHROPIC_KEY,
      'anthropic-version': req.headers.get('anthropic-version') ?? '2023-06-01',
    })
    const beta = req.headers.get('anthropic-beta')
    if (beta) headers.set('anthropic-beta', beta)
    const up = await fetch('https://api.anthropic.com/v1/messages' + url.search, { method: 'POST', headers, body: req.body })
    const out = new Headers(up.headers)
    for (const [k, v] of Object.entries(cors)) out.set(k, v)
    return new Response(up.body, { status: up.status, headers: out })
  },
}
