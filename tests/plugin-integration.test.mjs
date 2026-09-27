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

test('floating instruction cards reflect saved activation states, not an unsaved draft', () => {
    const app = plugin();
    app.run(`runtimeForFloating = clone(DEFAULT_SETTINGS);
        runtimeForFloating.temporaryInstructions = [
            { id: 'green', name: '常开指令', content: 'always content' },
            { id: 'gold', name: '单轮指令', content: 'once content' },
            { id: 'grey', name: '关闭指令', content: 'off content' }
        ];
        runtimeForFloating.persistentInstructionIds = ['green'];
        runtimeForFloating.pendingInstructionIds = ['gold'];
        editDraft.persistentInstructionIds = ['grey'];
        normalizeSettings = () => runtimeForFloating;
        renderFloatingInstructionPage();`);
    const markup = app.html['#stsc_floating_content'];
    for (const [id, mode] of [['green', 'always'], ['gold', 'once'], ['grey', 'off']]) {
        assert.ok(markup.includes('data-floating-temp-id="' + id + '" data-activation="' + mode + '"'));
        assert.ok(markup.includes('value="' + mode + '" selected'));
    }
    assert.ok(markup.includes('data-floating-instruction-mode'));
    assert.ok(markup.includes('aria-label="常开指令的启用方式"'));
});

test('floating highlight follows activation changes and clears when single-use state is consumed', () => {
    const app = plugin();
    app.run(`runtimeForFloating = clone(DEFAULT_SETTINGS);
        runtimeForFloating.temporaryInstructions = [{ id: 'item', name: '测试', content: 'content' }];
        normalizeSettings = () => runtimeForFloating;
        renderCompact = renderStatusTab = renderTemporaryTab = () => {};
        renderFloating = renderFloatingInstructionPage;`);
    for (const mode of ['always', 'once', 'off']) {
        assert.equal(app.run(`setInstructionActivation('item', '${mode}')`), true);
        assert.ok(app.html['#stsc_floating_content'].includes('data-activation="' + mode + '"'));
    }
    app.run("setInstructionActivation('item', 'once'); runtimeForFloating.pendingInstructionIds = []; renderFloatingInstructionPage();");
    assert.ok(app.html['#stsc_floating_content'].includes('data-activation="off"'));
});

test('empty floating instructions stay disabled and instruction names remain escaped', () => {
    const app = plugin();
    app.run(`runtimeForFloating = clone(DEFAULT_SETTINGS);
        runtimeForFloating.temporaryInstructions = [{ id: 'empty', name: '<img onerror=x>', content: '' }];
        normalizeSettings = () => runtimeForFloating;
        renderFloatingInstructionPage();`);
    const markup = app.html['#stsc_floating_content'];
    assert.ok(markup.includes('data-activation="off"'));
    assert.ok(/<select[^>]* disabled>/.test(markup));
    assert.ok(!markup.includes('<img onerror=x>'));
    assert.ok(markup.includes('&lt;img onerror=x&gt;'));
    assert.equal(app.run("setInstructionActivation('empty', 'always')"), false);
});

test('version/identity are formal v0.4.3; release metadata and UI stay in sync', () => {
    const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url)));
    const release = JSON.parse(readFileSync(new URL('../version.json', import.meta.url)));
    assert.equal(manifest.version, '0.4.3');
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

test('request controls render escaped values and edit draft only without requests', () => {
    const app = plugin();
    app.event('change', '#stsc_dual_temperature', '0');
    app.event('change', '#stsc_dual_top_p', '.8');
    app.event('change', '#stsc_dual_reasoning_effort', 'low');
    app.event('input', '#stsc_dual_preamble', '</textarea><script>PRIVATE</script>');
    app.run('renderSettingsTab()');
    const markup = app.html['#stsc_tab_settings'];
    for (const id of ['temperature', 'top_p', 'reasoning_effort', 'preamble', 'reset_parameters']) {
        assert.ok(markup.includes('id="stsc_dual_' + id + '"'));
    }
    assert.ok(markup.includes('&lt;/textarea&gt;&lt;script&gt;PRIVATE&lt;/script&gt;'));
    assert.ok(!markup.includes('<script>PRIVATE'));
    assert.equal(app.run('editDraft.dualApi.temperature'), '0');
    assert.equal(app.run('editDraft.dualApi.maxTokens'), 8192);
    assert.equal(app.requestBodies.length, 0);
    assert.equal(app.run('editDirty'), true);
    assert.deepEqual(app.st.extensionSettings, {});
    app.event('change', '#stsc_dual_temperature', '9');
    assert.equal(app.run('editDraft.dualApi.temperature'), '0');
    assert.ok(app.notices.at(-1).includes('temperature'));
});

