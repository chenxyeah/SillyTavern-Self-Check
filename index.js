const STSC_MODULE = 'sillytavern_self_check';
const STSC_FOLDER = 'third-party/SillyTavern-Self-Check';
const STSC_CHAT_META_KEY = 'sillytavern_self_check_latest';
const STSC_VERSION = '0.1.9';
const STSC_CHECK_TAG = 'stsc_self_check';
const STSC_RESPONSE_TAG = 'stsc_response';
const STSC_CHECK_OPEN_RE = /<stsc_self_check\b[^>]*>/i;
const STSC_CHECK_CLOSE_RE = /<\/stsc_self_check>/i;
const STSC_RESPONSE_OPEN_RE = /<stsc_response\b[^>]*>/i;
const STSC_RESPONSE_CLOSE_RE = /<\/stsc_response>/i;

const POSITION_MAP = Object.freeze({
    prompt: 0,
    chat: 1,
    before: 2,
});

const ROLE_MAP = Object.freeze({
    system: 0,
    user: 1,
    assistant: 2,
});

const DEFAULT_SETTINGS = Object.freeze({
    enabled: true,
    mode: 'single',
    generalEnabled: true,
    characterEnabled: true,
    generalPresetId: '',
    characterBindings: {},
    injection: {
        position: 'before',
        depth: 0,
        role: 'system',
    },
    presets: [],
    references: [],
    temporaryInstructions: [],
    pendingInstructionIds: [],
    appearance: {
        theme: 'default',
        floatingEnabled: false,
        floatingPosition: {
            leftRatio: 0.82,
            topRatio: 0.68,
        },
    },
    ui: {
        editingPresetId: '',
        editingGeneralPresetId: '',
        editingCharacterPresetId: '',
        presetSection: 'general',
        activeTab: 'status',
    },
});

let pendingRun = null;
let strictBusy = false;
let testBusy = false;
let lastTestResult = '';
let internalQuietActive = false;
let runtimePromptKeys = new Set();
let initialized = false;
let bulkDraft = null;
let editDraft = null;
let editDirty = false;
let pendingUnsavedAction = null;
let floatingDragState = null;
let suppressFloatingClickUntil = 0;

function ctx() {
    return globalThis.SillyTavern?.getContext?.();
}

function uid(prefix = 'id') {
    const value = globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    return `${prefix}_${value}`;
}

function clone(value) {
    return structuredClone(value);
}

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function escapeXml(value) {
    return escapeHtml(value);
}

function normalizeSettings() {
    const context = ctx();
    if (!context) return null;

    const all = context.extensionSettings;
    if (!all[STSC_MODULE]) {
        all[STSC_MODULE] = clone(DEFAULT_SETTINGS);
    }

    const settings = all[STSC_MODULE];
    mergeDefaults(settings, DEFAULT_SETTINGS);

    if (!Array.isArray(settings.presets)) settings.presets = [];
    if (!Array.isArray(settings.references)) settings.references = [];
    if (!Array.isArray(settings.temporaryInstructions)) settings.temporaryInstructions = [];
    if (!Array.isArray(settings.pendingInstructionIds)) settings.pendingInstructionIds = [];
    if (!settings.characterBindings || typeof settings.characterBindings !== 'object') settings.characterBindings = {};
    if (!settings.appearance || typeof settings.appearance !== 'object') settings.appearance = clone(DEFAULT_SETTINGS.appearance);
    settings.appearance.theme = ['default', 'rose', 'blue', 'mint', 'violet', 'gold'].includes(settings.appearance.theme) ? settings.appearance.theme : 'default';
    settings.appearance.floatingEnabled = Boolean(settings.appearance.floatingEnabled);
    if (!settings.appearance.floatingPosition || typeof settings.appearance.floatingPosition !== 'object') {
        settings.appearance.floatingPosition = clone(DEFAULT_SETTINGS.appearance.floatingPosition);
    }
    // 兼容 v0.1.4 以前“只贴左右边缘”的位置格式，迁移成全屏自由坐标。
    if (settings.appearance.floatingPosition.leftRatio === undefined) {
        settings.appearance.floatingPosition.leftRatio = settings.appearance.floatingPosition.side === 'left' ? 0.04 : 0.82;
    }
    settings.appearance.floatingPosition.leftRatio = clampNumber(settings.appearance.floatingPosition.leftRatio, 0, 1, 0.82);
    settings.appearance.floatingPosition.topRatio = clampNumber(settings.appearance.floatingPosition.topRatio, 0, 1, 0.68);
    delete settings.appearance.floatingPosition.side;

    if (settings.presets.length === 0) {
        const general = createPreset('默认（初始默认）', 'general');
        general.questions.push(
            createQuestion('当前角色与{{user}}处于什么关系阶段？本轮应当如何表现？', 'open', 'standard', true),
            createQuestion('本轮是否出现了缺少剧情或设定依据的好感、亲密或占有欲？', 'boolean', 'brief', true),
            createQuestion('本轮是否尊重{{user}}的行动、语言和心理自主权？', 'boolean', 'brief', true),
        );
        settings.presets.push(general);
        settings.generalPresetId = general.id;
    }

    const legacyGeneralId = settings.generalPresetId || settings.presets[0]?.id || '';
    const legacyCharacterPresetIds = new Set(Object.values(settings.characterBindings));
    for (const preset of settings.presets) {
        if (!preset.kind) {
            preset.kind = preset.id !== legacyGeneralId && legacyCharacterPresetIds.has(preset.id) ? 'character' : 'general';
        }
        normalizePreset(preset);
    }

    let generalPresets = settings.presets.filter(x => x.kind === 'general');
    if (!generalPresets.length) {
        const general = createPreset('默认（初始默认）', 'general');
        settings.presets.unshift(general);
        generalPresets = [general];
    }

    if (!settings.generalPresetId || !generalPresets.some(x => x.id === settings.generalPresetId)) {
        settings.generalPresetId = generalPresets[0].id;
    }

    // 兼容旧版本的“角色 -> 预设”绑定表，并迁移到角色预设本身。
    for (const [characterKey, presetId] of Object.entries(settings.characterBindings)) {
        const preset = settings.presets.find(x => x.id === presetId);
        if (!preset || preset.kind === 'general' || preset.boundCharacterKey) continue;
        preset.kind = 'character';
        preset.boundCharacterKey = characterKey;
        preset.boundCharacterName = findCharacterEntity(characterKey)?.name || preset.boundCharacterName || '原绑定角色';
    }
    settings.characterBindings = {};

    const initialGeneral = settings.presets.find(x => x.id === settings.generalPresetId && x.kind === 'general');
    if (initialGeneral?.name === '通用自检预设') initialGeneral.name = '默认（初始默认）';

    settings.ui.presetSection = settings.ui.presetSection === 'character' ? 'character' : 'general';
    const oldEditing = settings.presets.find(x => x.id === settings.ui.editingPresetId);
    if (!settings.ui.editingGeneralPresetId && oldEditing?.kind === 'general') settings.ui.editingGeneralPresetId = oldEditing.id;
    if (!settings.ui.editingCharacterPresetId && oldEditing?.kind === 'character') settings.ui.editingCharacterPresetId = oldEditing.id;

    if (!generalPresets.some(x => x.id === settings.ui.editingGeneralPresetId)) {
        settings.ui.editingGeneralPresetId = settings.generalPresetId;
    }
    const characterPresets = settings.presets.filter(x => x.kind === 'character');
    if (!characterPresets.some(x => x.id === settings.ui.editingCharacterPresetId)) {
        settings.ui.editingCharacterPresetId = characterPresets[0]?.id || '';
    }

    for (const reference of settings.references) normalizeReference(reference);
    for (const instruction of settings.temporaryInstructions) normalizeTemporaryInstruction(instruction);

    return settings;
}

function mergeDefaults(target, defaults) {
    for (const [key, value] of Object.entries(defaults)) {
        if (!Object.hasOwn(target, key)) {
            target[key] = clone(value);
        } else if (value && typeof value === 'object' && !Array.isArray(value) && target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])) {
            mergeDefaults(target[key], value);
        }
    }
}

function createPreset(name = '新自检预设', kind = 'general') {
    return {
        id: uid('preset'),
        name,
        kind: kind === 'character' ? 'character' : 'general',
        enabled: true,
        questions: [],
        boundCharacterKey: '',
        boundCharacterName: '',
    };
}

function normalizePreset(preset) {
    preset.id ||= uid('preset');
    preset.name ||= '未命名预设';
    preset.kind = preset.kind === 'character' ? 'character' : 'general';
    if (preset.enabled === undefined) preset.enabled = true;
    if (!Array.isArray(preset.questions)) preset.questions = [];
    preset.boundCharacterKey ||= '';
    preset.boundCharacterName ||= '';
    if (preset.kind === 'general') {
        preset.boundCharacterKey = '';
        preset.boundCharacterName = '';
    }
    for (const question of preset.questions) normalizeQuestion(question);
}

function createQuestion(text = '', type = 'open', length = 'standard', requireEvidence = true) {
    return {
        id: uid('q'),
        text,
        type,
        length,
        requireEvidence,
        enabled: true,
    };
}

function normalizeQuestion(question) {
    question.id ||= uid('q');
    question.text ||= '';
    question.type = ['open', 'boolean'].includes(question.type) ? question.type : 'open';
    question.length = ['brief', 'standard', 'detailed'].includes(question.length) ? question.length : 'standard';
    if (question.requireEvidence === undefined) question.requireEvidence = true;
    if (question.enabled === undefined) question.enabled = true;
}

function createReference() {
    return {
        id: uid('ref'),
        name: '新参考资料',
        content: '',
        enabled: true,
        scope: 'global',
        characterKey: '',
        position: 'before',
        depth: 0,
        role: 'system',
        addToCheck: false,
        autoQuestion: '请结合当前剧情与设定，说明本轮是否遵守了【{{name}}】；若存在风险，具体应如何调整？',
    };
}

function normalizeReference(reference) {
    const defaults = createReference();
    for (const [key, value] of Object.entries(defaults)) {
        if (!Object.hasOwn(reference, key)) reference[key] = value;
    }
    reference.position = ['before', 'prompt', 'chat'].includes(reference.position) ? reference.position : 'before';
    reference.role = ['system', 'user', 'assistant'].includes(reference.role) ? reference.role : 'system';
    reference.depth = clampNumber(reference.depth, 0, 20, 0);
}

function createTemporaryInstruction() {
    return {
        id: uid('temp'),
        name: '新临时指令',
        content: '',
    };
}

function normalizeTemporaryInstruction(instruction) {
    instruction.id ||= uid('temp');
    instruction.name ||= '未命名临时指令';
    instruction.content ||= '';
}

function clampNumber(value, min, max, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(max, Math.max(min, number));
}

function saveSettings() {
    ctx()?.saveSettingsDebounced?.();
}

function getUiSettings() {
    return editDraft || normalizeSettings();
}

function beginEditSession() {
    editDraft = clone(normalizeSettings());
    editDirty = false;
    pendingUnsavedAction = null;
    updateSaveState();
}

function markDirty() {
    if (!editDraft) editDraft = clone(normalizeSettings());
    editDirty = true;
    updateSaveState();
}

function commitEditDraft({ notify = true } = {}) {
    if (!editDraft) return;
    const context = ctx();
    if (!context?.extensionSettings) return;
    context.extensionSettings[STSC_MODULE] = clone(editDraft);
    normalizeSettings();
    saveSettings();
    editDraft = clone(context.extensionSettings[STSC_MODULE]);
    editDirty = false;
    applyTheme(editDraft);
    renderAll();
    if (notify) toastr.success('更改已保存。', '写作前置自检');
}

function discardEditDraft({ notify = false } = {}) {
    editDraft = clone(normalizeSettings());
    editDirty = false;
    applyTheme(editDraft);
    renderAll();
    if (notify) toastr.info('已放弃未保存的更改。', '写作前置自检');
}

function updateSaveState() {
    const $button = $('#stsc_save_changes');
    const $state = $('#stsc_save_state');
    if (!$button.length) return;
    $button.prop('disabled', !editDirty).toggleClass('stsc-save-dirty', editDirty);
    $state.text(editDirty ? '有未保存的更改' : '已保存').toggleClass('stsc-unsaved', editDirty);
}

function runPendingUnsavedAction() {
    const action = pendingUnsavedAction;
    pendingUnsavedAction = null;
    if (typeof action === 'function') action();
}

function requestUnsavedDecision(action) {
    if (!editDirty) {
        action?.();
        return;
    }
    pendingUnsavedAction = action;
    openDialog(
        '当前内容尚未保存',
        '<div class="stsc-unsaved-message">你刚刚修改的内容还没有保存。请选择保存、放弃更改，或继续留在当前页面。</div>',
        '<button class="menu_button" type="button" data-dialog-action="unsaved-cancel">继续编辑</button>' +
        '<button class="menu_button stsc-danger-button" type="button" data-dialog-action="unsaved-discard">放弃更改</button>' +
        '<button class="menu_button stsc-primary-button" type="button" data-dialog-action="unsaved-save">保存并继续</button>'
    );
}

