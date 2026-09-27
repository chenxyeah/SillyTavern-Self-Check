import test from 'node:test';
import assert from 'node:assert/strict';
import {
    API_PROVIDERS, providerId, getProvider, normalizeEndpoint, connectionSignature, switchProvider,
    buildGenerationRequest, buildModelsRequest, extractModelIds, extractResponseText,
    providerError, requestProvider, readGenerationText, testConnection, normalizeMaxTokens, requestParameters,
} from '../api-providers.mjs';

const config = (id, extras = {}) => ({ provider: id, endpoint: API_PROVIDERS[id].endpoint || 'https://custom.example/v1',
    apiKey: 'test-only-secret', model: id === 'gemini' ? 'gemini-2.5-flash' : 'text-model',
    maxTokens: 4096, ...extras });
const messages = [{ role: 'system', content: 'SELF CHECK' }, { role: 'user', content: 'QUESTION' }];
const ok = data => new Response(JSON.stringify(data), { status: 200 });

test('legacy settings stay custom without changing endpoint/key/model', () => {
    const old = { endpoint: 'https://custom.example/v9', apiKey: 'old', model: 'private-model' };
    assert.equal(providerId(old.provider), 'custom');
    assert.equal(getProvider(old), API_PROVIDERS.custom);
    const req = buildGenerationRequest(old, messages);
    assert.equal(req.custom_url, old.endpoint);
    assert.equal(JSON.parse(req.custom_include_headers).Authorization, 'Bearer old');
    assert.equal(req.model, old.model);
    assert.equal(providerId('__proto__'), 'custom');
});

for (const [id, provider] of Object.entries(API_PROVIDERS)) {
    test(id + ': nonstream generation uses isolated credentials and preserves config', () => {
        const cfg = config(id);
        const snapshot = structuredClone(cfg);
        const req = buildGenerationRequest(cfg, messages);
        assert.equal(req.stream, false);
        assert.equal(req.model, cfg.model);
        assert.equal(req.temperature, undefined);
        assert.equal(req.top_p, undefined);
        assert.equal(req.messages, messages);
        assert.deepEqual(cfg, snapshot);
        if (provider.protocol === 'openai') {
            assert.equal(req.chat_completion_source, 'custom');
            assert.equal(req.custom_url, cfg.endpoint);
            assert.equal(JSON.parse(req.custom_include_headers).Authorization, 'Bearer test-only-secret');
            assert.deepEqual(JSON.parse(req.custom_include_body), id === 'openai'
                ? { max_completion_tokens: 4096 } : { max_tokens: 4096 });
        } else {
            assert.equal(req.proxy_password, cfg.apiKey);
            assert.equal(req.reverse_proxy, cfg.endpoint);
            assert.equal(req.max_tokens, 4096);
            assert.equal(req.chat_completion_source, id === 'claude' ? 'claude' : 'makersuite');
        }
    });
    test(id + ': model discovery capability is explicit', () => {
        const req = buildModelsRequest(config(id));
        assert.equal(Boolean(req), provider.models);
        if (!req) return;
        const headers = JSON.parse(req.custom_include_headers);
        assert.equal(req.chat_completion_source, 'custom');
        if (id === 'claude') {
            assert.equal(headers['x-api-key'], 'test-only-secret');
            assert.equal(headers['anthropic-version'], '2023-06-01');
            assert.equal(headers.Authorization, '');
            assert.equal(req.custom_url, 'https://api.anthropic.com/v1');
        } else if (id === 'gemini') {
            assert.equal(headers['x-goog-api-key'], 'test-only-secret');
            assert.equal(headers.Authorization, '');
            assert.equal(req.custom_url, 'https://generativelanguage.googleapis.com/v1beta');
        } else assert.equal(headers.Authorization, 'Bearer test-only-secret');
    });
}

