const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');
const source = fs.readFileSync(require.resolve('../NexusList-Forumeiros-Bridge.js'), 'utf8');
function setup(t, pending = false) {
  const dom = new JSDOM('', { url: 'https://www.policiarcc.com/t123-', runScripts: 'outside-only' });
  t.after(() => dom.window.close());
  const sent = []; const opener = { postMessage: message => sent.push(message) };
  Object.defineProperty(dom.window, 'opener', { value: opener });
  if (pending) dom.window.sessionStorage.setItem('NEXUSLIST_FORUM_OPERATIONS_V2', JSON.stringify([
    ['test-operation-123', { at: Date.now(), running: true, submitted: true }]
  ]));
  dom.window.eval(source);
  const dispatch = (type, origin = 'https://professoresdapmrcc.github.io') => dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
    source: opener, origin, data: { type, requestId: 'test-operation-123', action: 'reply', topicId: '123', bbcode: 'teste' }
  }));
  return { window: dom.window, sent, dispatch };
}
test('ponte valida origem e emite READY antes de qualquer postagem', t => {
  const h = setup(t); let requests = 0; h.window.fetch = async () => { requests++; };
  h.dispatch('NEXUSLIST_FORUM_HELLO', 'https://example.com'); assert.equal(h.sent.length, 0);
  h.dispatch('NEXUSLIST_FORUM_HELLO'); assert.equal(h.sent[0].type, 'NEXUSLIST_FORUM_READY'); assert.equal(requests, 0);
});
test('retransmissões da mesma operação nunca geram dois POSTs', async t => {
  const h = setup(t); let reads = 0; let writes = 0;
  h.window.fetch = async (_url, options) => {
    if (options.method === 'POST') writes++; else reads++;
    return { ok: true, status: 200, url: options.method === 'POST' ? 'https://www.policiarcc.com/t123-#100' : 'https://www.policiarcc.com/post',
      text: async () => options.method === 'POST' ? 'Mensagem publicada' : '<form action="/post"><textarea name="message"></textarea></form>' };
  };
  h.dispatch('NEXUSLIST_FORUM_ACTION'); h.dispatch('NEXUSLIST_FORUM_ACTION');
  await new Promise(resolve => setImmediate(resolve));
  h.dispatch('NEXUSLIST_FORUM_ACTION');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(reads, 1); assert.equal(writes, 1);
  assert.ok(h.sent.some(message => message.ok === true && message.postUrl.endsWith('#100')));
});
test('reabrir uma operação pendente não repete postagem de resultado desconhecido', t => {
  const h = setup(t, true); let requests = 0; h.window.fetch = async () => { requests++; };
  h.dispatch('NEXUSLIST_FORUM_ACTION');
  assert.equal(requests, 0); assert.equal(h.sent[0].uncertain, true);
});
