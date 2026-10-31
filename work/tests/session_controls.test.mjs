import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Exercise the session controls emitted into the actual frontend entry point.
const html = readFileSync(new URL('../../app/frontend/index.html', import.meta.url), 'utf8');
const start = html.indexOf(';(async () => {');
const end = html.indexOf('const [dataResponse, specResponse, statusResponse]', start);
assert.ok(start >= 0 && end > start);
const script = html.slice(start, end) + '\n})();';

async function session(logout) {
  const elements = new Map();
  const element = selector => {
    if (!elements.has(selector)) elements.set(selector, {
      textContent: '', attributes: {},
      setAttribute(k, v) { this.attributes[k] = v; },
      removeAttribute(k) { delete this.attributes[k]; },
    });
    return elements.get(selector);
  };
  let reloads = 0;
  const calls = [], messages = [];
  const context = {
    document: { querySelector: element },
    location: { hash: '#/settings', reload() { reloads++; } },
    alert: message => messages.push(message),
    fetch: async (url, options) => {
      calls.push({ url, options });
      return url === '/api/auth/me'
        ? { ok: true, json: async () => ({ user: { name: '관리자' }, permissions: ['read'] }) }
        : logout();
    },
  };
  context.window = context;
  await vm.runInNewContext(script, context);
  const link = element('#account-link');
  return { context, calls, messages, link, reloads: () => reloads,
    click: () => link.onclick({ preventDefault() {}, currentTarget: link }) };
}

test('logout clears the server session before reloading and sends the required header', async () => {
  const s = await session(async () => ({ ok: true }));
  assert.equal(s.link.textContent, '관리자 · 로그아웃');
  await s.click();
  assert.equal(s.reloads(), 1);
  assert.equal(s.context.location.hash, '#/login');
  assert.equal(s.calls[1].options.headers['X-Requested-With'], 'AXProject');
});

test('HTTP and network failures preserve the screen and allow logout retry', async () => {
  for (const failure of [async () => ({ ok: false }), async () => { throw new Error('offline'); }]) {
    const s = await session(failure);
    await s.click();
    assert.equal(s.reloads(), 0);
    assert.equal(s.context.location.hash, '#/settings');
    assert.equal(s.messages.length, 1);
    assert.equal(s.link.attributes['aria-disabled'], undefined);
    await s.click();
    assert.equal(s.calls.length, 3);
  }
});

test('repeated clicks send only one pending logout request', async () => {
  let resolve;
  const pending = new Promise(done => { resolve = done; });
  const s = await session(() => pending);
  const first = s.click();
  await s.click();
  assert.equal(s.calls.length, 2);
  resolve({ ok: true });
  await first;
  assert.equal(s.reloads(), 1);
});

test('successful CSV saves still reload when browser history storage is unavailable', async () => {
  for (const batch of [false, true]) {
    const from = html.indexOf(batch ? 'async function submitBatch(' : 'async function confirmUpload(');
    const to = html.indexOf(batch ? 'function pendingErrors(' : 'function csvOf(', from);
    assert.ok(from >= 0 && to > from);
    let reloads = 0;
    const pending = batch
      ? { files: [{ rows: [{}] }], localErrors: [], validated: true, busy: false, errors: [] }
      : { rows: [['vessel_id'], ['V1']], result: { errs: [], table: 'vessels' }, serverErrors: [] };
    const context = {
      pendingUpload: pending, pendingBatch: pending, role: 'admin',
      route: { page: 'upload' }, renderUpload() {}, refreshPendingValidation() {},
      fetch: async () => ({ ok: true, json: async () => ({ saved: true }) }),
      sha: async () => 'hash', csvOf: () => '', uploads: [], lastResult: null,
      sessionStorage: { setItem() { throw new Error('storage denied'); } },
      location: { reload() { reloads++; } },
    };
    await vm.runInNewContext(html.slice(from, to) + (batch ? 'submitBatch(true);' : 'confirmUpload();'), context);
    assert.equal(reloads, 1);
    assert.equal(context.uploads.length, 1);
    assert.equal((batch ? pending.errors : pending.serverErrors).length, 0);
  }
});
