const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');
const source = fs.readFileSync(require.resolve('../script.js'), 'utf8');
const functionNames = [...source.matchAll(/^      (?:async )?function (\w+)\(/gm)].map(match => match[1]);

function setup(t) {
  const dom = new JSDOM('<!doctype html><html><head><meta name="theme-color"></head><body><main id="main-content"></main><table id="members-table"><thead><tr id="members-table-head"></tr></thead><tbody id="members-table-body"></tbody></table></body></html>', {
    url: 'https://www.policiarcc.com/h1', runScripts: 'outside-only', pretendToBeVisual: true
  });
  const { window } = dom;
  for (const [, id] of source.matchAll(/getElementById\("([^"]+)"\)/g)) {
    if (!window.document.getElementById(id)) {
      const tag = ['additional-access-role', 'additional-access-type'].includes(id) ? 'select'
        : id.includes('editor') || id.includes('dialog') ? 'dialog' : 'div';
      const el = window.document.createElement(tag);
      el.id = id; window.document.body.appendChild(el);
    }
  }
  window.HTMLElement.prototype.showModal = function () { this.open = true; };
  window.HTMLElement.prototype.close = function () { this.open = false; };
  window.HTMLElement.prototype.scrollIntoView = function () {};
  window.CSS = { supports: () => true };
  window.confirm = () => true;
  window.setInterval = () => 1;
  window.clearInterval = () => {};
  const prefix = source.slice(0, source.indexOf('      window.NexusList ='));
  vm.runInContext(prefix + '\nwindow.audit = { appState, ' + functionNames.join(', ') + ', setUser(value) { currentUser = value; }, getUser() { return currentUser; }, set(name, value) { eval(name + " = value"); } };\n})();', dom.getInternalVMContext());
  t.after(() => window.close());
  return { ...window.audit, window, dom };
}
const headers = ['CARGO', 'NICKNAME', 'ENTRADA', 'DATA (PROMO/REB)', 'TEMPO', 'INÍCIO', 'DIAS', 'RETORNO', 'RL', 'GP'];
function member(name = 'Teste', extra = {}) {
  return { row: 2, values: ['Professor(a)', name, '01 Nov 2026', '', '8', '', '', '', 'FALSE', 'FALSE'], ...extra };
}
function bootstrap(rows = [member()], extra = {}) {
  return { ok: true, data: { headers: [...headers], rows }, settings: { rows: [] }, meta: { revision: '1' }, ...extra };
}
function ready(h, response = bootstrap()) {
  h.acceptBootstrap(response);
  h.setUser({ nick: 'Admin', role: 'Líder', canEdit: true, canManageAccess: true });
}
function silence(h) {
  const messages = [];
  h.set('showToast', (...args) => messages.push(args));
  for (const name of ['renderBootstrap', 'updateMemberEditControls', 'renderMembers', 'setWorkspaceState']) h.set(name, () => {});
  return messages;
}

test('dados canônicos da API são exibidos e editados, sem voltar ao saved antigo', t => {
  const h = setup(t); const row = member(); row.source = [...row.values]; row.saved = [...row.values];
  row.values[1] = 'Atual'; row.saved[1] = 'Antigo'; row.hasSaved = true;
  ready(h, bootstrap([row]));
  assert.equal(h.appState.rows[0].values[1], 'Atual');
  assert.equal(h.memberEditableValues(h.appState.rows[0])[1], 'Atual');
});
test('bootstrap inválido não substitui a base existente', t => {
  const h = setup(t); ready(h);
  assert.throws(() => h.acceptBootstrap({ data: { rows: [] } }), /estrutura incompleta/);
  assert.equal(h.appState.rows[0].values[1], 'Teste');
});
test('nicknames duplicados, linhas repetidas e cabeçalhos inválidos bloqueiam edição', t => {
  const h = setup(t);
  assert.throws(() => h.decodeBootstrap(bootstrap([member('Teste'), member('teste', { row: 3 })])), /duplicado/);
  assert.throws(() => h.decodeBootstrap(bootstrap([member('A'), member('B')])), /linhas inválidas/);
  const data = bootstrap(); data.data.headers[1] = 'CARGO';
  assert.throws(() => h.decodeBootstrap(data), /Cabeçalhos/);
});
test('um TRUE isolado não transforma comentários em checkbox', t => {
  const h = setup(t); h.appState.headers = ['CARGO', 'NICKNAME', 'COMENTÁRIOS', 'RL'];
  h.appState.rows = [{ values: ['Professor(a)', 'A', 'TRUE', 'FALSE'] }, { values: ['Professor(a)', 'B', 'texto', 'TRUE'] }];
  assert.deepEqual([...h.detectBooleanColumns()], [3]);
});
test('colunas calculadas seguem cabeçalho e metadados, não posições fixas', t => {
  const h = setup(t); h.appState.headers = ['CARGO', 'NICKNAME', 'ENTRADA', 'INÍCIO', 'DIAS', 'RETORNO', 'CALCULADA'];
  assert.equal(h.isFormulaMemberColumn(4), false);
  assert.equal(h.isFormulaMemberColumn(5), true);
  h.appState.formulaColumns.add(6); assert.equal(h.isFormulaMemberColumn(6), true);
});
test('licença sem início e dias limpa retorno antigo', t => {
  const h = setup(t); ready(h); const values = [...member().values]; values[7] = '20 Nov 2026';
  assert.equal(h.prepareMemberValues(values)[7], '');
});
for (const days of ['-2', '0', '1.5', 'abc', '999999999']) {
  test('dias inválidos são rejeitados: ' + days, t => {
    const h = setup(t); ready(h); const values = [...member().values]; values[5] = '01 Nov 2026'; values[6] = days;
    assert.throws(() => h.prepareMemberValues(values), /Licença inválida/);
  });
}
test('licença incompleta e datas impossíveis não são gravadas', t => {
  const h = setup(t); ready(h); const values = [...member().values]; values[6] = '7';
  assert.throws(() => h.prepareMemberValues(values), /Licença inválida/);
  values[6] = ''; values[2] = '31 Fev 2026';
  assert.throws(() => h.assertRequiredMemberFields(values), /Data inválida/);
});
test('retorno válido cruza mês e ano corretamente', t => {
  const h = setup(t);
  assert.equal(h.calculateMemberReturnDate('28 Dez 2026', '7'), '04 Jan 2027');
  assert.equal(h.calculateMemberReturnDate('27 Fev 2028', '2'), '29 Fev 2028');
});
test('selecionar Consultor e voltar preserva os dados do rascunho', t => {
  const h = setup(t); ready(h); h.set('renderMembers', () => {});
  const row = h.appState.rows[0]; row.values[2] = '02 Nov 2026';
  const control = h.createMemberRoleSelect(row.values[0], row, 0);
  control.value = 'Consultor(a)'; control.dispatchEvent(new h.window.Event('change'));
  control.value = 'Professor(a)'; control.dispatchEvent(new h.window.Event('change'));
  assert.equal(h.appState.memberDrafts.get(2)[2], '02 Nov 2026');
});
test('novos cargos das configurações aparecem no seletor', t => {
  const h = setup(t); ready(h); h.appState.settings = [{ role: 'Cargo personalizado' }];
  assert.ok([...h.createRoleSelect('').options].some(option => option.value === 'Cargo personalizado'));
});
test('resposta atrasada não substitui atualização recente nem desliga o loading dela', async t => {
  const h = setup(t); ready(h); silence(h); const pending = [];
  h.set('requestNexusList', () => new Promise((resolve, reject) => pending.push({ resolve, reject })));
  const first = h.loadNexusList({ quiet: true }); const second = h.loadNexusList({ quiet: true });
  pending[0].resolve(bootstrap([member('Antigo')])); await first;
  assert.equal(h.appState.loading, true);
  pending[1].resolve(bootstrap([member('Atual')])); await second;
  assert.equal(h.appState.rows[0].values[1], 'Atual'); assert.equal(h.appState.loading, false);
});
test('falha de atualização mantém base visível mas bloqueia escrita', async t => {
  const h = setup(t); ready(h); silence(h); h.set('requestNexusList', async () => { throw Error('offline'); });
  await h.loadNexusList({ quiet: true });
  assert.equal(h.appState.requiresRefresh, true); assert.throws(() => h.requireFreshMembers(), /Atualize/);
  assert.equal(h.appState.rows[0].values[1], 'Teste');
});
test('atualização não descarta rascunhos durante edição', async t => {
  const h = setup(t); ready(h); silence(h); h.appState.editingMembers = true;
  h.appState.memberDrafts.set(2, ['rascunho']); let requests = 0;
  h.set('requestNexusList', async () => { requests++; return bootstrap(); });
  assert.equal(await h.loadNexusList(), false); assert.equal(requests, 0);
  assert.equal(h.appState.memberDrafts.get(2)[0], 'rascunho');
});
test('alteração concorrente bloqueia reorganização antes do POST', async t => {
  const h = setup(t); ready(h); const calls = [];
  h.set('requestNexusList', async action => { calls.push(action); return bootstrap([member('Outro')]); });
  await assert.rejects(h.persistCompactMemberList([member()]), /alterada/);
  assert.deepEqual(calls, ['bootstrap']);
});
test('confirmação relê a API e mantém revisão e licenças atualizadas', async t => {
  const h = setup(t); ready(h); silence(h); const calls = [];
  h.set('requestNexusList', async (action, payload) => {
    calls.push({ action, payload });
    return action === 'organizeData' ? { ok: true } : bootstrap([member()], { ...bootstrap(), licenses: { configured: true, expired: [] } });
  });
  await h.persistCompactMemberList([member()]);
  assert.deepEqual(calls.map(call => call.action), ['bootstrap', 'organizeData', 'bootstrap']);
  assert.equal(calls[1].payload.originalMembers[0].nickname, 'Teste');
  assert.ok(calls[1].payload.idempotencyKey); assert.equal(calls[1].payload.expectedRevision, '1');
  assert.equal(h.appState.licenseWorkflow.expired.length, 0);
});
test('ok:true sem valores persistidos não produz confirmação falsa', async t => {
  const h = setup(t); ready(h); silence(h); const modified = member(); modified.values[8] = 'TRUE';
  h.set('requestNexusList', async action => action === 'organizeData' ? { ok: true } : bootstrap());
  await assert.rejects(h.persistCompactMemberList([modified]), /não confirmou/);
  assert.equal(h.appState.requiresRefresh, true);
});
test('retorno de licença com linha de outro membro não é enviado', async t => {
  const h = setup(t); ready(h); const messages = silence(h); const calls = [];
  h.set('requestNexusList', async action => {
    calls.push(action); return bootstrap([member()], { ...bootstrap(), licenses: { expired: [{ row: 2, nickname: 'OutraPessoa', rl: false }] } });
  });
  await h.markLicenseReturnsAsRl(); assert.deepEqual(calls, ['bootstrap']);
  assert.ok(messages.some(message => /não corresponde/.test(message[0])));
});
test('API antiga sem lista de RLs confirmados não é tratada como sucesso', async t => {
  const h = setup(t); ready(h); const messages = silence(h);
  h.set('requestNexusList', async action => action === 'bootstrap'
    ? bootstrap([member()], { ...bootstrap(), licenses: { expired: [{ row: 2, nickname: 'Teste', rl: false }] } }) : { ok: true });
  await h.markLicenseReturnsAsRl();
  assert.ok(messages.some(message => /não confirmou quais/.test(message[0])));
  assert.equal(h.appState.rows[0].values[8], 'FALSE');
});
test('recuperação da autenticação inicial carrega a lista', async t => {
  const h = setup(t); silence(h); let unavailable = true; let loads = 0;
  h.set('validateForumAccess', async () => { if (unavailable) throw Error('offline'); return { nick: 'Admin' }; });
  h.set('showAuthenticationUnavailable', () => {}); h.set('scheduleAuthenticationRevalidation', () => {});
  h.set('allowAccess', user => h.setUser(user)); h.set('loadNexusList', async () => { loads++; h.appState.loaded = true; });
  await h.revalidateAuthentication({ reloadData: true }); unavailable = false;
  await h.revalidateAuthentication(); assert.equal(loads, 1);
});
test('revalidações simultâneas compartilham uma única consulta', async t => {
  const h = setup(t); ready(h); silence(h); let resolve; let calls = 0;
  h.set('validateForumAccess', () => { calls++; return new Promise(done => { resolve = done; }); });
  h.set('allowAccess', user => h.setUser(user)); h.set('scheduleAuthenticationRevalidation', () => {});
  const one = h.revalidateAuthentication(); const two = h.revalidateAuthentication();
  resolve({ nick: 'Admin' }); await Promise.all([one, two]); assert.equal(calls, 1);
});
test('gerenciamento de acesso exige permissão própria mesmo por chamada direta', async t => {
  const h = setup(t); ready(h); h.setUser({ nick: 'Admin', canEdit: true, canManageAccess: false });
  await assert.rejects(h.requestNexusList('addAdditionalAccess', { value: 'Teste' }), /gerenciar acessos/);
});
test('gravação sem resposta não é repetida e bloqueia novos envios', async t => {
  const h = setup(t); ready(h); let attempts = 0;
  h.set('validateForumAccess', async () => ({ nick: 'Admin', canEdit: true, canManageAccess: true }));
  h.set('allowAccess', () => {});
  h.window.fetch = async () => { attempts++; throw new h.window.TypeError('network'); };
  await assert.rejects(h.requestNexusList('organizeData', { rows: [] }), /confirmar a gravação/);
  assert.equal(attempts, 1); assert.equal(h.appState.writeUncertain, true);
  await assert.rejects(h.requestNexusList('organizeData', { rows: [] }), /sem confirmação/);
  assert.equal(attempts, 1);
});
test('usuário diferente no fórum impede POST com identidade antiga', async t => {
  const h = setup(t); ready(h); let attempts = 0;
  h.set('validateForumAccess', async () => ({ nick: 'OutraPessoa', canEdit: true }));
  h.window.fetch = async () => { attempts++; };
  await assert.rejects(h.requestNexusList('organizeData', { rows: [] }), /usuário do fórum mudou/);
  assert.equal(attempts, 0);
});
test('fórum exige prova de publicação no tópico correto', t => {
  const h = setup(t); const parse = html => new h.window.DOMParser().parseFromString(html, 'text/html');
  assert.throws(() => h.confirmedForumPost(parse('<div class="error">Sem permissão</div>'), 'https://www.policiarcc.com/post', '123'), /Sem permissão/);
  assert.equal(h.confirmedForumPost(parse('<a href="/t123-#1">post antigo</a>'), 'https://www.policiarcc.com/post', '123'), null);
  assert.equal(h.confirmedForumPost(parse(''), 'https://www.policiarcc.com/t999-#100', '123'), null);
  assert.equal(h.confirmedForumPost(parse(''), 'https://www.policiarcc.com/t123-#100', '123'), 'https://www.policiarcc.com/t123-#100');
  assert.equal(h.confirmedForumPost(parse('<meta http-equiv="refresh" content="0;url=/t123-#100">'), 'https://www.policiarcc.com/post', '123'), 'https://www.policiarcc.com/t123-#100');
});
test('ponte só envia a ação uma vez após prontidão, mesmo com READY repetido', async t => {
  const h = setup(t); const sent = []; const popup = { closed: false, postMessage: message => sent.push(message) };
  const request = { type: 'NEXUSLIST_FORUM_ACTION', requestId: 'test-operation-123', topicId: '123', action: 'reply', bbcode: 'teste' };
  const promise = h.publishThroughForumBridge(popup, request);
  const event = type => new h.window.MessageEvent('message', { origin: 'https://www.policiarcc.com', source: popup, data: { type, requestId: request.requestId, ok: true, postUrl: 'https://www.policiarcc.com/t123-#100' } });
  h.window.dispatchEvent(event('NEXUSLIST_FORUM_READY')); h.window.dispatchEvent(event('NEXUSLIST_FORUM_READY'));
  h.window.dispatchEvent(event('NEXUSLIST_FORUM_RESULT')); await promise;
  assert.equal(sent.filter(message => message.type === request.type).length, 1);
});

test('fluxo integrado: editar, conferir permissão, gravar, reler e renderizar confirmação', async t => {
  const h = setup(t); let database = bootstrap(); const actions = [];
  h.set('fetchForumUsername', async () => 'Admin');
  h.window.fetch = async (url, options = {}) => {
    const target = new URL(new URL(url).searchParams.get('url'));
    const payload = options.method === 'POST' ? JSON.parse(options.body) : null;
    const action = payload?.action || target.searchParams.get('action'); actions.push(action);
    let result;
    if (action === 'access') result = { ok: true, access: { allowed: true, nick: 'Admin', role: 'Líder', canEdit: true, canManageAccess: true } };
    else if (action === 'bootstrap') result = structuredClone(database);
    else if (action === 'organizeData') {
      assert.equal(payload.expectedRevision, database.meta.revision);
      database = bootstrap(payload.rows.map(row => ({ row: row.row, values: row.values })), { meta: { revision: '2' } });
      result = { ok: true };
    } else throw Error('Ação inesperada ' + action);
    return { ok: true, status: 200, text: async () => JSON.stringify(result) };
  };
  ready(h, database); h.beginMemberEditing();
  const draft = [...h.appState.memberDrafts.get(2)]; draft[9] = 'TRUE'; h.appState.memberDrafts.set(2, draft);
  await h.saveMemberList();
  assert.equal(h.appState.editingMembers, false); assert.equal(h.appState.rows[0].values[9], 'TRUE');
  assert.equal(h.appState.revision, '2'); assert.equal(h.appState.requiresRefresh, false);
  assert.deepEqual(actions, ['bootstrap', 'access', 'organizeData', 'bootstrap']);
  assert.match(h.window.document.getElementById('toast-container').textContent, /confirmados na planilha/);
});

test('validação de acesso usa o usuário novo da sessão, não o anterior', async t => {
  const h = setup(t); ready(h); let requested;
  h.set('fetchForumUsername', async () => 'NovoAdmin');
  h.window.fetch = async url => {
    requested = new URL(new URL(url).searchParams.get('url')).searchParams.get('username');
    return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true, access: { allowed: true, nick: requested, role: 'Líder' } }) };
  };
  const user = await h.validateForumAccess(); assert.equal(requested, 'NovoAdmin'); assert.equal(user.nick, 'NovoAdmin');
});

