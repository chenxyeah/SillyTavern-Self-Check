// Optional contract tests run the INSTALLED ST backend and prompt-converters in a VM.
// No ST server is started, no settings/files are written, and fetch is always mocked.
// PowerShell: $env:ST_SOURCE_ROOT='E:\Sillytavern\SillyTavern-1.12.14'; node --test tests/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { API_PROVIDERS, buildGenerationRequest, buildModelsRequest, extractModelIds, readGenerationText } from '../api-providers.mjs';

const stRoot = process.env.ST_SOURCE_ROOT;
const stripModule = text => text.replace(/^import\s[\s\S]*?;\r?$/gm, '').replace(/^export /gm, '');

function backend(upstream) {
    const routes = {};
    const scope = {
        URL, AbortController, structuredClone, setTimeout, clearTimeout,
        process: { stdout: { columns: 80 } },
        console: { info() {}, debug() {}, warn() {}, error() {} },
        getConfigValue: (_key, fallback) => fallback,
        tryParse: value => { try { return JSON.parse(value); } catch { return undefined; } },
        mergeObjectWithYaml: (obj, value) => { if (value) Object.assign(obj, JSON.parse(value)); },
        excludeKeysByYaml: (obj, value) => { if (value) for (const key of JSON.parse(value)) delete obj[key]; },
        readSecret: () => 'MAIN_API_SECRET_MUST_NOT_LEAK',
        SECRET_KEYS: { CUSTOM: 'custom' }, TEXT_COMPLETION_MODELS: [],
        color: { red: x => x, blue: x => x, yellow: x => x },
        express: { Router: () => ({ post: (route, handler) => { routes[route] = handler; } }) },
        fetch: upstream,
    };
    const context = vm.createContext(scope);
    for (const file of ['constants.js', 'prompt-converters.js', 'endpoints/backends/chat-completions.js']) {
        vm.runInContext(stripModule(readFileSync(join(stRoot, 'src', file), 'utf8')), context, { filename: file });
    }
    return (route, body) => new Promise((resolve, reject) => {
        const request = { body: structuredClone(body), user: { directories: {} }, socket: { removeAllListeners() {}, on() {} } };
        const response = { statusCode: 200, headersSent: false,
            status(value) { this.statusCode = value; return this; },
            send(value) { resolve({ status: this.statusCode, body: value }); },
        };
        Promise.resolve(routes['/' + route](request, response)).catch(reject);
    });
}

for (const [id, provider] of Object.entries(API_PROVIDERS)) {
    test(id + ': installed ST produces correct provider wire request', { skip: !stRoot, timeout: 5000 }, async () => {
        const config = { provider: id, endpoint: provider.endpoint || 'https://custom.example/v1',
            apiKey: 'MOCK_KEY', model: id === 'claude' ? 'claude-3-7-sonnet-latest' : id === 'gemini' ? 'gemini-2.5-flash' : 'text-model', maxTokens: 4096 };
        const messages = [{ role: 'system', content: 'INSTRUCTIONS' }, { role: 'user', content: 'HELLO' },
            { role: 'assistant', content: 'PAST' }, { role: 'user', content: 'QUESTION' }];
        let outgoing;
        const send = backend(async (url, options) => {
            outgoing = { url: String(url), headers: options.headers, body: JSON.parse(options.body) };
            const result = id === 'claude' ? { content: [{ type: 'thinking', thinking: 'PRIVATE' }, { type: 'text', text: 'FINAL' }] }
                : id === 'gemini' ? { candidates: [{ content: { parts: [{ thought: true, text: 'PRIVATE' }, { text: 'FINAL' }] } }] }
                    : { choices: [{ message: { content: 'FINAL', reasoning_content: 'PRIVATE' } }] };
            return new Response(JSON.stringify(result));
        });
        const reply = await send('generate', buildGenerationRequest(config, messages));
        assert.equal(reply.status, 200);
        assert.equal(readGenerationText(reply.body), 'FINAL');
        assert.ok(outgoing);
        assert.ok(!JSON.stringify(outgoing).includes('MAIN_API_SECRET'));
        assert.ok(!JSON.stringify(outgoing).includes('X-CSRF'));
        if (id === 'claude') {
            assert.equal(outgoing.url, 'https://api.anthropic.com/v1/messages');
            assert.equal(outgoing.headers['x-api-key'], 'MOCK_KEY');
            assert.equal(outgoing.headers['anthropic-version'], '2023-06-01');
            assert.ok(JSON.stringify(outgoing.body.system).includes('INSTRUCTIONS'));
            assert.equal(outgoing.body.messages[0].role, 'user');
            assert.equal(outgoing.body.max_tokens, 4096);
        } else if (id === 'gemini') {
            const url = new URL(outgoing.url);
            assert.equal(url.pathname, '/v1beta/models/gemini-2.5-flash:generateContent');
            assert.equal(url.searchParams.get('key'), 'MOCK_KEY'); // ST's native backend owns this convention.
            assert.ok(JSON.stringify(outgoing.body.systemInstruction).includes('INSTRUCTIONS'));
            assert.ok(outgoing.body.contents.some(message => message.role === 'model'));
            assert.equal(outgoing.body.generationConfig.maxOutputTokens, 4096);
        } else {
            assert.equal(outgoing.url, config.endpoint + '/chat/completions');
            assert.equal(outgoing.headers.Authorization, 'Bearer MOCK_KEY');
            assert.equal(outgoing.body[id === 'openai' ? 'max_completion_tokens' : 'max_tokens'], 4096);
            assert.equal(outgoing.body[id === 'openai' ? 'max_tokens' : 'max_completion_tokens'], undefined);
            assert.equal(outgoing.body.temperature, undefined);
        }
        assert.equal(outgoing.body.stream ?? false, false);
    });
    if (!provider.models) continue;
    test(id + ': installed ST model discovery preserves native shape and auth', { skip: !stRoot, timeout: 5000 }, async () => {
        const config = { provider: id, endpoint: provider.endpoint || 'https://custom.example/v1', apiKey: 'MOCK_KEY' };
        const send = backend(async (url, options) => {
            assert.equal(String(url), config.endpoint + (id === 'gemini' ? '/v1beta/models' : '/models'));
            assert.ok(!JSON.stringify(options.headers).includes('MAIN_API_SECRET'));
            if (id === 'gemini') {
                assert.equal(options.headers['x-goog-api-key'], 'MOCK_KEY');
                return new Response(JSON.stringify({ models: [{ name: 'models/gemini-text', supportedGenerationMethods: ['generateContent'] }] }));
            }
            if (id === 'claude') assert.equal(options.headers['x-api-key'], 'MOCK_KEY');
            return new Response(JSON.stringify({ data: [{ id: 'text-model' }] }));
        });
        const reply = await send('status', buildModelsRequest(config));
        assert.deepEqual(extractModelIds(reply.body, config), [id === 'gemini' ? 'gemini-text' : 'text-model']);
    });
}