function applyTheme(settings = getUiSettings()) {
    const theme = settings?.appearance?.theme || 'default';
    $('#stsc_manager_overlay, #stsc_dialog_overlay, #stsc_floating_root, #stsc_floating_panel').attr('data-stsc-theme', theme);
}

function visibleRect(selector) {
    const element = document.querySelector(selector);
    if (!element) return null;
    const style = getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden') return null;
    const rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return rect;
}

function floatingViewportMetrics() {
    const button = document.getElementById('stsc_floating_button');
    const size = Math.max(46, button?.getBoundingClientRect?.().width || 50);
    const compact = window.matchMedia?.('(max-width: 700px)')?.matches;
    const margin = compact ? 8 : 14;
    const viewportHeight = window.visualViewport?.height || window.innerHeight || document.documentElement.clientHeight || 800;
    const viewportWidth = window.visualViewport?.width || window.innerWidth || document.documentElement.clientWidth || 1200;

    // 尽量避开 SillyTavern 顶部菜单；找不到时使用安全预留值。
    const topSelectors = ['#top-bar', '#top-settings-holder', '.top-bar', '#sheld'];
    let topSafe = compact ? 52 : 44;
    for (const selector of topSelectors) {
        const rect = visibleRect(selector);
        if (rect && rect.top <= 8 && rect.bottom < viewportHeight * 0.35) {
            topSafe = Math.max(topSafe, rect.bottom + margin);
        }
    }

    // 尽量避开输入框和底部操作栏；找不到时使用安全预留值。
    const bottomSelectors = ['#send_form', '#form_sheld', '#send_textarea', '.send_form'];
    let bottomSafe = compact ? 94 : 76;
    for (const selector of bottomSelectors) {
        const rect = visibleRect(selector);
        if (rect && rect.top > viewportHeight * 0.45 && rect.top < viewportHeight) {
            bottomSafe = Math.max(bottomSafe, viewportHeight - rect.top + margin);
        }
    }

    const minLeft = margin;
    const maxLeft = Math.max(minLeft, viewportWidth - size - margin);
    const minTop = Math.min(Math.max(margin, topSafe), Math.max(margin, viewportHeight - size - margin));
    const maxTop = Math.max(minTop, viewportHeight - size - bottomSafe);
    return { size, margin, viewportHeight, viewportWidth, minLeft, maxLeft, minTop, maxTop, topSafe, bottomSafe };
}

function applyFloatingPosition(settings = getUiSettings()) {
    const root = document.getElementById('stsc_floating_root');
    if (!root) return;
    const position = settings?.appearance?.floatingPosition || DEFAULT_SETTINGS.appearance.floatingPosition;
    const { minLeft, maxLeft, minTop, maxTop, viewportWidth, viewportHeight, topSafe, bottomSafe } = floatingViewportMetrics();
    const leftRatio = clampNumber(position.leftRatio, 0, 1, 0.82);
    const topRatio = clampNumber(position.topRatio, 0, 1, 0.68);
    const left = minLeft + (maxLeft - minLeft) * leftRatio;
    const top = minTop + (maxTop - minTop) * topRatio;

    root.style.setProperty('--stsc-safe-top', `${Math.round(topSafe)}px`);
    root.style.setProperty('--stsc-safe-bottom', `${Math.round(bottomSafe)}px`);
    root.style.left = `${Math.round(left)}px`;
    root.style.right = 'auto';
    root.style.top = `${Math.round(top)}px`;
    root.style.bottom = 'auto';
    root.dataset.horizontal = left + 25 > viewportWidth / 2 ? 'right' : 'left';
    root.dataset.vertical = top + 25 > viewportHeight / 2 ? 'bottom' : 'top';
}

function persistFloatingPosition(left, top) {
    const actual = normalizeSettings();
    if (!actual) return;
    const { minLeft, maxLeft, minTop, maxTop } = floatingViewportMetrics();
    const safeLeft = clampNumber(left, minLeft, maxLeft, minLeft);
    const safeTop = clampNumber(top, minTop, maxTop, minTop);
    const next = {
        leftRatio: clampNumber((safeLeft - minLeft) / Math.max(1, maxLeft - minLeft), 0, 1, 0.82),
        topRatio: clampNumber((safeTop - minTop) / Math.max(1, maxTop - minTop), 0, 1, 0.68),
    };
    actual.appearance.floatingPosition = next;
    if (editDraft?.appearance) editDraft.appearance.floatingPosition = clone(next);
    saveSettings();
    applyFloatingPosition(editDraft || actual);
}

function floatingVisualViewport() {
    const visual = window.visualViewport;
    const left = Number.isFinite(visual?.offsetLeft) ? visual.offsetLeft : 0;
    const top = Number.isFinite(visual?.offsetTop) ? visual.offsetTop : 0;
    const width = Math.max(240, visual?.width || window.innerWidth || document.documentElement.clientWidth || 390);
    const height = Math.max(260, visual?.height || window.innerHeight || document.documentElement.clientHeight || 700);
    return { left, top, width, height, right: left + width, bottom: top + height };
}

function floatingPanelBoundaries(viewport) {
    const compact = window.matchMedia?.('(max-width: 720px)')?.matches || (window.matchMedia?.('(pointer: coarse)')?.matches && viewport.width < 900);
    const margin = compact ? 8 : 14;
    let topBoundary = viewport.top + margin;
    let bottomBoundary = viewport.bottom - margin;

    const topSelectors = ['#top-bar', '#top-settings-holder', '.top-bar', '#sheld'];
    for (const selector of topSelectors) {
        const rect = visibleRect(selector);
        if (!rect) continue;
        const height = Math.max(0, Math.min(rect.bottom, viewport.bottom) - Math.max(rect.top, viewport.top));
        const startsAtTop = rect.top <= viewport.top + 36;
        const plausibleBar = height >= 24 && height <= Math.min(140, viewport.height * 0.26);
        if (startsAtTop && plausibleBar) topBoundary = Math.max(topBoundary, Math.min(rect.bottom + margin, viewport.top + 140));
    }

    const bottomSelectors = ['#send_form', '#form_sheld', '#send_textarea', '.send_form'];
    for (const selector of bottomSelectors) {
        const rect = visibleRect(selector);
        if (!rect) continue;
        const intersectsBottom = rect.bottom >= viewport.bottom - 48 && rect.top < viewport.bottom;
        const plausibleInput = rect.height >= 34 && rect.height <= Math.min(260, viewport.height * 0.38);
        if (intersectsBottom && plausibleInput) bottomBoundary = Math.min(bottomBoundary, rect.top - margin);
    }

    // 某些移动浏览器会让顶部/底部检测值互相挤压。空间不足时直接回退到视觉视口，绝不让面板塌成一条线。
    const minimumPanelHeight = Math.min(300, Math.max(220, viewport.height - margin * 2));
    if (bottomBoundary - topBoundary < minimumPanelHeight) {
        topBoundary = viewport.top + margin;
        bottomBoundary = viewport.bottom - margin;
    }

    return { compact, margin, topBoundary, bottomBoundary };
}

function setImportantStyle(element, property, value) {
    element?.style?.setProperty?.(property, value, 'important');
}

function layoutFloatingPanel() {
    const panel = document.getElementById('stsc_floating_panel');
    if (!panel || panel.classList.contains('stsc-hidden')) return;

    const viewport = floatingVisualViewport();
    const { compact, margin, topBoundary, bottomBoundary } = floatingPanelBoundaries(viewport);
    setImportantStyle(panel, 'position', 'fixed');
    setImportantStyle(panel, 'right', 'auto');
    setImportantStyle(panel, 'bottom', 'auto');
    setImportantStyle(panel, 'transform', 'none');
    setImportantStyle(panel, 'box-sizing', 'border-box');
    setImportantStyle(panel, 'display', 'flex');

    if (compact) {
        const width = Math.max(240, viewport.width - margin * 2);
        const height = Math.max(220, bottomBoundary - topBoundary);
        setImportantStyle(panel, 'left', `${Math.round(viewport.left + margin)}px`);
        setImportantStyle(panel, 'top', `${Math.round(topBoundary)}px`);
        setImportantStyle(panel, 'width', `${Math.round(width)}px`);
        setImportantStyle(panel, 'height', `${Math.round(Math.min(height, viewport.height - margin * 2))}px`);
        setImportantStyle(panel, 'max-width', 'none');
        setImportantStyle(panel, 'max-height', 'none');
        panel.dataset.layout = 'mobile';
        return;
    }

    const button = document.getElementById('stsc_floating_button');
    const buttonRect = button?.getBoundingClientRect?.() || { left: viewport.right - 64, right: viewport.right - 14, top: viewport.top + 90, bottom: viewport.top + 140 };
    const width = Math.min(420, viewport.width - margin * 2);
    const height = Math.min(640, Math.max(300, viewport.height * 0.72), viewport.height - margin * 2);
    const openLeft = buttonRect.left + buttonRect.width / 2 < viewport.left + viewport.width / 2;
    const openDown = buttonRect.top + buttonRect.height / 2 < viewport.top + viewport.height / 2;
    const desiredLeft = openLeft ? buttonRect.left : buttonRect.right - width;
    const desiredTop = openDown ? buttonRect.bottom + 10 : buttonRect.top - height - 10;
    const left = clampNumber(desiredLeft, viewport.left + margin, viewport.right - width - margin, viewport.left + margin);
    const top = clampNumber(desiredTop, viewport.top + margin, viewport.bottom - height - margin, viewport.top + margin);

    setImportantStyle(panel, 'left', `${Math.round(left)}px`);
    setImportantStyle(panel, 'top', `${Math.round(top)}px`);
    setImportantStyle(panel, 'width', `${Math.round(width)}px`);
    setImportantStyle(panel, 'height', `${Math.round(height)}px`);
    setImportantStyle(panel, 'max-width', 'none');
    setImportantStyle(panel, 'max-height', 'none');
    panel.dataset.layout = 'desktop';
}

function toggleFloatingPanel(forceOpen = null) {
    const panel = document.getElementById('stsc_floating_panel');
    if (!panel) return;
    const $panel = $(panel);
    const shouldOpen = forceOpen === null ? $panel.hasClass('stsc-hidden') : Boolean(forceOpen);

    if (!shouldOpen) {
        // layoutFloatingPanel 会写入 inline display:flex!important。关闭时必须先移除，
        // 否则移动端的 .stsc-hidden 无法覆盖内联 important，表现为关闭按钮失效。
        panel.style.removeProperty('display');
        $panel.addClass('stsc-hidden').attr('aria-hidden', 'true');
        return;
    }

    $panel.removeClass('stsc-hidden').attr('aria-hidden', 'false');
    renderFloating();
    requestAnimationFrame(() => {
        layoutFloatingPanel();
        panel.focus?.({ preventScroll: true });
    });
    setTimeout(layoutFloatingPanel, 80);
}

function beginFloatingDrag(event) {
    if (event.button !== undefined && event.button !== 0) return;
    const root = document.getElementById('stsc_floating_root');
    const button = document.getElementById('stsc_floating_button');
    if (!root || !button) return;
    const rect = root.getBoundingClientRect();
    floatingDragState = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startLeft: rect.left,
        startTop: rect.top,
        moved: false,
    };
    button.setPointerCapture?.(event.pointerId);
    root.classList.add('stsc-floating-dragging');
}

function moveFloatingDrag(event) {
    const state = floatingDragState;
    const root = document.getElementById('stsc_floating_root');
    if (!state || !root || (state.pointerId !== undefined && event.pointerId !== state.pointerId)) return;
    const { minLeft, maxLeft, minTop, maxTop } = floatingViewportMetrics();
    const dx = event.clientX - state.startX;
    const dy = event.clientY - state.startY;
    if (!state.moved && Math.hypot(dx, dy) > 6) {
        state.moved = true;
        toggleFloatingPanel(false);
    }
    if (!state.moved) return;

    const left = clampNumber(state.startLeft + dx, minLeft, maxLeft, minLeft);
    const top = clampNumber(state.startTop + dy, minTop, maxTop, minTop);
    root.style.left = `${Math.round(left)}px`;
    root.style.right = 'auto';
    root.style.top = `${Math.round(top)}px`;
    root.style.bottom = 'auto';
    event.preventDefault();
}

function endFloatingDrag(event) {
    const state = floatingDragState;
    const root = document.getElementById('stsc_floating_root');
    const button = document.getElementById('stsc_floating_button');
    if (!state || !root || (state.pointerId !== undefined && event.pointerId !== state.pointerId)) return;
    floatingDragState = null;
    button?.releasePointerCapture?.(event.pointerId);
    root.classList.remove('stsc-floating-dragging');

    if (event.type === 'pointercancel') return;

    if (state.moved) {
        const rect = root.getBoundingClientRect();
        persistFloatingPosition(rect.left, rect.top);
        suppressFloatingClickUntil = Date.now() + 450;
        event.preventDefault();
    }
}

function characterEntityFrom(character, index = '') {
    if (!character) return { key: '', name: '', index: -1 };
    const stableKey = character.avatar || character.data?.avatar || character.data?.name || character.name || String(index);
    return {
        key: `character:${stableKey}`,
        name: character.name || character.data?.name || '未命名角色',
        index: Number(index),
    };
}