test('falha no POST por tempo limite informa resultado incerto sem repetir', async t => {
  const h = setup(t); ready(h);
  h.set('validateForumAccess', async () => ({ nick: 'Admin', canEdit: true, canManageAccess: true })); h.set('allowAccess', () => {});
  let attempts = 0; const originalTimeout = h.window.setTimeout.bind(h.window);
  h.window.setTimeout = callback => originalTimeout(callback, 1);
  h.window.fetch = async (_url, options) => {
    attempts++;
    return new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new h.window.DOMException('timeout', 'AbortError'))));
  };
  await assert.rejects(h.requestNexusList('organizeData', { rows: [] }), /pode ter sido aplicada/);
  assert.equal(attempts, 1); assert.equal(h.appState.writeUncertain, true);
});

test('carimbo HTTP 200 com erro não informa sucesso', async t => {
  const h = setup(t); let calls = 0;
  h.window.fetch = async () => {
    calls++;
    return { ok: true, status: 200, url: 'https://www.policiarcc.com/post', text: async () => calls === 1
      ? '<form action="/post"><textarea name="message"></textarea><input name="t" value="123"></form>'
      : '<div class="error">Você não tem permissão</div>' };
  };
  await assert.rejects(h.submitForumPostingForm('https://www.policiarcc.com/post?t=123&mode=reply', 'teste'), /não tem permissão/);
  assert.equal(calls, 2);
});

