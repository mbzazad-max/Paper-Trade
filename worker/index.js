/* Paper-Trade Worker: serves the built page (static files) and the owner endpoints. Adapted from the coin-zones and
   Paper-Test Workers. It has no address of its own (workers_dev off); the home site (repo dashboards) passes
   /paper-trade/... here for viewing and /api/paper-trade/... for the controls, which always stay behind the login.
     GET  /api/access  -> {owner:true} (reaching it at all means the login passed) and whether GitHub control works
     GET  /api/status  -> state of the latest build run
     POST /api/refresh -> starts the build (unless one is already queued or running)
     POST /api/trade   -> one Close all / Book N% action; the build checks it against the last closed 4H candle
   Secret GITHUB_TOKEN: fine-grained token with Actions read/write on mbzazad-max/paper-trade. */
const WF = 'build.yml';
const COINS = ['BTC', 'ETH', 'BNB', 'XRP', 'SOL', 'ZEC', 'HYPE', 'DOGE', 'LINK', 'ADA', 'XLM', 'NEAR', 'UNI', 'LTC', 'SUI', 'GRAM', 'TAO', 'ENA', 'PEPE', 'AAVE', 'AVAX', 'ARB', 'RENDER', 'RAY', 'FET', 'WIF'];
const S083 = ['BTC', 'ETH', 'BNB', 'SOL'];
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });

async function gh(env, path, init = {}) {
  return fetch('https://api.github.com/repos/' + env.GITHUB_REPO + path, { ...init, headers: {
    authorization: 'Bearer ' + env.GITHUB_TOKEN, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28',
    'user-agent': 'paper-trade-worker', ...(init.body ? { 'content-type': 'application/json' } : {}) } });
}
async function latestRun(env) {
  const r = await gh(env, `/actions/workflows/${WF}/runs?per_page=1`);
  if (!r.ok) throw new Error('GitHub answered ' + r.status);
  const run = (await r.json()).workflow_runs[0];
  return run ? { status: run.status, conclusion: run.conclusion, started: run.run_started_at || run.created_at, updated: run.updated_at, event: run.event } : { status: 'none' };
}
async function dispatch(env, reason, payload) {
  const r = await gh(env, `/actions/workflows/${WF}/dispatches`, { method: 'POST', body: JSON.stringify({ ref: 'main', inputs: { reason, payload: payload || '' } }) });
  if (r.status !== 204) throw new Error('GitHub refused the request (' + r.status + ')');
}
function checkAction(p) {
  if (!p || typeof p !== 'object') return null;
  const base = typeof p.nonce === 'string' && /^[A-Za-z0-9_-]{12,100}$/.test(p.nonce) && ['close', 'book'].includes(p.kind)
    && typeof p.trade_id === 'string' && p.trade_id.length >= 8 && p.trade_id.length <= 120
    && Number.isInteger(p.event_count) && p.event_count >= 0 && Number.isInteger(p.last_close)
    && (p.kind === 'close' || (Number.isInteger(p.percent) && p.percent >= 1 && p.percent <= 99));
  if (!base) return null;
  const out = { strategy: p.strategy, sym: p.sym, kind: p.kind, percent: p.kind === 'close' ? 100 : p.percent, nonce: p.nonce, trade_id: p.trade_id, event_count: p.event_count, last_close: p.last_close };
  if (p.strategy === 'zone_pnl' && ['zone', 'mss'].includes(p.mode) && COINS.includes(p.sym)) return { ...out, mode: p.mode };
  if (p.strategy === 's083' && S083.includes(p.sym)) return out;
  return null;
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req);
    if (url.pathname === '/api/access' && req.method === 'GET') {
      if (!env.GITHUB_TOKEN) return json({ owner: true, actions_ready: false, error: 'the GitHub control token is not set' });
      try { return json({ owner: true, actions_ready: true, workflow: await latestRun(env) }); }
      catch (e) { return json({ owner: true, actions_ready: false, error: String(e.message || e) }); }
    }
    if (!env.GITHUB_TOKEN) return json({ error: 'Owner controls are not set up yet (missing GITHUB_TOKEN).' }, 503);
    try {
      if (url.pathname === '/api/status' && req.method === 'GET') return json(await latestRun(env));
      if (req.method === 'POST' && (url.pathname === '/api/refresh' || url.pathname === '/api/trade')) {
        const origin = req.headers.get('origin');
        if (origin && new URL(origin).host !== url.host) return json({ error: 'Wrong origin' }, 403);
        const cur = await latestRun(env);
        if (cur.status === 'queued' || cur.status === 'in_progress') return json({ error: 'An update is already running. Try again when it finishes.', run: cur }, 409);
        if (url.pathname === '/api/refresh') { await dispatch(env, 'Refresh button', ''); return json({ state: 'started' }, 202); }
        if (!(req.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) return json({ error: 'JSON required' }, 415);
        const raw = await req.text(); if (raw.length > 2048) return json({ error: 'Request too long' }, 400);
        let p; try { p = JSON.parse(raw); } catch { return json({ error: 'Invalid JSON' }, 400); }
        const a = checkAction(p); if (!a) return json({ error: 'Invalid paper-trade action' }, 400);
        await dispatch(env, 'Owner ' + (a.mode || a.strategy) + ' ' + a.kind + ' ' + a.sym, JSON.stringify(a));
        return json({ state: 'queued', note: 'Queued, not filled yet. The build checks it against the last closed 4H candle.' }, 202);
      }
      return json({ error: 'Not found' }, 404);
    } catch (e) { return json({ error: String(e.message || e) }, 502); }
  }
};
