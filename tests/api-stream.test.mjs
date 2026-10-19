import test from 'node:test';
import assert from 'node:assert/strict';
import { API_PROVIDERS, buildGenerationRequest, requestProvider, readGenerationText, testConnection } from '../api-providers.mjs';

const encoder = new TextEncoder();
const event = payload => 'data: ' + JSON.stringify(payload) + '\n\n';
function response(text, { step = 31, headers = { 'Content-Type': 'text/event-stream' } } = {}) {
    const bytes = encoder.encode(text);
    let offset = 0;
    return new Response(new ReadableStream({ pull(controller) {
        if (offset === bytes.length) return controller.close();
        controller.enqueue(bytes.slice(offset, offset += Math.min(step, bytes.length - offset)));
    } }), { headers });
}
const generate = async (res, options = {}) => readGenerationText(await requestProvider('generate', { stream: true }, { fetchImpl: async () => res, ...options }));
const chunk = (content, finish_reason = null, extras = {}) => ({ choices: [{ index: 0, delta: { content, ...extras }, finish_reason }] });

for (const [id, provider] of Object.entries(API_PROVIDERS)) {
    test(id + ': stream option reaches the provider request without changing credentials', () => {
        const config = { provider: id, endpoint: provider.endpoint || 'https://custom.example/v1', apiKey: 'DUMMY', model: 'text-model', stream: true };
        const request = buildGenerationRequest(config, []);
        assert.equal(request.stream, true);
        assert.equal(buildGenerationRequest({ ...config, stream: false }, []).stream, false);
        assert.equal(config.apiKey, 'DUMMY');
    });
}

test('OpenAI SSE preserves whitespace and split UTF-8, ignores thinking and other choices', async () => {
    let ticks = 0;
    const text = '\uFEFF: heartbeat\r\n\r\n' +
        event({ choices: [{ index: 1, delta: { content: 'OTHER_CHOICE' } }] }) +
        event(chunk('', null, { reasoning_content: 'PRIVATE_THOUGHT' })) +
        event(chunk('你好 ')) + event(chunk('世界\n')) + event(chunk('完成', 'stop'));
    assert.equal(await generate(response(text, { step: 1 }), { onActivity: () => ticks++ }), '你好 世界\n完成');
    assert.ok(ticks > 50);
});

test('legacy ST without SSE content type is sniffed; CR-only and multiline data fields work', async () => {
    const data = 'event: custom\rdata: {"choices": [\rdata: {"index":0,"delta":{"content":"A B"},"finish_reason":null}]}\r\rdata: [DONE]\r\r';
    assert.equal(await generate(response(data, { step: 1, headers: {} })), 'A B');
});

test('Gemini native stream accumulates final text only and recognizes finishReason', async () => {
    const text = event({ candidates: [{ index: 0, content: { parts: [{ thought: true, text: 'PRIVATE' }, { text: '正文 ' }] } }] }) +
        event({ candidates: [{ index: 0, content: { parts: [{ text: '结束' }] }, finishReason: 'STOP' }] });
    assert.equal(await generate(response(text)), '正文 结束');
});

test('Claude stream handles text starts/deltas, ping/signature/thinking and message_stop', async () => {
    const text = event({ type: 'message_start', message: { content: [] } }) +
        event({ type: 'content_block_start', content_block: { type: 'thinking', thinking: 'PRIVATE' } }) +
        event({ type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'PRIVATE' } }) +
        event({ type: 'content_block_delta', delta: { type: 'signature_delta', signature: 'PRIVATE' } }) +
        event({ type: 'content_block_start', content_block: { type: 'text', text: '正文 ' } }) +
        event({ type: 'ping' }) + event({ type: 'future_event', text: 'UNKNOWN' }) +
        event({ type: 'content_block_delta', delta: { type: 'text_delta', text: '完成' } }) +
        event({ type: 'message_delta', delta: { stop_reason: 'end_turn' } }) + event({ type: 'message_stop' });
    assert.equal(await generate(response(text)), '正文 完成');
});

test('providers ignoring stream:true can return ordinary JSON', async () => {
    const text = JSON.stringify({ choices: [{ message: { content: 'FINAL' } }] });
    assert.equal(await generate(response(text, { step: 3, headers: { 'Content-Type': 'application/json' } })), 'FINAL');
});