test('acessos adicionais exigem lista confirmada e releitura do servidor', async t => {
  const h = setup(t); const base = { ...bootstrap(), additionalAccess: { nicknames: [], roles: [] } };
  ready(h, base); silence(h); let reads = 0;
  h.set('requestNexusList', async action => {
    if (action === 'addAdditionalAccess') return { ok: true, additionalAccess: { nicknames: ['Teste'], roles: [] } };
    reads++; return reads === 1 ? base : { ...base, additionalAccess: { nicknames: ['Teste'], roles: [] } };
  });
  await h.persistAdditionalAccess('addAdditionalAccess', 'nickname', 'Teste');
  assert.equal(reads, 2); assert.equal(h.appState.additionalAccess[0], 'Teste');
});

test('RL só é confirmado após ler o mesmo membro com início e dias limpos', async t => {
  const h = setup(t); const base = bootstrap(); base.data.rows[0].values[5] = '01 Nov 2026';
  base.data.rows[0].values[6] = '7'; base.data.rows[0].values[7] = '08 Nov 2026';
  base.licenses = { expired: [{ row: 2, nickname: 'Teste', rl: false }] };
  ready(h, base); const messages = silence(h); let written = false;
  h.set('requestNexusList', async (action, payload) => {
    if (action === 'markLicenseReturnsAsRL') {
      assert.equal(payload.members[0].nickname, 'Teste'); written = true;
      return { ok: true, data: { rows: [2] } };
    }
    if (!written) return base;
    const confirmed = bootstrap(); confirmed.data.rows[0].values[8] = 'TRUE'; confirmed.licenses = { expired: [] };
    return confirmed;
  });
  await h.markLicenseReturnsAsRl();
  assert.equal(h.appState.rows[0].values[8], 'TRUE'); assert.equal(h.appState.licenseWorkflow.expired.length, 0);
  assert.ok(messages.some(message => /retornos confirmados/.test(message[0])));
});