function getAllCharacterEntities() {
    const characters = ctx()?.characters;
    if (!Array.isArray(characters)) return [];
    return characters.map((character, index) => characterEntityFrom(character, index)).filter(x => x.key);
}

function findCharacterEntity(key) {
    if (!key) return null;
    return getAllCharacterEntities().find(x => x.key === key) || null;
}

function getCurrentCharacterEntity() {
    const context = ctx();
    if (!context || context.groupId) return { key: '', name: '未找到角色', index: -1 };
    const character = context.characters?.[Number(context.characterId)];
    if (!character) return { key: '', name: '未找到角色', index: -1 };
    return characterEntityFrom(character, Number(context.characterId));
}

function getCurrentEntity() {
    const context = ctx();
    if (!context) return { key: '', name: '未选择角色' };

    if (context.groupId) {
        const group = context.groups?.find?.(x => String(x.id) === String(context.groupId));
        return { key: `group:${context.groupId}`, name: group?.name || '当前群聊' };
    }

    const character = getCurrentCharacterEntity();
    return character.key ? character : { key: '', name: '未选择角色' };
}

function getCurrentChatId() {
    const context = ctx();
    return String(context?.getCurrentChatId?.() ?? context?.chatId ?? '');
}

function getPresetById(id, settings = normalizeSettings()) {
    return settings?.presets.find(x => x.id === id) || null;
}

function getBoundPreset(settings = normalizeSettings()) {
    const character = getCurrentCharacterEntity();
    if (!character.key) return null;
    return settings.presets.find(x => x.kind === 'character' && x.boundCharacterKey === character.key) || null;
}

function getPresetBindingState(preset) {
    if (!preset || preset.kind !== 'character' || !preset.boundCharacterKey) {
        return { status: 'unbound', name: '未绑定' };
    }
    const character = findCharacterEntity(preset.boundCharacterKey);
    if (character) return { status: 'ok', name: character.name };
    return { status: 'missing', name: preset.boundCharacterName || '未知角色' };
}

function referenceApplies(reference) {
    if (!reference.enabled || !reference.content.trim()) return false;
    if (reference.scope === 'global') return true;
    const entity = getCurrentEntity();
    return Boolean(entity.key && reference.characterKey === entity.key);
}

function getActiveReferences(settings = normalizeSettings()) {
    return settings.references.filter(referenceApplies);
}

function makeReferenceQuestion(reference) {
    const text = String(reference.autoQuestion || '')
        .replaceAll('{{name}}', reference.name || '未命名资料')
        .trim() || `请说明本轮是否遵守了【${reference.name || '未命名资料'}】。`;

    return {
        id: `ref_${reference.id}`,
        text,
        type: 'open',
        length: 'standard',
        requireEvidence: true,
        enabled: true,
        source: `参考资料-${reference.name}`,
    };
}

function getActiveQuestions(settings = normalizeSettings()) {
    const result = [];
    const general = settings.presets.find(x => x.id === settings.generalPresetId);
    const character = getBoundPreset(settings);

    if (settings.generalEnabled && general?.enabled) {
        for (const question of general.questions.filter(x => x.enabled && x.text.trim())) {
            result.push({ ...clone(question), source: `通用自检预设-${general.name}` });
        }
    }

    if (settings.characterEnabled && character?.enabled && character.id !== general?.id) {
        for (const question of character.questions.filter(x => x.enabled && x.text.trim())) {
            result.push({ ...clone(question), source: `角色自检预设-${character.name}` });
        }
    }

    for (const reference of getActiveReferences(settings)) {
        if (reference.addToCheck) result.push(makeReferenceQuestion(reference));
    }

    return result;
}

function getSelectedTemporaryInstructions({ consume = false, settings = null } = {}) {
    settings ||= normalizeSettings();
    const selectedSet = new Set(settings.pendingInstructionIds);
    const selected = settings.temporaryInstructions.filter(x => selectedSet.has(x.id) && x.content.trim());

    if (consume && selected.length) {
        settings.pendingInstructionIds = [];
        saveSettings();
        renderAll();
    }

    return selected;
}

function positionLabel(position) {
    return {
        before: '系统最前（默认）',
        prompt: '主提示词内',
        chat: '聊天深度',
    }[position] || position;
}

function lengthInstruction(length) {
    return {
        brief: '简短：一句话或非常精炼的结论',
        standard: '标准：一至三句话，说明结论和必要依据',
        detailed: '详细：充分说明结论、依据、风险与修正方向',
    }[length] || '标准回答';
}

function buildQuestionXml(questions) {
    return questions.map((question, index) => {
        const typeRule = question.type === 'boolean'
            ? '判断题：<answer>必须以“是”或“否”开头，再补充具体说明。'
            : '开放问答题：<answer>必须给出具体结论，不得只写“已注意”“会遵守”。';
        const evidenceRule = question.requireEvidence
            ? '必须另外输出非空的<evidence>，写明可核对的剧情依据、角色设定依据或世界观依据；不得把依据只混写在<answer>里。'
            : '无需强制输出<evidence>；回答必须明确。';
        const requiredFields = question.requireEvidence ? 'answer,evidence' : 'answer';
        return [
            `<question id="${escapeXml(question.id)}" index="${index + 1}" evidence_required="${question.requireEvidence ? 'true' : 'false'}">`,
            `<text>${escapeXml(question.text)}</text>`,
            `<source>${escapeXml(question.source || '')}</source>`,
            `<type>${typeRule}</type>`,
            `<length>${lengthInstruction(question.length)}</length>`,
            `<evidence_rule>${evidenceRule}</evidence_rule>`,
            `<required_fields>${requiredFields}</required_fields>`,
            `</question>`,
        ].join('\n');
    }).join('\n');
}

function buildSinglePrompt(questions) {
    return `
[写作前置自检插件｜强制执行]
你必须在输出任何角色扮演正文、对白、动作描写、状态栏、HTML、XML或其他自定义格式之前，先完成下面全部自检问题。

执行规则：
1. 先依据当前角色卡、世界观、聊天记录和用户最后一条消息，逐题形成最终写作结论。
2. 检查你准备输出的正文是否与任一答案冲突；如有冲突，先在内部修改写作方案，再重新核对。
3. 不展示失败草稿、反复推理过程或隐藏思维，只展示最终可供用户核对的简洁答案。
4. 不得漏题、合并题目或改变题目编号。
5. 自检完成前绝对不得开始正文。
6. 对标记 evidence_required="true" 的问题，必须在同一个<item>中同时输出非空的<answer>与<evidence>；缺少<evidence>即视为格式错误。
7. <answer>只写最终结论与本轮演绎方案；<evidence>单独写支撑该结论的具体剧情、角色设定或世界观依据。

你必须严格输出以下结构：
<stsc_self_check>
无需依据：<item id="题目ID"><answer>最终回答</answer></item>
需要依据：<item id="题目ID"><answer>最终回答</answer><evidence>具体依据</evidence></item>
</stsc_self_check>
紧接着直接输出正文、状态栏以及用户要求的全部正常输出格式。
正文不得再包裹在任何由本插件添加的标签中。

本轮问题：
${buildQuestionXml(questions)}
`.trim();
}

function buildStrictCheckPrompt(questions) {
    return `
这是“双阶段严格模式”的第一阶段。请只完成写作前置自检，不得输出角色扮演正文、对白、动作描写或状态栏。

请结合当前角色卡、世界观、聊天记录和用户最后一条消息，逐题给出最终写作结论。发现潜在冲突时，先调整本轮写作计划，再给出最终答案。不要展示隐藏推理或失败草稿。

严格输出：
<stsc_self_check>
无需依据：<item id="题目ID"><answer>最终回答</answer></item>
需要依据：<item id="题目ID"><answer>最终回答</answer><evidence>具体剧情、角色设定或世界观依据</evidence></item>
</stsc_self_check>

凡问题标记 evidence_required="true"，<evidence>不得省略、不得为空，也不得只把依据混写在<answer>中。

本轮问题：
${buildQuestionXml(questions)}
`.trim();
}

function buildStrictMainPrompt(questions, checkText) {
    return `
[写作前置自检插件｜双阶段严格模式第二阶段]
下面是本轮已经完成的写作前置自检。你必须严格依据这些结论生成正文，不得与其冲突，也不得重新输出自检内容。

<stsc_completed_self_check>
${checkText}
</stsc_completed_self_check>

对应问题：
${buildQuestionXml(questions)}

只输出正文、状态栏以及用户要求的全部正常输出格式。
不要输出 <stsc_self_check>，也不要给正文添加任何由本插件定义的包裹标签。
`.trim();
}

function buildReferencePrompt(reference) {
    return `
[写作前置自检插件｜参考资料：${reference.name}]
以下内容是本轮必须参考的外置协议、文风或限制：

${reference.content.trim()}
`.trim();
}

function buildTemporaryPrompt(instructions) {
    const items = instructions.map((x, index) => `${index + 1}. 【${x.name}】${x.content.trim()}`).join('\n');
    return `
[写作前置自检插件｜仅本轮临时指令]
以下指令只对本次回复生效，优先执行，不得写入正文说明：
${items}
`.trim();
}

function setRuntimePrompt(key, text, config) {
    const context = ctx();
    if (!context?.setExtensionPrompt) return;
    const position = POSITION_MAP[config.position] ?? POSITION_MAP.before;
    const depth = clampNumber(config.depth, 0, 20, 0);
    const role = ROLE_MAP[config.role] ?? ROLE_MAP.system;
    context.setExtensionPrompt(key, text, position, depth, false, role);
    runtimePromptKeys.add(key);
}

function clearRuntimePrompts() {
    const context = ctx();
    if (!context?.setExtensionPrompt) return;
    for (const key of runtimePromptKeys) {
        try {
            context.setExtensionPrompt(key, '', -1, 0, false, 0);
        } catch (error) {
            console.warn('[STSC] 清理注入失败：', key, error);
        }
    }
    runtimePromptKeys.clear();
}

function applyReferencePrompts(references) {
    for (const reference of references) {
        setRuntimePrompt(`stsc_ref_${reference.id}`, buildReferencePrompt(reference), reference);
    }
}

function applyTemporaryPrompt(instructions, injection) {
    if (!instructions.length) return;
    setRuntimePrompt('stsc_one_shot', buildTemporaryPrompt(instructions), injection);
}

async function saveLatestResult(result) {
    const context = ctx();
    if (!context?.chatMetadata) return;
    context.chatMetadata[STSC_CHAT_META_KEY] = result;
    try {
        context.saveMetadataDebounced?.();
    } catch (error) {
        console.warn('[STSC] 保存聊天自检元数据失败：', error);
    }
}

function getLatestResult() {
    return ctx()?.chatMetadata?.[STSC_CHAT_META_KEY] || null;
}

function parseItems(checkInner) {
    const items = [];
    const itemRegex = /<item\s+[^>]*id=["']([^"']+)["'][^>]*>([\s\S]*?)<\/item>/gi;
    let match;
    while ((match = itemRegex.exec(checkInner)) !== null) {
        const id = match[1].trim();
        const itemBody = match[2];
        const answerMatch = itemBody.match(/<answer[^>]*>([\s\S]*?)<\/answer>/i);
        const evidenceMatch = itemBody.match(/<evidence[^>]*>([\s\S]*?)<\/evidence>/i);
        const answer = (answerMatch?.[1] ?? '').trim();
        const evidence = (evidenceMatch?.[1] ?? '').trim();
        items.push({ id, answer, evidence });
    }
    return items;
}

function unwrapResponse(text) {
    const source = String(text ?? '');
    const open = STSC_RESPONSE_OPEN_RE.exec(source);
    if (!open) return source.trim();
    const afterOpen = source.slice(open.index + open[0].length);
    const close = STSC_RESPONSE_CLOSE_RE.exec(afterOpen);
    return (close ? afterOpen.slice(0, close.index) : afterOpen).trim();
}

function extractVisibleBody(text) {
    const source = String(text ?? '');
    const responseOpen = STSC_RESPONSE_OPEN_RE.exec(source);
    if (responseOpen) return unwrapResponse(source);

    const checkOpen = STSC_CHECK_OPEN_RE.exec(source);
    if (!checkOpen) return source.trim();
    const checkClose = STSC_CHECK_CLOSE_RE.exec(source);
    if (checkClose && checkClose.index > checkOpen.index) {
        return source.slice(checkClose.index + checkClose[0].length).trim();
    }

    // 标签残缺时也不把自检泄漏进正文，只保留标签前的正常内容。
    return source.slice(0, checkOpen.index).trim();
}