for (const [id, input, expected] of [
    ['volcengine', 'https://ark.cn-beijing.volces.com/api/plan/v3/chat/completions', API_PROVIDERS.volcengine.endpoint],
    ['volcengine', 'https://ark.cn-beijing.volces.com/api/coding/v3/', 'https://ark.cn-beijing.volces.com/api/coding/v3'],
    ['qianfan', API_PROVIDERS.qianfan.endpoint + '/chat/completions/', API_PROVIDERS.qianfan.endpoint],
    ['glm', API_PROVIDERS.glm.endpoint + '/chat/completions', API_PROVIDERS.glm.endpoint],
    ['custom', 'http://localhost:8000/custom/path/', 'http://localhost:8000/custom/path'],
    ['custom', 'https://example.org/models/', 'https://example.org'],
    ['deepseek', 'https://api.deepseek.com/v1/', 'https://api.deepseek.com/v1'],
    ['claude', 'https://api.anthropic.com/v1/messages', API_PROVIDERS.claude.endpoint],
    ['claude', 'https://api.anthropic.com/', API_PROVIDERS.claude.endpoint],
    ['gemini', 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', API_PROVIDERS.gemini.endpoint],
    ['gemini', 'https://proxy.example/google/v1beta', 'https://proxy.example/google'],
]) {
    test('endpoint normalization: ' + input, () => assert.equal(normalizeEndpoint(input, id), expected));
}

test('unsafe / ambiguous URLs are rejected, not silently rewritten', () => {
    for (const value of ['', 'nonsense', 'file:///etc/a', 'javascript:alert(1)', 'https://user:pass@example.org',
        'https://example.org/v1?key=secret', 'https://example.org/#key', 'https://example.org/v1/responses']) {
        assert.equal(normalizeEndpoint(value), '');
    }
    assert.equal(normalizeEndpoint('https://example.org/v1', 'gemini'), '');
});

test('switching providers clears old secrets/model but preserves other settings', () => {
    const before = config('deepseek', { timeoutSeconds: 180, previousReview: true });
    const after = switchProvider(before, 'claude');
    assert.equal(after.apiKey, '');
    assert.equal(after.model, '');
    assert.equal(after.endpoint, API_PROVIDERS.claude.endpoint);
    assert.equal(after.timeoutSeconds, 180);
    assert.equal(after.previousReview, true);
    assert.equal(before.apiKey, 'test-only-secret');
    assert.deepEqual(switchProvider(before, 'deepseek'), before);
    assert.notEqual(connectionSignature(before), connectionSignature(after));
});

test('validation handles missing keys/model; local custom endpoints can be keyless', () => {
    assert.throws(() => buildGenerationRequest(config('openai', { apiKey: '' }), messages), /密钥/);
    assert.throws(() => buildGenerationRequest(config('custom', { model: '' }), messages), /模型/);
    assert.throws(() => buildModelsRequest(config('claude', { apiKey: 'a\nb' })), /换行/);
    assert.equal(JSON.parse(buildGenerationRequest(config('custom', { apiKey: '' }), messages).custom_include_headers).Authorization, '');
    assert.equal(buildGenerationRequest(config('gemini', { model: 'models/gemini-2.5-flash' }), messages).model, 'gemini-2.5-flash');
    assert.throws(() => buildGenerationRequest(config('gemini', { model: 'bad?key=x' }), messages), /模型 ID/);
});

test('model IDs are deduplicated; Gemini filters unsupported models without inventing names', () => {
    assert.deepEqual(extractModelIds({ data: [{ id: 'z' }, { id: 'a' }, { id: 'a' }, {}] }), ['a', 'z']);
    assert.deepEqual(extractModelIds({ data: { data: ['one'] } }), ['one']);
    assert.deepEqual(extractModelIds({ models: [
        { name: 'models/gemini-text', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/embedding', supportedGenerationMethods: ['embedContent'] },
    ] }, config('gemini')), ['gemini-text']);
});

test('response parsing uses final text only for all three protocols', () => {
    assert.equal(extractResponseText({ choices: [{ message: { content: ' final ', reasoning_content: 'private' } }] }), 'final');
    assert.equal(extractResponseText({ choices: [{ message: { reasoning_content: 'private' } }] }), '');
    assert.equal(extractResponseText({ content: [{ type: 'thinking', thinking: 'private' }, { type: 'text', text: 'a' }, { type: 'text', text: 'b' }] }), 'a\nb');
    assert.equal(extractResponseText({ candidates: [{ content: { parts: [{ thought: true, text: 'private' }, { text: 'final' }] } }] }), 'final');
    assert.equal(extractResponseText({ content: { arbitrary: 'object' } }), '');
    assert.throws(() => readGenerationText({ choices: [] }), /最终文本/);
    assert.throws(() => readGenerationText({ promptFeedback: { blockReason: 'SAFETY' } }), /未返回可用文本/);
});

test('errors are short and never echo secrets/prompts/provider HTML', async () => {
    const secret = 'arbitrary-secret-not-prefixed';
    for (const status of [400, 401, 403, 404, 429, 500, 502]) {
        const error = providerError(status, { error: { message: 'PRIVATE CHARACTER ' + secret } });
        assert.ok(!error.message.includes(secret));
        assert.ok(!error.message.includes('PRIVATE CHARACTER'));
        assert.ok(error.message.length < 100);
        if ([400, 401, 403, 404].includes(status)) assert.equal(error.transient, false);
    }
    assert.equal(providerError(200, { error: { message: 'Unauthorized' } }).transient, false);
    assert.equal(providerError(200, { error: { message: 'Too Many Requests' } }).transient, true);
    assert.equal(providerError(429, { quota_error: true }).transient, false);
    assert.equal(providerError(500, { error: true }).transient, false);
    await assert.rejects(requestProvider('generate', {}, { fetchImpl: async () => new Response('<html>' + secret, { status: 502 }) }), error => !error.message.includes(secret));
    await assert.rejects(requestProvider('generate', {}, { fetchImpl: async () => { throw new Error(secret); } }), error => !error.message.includes(secret));
});

test('request transport is same-origin and connection probe sends no chat/state', async () => {
    let calls = 0;
    const cfg = config('qianfan', { chat: ['PRIVATE'], questions: ['PRIVATE'], preamble: 'PRIVATE PROMPT', previousReview: true });
    assert.equal(await testConnection(cfg, { headers: { 'X-CSRF-Token': 'LOCAL' }, fetchImpl: async (url, options) => {
        calls++;
        assert.equal(url, '/api/backends/chat-completions/generate');
        assert.equal(options.headers['X-CSRF-Token'], 'LOCAL');
        const req = JSON.parse(options.body);
        assert.deepEqual(req.messages, [{ role: 'user', content: 'Reply with OK only.' }]);
        assert.ok(!options.body.includes('PRIVATE'));
        return ok({ choices: [{ message: { content: 'OK' } }] });
    } }), true);
    assert.equal(calls, 1);
});

test('transport rejects upstream JSON errors, preserves AbortError and supports timeout signal', async () => {
    await assert.rejects(requestProvider('status', {}, { fetchImpl: async () => ok({ error: true }) }));
    await assert.rejects(requestProvider('invalid', {}));
    const controller = new AbortController();
    const pending = requestProvider('status', {}, { signal: controller.signal, fetchImpl: (_url, options) =>
        new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))) });
    controller.abort();
    await assert.rejects(pending, { name: 'AbortError' });
});