test('inclusão mantém os existentes e exclusão não deixa reaparecer o removido', async t => {
  const h = setup(t); let database = bootstrap(); ready(h, database); silence(h);
  h.set('requestNexusList', async (action, payload) => {
    if (action === 'organizeData') {
      database = bootstrap(payload.rows.map(row => ({ row: row.row, values: row.values })), { meta: { revision: String(Number(database.meta.revision) + 1) } });
      return { ok: true };
    }
    return structuredClone(database);
  });
  await h.persistCompactMemberList([member(), member('Novo', { row: 3 })]);
  assert.deepEqual(Array.from(h.appState.rows, row => row.values[1]).sort(), ['Novo', 'Teste']);
  await h.persistCompactMemberList(h.appState.rows.filter(row => row.values[1] !== 'Teste'));
  assert.deepEqual(Array.from(h.appState.rows, row => row.values[1]), ['Novo']);
});

test('editor de cargo não fecha por Escape durante uma gravação', t => {
  const h = setup(t); ready(h); h.appState.settings = [{ row: 2, role: 'Professor(a)', vacancies: 10 }];
  h.openSettingsEditor(2); h.appState.settingsSaving = true;
  const dialog = h.window.document.getElementById('settings-editor');
  const event = new h.window.Event('cancel', { cancelable: true }); dialog.dispatchEvent(event);
  assert.equal(event.defaultPrevented, true); assert.equal(dialog.open, true);
});