test('finish packet without trailing blank line is accepted at EOF', async () => {
    assert.equal(await generate(response('data: ' + JSON.stringify(chunk('FINAL', 'stop')))), 'FINAL');
});

test('a complete-looking XML answer without a stream terminator is rejected', async () => {
    const xml = '<stsc_self_check><item id="q1"><answer>结论</answer></item></stsc_self_check>';
    await assert.rejects(generate(response(event(chunk(xml)))), error => error.code === 'stream_incomplete' && error.transient);
});

test('empty and reasoning-only completed streams never become answers', async () => {
    await assert.rejects(generate(response(event(chunk('', 'stop', { reasoning_content: 'PRIVATE' })))), error => error.code === 'empty');
    await assert.rejects(generate(response('data: [DONE]\n\n')), error => error.code === 'empty');
});

test('midstream errors discard accumulated text and never echo private upstream details', async () => {
    const text = event(chunk('PARTIAL')) + event({ type: 'error', error: { type: 'authentication_error', message: 'Unauthorized PRIVATE_KEY' } });
    await assert.rejects(generate(response(text)), error => error.code === 'auth' && !error.message.includes('PRIVATE') && !error.message.includes('PARTIAL'));
    const busy = event({ type: 'error', error: { type: 'overloaded_error', message: 'Overloaded PRIVATE' } });
    await assert.rejects(generate(response(busy)), error => error.code === 'rate_limit' && error.transient && !error.message.includes('PRIVATE'));
});

test('safety and output-limit events are distinguished from authentication and partial success', async () => {
    for (const reason of ['SAFETY', 'RECITATION', 'content_filter', 'PROHIBITED_CONTENT']) {
        await assert.rejects(generate(response(event(chunk('PARTIAL', reason)))), error => error.code === 'content_blocked' && !error.transient);
    }
    for (const reason of ['MAX_TOKENS', 'max_tokens', 'length']) {
        await assert.rejects(generate(response(event({ candidates: [{ content: { parts: [{ text: 'PARTIAL' }] }, finishReason: reason }] }))), error => error.code === 'output_limit');
    }
    await assert.rejects(generate(response(event({ promptFeedback: { blockReason: 'OTHER' } }))), error => error.code === 'content_blocked');
});

test('malformed or oversized streams fail safely instead of echoing input', async () => {
    await assert.rejects(generate(response('data: {PRIVATE_KEY broken}\n\n')), error => error.code === 'stream_format' && !error.message.includes('PRIVATE'));
    await assert.rejects(generate(response('data: ' + 'x'.repeat(2 * 1024 * 1024), { step: 3 * 1024 * 1024 })), error => error.code === 'stream_format');
});

test('abort cancels an in-flight stream without waiting for its body to close', async () => {
    let cancelled = false;
    const controller = new AbortController();
    const res = new Response(new ReadableStream({ start(c) { c.enqueue(encoder.encode(event(chunk('PARTIAL')))); }, cancel() { cancelled = true; } }));
    const pending = generate(res, { signal: controller.signal });
    const check = assert.rejects(pending, error => error.name === 'AbortError');
    setTimeout(() => controller.abort(), 5);
    await check;
    assert.equal(cancelled, true);
});

test('connection probe remains nonstreaming even when saved config enables streaming', async () => {
    const config = { provider: 'custom', endpoint: 'https://custom.example/v1', apiKey: 'DUMMY', model: 'text-model', stream: true };
    await testConnection(config, { fetchImpl: async (_url, options) => {
        const body = JSON.parse(options.body);
        assert.equal(body.stream, false);
        assert.deepEqual(body.messages, [{ role: 'user', content: 'Reply with OK only.' }]);
        return new Response(JSON.stringify({ choices: [{ message: { content: 'OK' } }] }));
    } });
    assert.equal(config.stream, true);
});

test('unsupported-stream errors give a specific switch-off hint without retrying or exposing details', async () => {
    await assert.rejects(generate(new Response(JSON.stringify({error:{message:'Unsupported parameter: stream PRIVATE_KEY'}}), {status:400})),
        error => error.code === 'stream_unsupported' && !error.transient && error.message.includes('关闭') && !error.message.includes('PRIVATE'));
});