function parseModelOutput(text, expectedQuestions = []) {
    const source = String(text ?? '');
    const openMatch = STSC_CHECK_OPEN_RE.exec(source);
    const closeMatch = STSC_CHECK_CLOSE_RE.exec(source);
    const result = {
        status: 'missing',
        formatIssues: [],
        rawCheck: '',
        body: extractVisibleBody(source),
        items: [],
        answers: [],
    };

    if (!openMatch) {
        result.formatIssues.push('完全没有输出 <stsc_self_check>。');
        return result;
    }

    if (!closeMatch || closeMatch.index < openMatch.index) {
        result.status = 'format_error';
        result.formatIssues.push('自检标签没有正确闭合。');
        return result;
    }

    const firstVisibleIndex = source.search(/\S/);
    if (firstVisibleIndex !== openMatch.index) {
        result.formatIssues.push('自检没有出现在全部正文格式之前。');
    }

    const innerStart = openMatch.index + openMatch[0].length;
    const inner = source.slice(innerStart, closeMatch.index).trim();
    const after = source.slice(closeMatch.index + closeMatch[0].length).trim();
    result.rawCheck = inner;
    result.items = parseItems(inner);
    result.body = unwrapResponse(after);

    const itemMap = new Map(result.items.map(item => [item.id, item]));
    result.answers = expectedQuestions.map(question => {
        const item = itemMap.get(question.id) || {};
        return {
            id: question.id,
            question: question.text,
            source: question.source || '',
            type: question.type || 'open',
            requireEvidence: Boolean(question.requireEvidence),
            answer: item.answer || '',
            evidence: item.evidence || '',
        };
    });

    for (const answer of result.answers) {
        if (!answer.answer.trim()) {
            result.formatIssues.push(`缺少问题“${answer.question}”的回答。`);
        }
        if (answer.type === 'boolean' && answer.answer.trim() && !/^(是|否)(?:[，。；：:、\s]|$)/.test(answer.answer.trim())) {
            result.formatIssues.push(`判断题“${answer.question}”的回答没有以“是”或“否”开头。`);
        }
        if (answer.requireEvidence && !answer.evidence.trim()) {
            result.formatIssues.push(`问题“${answer.question}”已勾选需要依据，但AI没有输出独立的<evidence>依据。`);
        }
    }

    if (result.items.length !== expectedQuestions.length) {
        result.formatIssues.push(`应回答 ${expectedQuestions.length} 题，实际识别到 ${result.items.length} 题。`);
    }

    result.status = result.formatIssues.length ? 'format_error' : 'ok';
    return result;
}

function resolveMessageId(data) {
    const context = ctx();
    if (typeof data === 'number') return data;
    if (typeof data === 'string' && /^\d+$/.test(data)) return Number(data);
    if (data && typeof data === 'object') {
        const candidate = data.messageId ?? data.message_id ?? data.id ?? data.mesId;
        if (candidate !== undefined && /^\d+$/.test(String(candidate))) return Number(candidate);
    }
    return Math.max(0, (context?.chat?.length || 1) - 1);
}

function updateMessageText(message, body) {
    message.mes = body;
    if (Array.isArray(message.swipes) && Number.isInteger(message.swipe_id) && message.swipes[message.swipe_id] !== undefined) {
        message.swipes[message.swipe_id] = body;
    }
}

function refreshMessageDom(messageId, message) {
    const context = ctx();
    const id = Number(messageId);
    try {
        context?.updateMessageBlock?.(id, message);
    } catch (error) {
        console.warn('[STSC] 刷新已剥离自检的正文失败：', error);
    }
}

function makeLatestResult({ parsed, questions, mode, messageId, strictRaw = '', strictStatus = '' }) {
    const entity = getCurrentEntity();
    const boundPreset = getBoundPreset();
    const settings = normalizeSettings();

    return {
        version: STSC_VERSION,
        timestamp: Date.now(),
        chatId: getCurrentChatId(),
        messageId,
        characterKey: entity.key,
        characterName: entity.name,
        mode,
        status: strictStatus || parsed.status,
        formatIssues: parsed.formatIssues || [],
        rawCheck: strictRaw || parsed.rawCheck || '',
        answers: parsed.answers || [],
        expectedCount: questions.length,
        answeredCount: (parsed.answers || []).filter(x => x.answer?.trim()).length,
        generalPresetName: settings.generalEnabled ? getPresetById(settings.generalPresetId)?.name || '' : '',
        characterPresetName: settings.characterEnabled ? boundPreset?.name || '' : '',
    };
}

function statusText(status) {
    return {
        ok: '自检完整',
        format_error: '本轮自检格式有误',
        missing: '本轮AI未输出自检问答',
        strict_ok: '双阶段自检已完成',
    }[status] || '暂无状态';
}

function statusIcon(status) {
    return {
        ok: '✓',
        strict_ok: '✓',
        format_error: '⚠',
        missing: '!',
    }[status] || '○';
}

function statusClass(status) {
    if (status === 'ok' || status === 'strict_ok') return 'stsc-status-ok';
    if (status === 'format_error') return 'stsc-status-warning';
    if (status === 'missing') return 'stsc-status-error';
    return '';
}

async function handleMessageReceived(data) {
    if (internalQuietActive) return;
    const context = ctx();
    if (!context?.chat?.length) return;

    const messageId = resolveMessageId(data);
    const message = context.chat[messageId];
    if (!message || message.is_user || message.is_system) return;

    const run = pendingRun;
    const questions = run?.questions || getActiveQuestions();
    const mode = run?.mode || 'single';
    const rawText = message.mes || '';
    let parsed;
    let latest;

    if (mode === 'strict' && run?.strictCheck) {
        const mainParsed = parseModelOutput(rawText, []);
        const body = mainParsed.status === 'missing' ? unwrapResponse(rawText) : mainParsed.body;
        updateMessageText(message, body);

        const checkParsed = run.strictParsed || parseModelOutput(run.strictCheck, questions);
        const strictStatus = checkParsed.status === 'ok' ? 'strict_ok' : 'format_error';
        latest = makeLatestResult({
            parsed: checkParsed,
            questions,
            mode,
            messageId,
            strictRaw: checkParsed.rawCheck || run.strictCheck,
            strictStatus,
        });
        if (mainParsed.status !== 'missing') {
            latest.formatIssues.push('第二阶段意外重复输出了自检内容，插件已自动移除。');
            if (latest.status === 'strict_ok') latest.status = 'format_error';
        }
    } else {
        parsed = parseModelOutput(rawText, questions);
        updateMessageText(message, parsed.body);
        latest = makeLatestResult({ parsed, questions, mode: 'single', messageId });
    }

    refreshMessageDom(messageId, message);
    await saveLatestResult(latest);

    try {
        await context.saveChat?.();
    } catch (error) {
        console.warn('[STSC] 保存已剥离自检的正文失败：', error);
    }

    pendingRun = null;
    clearRuntimePrompts();
    renderAll();
}

function addMessageBadge(messageId) {
    const latest = getLatestResult();
    if (!latest || Number(latest.messageId) !== Number(messageId)) return;
    if (!['missing', 'format_error'].includes(latest.status)) return;

    const selector = `.mes[mesid="${messageId}"], .mes[data-mesid="${messageId}"]`;
    const $message = $(selector).first();
    if (!$message.length || $message.find('.stsc-message-badge').length) return;

    const missing = latest.status === 'missing';
    const title = missing
        ? '本轮AI未输出自检问答，该正文可能没有受到当前自检预设约束。'
        : `本轮自检格式有误：${(latest.formatIssues || []).join('；')}`;
    const badge = $('<span>')
        .addClass(`stsc-message-badge ${missing ? 'stsc-missing' : 'stsc-format-error'}`)
        .attr('title', title)
        .text(missing ? '!' : '⚠');

    const target = $message.find('.mes_buttons').first();
    if (target.length) target.prepend(badge);
    else $message.find('.mes_block').first().prepend(badge);
}

function handleCharacterMessageRendered(data) {
    const messageId = resolveMessageId(data);
    const latest = getLatestResult();
    addMessageBadge(messageId);
}

function onGenerationEnded() {
    clearRuntimePrompts();
    // 极端情况下没有收到最终消息事件，避免运行状态永久残留。
    setTimeout(() => {
        if (pendingRun && Date.now() - pendingRun.startedAt > 4500) {
            pendingRun = null;
        }
    }, 5000);
}

function onGenerationStopped() {
    clearRuntimePrompts();
    pendingRun = null;
    strictBusy = false;
}

function skipGenerationType(type) {
    const value = String(type || '').toLowerCase();
    return value === 'quiet' || value === 'dryrun' || value === 'dry_run';
}

globalThis.sillyTavernSelfCheckInterceptor = async function (_chat, _contextSize, abort, type) {
    const settings = normalizeSettings();
    if (!settings?.enabled || skipGenerationType(type)) return;

    const context = ctx();
    const questions = getActiveQuestions(settings);
    const references = getActiveReferences(settings);
    const temporaryInstructions = getSelectedTemporaryInstructions({ consume: true });

    clearRuntimePrompts();
    applyReferencePrompts(references);
    applyTemporaryPrompt(temporaryInstructions, settings.injection);

    if (!questions.length) {
        pendingRun = null;
        return;
    }

    const lastMessageId = Math.max(0, (context.chat?.length || 1) - 1);
    const lastMessage = context.chat?.[lastMessageId];
    // 普通发送时，AI消息会出现在当前用户消息之后；重生成/续写时则复用最后一条AI消息。
    const targetMessageFloor = lastMessage && !lastMessage.is_user && !lastMessage.is_system
        ? lastMessageId
        : (context.chat?.length || 0);

    pendingRun = {
        mode: settings.mode,
        questions: clone(questions),
        startedAt: Date.now(),
        generationType: type,
        strictCheck: '',
        strictParsed: null,
        targetMessageFloor,
    };

    if (settings.mode === 'strict') {
        if (strictBusy) return;
        strictBusy = true;
        try {
            const prompt = buildStrictCheckPrompt(questions);
            internalQuietActive = true;
            const raw = await context.generateQuietPrompt({ quietPrompt: prompt });
            internalQuietActive = false;
            const strictCheck = String(raw || '').trim();
            if (!strictCheck) {
                abort?.(true);
                pendingRun = null;
                toastr.error('第一阶段没有得到自检结果，已取消正文生成。', '写作前置自检');
                return;
            }
            const strictParsed = parseModelOutput(strictCheck, questions);
            pendingRun.strictCheck = strictCheck;
            pendingRun.strictParsed = strictParsed;

            // The internal quiet generation emits its own generation-ended event,
            // so restore all prompts needed by the real second-stage generation.
            clearRuntimePrompts();
            applyReferencePrompts(references);
            applyTemporaryPrompt(temporaryInstructions, settings.injection);
            setRuntimePrompt('stsc_main', buildStrictMainPrompt(questions, strictParsed.rawCheck || strictCheck), settings.injection);
        } catch (error) {
            internalQuietActive = false;
            console.error('[STSC] 双阶段第一阶段失败：', error);
            abort?.(true);
            pendingRun = null;
            toastr.error('双阶段自检调用失败，已取消正文生成。', '写作前置自检');
        } finally {
            strictBusy = false;
        }
    } else {
        setRuntimePrompt('stsc_main', buildSinglePrompt(questions), settings.injection);
    }
};

function activeSummary(settings = getUiSettings()) {
    const entity = getCurrentEntity();
    const general = settings.generalEnabled ? getPresetById(settings.generalPresetId, settings) : null;
    const character = settings.characterEnabled ? getBoundPreset(settings) : null;
    const questions = getActiveQuestions(settings);
    const refs = getActiveReferences(settings);
    const temps = getSelectedTemporaryInstructions({ settings });

    const parts = [];
    if (general?.enabled) parts.push(`通用：${general.name}`);
    if (character?.enabled && character.id !== general?.id) parts.push(`角色：${character.name}`);
    if (!parts.length) parts.push('未启用问题预设');

    return {
        entity,
        questions,
        refs,
        temps,
        presetText: parts.join(' ＋ '),
    };
}

function renderCompact() {
    const settings = getUiSettings();
    if (!settings) return;
    const summary = activeSummary();
    const latest = getLatestResult();

    $('#stsc_enabled').prop('checked', settings.enabled);
    $('#stsc_mode_quick').val(settings.mode);
    $('#stsc_compact_summary').html(
        `<b>${escapeHtml(summary.entity.name)}</b><br>` +
        `${escapeHtml(summary.presetText)}<br>` +
        `本轮共 ${summary.questions.length} 个自检问题，${summary.refs.length} 份参考资料。`
    );

    if (latest) {
        $('#stsc_compact_status').html(
            `<span class="${statusClass(latest.status)}"><b>${statusIcon(latest.status)} ${escapeHtml(statusText(latest.status))}</b></span>` +
            `<br><span class="stsc-muted">${new Date(latest.timestamp).toLocaleString()}</span>`
        );
    } else {
        $('#stsc_compact_status').html('<span class="stsc-muted">还没有自检记录。</span>');
    }
}

function renderManagerSubtitle() {
    const summary = activeSummary();
    $('#stsc_manager_subtitle').text(`${summary.entity.name}｜${summary.presetText}｜${summary.questions.length}题`);
}

