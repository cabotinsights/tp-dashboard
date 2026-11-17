// "Update now" button backend.
//
// POST: starts the Daily refresh GitHub Action (the same job the 03:00 UTC
//       cron runs), unless one is already running or started in the last
//       2 minutes. The Action pulls TrainingPeaks, rebuilds data.json and
//       pushes; Netlify then redeploys.
// GET:  returns the status of the latest run, so the page can show a
//       failure (most likely an expired TP_COOKIE) instead of spinning.
//
// Needs GH_DISPATCH_TOKEN in Netlify env: a fine-grained GitHub token with
// Actions read/write on cabotinsights/tp-dashboard only.

var REPO = 'cabotinsights/tp-dashboard';
var WORKFLOW = 'daily-refresh.yml';
var API = 'https://api.github.com/repos/' + REPO + '/actions/workflows/' + WORKFLOW;

function gh(path, opts) {
  opts = opts || {};
  return fetch(API + path, {
    method: opts.method || 'GET',
    headers: {
      'Authorization': 'Bearer ' + process.env.GH_DISPATCH_TOKEN,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'tp-dashboard-refresh',
      'Content-Type': 'application/json',
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
}

function reply(code, obj) {
  return { statusCode: code, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) };
}

async function latestRun() {
  var resp = await gh('/runs?per_page=1');
  if (!resp.ok) throw new Error('GitHub runs lookup failed: ' + resp.status);
  var json = await resp.json();
  var run = json.workflow_runs && json.workflow_runs[0];
  if (!run) return null;
  return {
    id: run.id,
    status: run.status,          // queued | in_progress | completed
    conclusion: run.conclusion,  // success | failure | null
    created_at: run.created_at,
    url: run.html_url,
  };
}

exports.handler = async function(event) {
  if (!process.env.GH_DISPATCH_TOKEN) {
    return reply(500, { error: 'GH_DISPATCH_TOKEN is not set in Netlify' });
  }

  try {
    if (event.httpMethod === 'GET') {
      return reply(200, { run: await latestRun() });
    }
    if (event.httpMethod !== 'POST') {
      return reply(405, { error: 'Method not allowed' });
    }

    var run = await latestRun();
    var recent = run && (Date.now() - Date.parse(run.created_at)) < 2 * 60 * 1000;
    if (run && (run.status !== 'completed' || recent)) {
      return reply(200, { started: false, reason: 'already running', run: run });
    }

    var resp = await gh('/dispatches', { method: 'POST', body: { ref: 'main' } });
    if (resp.status !== 204) {
      var text = await resp.text();
      return reply(502, { error: 'GitHub dispatch failed: ' + resp.status + ' ' + text.slice(0, 200) });
    }
    return reply(200, { started: true, requested_at: new Date().toISOString() });
  } catch (err) {
    return reply(500, { error: String(err && err.message || err) });
  }
};
