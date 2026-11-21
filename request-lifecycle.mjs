// A foreground timeout is not evidence of an idle connection while a mobile
// browser has suspended the page. This protects the existing request, not a
// background worker, keepalive ping or second (potentially billable) request.
export function createGenerationWatchdog({
    controller, timeoutMs, streaming,
    page = globalThis.document, now = () => Date.now(),
    setTimer = globalThis.setTimeout, clearTimer = globalThis.clearTimeout,
    backgroundLimitMs = 10 * 60 * 1000,
}) {
    let idleLeft = timeoutMs;
    let totalLeft = streaming ? timeoutMs * 3 : Infinity;
    let backgroundLeft = backgroundLimitMs;
    let hidden = page?.visibilityState === 'hidden';
    let wasBackgrounded = hidden;
    let last = now(), timer, closed = false, kind = '';

    function account() {
        const current = now();
        const elapsed = Math.max(0, current - last);
        if (hidden) backgroundLeft -= elapsed;
        else { idleLeft -= elapsed; totalLeft -= elapsed; }
        last = current;
    }

    function syncVisibility() {
        const next = page?.visibilityState === 'hidden';
        if (hidden === next) return false;
        account();
        hidden = next;
        wasBackgrounded ||= hidden;
        if (!hidden) {
            // Let queued fetch/read callbacks run before an overdue timer can
            // abort a response already buffered during a frozen background tab.
            const grace = Math.min(timeoutMs, 15000);
            idleLeft = Math.max(idleLeft, grace);
            totalLeft = Math.max(totalLeft, grace);
        }
        return true;
    }

    function schedule() {
        clearTimer(timer);
        if (!closed) timer = setTimer(check, Math.max(0, hidden ? backgroundLeft : Math.min(idleLeft, totalLeft)));
    }

    function check() {
        if (closed) return;
        // The visibility event and an overdue timer can arrive in either order.
        if (syncVisibility()) { schedule(); return; }
        account();
        if (hidden && backgroundLeft <= 0) kind = 'background';
        else if (!hidden && totalLeft <= 0) kind = 'total';
        else if (!hidden && idleLeft <= 0) kind = 'idle';
        if (kind) { dispose(); controller.abort(); }
        else schedule();
    }

    function visibilityChanged() {
        if (closed) return;
        if (!syncVisibility()) account();
        schedule();
    }

    function activity() {
        if (closed) return;
        if (!syncVisibility()) account();
        idleLeft = timeoutMs;
        schedule();
    }

    function dispose() {
        if (closed) return;
        closed = true;
        clearTimer(timer);
        page?.removeEventListener?.('visibilitychange', visibilityChanged);
        page?.removeEventListener?.('resume', visibilityChanged);
    }

    page?.addEventListener?.('visibilitychange', visibilityChanged);
    page?.addEventListener?.('resume', visibilityChanged);
    schedule();
    return { activity, dispose, get kind() { return kind; }, get wasBackgrounded() { return wasBackgrounded; } };
}
