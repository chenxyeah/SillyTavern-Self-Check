import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as adapters from '../api-providers.mjs';

const source = readFileSync(new URL('../index.js', import.meta.url), 'utf8').replace(/^import[\s\S]*?;\r?\n/, '');
const tick = () => new Promise(resolve => setImmediate(resolve));

function plugin() {
    const html = {};
    const events = new Map();
    const nodes = new Map();
    const notices = [];
    const requestBodies = [];
    const st = { extensionSettings: {}, chat: [], saveSettingsDebounced() {}, getRequestHeaders: () => ({ 'X-CSRF-Token': 'LOCAL' }) };
    const $ = selector => {
        const chain = new Proxy({}, { get(_target, method) {
            if (method === 'on') return (types, delegate, handler) => {
                const target = typeof delegate === 'string' ? delegate : selector;
                const callback = handler || delegate;
                for (const type of types.split(' ')) events.set(type + ':' + target, callback);
                return chain;
            };
            if (method === 'html') return value => { if (value !== undefined) html[selector] = value; return chain; };
            if (method === 'val') return value => { if (value !== undefined && nodes.has(String(selector).slice(1))) nodes.get(String(selector).slice(1)).value = value; return chain; };
            return () => chain;
        } });
        return chain;
    };
    for (const id of ['stsc_dual_model', 'stsc_refresh_models', 'stsc_dual_model_status', 'stsc_dual_model_manual', 'stsc_test_api_connection']) {
        nodes.set(id, { innerHTML: '', disabled: false, value: '', textContent: '', classList: { toggle() {} } });
    }
    const scope = { ...adapters, $, jQuery() {}, URL, AbortController, structuredClone, Error, TypeError,
        setTimeout: (fn, delay) => { const timer = setTimeout(fn, delay); timer.unref(); return timer; }, clearTimeout,
        document: { getElementById: id => nodes.get(id) || null },
        window: { addEventListener() {} },
        SillyTavern: { getContext: () => st },
        toastr: { success: message => notices.push(message), error: message => notices.push(message), warning: message => notices.push(message) },
        fetch: async (_url, options) => { requestBodies.push(JSON.parse(options.body)); return new Response(JSON.stringify({ data: [{ id: 'listed-model' }] })); },
    };
    scope.requestProvider = (route, body, options) => adapters.requestProvider(route, body, { ...options, fetchImpl: scope.fetch });
    scope.testConnection = (config, options) => adapters.testConnection(config, { ...options, fetchImpl: scope.fetch });
    const context = vm.createContext(scope);
    vm.runInContext(source, context);
    const run = code => vm.runInContext(code, context);
    run(`editDraft = clone(DEFAULT_SETTINGS); editDraft.mode = 'dual_api';
        editDraft.dualApi = { ...editDraft.dualApi, endpoint: 'https://custom.example/v1', apiKey: 'TEST_SECRET', model: 'private-model' };
        updateSaveState = () => {}; devMigrationSettingsHtml = () => ''; bindUiEvents();`);
    return { run, scope, st, html, nodes, notices, requestBodies,
        event(type, id, value) { return events.get(type + ':' + id).call({ value }, { type }); } };
}

test('settings UI renders all eight providers and manual model/connection controls', async () => {
    const app = plugin();
    app.run('renderSettingsTab()');
    await tick();
    const markup = app.html['#stsc_tab_settings'];
    for (const id of Object.keys(adapters.API_PROVIDERS)) assert.ok(markup.includes('value="' + id + '"'));
    assert.ok(markup.includes('id="stsc_dual_model_manual"'));
    assert.ok(markup.includes('id="stsc_test_api_connection"'));
    assert.equal(app.requestBodies.length, 0, 'render must not send secrets automatically');
});

test('provider selection clears secrets only in draft and does not send requests', async () => {
    const app = plugin();
    app.event('change', '#stsc_dual_provider', 'qianfan');
    assert.equal(app.run('getUiSettings().dualApi.endpoint'), adapters.API_PROVIDERS.qianfan.endpoint);
    assert.equal(app.run('getUiSettings().dualApi.apiKey'), '');
    assert.equal(app.run('getUiSettings().dualApi.model'), '');
    assert.equal(app.run('editDirty'), true);
    await tick();
    assert.equal(app.nodes.get('stsc_refresh_models').disabled, true);
    assert.equal(app.requestBodies.length, 0);
    assert.deepEqual(app.st.extensionSettings, {});
});

test('model refresh never overwrites manual IDs; selecting a model updates manual field', async () => {
    const app = plugin();
    await app.run('fetchDualApiModels()');
    assert.equal(app.run('getUiSettings().dualApi.model'), 'private-model');
    assert.equal(app.run('editDirty'), false);
    app.event('change', '#stsc_dual_model', 'listed-model');
    assert.equal(app.run('getUiSettings().dualApi.model'), 'listed-model');
    assert.equal(app.nodes.get('stsc_dual_model_manual').value, 'listed-model');
    app.event('input', '#stsc_dual_model_manual', 'another-manual-model');
    assert.equal(app.run('getUiSettings().dualApi.model'), 'another-manual-model');
});

test('endpoint/key edits invalidate connection state without automatic requests', async () => {
    const app = plugin();
    app.event('input', '#stsc_dual_endpoint', 'https://new.example/plan/v3');
    app.event('input', '#stsc_dual_api_key', 'new-key');
    await tick();
    assert.equal(app.requestBodies.length, 0);
    assert.equal(app.run('dualApiConnectionTestResult'), null);
});