function renderAnswerCard(answer, index) {
    const number = index + 1;
    const evidence = answer.evidence || '';
    const evidenceHtml = (answer.requireEvidence || evidence)
        ? `<div class="stsc-evidence-text"><span class="stsc-qa-label">A${number}依据：</span>${escapeHtml(evidence || '（未识别到依据）')}</div>`
        : '';
    const sourceHtml = answer.source
        ? `<div class="stsc-answer-source">问题来源：${escapeHtml(answer.source)}</div>`
        : '';
    return `
        <div class="stsc-answer-card">
            <div class="stsc-question-text"><span class="stsc-qa-label">Q${number}：</span>${escapeHtml(answer.question || '')}</div>
            <div class="stsc-answer-text"><span class="stsc-qa-label">A${number}：</span>${escapeHtml(answer.answer || '（未识别到回答）')}</div>
            ${evidenceHtml}
            ${sourceHtml}
        </div>`;
}

function renderStatusTab() {
    const settings = getUiSettings();
    const summary = activeSummary(settings);
    const latest = getLatestResult();
    const questionList = summary.questions.length
        ? summary.questions.map((q, i) => `<div class="stsc-question-card"><div class="stsc-card-title">${i + 1}. ${escapeHtml(q.text)}</div><div class="stsc-muted">${escapeHtml(q.source || '')}｜${q.type === 'boolean' ? '判断题' : '开放问答'}｜${q.length === 'brief' ? '简短' : q.length === 'detailed' ? '详细' : '标准'}${q.requireEvidence ? '｜需要依据' : ''}</div></div>`).join('')
        : '<div class="stsc-empty">当前没有生效的自检问题。</div>';

    let latestHtml = '<div class="stsc-empty">还没有自检记录。</div>';
    if (latest) {
        const answers = (latest.answers || []).length
            ? latest.answers.map((answer, i) => renderAnswerCard(answer, i)).join('')
            : `<div class="stsc-test-result">${escapeHtml(latest.rawCheck || '没有可显示的自检内容。')}</div>`;

        const issues = (latest.formatIssues || []).length
            ? `<div class="stsc-section"><div class="stsc-section-title stsc-status-warning">格式提示</div>${latest.formatIssues.map(x => `<div>• ${escapeHtml(x)}</div>`).join('')}</div>`
            : '';

        latestHtml = `
            <div class="stsc-meta-row">
                <span class="stsc-status-pill ${statusClass(latest.status)}">${statusIcon(latest.status)} ${escapeHtml(statusText(latest.status))}</span>
                <span class="stsc-status-pill">${latest.mode === 'strict' ? '双阶段严格模式' : '单次模式'}</span>
                <span class="stsc-status-pill">${latest.answeredCount}/${latest.expectedCount} 题</span>
                <span class="stsc-status-pill">${new Date(latest.timestamp).toLocaleString()}</span>
            </div>
            ${issues}
            ${answers}
        `;
    }

    const tempPills = summary.temps.length
        ? `<div class="stsc-selected-instructions">${summary.temps.map(x => `<span class="stsc-temp-pill">${escapeHtml(x.name)}</span>`).join('')}</div>`
        : '<div class="stsc-muted">下轮没有勾选临时指令。</div>';

    $('#stsc_tab_status').html(`
        <div class="stsc-section">
            <div class="stsc-section-title">当前生效内容</div>
            <div><b>角色：</b>${escapeHtml(summary.entity.name)}</div>
            <div><b>预设：</b>${escapeHtml(summary.presetText)}</div>
            <div><b>参考资料：</b>${summary.refs.length ? summary.refs.map(x => escapeHtml(x.name)).join('、') : '无'}</div>
            <div><b>模式：</b>${settings.mode === 'strict' ? '双阶段严格模式（两次调用）' : '单次模式（一次调用）'}</div>
            <div class="stsc-section-title" style="margin-top:12px">下轮临时指令</div>
            ${tempPills}
        </div>
        <div class="stsc-section">
            <div class="stsc-section-title">本轮实际生效问题（${summary.questions.length}）</div>
            ${questionList}
        </div>
        <div class="stsc-section">
            <div class="stsc-section-title">最新一轮自检</div>
            ${latestHtml}
        </div>
    `);
}

function presetOptions(kind, selectedId, settings = getUiSettings()) {
    return settings.presets
        .filter(preset => preset.kind === kind)
        .map(preset => `<option value="${escapeHtml(preset.id)}" ${preset.id === selectedId ? 'selected' : ''}>${escapeHtml(preset.name)}</option>`)
        .join('');
}

function getEditingPreset(kind = null, settings = getUiSettings()) {
    const actualKind = kind || settings.ui.presetSection || 'general';
    const id = actualKind === 'character' ? settings.ui.editingCharacterPresetId : settings.ui.editingGeneralPresetId;
    return settings.presets.find(x => x.id === id && x.kind === actualKind) || null;
}

function renderQuestionCards(preset) {
    if (!preset?.questions.length) return '<div class="stsc-empty">这个预设还没有问题。</div>';
    return preset.questions.map((question, index) => `
        <div class="stsc-question-card" data-question-id="${escapeHtml(question.id)}">
            <div class="stsc-card-header">
                <div class="stsc-card-title">问题 ${index + 1}</div>
                <div class="stsc-card-actions">
                    <button class="menu_button stsc-small-button" type="button" data-action="move-question-up" ${index === 0 ? 'disabled' : ''}>上移</button>
                    <button class="menu_button stsc-small-button" type="button" data-action="move-question-down" ${index === preset.questions.length - 1 ? 'disabled' : ''}>下移</button>
                    <button class="menu_button stsc-small-button stsc-danger-button" type="button" data-action="delete-question">删除</button>
                </div>
            </div>
            <div class="stsc-field">
                <label>问题内容</label>
                <textarea class="text_pole stsc-textarea" data-question-field="text">${escapeHtml(question.text)}</textarea>
            </div>
            <div class="stsc-grid-3" style="margin-top:9px">
                <div class="stsc-field">
                    <label>问题类型</label>
                    <select class="text_pole" data-question-field="type">
                        <option value="open" ${question.type === 'open' ? 'selected' : ''}>开放问答题</option>
                        <option value="boolean" ${question.type === 'boolean' ? 'selected' : ''}>判断题（是/否）</option>
                    </select>
                </div>
                <div class="stsc-field">
                    <label>回答程度</label>
                    <select class="text_pole" data-question-field="length">
                        <option value="brief" ${question.length === 'brief' ? 'selected' : ''}>简短</option>
                        <option value="standard" ${question.length === 'standard' ? 'selected' : ''}>标准</option>
                        <option value="detailed" ${question.length === 'detailed' ? 'selected' : ''}>详细</option>
                    </select>
                </div>
                <div class="stsc-field">
                    <label>选项</label>
                    <label class="checkbox_label"><input type="checkbox" data-question-field="requireEvidence" ${question.requireEvidence ? 'checked' : ''}> 要求剧情/设定依据</label>
                    <label class="checkbox_label"><input type="checkbox" data-question-field="enabled" ${question.enabled ? 'checked' : ''}> 启用本题</label>
                </div>
            </div>
        </div>`).join('');
}

function renderPresetsTab() {
    const settings = getUiSettings();
    const kind = settings.ui.presetSection === 'character' ? 'character' : 'general';
    const presets = settings.presets.filter(x => x.kind === kind);
    let preset = getEditingPreset(kind);
    if (!preset && presets.length) {
        preset = presets[0];
        if (kind === 'character') settings.ui.editingCharacterPresetId = preset.id;
        else settings.ui.editingGeneralPresetId = preset.id;
    }

    const currentCharacter = getCurrentCharacterEntity();
    const binding = getPresetBindingState(preset);
    const activeGeneral = getPresetById(settings.generalPresetId, settings);
    const pageTitle = kind === 'general' ? '通用预设' : '角色预设';
    const selectId = kind === 'general' ? 'stsc_general_preset_select' : 'stsc_character_preset_select';
    const questionsHtml = renderQuestionCards(preset);

    let presetDetails = '<div class="stsc-empty">还没有预设。请点击“新建预设”。</div>';
    if (preset) {
        const generalBox = kind === 'general' ? `
            <div class="stsc-binding-box">
                当前正在生效的通用预设：<b>${escapeHtml(activeGeneral?.name || '无')}</b>
            </div>
            <div class="stsc-toolbar">
                <button class="menu_button" type="button" data-action="set-general-preset" ${settings.generalPresetId === preset.id ? 'disabled' : ''}>${settings.generalPresetId === preset.id ? '当前通用预设' : '设为当前通用预设'}</button>
                <button class="menu_button" type="button" data-action="test-preset">测试当前实际生效问题（调用一次API）</button>
            </div>` : `
            <div class="stsc-binding-box ${binding.status === 'missing' ? 'stsc-binding-missing' : ''}">
                当前绑定角色卡：<b>${binding.status === 'unbound' ? '未绑定' : escapeHtml(binding.name)}</b>
                ${binding.status === 'missing' ? '<div class="stsc-status-error">⚠ 角色卡丢失：原角色卡可能已被删除或更换。</div>' : ''}
                <div class="stsc-muted" style="margin-top:5px">当前聊天页面：${currentCharacter.key ? escapeHtml(currentCharacter.name) : '未找到角色卡'}</div>
            </div>
            <div class="stsc-toolbar">
                <button class="menu_button" type="button" data-action="bind-current-character">绑定到当前角色</button>
                <button class="menu_button" type="button" data-action="unbind-preset" ${binding.status === 'unbound' ? 'disabled' : ''}>解除绑定</button>
                <button class="menu_button" type="button" data-action="test-preset">测试当前实际生效问题（调用一次API）</button>
            </div>`;

        presetDetails = `
            <div class="stsc-grid-2" style="margin-top:10px">
                <div class="stsc-field"><label>预设名称</label><input id="stsc_preset_name" class="text_pole" type="text" value="${escapeHtml(preset.name)}"></div>
                <div class="stsc-field"><label>预设状态</label><label class="checkbox_label"><input id="stsc_preset_enabled" type="checkbox" ${preset.enabled ? 'checked' : ''}> 启用该预设</label></div>
            </div>
            ${generalBox}`;
    }

    $('#stsc_tab_presets').html(`
        <div class="stsc-preset-subtabs" role="tablist" aria-label="预设类型">
            <button type="button" class="stsc-preset-subtab ${kind === 'general' ? 'active' : ''}" data-preset-section="general">通用预设</button>
            <button type="button" class="stsc-preset-subtab ${kind === 'character' ? 'active' : ''}" data-preset-section="character">角色预设</button>
        </div>

        <div class="stsc-section">
            <div class="stsc-section-title">${pageTitle}</div>
            <div class="stsc-muted">${kind === 'general' ? '通用预设可在所有角色中持续生效；可以创建多套，但同一时间只选择一套作为当前通用预设。' : '角色预设创建后默认不绑定。打开角色卡聊天页面后，再手动绑定到当前角色。'}</div>
            <div class="stsc-toolbar" style="margin-top:10px">
                ${presets.length ? `<select id="${selectId}" class="text_pole">${presetOptions(kind, preset?.id, settings)}</select>` : ''}
                <button class="menu_button" type="button" data-action="open-create-preset" data-kind="${kind}">＋ 新建预设</button>
                <button class="menu_button" type="button" data-action="copy-preset" ${preset ? '' : 'disabled'}>复制</button>
                <button class="menu_button stsc-danger-button" type="button" data-action="delete-preset" ${preset ? '' : 'disabled'}>删除</button>
            </div>
            ${presetDetails}
        </div>

        ${preset ? `
        <div class="stsc-section">
            <div class="stsc-section-title">问题列表</div>
            <div class="stsc-toolbar">
                <button class="menu_button" type="button" data-action="add-question">＋ 添加问题</button>
                <button class="menu_button" type="button" data-action="open-batch-import">批量导入问题</button>
            </div>
            <div id="stsc_question_list">${questionsHtml}</div>
        </div>` : ''}

        ${lastTestResult ? `
        <div class="stsc-section">
            <div class="stsc-section-title">最近一次测试结果</div>
            <div class="stsc-test-result">${escapeHtml(lastTestResult)}</div>
        </div>` : ''}
    `);
}

