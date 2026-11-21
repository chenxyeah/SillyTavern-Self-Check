import test from 'node:test';
import assert from 'node:assert/strict';
import { createGenerationWatchdog } from '../request-lifecycle.mjs';

function fixture({ streaming = true, visible = true, hasPage = true } = {}) {
    let time = 0, next = 0;
    const timers = new Map(), listeners = new Map();
    const page = {
        visibilityState: visible ? 'visible' : 'hidden',
        addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); },
        removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
    };
    const controller = new AbortController();
    const watchdog = createGenerationWatchdog({
        controller, timeoutMs: 60000, streaming, page: hasPage ? page : undefined,
        now: () => time,
        setTimer(fn, delay) { const id = ++next; timers.set(id, { fn, at: time + delay }); return id; },
        clearTimer: id => timers.delete(id),
    });
    const advance = elapsed => {
        const end = time + elapsed;
        for (let steps = 0; ; steps++) {
            assert.ok(steps < 100, 'watchdog must not spin on an overdue timer');
            const entry = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
            if (!entry) break;
            time = Math.max(time, entry[1].at); timers.delete(entry[0]); entry[1].fn();
        }
        time = end;
    };
    return {
        controller, watchdog, page, timers, advance,
        leap: elapsed => { time += elapsed; },
        visible(value, emit = true) {
            page.visibilityState = value ? 'visible' : 'hidden';
            if (emit) for (const fn of listeners.get('visibilitychange') || []) fn();
        },
        listenerCount: () => [...listeners.values()].reduce((n, set) => n + set.size, 0),
    };
}

test('foreground idle timeout and listener cleanup remain effective', () => {
    const f = fixture();
    f.advance(59999); assert.equal(f.controller.signal.aborted, false);
    f.advance(1); assert.equal(f.controller.signal.aborted, true);
    assert.equal(f.watchdog.kind, 'idle');
    assert.equal(f.timers.size, 0); assert.equal(f.listenerCount(), 0);
});

test('foreground heartbeats reset idle but cannot defeat total deadline', () => {
    const f = fixture();
    for (let i = 0; i < 4; i++) { f.advance(40000); f.watchdog.activity(); }
    f.advance(20000);
    assert.equal(f.controller.signal.aborted, true);
    assert.equal(f.watchdog.kind, 'total');
});

test('background time is excluded from both streaming foreground budgets', () => {
    const f = fixture();
    f.advance(40000); f.visible(false); f.advance(240000);
    assert.equal(f.controller.signal.aborted, false);
    f.visible(true); f.advance(19999);
    assert.equal(f.controller.signal.aborted, false);
    f.advance(1); assert.equal(f.watchdog.kind, 'idle');
});

test('nonstreaming request also survives a background interval', () => {
    const f = fixture({ streaming: false });
    f.advance(20000); f.visible(false); f.advance(240000); f.visible(true);
    f.advance(39999); assert.equal(f.controller.signal.aborted, false);
    f.advance(1); assert.equal(f.watchdog.kind, 'idle');
});

test('data can complete in background without waiting for foreground', () => {
    const f = fixture();
    f.visible(false); f.advance(240000); f.watchdog.activity();
    f.watchdog.dispose();
    assert.equal(f.controller.signal.aborted, false);
    assert.equal(f.timers.size, 0); assert.equal(f.listenerCount(), 0);
    f.visible(true); f.advance(900000);
    assert.equal(f.controller.signal.aborted, false);
});

test('returning with little idle budget gives buffered data fifteen seconds', () => {
    const f = fixture();
    f.advance(59000); f.visible(false); f.advance(240000); f.visible(true);
    f.advance(14000); assert.equal(f.controller.signal.aborted, false);
    f.watchdog.activity(); f.advance(59000);
    assert.equal(f.controller.signal.aborted, false);
    f.watchdog.dispose();
});

test('overdue background timer cannot abort before a pending visibility event', () => {
    const f = fixture();
    f.visible(false); f.leap(900000); f.visible(true, false);
    f.advance(0);
    assert.equal(f.controller.signal.aborted, false);
    f.watchdog.activity(); f.watchdog.dispose();
    assert.equal(f.timers.size, 0); assert.equal(f.listenerCount(), 0);
});

test('visibility notification before overdue timer also allows cached result', () => {
    const f = fixture();
    f.visible(false); f.leap(900000); f.visible(true);
    f.advance(0); f.watchdog.dispose();
    assert.equal(f.controller.signal.aborted, false);
    assert.equal(f.timers.size, 0);
});

test('background protection has a cumulative ten minute limit, even with data', () => {
    const f = fixture();
    f.visible(false); f.advance(300000); f.watchdog.activity();
    f.visible(true); f.advance(1000); f.visible(false); f.advance(299999);
    assert.equal(f.controller.signal.aborted, false);
    f.advance(1); assert.equal(f.watchdog.kind, 'background');
    assert.equal(f.controller.signal.aborted, true);
    assert.equal(f.listenerCount(), 0);
});

test('request initially hidden receives background protection immediately', () => {
    const f = fixture({ visible: false });
    f.advance(180000); assert.equal(f.controller.signal.aborted, false);
    assert.equal(f.watchdog.wasBackgrounded, true);
    f.visible(true); f.advance(59999); assert.equal(f.controller.signal.aborted, false);
    f.watchdog.dispose();
});

test('environment without visibility API keeps normal timeout behavior', () => {
    const f = fixture({ hasPage: false, streaming: false });
    f.advance(60000); assert.equal(f.watchdog.kind, 'idle');
    assert.equal(f.controller.signal.aborted, true);
});

test('dispose is idempotent and late callbacks cannot rearm it', () => {
    const f = fixture();
    f.watchdog.dispose(); f.watchdog.dispose(); f.watchdog.activity(); f.visible(false);
    f.advance(900000);
    assert.equal(f.controller.signal.aborted, false);
    assert.equal(f.timers.size, 0); assert.equal(f.listenerCount(), 0);
});