test('stale model results cannot overwrite a switched provider, even when returning to same config', async () => {
    const app = plugin();
    let finish;
    app.scope.fetch = async () => new Promise(resolve => { finish = resolve; });
    const pending = app.run('fetchDualApiModels({ force: true })');
    app.run('resetDualApiModelState()');
    finish(new Response(JSON.stringify({ data: [{ id: 'STALE' }] })));
    await pending;
    assert.equal(app.run('dualApiModels.length'), 0);
    assert.equal(app.run('getUiSettings().dualApi.model'), 'private-model');
    assert.equal(app.run('dualApiModelsLoading'), false);
});

test('failed model discovery still permits manual generation', async () => {
    const app = plugin();
    app.scope.fetch = async () => new Response(JSON.stringify({ error: true }));
    await app.run('fetchDualApiModels({ force: true })');
    assert.ok(app.run('dualApiModelsError').includes('手动'));
    assert.equal(app.run('getUiSettings().dualApi.model'), 'private-model');
    app.scope.fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: 'OK' } }] }));
    await app.run('testDualApiConnection()');
    assert.equal(app.run('dualApiConnectionTestResult.ok'), true);
    assert.equal(app.run('pendingRun'), null);
    assert.equal(app.st.chat.length, 0);
});

test('connection test is single-flight, does not send chat, save settings or leak results after config changes', async () => {
    const app = plugin();
    let finish;
    let calls = 0;
    app.scope.fetch = async (_url, options) => {
        calls++;
        assert.deepEqual(JSON.parse(options.body).messages, [{ role: 'user', content: 'Reply with OK only.' }]);
        return new Promise(resolve => { finish = resolve; });
    };
    const pending = app.run('testDualApiConnection()');
    await app.run('testDualApiConnection()');
    assert.equal(calls, 1);
    app.event('input', '#stsc_dual_model_manual', 'different-model');
    finish(new Response(JSON.stringify({ choices: [{ message: { content: 'OK' } }] })));
    await pending;
    assert.equal(app.run('dualApiConnectionTestResult'), null);
    assert.equal(app.run('dualApiConnectionTestBusy'), false);
    assert.equal(app.notices.length, 0);
    assert.deepEqual(app.st.extensionSettings, {});
});

test('self-check generation uses saved provider rather than UI draft and honors no-retry auth errors', async () => {
    const app = plugin();
    app.run(`buildDualApiMessages = () => [{ role: 'user', content: 'SELF CHECK' }];
        testSettings = clone(DEFAULT_SETTINGS);
        testSettings.dualApi = { ...testSettings.dualApi, provider: 'qianfan', endpoint: API_PROVIDERS.qianfan.endpoint, apiKey: 'PLAN_KEY', model: 'plan-model' };`);
    let calls = 0;
    app.scope.fetch = async (_url, options) => {
        calls++;
        const req = JSON.parse(options.body);
        assert.equal(req.custom_url, adapters.API_PROVIDERS.qianfan.endpoint);
        assert.equal(req.model, 'plan-model');
        return new Response(JSON.stringify({ error: { message: 'Unauthorized PLAN_KEY' } }), { status: 401 });
    };
    await assert.rejects(app.run('callDualApiSelfCheck({ settings: testSettings })'), error => !error.message.includes('PLAN_KEY'));
    assert.equal(calls, 1);
});

test('self-check transient retry stays capped and uses compact prompt on second attempt', async () => {
    const app = plugin();
    app.run(`seenCompacts = [];
        buildDualApiMessages = (_a, _b, _c, _d, _e, options) => { seenCompacts.push(options.compact); return [{ role: 'user', content: 'CHECK' }]; };
        waitForDualApiRetry = async () => {};`);
    let calls = 0;
    app.scope.fetch = async () => {
        calls++;
        return calls === 1 ? new Response(JSON.stringify({ error: { message: 'busy' } }), { status: 502 })
            : new Response(JSON.stringify({ choices: [{ message: { content: 'FINAL' } }] }));
    };
    const result = await app.run('callDualApiSelfCheck({ settings: getUiSettings() })');
    assert.equal(result.attempts, 2);
    assert.equal(result.compact, true);
    assert.equal(result.text, 'FINAL');
    assert.equal(app.run('JSON.stringify(seenCompacts)'), '[false,true]');
});

test('formal v0.4.1 greeting fence behavior is preserved and imported messages are not rewritten', async () => {
    const app = plugin();
    for (const text of ['```html\n<div>greeting</div>\n```', '```opening', 'closing```', '```both```after', 'plain']) {
        app.scope.original = text;
        assert.equal(app.run('normalizeModelXmlText(original).source'), text);
        assert.equal(app.run('parseModelOutput(original, []).body'), text);
        app.st.chat = [{ is_user: false, mes: text }];
        await app.run('handleMessageReceived(0)');
        assert.equal(app.st.chat[0].mes, text);
    }
});

test('version/identity are formal v0.4.2; release metadata and UI stay in sync', () => {
    const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url)));
    const release = JSON.parse(readFileSync(new URL('../version.json', import.meta.url)));
    assert.equal(manifest.version, '0.4.2');
    assert.equal(release.version, manifest.version);
    assert.equal(manifest.homePage, 'https://github.com/chenxyeah/SillyTavern-Self-Check');
    const app = plugin();
    assert.equal(app.run('STSC_VERSION'), manifest.version);
    assert.deepEqual(JSON.parse(app.run('JSON.stringify(STSC_RELEASE_INFO)')), release);
    const settings = readFileSync(new URL('../settings.html', import.meta.url), 'utf8');
    assert.ok(settings.includes('>v' + manifest.version + '<'));
    const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
    assert.ok(readme.includes('当前正式版本：`' + manifest.version + '`'));
});