function renderReferencesTab() {
    const settings = getUiSettings();
    const entity = getCurrentEntity();
    const references = settings.references.length
        ? settings.references.map(reference => `
            <div class="stsc-reference-card" data-reference-id="${escapeHtml(reference.id)}">
                <div class="stsc-card-header">
                    <div class="stsc-card-title">${escapeHtml(reference.name)}</div>
                    <button class="menu_button stsc-small-button stsc-danger-button" data-action="delete-reference">删除</button>
                </div>
                <div class="stsc-grid-2">
                    <div class="stsc-field"><label>资料名称</label><input class="text_pole" data-reference-field="name" type="text" value="${escapeHtml(reference.name)}"></div>
                    <div class="stsc-field"><label>启用与范围</label>
                        <label class="checkbox_label"><input type="checkbox" data-reference-field="enabled" ${reference.enabled ? 'checked' : ''}> 启用资料</label>
                        <select class="text_pole" data-reference-field="scope">
                            <option value="global" ${reference.scope === 'global' ? 'selected' : ''}>通用生效</option>
                            <option value="character" ${reference.scope === 'character' ? 'selected' : ''}>绑定角色：${escapeHtml(reference.characterKey ? '已绑定' : '未绑定')}</option>
                        </select>
                    </div>
                </div>
                <div class="stsc-field" style="margin-top:9px"><label>协议、文风或限制内容</label><textarea class="text_pole stsc-textarea" data-reference-field="content">${escapeHtml(reference.content)}</textarea></div>
                <div class="stsc-grid-4" style="margin-top:9px">
                    <div class="stsc-field"><label>注入位置</label><select class="text_pole" data-reference-field="position">
                        <option value="before" ${reference.position === 'before' ? 'selected' : ''}>系统最前</option>
                        <option value="prompt" ${reference.position === 'prompt' ? 'selected' : ''}>主提示词内</option>
                        <option value="chat" ${reference.position === 'chat' ? 'selected' : ''}>聊天深度</option>
                    </select></div>
                    <div class="stsc-field"><label>深度（0～20）</label><input class="text_pole" data-reference-field="depth" type="number" min="0" max="20" value="${reference.depth}"></div>
                    <div class="stsc-field"><label>角色</label><select class="text_pole" data-reference-field="role">
                        <option value="system" ${reference.role === 'system' ? 'selected' : ''}>System</option>
                        <option value="user" ${reference.role === 'user' ? 'selected' : ''}>User</option>
                        <option value="assistant" ${reference.role === 'assistant' ? 'selected' : ''}>Assistant</option>
                    </select></div>
                    <div class="stsc-field"><label>当前角色绑定</label><button class="menu_button" data-action="bind-reference-character">绑定到 ${escapeHtml(entity.name)}</button></div>
                </div>
                <div class="stsc-field" style="margin-top:9px">
                    <label class="checkbox_label"><input type="checkbox" data-reference-field="addToCheck" ${reference.addToCheck ? 'checked' : ''}> 自动加入自检问答末尾</label>
                    <label>自动生成的自检问题（可修改）</label>
                    <textarea class="text_pole" data-reference-field="autoQuestion">${escapeHtml(reference.autoQuestion)}</textarea>
                    <div class="stsc-muted">可使用 {{name}} 代表资料名称。</div>
                </div>
            </div>`).join('')
        : '<div class="stsc-empty">资料库还是空的。</div>';

    $('#stsc_tab_references').html(`
        <div class="stsc-section">
            <div class="stsc-section-title">参考资料库</div>
            <div class="stsc-muted">存放文风、防人机协议、感情限制等内容。勾选“自动加入自检问答”后，会在用户问题末尾自动补充对应问题。</div>
            <div class="stsc-toolbar" style="margin-top:9px"><button class="menu_button" data-action="add-reference">＋ 新建参考资料</button></div>
            ${references}
        </div>
    `);
}

function renderTemporaryTab() {
    const settings = getUiSettings();
    const selected = new Set(settings.pendingInstructionIds);
    const instructions = settings.temporaryInstructions.length
        ? settings.temporaryInstructions.map(instruction => `
            <div class="stsc-temp-card" data-temp-id="${escapeHtml(instruction.id)}">
                <div class="stsc-card-header">
                    <label class="checkbox_label stsc-card-title"><input type="checkbox" data-action="toggle-temp-selected" ${selected.has(instruction.id) ? 'checked' : ''}> 下轮启用</label>
                    <button class="menu_button stsc-small-button stsc-danger-button" data-action="delete-temp">删除</button>
                </div>
                <div class="stsc-field"><label>指令名称</label><input class="text_pole" data-temp-field="name" type="text" value="${escapeHtml(instruction.name)}"></div>
                <div class="stsc-field" style="margin-top:8px"><label>仅下一轮发送给AI的内容</label><textarea class="text_pole stsc-textarea" data-temp-field="content">${escapeHtml(instruction.content)}</textarea></div>
            </div>`).join('')
        : '<div class="stsc-empty">还没有保存临时指令。</div>';

    $('#stsc_tab_temporary').html(`
        <div class="stsc-section">
            <div class="stsc-section-title">本轮临时指令</div>
            <div class="stsc-muted">勾选后会随下一条用户消息一起注入，但不会显示在聊天记录，不会自动变成自检问题；生成开始后自动取消勾选。</div>
            <div class="stsc-toolbar" style="margin-top:9px">
                <button class="menu_button" data-action="add-temp">＋ 新建临时指令</button>
                <button class="menu_button" data-action="clear-temp-selection">清空下轮勾选</button>
            </div>
            ${instructions}
        </div>
    `);
}

function renderSettingsTab() {
    const settings = getUiSettings();
    $('#stsc_tab_settings').html(`
        <div class="stsc-section">
            <div class="stsc-section-title">运行方式</div>
            <label class="checkbox_label"><input id="stsc_setting_enabled" type="checkbox" ${settings.enabled ? 'checked' : ''}> 启用插件</label>
            <div class="stsc-grid-2" style="margin-top:10px">
                <div class="stsc-field"><label>生成模式</label><select id="stsc_setting_mode" class="text_pole">
                    <option value="single" ${settings.mode === 'single' ? 'selected' : ''}>单次模式：自检与正文一次生成</option>
                    <option value="strict" ${settings.mode === 'strict' ? 'selected' : ''}>双阶段严格模式：先自检，再调用一次生成正文</option>
                </select></div>
                <div class="stsc-field"><label>预设叠加</label>
                    <label class="checkbox_label"><input id="stsc_general_enabled" type="checkbox" ${settings.generalEnabled ? 'checked' : ''}> 启用通用预设</label>
                    <label class="checkbox_label"><input id="stsc_character_enabled" type="checkbox" ${settings.characterEnabled ? 'checked' : ''}> 启用角色专属预设</label>
                </div>
            </div>
        </div>
        <div class="stsc-section">
            <div class="stsc-section-title">自检与临时指令默认注入位置</div>
            <div class="stsc-muted">默认使用“系统最前”，优先级最高；只有熟悉提示词结构时才建议调整。</div>
            <div class="stsc-grid-3" style="margin-top:10px">
                <div class="stsc-field"><label>位置</label><select id="stsc_injection_position" class="text_pole">
                    <option value="before" ${settings.injection.position === 'before' ? 'selected' : ''}>系统最前（默认）</option>
                    <option value="prompt" ${settings.injection.position === 'prompt' ? 'selected' : ''}>主提示词内</option>
                    <option value="chat" ${settings.injection.position === 'chat' ? 'selected' : ''}>聊天深度</option>
                </select></div>
                <div class="stsc-field"><label>深度（0～20）</label><input id="stsc_injection_depth" class="text_pole" type="number" min="0" max="20" value="${settings.injection.depth}"></div>
                <div class="stsc-field"><label>角色</label><select id="stsc_injection_role" class="text_pole">
                    <option value="system" ${settings.injection.role === 'system' ? 'selected' : ''}>System</option>
                    <option value="user" ${settings.injection.role === 'user' ? 'selected' : ''}>User</option>
                    <option value="assistant" ${settings.injection.role === 'assistant' ? 'selected' : ''}>Assistant</option>
                </select></div>
            </div>
        </div>
        <div class="stsc-section">
            <div class="stsc-section-title">界面显示</div>
            <div class="stsc-grid-2">
                <div class="stsc-field"><label>插件配色</label><select id="stsc_theme" class="text_pole">
                    <option value="default" ${settings.appearance.theme === 'default' ? 'selected' : ''}>默认：跟随 SillyTavern 美化</option>
                    <option value="rose" ${settings.appearance.theme === 'rose' ? 'selected' : ''}>樱雾粉</option>
                    <option value="blue" ${settings.appearance.theme === 'blue' ? 'selected' : ''}>月光蓝</option>
                    <option value="mint" ${settings.appearance.theme === 'mint' ? 'selected' : ''}>青瓷绿</option>
                    <option value="violet" ${settings.appearance.theme === 'violet' ? 'selected' : ''}>暮藤紫</option>
                    <option value="gold" ${settings.appearance.theme === 'gold' ? 'selected' : ''}>奶杏金</option>
                </select></div>
                <div class="stsc-field"><label>悬浮窗</label>
                    <label class="checkbox_label"><input id="stsc_floating_enabled" type="checkbox" ${settings.appearance.floatingEnabled ? 'checked' : ''}> 开启悬浮按钮，快速查看最新一轮问答</label>
                    <div class="stsc-muted">悬浮按钮支持鼠标或手指在屏幕安全区域内自由拖动，并会记住位置；自动避开顶部菜单和底部输入框。悬浮窗只展示插件保存的自检。</div>
                </div>
            </div>
        </div>
        <div class="stsc-section">
            <div class="stsc-section-title">上下文处理</div>
            <div>自检问答不会保留在聊天正文中；流式生成时仅在自检阶段显示占位提示，进入正文阶段后会继续实时显示正在生成的正文；完成后自检只在插件与悬浮窗中查看。</div>
            <div>聊天记录只保留正文、状态栏和其他正常输出；下一轮AI读取不到上一轮自检。</div>
            <div class="stsc-code-note">&lt;stsc_self_check&gt;…&lt;/stsc_self_check&gt; → 仅插件可见\n&lt;stsc_response&gt;…&lt;/stsc_response&gt; → 正常聊天正文</div>
        </div>
    `);
}

function renderFloating() {
    const settings = getUiSettings();
    const $root = $('#stsc_floating_root');
    if (!$root.length) return;
    applyTheme(settings);
    applyFloatingPosition(settings);

    const enabled = Boolean(settings.appearance?.floatingEnabled);
    $root.toggleClass('stsc-hidden', !enabled).attr('aria-hidden', enabled ? 'false' : 'true');
    if (!enabled) {
        const panel = document.getElementById('stsc_floating_panel');
        panel?.style?.removeProperty('display');
        $('#stsc_floating_panel').addClass('stsc-hidden').attr('aria-hidden', 'true');
        return;
    }

    const latest = getLatestResult();
    const hasIssue = latest && ['missing', 'format_error'].includes(latest.status);
    $('#stsc_floating_badge').toggleClass('stsc-hidden', !hasIssue).text(latest?.status === 'format_error' ? '⚠' : '!');

    if (!latest) {
        $('#stsc_floating_subtitle').text('还没有自检记录');
        $('#stsc_floating_content').html('<div class="stsc-empty">完成一次角色回复后，这里会显示最新一轮自检问答。</div>');
        return;
    }

    $('#stsc_floating_subtitle').text(`${statusText(latest.status)}｜${new Date(latest.timestamp).toLocaleString()}`);
    const issues = (latest.formatIssues || []).length
        ? `<div class="stsc-section"><div class="stsc-section-title stsc-status-warning">格式提示</div>${latest.formatIssues.map(x => `<div>• ${escapeHtml(x)}</div>`).join('')}</div>`
        : '';
    const answers = (latest.answers || []).length
        ? latest.answers.map((answer, index) => renderAnswerCard(answer, index)).join('')
        : `<div class="stsc-test-result">${escapeHtml(latest.rawCheck || '没有可显示的自检内容。')}</div>`;
    $('#stsc_floating_content').html(`${issues}${answers}`);
    if (!$('#stsc_floating_panel').hasClass('stsc-hidden')) requestAnimationFrame(layoutFloatingPanel);
}

function renderAll() {
    if (!initialized) return;
    renderCompact();
    renderManagerSubtitle();
    renderStatusTab();
    renderPresetsTab();
    renderReferencesTab();
    renderTemporaryTab();
    renderSettingsTab();
    renderFloating();
    applyTheme(getUiSettings());
    updateSaveState();
}

function openManager(tab = null) {
    if (!editDraft) beginEditSession();
    const settings = getUiSettings();
    if (tab) settings.ui.activeTab = tab;
    $('#stsc_manager_overlay').removeClass('stsc-hidden').attr('aria-hidden', 'false');
    $('body').addClass('stsc-modal-open');
    performSwitchTab(settings.ui.activeTab || 'status');
    renderAll();
}

function performCloseManager() {
    closeDialog();
    $('#stsc_manager_overlay').addClass('stsc-hidden').attr('aria-hidden', 'true');
    $('body').removeClass('stsc-modal-open');
    if (editDraft?.ui) {
        normalizeSettings().ui = clone(editDraft.ui);
        saveSettings();
    }
    editDraft = null;
    editDirty = false;
    applyTheme(normalizeSettings());
    renderFloating();
}

function closeManager() {
    requestUnsavedDecision(performCloseManager);
}

function openDialog(title, bodyHtml, footerHtml = '') {
    $('#stsc_dialog_title').text(title || '操作');
    $('#stsc_dialog_body').html(bodyHtml || '');
    $('#stsc_dialog_footer').html(footerHtml || '');
    $('#stsc_dialog_overlay').removeClass('stsc-hidden').attr('aria-hidden', 'false');
    $('body').addClass('stsc-modal-open');
}

function closeDialog() {
    const hadPendingUnsavedAction = Boolean(pendingUnsavedAction);
    bulkDraft = null;
    pendingUnsavedAction = null;
    $('#stsc_dialog_overlay').addClass('stsc-hidden').attr('aria-hidden', 'true');
    $('#stsc_dialog_title, #stsc_dialog_body, #stsc_dialog_footer').empty();
    if (hadPendingUnsavedAction && initialized) renderAll();
}