test('reset restores 8192 and omitted optional fields, preserving credentials/preamble', () => {
    const app = plugin();
    app.event('input', '#stsc_dual_preamble', 'MY PROMPT');
    app.event('change', '#stsc_dual_max_tokens', '4096');
    assert.equal(app.run('editDraft.dualApi.maxTokens'), 4096);
    app.event('change', '#stsc_dual_temperature', '.4');
    app.event('click', '#stsc_dual_reset_parameters', '');
    for (const field of ['temperature', 'topP', 'reasoningEffort']) assert.equal(app.run('editDraft.dualApi.' + field), '');
    assert.equal(app.run('editDraft.dualApi.maxTokens'), 8192);
    assert.equal(app.run('editDraft.dualApi.preamble'), 'MY PROMPT');
    assert.equal(app.run('editDraft.dualApi.apiKey'), 'TEST_SECRET');
    app.event('change', '#stsc_dual_max_tokens', '');
    assert.equal(app.run('editDraft.dualApi.maxTokens'), 8192);
});

test('saved settings normalization defaults to 8192 but preserves saved manual limits', () => {
    const app = plugin();
    app.run(`ctx().extensionSettings[STSC_MODULE] = clone(DEFAULT_SETTINGS);
        delete ctx().extensionSettings[STSC_MODULE].dualApi.maxTokens;`);
    assert.equal(app.run('normalizeSettings().dualApi.maxTokens'), 8192);
    app.run('ctx().extensionSettings[STSC_MODULE].dualApi.maxTokens = 4096');
    assert.equal(app.run('normalizeSettings().dualApi.maxTokens'), 4096);
    assert.equal(app.run('normalizeSettings().dualApi.preamble'), '');
    assert.equal(app.run('normalizeSettings().dualApi.temperature'), '');
});

test('parameter changes invalidate pending connection tests and actual probe uses selected parameters', async () => {
    const app = plugin();
    app.event('change', '#stsc_dual_temperature', '0');
    app.event('input', '#stsc_dual_preamble', 'PRIVATE PREAMBLE');
    let finish;
    app.scope.fetch = async (_url, options) => {
        const body = JSON.parse(options.body);
        assert.equal(JSON.parse(body.custom_include_body).temperature, 0);
        assert.equal(JSON.parse(body.custom_include_body).max_tokens, 8192);
        assert.ok(!options.body.includes('PRIVATE PREAMBLE'));
        return new Promise(resolve => { finish = resolve; });
    };
    const pending = app.run('testDualApiConnection()');
    app.event('change', '#stsc_dual_temperature', '.5');
    finish(new Response(JSON.stringify({ choices: [{ message: { content: 'OK' } }] })));
    await pending;
    assert.equal(app.run('dualApiConnectionTestResult'), null);
    assert.equal(app.notices.length, 0);
});

test('preamble prefixes only the self-check system message, also in compact retry', () => {
    const app = plugin();
    app.run(`getDualApiCharacterContext = () => 'CHARACTER';
        buildPreviousReviewRequest = () => '';
        selectedRepairDirectives = () => [];
        selectDualApiChat = () => [{ role: 'user', content: 'CHAT' }];
        testSettings = clone(DEFAULT_SETTINGS);
        testSettings.dualApi.preamble = 'CUSTOM PREAMBLE';`);
    for (const compact of [false, true]) {
        const result = JSON.parse(app.run(`JSON.stringify(buildDualApiMessages([], [], [], [], testSettings, { compact: ${compact} }))`));
        assert.equal(result[0].role, 'system');
        assert.ok(result[0].content.startsWith('CUSTOM PREAMBLE\n\n[墨提斯之镜'));
        assert.ok(result[0].content.includes('<stsc_self_check>'));
        assert.equal(JSON.stringify(result).split('CUSTOM PREAMBLE').length, 2);
        assert.equal(result[1].content, 'CHAT');
        assert.equal(result.at(-1).role, 'user');
    }
});

test('save persists request fields while discard restores the saved settings', () => {
    const app = plugin();
    app.run('applyTheme = renderAll = clearRuntimePrompts = () => {}');
    app.event('change', '#stsc_dual_temperature', '.6');
    app.event('change', '#stsc_dual_reasoning_effort', 'low');
    app.event('input', '#stsc_dual_preamble', 'MY SAVED PROMPT');
    app.run('commitEditDraft({ notify: false })');
    assert.equal(app.run('normalizeSettings().dualApi.temperature'), '.6');
    assert.equal(app.run('normalizeSettings().dualApi.reasoningEffort'), 'low');
    assert.equal(app.run('normalizeSettings().dualApi.preamble'), 'MY SAVED PROMPT');
    assert.equal(app.run('normalizeSettings().dualApi.maxTokens'), 8192);
    app.event('input', '#stsc_dual_preamble', 'UNSAVED');
    app.run('discardEditDraft()');
    assert.equal(app.run('editDraft.dualApi.preamble'), 'MY SAVED PROMPT');
});