test('nickname .999 é preservado na leitura, na tabela e no editor de texto', t => {
  const h = setup(t); ready(h, bootstrap([member('.999')]));
  h.renderMembers();
  assert.match(h.window.document.getElementById('members-table-body').textContent, /\.999/);
  const input = h.createMemberInput('.999', h.appState.rows[0], 1);
  assert.equal(input.type, 'text'); assert.equal(input.inputMode, 'text'); assert.equal(input.value, '.999');
  assert.equal(h.prepareMemberValues(member('.999').values)[1], '.999');
});
test('pontos, zeros iniciais e sinais fazem parte da identidade', t => {
  const h = setup(t);
  for (const [left, right] of [['.999', '999'], ['.Konnd', 'Konnd'], ['00999', '999'], ['9.99', '.999'], ['-Polz-', 'Polz']]) {
    assert.notEqual(h.nicknameIdentity(left), h.nicknameIdentity(right));
  }
  assert.equal(h.nicknameIdentity(' .KONND '), h.nicknameIdentity('.Konnd'));
  assert.equal(h.decodeBootstrap(bootstrap([member('.999'), member('999', { row: 3 })])).rows.length, 2);
});
test('um nickname já recebido como número não ganha pontuação inventada', t => {
  const h = setup(t); const row = member(); row.values[1] = 999;
  const decoded = h.decodeBootstrap(bootstrap([row]));
  assert.equal(decoded.rows[0].values[1], '999'); assert.equal(decoded.rows[0].nicknameReceivedAsNumber, true);
});
test('acessos adicionais não confundem .999 com 999', async t => {
  const h = setup(t);
  assert.notDeepEqual(h.accessValues({ additionalAccess: { nicknames: ['.999'], roles: [] } }, 'nickname'),
    h.accessValues({ additionalAccess: { nicknames: ['999'], roles: [] } }, 'nickname'));
  const base = { ...bootstrap(), additionalAccess: { nicknames: [], roles: [] } };
  ready(h, base); silence(h); let reads = 0;
  h.set('requestNexusList', async action => action === 'addAdditionalAccess'
    ? { ok: true, additionalAccess: { nicknames: ['999'], roles: [] } }
    : ++reads === 1 ? base : { ...base, additionalAccess: { nicknames: ['999'], roles: [] } });
  await assert.rejects(h.persistAdditionalAccess('addAdditionalAccess', 'nickname', '.999'), /não confirmou/);
});
test('POST preserva .999 e só aceita confirmação com o mesmo nickname', async t => {
  const h = setup(t); ready(h); silence(h); let posted;
  h.set('requestNexusList', async (action, payload) => {
    if (action === 'organizeData') { posted = payload; return { ok: true }; }
    return posted ? bootstrap(posted.rows.map(row => ({ row: row.row, values: row.values }))) : bootstrap();
  });
  await h.persistCompactMemberList([member('.999')]);
  assert.equal(posted.rows[0].values[1], '.999'); assert.equal(posted.textColumns[0], 'NICKNAME');
  assert.equal(h.appState.rows[0].values[1], '.999');
});
test('conversão do nickname pelo servidor informa o erro exato sem falso sucesso', async t => {
  const h = setup(t); ready(h); silence(h); let written = false;
  h.set('requestNexusList', async action => {
    if (action === 'organizeData') { written = true; return { ok: true }; }
    return written ? bootstrap([member('999')]) : bootstrap();
  });
  await assert.rejects(h.persistCompactMemberList([member('.999')]), /999.*\.999.*texto simples/);
  assert.equal(h.appState.requiresRefresh, true);
});
test('sessão .999 é distinta da sessão 999 e dispara recarga ao mudar', async t => {
  const h = setup(t); ready(h); silence(h); h.setUser({ nick: '.999' }); let loads = 0;
  h.set('validateForumAccess', async () => ({ nick: '999' })); h.set('allowAccess', user => h.setUser(user));
  h.set('scheduleAuthenticationRevalidation', () => {}); h.set('loadNexusList', async () => { loads++; });
  await h.revalidateAuthentication(); assert.equal(loads, 1); assert.equal(h.getUser().nick, '999');
});