function performSwitchTab(tab) {
    const settings = getUiSettings();
    settings.ui.activeTab = tab;
    $('.stsc-tab').removeClass('active');
    $(`.stsc-tab[data-tab="${tab}"]`).addClass('active');
    $('.stsc-tab-panel').removeClass('active');
    $(`#stsc_tab_${tab}`).addClass('active');
}

function switchTab(tab) {
    const current = getUiSettings().ui.activeTab || 'status';
    if (tab === current) return;
    requestUnsavedDecision(() => {
        performSwitchTab(tab);
        renderAll();
    });
}

function normalizePresetName(name) {
    return String(name || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

function presetNameExists(name, excludeId = '') {
    const normalized = normalizePresetName(name);
    return Boolean(normalized && getUiSettings().presets.some(x => x.id !== excludeId && normalizePresetName(x.name) === normalized));
}

function makeUniquePresetName(baseName) {
    const base = String(baseName || '新自检预设').trim() || '新自检预设';
    if (!presetNameExists(base)) return base;
    let index = 2;
    while (presetNameExists(`${base} ${index}`)) index += 1;
    return `${base} ${index}`;
}

function openCreatePresetDialog(kind) {
    const label = kind === 'character' ? '角色预设' : '通用预设';
    openDialog(
        `新建${label}`,
        `<div class="stsc-field">
            <label>预设名称</label>
            <input id="stsc_new_preset_name" class="text_pole" type="text" maxlength="80" placeholder="请输入不重复的预设名称">
            <div id="stsc_new_preset_error" class="stsc-dialog-error"></div>
        </div>
        <div class="stsc-muted" style="margin-top:9px">${kind === 'character' ? '创建后默认不绑定角色，需要在角色卡聊天页面中手动绑定。' : '创建后不会自动替换当前通用预设，确认内容后可以手动设为当前通用。'}</div>`,
        `<button class="menu_button" type="button" data-dialog-action="cancel">取消</button>
         <button class="menu_button" type="button" data-dialog-action="create-preset" data-kind="${kind}">确认创建</button>`
    );
    setTimeout(() => $('#stsc_new_preset_name').trigger('focus'), 0);
}

function looksLikeQuestion(text) {
    const value = String(text || '').trim();
    if (!value) return false;
    if (/[？?]\s*$/.test(value)) return true;
    return /^(是否|有无|能否|可否|当前|本轮|此时|角色|两人|他们|应该|应当|如何|为何|为什么|什么|哪|哪些|怎样|怎么|请(?:说明|判断|分析|确认|回答|概括|检查)|根据.+(?:如何|是否|应该))/u.test(value);
}

function splitBulkQuestions(raw) {
    let text = String(raw || '').replace(/\r\n?/g, '\n').trim();
    if (!text) return [];

    text = text.replace(/\s+(?=(?:\d+|[一二三四五六七八九十百]+)[\.、：:)）-]\s*)/g, '\n');
    const sourceLines = text.split(/\n+/).map(x => x.trim()).filter(Boolean);
    const output = [];

    for (const original of sourceLines) {
        const marked = /^\s*(?:[-*•·]+|(?:\d+|[一二三四五六七八九十百]+)[\.、：:)）-])\s*/u.test(original);
        const cleaned = original.replace(/^\s*(?:[-*•·]+|(?:\d+|[一二三四五六七八九十百]+)[\.、：:)）-])\s*/u, '').trim();
        if (!cleaned) continue;
        const chunks = cleaned.split(/(?<=[？?])\s*(?=\S)/u).map(x => x.trim()).filter(Boolean);
        for (const chunk of chunks) {
            if (looksLikeQuestion(chunk)) output.push(chunk);
        }
    }

    if (!output.length && looksLikeQuestion(text)) output.push(text);
    return [...new Set(output)];
}

function renderBulkImportDialog() {
    if (!bulkDraft) return;
    const itemsHtml = bulkDraft.items.length ? bulkDraft.items.map((item, index) => `
        <div class="stsc-bulk-item" data-bulk-index="${index}">
            <div class="stsc-card-header">
                <div class="stsc-card-title">识别结果 ${index + 1}</div>
                <button class="menu_button stsc-small-button stsc-danger-button" type="button" data-dialog-action="delete-bulk-item">删除</button>
            </div>
            <textarea class="text_pole stsc-textarea" data-bulk-field="text">${escapeHtml(item)}</textarea>
        </div>`).join('') : '<div class="stsc-empty">还没有识别结果。粘贴内容后点击“开始识别”。</div>';

    openDialog(
        '批量导入问题',
        `<div class="stsc-field">
            <label>粘贴原始内容</label>
            <textarea id="stsc_bulk_raw" class="text_pole stsc-bulk-raw" placeholder="把整段问题粘贴到这里。识别后不会立即导入，可以先修改和删除。">${escapeHtml(bulkDraft.raw)}</textarea>
        </div>
        <div class="stsc-toolbar" style="margin-top:9px">
            <button class="menu_button" type="button" data-dialog-action="recognize-bulk">开始识别 / 重新识别</button>
            <button class="menu_button" type="button" data-dialog-action="add-bulk-item">＋ 手动补一条</button>
        </div>
        <div class="stsc-muted" style="margin-top:9px">识别结果只是临时草稿。请先检查、修改或删除，点击“确认导入”后才会正式加入当前预设。</div>
        <div class="stsc-bulk-preview">${itemsHtml}</div>`,
        `<button class="menu_button" type="button" data-dialog-action="cancel">取消</button>
         <button class="menu_button" type="button" data-dialog-action="confirm-bulk" ${bulkDraft.items.length ? '' : 'disabled'}>确认导入（${bulkDraft.items.length}）</button>`
    );
}

function openBulkImportDialog(preset) {
    if (!preset) return;
    bulkDraft = { presetId: preset.id, raw: '', items: [] };
    renderBulkImportDialog();
}

async function testCurrentPreset() {
    if (testBusy) return;
    const context = ctx();
    const settings = getUiSettings();
    const questions = getActiveQuestions(settings);
    const references = getActiveReferences(settings);
    if (!questions.length) {
        toastr.warning('当前没有生效的问题可以测试。', '写作前置自检');
        return;
    }

    testBusy = true;
    const loader = context.loader?.show?.({
        message: '正在测试自检预设…',
        title: '写作前置自检',
        toastMode: 'stoppable',
    });

    try {
        clearRuntimePrompts();
        applyReferencePrompts(references);
        const questionText = questions.map((q, i) => `${i + 1}. [${q.type === 'boolean' ? '判断题' : '开放问答'}｜${q.length}｜${q.requireEvidence ? '需要依据' : '无需强制依据'}] ${q.text}`).join('\n');
        const prompt = `
这是写作前置自检插件的“测试预设”功能。请读取当前角色设定、聊天上文、已注入的参考资料以及下面全部问题。

任务：
1. 逐题正常回答，但绝对不要输出角色扮演正文、对白、动作或状态栏。
2. 回答完成后输出【测试结论】，判断：问题能否正常理解；哪些问题语义相似；哪些可能冲突；哪些太模糊；问题类型或回答长度是否不合适。
3. 不要为了给建议而虚构问题。没有明显问题时，明确写“整体可正常使用”。

本次实际生效问题共 ${questions.length} 题：
${questionText}
`.trim();
        internalQuietActive = true;
        const result = await context.generateQuietPrompt({ quietPrompt: prompt });
        internalQuietActive = false;
        lastTestResult = String(result || '').trim() || '测试没有返回内容。';
        toastr.success('测试完成，没有生成正文。', '写作前置自检');
        switchTab('presets');
        renderAll();
    } catch (error) {
        internalQuietActive = false;
        console.error('[STSC] 测试预设失败：', error);
        toastr.error('测试调用失败，请检查当前API连接。', '写作前置自检');
    } finally {
        clearRuntimePrompts();
        testBusy = false;
        await loader?.hide?.();
    }
}