test('all providers default to 8192; explicit limits remain unchanged', () => {
    for (const id of Object.keys(API_PROVIDERS)) {
        for (const value of [undefined, null, '', '  ', NaN, Infinity, 'invalid']) {
            const req = buildGenerationRequest(config(id, { maxTokens: value }), messages);
            const body = req.custom_include_body ? JSON.parse(req.custom_include_body) : req;
            assert.equal(body.max_tokens ?? body.max_completion_tokens, 8192);
        }
        assert.equal(normalizeMaxTokens(4096), 4096);
        assert.equal(normalizeMaxTokens(0), 256);
        assert.equal(normalizeMaxTokens(20000), 12000);
    }
});

test('sampling fields preserve zero, omit blank defaults and validate ranges', () => {
    assert.deepEqual(requestParameters({ temperature: '0', topP: '0' }), { temperature: 0, top_p: 0 });
    assert.deepEqual(requestParameters({ temperature: ' ', topP: null, reasoningEffort: '' }), {});
    for (const value of [-1, 3, 'invalid', Infinity]) {
        assert.throws(() => requestParameters({ temperature: value }), /temperature/);
    }
    assert.throws(() => requestParameters({ topP: 1.1 }), /top_p/);
    assert.throws(() => requestParameters({ provider: 'claude', temperature: 1.5 }), /temperature/);
});

test('configured parameters are included, not accidentally excluded by ST custom source', () => {
    const req = buildGenerationRequest(config('openai', { temperature: '0', topP: '.8', reasoningEffort: 'low' }), messages);
    assert.deepEqual(JSON.parse(req.custom_include_body), {
        max_completion_tokens: 4096, temperature: 0, top_p: .8, reasoning_effort: 'low',
    });
    for (const key of ['temperature', 'top_p', 'reasoning_effort']) assert.ok(!JSON.parse(req.custom_exclude_body).includes(key));
    assert.equal(req.reasoning_effort, 'low', 'old ST o-series heuristics read top-level field');
});

test('Gemini explicit thinking opts into Google compatibility only on official endpoint', () => {
    for (const effort of ['low', 'medium', 'high']) {
        const req = buildGenerationRequest(config('gemini', { reasoningEffort: effort }), messages);
        assert.equal(req.custom_url, API_PROVIDERS.gemini.endpoint + '/v1beta/openai');
        assert.equal(req.chat_completion_source, 'custom');
        assert.equal(JSON.parse(req.custom_include_body).reasoning_effort, effort);
        assert.equal(JSON.parse(req.custom_include_headers).Authorization, 'Bearer test-only-secret');
    }
    for (const endpoint of ['https://proxy.example/google', 'https://generativelanguage.googleapis.com.evil.example',
        'http://generativelanguage.googleapis.com', API_PROVIDERS.gemini.endpoint + '/proxy']) {
        assert.throws(() => buildGenerationRequest(config('gemini', { endpoint, reasoningEffort: 'low' }), messages), /原生代理/);
        assert.equal(buildGenerationRequest(config('gemini', { endpoint }), messages).reverse_proxy, endpoint);
    }
    assert.equal(buildGenerationRequest(config('gemini'), messages).chat_completion_source, 'makersuite');
});

test('unsupported thinking fields fail locally and changing provider resets optional fields only', () => {
    for (const id of ['claude', 'glm', 'volcengine', 'qianfan', 'deepseek']) {
        assert.throws(() => buildGenerationRequest(config(id, { reasoningEffort: 'low' }), messages), /思考档位/);
    }
    assert.throws(() => requestParameters({ provider: 'gemini', reasoningEffort: 'minimal' }), /思考档位/);
    const before = config('custom', { temperature: '.5', topP: '.9', reasoningEffort: 'low', preamble: 'CUSTOM PROMPT' });
    const after = switchProvider(before, 'claude');
    assert.equal(after.temperature, '');
    assert.equal(after.topP, '');
    assert.equal(after.reasoningEffort, '');
    assert.equal(after.preamble, before.preamble);
    assert.equal(after.maxTokens, 4096);
});