test('helper Apps Script formata texto antes de gravar .999 e zeros iniciais', () => {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(require.resolve('../apps-script/nicknames-como-texto.gs'), 'utf8'), context);
  const calls = [];
  const sheet = { getRange: (...range) => ({
    setNumberFormat: format => calls.push({ kind: 'format', range, format }),
    setValues: values => calls.push({ kind: 'write', range, values }),
  }) };
  context.gravarLinhasNexusListComoTexto(sheet, 2, [['Professor(a)', '.999'], ['Professor(a)', '00999']], ['CARGO', 'NICKNAME']);
  assert.equal(calls[0].kind, 'format'); assert.equal(calls[0].format, '@'); assert.deepEqual(calls[0].range, [2, 2, 2, 1]);
  assert.equal(calls[1].values[0][1], '.999'); assert.equal(calls[1].values[1][1], '00999');
});
test('helper Apps Script rejeita nickname numérico antes de modificar a planilha', () => {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(require.resolve('../apps-script/nicknames-como-texto.gs'), 'utf8'), context);
  let changes = 0;
  assert.throws(() => context.gravarLinhasNexusListComoTexto({ getRange: () => { changes++; } }, 2, [['Professor(a)', 999]], ['CARGO', 'NICKNAME']), /deve chegar como texto/);
  assert.equal(changes, 0);
});