function bindUiEvents() {
    $('#stsc_close_manager').on('click', closeManager);
    $('#stsc_save_changes').on('click', () => commitEditDraft());
    $('#stsc_floating_button').on('click', function (event) {
        event.preventDefault();
        if (Date.now() < suppressFloatingClickUntil) return;
        toggleFloatingPanel();
    });
    $('#stsc_floating_button').on('pointerdown', beginFloatingDrag);
    $(document).on('pointermove.stscFloating', moveFloatingDrag);
    $(document).on('pointerup.stscFloating pointercancel.stscFloating', endFloatingDrag);
    const closeFloating = (event) => {
        event?.preventDefault?.();
        event?.stopPropagation?.();
        event?.stopImmediatePropagation?.();
        toggleFloatingPanel(false);
    };
    const floatingCloseButton = document.getElementById('stsc_floating_close');
    floatingCloseButton?.addEventListener('pointerup', closeFloating, { passive: false });
    floatingCloseButton?.addEventListener('touchend', closeFloating, { passive: false });
    floatingCloseButton?.addEventListener('click', closeFloating, { passive: false });
    $('#stsc_floating_open_manager').on('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        toggleFloatingPanel(false);
        openManager('status');
    });
    $('#stsc_dialog_close').on('click', closeDialog);

    // 不再点击黑色背景关闭，避免用户拖选/复制文字时误退出插件。
    $(document).on('keydown.stsc', function (event) {
        if (event.key !== 'Escape') return;
        if (!$('#stsc_dialog_overlay').hasClass('stsc-hidden')) closeDialog();
        else if (!$('#stsc_manager_overlay').hasClass('stsc-hidden')) closeManager();
    });

    $('#stsc_manager_overlay').on('click', '.stsc-tab', function () {
        switchTab($(this).data('tab'));
    });

    $('#stsc_manager_overlay').on('click', '[data-preset-section]', function () {
        const next = $(this).data('preset-section') === 'character' ? 'character' : 'general';
        if (next === getUiSettings().ui.presetSection) return;
        requestUnsavedDecision(() => {
            getUiSettings().ui.presetSection = next;
            renderPresetsTab();
            updateSaveState();
        });
    });

    $('#stsc_manager_overlay').on('change', '#stsc_general_preset_select', function () {
        const next = this.value;
        requestUnsavedDecision(() => {
            getUiSettings().ui.editingGeneralPresetId = next;
            renderPresetsTab();
            updateSaveState();
        });
    });

    $('#stsc_manager_overlay').on('change', '#stsc_character_preset_select', function () {
        const next = this.value;
        requestUnsavedDecision(() => {
            getUiSettings().ui.editingCharacterPresetId = next;
            renderPresetsTab();
            updateSaveState();
        });
    });

    $('#stsc_manager_overlay').on('change', '#stsc_preset_name', function () {
        const preset = getEditingPreset();
        if (!preset) return;
        const nextName = String(this.value || '').trim();
        if (!nextName) {
            toastr.warning('预设名称不能为空。', '写作前置自检');
            renderPresetsTab();
            return;
        }
        if (presetNameExists(nextName, preset.id)) {
            toastr.warning('已经存在同名预设，请换一个名称。', '写作前置自检');
            renderPresetsTab();
            return;
        }
        preset.name = nextName;
        markDirty();
        renderAll();
    });

    $('#stsc_manager_overlay').on('change', '#stsc_preset_enabled', function () {
        const preset = getEditingPreset();
        if (!preset) return;
        preset.enabled = this.checked;
        markDirty();
        renderAll();
    });

    $('#stsc_manager_overlay').on('input change', '[data-question-field]', function () {
        const preset = getEditingPreset();
        const card = $(this).closest('[data-question-id]');
        const question = preset?.questions.find(x => x.id === card.data('question-id'));
        if (!question) return;
        const field = $(this).data('question-field');
        question[field] = this.type === 'checkbox' ? this.checked : this.value;
        markDirty();
        renderCompact();
        renderManagerSubtitle();
    });

    $('#stsc_manager_overlay').on('input change', '[data-reference-field]', function () {
        const id = $(this).closest('[data-reference-id]').data('reference-id');
        const reference = getUiSettings().references.find(x => x.id === id);
        if (!reference) return;
        const field = $(this).data('reference-field');
        reference[field] = this.type === 'checkbox' ? this.checked : this.value;
        if (field === 'depth') reference.depth = clampNumber(reference.depth, 0, 20, 0);
        markDirty();
        renderCompact();
        renderManagerSubtitle();
    });

    $('#stsc_manager_overlay').on('input change', '[data-temp-field]', function () {
        const id = $(this).closest('[data-temp-id]').data('temp-id');
        const instruction = getUiSettings().temporaryInstructions.find(x => x.id === id);
        if (!instruction) return;
        instruction[$(this).data('temp-field')] = this.value;
        markDirty();
    });

    $('#stsc_manager_overlay').on('change', '[data-action="toggle-temp-selected"]', function () {
        const settings = getUiSettings();
        const id = $(this).closest('[data-temp-id]').data('temp-id');
        const selected = new Set(settings.pendingInstructionIds);
        this.checked ? selected.add(id) : selected.delete(id);
        settings.pendingInstructionIds = [...selected];
        markDirty();
        renderCompact();
        renderStatusTab();
    });

    $('#stsc_manager_overlay').on('change', '#stsc_setting_enabled', function () {
        getUiSettings().enabled = this.checked;
        markDirty();
        renderAll();
    });
    $('#stsc_manager_overlay').on('change', '#stsc_setting_mode', function () {
        getUiSettings().mode = this.value;
        markDirty();
        renderAll();
    });
    $('#stsc_manager_overlay').on('change', '#stsc_general_enabled', function () {
        getUiSettings().generalEnabled = this.checked;
        markDirty();
        renderAll();
    });
    $('#stsc_manager_overlay').on('change', '#stsc_character_enabled', function () {
        getUiSettings().characterEnabled = this.checked;
        markDirty();
        renderAll();
    });
    $('#stsc_manager_overlay').on('change', '#stsc_injection_position', function () {
        getUiSettings().injection.position = this.value;
        markDirty();
        renderAll();
    });
    $('#stsc_manager_overlay').on('change', '#stsc_injection_depth', function () {
        getUiSettings().injection.depth = clampNumber(this.value, 0, 20, 0);
        markDirty();
    });
    $('#stsc_manager_overlay').on('change', '#stsc_injection_role', function () {
        getUiSettings().injection.role = this.value;
        markDirty();
    });

    $('#stsc_manager_overlay').on('change', '#stsc_theme', function () {
        getUiSettings().appearance.theme = this.value;
        markDirty();
        applyTheme(getUiSettings());
        renderFloating();
    });
    $('#stsc_manager_overlay').on('change', '#stsc_floating_enabled', function () {
        getUiSettings().appearance.floatingEnabled = this.checked;
        markDirty();
        renderFloating();
    });

    $('#stsc_manager_overlay').on('click', '[data-action]', async function () {
        const action = $(this).data('action');
        const settings = getUiSettings();
        const preset = getEditingPreset(null, settings);

        if (action === 'open-create-preset') {
            openCreatePresetDialog($(this).data('kind'));
            return;
        } else if (action === 'copy-preset' && preset) {
            const copied = clone(preset);
            copied.id = uid('preset');
            copied.name = makeUniquePresetName(`${preset.name} 副本`);
            copied.questions = copied.questions.map(q => ({ ...q, id: uid('q') }));
            copied.boundCharacterKey = '';
            copied.boundCharacterName = '';
            settings.presets.push(copied);
            if (copied.kind === 'character') settings.ui.editingCharacterPresetId = copied.id;
            else settings.ui.editingGeneralPresetId = copied.id;
        } else if (action === 'delete-preset' && preset) {
            if (preset.kind === 'general' && settings.presets.filter(x => x.kind === 'general').length <= 1) {
                toastr.warning('至少要保留一个通用预设。', '写作前置自检');
                return;
            }
            settings.presets = settings.presets.filter(x => x.id !== preset.id);
            if (preset.kind === 'general') {
                const remaining = settings.presets.filter(x => x.kind === 'general');
                if (settings.generalPresetId === preset.id) settings.generalPresetId = remaining[0]?.id || '';
                settings.ui.editingGeneralPresetId = remaining[0]?.id || '';
            } else {
                settings.ui.editingCharacterPresetId = settings.presets.find(x => x.kind === 'character')?.id || '';
            }
        } else if (action === 'set-general-preset' && preset?.kind === 'general') {
            settings.generalPresetId = preset.id;
            settings.generalEnabled = true;
            toastr.success(`已将“${preset.name}”设为当前通用预设。`, '写作前置自检');
        } else if (action === 'bind-current-character' && preset?.kind === 'character') {
            const character = getCurrentCharacterEntity();
            if (!character.key) {
                toastr.warning('当前页面未找到角色卡，请先进入一个角色卡聊天页面。', '写作前置自检');
                return;
            }
            for (const other of settings.presets.filter(x => x.kind === 'character' && x.id !== preset.id && x.boundCharacterKey === character.key)) {
                other.boundCharacterKey = '';
                other.boundCharacterName = '';
            }
            preset.boundCharacterKey = character.key;
            preset.boundCharacterName = character.name;
            settings.characterEnabled = true;
            toastr.success(`已将“${preset.name}”绑定到 ${character.name}。`, '写作前置自检');
        } else if (action === 'unbind-preset' && preset?.kind === 'character') {
            preset.boundCharacterKey = '';
            preset.boundCharacterName = '';
        } else if (action === 'test-preset') {
            await testCurrentPreset();
            return;
        } else if (action === 'add-question' && preset) {
            preset.questions.push(createQuestion());
        } else if (action === 'open-batch-import' && preset) {
            openBulkImportDialog(preset);
            return;
        } else if (['delete-question', 'move-question-up', 'move-question-down'].includes(action) && preset) {
            const id = $(this).closest('[data-question-id]').data('question-id');
            const index = preset.questions.findIndex(x => x.id === id);
            if (index >= 0 && action === 'delete-question') preset.questions.splice(index, 1);
            if (index > 0 && action === 'move-question-up') [preset.questions[index - 1], preset.questions[index]] = [preset.questions[index], preset.questions[index - 1]];
            if (index >= 0 && index < preset.questions.length - 1 && action === 'move-question-down') [preset.questions[index + 1], preset.questions[index]] = [preset.questions[index], preset.questions[index + 1]];
        } else if (action === 'add-reference') {
            settings.references.push(createReference());
        } else if (action === 'delete-reference') {
            const id = $(this).closest('[data-reference-id]').data('reference-id');
            settings.references = settings.references.filter(x => x.id !== id);
        } else if (action === 'bind-reference-character') {
            const id = $(this).closest('[data-reference-id]').data('reference-id');
            const reference = settings.references.find(x => x.id === id);
            const character = getCurrentCharacterEntity();
            if (!reference || !character.key) {
                toastr.warning('当前页面未找到角色卡，请先进入一个角色卡聊天页面。', '写作前置自检');
                return;
            }
            reference.scope = 'character';
            reference.characterKey = character.key;
        } else if (action === 'add-temp') {
            settings.temporaryInstructions.push(createTemporaryInstruction());
        } else if (action === 'delete-temp') {
            const id = $(this).closest('[data-temp-id]').data('temp-id');
            settings.temporaryInstructions = settings.temporaryInstructions.filter(x => x.id !== id);
            settings.pendingInstructionIds = settings.pendingInstructionIds.filter(x => x !== id);
        } else if (action === 'clear-temp-selection') {
            settings.pendingInstructionIds = [];
        } else {
            return;
        }

        markDirty();
        renderAll();
    });

    $('#stsc_dialog_overlay').on('input', '#stsc_bulk_raw', function () {
        if (bulkDraft) bulkDraft.raw = this.value;
    });

    $('#stsc_dialog_overlay').on('input', '[data-bulk-field="text"]', function () {
        if (!bulkDraft) return;
        const index = Number($(this).closest('[data-bulk-index]').data('bulk-index'));
        if (Number.isInteger(index) && bulkDraft.items[index] !== undefined) bulkDraft.items[index] = this.value;
    });

    $('#stsc_dialog_overlay').on('keydown', '#stsc_new_preset_name', function (event) {
        if (event.key === 'Enter') {
            event.preventDefault();
            $('#stsc_dialog_overlay [data-dialog-action="create-preset"]').trigger('click');
        }
    });

    $('#stsc_dialog_overlay').on('click', '[data-dialog-action]', function () {
        const action = $(this).data('dialog-action');
        const settings = getUiSettings();

        if (action === 'unsaved-cancel') {
            pendingUnsavedAction = null;
            closeDialog();
            renderAll();
            return;
        }
        if (action === 'unsaved-discard') {
            const next = pendingUnsavedAction;
            pendingUnsavedAction = null;
            closeDialog();
            discardEditDraft();
            next?.();
            return;
        }
        if (action === 'unsaved-save') {
            const next = pendingUnsavedAction;
            pendingUnsavedAction = null;
            closeDialog();
            commitEditDraft({ notify: false });
            next?.();
            return;
        }

        if (action === 'cancel') {
            closeDialog();
            return;
        }
        if (action === 'create-preset') {
            const kind = $(this).data('kind') === 'character' ? 'character' : 'general';
            const name = String($('#stsc_new_preset_name').val() || '').trim();
            if (!name) {
                $('#stsc_new_preset_error').text('请输入预设名称。');
                return;
            }
            if (presetNameExists(name)) {
                $('#stsc_new_preset_error').text('已经存在同名预设，请换一个名称。');
                return;
            }
            const preset = createPreset(name, kind);
            settings.presets.push(preset);
            settings.ui.presetSection = kind;
            if (kind === 'character') settings.ui.editingCharacterPresetId = preset.id;
            else settings.ui.editingGeneralPresetId = preset.id;
            markDirty();
            closeDialog();
            renderAll();
            return;
        }
        if (action === 'recognize-bulk') {
            if (!bulkDraft) return;
            bulkDraft.raw = String($('#stsc_bulk_raw').val() || '');
            bulkDraft.items = splitBulkQuestions(bulkDraft.raw);
            if (!bulkDraft.items.length) toastr.warning('没有识别到明显的问题，请调整原文或手动补充。', '写作前置自检');
            renderBulkImportDialog();
            return;
        }
        if (action === 'add-bulk-item') {
            if (!bulkDraft) return;
            bulkDraft.raw = String($('#stsc_bulk_raw').val() || bulkDraft.raw || '');
            bulkDraft.items.push('');
            renderBulkImportDialog();
            setTimeout(() => $('#stsc_dialog_body [data-bulk-field="text"]').last().trigger('focus'), 0);
            return;
        }
        if (action === 'delete-bulk-item') {
            if (!bulkDraft) return;
            const index = Number($(this).closest('[data-bulk-index]').data('bulk-index'));
            if (Number.isInteger(index)) bulkDraft.items.splice(index, 1);
            renderBulkImportDialog();
            return;
        }
        if (action === 'confirm-bulk') {
            if (!bulkDraft) return;
            const preset = settings.presets.find(x => x.id === bulkDraft.presetId);
            const items = bulkDraft.items.map(x => String(x || '').trim()).filter(Boolean);
            if (!preset || !items.length) {
                toastr.warning('没有可以导入的问题。', '写作前置自检');
                return;
            }
            preset.questions.push(...items.map(text => createQuestion(text)));
            markDirty();
            const count = items.length;
            closeDialog();
            renderAll();
            toastr.success(`已确认导入 ${count} 个问题。`, '写作前置自检');
        }
    });

    const refreshFloatingLayout = () => {
        applyFloatingPosition(editDraft || normalizeSettings());
        layoutFloatingPanel();
    };
    $(window).on('resize.stscFloating orientationchange.stscFloating', refreshFloatingLayout);
    window.visualViewport?.addEventListener?.('resize', refreshFloatingLayout);
    window.visualViewport?.addEventListener?.('scroll', refreshFloatingLayout);

    window.addEventListener('beforeunload', function (event) {
        if (!editDirty) return;
        event.preventDefault();
        event.returnValue = '';
    });
}

function addExtensionsMenuButton() {
    if ($('#stsc_extensions_menu_button').length || !$('#extensionsMenu').length) return;
    const button = $(
        `<div id="stsc_extensions_menu_button" class="list-group-item flex-container flexGap5 interactable" title="打开写作前置自检">
            <i class="fa-solid fa-list-check"></i>
            <span>写作前置自检</span>
        </div>`
    );
    button.on('click', () => openManager('status'));
    $('#extensionsMenu').append(button);
}

async function initialize() {
    if (initialized) return;
    const context = ctx();
    if (!context) return;

    normalizeSettings();
    const html = await context.renderExtensionTemplateAsync(STSC_FOLDER, 'settings');
    // 管理器直接挂到 body，避免被“扩展”侧栏的宽度、overflow 或 transform 裁切。
    $('#stsc_manager_overlay, #stsc_dialog_overlay, #stsc_floating_root, #stsc_floating_panel').remove();
    $('body').append(html);
    initialized = true;
    bindUiEvents();
    addExtensionsMenuButton();
    const events = context.eventTypes || context.event_types;
    context.eventSource.on(events.MESSAGE_RECEIVED, handleMessageReceived);
    context.eventSource.on(events.CHARACTER_MESSAGE_RENDERED, handleCharacterMessageRendered);
    context.eventSource.on(events.CHAT_CHANGED, renderAll);
    context.eventSource.on(events.GENERATION_ENDED, onGenerationEnded);
    context.eventSource.on(events.GENERATION_STOPPED, onGenerationStopped);

    renderAll();
    console.info(`[STSC] 写作前置自检 v${STSC_VERSION} 已加载。`);
}

jQuery(() => {
    const context = ctx();
    const events = context?.eventTypes || context?.event_types;
    const start = async () => {
        try {
            await initialize();
        } catch (error) {
            console.error('[STSC] 插件初始化失败：', error);
            toastr.error('写作前置自检插件加载失败，请查看浏览器控制台。');
        }
    };

    if (context?.eventSource && events?.APP_READY) {
        context.eventSource.on(events.APP_READY, start);
    } else {
        start();
    }
});
