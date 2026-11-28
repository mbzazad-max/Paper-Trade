/* Paper-Trade Worker: serves the built page (static files) and four small endpoints. Same pattern as the Coin Zones Worker.
   It has no address of its own (workers_dev off): the home site (repo dashboards) passes /paper-trade/... here for viewing
   and /api/paper-trade/... for the endpoints, which always stay behind the owner's login.
     GET  /api/status  -> state of the latest build run (the page's Refresh button and progress use it)
     POST /api/refresh -> starts the build (unless one is already queued or running)
     GET  /api/owner   -> {owner:true} when reached (only the owner gets past the login) and whether GitHub answers
     POST /api/action  -> one Close all / Book % request; the build checks it and fills it at the last closed 4H close
   Secret GITHUB_TOKEN: fine-grained token with Actions read/write on mbzazad-max/Paper-Trade. */
const WF = 'build.yml';
const TABS = { mss: 26, s083: 23, 'mss-rvol': 5, 'cycle-dca': 9 };   // without-MSS tab removed 22 Nov 2026; Cycle DCA added 28 Nov 2026
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

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
async function start(env, inputs) {
  const cur = await latestRun(env);
  if (cur.status === 'queued' || cur.status === 'in_progress') return json({ error: 'An update is already running; try again when it has finished.', run: cur }, 409);
  const r = await gh(env, `/actions/workflows/${WF}/dispatches`, { method: 'POST', body: JSON.stringify({ ref: 'main', inputs }) });
  if (r.status !== 204) return json({ error: 'GitHub refused the request (' + r.status + ')' }, 502);
  return json({ state: 'started' }, 202);
}
/* only these fields, checked, are passed on; the build checks them again against the data */
function action(p) {
  if (!p || typeof p !== 'object' || !(p.tab in TABS) || !((p.tab === 'mss-rvol' ? ['close','book','hold','release'] : ['close','book']).includes(p.kind))) return null;
  if (typeof p.sym !== 'string' || !/^[A-Z0-9]{2,10}$/.test(p.sym) || typeof p.nonce !== 'string' || !/^[A-Za-z0-9]{16,64}$/.test(p.nonce)) return null;
  if (typeof p.trade_id !== 'string' || p.trade_id.length > 80 || !Number.isInteger(p.journal_count) || !Number.isInteger(p.last_close)) return null;
  if (p.kind === 'book' && !(Number.isInteger(p.percent) && p.percent >= 1 && p.percent <= 99)) return null;
  return { tab: p.tab, sym: p.sym, kind: p.kind, percent: p.kind === 'book' ? p.percent : 100, nonce: p.nonce, trade_id: p.trade_id, journal_count: p.journal_count, last_close: p.last_close };
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req);
    if (url.pathname === '/api/owner' && req.method === 'GET') {
      if (!env.GITHUB_TOKEN) return json({ owner: true, ready: false, why: 'the GitHub token is not set on the Worker' });
      try { await latestRun(env); return json({ owner: true, ready: true }); } catch (e) { return json({ owner: true, ready: false, why: String(e.message || e) }); }
    }
    if (!env.GITHUB_TOKEN) return json({ error: 'Controls are not set up yet (missing GITHUB_TOKEN).' }, 503);
    try {
      if (url.pathname === '/api/status' && req.method === 'GET') return json(await latestRun(env));
      if (req.method === 'POST') {
        const origin = req.headers.get('origin');
        if (origin && new URL(origin).host !== url.host) return json({ error: 'Wrong origin' }, 403);
        if (url.pathname === '/api/refresh') return start(env, { reason: 'Refresh button' });
        if (url.pathname === '/api/action') {
          const body = await req.text(); if (body.length > 1024) return json({ error: 'Request too long' }, 400);
          let p; try { p = JSON.parse(body); } catch (e) { return json({ error: 'Not JSON' }, 400); }
          const a = action(p); if (!a) return json({ error: 'Not a valid Close all / Book % request' }, 400);
          return start(env, { reason: a.tab + ' ' + (a.kind === 'close' ? 'Close all' : a.kind === 'book' ? 'Book ' + a.percent + '%' : a.kind) + ' ' + a.sym, payload: JSON.stringify(a) });
        }
      }
      return json({ error: 'Not found' }, 404);
    } catch (e) { return json({ error: String(e.message || e) }, 502); }
  }
};
