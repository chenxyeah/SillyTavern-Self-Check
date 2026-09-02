const STSC_MODULE = 'sillytavern_self_check';
const STSC_FOLDER = 'third-party/SillyTavern-Self-Check';
const STSC_CHAT_META_KEY = 'sillytavern_self_check_latest';
const STSC_VERSION = '0.4.0';
const STSC_DEV_MODULE = 'sillytavern_self_check_dev';
const STSC_DEV_MIGRATION_BACKUP = 'sillytavern_self_check_before_dev_import';
const STSC_LOG_LIMIT = 500;
const STSC_CHECK_TAG = 'stsc_self_check';
const STSC_RESPONSE_TAG = 'stsc_response';
const STSC_CHECK_OPEN_RE = /<stsc_self_check\b[^>]*>/i;
const STSC_CHECK_CLOSE_RE = /<\/stsc_self_check>/i;
const STSC_REVIEW_OPEN_RE = /<stsc_previous_review\b[^>]*>/i;
const STSC_REVIEW_CLOSE_RE = /<\/stsc_previous_review>/i;
const STSC_RESPONSE_OPEN_RE = /<stsc_response\b[^>]*>/i;
const STSC_RESPONSE_CLOSE_RE = /<\/stsc_response>/i;
const STSC_PRESET_EXPORT_FORMAT = 'sillytavern-self-check-preset';
const STSC_PRESET_EXPORT_VERSION = 1;
const STSC_PRESET_IMPORT_MAX_BYTES = 2 * 1024 * 1024;
const STSC_REFERENCE_EXPORT_FORMAT = 'sillytavern-self-check-reference';
const STSC_REFERENCE_EXPORT_VERSION = 1;
const STSC_REFERENCE_BUNDLE_EXPORT_FORMAT = 'sillytavern-self-check-reference-bundle';
const STSC_REFERENCE_BUNDLE_EXPORT_VERSION = 1;
const STSC_REFERENCE_IMPORT_MAX_BYTES = 16 * 1024 * 1024;
const STSC_BUILTIN_GENERAL_KEY = 'default-general-core-v1';
const STSC_BUILTIN_GENERAL_NAME = '默认通用自检';
const STSC_UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000;
const STSC_REMOTE_MANIFEST_URLS = Object.freeze([
    'https://raw.githubusercontent.com/chenxyeah/SillyTavern-Self-Check/main/manifest.json',
    'https://cdn.jsdelivr.net/gh/chenxyeah/SillyTavern-Self-Check@main/manifest.json',
    'https://api.github.com/repos/chenxyeah/SillyTavern-Self-Check/contents/manifest.json?ref=main',
]);
const STSC_REMOTE_RELEASE_URLS = Object.freeze([
    'https://raw.githubusercontent.com/chenxyeah/SillyTavern-Self-Check/main/version.json',
    'https://cdn.jsdelivr.net/gh/chenxyeah/SillyTavern-Self-Check@main/version.json',
    'https://api.github.com/repos/chenxyeah/SillyTavern-Self-Check/contents/version.json?ref=main',
]);
const STSC_EXTENSION_FOLDER_NAME = 'SillyTavern-Self-Check';
const STSC_RELEASE_INFO = Object.freeze({
    version: STSC_VERSION,
    releasedAt: '2026-09-03',
    title: 'DEV 功能正式迁入：双API、复盘与可靠性升级',
    changes: Object.freeze([
        '正式整合 beta.22 已验证功能：双API自检、上一轮复盘、强力YAML规范、运行日志与插件内更新。',
        '沿用正式版预设和角色绑定；可在插件设置中从同一酒馆的DEV迁入配置，并恢复迁入前的正式版设置。',
        '单API提示词新增严格输出边界：原有思维链必须先完整闭合，自检和最终正文必须位于思维链标签之外。',
        '双API普通注入与强力YAML规范同步加入正文边界要求，避免执行规范诱发正文顺序错乱。',
        '当模型把思维链标签错误地跨过插件自检区并包住正文时，插件会只修复这一处边界，不删除正常思维链。',
        '运行日志会明确记录“正文误入思维链但已自动分开”，方便判断是已修复的小格式问题还是仍需排查接口。',
        '若双API正文仍被完整包在思维链中且无法安全自动拆分，日志会明确报警并保留原文，避免误删正文或泄露隐藏推理。',
    ]),
});

const REFERENCE_TYPE_CONFIG = Object.freeze({
    style: Object.freeze({
        label: '文风',
        position: 'prompt',
        depth: 0,
        role: 'system',
        autoQuestion: '是否遵照【{{name}}】文风进行本轮写作？本轮将通过哪些具体语言、节奏与描写方式体现？',
        promptTitle: '文风',
        promptLead: '以下内容是本轮写作必须遵循的文风规范。请将其落实到措辞、句式、节奏、叙事视角与描写方式中，不要在正文中解释这些规则：',
    }),
    restriction: Object.freeze({
        label: '限制',
        position: 'chat',
        depth: 0,
        role: 'system',
        autoQuestion: '是否遵照【{{name}}】限制？本轮将如何具体执行，并避免出现违反限制的内容？',
        promptTitle: '强制限制',
        promptLead: '以下内容是本轮必须遵守的强制限制。其要求应优先落实到最终正文中，不得忽略、弱化、绕开或仅口头承诺：',
    }),
    other: Object.freeze({
        label: '其他',
        position: 'before',
        depth: 0,
        role: 'system',
        autoQuestion: '是否遵照【{{name}}】资料？本轮将如何具体体现其中要求？',
        promptTitle: '其他资料',
        promptLead: '以下内容是本轮需要参考并落实的外置资料。请结合当前剧情与角色设定执行，不要在正文中复述资料本身：',
    }),
});

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
    dualApi: {
        endpoint: '',
        apiKey: '',
        model: '',
        maxTokens: 4096,
        timeoutSeconds: 150,
        retryTransient: true,
        contextMode: 'recent5',
        customTurns: 5,
        transformFormat: false,
        failureMode: 'fallback_single',
        previousReview: false,
    },
    logs: [],
    logLastViewedAt: 0,
    presets: [],
    references: [],
    temporaryInstructions: [],
    pendingInstructionIds: [],
    persistentInstructionIds: [],
    appearance: {
        theme: 'default',
        floatingEnabled: false,
        floatingStyle: 'theme',
        floatingOpacity: 0.94,
        floatingButtonSize: 50,
        floatingWidth: 420,
        floatingHeight: 640,
        floatingPosition: {
            leftRatio: 0.82,
            topRatio: 0.68,
            edgeDock: '',
        },
    },
    migrations: {
        defaultGeneralCoreV1: false,
        defaultGeneralCoreV2: false,
        defaultGeneralCoreV3: false,
        defaultGeneralCoreV4: false,
        dualApiReliabilityV1: false,
    },
    updateNotice: {
        lastCheckedAt: 0,
        lastNotifiedAt: 0,
        lastSeenInstalledVersion: '',
        lastNotifiedVersion: '',
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
let dualApiBusy = false;
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
let expandedReferenceIds = new Set();
let expandedQuestionIds = new Set();
let expandedInstructionIds = new Set();
let floatingPanelPage = 'check';
let pendingDeleteRequest = null;
let updateCheckInFlight = false;
let updatePollTimer = null;
let updateToast = null;
let updateAvailableVersion = '';
let gitUpdateAvailable = false;
let latestRemoteReleaseInfo = null;
let updateCheckState = 'idle';
let updateCheckError = '';
let updateCheckDiagnostics = [];
let installedExtensionGitState = 'unknown';
let lastRuntimeUpdateCheckAt = 0;
let dualApiModels = [];
let dualApiModelsLoading = false;
let dualApiModelsError = '';
let dualApiModelsSignature = '';
let dualApiModelFetchTimer = null;

function sanitizeLogText(value) {
    return String(value ?? '')
        .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [已隐藏]')
        .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/gi, '[API密钥已隐藏]')
        .slice(0, 6000);
}

function compactRuntimeLogMessage(level, stage, message, handling = '') {
    const stageText = String(stage || '运行');
    const source = String(message || '');
    const handlingText = String(handling || '');
    if (stageText === '自检解析') {
        if (/^角色卡“/.test(source)) return source.length > 500 ? `${source.slice(0, 500)}…` : source;
        const countMatch = handlingText.match(/(\d+)\s*\/\s*(\d+)/);
        if (countMatch && countMatch[1] !== countMatch[2]) return `自检回答不完整：识别到 ${countMatch[1]}/${countMatch[2]} 题。`;
        if (/结束标签缺失|没有正确闭合|自动补全/.test(source)) return '自检标签不完整，插件已自动修复。';
        if (/没有输出|未输出|完全没有/.test(source)) return '本轮没有检测到完整的自检输出。';
        return '自检输出格式不完整。';
    }
    if (stageText === '自检API') {
        if (/^角色卡“/.test(source)) return source.length > 600 ? `${source.slice(0, 600)}…` : source;
        if (/超时|超过\s*\d+\s*秒/.test(source)) return `自检API等了很久仍没有回答。${source}`.slice(0, 600);
        if (/401|403|密钥|认证|授权/.test(source)) return `自检API拒绝了请求，请检查API密钥和账号权限。${source}`.slice(0, 600);
        if (/429|限流|请求过多|额度/.test(source)) return `自检API当前太忙、请求次数过多或额度不足。${source}`.slice(0, 600);
        return `没有成功调用自检API：${source || '没有收到具体原因。'}`.slice(0, 600);
    }
    return source.length > 600 ? `${source.slice(0, 600)}…` : source;
}

function addRuntimeLog(level, stage, message, handling = '') {
    const settings = normalizeSettings();
    if (!settings) return;
    const compactMessage = compactRuntimeLogMessage(level, stage, message, handling);
    settings.logs.unshift({ id: uid('log'), timestamp: Date.now(), level, stage: sanitizeLogText(stage), message: sanitizeLogText(compactMessage), handling: sanitizeLogText(handling).slice(0, 240) });
    settings.logs = settings.logs.slice(0, STSC_LOG_LIMIT);
    saveSettings();
    renderLogBadge();
}

function plainSelfCheckIssue(issue) {
    const text = String(issue || '');
    if (/整段可见回复.*思维链|最终正文.*推理标签/.test(text)) return '正文AI把整段可见回复都放进了思维链，插件无法安全猜出里面哪一段才是正文，所以没有强行删除内容。';
    if (/酒馆主API.*重复输出|意外重复输出/.test(text)) return '正文AI把插件内部自检也写进了正文，插件已经自动删掉。';
    if (/结束标签缺失|没有正确闭合|自动补全/.test(text)) return '自检内容的结尾格式没有写完整，插件已经自动补齐。';
    if (/没有按要求输出.*stsc_self_check|没有检测到|没有输出|未输出|完全没有/.test(text)) return 'AI没有输出插件能够识别的自检内容。';
    if (/缺少回答|必要依据|回答不完整|格式不完整/.test(text)) return 'AI返回了自检内容，但有题目漏答或缺少必须提供的依据。';
    return text.replace(/<\/?stsc_[^>]+>/gi, '自检格式标记').replace(/<\/?(?:item|answer|evidence)[^>]*>/gi, '');
}

function runtimeCharacterLabel(latest) {
    const name = String(latest?.characterName || '').trim() || '未识别角色';
    return `角色卡“${name}”`;
}

function addGenerationResultLog(latest, visibleBody = '') {
    if (!latest) return;
    const character = runtimeCharacterLabel(latest);
    const mode = latest.mode === 'dual_api' ? '双API' : '单API';
    const answered = Math.max(0, Number(latest.answeredCount) || 0);
    const expected = Math.max(0, Number(latest.expectedCount) || 0);
    const countText = expected ? `${answered}/${expected} 题` : `${answered} 题`;
    const hasBody = Boolean(String(visibleBody || '').trim());
    const formatDetails = (latest.formatIssues || []).map(plainSelfCheckIssue).filter(Boolean);
    const repairedReasoningBoundary = (latest.recoveryNotes || []).some(note => /正文.*思维链|推理标签.*正文/.test(String(note)));
    const handlingParts = [`本轮使用${mode}模式。`];
    let level = 'info';
    let message = '';

    if (!hasBody) {
        level = 'error';
        message = `${character}：AI这次没有生成可显示的正文。自检识别到 ${countText}。`;
        handlingParts.push('请重新生成；如果反复出现，请检查主API连接和模型是否正常。');
    } else if (latest.status === 'missing' || answered === 0) {
        level = 'warning';
        message = `${character}：正文已经输出，但没有找到插件要求的自检回答。`;
        handlingParts.push('正文已保留；本轮没有可用的自检结论。请检查当前模式、提示词是否被其他预设覆盖，或查看前后的API记录。');
    } else if (latest.status === 'format_error' || (expected && answered < expected)) {
        level = 'warning';
        message = `${character}：收到了自检内容，但只完整识别到 ${countText}；正文已经输出。`;
        handlingParts.push('插件已保留能够识别的答案。');
        if (formatDetails.length) handlingParts.push(`具体情况：${formatDetails.join('；')}`);
    } else if (latest.status === 'recovered') {
        message = `${character}：自检输出完成，共完成 ${countText}，正文也已正常输出。`;
        handlingParts.push(repairedReasoningBoundary
            ? 'AI原本把自检和正文一起包进了思维链，插件已经自动把正文分到思维链外，无需手动处理。'
            : 'AI最初的格式有小问题，插件已经自动修好，无需手动处理。');
    } else {
        message = `${character}：自检输出完成，共完成 ${countText}，正文也已正常输出。`;
        handlingParts.push('本轮运行正常，无需处理。');
    }

    const review = latest.previousReview;
    if (review?.status === 'missing') {
        if (level === 'info') level = 'warning';
        handlingParts.push('本轮自检正常，但AI漏掉了上一轮复盘；插件下一轮还会继续尝试。');
    } else if (review?.issues?.length) {
        handlingParts.push(`上一轮复盘发现 ${review.issues.length} 条疑似问题，可到“复盘线索”中查看和选择。`);
    } else if (review?.status === 'ok') {
        handlingParts.push('上一轮复盘也已完成，没有发现明显问题。');
    }

    addRuntimeLog(level, '本轮结果', message, handlingParts.join(' '));
}

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

function decodeXmlEntities(value) {
    let text = String(value ?? '');
    // 独立自检API有时会提前把 <status_top> 等标签转成 &lt;...&gt;，
    // 若这里再次直接转义，就会得到 &amp;lt;...&amp;gt;。最多解码三轮，
    // 先还原已有实体，再由 escapeXml 统一只转义一次。
    for (let pass = 0; pass < 3; pass++) {
        const decoded = text
            .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
            .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number.parseInt(dec, 10)))
            .replace(/&lt;/gi, '<')
            .replace(/&gt;/gi, '>')
            .replace(/&quot;/gi, '"')
            .replace(/&apos;|&#039;/gi, "'")
            .replace(/&amp;/gi, '&');
        if (decoded === text) break;
        text = decoded;
    }
    return text;
}

function escapeXml(value) {
    return escapeHtml(value);
}

function wrapXmlCdata(value) {
    const text = decodeXmlEntities(value);
    // CDATA 内可直接保留 <status_top> 等原始尖括号标签。
    // 若内容本身包含 CDATA 结束标记，则拆分为相邻的 CDATA 段，避免破坏外层协议结构。
    return `<![CDATA[${text.replaceAll(']]>', ']]]]><![CDATA[>')}]]>`;
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
    // 正式版优先：同时关闭 DEV 的消息处理，避免两套解析器改写同一条回复。
    const devSettings = all[STSC_DEV_MODULE];
    if (settings.enabled && devSettings?.enabled) {
        devSettings.enabled = false;
        context.saveSettingsDebounced?.();
    }

    // beta.7：双阶段严格模式已移除。旧设置自动迁移为单API调用，避免保留不可执行的模式值。
    if (settings.mode === 'strict') settings.mode = 'single';
    settings.mode = ['single', 'dual_api'].includes(settings.mode) ? settings.mode : 'single';
    if (!settings.dualApi || typeof settings.dualApi !== 'object') settings.dualApi = clone(DEFAULT_SETTINGS.dualApi);
    settings.dualApi.endpoint = String(settings.dualApi.endpoint || '');
    settings.dualApi.apiKey = String(settings.dualApi.apiKey || '');
    settings.dualApi.model = String(settings.dualApi.model || '');
    settings.dualApi.maxTokens = clampNumber(settings.dualApi.maxTokens, 256, 12000, 4096);
    settings.dualApi.timeoutSeconds = clampNumber(settings.dualApi.timeoutSeconds, 60, 300, 150);
    settings.dualApi.retryTransient = Boolean(settings.dualApi.retryTransient);
    // beta.3：聊天范围只保留“默认最近5轮 / 自定义 / 全部”。旧界面的跟随、10轮、20轮统一迁移为最近5轮。
    settings.dualApi.contextMode = ['recent5', 'custom', 'all'].includes(settings.dualApi.contextMode) ? settings.dualApi.contextMode : 'recent5';
    settings.dualApi.customTurns = clampNumber(settings.dualApi.customTurns, 1, 100, 5);
    settings.dualApi.transformFormat = Boolean(settings.dualApi.transformFormat);
    settings.dualApi.failureMode = ['fallback_single', 'stop'].includes(settings.dualApi.failureMode) ? settings.dualApi.failureMode : 'fallback_single';
    settings.dualApi.previousReview = Boolean(settings.dualApi.previousReview);
    let compactedLegacyLogs = false;
    if (!Array.isArray(settings.logs)) settings.logs = [];
    settings.logs = settings.logs.filter(item => item && typeof item === 'object').slice(0, STSC_LOG_LIMIT);
    for (const item of settings.logs) {
        const alreadyCompact = /^(?:自检回答不完整|自检标签不完整|自检输出格式不完整|本轮没有检测到完整的自检输出)/.test(String(item.message || ''));
        if (item.stage === '自检解析' && !alreadyCompact) {
            item.message = compactRuntimeLogMessage(item.level, item.stage, item.message, item.handling);
            item.handling = sanitizeLogText(item.handling).slice(0, 240);
            compactedLegacyLogs = true;
        }
    }
    settings.logLastViewedAt = Math.max(0, Number(settings.logLastViewedAt) || 0);

    if (!Array.isArray(settings.presets)) settings.presets = [];
    if (!Array.isArray(settings.references)) settings.references = [];
    if (!Array.isArray(settings.temporaryInstructions)) settings.temporaryInstructions = [];
    if (!Array.isArray(settings.pendingInstructionIds)) settings.pendingInstructionIds = [];
    if (!Array.isArray(settings.persistentInstructionIds)) settings.persistentInstructionIds = [];
    if (!settings.characterBindings || typeof settings.characterBindings !== 'object') settings.characterBindings = {};
    if (!settings.appearance || typeof settings.appearance !== 'object') settings.appearance = clone(DEFAULT_SETTINGS.appearance);
    if (!settings.updateNotice || typeof settings.updateNotice !== 'object') settings.updateNotice = clone(DEFAULT_SETTINGS.updateNotice);
    settings.updateNotice.lastCheckedAt = Math.max(0, Number(settings.updateNotice.lastCheckedAt) || 0);
    settings.updateNotice.lastNotifiedAt = Math.max(0, Number(settings.updateNotice.lastNotifiedAt) || 0);
    settings.updateNotice.lastSeenInstalledVersion = String(settings.updateNotice.lastSeenInstalledVersion || '');
    settings.updateNotice.lastNotifiedVersion = String(settings.updateNotice.lastNotifiedVersion || '');
    settings.appearance.theme = ['default', 'rose', 'blue', 'mint', 'violet', 'gold'].includes(settings.appearance.theme) ? settings.appearance.theme : 'default';
    settings.appearance.floatingEnabled = Boolean(settings.appearance.floatingEnabled);
    settings.appearance.floatingStyle = ['theme', 'glass', 'solid', 'minimal'].includes(settings.appearance.floatingStyle) ? settings.appearance.floatingStyle : 'theme';
    // v0.2.4 起该字段表示悬浮按钮背景透明度，不再控制悬浮面板整体。
    settings.appearance.floatingOpacity = clampNumber(settings.appearance.floatingOpacity, 0.1, 1, 0.94);
    // v0.3.4：悬浮按钮大小可在 34px 到原始 50px 之间自由调整。
    settings.appearance.floatingButtonSize = clampNumber(settings.appearance.floatingButtonSize, 34, 50, 50);
    settings.appearance.floatingWidth = clampNumber(settings.appearance.floatingWidth, 300, 680, 420);
    settings.appearance.floatingHeight = clampNumber(settings.appearance.floatingHeight, 300, 820, 640);
    if (!settings.appearance.floatingPosition || typeof settings.appearance.floatingPosition !== 'object') {
        settings.appearance.floatingPosition = clone(DEFAULT_SETTINGS.appearance.floatingPosition);
    }
    // 兼容 v0.1.4 以前“只贴左右边缘”的位置格式，迁移成全屏自由坐标。
    if (settings.appearance.floatingPosition.leftRatio === undefined) {
        settings.appearance.floatingPosition.leftRatio = settings.appearance.floatingPosition.side === 'left' ? 0.04 : 0.82;
    }
    settings.appearance.floatingPosition.leftRatio = clampNumber(settings.appearance.floatingPosition.leftRatio, 0, 1, 0.82);
    settings.appearance.floatingPosition.topRatio = clampNumber(settings.appearance.floatingPosition.topRatio, 0, 1, 0.68);
    settings.appearance.floatingPosition.edgeDock = ['left', 'right'].includes(settings.appearance.floatingPosition.edgeDock)
        ? settings.appearance.floatingPosition.edgeDock
        : '';
    delete settings.appearance.floatingPosition.side;

    let settingsMigrated = compactedLegacyLogs;
    if (!settings.migrations.dualApiReliabilityV1) {
        // beta.17：旧版默认 2000 Token 容易在 6～8 题时截断；只迁移旧默认值，保留用户主动设置的其他数值。
        if (Math.round(settings.dualApi.maxTokens) === 2000) settings.dualApi.maxTokens = 4096;
        settings.migrations.dualApiReliabilityV1 = true;
        settingsMigrated = true;
    }
    if (settings.presets.length === 0) {
        const general = createBuiltInGeneralPreset();
        settings.presets.push(general);
        settings.generalPresetId = general.id;
        settings.migrations.defaultGeneralCoreV1 = true;
        settingsMigrated = true;
    }

    const legacyGeneralId = settings.generalPresetId || settings.presets[0]?.id || '';
    const legacyCharacterPresetIds = new Set(Object.values(settings.characterBindings));
    for (const preset of settings.presets) {
        if (!preset.kind) {
            preset.kind = preset.id !== legacyGeneralId && legacyCharacterPresetIds.has(preset.id) ? 'character' : 'general';
        }
        normalizePreset(preset);
    }

    if (!settings.migrations.defaultGeneralCoreV1) {
        ensureBuiltInGeneralPreset(settings);
        settings.migrations.defaultGeneralCoreV1 = true;
        settingsMigrated = true;
    }

    if (!settings.migrations.defaultGeneralCoreV2) {
        migrateBuiltInGeneralPresetV2(settings);
        settings.migrations.defaultGeneralCoreV2 = true;
        settingsMigrated = true;
    }

    // v0.2.6：上一版迁移依赖整段文字完全匹配。部分用户的内置题目文本
    // 曾被旧版本规范化或轻微改写，导致类型没有从判断题改成开放问答。
    // 这里按“内置预设 + 题目标题”再次修复，已跑过 v0.2.5 的用户也会生效。
    if (!settings.migrations.defaultGeneralCoreV3) {
        migrateBuiltInGeneralPresetV3(settings);
        settings.migrations.defaultGeneralCoreV3 = true;
        settingsMigrated = true;
    }

    // v0.2.7：将内置“默认通用自检”的六道核心题全部改为开放问答。
    // 迁移只处理内置默认预设，不影响用户自行创建的其他预设。
    if (!settings.migrations.defaultGeneralCoreV4) {
        migrateBuiltInGeneralPresetV4(settings);
        settings.migrations.defaultGeneralCoreV4 = true;
        settingsMigrated = true;
    }

    let generalPresets = settings.presets.filter(x => x.kind === 'general');
    if (!generalPresets.length) {
        const general = createBuiltInGeneralPreset();
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
    settings.ui.activeTab = ['status', 'presets', 'references', 'temporary', 'settings', 'appearance'].includes(settings.ui.activeTab) ? settings.ui.activeTab : 'status';
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
    const validInstructionIds = new Set(settings.temporaryInstructions.map(instruction => instruction.id));
    settings.persistentInstructionIds = [...new Set(settings.persistentInstructionIds.filter(id => validInstructionIds.has(id)))];
    const persistentIds = new Set(settings.persistentInstructionIds);
    settings.pendingInstructionIds = [...new Set(settings.pendingInstructionIds.filter(id => validInstructionIds.has(id) && !persistentIds.has(id)))];

    if (settingsMigrated) context.saveSettingsDebounced?.();
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

function createBuiltInGeneralPreset() {
    const preset = createPreset(STSC_BUILTIN_GENERAL_NAME, 'general');
    preset.builtinKey = STSC_BUILTIN_GENERAL_KEY;
    preset.questions = [
        createQuestion('【固定格式完整性】本轮需要输出哪些由角色卡、世界书、参考资料库或当前预设明确要求的固定格式？请逐项确认它们应出现的位置、顺序、标签和字段，并说明如何避免遗漏、重复、擅自改名，或在没有相关要求时自行添加格式。', 'open', 'standard', true),
        createQuestion('【角色信息边界与上帝视角】本轮角色能够依据哪些已知信息作出判断？请说明这些信息来自亲眼所见、亲耳所闻、他人告知、过往经历还是合理推测，并指出如何避免读取{{user}}或其他角色内心、知晓未曾接触的信息、提前知道场外事件，或把推测写成确定事实。', 'open', 'standard', true),
        createQuestion('【情绪强度与占有欲】本轮角色会出现怎样的情绪及其强度？请结合角色设定、事件刺激、当前关系阶段与此前情绪积累说明依据，并说明如何避免无铺垫的暴怒、崩溃、嫉妒、偏执或过度占有。若强烈占有欲属于角色设定，应如何将其作为角色的欲望或缺陷体现，同时保留{{user}}的完整人权、独立意志与拒绝权？', 'open', 'standard', true),
        createQuestion('【关系阶段与亲密行为】当前角色与{{user}}处于什么关系阶段？本轮允许出现怎样的态度、信任、依赖、暧昧、身体接触与情感表达？请说明如何避免缺乏事件推动的突然心软、突然深爱、突然吃醋、突然表白、突然亲密或默认恋爱关系；若角色本身轻浮、冲动或擅长调情，也应区分表面行为与真实感情进度。', 'open', 'standard', true),
        createQuestion('【角色一致性但不僵化】本轮准备如何体现角色的核心性格、立场与个人习惯？角色可能因当前事件产生哪些合理的犹豫、矛盾或变化？请说明如何在避免 OOC 的同时，不把角色演绎成僵硬不变的设定集合。', 'open', 'standard', true),
        createQuestion('【真实人类表达】本轮角色的台词、旁白和心理活动准备采用怎样的表达方式？请结合当前情境说明如何体现角色个人语气，并避免报告式分析、术语堆砌、长篇说教、机械总结或过度准确地解释心理。', 'open', 'standard', true),
    ];
    return preset;
}

function isLegacyInitialGeneralPreset(preset) {
    if (!preset || preset.kind !== 'general') return false;
    if (!['默认（初始默认）', '通用自检预设'].includes(String(preset.name || '').trim())) return false;
    const legacyQuestions = [
        '当前角色与{{user}}处于什么关系阶段？本轮应当如何表现？',
        '本轮是否出现了缺少剧情或设定依据的好感、亲密或占有欲？',
        '本轮是否尊重{{user}}的行动、语言和心理自主权？',
    ];
    const actual = (preset.questions || []).map(question => String(question.text || '').trim());
    return actual.length === legacyQuestions.length && legacyQuestions.every((question, index) => actual[index] === question);
}

function ensureBuiltInGeneralPreset(settings) {
    let builtin = settings.presets.find(preset => preset.kind === 'general' && preset.builtinKey === STSC_BUILTIN_GENERAL_KEY);
    if (builtin) return builtin;

    const current = settings.presets.find(preset => preset.id === settings.generalPresetId && preset.kind === 'general');
    const shouldReplaceLegacySelection = isLegacyInitialGeneralPreset(current);
    builtin = createBuiltInGeneralPreset();
    settings.presets.push(builtin);

    if (shouldReplaceLegacySelection || !settings.generalPresetId) {
        settings.generalPresetId = builtin.id;
        if (settings.ui) settings.ui.editingGeneralPresetId = builtin.id;
    }
    return builtin;
}

function migrateBuiltInGeneralPresetV2(settings) {
    const builtin = ensureBuiltInGeneralPreset(settings);
    if (!builtin) return;

    const migrations = [
        {
            title: '【角色一致性但不僵化】',
            oldText: '【角色一致性但不僵化】本轮角色的语言、行为、判断与情绪是否能够从其设定、当前处境和已发生事件中得到解释？是否避免为了推动剧情而突然降智、失去原则、改变立场或表现出不属于该角色的习惯？同时是否避免把角色设定机械化，允许角色因具体事件产生合理的犹豫、变化、矛盾和成长。',
            newText: '【角色一致性但不僵化】本轮准备如何体现角色的核心性格、立场与个人习惯？角色可能因当前事件产生哪些合理的犹豫、矛盾或变化？请说明如何在避免 OOC 的同时，不把角色演绎成僵硬不变的设定集合。',
        },
        {
            title: '【真实人类表达】',
            oldText: '【真实人类表达】本轮台词、旁白与心理活动是否符合真实人类在当前场景中的表达习惯？是否避免过度分析、持续总结、堆砌术语、机械解释心理、像报告一样列出结论，或把简单情绪包装成复杂理论？聪明、理性或专业能力应更多通过判断、反应和行动体现，同时保留个人语气、情绪、缺点与认知局限。',
            newText: '【真实人类表达】本轮角色的台词、旁白和心理活动准备采用怎样的表达方式？请结合当前情境说明如何体现角色个人语气，并避免报告式分析、术语堆砌、长篇说教、机械总结或过度准确地解释心理。',
        },
    ];

    for (const migration of migrations) {
        const question = builtin.questions.find(item => String(item.text || '').trim() === migration.oldText);
        if (!question) continue;
        question.text = migration.newText;
        question.type = 'open';
        question.length = 'standard';
        question.requireEvidence = true;
    }
}

function migrateBuiltInGeneralPresetV3(settings) {
    const targetPresets = settings.presets.filter(preset =>
        preset.kind === 'general'
        && (preset.builtinKey === STSC_BUILTIN_GENERAL_KEY || String(preset.name || '').trim() === STSC_BUILTIN_GENERAL_NAME)
    );

    const repairs = [
        {
            title: '【角色一致性但不僵化】',
            newText: '【角色一致性但不僵化】本轮准备如何体现角色的核心性格、立场与个人习惯？角色可能因当前事件产生哪些合理的犹豫、矛盾或变化？请说明如何在避免 OOC 的同时，不把角色演绎成僵硬不变的设定集合。',
            legacyHints: ['本轮角色的语言、行为、判断与情绪是否能够', '是否避免为了推动剧情而突然降智'],
        },
        {
            title: '【真实人类表达】',
            newText: '【真实人类表达】本轮角色的台词、旁白和心理活动准备采用怎样的表达方式？请结合当前情境说明如何体现角色个人语气，并避免报告式分析、术语堆砌、长篇说教、机械总结或过度准确地解释心理。',
            legacyHints: ['本轮台词、旁白与心理活动是否符合真实人类', '是否避免过度分析、持续总结'],
        },
    ];

    for (const preset of targetPresets) {
        for (const repair of repairs) {
            const question = (preset.questions || []).find(item => String(item.text || '').trim().startsWith(repair.title));
            if (!question) continue;

            const currentText = String(question.text || '').trim();
            const looksLikeOldDefault = repair.legacyHints.some(hint => currentText.includes(hint));
            if (looksLikeOldDefault) question.text = repair.newText;

            // 即使文字因旧版空格、标点或本地保存差异没有完全匹配，
            // 只要仍是内置默认题，就确保题型正确迁移为开放问答。
            question.type = 'open';
            question.length = 'standard';
            question.requireEvidence = true;
        }
    }
}

function migrateBuiltInGeneralPresetV4(settings) {
    const targetPresets = settings.presets.filter(preset =>
        preset.kind === 'general'
        && (preset.builtinKey === STSC_BUILTIN_GENERAL_KEY || String(preset.name || '').trim() === STSC_BUILTIN_GENERAL_NAME)
    );

    const openQuestions = [
        {
            title: '【固定格式完整性】',
            text: '【固定格式完整性】本轮需要输出哪些由角色卡、世界书、参考资料库或当前预设明确要求的固定格式？请逐项确认它们应出现的位置、顺序、标签和字段，并说明如何避免遗漏、重复、擅自改名，或在没有相关要求时自行添加格式。',
        },
        {
            title: '【角色信息边界与上帝视角】',
            text: '【角色信息边界与上帝视角】本轮角色能够依据哪些已知信息作出判断？请说明这些信息来自亲眼所见、亲耳所闻、他人告知、过往经历还是合理推测，并指出如何避免读取{{user}}或其他角色内心、知晓未曾接触的信息、提前知道场外事件，或把推测写成确定事实。',
        },
        {
            title: '【情绪强度与占有欲】',
            text: '【情绪强度与占有欲】本轮角色会出现怎样的情绪及其强度？请结合角色设定、事件刺激、当前关系阶段与此前情绪积累说明依据，并说明如何避免无铺垫的暴怒、崩溃、嫉妒、偏执或过度占有。若强烈占有欲属于角色设定，应如何将其作为角色的欲望或缺陷体现，同时保留{{user}}的完整人权、独立意志与拒绝权？',
        },
        {
            title: '【关系阶段与亲密行为】',
            text: '【关系阶段与亲密行为】当前角色与{{user}}处于什么关系阶段？本轮允许出现怎样的态度、信任、依赖、暧昧、身体接触与情感表达？请说明如何避免缺乏事件推动的突然心软、突然深爱、突然吃醋、突然表白、突然亲密或默认恋爱关系；若角色本身轻浮、冲动或擅长调情，也应区分表面行为与真实感情进度。',
        },
        {
            title: '【角色一致性但不僵化】',
            text: '【角色一致性但不僵化】本轮准备如何体现角色的核心性格、立场与个人习惯？角色可能因当前事件产生哪些合理的犹豫、矛盾或变化？请说明如何在避免 OOC 的同时，不把角色演绎成僵硬不变的设定集合。',
        },
        {
            title: '【真实人类表达】',
            text: '【真实人类表达】本轮角色的台词、旁白和心理活动准备采用怎样的表达方式？请结合当前情境说明如何体现角色个人语气，并避免报告式分析、术语堆砌、长篇说教、机械总结或过度准确地解释心理。',
        },
    ];

    for (const preset of targetPresets) {
        for (const config of openQuestions) {
            const question = (preset.questions || []).find(item => String(item.text || '').trim().startsWith(config.title));
            if (!question) continue;
            question.text = config.text;
            question.type = 'open';
            question.length = 'standard';
            question.requireEvidence = true;
        }
    }
}

function normalizePreset(preset) {
    preset.id ||= uid('preset');
    preset.name ||= '未命名预设';
    preset.kind = preset.kind === 'character' ? 'character' : 'general';
    if (preset.enabled === undefined) preset.enabled = true;
    if (!Array.isArray(preset.questions)) preset.questions = [];
    preset.boundCharacterKey ||= '';
    preset.boundCharacterName ||= '';
    preset.builtinKey = String(preset.builtinKey || '');
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

function referenceTypeConfig(type) {
    return REFERENCE_TYPE_CONFIG[type] || REFERENCE_TYPE_CONFIG.other;
}

function createReference(name = '新参考资料', type = 'other') {
    const config = referenceTypeConfig(type);
    return {
        id: uid('ref'),
        name,
        type: Object.hasOwn(REFERENCE_TYPE_CONFIG, type) ? type : 'other',
        content: '',
        enabled: true,
        scope: 'global',
        characterKey: '',
        position: config.position,
        depth: config.depth,
        role: config.role,
        addToCheck: false,
        autoQuestion: config.autoQuestion,
    };
}

function normalizeReference(reference) {
    reference.type = Object.hasOwn(REFERENCE_TYPE_CONFIG, reference.type) ? reference.type : 'other';
    const defaults = createReference('新参考资料', reference.type);
    for (const [key, value] of Object.entries(defaults)) {
        if (!Object.hasOwn(reference, key)) reference[key] = value;
    }
    reference.id ||= uid('ref');
    reference.name ||= '未命名资料';
    reference.content ||= '';
    reference.enabled = Boolean(reference.enabled);
    reference.scope = reference.scope === 'character' ? 'character' : 'global';
    reference.characterKey ||= '';
    reference.position = ['before', 'prompt', 'chat'].includes(reference.position) ? reference.position : defaults.position;
    reference.role = ['system', 'user', 'assistant'].includes(reference.role) ? reference.role : defaults.role;
    reference.depth = clampNumber(reference.depth, 0, 20, defaults.depth);
    reference.addToCheck = Boolean(reference.addToCheck);
    reference.autoQuestion = String(reference.autoQuestion || defaults.autoQuestion);
}

function applyReferenceTypeDefaults(reference, nextType, { preserveCustomQuestion = true } = {}) {
    if (!reference) return;
    const previousConfig = referenceTypeConfig(reference.type);
    const nextConfig = referenceTypeConfig(nextType);
    const currentQuestion = String(reference.autoQuestion || '').trim();
    const isDefaultQuestion = !currentQuestion || Object.values(REFERENCE_TYPE_CONFIG).some(config => config.autoQuestion === currentQuestion) || currentQuestion === previousConfig.autoQuestion;
    reference.type = Object.hasOwn(REFERENCE_TYPE_CONFIG, nextType) ? nextType : 'other';
    reference.position = nextConfig.position;
    reference.depth = nextConfig.depth;
    reference.role = nextConfig.role;
    if (!preserveCustomQuestion || isDefaultQuestion) reference.autoQuestion = nextConfig.autoQuestion;
}

function createTemporaryInstruction() {
    return {
        id: uid('temp'),
        name: '新快捷指令',
        content: '',
    };
}

function normalizeTemporaryInstruction(instruction) {
    instruction.id ||= uid('temp');
    instruction.name ||= '未命名快捷指令';
    instruction.content ||= '';
}

function instructionActivationMode(id, settings = getUiSettings()) {
    if (settings.persistentInstructionIds?.includes(id)) return 'always';
    if (settings.pendingInstructionIds?.includes(id)) return 'once';
    return 'off';
}

function instructionActivationLabel(mode) {
    return {
        always: '常开',
        once: '临时一轮',
        off: '未启用',
    }[mode] || '未启用';
}

function applyInstructionActivation(target, id, mode) {
    if (!target) return;
    if (!Array.isArray(target.pendingInstructionIds)) target.pendingInstructionIds = [];
    if (!Array.isArray(target.persistentInstructionIds)) target.persistentInstructionIds = [];

    target.pendingInstructionIds = target.pendingInstructionIds.filter(value => value !== id);
    target.persistentInstructionIds = target.persistentInstructionIds.filter(value => value !== id);

    if (mode === 'once') target.pendingInstructionIds.push(id);
    if (mode === 'always') target.persistentInstructionIds.push(id);
}

function setInstructionActivation(id, mode) {
    const actual = normalizeSettings();
    const instruction = actual.temporaryInstructions.find(item => item.id === id);
    if (!instruction) return false;
    if (mode !== 'off' && !String(instruction.content || '').trim()) {
        toastr.warning('这条指令还没有填写内容，请先在完整管理器中编辑并保存。', '墨提斯之镜');
        return false;
    }

    const normalizedMode = ['off', 'once', 'always'].includes(mode) ? mode : 'off';
    applyInstructionActivation(actual, id, normalizedMode);
    if (editDraft) applyInstructionActivation(editDraft, id, normalizedMode);
    saveSettings();
    renderCompact();
    renderStatusTab();
    renderTemporaryTab();
    renderFloating();
    return true;
}

function clampNumber(value, min, max, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(max, Math.max(min, number));
}

function normalizeDualApiBaseUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';

    try {
        const url = new URL(raw);
        url.hash = '';
        url.search = '';
        let path = url.pathname.replace(/\/+$/g, '');
        path = path
            .replace(/\/chat\/completions$/i, '')
            .replace(/\/responses$/i, '')
            .replace(/\/models$/i, '');
        url.pathname = path || '/';
        return url.toString().replace(/\/+$/g, '');
    } catch {
        return '';
    }
}

function dualApiConnectionSignature(dual = getUiSettings()?.dualApi) {
    if (!dual) return '';
    return `${normalizeDualApiBaseUrl(dual.endpoint)}\n${String(dual.apiKey || '')}`;
}

function extractDualApiModelIds(payload) {
    const candidates = [
        payload?.data,
        payload?.data?.data,
        payload?.models,
        payload?.result,
    ];
    const list = candidates.find(value => Array.isArray(value)) || [];
    const ids = list
        .map(item => {
            if (typeof item === 'string') return item;
            if (!item || typeof item !== 'object') return '';
            return item.id || item.name || item.model || '';
        })
        .map(value => String(value || '').trim())
        .filter(Boolean);
    return [...new Set(ids)].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
}

function dualApiModelOptionsHtml(dual) {
    const endpoint = normalizeDualApiBaseUrl(dual.endpoint);
    const savedModel = String(dual.model || '');

    if (dualApiModelsLoading) {
        return '<option value="">正在获取模型列表……</option>';
    }

    if (dualApiModels.length) {
        return dualApiModels.map(model => `<option value="${escapeHtml(model)}" ${model === savedModel ? 'selected' : ''}>${escapeHtml(model)}</option>`).join('');
    }

    if (!endpoint) {
        return '<option value="">请先填写自检API地址</option>';
    }

    if (dualApiModelsError) {
        const saved = savedModel ? `<option value="${escapeHtml(savedModel)}" selected>${escapeHtml(savedModel)}（上次选择）</option>` : '';
        return `${saved}<option value="" ${saved ? '' : 'selected'}>模型获取失败，请检查接口</option>`;
    }

    if (savedModel) {
        return `<option value="${escapeHtml(savedModel)}" selected>${escapeHtml(savedModel)}（等待刷新）</option>`;
    }

    return '<option value="">模型将自动获取</option>';
}

function dualApiModelStatusText(dual) {
    const endpoint = normalizeDualApiBaseUrl(dual.endpoint);
    if (!endpoint) return '填写接口地址后，插件会自动读取该接口提供的模型列表。';
    if (dualApiModelsLoading) return '正在连接接口并读取模型列表……';
    if (dualApiModelsError) return dualApiModelsError;
    if (dualApiModels.length) return `已获取 ${dualApiModels.length} 个可用模型。`;
    return '等待自动获取模型列表。';
}

function updateDualApiModelControl() {
    const settings = getUiSettings();
    const dual = settings?.dualApi;
    if (!dual) return;

    const select = document.getElementById('stsc_dual_model');
    const button = document.getElementById('stsc_refresh_models');
    const status = document.getElementById('stsc_dual_model_status');
    if (!select) return;

    select.innerHTML = dualApiModelOptionsHtml(dual);
    const endpoint = normalizeDualApiBaseUrl(dual.endpoint);
    select.disabled = !endpoint || dualApiModelsLoading || !dualApiModels.length;

    if (dualApiModels.length) {
        const selected = dualApiModels.includes(dual.model) ? dual.model : dualApiModels[0];
        if (dual.model !== selected) {
            dual.model = selected;
            markDirty();
        }
        select.value = selected;
    }

    if (button) {
        button.disabled = !endpoint || dualApiModelsLoading;
        button.textContent = dualApiModelsLoading ? '获取中…' : '刷新模型';
    }

    if (status) {
        status.textContent = dualApiModelStatusText(dual);
        status.classList.toggle('stsc-model-status-error', Boolean(dualApiModelsError));
        status.classList.toggle('stsc-model-status-success', Boolean(dualApiModels.length && !dualApiModelsError));
    }
}

function resetDualApiModelState() {
    dualApiModels = [];
    dualApiModelsLoading = false;
    dualApiModelsError = '';
    dualApiModelsSignature = '';
    if (dualApiModelFetchTimer) {
        clearTimeout(dualApiModelFetchTimer);
        dualApiModelFetchTimer = null;
    }
    updateDualApiModelControl();
}

function scheduleDualApiModelFetch(delay = 650, { force = false, showToast = false } = {}) {
    if (dualApiModelFetchTimer) clearTimeout(dualApiModelFetchTimer);
    dualApiModelFetchTimer = setTimeout(() => {
        dualApiModelFetchTimer = null;
        fetchDualApiModels({ force, showToast });
    }, Math.max(0, Number(delay) || 0));
}

async function fetchDualApiModels({ force = false, showToast = false } = {}) {
    const settings = getUiSettings();
    const dual = settings?.dualApi;
    if (!dual) return [];

    const endpoint = normalizeDualApiBaseUrl(dual.endpoint);
    if (!endpoint) {
        dualApiModels = [];
        dualApiModelsError = '';
        dualApiModelsSignature = '';
        updateDualApiModelControl();
        return [];
    }

    const signature = dualApiConnectionSignature(dual);
    if (!force && signature === dualApiModelsSignature && (dualApiModelsLoading || dualApiModels.length || dualApiModelsError)) {
        updateDualApiModelControl();
        return dualApiModels;
    }

    dualApiModelsLoading = true;
    dualApiModelsError = '';
    dualApiModelsSignature = signature;
    updateDualApiModelControl();

    try {
        const context = ctx();
        const headers = {
            'Content-Type': 'application/json',
            ...(context?.getRequestHeaders?.() || {}),
        };
        const response = await fetch('/api/backends/chat-completions/status', {
            method: 'POST',
            headers,
            body: JSON.stringify({
                chat_completion_source: 'openai',
                reverse_proxy: endpoint,
                proxy_password: String(dual.apiKey || ''),
            }),
        });

        let payload = {};
        try {
            payload = await response.json();
        } catch {
            payload = {};
        }

        if (dualApiConnectionSignature(getUiSettings()?.dualApi) !== signature) {
            return [];
        }

        const models = extractDualApiModelIds(payload);
        if (!response.ok || payload?.error || !models.length) {
            const message = String(payload?.message || payload?.error?.message || '').trim();
            throw new Error(message || '没有读取到模型列表。请确认填写的是以 /v1 结尾的 OpenAI 兼容接口，并且该接口支持 /models。');
        }

        dualApiModels = models;
        dualApiModelsError = '';
        const liveDual = getUiSettings().dualApi;
        if (!models.includes(liveDual.model)) {
            liveDual.model = models[0];
            markDirty();
        }
        if (showToast) toastr.success(`已获取 ${models.length} 个模型。`, '墨提斯之镜');
        return models;
    } catch (error) {
        if (dualApiConnectionSignature(getUiSettings()?.dualApi) !== signature) {
            return [];
        }
        dualApiModels = [];
        dualApiModelsError = `模型获取失败：${String(error?.message || error || '未知错误')}`;
        if (showToast) toastr.error(dualApiModelsError, '墨提斯之镜');
        return [];
    } finally {
        if (dualApiConnectionSignature(getUiSettings()?.dualApi) === signature) {
            dualApiModelsLoading = false;
            updateDualApiModelControl();
        }
    }
}

function saveSettings() {
    ctx()?.saveSettingsDebounced?.();
}

function getDevSettingsForMigration() {
    const settings = ctx()?.extensionSettings?.[STSC_DEV_MODULE];
    return settings && typeof settings === 'object' && !Array.isArray(settings)
        && Array.isArray(settings.presets) ? settings : null;
}

function applyDevSettingsMigration({ restore = false } = {}) {
    if (pendingRun || dualApiBusy || testBusy) throw new Error('请等本轮生成或测试结束后再迁移设置。');
    if (editDirty) throw new Error('请先保存或放弃当前未保存的更改。');
    const all = ctx()?.extensionSettings;
    if (!all) throw new Error('当前酒馆设置尚未就绪。');
    const source = restore ? all[STSC_DEV_MIGRATION_BACKUP] : getDevSettingsForMigration();
    if (!source) throw new Error(restore ? '没有可恢复的迁移前设置。' : '当前酒馆未找到 DEV 设置。');
    const previous = clone(normalizeSettings());
    const devEnabledBefore = all[STSC_DEV_MODULE]?.enabled;
    const next = clone(source);
    // 迁入的是配置，不搬动聊天记录或另一版的自检结果。
    if (!restore) {
        next.enabled = true;
        next.updateNotice = clone(DEFAULT_SETTINGS.updateNotice);
    }
    all[STSC_MODULE] = next;
    try {
        normalizeSettings();
    } catch (error) {
        all[STSC_MODULE] = previous;
        if (all[STSC_DEV_MODULE]) all[STSC_DEV_MODULE].enabled = devEnabledBefore;
        saveSettings();
        throw error;
    }
    // 重复迁入仍保留最初的正式版配置，直到用户恢复它。
    if (!restore && !all[STSC_DEV_MIGRATION_BACKUP]) all[STSC_DEV_MIGRATION_BACKUP] = previous;
    if (restore) delete all[STSC_DEV_MIGRATION_BACKUP];
    editDraft = clone(all[STSC_MODULE]);
    editDirty = false;
    dualApiModels = [];
    dualApiModelsError = '';
    clearRuntimePrompts();
    saveSettings();
    return all[STSC_MODULE];
}

function openDevMigrationDialog(restore = false) {
    if (editDirty || pendingRun || dualApiBusy || testBusy) {
        toastr.warning('请先等生成结束，并保存或放弃未保存的更改，再操作。', '墨提斯之镜');
        return;
    }
    openDialog(restore ? '恢复迁入前的正式版设置' : '从 DEV 迁入设置',
        `<div class="stsc-muted">${restore
            ? '将用迁入前自动备份的正式版设置替换当前配置。DEV 设置和聊天记录保持原样。'
            : '将用同一酒馆保存的 DEV 预设、角色绑定、资料库、快捷指令、API配置及界面设置替换当前正式版配置。迁入前会自动备份，之后可恢复。正式版会启用，DEV 插件开关会关闭。请在两版生成均已结束后操作。'}</div>`,
        `<button class="menu_button" type="button" data-dialog-action="cancel">取消</button><button class="menu_button" type="button" data-dialog-action="${restore ? 'confirm-restore-dev-migration' : 'confirm-import-dev-settings'}">${restore ? '恢复设置' : '迁入并保存'}</button>`);
}

function devMigrationSettingsHtml() {
    const hasDev = Boolean(getDevSettingsForMigration());
    const hasBackup = Boolean(ctx()?.extensionSettings?.[STSC_DEV_MIGRATION_BACKUP]);
    if (!hasDev && !hasBackup) return '';
    return `<div class="stsc-section">
        <div class="stsc-section-title">DEV 设置迁移</div>
        <div class="stsc-muted">升级默认沿用正式版设置。如果希望继续使用测试时的配置，可从同一酒馆的 DEV 迁入。迁入前自动备份，API密钥只保存在酒馆设置中。</div>
        <div class="stsc-toolbar" style="margin-top:9px">
            ${hasDev ? '<button class="menu_button" type="button" data-action="import-dev-settings">从 DEV 迁入设置</button>' : ''}
            ${hasBackup ? '<button class="menu_button" type="button" data-action="restore-dev-migration">恢复迁入前的设置</button>' : ''}
        </div>
    </div>`;
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
    const savedSettings = normalizeSettings();
    if (!savedSettings?.enabled) {
        // 用户关闭插件后立刻终止尚未完成的本轮检测，避免回复完成时被误判为“未输出自检”。
        pendingRun = null;
        dualApiBusy = false;
        clearRuntimePrompts();
    }
    saveSettings();
    editDraft = clone(context.extensionSettings[STSC_MODULE]);
    editDirty = false;
    applyTheme(editDraft);
    renderAll();
    if (notify) toastr.success('更改已保存。', '墨提斯之镜');
}

function discardEditDraft({ notify = false } = {}) {
    editDraft = clone(normalizeSettings());
    editDirty = false;
    applyTheme(editDraft);
    renderAll();
    if (notify) toastr.info('已放弃未保存的更改。', '墨提斯之镜');
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

function applyFloatingAppearance(settings = getUiSettings()) {
    const appearance = settings?.appearance || DEFAULT_SETTINGS.appearance;
    const style = ['theme', 'glass', 'solid', 'minimal'].includes(appearance.floatingStyle) ? appearance.floatingStyle : 'theme';
    const buttonOpacity = clampNumber(appearance.floatingOpacity, 0.1, 1, 0.94);
    const buttonSize = clampNumber(appearance.floatingButtonSize, 34, 50, 50);
    const width = clampNumber(appearance.floatingWidth, 300, 680, 420);
    const height = clampNumber(appearance.floatingHeight, 300, 820, 640);
    const panel = document.getElementById('stsc_floating_panel');
    const root = document.getElementById('stsc_floating_root');
    const button = document.getElementById('stsc_floating_button');
    if (!panel) return;

    panel.dataset.floatingStyle = style;
    panel.style.setProperty('--stsc-floating-preferred-width', `${Math.round(width)}px`);
    panel.style.setProperty('--stsc-floating-preferred-height', `${Math.round(height)}px`);
    const iconPadding = Math.round(clampNumber(buttonSize * 0.16, 5, 8, 8));
    const badgeSize = Math.round(clampNumber(buttonSize * 0.38, 15, 19, 19));
    const badgeFontSize = Math.round(clampNumber(buttonSize * 0.24, 9, 12, 12));
    const badgeTop = Math.round(clampNumber(buttonSize * -0.08, -4, -3, -4));
    const badgeRight = Math.round(clampNumber(buttonSize * -0.06, -3, -2, -3));
    root?.style?.setProperty('--stsc-floating-button-size', `${Math.round(buttonSize)}px`);
    root?.style?.setProperty('--stsc-floating-icon-padding', `${iconPadding}px`);
    root?.style?.setProperty('--stsc-floating-badge-size', `${badgeSize}px`);
    root?.style?.setProperty('--stsc-floating-badge-font-size', `${badgeFontSize}px`);
    root?.style?.setProperty('--stsc-floating-badge-top', `${badgeTop}px`);
    root?.style?.setProperty('--stsc-floating-badge-right', `${badgeRight}px`);
    button?.style?.setProperty('--stsc-floating-button-opacity-percent', `${Math.round(buttonOpacity * 100)}%`);

    $('#stsc_floating_opacity_value').text(`${Math.round(buttonOpacity * 100)}%`);
    $('#stsc_floating_button_size_value').text(`${Math.round(buttonSize)}px`);
    $('#stsc_floating_width_value').text(`${Math.round(width)}px`);
    $('#stsc_floating_height_value').text(`${Math.round(height)}px`);
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
    const size = Math.max(34, button?.getBoundingClientRect?.().width || 50);
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

function isMobileFloatingLayout(metrics = floatingViewportMetrics()) {
    const narrowViewport = window.matchMedia?.('(max-width: 700px)')?.matches;
    const coarsePointer = window.matchMedia?.('(pointer: coarse)')?.matches;
    const phoneLikeViewport = Math.min(metrics.viewportWidth, metrics.viewportHeight) <= 700
        && Math.max(metrics.viewportWidth, metrics.viewportHeight) <= 1000;
    return Boolean(narrowViewport || (coarsePointer && phoneLikeViewport));
}

function resolveFloatingEdgeDock(left, metrics = floatingViewportMetrics()) {
    if (!isMobileFloatingLayout(metrics)) return '';
    const threshold = Math.max(28, metrics.size * 0.7);
    if (left <= metrics.minLeft + threshold) return 'left';
    if (left >= metrics.maxLeft - threshold) return 'right';
    return '';
}

function applyFloatingPosition(settings = getUiSettings()) {
    const root = document.getElementById('stsc_floating_root');
    if (!root) return;
    const position = settings?.appearance?.floatingPosition || DEFAULT_SETTINGS.appearance.floatingPosition;
    const metrics = floatingViewportMetrics();
    const { size, margin, minLeft, maxLeft, minTop, maxTop, viewportWidth, viewportHeight, topSafe, bottomSafe } = metrics;
    const leftRatio = clampNumber(position.leftRatio, 0, 1, 0.82);
    const topRatio = clampNumber(position.topRatio, 0, 1, 0.68);
    const requestedDock = ['left', 'right'].includes(position.edgeDock) ? position.edgeDock : '';
    const edgeDock = isMobileFloatingLayout(metrics) ? requestedDock : '';
    const left = edgeDock === 'left'
        ? minLeft
        : edgeDock === 'right'
            ? maxLeft
            : minLeft + (maxLeft - minLeft) * leftRatio;
    const top = minTop + (maxTop - minTop) * topRatio;

    root.style.setProperty('--stsc-safe-top', `${Math.round(topSafe)}px`);
    root.style.setProperty('--stsc-safe-bottom', `${Math.round(bottomSafe)}px`);
    root.style.setProperty('--stsc-edge-tuck-offset', `${Math.round(size / 2 + margin)}px`);
    root.style.left = `${Math.round(left)}px`;
    root.style.right = 'auto';
    root.style.top = `${Math.round(top)}px`;
    root.style.bottom = 'auto';
    root.dataset.edgeDock = edgeDock;
    root.classList.toggle('stsc-mobile-edge-docked', Boolean(edgeDock));
    root.dataset.horizontal = left + size / 2 > viewportWidth / 2 ? 'right' : 'left';
    root.dataset.vertical = top + size / 2 > viewportHeight / 2 ? 'bottom' : 'top';
}

function persistFloatingPosition(left, top, edgeDock = '') {
    const actual = normalizeSettings();
    if (!actual) return;
    const { minLeft, maxLeft, minTop, maxTop } = floatingViewportMetrics();
    const safeLeft = clampNumber(left, minLeft, maxLeft, minLeft);
    const safeTop = clampNumber(top, minTop, maxTop, minTop);
    const next = {
        leftRatio: clampNumber((safeLeft - minLeft) / Math.max(1, maxLeft - minLeft), 0, 1, 0.82),
        topRatio: clampNumber((safeTop - minTop) / Math.max(1, maxTop - minTop), 0, 1, 0.68),
        edgeDock: ['left', 'right'].includes(edgeDock) ? edgeDock : '',
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
    const appearance = getUiSettings()?.appearance || DEFAULT_SETTINGS.appearance;
    const preferredWidth = clampNumber(appearance.floatingWidth, 300, 680, 420);
    const preferredHeight = clampNumber(appearance.floatingHeight, 300, 820, 640);
    setImportantStyle(panel, 'position', 'fixed');
    setImportantStyle(panel, 'right', 'auto');
    setImportantStyle(panel, 'bottom', 'auto');
    setImportantStyle(panel, 'transform', 'none');
    setImportantStyle(panel, 'box-sizing', 'border-box');
    setImportantStyle(panel, 'display', 'flex');

    if (compact) {
        const availableWidth = Math.max(240, viewport.width - margin * 2);
        const availableHeight = Math.max(220, bottomBoundary - topBoundary);
        const width = Math.min(availableWidth, Math.max(240, preferredWidth));
        const height = Math.min(availableHeight, Math.max(220, preferredHeight));
        const left = viewport.left + Math.max(margin, (viewport.width - width) / 2);
        const top = topBoundary + Math.max(0, (availableHeight - height) / 2);
        setImportantStyle(panel, 'left', `${Math.round(left)}px`);
        setImportantStyle(panel, 'top', `${Math.round(top)}px`);
        setImportantStyle(panel, 'width', `${Math.round(width)}px`);
        setImportantStyle(panel, 'height', `${Math.round(height)}px`);
        setImportantStyle(panel, 'max-width', 'none');
        setImportantStyle(panel, 'max-height', 'none');
        panel.dataset.layout = 'mobile';
        return;
    }

    const button = document.getElementById('stsc_floating_button');
    const buttonRect = button?.getBoundingClientRect?.() || { left: viewport.right - 64, right: viewport.right - 14, top: viewport.top + 90, bottom: viewport.top + 140 };
    const width = Math.min(preferredWidth, viewport.width - margin * 2);
    const height = Math.min(preferredHeight, Math.max(220, viewport.height - margin * 2));
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
    if (floatingPanelPage === 'check') void markLatestIssueViewed();
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
    root.classList.add('stsc-floating-dragging');
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

    if (event.type === 'pointercancel') {
        root.classList.remove('stsc-floating-dragging');
        return;
    }

    if (state.moved) {
        const rect = root.getBoundingClientRect();
        const edgeDock = resolveFloatingEdgeDock(rect.left);
        persistFloatingPosition(rect.left, rect.top, edgeDock);
        root.classList.remove('stsc-floating-dragging');
        suppressFloatingClickUntil = Date.now() + 450;
        event.preventDefault();
        return;
    }

    root.classList.remove('stsc-floating-dragging');
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
    const config = referenceTypeConfig(reference.type);
    const text = String(reference.autoQuestion || config.autoQuestion || '')
        .replaceAll('{{name}}', reference.name || '未命名资料')
        .trim() || `请说明本轮是否遵守了【${reference.name || '未命名资料'}】。`;

    return {
        id: `ref_${reference.id}`,
        text,
        type: 'open',
        length: 'standard',
        requireEvidence: true,
        enabled: true,
        source: `参考资料库-${config.label}-${reference.name}`,
    };
}

function makeDualApiReferenceQuestion(reference) {
    const config = referenceTypeConfig(reference.type);
    const name = reference.name || '未命名资料';
    const textByType = {
        style: `请根据【${name}】文风资料，完整说明本轮正文具体应如何输出，包括语言风格、句式节奏、描写重点、台词特点以及必须避免的表达。答案必须复述本轮真正需要执行的具体规则，使没有读取该资料的写作模型仅凭答案也能准确执行；不得只回答“遵照资料”“按上述要求”或使用其他模糊指代。`,
        restriction: `请根据【${name}】限制资料，完整列出本轮必须遵守的限制、禁止出现的内容、允许保留的表现，以及正文应如何具体规避违规。答案必须复述实际限制，使没有读取该资料的写作模型也能独立执行；不得只回答“会遵守”“没有违反”或使用其他模糊指代。`,
        other: `请根据【${name}】资料，提取与本轮剧情有关的具体信息，并完整说明这些信息将如何影响角色判断、行动、台词、剧情发展或输出格式。答案必须包含正文生成所需的实际内容，使没有读取该资料的写作模型也能独立执行；不得只引用资料名称或使用“按资料处理”等模糊指代。`,
    };

    return {
        id: `ref_${reference.id}`,
        text: textByType[reference.type] || textByType.other,
        type: 'open',
        length: 'detailed',
        requireEvidence: true,
        enabled: true,
        source: `参考资料库-${config.label}-${name}`,
        referenceId: reference.id,
    };
}

function getDualApiQuestions(settings = normalizeSettings()) {
    const questions = getActiveQuestions(settings).map(question => clone(question));
    const referenceMap = new Map(getActiveReferences(settings).map(reference => [`ref_${reference.id}`, reference]));
    return questions.map(question => {
        const reference = referenceMap.get(question.id);
        return reference ? makeDualApiReferenceQuestion(reference) : question;
    });
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
    const persistentSet = new Set(settings.persistentInstructionIds || []);
    const pendingSet = new Set(settings.pendingInstructionIds || []);
    const selected = settings.temporaryInstructions
        .filter(instruction => (persistentSet.has(instruction.id) || pendingSet.has(instruction.id)) && instruction.content.trim())
        .map(instruction => ({
            ...instruction,
            activation: persistentSet.has(instruction.id) ? 'always' : 'once',
        }));

    if (consume && settings.pendingInstructionIds.length) {
        settings.pendingInstructionIds = [];
        if (editDraft) editDraft.pendingInstructionIds = [];
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
        standard: '标准：一至两句话，说明结论和必要依据',
        detailed: '详细：二至四句话，说明结论、依据、风险与修正方向',
    }[length] || '标准回答';
}

function buildQuestionXml(questions) {
    return questions.map((question, index) => {
        const requestId = `q${index + 1}`;
        const typeRule = question.type === 'boolean'
            ? '判断题：answer字段必须以“是”或“否”开头，再补充具体说明。'
            : '开放问答题：answer字段必须给出具体结论，不得只写“已注意”“会遵守”。';
        const evidenceRule = question.requireEvidence
            ? '必须另外输出非空的evidence字段，用一句话写明可核对的剧情、角色设定或世界观依据；不得把依据只混写在answer字段里。'
            : '无需强制输出evidence字段；回答必须明确。';
        const requiredFields = question.requireEvidence ? 'answer,evidence' : 'answer';
        return [
            `<question id="${requestId}" index="${index + 1}" evidence_required="${question.requireEvidence ? 'true' : 'false'}">`,
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
[墨提斯之镜 插件｜强制执行]
你必须在输出任何角色扮演正文、对白、动作描写、状态栏、HTML、XML或其他正常正文格式之前，完成下面全部自检问题。

输出边界（必须严格遵守）：
- 本插件不要求你新增、展示或改写任何模型内部推理。
- 仅当当前接口或预设原本明确要求输出可见推理区时，才按其原规则输出；必须在插件自检开始前完整关闭全部推理标签。
- <stsc_self_check> 和最终可见正文必须位于 <think>、<thinking>、<reasoning>、<analysis> 及同类推理标签之外，绝不能被这些标签包裹。
- 固定顺序只能是：原规则要求的可见推理区（如有且已闭合）→ 插件自检 → 最终可见正文。

执行规则：
1. 先依据当前角色卡、世界观、聊天记录和用户最后一条消息，逐题形成最终写作结论。
2. 检查你准备输出的正文是否与任一答案冲突；如有冲突，先修正写作方案，再重新核对。
3. 自检区只输出最终可供核对的简洁答案，不得把插件问答放入任何推理区。
4. 不得漏题、合并题目或改变题目编号。
5. 自检完成前不得开始角色扮演正文；自检结束后直接开始可见正文，不得再用推理标签包住正文。
6. 对标记 evidence_required="true" 的问题，必须在同一个<item>中同时输出非空的<answer>与<evidence>；缺少<evidence>即视为格式错误。
7. <answer>只写最终结论与本轮演绎方案；<evidence>单独写支撑该结论的具体剧情、角色设定或世界观依据。

你必须严格输出以下结构：
（仅当原规则明确要求时：先输出并完整闭合其可见推理区；否则不要新增）
<stsc_self_check>
无需依据：<item id="q1"><answer>最终回答</answer></item>
需要依据：<item id="q2"><answer>最终回答</answer><evidence>具体依据</evidence></item>
</stsc_self_check>
紧接着在全部推理标签之外直接输出正文、状态栏以及用户要求的全部正常输出格式。
正文不得再包裹在任何由本插件添加的标签中。

本轮问题：
${buildQuestionXml(questions)}
`.trim();
}

function buildReferencePrompt(reference) {
    const config = referenceTypeConfig(reference.type);
    return `
[墨提斯之镜 插件｜参考资料库｜${config.promptTitle}：${reference.name}]
${config.promptLead}

${reference.content.trim()}
`.trim();
}

function buildTemporaryPrompt(instructions) {
    const items = instructions.map((instruction, index) => {
        const modeLabel = instruction.activation === 'always' ? '常开' : '临时一轮';
        return `${index + 1}. 【${instruction.name}｜${modeLabel}】${instruction.content.trim()}`;
    }).join('\n');
    return `
[墨提斯之镜 插件｜本轮启用的快捷指令]
以下指令必须落实到本次回复中，不得在正文中复述、解释或暴露这些指令：
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

function clearRuntimePrompt(key) {
    const context = ctx();
    if (!context?.setExtensionPrompt) return;
    try {
        context.setExtensionPrompt(key, '', -1, 0, false, 0);
    } catch (error) {
        console.warn('[STSC] 清理注入失败：', key, error);
    }
    runtimePromptKeys.delete(key);
}

function clearRuntimePrompts() {
    for (const key of [...runtimePromptKeys]) clearRuntimePrompt(key);
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

function compactPromptText(value) {
    return String(value ?? '').replace(/\r\n/g, '\n').trim();
}

function getCharacterField(character, field) {
    const direct = character?.[field];
    const nested = character?.data?.[field];
    return compactPromptText(direct ?? nested ?? '');
}

function compactDualApiRetryText(value, limit) {
    const text = compactPromptText(value);
    if (text.length <= limit) return text;
    const half = Math.max(1, Math.floor((limit - 40) / 2));
    return `${text.slice(0, half)}\n…（精简重试已省略中段）…\n${text.slice(-half)}`;
}

function formatCharacterCardForDualApi(character, { compact = false } = {}) {
    if (!character) return '';
    const fields = [
        ['角色名称', getCharacterField(character, 'name')],
        ['角色描述', getCharacterField(character, 'description')],
        ['性格', getCharacterField(character, 'personality')],
        ['场景', getCharacterField(character, 'scenario')],
        ['角色系统提示', getCharacterField(character, 'system_prompt')],
        ...(!compact ? [
            ['历史后置指令', getCharacterField(character, 'post_history_instructions')],
            ['示例对话', getCharacterField(character, 'mes_example')],
            ['首条消息', getCharacterField(character, 'first_mes')],
        ] : []),
    ].filter(([, value]) => value);
    if (!fields.length) return '';
    const text = fields.map(([label, value]) => `【${label}】\n${value}`).join('\n\n');
    return compact ? compactDualApiRetryText(text, 12000) : text;
}

function getDualApiCharacterContext({ compact = false } = {}) {
    const context = ctx();
    if (!context) return '';

    if (!context.groupId) {
        const character = context.characters?.[Number(context.characterId)];
        return formatCharacterCardForDualApi(character, { compact });
    }

    const group = context.groups?.find?.(item => String(item.id) === String(context.groupId));
    const memberKeys = new Set((group?.members || []).map(value => String(value)));
    const cards = (context.characters || [])
        .filter(character => {
            const avatar = String(character?.avatar || character?.data?.avatar || '');
            const name = String(character?.name || character?.data?.name || '');
            return memberKeys.has(avatar) || memberKeys.has(name);
        })
        .map(character => formatCharacterCardForDualApi(character, { compact }))
        .filter(Boolean);
    const title = group?.name ? `【当前群聊】\n${group.name}` : '【当前群聊】';
    return [title, ...cards].join('\n\n---\n\n');
}

function dualApiChatRole(message) {
    const explicit = String(message?.role || '').toLowerCase();
    if (['system', 'user', 'assistant'].includes(explicit)) return explicit;
    if (message?.is_system) return 'system';
    return message?.is_user ? 'user' : 'assistant';
}

function dualApiChatContent(message) {
    const content = message?.mes ?? message?.content ?? '';
    if (Array.isArray(content)) {
        return content.map(part => {
            if (typeof part === 'string') return part;
            return part?.text || part?.content || '';
        }).join('\n').trim();
    }
    return compactPromptText(content);
}

function selectDualApiChat(chat, dual) {
    const source = (Array.isArray(chat) ? clone(chat) : [])
        .map(message => ({ role: dualApiChatRole(message), content: dualApiChatContent(message) }))
        .filter(message => message.content);
    if (!source.length || dual.contextMode === 'all') return source;

    const turns = dual.contextMode === 'custom'
        ? clampNumber(dual.customTurns, 1, 100, 5)
        : 5;
    let currentUserIndex = -1;
    for (let index = source.length - 1; index >= 0; index--) {
        if (source[index].role === 'user') {
            currentUserIndex = index;
            break;
        }
    }

    if (currentUserIndex < 0) {
        return source.slice(-Math.max(1, turns * 2 + 1));
    }

    const previous = source.slice(0, currentUserIndex);
    const previousUserIndices = [];
    previous.forEach((message, index) => {
        if (message.role === 'user') previousUserIndices.push(index);
    });
    const startIndex = previousUserIndices.length > turns
        ? previousUserIndices[previousUserIndices.length - turns]
        : 0;
    return previous.slice(startIndex).concat(source.slice(currentUserIndex));
}

function buildDualApiReferenceContext(references, { compact = false } = {}) {
    if (!references.length) return '（本轮未启用插件参考资料库）';
    return references.map((reference, index) => {
        const config = referenceTypeConfig(reference.type);
        return [
            `<reference index="${index + 1}" id="${escapeXml(reference.id)}" type="${escapeXml(reference.type)}">`,
            `<name>${escapeXml(reference.name || '未命名资料')}</name>`,
            `<category>${escapeXml(config.label)}</category>`,
            `<content>${escapeXml(compact ? compactDualApiRetryText(reference.content, 6000) : reference.content.trim())}</content>`,
            `</reference>`,
        ].join('\n');
    }).join('\n');
}

function buildDualApiTemporaryContext(instructions) {
    if (!instructions.length) return '（本轮未启用快捷指令）';
    return instructions.map((instruction, index) => `${index + 1}. 【${instruction.name}】${instruction.content.trim()}`).join('\n');
}

function getReviewSource(settings = normalizeSettings()) {
    if (!settings?.dualApi?.previousReview) return null;
    const latest = getLatestResult();
    if (!latest || latest.mode !== 'dual_api' || latest.chatId !== getCurrentChatId()) return null;
    const message = ctx()?.chat?.[Number(latest.messageId)];
    if (!message || message.is_user || message.is_system) return null;
    return { latest, output: String(message.mes || '').trim() };
}

function buildPreviousReviewRequest(settings, { compact = false } = {}) {
    const source = getReviewSource(settings);
    if (!source) return '';
    const answers = (source.latest.answers || []).map((item, index) => [
        `Q${index + 1}：${item.question || ''}`,
        `A${index + 1}：${compactDualApiRetryText(item.answer || '', compact ? 1200 : 3000)}`,
        item.evidence ? `依据：${compactDualApiRetryText(item.evidence, compact ? 800 : 2000)}` : '',
    ].filter(Boolean).join('\n')).join('\n\n');
    return `
在回答本轮自检前，必须先复盘上一轮。只报告有明确文本依据的疑似问题；不要为了填满格式而虚构问题。

【上一轮自检】
${answers || '（没有可读取的上一轮自检问答）'}

【上一轮实际正文】
${compactDualApiRetryText(source.output || '（没有可读取的上一轮正文）', compact ? 6000 : 18000)}
`.trim();
}

function parsePreviousReview(text) {
    const source = normalizeModelXmlText(text).source;
    const open = STSC_REVIEW_OPEN_RE.exec(source);
    if (!open) return null;
    const afterOpen = open.index + open[0].length;
    const tail = source.slice(afterOpen);
    const close = STSC_REVIEW_CLOSE_RE.exec(tail);
    const selfCheck = STSC_CHECK_OPEN_RE.exec(source);
    const innerEnd = close ? afterOpen + close.index : (selfCheck?.index || source.length);
    const inner = source.slice(afterOpen, innerEnd);
    const status = decodeXmlEntities(inner.match(/<status[^>]*>([\s\S]*?)<\/status>/i)?.[1] || '').trim().toLowerCase();
    const issues = [];
    const issueRegex = /<issue\b[^>]*>([\s\S]*?)<\/issue>/gi;
    let match;
    while ((match = issueRegex.exec(inner)) !== null && issues.length < 3) {
        const body = match[1];
        const field = tag => decodeXmlEntities(body.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'))?.[1] || '').trim();
        const description = field('description');
        if (description) issues.push({ id: uid('review'), type: field('type') || '疑似问题', description, evidence: field('evidence'), suggestion: field('suggestion'), selected: false });
    }
    return { timestamp: Date.now(), status: issues.length || status === 'warning' ? 'warning' : 'ok', issues };
}

function selectedRepairDirectives() {
    const issues = getLatestResult()?.previousReview?.issues || [];
    return issues.filter(item => item.selected).map(item => item.suggestion || item.description).filter(Boolean);
}

function buildDualApiMessages(chat, questions, references, temporaryInstructions, settings, { compact = false } = {}) {
    const characterContext = getDualApiCharacterContext({ compact }) || '（没有读取到当前角色卡文本，请主要依据聊天记录、问题与参考资料判断。）';
    const dualForChat = compact
        ? { ...settings.dualApi, contextMode: 'custom', customTurns: Math.min(2, settings.dualApi.customTurns || 2) }
        : settings.dualApi;
    const selectedChat = selectDualApiChat(chat, dualForChat).map(message => compact
        ? { ...message, content: compactDualApiRetryText(message.content, 6000) }
        : message);
    const reviewRequest = buildPreviousReviewRequest(settings, { compact });
    const reviewEnabledForThisRun = Boolean(reviewRequest);
    const requiredOutputSchema = reviewEnabledForThisRun
        ? `<stsc_previous_review>\n<status>ok或warning</status>\n<!-- status为warning时最多输出3个issue；ok时不要输出issue -->\n<issue><type>简短类型</type><description>疑似问题</description><evidence>上一轮正文中的具体依据</evidence><suggestion>下一轮自然修复建议</suggestion></issue>\n</stsc_previous_review>\n<stsc_self_check>\n<item id="q1"><answer>可独立执行的最终回答</answer></item>\n<item id="q2"><answer>可独立执行的最终回答</answer><evidence>具体依据</evidence></item>\n</stsc_self_check>`
        : `<stsc_self_check>\n<item id="q1"><answer>可独立执行的最终回答</answer></item>\n<item id="q2"><answer>可独立执行的最终回答</answer><evidence>具体依据</evidence></item>\n</stsc_self_check>`;
    const repairDirectives = selectedRepairDirectives();
    const systemPrompt = `
[墨提斯之镜｜独立自检API]
你是写作前置自检模型。你的唯一任务是为下一步“酒馆主API”完成本轮自检，不得写角色扮演正文、对白、动作描写、状态栏或续写剧情。
${compact ? '这是一次自动精简重试：只读取必要角色信息和最近2轮聊天，请优先快速、完整地输出全部题目。' : ''}

工作要求：
1. 结合角色资料、经过酒馆出站正则处理后的聊天记录、插件参考资料、快捷指令和本轮问题，逐题形成最终写作结论。
2. 每个答案都必须能直接交给另一个没有看到题目背景或资料原文的写作模型执行。
3. 尤其是参考资料库问题，必须明确复述本轮具体该怎样写、必须遵守什么、禁止什么，不得只写“遵照资料”“符合要求”“按上述内容执行”等模糊结论。
4. 不得漏题、合并题目或改变 q1、q2 这类短题号。
5. 对 evidence_required="true" 的问题，必须输出非空的 <evidence>，写明可核对的角色设定、剧情上下文、资料规则或世界观依据。
6. 每个答案只写最终结论，控制在1—3句；依据通常只写1句。不要展开思考过程，避免输出过长而截断。
7. ${reviewEnabledForThisRun ? '必须先完整输出 <stsc_previous_review>，随后输出 <stsc_self_check>；两段都不得省略。' : '只输出 <stsc_self_check>，不得额外输出复盘标签。'}
8. 除下方指定的XML外，不要输出“无需依据／需要依据”等说明文字、Markdown代码围栏或正文。

严格输出格式：
${requiredOutputSchema}

【当前角色资料】
${characterContext}

【本轮启用的插件参考资料库】
${buildDualApiReferenceContext(references, { compact })}

【本轮启用的快捷指令】
${buildDualApiTemporaryContext(temporaryInstructions)}

${repairDirectives.length ? `【用户确认的本轮修复方向】\n${repairDirectives.map((item, index) => `${index + 1}. ${item}`).join('\n')}\n修复必须承认上一轮已经发生，不得生硬重置剧情。` : ''}

${reviewEnabledForThisRun ? `【必须完成的上一轮复盘任务】\n${reviewRequest}` : ''}
`.trim();

    const answerStyleInstruction = settings.dualApi.transformFormat
        ? `回答将被转换为强力执行规范。每个 <answer> 只写可直接执行的结论：不要重复问题、资料库名称或分析过程；优先使用“必须／不得／应当”等明确措辞，控制在 1—3 条完整规则内。<evidence> 只保留最关键依据，通常 1 句，且不要重复答案。`
        : `每个 <answer> 必须完整、明确、自包含，不得只回答“是／否”“会遵照”或使用依赖原文才能理解的模糊指代。`;

    const questionPrompt = `
请现在${reviewEnabledForThisRun ? '先完成上一轮复盘，再完成' : '只完成'}本轮全部自检。回答必须自包含：即使下一步写作模型看不到问题、参考资料原文和你的分析过程，也能仅凭每个 <answer> 准确执行。不得输出正文。
${answerStyleInstruction}

本轮问题：
${buildQuestionXml(questions)}
`.trim();

    return [
        { role: 'system', content: systemPrompt },
        ...selectedChat,
        { role: 'user', content: questionPrompt },
    ];
}

function extractDualApiText(payload) {
    const choices = Array.isArray(payload?.choices) ? payload.choices : [];
    const first = choices[0] || {};
    const candidates = [
        first?.message?.content,
        first?.message?.reasoning_content,
        first?.text,
        payload?.content,
        payload?.text,
        payload?.response,
        payload?.output_text,
    ];
    for (const candidate of candidates) {
        if (Array.isArray(candidate)) {
            const joined = candidate.map(part => {
                if (typeof part === 'string') return part;
                return part?.text || part?.content || part?.value || '';
            }).join('\n').trim();
            if (joined) return joined;
        }
        const text = compactPromptText(candidate);
        if (text && text !== '[object Object]') return text;
    }
    return '';
}

function isTransientDualApiFailure(error) {
    if (error?.transient === true) return true;
    if (error?.name === 'TypeError') return true;
    return /(?:429|5\d\d|rate.?limit|too many requests|temporar|overload|network|fetch failed|socket|timeout|超时|限流|繁忙|网络)/i.test(String(error?.message || error || ''));
}

function dualApiProviderErrorText(payload, responseText = '') {
    const candidate = payload?.error?.message ?? payload?.message ?? payload?.error ?? responseText;
    if (candidate && typeof candidate === 'object') {
        try {
            return compactPromptText(JSON.stringify(candidate));
        } catch {
            return compactPromptText(String(candidate));
        }
    }
    return compactPromptText(candidate);
}

function waitForDualApiRetry(milliseconds) {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function callDualApiSelfCheck(
    { chat, questions, references, temporaryInstructions, settings },
    { compact = false, allowTransientRetry = true, timeoutSecondsOverride = 0 } = {},
) {
    const dual = settings.dualApi;
    const endpoint = normalizeDualApiBaseUrl(dual.endpoint);
    const model = String(dual.model || '').trim();
    if (!endpoint) throw new Error('尚未填写有效的自检API接口地址。');
    if (!model) throw new Error('尚未选择自检模型。请先在设置页获取并选择模型，然后保存。');

    const context = ctx();
    const configuredTimeout = clampNumber(timeoutSecondsOverride || dual.timeoutSeconds, 60, 300, 150);
    const maxAttempts = allowTransientRetry && dual.retryTransient ? 2 : 1;
    let lastError = null;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const retrying = attempt > 0;
        const attemptCompact = compact || retrying;
        const attemptTimeoutSeconds = retrying ? Math.min(configuredTimeout, 60) : configuredTimeout;
        const controller = new AbortController();
        const startedAt = Date.now();
        const timeout = setTimeout(() => controller.abort(), attemptTimeoutSeconds * 1000);

        try {
            const headers = {
                'Content-Type': 'application/json',
                ...(context?.getRequestHeaders?.() || {}),
            };
            const response = await fetch('/api/backends/chat-completions/generate', {
                method: 'POST',
                headers,
                signal: controller.signal,
                body: JSON.stringify({
                    type: 'quiet',
                    messages: buildDualApiMessages(chat, questions, references, temporaryInstructions, settings, { compact: attemptCompact }),
                    model,
                    temperature: 0.15,
                    frequency_penalty: 0,
                    presence_penalty: 0,
                    top_p: 1,
                    max_tokens: clampNumber(dual.maxTokens, 256, 12000, 4096),
                    stream: false,
                    chat_completion_source: 'openai',
                    reverse_proxy: endpoint,
                    proxy_password: String(dual.apiKey || ''),
                    include_reasoning: false,
                }),
            });

            const responseText = await response.text();
            let payload = {};
            try {
                payload = responseText ? JSON.parse(responseText) : {};
            } catch {
                payload = { text: responseText };
            }

            if (!response.ok || payload?.error) {
                const providerMessage = dualApiProviderErrorText(payload, responseText);
                const error = new Error(`${response.status ? `HTTP ${response.status}：` : ''}${providerMessage || '自检API返回错误。'}`);
                error.httpStatus = response.status;
                error.transient = [408, 425, 429].includes(response.status) || response.status >= 500;
                throw error;
            }

            const text = extractDualApiText(payload);
            if (!text) {
                const error = new Error('自检API返回成功，但没有读取到任何文本。');
                error.transient = true;
                throw error;
            }
            return { text, attempts: attempt + 1, compact: attemptCompact };
        } catch (caught) {
            let error = caught instanceof Error ? caught : new Error(String(caught || '未知错误'));
            if (error.name === 'AbortError') {
                error = new Error(`自检API等待超过${attemptTimeoutSeconds}秒，已超时。`);
                error.code = 'timeout';
                error.transient = true;
            } else if (error.name === 'TypeError') {
                error.transient = true;
            }
            error.elapsedMs = Date.now() - startedAt;
            error.attempts = attempt + 1;
            lastError = error;

            if (attempt + 1 >= maxAttempts || !isTransientDualApiFailure(error)) break;
            await waitForDualApiRetry(error.httpStatus === 429 ? 1500 : 800);
        } finally {
            clearTimeout(timeout);
        }
    }

    if (lastError && maxAttempts > 1 && lastError.attempts > 1) {
        lastError.message = `${lastError.message}（已自动精简重试1次，仍未成功）`;
    }
    throw lastError || new Error('自检API调用失败。');
}

function dualApiAnswerRows(questions, parsed) {
    const answerMap = new Map((parsed?.answers || []).map(answer => [answer.id, answer]));
    return questions.map((question, index) => {
        const answer = answerMap.get(question.id) || {};
        return {
            index: index + 1,
            id: question.id,
            question: question.text,
            source: question.source || '',
            answer: compactPromptText(answer.answer),
            evidence: compactPromptText(answer.evidence),
        };
    });
}

function buildDualApiRawInjection(questions, parsed) {
    const rows = dualApiAnswerRows(questions, parsed).filter(row => row.answer);
    if (!rows.length) return '';

    const content = rows.map(row => [
        `Q${row.index}：${row.question}`,
        `A${row.index}：${row.answer}`,
        row.evidence ? `A${row.index}依据：${row.evidence}` : '',
    ].filter(Boolean).join('\n')).join('\n\n');

    return `
[墨提斯之镜｜本轮已完成独立自检]
以下内容是我在生成正文前已经完成的本轮自检结论。接下来必须依据这些结论继续写作，不得忽略、否定或绕过；不要在最终回复中重复、解释或展示自检内容。

输出边界：本插件不要求新增或展示思维链。若当前接口或预设原本要求可见推理区，必须先完整关闭推理标签；最终可见正文必须位于 <think>、<thinking>、<reasoning>、<analysis> 及同类推理标签之外。

${content}

现在依据以上结论，按照当前角色卡、酒馆预设、世界观和用户最后一条消息生成最终正文。
`.trim();
}

function yamlQuoted(value) {
    return JSON.stringify(compactPromptText(value));
}

function buildDualApiContractInjection(questions, parsed) {
    const rows = dualApiAnswerRows(questions, parsed).filter(row => row.answer);
    if (!rows.length) return '';

    const rules = rows.map(row => [
        `    - instruction: ${yamlQuoted(row.answer)}`,
        row.evidence ? `      basis: ${yamlQuoted(row.evidence)}` : '',
    ].filter(Boolean).join('\n')).join('\n');

    return `
[墨提斯之镜｜本轮写作执行规范]
以下YAML是本轮正文必须执行的内部规范。不得冲突、弱化或绕过；不得在最终回复中复述、解释或暴露这份规范。
STSC_EXECUTION_CONTRACT:
  priority: mandatory
  disclosure: forbidden
  output_boundary:
    require_new_reasoning: false
    close_visible_reasoning_before_final: true
    final_visible_response_outside_reasoning: true
  rules:
${rules}
`.trim();
}

function applyDualApiMainPrompt(questions, parsed, rawCheck, settings) {
    const transform = Boolean(settings.dualApi.transformFormat);
    let text = transform
        ? buildDualApiContractInjection(questions, parsed)
        : buildDualApiRawInjection(questions, parsed);
    const repairs = selectedRepairDirectives();
    if (repairs.length) {
        text += `\n\n<stsc_repair_directives>\n以下是用户确认需要在本轮自然修复的问题。必须承认已经发生的剧情，不得重写或生硬重置上一轮。\n${repairs.map(item => `<repair>${wrapXmlCdata(item)}</repair>`).join('\n')}\n</stsc_repair_directives>`;
    }

    if (!text) {
        clearRuntimePrompt('stsc_dual_main');
        return;
    }

    setRuntimePrompt('stsc_dual_main', text, {
        position: 'chat',
        depth: 0,
        role: transform ? 'system' : 'assistant',
    });
}

function dualApiFailureMessage(error) {
    const raw = compactPromptText(error?.message || error || '没有收到具体原因');
    const status = Number(error?.httpStatus) || Number(raw.match(/HTTP\s*(\d{3})/i)?.[1]) || 0;
    const seconds = Number.isFinite(error?.elapsedMs) ? Math.max(1, Math.round(error.elapsedMs / 1000)) : 0;
    const retried = Number(error?.attempts) > 1 || /重试/.test(raw);
    let message = '';

    if (/格式不完整|识别到\s*\d+\/\d+|缺少回答|必要依据/.test(raw)) {
        message = '自检API有返回内容，但题目没有答全，或缺少必须提供的依据。';
    } else if (/超时|timeout|timed out|AbortError|超过\s*\d+\s*秒/i.test(raw)) {
        message = `等待自检API${seconds ? `约 ${seconds} 秒` : '很久'}仍没有收到回答，通常是接口太慢或网络不稳定。`;
    } else if (status === 401 || status === 403 || /密钥|认证|授权|unauthori|forbidden/i.test(raw)) {
        message = `自检API拒绝了请求${status ? `（返回 ${status}）` : ''}，通常是API密钥错误、已经失效，或账号没有使用该模型的权限。`;
    } else if (status === 404) {
        message = '没有找到自检API地址（返回 404），请检查接口地址是否填对，以及地址末尾是否需要 /v1。';
    } else if (status === 429 || /限流|请求过多|rate.?limit|quota|额度/i.test(raw)) {
        message = '自检API暂时拒绝了请求（返回 429），通常是请求太频繁、并发过高或账号额度不足。';
    } else if (status >= 500 || /bad gateway|service unavailable|gateway timeout/i.test(raw)) {
        message = `自检API服务端出错${status ? `（返回 ${status}）` : ''}，不是插件格式问题；可以稍后重试或更换接口线路。`;
    } else if (/Failed to fetch|NetworkError|fetch failed|network|ECONN|ENOTFOUND|连接失败/i.test(raw)) {
        message = '没有连接上自检API，请检查网络、接口地址以及反向代理是否可用。';
    } else if (/model|模型/i.test(raw)) {
        message = `自检API没有接受当前模型设置。请重新获取模型列表并确认所选模型仍然可用。原始提示：${raw}`;
    } else {
        message = `自检API没有成功完成请求。接口给出的提示是：${raw}`;
    }

    if (retried) message += ' 插件已经自动精简内容并重试过一次，仍然没有成功。';
    return message;
}

function dualParsedMissingRequirements(parsed, questions) {
    const answerMap = new Map((parsed?.answers || []).map(answer => [answer.id, answer]));
    return questions.filter(question => {
        const answer = answerMap.get(question.id);
        if (!answer?.answer?.trim()) return true;
        return Boolean(question.requireEvidence && !answer.evidence?.trim());
    });
}

function dualParsedIsComplete(parsed, questions) {
    return Boolean(questions.length && dualParsedMissingRequirements(parsed, questions).length === 0);
}

function dualIncompleteMessage(parsed, questions) {
    const answered = (parsed?.answers || []).filter(answer => answer.answer?.trim()).length;
    const missing = dualParsedMissingRequirements(parsed, questions).length;
    return `自检API返回格式不完整：识别到 ${answered}/${questions.length} 题，仍有 ${missing} 题缺少回答或必要依据。`;
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

function latestHasUnreadIssue(latest = getLatestResult()) {
    return Boolean(latest && ['missing', 'format_error'].includes(latest.status) && latest.issueViewed !== true);
}

async function markLatestIssueViewed() {
    const latest = getLatestResult();
    if (!latest || !['missing', 'format_error'].includes(latest.status) || latest.issueViewed === true) return;
    latest.issueViewed = true;
    $('#stsc_floating_badge').addClass('stsc-hidden');
    await saveLatestResult(latest);
}

function normalizeModelXmlText(text) {
    let source = String(text ?? '')
        .replace(/^\s*```(?:xml)?\s*/i, '')
        .replace(/\s*```\s*$/i, '')
        .trim();
    let decodedOuterXml = false;
    if (!STSC_CHECK_OPEN_RE.test(source) && /&lt;\s*stsc_self_check\b/i.test(source)) {
        source = decodeXmlEntities(source).trim();
        decodedOuterXml = true;
    }
    return { source, decodedOuterXml };
}

function readItemAttribute(attributes, name) {
    const match = String(attributes || '').match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>]+))`, 'i'));
    return decodeXmlEntities(match?.[1] ?? match?.[2] ?? match?.[3] ?? '').trim();
}

function parseItems(checkInner) {
    const items = [];
    const itemRegex = /<item\b([^>]*)>([\s\S]*?)<\/item>/gi;
    let match;
    while ((match = itemRegex.exec(checkInner)) !== null) {
        const attributes = match[1];
        const id = readItemAttribute(attributes, 'id');
        const index = Number.parseInt(readItemAttribute(attributes, 'index'), 10) || 0;
        const itemBody = match[2];
        const answerMatch = itemBody.match(/<answer\b[^>]*>([\s\S]*?)<\/answer>/i);
        const evidenceMatch = itemBody.match(/<evidence\b[^>]*>([\s\S]*?)<\/evidence>/i);
        const answer = decodeXmlEntities(answerMatch?.[1] ?? '').trim();
        const evidence = decodeXmlEntities(evidenceMatch?.[1] ?? '').trim();
        items.push({ id, index, answer, evidence });
    }
    return items;
}

function unwrapResponse(text) {
    // 兼容极早期版本的 <stsc_response> 标签，但绝不删除标签之前的内容。
    const source = String(text ?? '');
    const open = STSC_RESPONSE_OPEN_RE.exec(source);
    if (!open) return source.trim();

    const afterOpenStart = open.index + open[0].length;
    const afterOpen = source.slice(afterOpenStart);
    const close = STSC_RESPONSE_CLOSE_RE.exec(afterOpen);
    if (!close) return source.trim();

    const closeEnd = afterOpenStart + close.index + close[0].length;
    return `${source.slice(0, open.index)}${source.slice(afterOpenStart, afterOpenStart + close.index)}${source.slice(closeEnd)}`.trim();
}

function removeSelfCheckBlocks(text) {
    const source = String(text ?? '');
    // 只删除完整闭合的插件自检块。标签前后的 thinking、reasoning、正文及其他自定义格式全部原样保留。
    return source
        .replace(/<stsc_self_check\b[^>]*>[\s\S]*?<\/stsc_self_check>/gi, '')
        .trim();
}

function unmatchedVisibleReasoningTags(text) {
    const stack = [];
    const tagPattern = /<\/?(think|thinking|reasoning|analysis)\b[^>]*>/gi;
    for (const match of String(text ?? '').matchAll(tagPattern)) {
        const rawTag = match[0];
        const tag = match[1].toLowerCase();
        if (/^<\//.test(rawTag)) {
            const matchingOpen = stack.lastIndexOf(tag);
            if (matchingOpen >= 0) stack.splice(matchingOpen, 1);
        } else if (!/\/\s*>$/.test(rawTag)) {
            stack.push(tag);
        }
    }
    return stack;
}

function removeFirstOrphanReasoningClose(text, tag) {
    const source = String(text ?? '');
    const tagPattern = new RegExp(`<\\/?${tag}\\b[^>]*>`, 'gi');
    let nestedDepth = 0;
    let match;
    while ((match = tagPattern.exec(source)) !== null) {
        const rawTag = match[0];
        if (/^<\//.test(rawTag)) {
            if (nestedDepth === 0) {
                return `${source.slice(0, match.index)}${source.slice(match.index + rawTag.length)}`;
            }
            nestedDepth -= 1;
        } else if (!/\/\s*>$/.test(rawTag)) {
            nestedDepth += 1;
        }
    }
    return source;
}

function repairReasoningBoundaryAroundSelfCheck(text) {
    const source = String(text ?? '');
    const openMatch = STSC_CHECK_OPEN_RE.exec(source);
    if (!openMatch) return { text: source, repairedTags: [] };

    const afterOpenStart = openMatch.index + openMatch[0].length;
    const afterOpen = source.slice(afterOpenStart);
    const closeMatch = STSC_CHECK_CLOSE_RE.exec(afterOpen);
    if (!closeMatch) return { text: source, repairedTags: [] };

    const closeEnd = afterOpenStart + closeMatch.index + closeMatch[0].length;
    const prefix = source.slice(0, openMatch.index);
    const selfCheckBlock = source.slice(openMatch.index, closeEnd);
    let suffix = source.slice(closeEnd);
    const activeTags = unmatchedVisibleReasoningTags(prefix);
    if (!activeTags.length) return { text: source, repairedTags: [] };

    const closingOrder = activeTags.slice().reverse();
    for (const tag of closingOrder) suffix = removeFirstOrphanReasoningClose(suffix, tag);
    const boundary = `${prefix && !/\s$/.test(prefix) ? '\n' : ''}${closingOrder.map(tag => `</${tag}>`).join('\n')}\n`;
    return {
        text: `${prefix}${boundary}${selfCheckBlock}${suffix}`,
        repairedTags: [...new Set(closingOrder)],
    };
}

function visibleResponseReasoningWrapper(text) {
    const source = String(text ?? '').trim();
    const openMatch = /^<(think|thinking|reasoning|analysis)\b[^>]*>/i.exec(source);
    if (!openMatch) return '';

    const tag = openMatch[1].toLowerCase();
    const tagPattern = new RegExp(`<\\/?${tag}\\b[^>]*>`, 'ig');
    let depth = 0;
    let match;
    while ((match = tagPattern.exec(source)) !== null) {
        if (/^<\//.test(match[0])) {
            depth -= 1;
            if (depth === 0) {
                return source.slice(match.index + match[0].length).trim() ? '' : tag;
            }
        } else if (!/\/\s*>$/.test(match[0])) {
            depth += 1;
        }
    }
    return tag;
}

function extractVisibleBody(text) {
    // 自检标签未闭合时不做破坏性裁切，避免误吞原生思维链或后续正文。
    return removeSelfCheckBlocks(text);
}

function parseModelOutput(text, expectedQuestions = []) {
    const normalized = normalizeModelXmlText(text);
    const reasoningBoundaryRepair = repairReasoningBoundaryAroundSelfCheck(normalized.source);
    const source = reasoningBoundaryRepair.text;
    const openMatch = STSC_CHECK_OPEN_RE.exec(source);
    const closeMatch = STSC_CHECK_CLOSE_RE.exec(source);
    const result = {
        status: 'missing',
        formatIssues: [],
        recoveryNotes: [],
        rawCheck: '',
        body: extractVisibleBody(source),
        items: [],
        answers: [],
        repaired: false,
    };

    if (!openMatch) {
        result.formatIssues.push('完全没有输出 <stsc_self_check>。');
        return result;
    }

    const innerStart = openMatch.index + openMatch[0].length;
    const hasUsableClose = Boolean(closeMatch && closeMatch.index >= openMatch.index);
    const innerEnd = hasUsableClose ? closeMatch.index : source.length;
    const inner = source.slice(innerStart, innerEnd).trim();
    if (!hasUsableClose) {
        result.repaired = true;
        result.recoveryNotes.push('自检结束标签缺失，插件已按返回文本末尾自动补全并继续解析。');
    }
    if (normalized.decodedOuterXml) {
        result.repaired = true;
        result.recoveryNotes.push('自检XML被转义，插件已自动还原后解析。');
    }
    if (reasoningBoundaryRepair.repairedTags.length) {
        result.repaired = true;
        result.recoveryNotes.push('AI把正文错误包在思维链标签内，插件已在自检开始前闭合推理区，并把正文保留在思维链外。');
    }
    result.rawCheck = inner;
    result.items = parseItems(inner);
    // 仅精准移除 <stsc_self_check>…</stsc_self_check>，保留它之前的原生 thinking / reasoning 与之后的正文。
    result.body = extractVisibleBody(source);

    const usedItems = new Set();
    let usedOrderFallback = false;
    result.answers = expectedQuestions.map((question, questionIndex) => {
        const aliases = new Set([String(question.id || '').toLowerCase(), `q${questionIndex + 1}`, String(questionIndex + 1)]);
        let itemIndex = result.items.findIndex((item, index) => !usedItems.has(index) && item.id && aliases.has(item.id.toLowerCase()));
        if (itemIndex < 0) {
            itemIndex = result.items.findIndex((item, index) => !usedItems.has(index) && item.index === questionIndex + 1);
        }
        if (itemIndex < 0 && result.items[questionIndex] && !usedItems.has(questionIndex)) {
            itemIndex = questionIndex;
            usedOrderFallback = true;
        }
        const item = itemIndex >= 0 ? result.items[itemIndex] : {};
        if (itemIndex >= 0) usedItems.add(itemIndex);
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
    if (usedOrderFallback) {
        result.repaired = true;
        result.recoveryNotes.push('部分题号与预期不一致，插件已按输出顺序恢复对应关系。');
    }

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

    const reasoningWrapper = visibleResponseReasoningWrapper(result.body);
    if (reasoningWrapper) {
        result.formatIssues.push(`最终正文仍被 <${reasoningWrapper}> 推理标签包裹；插件无法安全判断标签内部的正文起点，因此没有强行删除内容。`);
    }

    result.status = result.formatIssues.length ? 'format_error' : (result.repaired ? 'recovered' : 'ok');
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
    // 只改写可见正文文本，不读取、不覆盖 message.extra.reasoning 或各 swipe 的 reasoning 数据。
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

function makeLatestResult({ parsed, questions, mode, messageId, rawOverride = '', statusOverride = '' }) {
    const entity = getCurrentEntity();
    const boundPreset = getBoundPreset();
    const settings = normalizeSettings();

    const status = statusOverride || parsed.status;
    return {
        version: STSC_VERSION,
        timestamp: Date.now(),
        chatId: getCurrentChatId(),
        messageId,
        characterKey: entity.key,
        characterName: entity.name,
        mode,
        status,
        issueViewed: !['missing', 'format_error'].includes(status),
        formatIssues: parsed.formatIssues || [],
        recoveryNotes: parsed.recoveryNotes || [],
        rawCheck: rawOverride || parsed.rawCheck || '',
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
        dual_ok: '双API自检已完成',
        recovered: '自检格式已自动修复',
    }[status] || '暂无状态';
}

function statusIcon(status) {
    return {
        ok: '✓',
        strict_ok: '✓',
        dual_ok: '✓',
        recovered: '✓',
        format_error: '⚠',
        missing: '!',
    }[status] || '○';
}

function statusClass(status) {
    if (status === 'ok' || status === 'strict_ok' || status === 'dual_ok' || status === 'recovered') return 'stsc-status-ok';
    if (status === 'format_error') return 'stsc-status-warning';
    if (status === 'missing') return 'stsc-status-error';
    return '';
}

async function handleMessageReceived(data) {
    if (internalQuietActive) return;

    const settings = normalizeSettings();
    if (!settings?.enabled) {
        // 插件关闭时不读取、不解析、不改写任何AI回复，也不生成缺失/格式错误提示。
        pendingRun = null;
        clearRuntimePrompts();
        return;
    }

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

    if (mode === 'dual_api' && run?.dualCheck) {
        const mainParsed = parseModelOutput(rawText, []);
        const body = mainParsed.status === 'missing' ? String(rawText ?? '').trim() : mainParsed.body;
        updateMessageText(message, body);

        const checkParsed = run.dualParsed || parseModelOutput(run.dualCheck, questions);
        const dualStatus = checkParsed.status === 'ok' ? 'dual_ok' : checkParsed.status;
        latest = makeLatestResult({
            parsed: checkParsed,
            questions,
            mode,
            messageId,
            rawOverride: checkParsed.rawCheck || run.dualCheck,
            statusOverride: dualStatus,
        });
        latest.previousReview = run.previousReview || null;
        const mainReasoningWrapper = visibleResponseReasoningWrapper(body);
        if (mainReasoningWrapper) {
            latest.formatIssues.push(`酒馆主API把整段可见回复放进了 <${mainReasoningWrapper}> 思维链标签；插件无法安全判断正文起点，因此没有强行删除内容。`);
            latest.status = 'format_error';
            latest.issueViewed = false;
        }
        if (mainParsed.status !== 'missing') {
            latest.formatIssues.push('酒馆主API意外重复输出了自检内容，插件已自动移除。');
            if (latest.status === 'dual_ok') latest.status = 'format_error';
            latest.issueViewed = false;
        }
    } else {
        parsed = parseModelOutput(rawText, questions);
        updateMessageText(message, parsed.body);
        latest = makeLatestResult({ parsed, questions, mode: 'single', messageId });
    }

    refreshMessageDom(messageId, message);
    await saveLatestResult(latest);
    addGenerationResultLog(latest, message.mes || '');

    try {
        await context.saveChat?.();
    } catch (error) {
        console.warn('[STSC] 保存已剥离自检的正文失败：', error);
    }

    pendingRun = null;
    clearRuntimePrompts();
    renderAll();
}

function removeLegacyMessageBadges() {
    // v0.2.4：格式错误只在悬浮按钮上提示，不再往正文楼层插入任何标记。
    $('.stsc-message-badge').remove();
}

function onGenerationEnded() {
    clearRuntimePrompts();
    // 极端情况下没有收到最终消息事件，避免运行状态永久残留。
    setTimeout(() => {
        if (pendingRun && Date.now() - pendingRun.startedAt > 4500) {
            const character = runtimeCharacterLabel({ characterName: pendingRun.characterName || '' });
            const mode = pendingRun.mode === 'dual_api' ? '双API' : '单API';
            addRuntimeLog('error', '本轮结果', `${character}：本轮生成已经结束，但插件没有收到可保存的AI正文。`, `本轮原本使用${mode}模式。请重新生成；如果连续发生，请检查主API连接和酒馆控制台。`);
            pendingRun = null;
        }
    }, 5000);
}

function onGenerationStopped() {
    clearRuntimePrompts();
    if (pendingRun) {
        const character = runtimeCharacterLabel({ characterName: pendingRun.characterName || '' });
        addRuntimeLog('warning', '本轮结果', `${character}：本轮生成在完成前被停止，没有形成完整结果。`, '如果这是你手动停止的，可以忽略；如果不是，请检查主API连接是否中断。');
    }
    pendingRun = null;
    dualApiBusy = false;
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
        characterName: getCurrentEntity()?.name || '',
        startedAt: Date.now(),
        generationType: type,
        dualCheck: '',
        dualParsed: null,
        previousReview: null,
        targetMessageFloor,
    };

    if (settings.mode === 'dual_api') {
        if (dualApiBusy) {
            abort?.(true);
            pendingRun = null;
            toastr.warning('上一轮独立自检仍在处理中，请稍后再试。', '墨提斯之镜');
            return;
        }
        dualApiBusy = true;
        try {
            const dualQuestions = getDualApiQuestions(settings);
            const reviewExpected = Boolean(getReviewSource(settings));
            pendingRun.questions = clone(dualQuestions);
            const initialResponse = await callDualApiSelfCheck({
                chat: _chat,
                questions: dualQuestions,
                references,
                temporaryInstructions,
                settings,
            });
            let rawCheck = initialResponse.text;
            let dualParsed = parseModelOutput(rawCheck, dualQuestions);
            let previousReview = parsePreviousReview(rawCheck);
            const initialSelfCheckComplete = dualParsedIsComplete(dualParsed, dualQuestions);
            const initialReviewMissing = reviewExpected && !previousReview;

            if ((!initialSelfCheckComplete || initialReviewMissing) && settings.dualApi.retryTransient && initialResponse.attempts === 1) {
                const firstIncomplete = initialSelfCheckComplete ? '' : dualIncompleteMessage(dualParsed, dualQuestions);
                try {
                    const retryResponse = await callDualApiSelfCheck({
                        chat: _chat,
                        questions: dualQuestions,
                        references,
                        temporaryInstructions,
                        settings,
                    }, { compact: true, allowTransientRetry: false, timeoutSecondsOverride: 60 });
                    const retryRawCheck = retryResponse.text;
                    const retryParsed = parseModelOutput(retryRawCheck, dualQuestions);
                    const retryReview = parsePreviousReview(retryRawCheck);
                    const retrySelfCheckComplete = dualParsedIsComplete(retryParsed, dualQuestions);
                    if (retrySelfCheckComplete && (!initialSelfCheckComplete || retryReview)) {
                        rawCheck = retryRawCheck;
                        dualParsed = retryParsed;
                        previousReview = retryReview || previousReview;
                        dualParsed.repaired = true;
                        dualParsed.recoveryNotes ||= [];
                        dualParsed.recoveryNotes.push(initialSelfCheckComplete
                            ? '首次返回漏掉上一轮复盘，插件已通过精简上下文重试取得复盘结果。'
                            : '首次返回不完整，插件已通过精简上下文重试并取得完整自检结果。');
                        if (dualParsed.status === 'ok') dualParsed.status = 'recovered';
                    } else if (initialSelfCheckComplete && retryReview) {
                        previousReview = retryReview;
                        dualParsed.recoveryNotes ||= [];
                        dualParsed.recoveryNotes.push('插件已从精简重试中恢复上一轮复盘，并保留首次返回的完整本轮自检。');
                    } else if (!initialSelfCheckComplete) {
                        throw new Error(`${firstIncomplete} 精简重试后仍然不完整：${dualIncompleteMessage(retryParsed, dualQuestions)}`);
                    } else {
                        dualParsed.recoveryNotes ||= [];
                        dualParsed.recoveryNotes.push('插件已重试上一轮复盘，但模型仍未返回复盘标签。');
                    }
                } catch (retryError) {
                    if (!initialSelfCheckComplete) {
                        if (String(retryError?.message || '').startsWith(firstIncomplete)) throw retryError;
                        throw new Error(`${firstIncomplete} 精简重试失败：${dualApiFailureMessage(retryError)}`);
                    }
                    dualParsed.recoveryNotes ||= [];
                    dualParsed.recoveryNotes.push(`上一轮复盘重试失败：${dualApiFailureMessage(retryError)}`);
                }
            }

            if (!dualParsedIsComplete(dualParsed, dualQuestions)) {
                throw new Error(dualIncompleteMessage(dualParsed, dualQuestions));
            }
            if (dualParsed.status === 'missing') {
                dualParsed.status = 'format_error';
                dualParsed.formatIssues.push('独立自检API返回了文本，但没有按要求输出 <stsc_self_check> 结构。');
            }
            if (reviewExpected && !previousReview) {
                previousReview = {
                    timestamp: Date.now(),
                    status: 'missing',
                    issues: [],
                    reason: '自检API没有按要求返回 <stsc_previous_review> 复盘标签；本轮自检与正文仍正常完成。',
                };
            }
            pendingRun.dualCheck = rawCheck;
            pendingRun.dualParsed = dualParsed;
            pendingRun.previousReview = previousReview;
            pendingRun.mode = 'dual_api';
            applyDualApiMainPrompt(dualQuestions, dualParsed, rawCheck, settings);
            if (dualParsed.status === 'format_error') {
                toastr.warning('独立自检API已经返回结果，但格式不完整。本轮仍会把结果交给酒馆主API，并在自检记录中标记格式问题。', '墨提斯之镜', { timeOut: 7000 });
            }
        } catch (error) {
            console.error('[STSC] 双API自检调用失败：', error);
            const reason = dualApiFailureMessage(error);
            const character = runtimeCharacterLabel({ characterName: getCurrentEntity()?.name || '' });
            if (settings.dualApi.failureMode === 'fallback_single') {
                addRuntimeLog('warning', '自检API', `${character}：${reason}`, '插件已经自动改用单API继续生成，本轮不会直接中断。');
                pendingRun.mode = 'single';
                pendingRun.questions = clone(questions);
                setRuntimePrompt('stsc_main', buildSinglePrompt(questions), settings.injection);
                toastr.warning(`独立自检API调用失败，已自动退回单API模式。原因：${reason}`, '墨提斯之镜', { timeOut: 9000 });
            } else {
                addRuntimeLog('error', '自检API', `${character}：${reason}`, '当前设置要求双API失败时停止，因此本轮生成已经停止。');
                abort?.(true);
                pendingRun = null;
                clearRuntimePrompts();
                toastr.error(`独立自检API调用失败，本轮生成已停止。原因：${reason}`, '墨提斯之镜', { timeOut: 9000 });
                return;
            }
        } finally {
            dualApiBusy = false;
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

function generationModeLabel(mode, detailed = false) {
    const labels = {
        single: detailed ? '单API调用（一次调用）' : '单API调用',
        dual_api: detailed ? '双API调用（插件API自检＋酒馆主API正文）' : '双API调用',
        // 仅用于兼容旧聊天中已经保存的历史模式名称，不再作为可选或可执行模式。
        strict: detailed ? '旧双阶段模式（已移除）' : '旧双阶段模式',
    };
    return labels[mode] || labels.single;
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
                <span class="stsc-status-pill">${escapeHtml(generationModeLabel(latest.mode))}</span>
                <span class="stsc-status-pill">${latest.answeredCount}/${latest.expectedCount} 题</span>
                <span class="stsc-status-pill">${new Date(latest.timestamp).toLocaleString()}</span>
            </div>
            ${issues}
            ${answers}
        `;
    }

    const tempPills = summary.temps.length
        ? `<div class="stsc-selected-instructions">${summary.temps.map(instruction => `<span class="stsc-temp-pill">${escapeHtml(instruction.name)}｜${escapeHtml(instructionActivationLabel(instruction.activation))}</span>`).join('')}</div>`
        : '<div class="stsc-muted">当前没有启用快捷指令。</div>';

    $('#stsc_tab_status').html(`
        <div class="stsc-section">
            <div class="stsc-section-title">当前生效内容</div>
            <div><b>角色：</b>${escapeHtml(summary.entity.name)}</div>
            <div><b>预设：</b>${escapeHtml(summary.presetText)}</div>
            <div><b>参考资料：</b>${summary.refs.length ? summary.refs.map(x => escapeHtml(x.name)).join('、') : '无'}</div>
            <div><b>模式：</b>${escapeHtml(generationModeLabel(settings.mode, true))}</div>
            <div class="stsc-section-title" style="margin-top:12px">当前启用的快捷指令</div>
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
    return preset.questions.map((question, index) => {
        const expanded = expandedQuestionIds.has(question.id);
        const preview = String(question.text || '').trim() || '未填写问题内容';
        return `
        <div class="stsc-question-card stsc-collapsible-card ${expanded ? 'is-expanded' : 'is-collapsed'}" data-question-id="${escapeHtml(question.id)}">
            <div class="stsc-question-summary stsc-collapsible-summary">
                <button class="stsc-collapse-button" type="button" data-action="toggle-question-collapse" aria-expanded="${expanded ? 'true' : 'false'}">
                    <span class="stsc-collapse-chevron" aria-hidden="true">${expanded ? '▾' : '▸'}</span>
                    <span class="stsc-question-summary-text"><b>Q${index + 1}</b><span>${escapeHtml(preview)}</span></span>
                </button>
                <label class="checkbox_label stsc-summary-enable">
                    <input type="checkbox" data-question-field="enabled" ${question.enabled ? 'checked' : ''}>
                    <span>${question.enabled ? '已启用' : '未启用'}</span>
                </label>
            </div>
            <div class="stsc-question-body stsc-collapsible-body">
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
                        <label>回答要求</label>
                        <label class="checkbox_label"><input type="checkbox" data-question-field="requireEvidence" ${question.requireEvidence ? 'checked' : ''}> 要求剧情/设定依据</label>
                    </div>
                </div>
                <div class="stsc-card-actions stsc-collapsible-actions">
                    <button class="menu_button stsc-small-button stsc-icon-action" type="button" data-action="move-question-up" title="上移" aria-label="上移" ${index === 0 ? 'disabled' : ''}><i class="fa-solid fa-arrow-up"></i><span class="stsc-action-label">上移</span></button>
                    <button class="menu_button stsc-small-button stsc-icon-action" type="button" data-action="move-question-down" title="下移" aria-label="下移" ${index === preset.questions.length - 1 ? 'disabled' : ''}><i class="fa-solid fa-arrow-down"></i><span class="stsc-action-label">下移</span></button>
                    <button class="menu_button stsc-small-button stsc-danger-button stsc-icon-action" type="button" data-action="delete-question" title="删除问题" aria-label="删除问题"><i class="fa-solid fa-trash-can"></i><span class="stsc-action-label">删除</span></button>
                </div>
            </div>
        </div>`;
    }).join('');
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
        <div class="stsc-section stsc-preset-master-switches">
            <div class="stsc-section-title">自检启用状态</div>
            <div class="stsc-status-switch-grid">
                <label class="checkbox_label"><span class="stsc-signal ${settings.generalEnabled ? 'is-on' : 'is-off'}"></span><input id="stsc_general_enabled" type="checkbox" ${settings.generalEnabled ? 'checked' : ''}> 通用自检${settings.generalEnabled ? '已启用' : '未启用'}</label>
                <label class="checkbox_label"><span class="stsc-signal ${settings.characterEnabled ? 'is-on' : 'is-off'}"></span><input id="stsc_character_enabled" type="checkbox" ${settings.characterEnabled ? 'checked' : ''}> 角色自检${settings.characterEnabled ? '已启用' : '未启用'}</label>
            </div>
            <div class="stsc-muted">通用与角色自检只在这里启用；插件总开关位于“插件设置”。</div>
        </div>
        <div class="stsc-preset-subtabs" role="tablist" aria-label="预设类型">
            <button type="button" class="stsc-preset-subtab ${kind === 'general' ? 'active' : ''}" data-preset-section="general">通用预设</button>
            <button type="button" class="stsc-preset-subtab ${kind === 'character' ? 'active' : ''}" data-preset-section="character">角色预设</button>
        </div>

        <div class="stsc-section">
            <div class="stsc-section-title">${pageTitle}</div>
            <div class="stsc-muted">${kind === 'general' ? '通用预设可在所有角色中持续生效；可以创建多套，但同一时间只选择一套作为当前通用预设。' : '角色预设创建后默认不绑定。打开角色卡聊天页面后，再手动绑定到当前角色。'}</div>
            <div class="stsc-preset-controls" style="margin-top:10px">
                ${presets.length ? `<select id="${selectId}" class="text_pole stsc-preset-select">${presetOptions(kind, preset?.id, settings)}</select>` : '<div></div>'}
                <div class="stsc-preset-action-toolbar" role="toolbar" aria-label="预设操作">
                    <button class="menu_button stsc-compact-action" type="button" data-action="open-create-preset" data-kind="${kind}" title="新建预设" aria-label="新建预设"><i class="fa-solid fa-plus"></i><span class="stsc-action-label">新建预设</span></button>
                    <button class="menu_button stsc-compact-action" type="button" data-action="copy-preset" title="复制预设" aria-label="复制预设" ${preset ? '' : 'disabled'}><i class="fa-solid fa-copy"></i><span class="stsc-action-label">复制</span></button>
                    <button class="menu_button stsc-compact-action" type="button" data-action="export-preset" title="导出当前预设" aria-label="导出当前预设" ${preset ? '' : 'disabled'}><i class="fa-solid fa-file-export"></i><span class="stsc-action-label">导出</span></button>
                    <button class="menu_button stsc-compact-action" type="button" data-action="import-preset" title="导入预设" aria-label="导入预设"><i class="fa-solid fa-file-import"></i><span class="stsc-action-label">导入</span></button>
                    <button class="menu_button stsc-danger-button stsc-compact-action" type="button" data-action="delete-preset" title="删除预设" aria-label="删除预设" ${preset ? '' : 'disabled'}><i class="fa-solid fa-trash-can"></i><span class="stsc-action-label">删除</span></button>
                </div>
                <input id="stsc_preset_import_file" class="stsc-file-input" type="file" accept=".json,.stsc-preset.json,application/json" aria-label="选择要导入的自检预设文件">
            </div>
            <div class="stsc-muted" style="margin-top:8px">导出文件只包含预设名称、类型和问题设置，不包含角色绑定、聊天记录或自检结果。导入内容会先作为未保存更改加入插件。</div>
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
        ? settings.references.map(reference => {
            const expanded = expandedReferenceIds.has(reference.id);
            const config = referenceTypeConfig(reference.type);
            const questionDisabled = !reference.enabled;
            const scopeText = reference.scope === 'character'
                ? `角色专属${reference.characterKey ? '（已绑定）' : '（未绑定）'}`
                : '通用生效';

            return `
            <div class="stsc-reference-card ${expanded ? 'is-expanded' : 'is-collapsed'}" data-reference-id="${escapeHtml(reference.id)}">
                <div class="stsc-reference-summary">
                    <button class="stsc-reference-collapse-button" type="button" data-action="toggle-reference-collapse" aria-expanded="${expanded ? 'true' : 'false'}">
                        <span class="stsc-reference-chevron" aria-hidden="true">${expanded ? '▾' : '▸'}</span>
                        <span class="stsc-reference-summary-name">${escapeHtml(reference.name)}</span>
                    </button>
                    <label class="checkbox_label stsc-reference-enable">
                        <input type="checkbox" data-reference-field="enabled" ${reference.enabled ? 'checked' : ''}>
                        <span>${reference.enabled ? '已启用' : '未启用'}</span>
                    </label>
                </div>

                <div class="stsc-reference-body">
                    <div class="stsc-grid-2">
                        <div class="stsc-field">
                            <label>资料库名称</label>
                            <input class="text_pole" data-reference-field="name" type="text" maxlength="80" value="${escapeHtml(reference.name)}">
                            <div class="stsc-dialog-error" data-reference-name-error></div>
                        </div>
                        <div class="stsc-field">
                            <label>资料类型</label>
                            <select class="text_pole" data-reference-field="type">
                                <option value="style" ${reference.type === 'style' ? 'selected' : ''}>文风</option>
                                <option value="restriction" ${reference.type === 'restriction' ? 'selected' : ''}>限制</option>
                                <option value="other" ${reference.type === 'other' ? 'selected' : ''}>其他</option>
                            </select>
                            <div class="stsc-muted">${escapeHtml(referencePositionHint(reference))}</div>
                        </div>
                    </div>

                    <div class="stsc-field" style="margin-top:9px">
                        <label>${config.label}内容</label>
                        <textarea class="text_pole stsc-textarea" data-reference-field="content" placeholder="在这里填写要注入给 AI 的完整资料内容">${escapeHtml(reference.content)}</textarea>
                    </div>

                    <div class="stsc-grid-2" style="margin-top:9px">
                        <div class="stsc-field">
                            <label>生效范围</label>
                            <select class="text_pole" data-reference-field="scope">
                                <option value="global" ${reference.scope === 'global' ? 'selected' : ''}>通用生效</option>
                                <option value="character" ${reference.scope === 'character' ? 'selected' : ''}>角色专属</option>
                            </select>
                            <div class="stsc-muted">当前：${escapeHtml(scopeText)}</div>
                        </div>
                        <div class="stsc-field">
                            <label>角色绑定</label>
                            <button class="menu_button" type="button" data-action="bind-reference-character">绑定到 ${escapeHtml(entity.name)}</button>
                            ${reference.characterKey ? `<div class="stsc-muted">已保存角色绑定；切换为“通用生效”时不会删除绑定记录。</div>` : '<div class="stsc-muted">角色专属资料需要先进入对应角色聊天并完成绑定。</div>'}
                        </div>
                    </div>

                    <div class="stsc-section stsc-reference-injection-section">
                        <div class="stsc-section-title">注入设置</div>
                        <div class="stsc-muted">创建时已按“${config.label}”自动选择推荐位置，仍可手动调整。</div>
                        <div class="stsc-grid-3" style="margin-top:9px">
                            <div class="stsc-field">
                                <label>注入位置</label>
                                <select class="text_pole" data-reference-field="position">
                                    <option value="before" ${reference.position === 'before' ? 'selected' : ''}>系统最前</option>
                                    <option value="prompt" ${reference.position === 'prompt' ? 'selected' : ''}>主提示词内</option>
                                    <option value="chat" ${reference.position === 'chat' ? 'selected' : ''}>聊天深度</option>
                                </select>
                            </div>
                            <div class="stsc-field">
                                <label>深度（0～20）</label>
                                <input class="text_pole" data-reference-field="depth" type="number" min="0" max="20" value="${reference.depth}">
                            </div>
                            <div class="stsc-field">
                                <label>角色</label>
                                <select class="text_pole" data-reference-field="role">
                                    <option value="system" ${reference.role === 'system' ? 'selected' : ''}>System</option>
                                    <option value="user" ${reference.role === 'user' ? 'selected' : ''}>User</option>
                                    <option value="assistant" ${reference.role === 'assistant' ? 'selected' : ''}>Assistant</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <div class="stsc-reference-question-section ${questionDisabled ? 'is-disabled' : ''}">
                        <label class="checkbox_label">
                            <input type="checkbox" data-reference-field="addToCheck" ${reference.addToCheck ? 'checked' : ''} ${questionDisabled ? 'disabled' : ''}>
                            自动加入自检问答末尾
                        </label>
                        <div class="stsc-muted">${questionDisabled ? '请先启用这个资料库，才能启用对应的自检问题。' : '启用后，AI 会先看到资料内容，再回答下面的自检问题。'}</div>
                        <div class="stsc-field" style="margin-top:8px">
                            <label>自动生成的自检问题（可修改）</label>
                            <textarea class="text_pole" data-reference-field="autoQuestion">${escapeHtml(reference.autoQuestion)}</textarea>
                            <div class="stsc-muted">可使用 {{name}} 代表资料库名称。该问题固定要求提供依据。</div>
                        </div>
                    </div>

                    <div class="stsc-button-row stsc-reference-danger-row">
                        <button class="menu_button stsc-compact-action" type="button" data-action="export-reference" title="导出这个资料库" aria-label="导出这个资料库"><i class="fa-solid fa-file-export"></i><span class="stsc-action-label">导出资料库</span></button>
                        <button class="menu_button stsc-danger-button stsc-compact-action" type="button" data-action="delete-reference" title="删除这个资料库" aria-label="删除这个资料库"><i class="fa-solid fa-trash-can"></i><span class="stsc-action-label">删除资料库</span></button>
                    </div>
                </div>
            </div>`;
        }).join('')
        : '<div class="stsc-empty">资料库还是空的。</div>';

    $('#stsc_tab_references').html(`
        <div class="stsc-section">
            <div class="stsc-section-title">参考资料库</div>
            <div class="stsc-muted">像世界书一样保存文风、强制限制或其他长期资料。所有资料默认折叠；只有启用资料库后，才能开启它对应的自检问题。</div>
            <div class="stsc-toolbar stsc-reference-action-toolbar" style="margin-top:9px">
                <button class="menu_button stsc-compact-action" type="button" data-action="open-create-reference" title="新建资料库" aria-label="新建资料库"><i class="fa-solid fa-plus"></i><span class="stsc-action-label">新建资料库</span></button>
                <button class="menu_button stsc-compact-action" type="button" data-action="batch-export-references" title="批量导出资料库" aria-label="批量导出资料库" ${settings.references.length ? '' : 'disabled'}><i class="fa-solid fa-box-archive"></i><span class="stsc-action-label">批量导出</span></button>
                <button class="menu_button stsc-compact-action" type="button" data-action="import-reference" title="导入资料库或资料库合集" aria-label="导入资料库或资料库合集"><i class="fa-solid fa-file-import"></i><span class="stsc-action-label">导入资料库</span></button>
                <input id="stsc_reference_import_file" class="stsc-file-input" type="file" accept=".json,.stsc-reference.json,.stsc-references.json,application/json" aria-label="选择要导入的参考资料库文件或合集文件">
            </div>
            <div class="stsc-muted" style="margin-top:8px">支持导入单个资料库或一次导入整个资料库合集。导入内容默认保持关闭，角色绑定不会随文件导入；请展开检查后再手动启用。</div>
            <div class="stsc-reference-list">${references}</div>
        </div>
    `);
}
function renderTemporaryTab() {
    const settings = getUiSettings();
    const instructions = settings.temporaryInstructions.length
        ? settings.temporaryInstructions.map(instruction => {
            const expanded = expandedInstructionIds.has(instruction.id);
            const mode = instructionActivationMode(instruction.id, settings);
            const preview = String(instruction.content || '').trim() || '尚未填写指令内容';
            return `
            <div class="stsc-temp-card stsc-collapsible-card ${expanded ? 'is-expanded' : 'is-collapsed'}" data-temp-id="${escapeHtml(instruction.id)}">
                <div class="stsc-temp-summary stsc-collapsible-summary">
                    <button class="stsc-collapse-button" type="button" data-action="toggle-temp-collapse" aria-expanded="${expanded ? 'true' : 'false'}">
                        <span class="stsc-collapse-chevron" aria-hidden="true">${expanded ? '▾' : '▸'}</span>
                        <span class="stsc-temp-summary-text"><b>${escapeHtml(instruction.name)}</b><span>${escapeHtml(preview)}</span></span>
                    </button>
                    <span class="stsc-status-pill stsc-instruction-mode-${mode}">${escapeHtml(instructionActivationLabel(mode))}</span>
                </div>
                <div class="stsc-temp-body stsc-collapsible-body">
                    <div class="stsc-field"><label>指令名称</label><input class="text_pole" data-temp-field="name" type="text" value="${escapeHtml(instruction.name)}"></div>
                    <div class="stsc-field" style="margin-top:8px"><label>发送给 AI 的指令内容</label><textarea class="text_pole stsc-textarea" data-temp-field="content">${escapeHtml(instruction.content)}</textarea></div>
                    <div class="stsc-muted" style="margin-top:8px">启用方式请在悬浮窗的“快捷指令”页面选择：临时一轮会在下一次生成开始后自动关闭，常开会每轮持续注入。</div>
                    <div class="stsc-card-actions stsc-collapsible-actions">
                        <button class="menu_button stsc-small-button stsc-danger-button stsc-icon-action" type="button" data-action="delete-temp" title="删除指令" aria-label="删除指令"><i class="fa-solid fa-trash-can"></i><span class="stsc-action-label">删除指令</span></button>
                    </div>
                </div>
            </div>`;
        }).join('')
        : '<div class="stsc-empty">还没有保存快捷指令。</div>';

    $('#stsc_tab_temporary').html(`
        <div class="stsc-section">
            <div class="stsc-section-title">快捷指令库</div>
            <div class="stsc-muted">在完整管理器中创建和编辑指令；在悬浮窗的“快捷指令”页面选择关闭、临时一轮或常开。所有指令默认折叠，点击横条即可展开。</div>
            <div class="stsc-toolbar" style="margin-top:9px">
                <button class="menu_button" data-action="add-temp">＋ 新建快捷指令</button>
            </div>
            <div class="stsc-instruction-list">${instructions}</div>
        </div>
    `);
}

function renderSettingsTab() {
    const settings = getUiSettings();
    const dual = settings.dualApi || DEFAULT_SETTINGS.dualApi;
    const dualVisible = settings.mode === 'dual_api';
    const customTurnsVisible = dual.contextMode === 'custom';
    const modelOptions = dualApiModelOptionsHtml(dual);
    $('#stsc_tab_settings').html(`
        ${devMigrationSettingsHtml()}
        <div class="stsc-section">
            <div class="stsc-section-title">运行状态</div>
            <div class="stsc-status-lights">
                <span><i class="stsc-signal ${settings.enabled ? 'is-on' : 'is-off'}"></i>插件${settings.enabled ? '已启用' : '未启用'}</span>
                <span><i class="stsc-signal ${settings.generalEnabled ? 'is-on' : 'is-off'}"></i>通用自检${settings.generalEnabled ? '已启用' : '未启用'}</span>
                <span><i class="stsc-signal ${settings.characterEnabled ? 'is-on' : 'is-off'}"></i>角色自检${settings.characterEnabled ? '已启用' : '未启用'}</span>
                <span><i class="stsc-signal ${settings.mode === 'dual_api' ? (dualApiModelsError ? 'is-off' : 'is-on') : 'is-na'}"></i>${settings.mode === 'dual_api' ? '双API模式' : '单API模式'}</span>
                <span><i class="stsc-signal ${settings.mode === 'dual_api' ? (dual.transformFormat ? 'is-on' : 'is-off') : 'is-na'}"></i>强力规范转化</span>
                <span><i class="stsc-signal ${settings.mode === 'dual_api' ? (dual.previousReview ? 'is-on' : 'is-off') : 'is-na'}"></i>上一轮复盘</span>
            </div>
        </div>
        <div class="stsc-section">
            <div class="stsc-section-title">运行方式</div>
            <label class="checkbox_label"><input id="stsc_setting_enabled" type="checkbox" ${settings.enabled ? 'checked' : ''}> 启用插件</label>
            <div style="margin-top:10px">
                <div class="stsc-field"><label>生成模式</label><select id="stsc_setting_mode" class="text_pole">
                    <option value="single" ${settings.mode === 'single' ? 'selected' : ''}>单API调用：自检与正文一次生成（现有模式）</option>
                    <option value="dual_api" ${settings.mode === 'dual_api' ? 'selected' : ''}>双API调用：插件API自检，酒馆主API写正文</option>
                </select>
                <div class="stsc-mode-help">
                    ${settings.mode === 'single' ? '当前模式不变：由酒馆主API在同一次回复中完成自检和正文。' : ''}
                    ${settings.mode === 'dual_api' ? '插件API只负责回答自检；结果会在下一阶段交给酒馆主API生成正文。' : ''}
                </div></div>
            </div>
            <div class="stsc-dual-branch-card" style="margin-top:12px">
                <div class="stsc-dual-branch-grid">
                    <div class="stsc-dual-branch ${settings.mode === 'single' ? 'is-active' : ''}">
                        <b>单API调用（默认）</b>
                        <span><b>优点：</b>速度快、省额度，同一模型连续完成自检和正文，角色与文风通常更自然。</span>
                        <span><b>不足：</b>问题较多时可能漏答或分心，复杂格式与硬性限制的执行稳定性稍弱。</span>
                    </div>
                    <div class="stsc-dual-branch ${settings.mode === 'dual_api' ? 'is-active' : ''}">
                        <b>双API调用</b>
                        <span><b>优点：</b>自检与正文分工，复杂规则、关系阶段和固定格式通常更稳定，也更方便查看与排查。</span>
                        <span><b>不足：</b>会增加一次调用与等待；自检模型判断错误时，也可能把错误规则传给正文模型。</span>
                    </div>
                </div>
                <div class="stsc-muted" style="margin-top:8px">日常聊天或更重视自然演绎时可用单API；规则较多、经常漏格式或关系跳级时可用双API。</div>
            </div>
        </div>

        <div id="stsc_dual_api_section" class="stsc-section stsc-dual-api-section ${dualVisible ? '' : 'stsc-hidden'}">
            <div class="stsc-section-title stsc-section-title-row">
                <span>双API调用设置</span>
                <span class="stsc-dev-pill">独立自检</span>
            </div>
            <div class="stsc-dev-notice">
                双API核心流程已启用：每次生成会先消耗一次自检API调用，再把自检结果临时交给酒馆主API生成正文。可选择开启上一轮复盘和强力规范。
            </div>

            <div class="stsc-grid-2" style="margin-top:12px">
                <div class="stsc-field">
                    <label>自检API接口地址</label>
                    <input id="stsc_dual_endpoint" class="text_pole" type="text" autocomplete="off" placeholder="例如：https://example.com/v1" value="${escapeHtml(dual.endpoint)}">
                    <div class="stsc-muted">填写 OpenAI 兼容接口的基础地址，通常以 <code>/v1</code> 结尾；不要填写 <code>/chat/completions</code>。</div>
                </div>
                <div class="stsc-field">
                    <label>自检模型</label>
                    <div class="stsc-model-row">
                        <select id="stsc_dual_model" class="text_pole" ${dualApiModels.length && !dualApiModelsLoading ? '' : 'disabled'}>
                            ${modelOptions}
                        </select>
                        <button id="stsc_refresh_models" class="menu_button stsc-small-button" type="button" ${normalizeDualApiBaseUrl(dual.endpoint) && !dualApiModelsLoading ? '' : 'disabled'}>${dualApiModelsLoading ? '获取中…' : '刷新模型'}</button>
                    </div>
                    <div id="stsc_dual_model_status" class="stsc-muted stsc-model-status ${dualApiModelsError ? 'stsc-model-status-error' : ''} ${dualApiModels.length && !dualApiModelsError ? 'stsc-model-status-success' : ''}">${escapeHtml(dualApiModelStatusText(dual))}</div>
                    <div class="stsc-muted">模型列表会根据接口自动拉取，不需要手动输入模型名称。</div>
                </div>
            </div>

            <div class="stsc-field" style="margin-top:10px">
                <label>API密钥</label>
                <div class="stsc-secret-row">
                    <input id="stsc_dual_api_key" class="text_pole" type="password" autocomplete="new-password" placeholder="sk-…" value="${escapeHtml(dual.apiKey)}">
                    <button id="stsc_toggle_api_key" class="menu_button stsc-small-button" type="button">显示</button>
                </div>
                <div class="stsc-muted">密钥保存在当前酒馆的插件设置中，不会写入导出的预设或资料库文件。</div>
            </div>

            <div class="stsc-grid-3" style="margin-top:10px">
                <div class="stsc-field">
                    <label>自检最大回复长度</label>
                    <input id="stsc_dual_max_tokens" class="text_pole" type="number" min="256" max="12000" step="128" value="${Math.round(dual.maxTokens)}">
                    <div class="stsc-muted">单位：Token</div>
                </div>
                <div class="stsc-field">
                    <label>自检API读取聊天范围</label>
                    <select id="stsc_dual_context_mode" class="text_pole">
                        <option value="recent5" ${dual.contextMode === 'recent5' ? 'selected' : ''}>最近5轮（默认）</option>
                        <option value="custom" ${dual.contextMode === 'custom' ? 'selected' : ''}>自定义轮数</option>
                        <option value="all" ${dual.contextMode === 'all' ? 'selected' : ''}>全部聊天</option>
                    </select>
                    <div class="stsc-muted">“一轮”指一组用户消息与AI回复；当前用户刚发送的消息会额外加入。</div>
                </div>
                <div id="stsc_dual_custom_turns_wrap" class="stsc-field ${customTurnsVisible ? '' : 'stsc-field-disabled'}">
                    <label>自定义轮数</label>
                    <input id="stsc_dual_custom_turns" class="text_pole" type="number" min="1" max="100" value="${Math.round(dual.customTurns)}" ${customTurnsVisible ? '' : 'disabled'}>
                </div>
            </div>

            <div class="stsc-grid-2" style="margin-top:10px">
                <div class="stsc-field">
                    <label>单次请求超时</label>
                    <input id="stsc_dual_timeout_seconds" class="text_pole" type="number" min="60" max="300" step="10" value="${Math.round(dual.timeoutSeconds)}">
                    <div class="stsc-muted">单位：秒，默认150秒。自动重试会改用精简上下文，并最多再等待60秒。</div>
                </div>
                <div class="stsc-field">
                    <label>瞬时错误补救</label>
                    <label class="checkbox_label"><input id="stsc_dual_retry_transient" type="checkbox" ${dual.retryTransient ? 'checked' : ''}> 自动精简重试一次</label>
                    <div class="stsc-muted">仅用于超时、限流、服务器异常、网络中断及不完整回答；认证失败不会重试。</div>
                </div>
            </div>

            <div class="stsc-dual-regex-note" style="margin-top:10px">
                <b>聊天正文读取说明</b>
                <span>自检API读取的是经过酒馆当前全局正则与角色局部出站正则处理后的聊天内容，与酒馆主API看到的正文保持一致。</span>
            </div>

            <div class="stsc-dual-branch-card" style="margin-top:12px">
                <label class="checkbox_label stsc-strong-checkbox">
                    <input id="stsc_dual_transform_format" type="checkbox" ${dual.transformFormat ? 'checked' : ''}>
                    将自检格式转化为强力规范
                </label>
                <div class="stsc-dual-branch-grid">
                    <div class="stsc-dual-branch ${!dual.transformFormat ? 'is-active' : ''}">
                        <b>不勾选</b>
                        <span>把问题、答案与依据原样作为 <code>Assistant role</code> 临时交给酒馆主API。</span>
                    </div>
                    <div class="stsc-dual-branch ${dual.transformFormat ? 'is-active' : ''}">
                        <b>勾选后</b>
                        <span>插件把自检答案包装成更明确的执行规范，再作为 <code>System role</code> 临时交给酒馆主API。</span>
                    </div>
                </div>
                <div class="stsc-muted" style="margin-top:8px">无论选择哪一种，自检与规范都只用于本轮，不写入正式聊天记录。</div>
                <label class="checkbox_label stsc-strong-checkbox" style="margin-top:12px">
                    <input id="stsc_previous_review" type="checkbox" ${dual.previousReview ? 'checked' : ''}>
                    开启上一轮复盘
                </label>
                <div class="stsc-muted">仅双API支持；检查上一轮自检与正文的疑似偏差。复盘结果只作为线索，不会自动修改剧情。</div>
            </div>

            <div class="stsc-grid-2" style="margin-top:12px">
                <div class="stsc-field">
                    <label>自检API失败时</label>
                    <select id="stsc_dual_failure_mode" class="text_pole">
                        <option value="fallback_single" ${dual.failureMode === 'fallback_single' ? 'selected' : ''}>自动退回单API调用，继续生成正文</option>
                        <option value="stop" ${dual.failureMode === 'stop' ? 'selected' : ''}>停止本轮生成并提示错误</option>
                    </select>
                </div>
                <div class="stsc-dual-library-note">
                    <b>资料库在双API模式下</b>
                    <span>资料库自动问题会改成“自包含规则型问题”，要求自检API说清楚正文具体该怎么写、怎么遵照；酒馆主API即使没有直接读取资料原文，也能看懂答案。</span>
                </div>
            </div>
        </div>

        <div class="stsc-section">
            <div class="stsc-section-title">自检与快捷指令默认注入位置</div>
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
            <div class="stsc-section-title">上下文处理</div>
            <div>插件不会在流式生成期间添加整段遮罩。建议使用 README 中提供的正则，仅隐藏 &lt;stsc_self_check&gt; 标签内的自检内容。</div>
            <div>生成完成后，插件会提取自检并从聊天正文中剥离。自检不会随聊天正文发给下一轮主API；开启双API复盘时，会将上一轮自检与正文提供给自检API。</div>
            <div class="stsc-code-note">&lt;stsc_self_check&gt;…&lt;/stsc_self_check&gt; → 正则隐藏并由插件保存
结束标签之后 → 正常流式正文</div>
        </div>
    `);

    if (dualVisible) {
        const signature = dualApiConnectionSignature(dual);
        setTimeout(() => {
            updateDualApiModelControl();
            if (normalizeDualApiBaseUrl(dual.endpoint) && signature !== dualApiModelsSignature) {
                scheduleDualApiModelFetch(120);
            }
        }, 0);
    }
}

function renderAppearanceTab() {
    const settings = getUiSettings();
    $('#stsc_tab_appearance').html(`
        <div class="stsc-section">
            <div class="stsc-section-title">主题与颜色</div>
            <div class="stsc-field"><label>插件配色</label><select id="stsc_theme" class="text_pole">
                <option value="default" ${settings.appearance.theme === 'default' ? 'selected' : ''}>默认：跟随 SillyTavern 美化</option>
                <option value="rose" ${settings.appearance.theme === 'rose' ? 'selected' : ''}>樱雾粉</option><option value="blue" ${settings.appearance.theme === 'blue' ? 'selected' : ''}>月光蓝</option>
                <option value="mint" ${settings.appearance.theme === 'mint' ? 'selected' : ''}>青瓷绿</option><option value="violet" ${settings.appearance.theme === 'violet' ? 'selected' : ''}>暮藤紫</option><option value="gold" ${settings.appearance.theme === 'gold' ? 'selected' : ''}>奶杏金</option>
            </select></div>
        </div>
        <div class="stsc-section">
            <div class="stsc-section-title">悬浮按钮</div>
            <label class="checkbox_label"><span class="stsc-signal ${settings.appearance.floatingEnabled ? 'is-on' : 'is-off'}"></span><input id="stsc_floating_enabled" type="checkbox" ${settings.appearance.floatingEnabled ? 'checked' : ''}> 显示悬浮按钮</label>
            <div class="stsc-floating-customizer">
                <div class="stsc-field stsc-range-field"><label>透明度 <span id="stsc_floating_opacity_value">${Math.round(settings.appearance.floatingOpacity * 100)}%</span></label><input id="stsc_floating_opacity" type="range" min="10" max="100" step="1" value="${Math.round(settings.appearance.floatingOpacity * 100)}"></div>
                <div class="stsc-field stsc-range-field"><label>按钮大小 <span id="stsc_floating_button_size_value">${Math.round(settings.appearance.floatingButtonSize)}px</span></label><input id="stsc_floating_button_size" type="range" min="34" max="50" step="2" value="${Math.round(settings.appearance.floatingButtonSize)}"></div>
            </div>
        </div>
        <div class="stsc-section">
            <div class="stsc-section-title">悬浮窗口</div>
            <div class="stsc-floating-customizer">
                <div class="stsc-field"><label>样式</label><select id="stsc_floating_style" class="text_pole"><option value="theme" ${settings.appearance.floatingStyle === 'theme' ? 'selected' : ''}>跟随插件主题</option><option value="glass" ${settings.appearance.floatingStyle === 'glass' ? 'selected' : ''}>磨砂玻璃</option><option value="solid" ${settings.appearance.floatingStyle === 'solid' ? 'selected' : ''}>纯色卡片</option><option value="minimal" ${settings.appearance.floatingStyle === 'minimal' ? 'selected' : ''}>轻量极简</option></select></div>
                <div class="stsc-field stsc-range-field"><label>宽度 <span id="stsc_floating_width_value">${Math.round(settings.appearance.floatingWidth)}px</span></label><input id="stsc_floating_width" type="range" min="300" max="680" step="10" value="${Math.round(settings.appearance.floatingWidth)}"></div>
                <div class="stsc-field stsc-range-field"><label>高度 <span id="stsc_floating_height_value">${Math.round(settings.appearance.floatingHeight)}px</span></label><input id="stsc_floating_height" type="range" min="300" max="820" step="10" value="${Math.round(settings.appearance.floatingHeight)}"></div>
            </div>
            <div class="stsc-muted">移动端会自动限制在安全区域内，拖到左右边缘后会收纳一半；悬浮按钮位置会持续保存。</div>
        </div>`);
}


function releaseChangesHtml(info) {
    const changes = Array.isArray(info?.changes) ? info.changes.filter(item => typeof item === 'string' && item.trim()) : [];
    if (!changes.length) return '<div class="stsc-muted">暂无详细更新说明。</div>';
    return `<ul class="stsc-release-change-list">${changes.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
}

function renderUpdatesTab() {
    const hasUpdate = updateCheckState === 'available';
    const remoteVersionLabel = updateAvailableVersion && compareVersions(updateAvailableVersion, STSC_VERSION) > 0
        ? `v${escapeHtml(updateAvailableVersion)}`
        : '远程有新提交';
    let remoteHtml = '';
    if (updateCheckState === 'checking') {
        remoteHtml = '<div class="stsc-update-state"><i class="fa-solid fa-spinner fa-spin"></i> 正在检查远程版本……</div>';
    } else if (updateCheckState === 'updating') {
        remoteHtml = '<div class="stsc-update-state"><i class="fa-solid fa-spinner fa-spin"></i> 正在拉取并安装新版本，请不要关闭页面……</div>';
    } else if (hasUpdate) {
        const remote = latestRemoteReleaseInfo || { version: updateAvailableVersion, changes: [] };
        remoteHtml = `
            <div class="stsc-update-card is-available">
                <div class="stsc-update-card-head">
                    <div><div class="stsc-update-kicker">发现新版本</div><div class="stsc-update-version">${remoteVersionLabel}</div></div>
                    <button class="menu_button stsc-primary-button" type="button" data-action="update-plugin-now" data-dialog-action="update-plugin-now"><i class="fa-solid fa-download"></i> 立即更新</button>
                </div>
                ${remote.title ? `<div class="stsc-release-title">${escapeHtml(remote.title)}</div>` : ''}
                ${releaseChangesHtml(remote)}
                <div class="stsc-muted" style="margin-top:8px">更新完成后页面会自动刷新。更新前请先保存当前未保存的插件设置。</div>
            </div>`;
    } else if (updateCheckState === 'error') {
        const diagnosticHtml = updateCheckDiagnostics.length
            ? `<ul class="stsc-release-change-list">${updateCheckDiagnostics.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
            : '';
        const directButton = installedExtensionGitState === 'non_git'
            ? ''
            : '<button class="menu_button stsc-primary-button" type="button" data-action="update-plugin-direct" data-dialog-action="update-plugin-direct"><i class="fa-solid fa-download"></i> 跳过检查，直接尝试更新</button>';
        remoteHtml = `<div class="stsc-update-card is-error">
            <b>这次没有查到远程版本</b>
            <div style="margin-top:7px">${escapeHtml(updateCheckError || '插件没有从远程网络或酒馆自身接口拿到更新结果。')}</div>
            ${diagnosticHtml}
            <div class="stsc-toolbar" style="margin-top:10px">
                ${directButton}
                <button class="menu_button" type="button" data-action="open-sillytavern-extensions" data-dialog-action="open-sillytavern-extensions"><i class="fa-solid fa-puzzle-piece"></i> 打开酒馆扩展页面</button>
            </div>
        </div>`;
    } else {
        remoteHtml = '<div class="stsc-update-card is-latest"><b>当前已经是最新版本。</b><div class="stsc-muted">插件启动、打开管理器以及后台定时检查时都会自动检测新版本。</div></div>';
    }

    $('#stsc_tab_updates').html(`
        <div class="stsc-section">
            <div class="stsc-section-title">当前版本</div>
            <div class="stsc-current-version-row">
                <div><div class="stsc-update-kicker">已安装</div><div class="stsc-update-version">v${escapeHtml(STSC_RELEASE_INFO.version)}</div></div>
                <button class="menu_button" type="button" data-action="check-plugin-update" data-dialog-action="check-plugin-update"><i class="fa-solid fa-rotate"></i> 立即检查更新</button>
            </div>
            <div class="stsc-release-title">${escapeHtml(STSC_RELEASE_INFO.title)}</div>
            <div class="stsc-muted">发布日期：${escapeHtml(STSC_RELEASE_INFO.releasedAt)}</div>
            ${releaseChangesHtml(STSC_RELEASE_INFO)}
        </div>
        <div class="stsc-section">
            <div class="stsc-section-title">更新状态</div>
            ${remoteHtml}
        </div>
        <div class="stsc-section">
            <div class="stsc-section-title">更新提醒说明</div>
            <div>只有远程版本号高于当前版本时，插件才会显示“插件有更新”提示，并在魔法棒菜单入口标记“更新”。</div>
            <div class="stsc-muted" style="margin-top:6px">没有新版本时不会弹窗。发现更新后可直接在本页面完成更新，更新说明可随时回来查看。</div>
        </div>
    `);
    const versionDialogOpen = !$('#stsc_dialog_overlay').hasClass('stsc-hidden')
        && $('#stsc_dialog_title').text() === '版本更新';
    if (versionDialogOpen) $('#stsc_dialog_body').html($('#stsc_tab_updates').html());
}

function renderHeaderUpdateBadge() {
    const hasUpdate = updateCheckState === 'available' || gitUpdateAvailable || Boolean(updateAvailableVersion && compareVersions(updateAvailableVersion, STSC_VERSION) > 0);
    $('#stsc_version_button').toggleClass('has-notice', hasUpdate);
}

function renderLogBadge() {
    const settings = normalizeSettings();
    const unread = settings?.logs?.some(item => Number(item.timestamp) > settings.logLastViewedAt && ['error', 'warning'].includes(item.level));
    $('#stsc_log_button').toggleClass('has-notice', Boolean(unread));
}

function openVersionDialog() {
    renderUpdatesTab();
    openDialog('版本更新', $('#stsc_tab_updates').html(), '<button class="menu_button" type="button" data-dialog-action="cancel">关闭</button>');
}

function runtimeLogHtml(item) {
    const labels = { error: '失败', warning: '需要留意', info: '正常' };
    return `<article class="stsc-log-item is-${escapeHtml(item.level || 'info')}" data-log-id="${escapeHtml(item.id)}">
        <div class="stsc-log-head"><b>${escapeHtml(labels[item.level] || '记录')}｜${escapeHtml(item.stage || '运行')}</b><time>${new Date(item.timestamp).toLocaleString()}</time></div>
        <div>${escapeHtml(item.message || '')}</div>${item.handling ? `<div class="stsc-muted">处理：${escapeHtml(item.handling)}</div>` : ''}
        <button class="menu_button stsc-small-button" type="button" data-dialog-action="delete-log" data-log-id="${escapeHtml(item.id)}">删除</button>
    </article>`;
}

function openLogDialog() {
    const settings = normalizeSettings();
    settings.logLastViewedAt = Date.now();
    saveSettings();
    renderLogBadge();
    const list = settings.logs.length ? settings.logs.map(runtimeLogHtml).join('') : '<div class="stsc-empty">还没有运行记录。完成一次角色回复或手动检查更新后，这里会显示结果。</div>';
    openDialog('运行日志', `<div class="stsc-log-summary">成功、部分完成和失败都会记录。日志会写明时间、角色卡、运行模式、完成题数、正文与API情况；本地最多保留最近 ${STSC_LOG_LIMIT} 条，且不会记录API密钥。</div><div class="stsc-log-list">${list}</div>`,
        '<button class="menu_button" type="button" data-dialog-action="clear-runtime-cache">清理缓存</button><button class="menu_button" type="button" data-dialog-action="export-logs">导出日志</button><button class="menu_button stsc-danger-button" type="button" data-dialog-action="ask-clear-logs">清除日志</button>');
}

function exportRuntimeLogs() {
    const payload = JSON.stringify({ exportedAt: new Date().toISOString(), version: STSC_VERSION, logs: normalizeSettings().logs }, null, 2);
    const url = URL.createObjectURL(new Blob([payload], { type: 'application/json;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = `墨提斯之镜-运行日志-${new Date().toISOString().slice(0, 10)}.json`; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function renderFloatingInstructionPage() {
    const runtimeSettings = normalizeSettings();
    const instructions = runtimeSettings.temporaryInstructions;
    $('#stsc_floating_title').text('快捷指令');
    $('#stsc_floating_subtitle').text('选择临时一轮或常开');

    if (!instructions.length) {
        $('#stsc_floating_content').html('<div class="stsc-empty">还没有保存快捷指令。请先在完整管理器中创建并保存。</div>');
        return;
    }

    const html = instructions.map(instruction => {
        const mode = instructionActivationMode(instruction.id, runtimeSettings);
        const empty = !String(instruction.content || '').trim();
        const preview = empty ? '内容为空，请先到完整管理器编辑。' : String(instruction.content).trim();
        return `
            <div class="stsc-floating-instruction-card" data-floating-temp-id="${escapeHtml(instruction.id)}">
                <div class="stsc-floating-instruction-head">
                    <div class="stsc-floating-instruction-name">${escapeHtml(instruction.name)}</div>
                    <select class="text_pole stsc-floating-instruction-mode" data-floating-instruction-mode aria-label="${escapeHtml(instruction.name)}的启用方式" ${empty ? 'disabled' : ''}>
                        <option value="off" ${mode === 'off' ? 'selected' : ''}>关闭</option>
                        <option value="once" ${mode === 'once' ? 'selected' : ''}>临时一轮（默认）</option>
                        <option value="always" ${mode === 'always' ? 'selected' : ''}>常开</option>
                    </select>
                </div>
                <div class="stsc-floating-instruction-preview ${empty ? 'is-empty' : ''}">${escapeHtml(preview)}</div>
            </div>`;
    }).join('');
    $('#stsc_floating_content').html(`<div class="stsc-floating-instruction-list">${html}</div>`);
}

function renderFloatingBadge() {
    // 插件关闭期间不显示错误红点，避免历史记录被误认为当前仍在检测。
    if (!getUiSettings()?.enabled) {
        $('#stsc_floating_badge').addClass('stsc-hidden').text('');
        return;
    }

    const latest = getLatestResult();
    const hasUnreadIssue = latestHasUnreadIssue(latest);
    $('#stsc_floating_badge')
        .toggleClass('stsc-hidden', !hasUnreadIssue)
        .text(latest?.status === 'format_error' ? '⚠' : '!');
}

function renderFloatingCheckPage() {
    const latest = getLatestResult();
    $('#stsc_floating_title').text('最新一轮自检');

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
}

function renderFloatingReviewPage() {
    const settings = normalizeSettings();
    const latest = getLatestResult();
    const review = latest?.previousReview || null;
    $('#stsc_floating_title').text('复盘线索');
    if (settings.mode !== 'dual_api' || !settings.dualApi.previousReview) {
        $('#stsc_floating_subtitle').text('当前未启用');
        $('#stsc_floating_content').html('<div class="stsc-empty"><b>上一轮复盘未开启</b><br><br>前往“插件设置 → 双API增强”开启。复盘仅在双API模式下运行。</div>');
        return;
    }
    if (!review) {
        if (latest && latest.mode !== 'dual_api') {
            $('#stsc_floating_subtitle').text('上一轮未完成双API');
            $('#stsc_floating_content').html('<div class="stsc-empty">上一轮实际使用了单API，通常是独立自检API失败后自动回退，因此没有生成复盘。请查看运行日志中的“自检API”记录。</div>');
        } else {
            $('#stsc_floating_subtitle').text('已记录首轮，等待下一轮复盘');
            $('#stsc_floating_content').html('<div class="stsc-empty">当前已有一轮可作为复盘来源。请再完成一轮双API正文生成；下一轮自检会先复盘本轮，再进行新的自检。</div>');
        }
        return;
    }
    if (review.status === 'missing') {
        $('#stsc_floating_subtitle').text('本轮复盘未按格式返回');
        $('#stsc_floating_content').html(`<div class="stsc-empty"><b>本轮自检与正文已正常完成</b><br><br>${escapeHtml(review.reason || '自检API没有返回可识别的复盘标签。')}<br><br>插件会在下一轮继续尝试；详情可在运行日志中查看。</div>`);
        return;
    }
    $('#stsc_floating_subtitle').text(new Date(review.timestamp).toLocaleString());
    if (review.status === 'ok' || !review.issues?.length) {
        $('#stsc_floating_content').html('<div class="stsc-empty stsc-review-ok"><b>✓ 上一轮未发现明显问题</b></div>');
        return;
    }
    const cards = review.issues.map(issue => `<article class="stsc-review-card">
        <div class="stsc-review-type">${escapeHtml(issue.type || '疑似问题')}</div>
        <div class="stsc-review-description">${escapeHtml(issue.description || '')}</div>
        ${issue.evidence ? `<div class="stsc-review-detail"><b>依据：</b>${escapeHtml(issue.evidence)}</div>` : ''}
        ${issue.suggestion ? `<div class="stsc-review-detail"><b>修复建议：</b>${escapeHtml(issue.suggestion)}</div>` : ''}
        <label class="checkbox_label stsc-review-select"><input type="checkbox" data-review-issue-id="${escapeHtml(issue.id)}" ${issue.selected ? 'checked' : ''}> 下轮修复</label>
    </article>`).join('');
    $('#stsc_floating_content').html(`<div class="stsc-muted stsc-review-note">复盘是AI判断的疑似问题。只有你勾选的线索才会影响下一轮，且只执行一次。</div><div class="stsc-review-list">${cards}</div>`);
}

function renderFloating() {
    const settings = getUiSettings();
    const $root = $('#stsc_floating_root');
    if (!$root.length) return;
    applyTheme(settings);
    applyFloatingAppearance(settings);
    applyFloatingPosition(settings);

    const enabled = Boolean(settings.appearance?.floatingEnabled);
    $root.toggleClass('stsc-hidden', !enabled).attr('aria-hidden', enabled ? 'false' : 'true');
    if (!enabled) {
        const panel = document.getElementById('stsc_floating_panel');
        panel?.style?.removeProperty('display');
        $('#stsc_floating_panel').addClass('stsc-hidden').attr('aria-hidden', 'true');
        return;
    }

    renderFloatingBadge();
    removeLegacyMessageBadges();
    $('#stsc_floating_panel [data-floating-page]').removeClass('active').attr('aria-selected', 'false');
    $(`#stsc_floating_panel [data-floating-page="${floatingPanelPage}"]`).addClass('active').attr('aria-selected', 'true');

    if (floatingPanelPage === 'instructions') {
        renderFloatingInstructionPage();
    } else if (floatingPanelPage === 'review') {
        renderFloatingReviewPage();
    } else {
        renderFloatingCheckPage();
    }

    $('#stsc_floating_open_manager').text(floatingPanelPage === 'instructions' ? '打开指令管理器' : floatingPanelPage === 'review' ? '打开插件设置' : '打开完整管理器');
    const panelOpen = !$('#stsc_floating_panel').hasClass('stsc-hidden');
    if (panelOpen) requestAnimationFrame(layoutFloatingPanel);
    if (panelOpen && floatingPanelPage === 'check') void markLatestIssueViewed();
}

function renderAll() {
    if (!initialized) return;
    removeLegacyMessageBadges();
    renderCompact();
    renderManagerSubtitle();
    renderStatusTab();
    renderPresetsTab();
    renderReferencesTab();
    renderTemporaryTab();
    renderSettingsTab();
    renderAppearanceTab();
    renderUpdatesTab();
    renderHeaderUpdateBadge();
    renderLogBadge();
    renderFloating();
    applyTheme(getUiSettings());
    updateSaveState();
}

function openManager(tab = null) {
    void checkForPluginUpdate({ force: true });
    if (!editDraft) beginEditSession();
    const settings = getUiSettings();
    if (tab) settings.ui.activeTab = tab;
    $('#stsc_manager_overlay').removeClass('stsc-hidden').attr('aria-hidden', 'false');
    $('body').addClass('stsc-modal-open');
    performSwitchTab(settings.ui.activeTab || 'status');
    renderAll();
    if ((settings.ui.activeTab || 'status') === 'status') void markLatestIssueViewed();
}

function performCloseManager() {
    closeDialog();
    expandedReferenceIds.clear();
    expandedQuestionIds.clear();
    expandedInstructionIds.clear();
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
    pendingDeleteRequest = null;
    $('#stsc_dialog_overlay').addClass('stsc-hidden').attr('aria-hidden', 'true');
    $('#stsc_dialog_title, #stsc_dialog_body, #stsc_dialog_footer').empty();
    if (hadPendingUnsavedAction && initialized) renderAll();
}

function openDeleteConfirmation({ title = '确认删除', message = '确定要删除吗？', detail = '', perform }) {
    pendingDeleteRequest = typeof perform === 'function' ? perform : null;
    const detailHtml = detail
        ? `<div class="stsc-delete-preview">${escapeHtml(detail)}</div>`
        : '';
    openDialog(
        title,
        `<div class="stsc-delete-warning"><b>${escapeHtml(message)}</b><div class="stsc-muted" style="margin-top:7px">删除后仍需点击“保存更改”才会正式保存；在保存前也可以放弃本次修改。</div>${detailHtml}</div>`,
        '<button class="menu_button" type="button" data-dialog-action="cancel">取消</button>' +
        '<button class="menu_button stsc-danger-button" type="button" data-dialog-action="confirm-delete">确认删除</button>'
    );
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
        if (tab === 'status') void markLatestIssueViewed();
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

function referenceNameExists(name, excludeId = '') {
    const normalized = normalizePresetName(name);
    return Boolean(normalized && getUiSettings().references.some(reference => reference.id !== excludeId && normalizePresetName(reference.name) === normalized));
}

function makeUniqueReferenceName(baseName) {
    const base = String(baseName || '新参考资料').trim() || '新参考资料';
    if (!referenceNameExists(base)) return base;
    let index = 2;
    while (referenceNameExists(`${base} ${index}`)) index += 1;
    return `${base} ${index}`;
}

function referenceTypeLabel(type) {
    return referenceTypeConfig(type).label;
}

function referencePositionHint(reference) {
    const config = referenceTypeConfig(reference.type);
    if (reference.type === 'style') return '文风默认放在主提示词内，作为持续写作风格使用。';
    if (reference.type === 'restriction') return '限制默认以 System 身份插入聊天深度 0，尽量靠近本轮生成位置以加强注意。';
    return `其他资料默认使用“${positionLabel(config.position)}”，可按需要手动调整。`;
}

function presetKindText(kind) {
    return kind === 'character' ? '角色预设' : '通用预设';
}

function sanitizeExportFileName(name) {
    const cleaned = String(name || '自检预设')
        .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 80);
    return cleaned || '自检预设';
}

function makePresetExportPayload(preset) {
    return {
        format: STSC_PRESET_EXPORT_FORMAT,
        formatVersion: STSC_PRESET_EXPORT_VERSION,
        pluginVersion: STSC_VERSION,
        exportedAt: new Date().toISOString(),
        preset: {
            name: preset.name,
            kind: preset.kind,
            enabled: Boolean(preset.enabled),
            questions: preset.questions.map(question => ({
                text: question.text,
                type: question.type,
                length: question.length,
                requireEvidence: Boolean(question.requireEvidence),
                enabled: Boolean(question.enabled),
            })),
        },
    };
}

function downloadPresetFile(preset) {
    if (!preset) {
        toastr.warning('当前没有可以导出的自检预设。', '墨提斯之镜');
        return;
    }

    const payload = makePresetExportPayload(preset);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${sanitizeExportFileName(preset.name)}.stsc-preset.json`;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toastr.success(`已导出“${preset.name}”。`, '墨提斯之镜');
}

function isPlainObject(value) {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function validateImportedPresetPayload(payload) {
    if (!isPlainObject(payload)) throw new Error('文件内容不是有效的预设对象。');
    if (payload.format !== STSC_PRESET_EXPORT_FORMAT) throw new Error('文件不是由墨提斯之镜 插件导出的预设。');
    if (payload.formatVersion !== STSC_PRESET_EXPORT_VERSION) throw new Error('该预设文件版本暂不受支持。');
    if (!isPlainObject(payload.preset)) throw new Error('文件中缺少自检预设内容。');

    const preset = payload.preset;
    const name = typeof preset.name === 'string' ? preset.name.trim() : '';
    if (!name || name.length > 80) throw new Error('预设名称为空或长度异常。');
    if (!['general', 'character'].includes(preset.kind)) throw new Error('预设类型不正确。');
    if (typeof preset.enabled !== 'boolean') throw new Error('预设启用状态格式不正确。');
    if (!Array.isArray(preset.questions) || preset.questions.length > 500) throw new Error('问题列表缺失或数量异常。');

    const questions = preset.questions.map((question, index) => {
        if (!isPlainObject(question)) throw new Error(`第 ${index + 1} 个问题格式不正确。`);
        const text = typeof question.text === 'string' ? question.text.trim() : '';
        if (!text || text.length > 10000) throw new Error(`第 ${index + 1} 个问题内容为空或长度异常。`);
        if (!['open', 'boolean'].includes(question.type)) throw new Error(`第 ${index + 1} 个问题类型不正确。`);
        if (!['brief', 'standard', 'detailed'].includes(question.length)) throw new Error(`第 ${index + 1} 个问题回答程度不正确。`);
        if (typeof question.requireEvidence !== 'boolean') throw new Error(`第 ${index + 1} 个问题的依据选项格式不正确。`);
        if (typeof question.enabled !== 'boolean') throw new Error(`第 ${index + 1} 个问题的启用状态格式不正确。`);
        return {
            text,
            type: question.type,
            length: question.length,
            requireEvidence: question.requireEvidence,
            enabled: question.enabled,
        };
    });

    return {
        name,
        kind: preset.kind,
        enabled: preset.enabled,
        questions,
    };
}

async function importPresetFile(file) {
    if (!file) return;
    if (file.size > STSC_PRESET_IMPORT_MAX_BYTES) {
        toastr.error('格式不匹配：文件过大，无法作为自检预设导入。', '墨提斯之镜');
        return;
    }

    try {
        const text = await file.text();
        let payload;
        try {
            payload = JSON.parse(text.replace(/^\uFEFF/, ''));
        } catch {
            throw new Error('文件不是有效的 JSON 预设文件。');
        }

        const imported = validateImportedPresetPayload(payload);
        const settings = getUiSettings();
        const preset = createPreset(makeUniquePresetName(imported.name), imported.kind);
        preset.enabled = imported.enabled;
        preset.questions = imported.questions.map(question => ({
            id: uid('q'),
            ...question,
        }));
        // 分享文件不携带任何人的角色卡绑定；角色预设导入后需要用户自行绑定。
        preset.boundCharacterKey = '';
        preset.boundCharacterName = '';

        settings.presets.push(preset);
        settings.ui.presetSection = preset.kind;
        if (preset.kind === 'character') settings.ui.editingCharacterPresetId = preset.id;
        else settings.ui.editingGeneralPresetId = preset.id;

        markDirty();
        renderAll();
        const renameNote = preset.name === imported.name ? '' : `；因名称重复，已改名为“${preset.name}”`;
        const bindingNote = preset.kind === 'character' ? '；角色绑定不会随文件导入，请手动绑定当前角色' : '';
        toastr.success(`已导入${presetKindText(preset.kind)}“${preset.name}”，共 ${preset.questions.length} 个问题${renameNote}${bindingNote}。请点击“保存更改”正式保存。`, '墨提斯之镜');
    } catch (error) {
        console.warn('[STSC] 导入自检预设失败：', error);
        toastr.error(`格式不匹配，文件错误或不是本插件导出的自检预设。${error?.message ? ` ${error.message}` : ''}`, '墨提斯之镜', { timeOut: 7000 });
    }
}


function makeReferenceExportPayload(reference) {
    return {
        format: STSC_REFERENCE_EXPORT_FORMAT,
        formatVersion: STSC_REFERENCE_EXPORT_VERSION,
        pluginVersion: STSC_VERSION,
        exportedAt: new Date().toISOString(),
        reference: {
            name: reference.name,
            type: reference.type,
            content: reference.content,
            enabled: Boolean(reference.enabled),
            scope: reference.scope,
            position: reference.position,
            depth: reference.depth,
            role: reference.role,
            addToCheck: Boolean(reference.addToCheck),
            autoQuestion: reference.autoQuestion,
        },
    };
}

function downloadReferenceFile(reference) {
    if (!reference) {
        toastr.warning('没有找到可以导出的参考资料库。', '墨提斯之镜');
        return;
    }

    const payload = makeReferenceExportPayload(reference);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${sanitizeExportFileName(reference.name)}.stsc-reference.json`;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toastr.success(`已导出资料库“${reference.name}”。`, '墨提斯之镜');
}


function makeReferenceBundleExportPayload(references) {
    return {
        format: STSC_REFERENCE_BUNDLE_EXPORT_FORMAT,
        formatVersion: STSC_REFERENCE_BUNDLE_EXPORT_VERSION,
        pluginVersion: STSC_VERSION,
        exportedAt: new Date().toISOString(),
        references: references.map(reference => makeReferenceExportPayload(reference).reference),
    };
}

function downloadReferenceBundleFile(references) {
    const selected = Array.isArray(references) ? references.filter(Boolean) : [];
    if (!selected.length) {
        toastr.warning('请至少选择一个要导出的资料库。', '墨提斯之镜');
        return false;
    }
    const payload = makeReferenceBundleExportPayload(selected);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const date = new Date().toISOString().slice(0, 10);
    anchor.href = url;
    anchor.download = `墨提斯之镜-资料库合集-${date}.stsc-references.json`;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toastr.success(`已将 ${selected.length} 个资料库批量导出为一个合集文件。`, '墨提斯之镜');
    return true;
}

function openBatchReferenceExportDialog() {
    const references = getUiSettings().references;
    if (!references.length) {
        toastr.warning('当前没有可以导出的参考资料库。', '墨提斯之镜');
        return;
    }
    const items = references.map(reference => `
        <label class="stsc-batch-reference-item">
            <input type="checkbox" data-batch-reference-id="${escapeHtml(reference.id)}" checked>
            <span class="stsc-batch-reference-main"><b>${escapeHtml(reference.name)}</b><span>${escapeHtml(referenceTypeLabel(reference.type))}｜${reference.enabled ? '已启用' : '未启用'}｜${reference.scope === 'character' ? '角色专属' : '通用'}</span></span>
        </label>`).join('');
    openDialog(
        '批量导出资料库',
        `<div class="stsc-muted">勾选要一起分享的资料库。所有选中内容会被打包为一个文件，接收者导入一次即可全部加入。</div>
         <div class="stsc-batch-reference-tools">
            <button class="menu_button stsc-small-button" type="button" data-dialog-action="batch-reference-select-all">全选</button>
            <button class="menu_button stsc-small-button" type="button" data-dialog-action="batch-reference-select-none">清空</button>
            <span id="stsc_batch_reference_count" class="stsc-muted">已选择 ${references.length} 个</span>
         </div>
         <div class="stsc-batch-reference-list">${items}</div>`,
        '<button class="menu_button" type="button" data-dialog-action="cancel">取消</button>' +
        '<button class="menu_button stsc-primary-button" type="button" data-dialog-action="confirm-batch-reference-export">导出所选资料库</button>'
    );
}

function validateImportedReferenceRecord(reference) {
    if (!isPlainObject(reference)) throw new Error('资料库条目不是有效对象。');
    const name = typeof reference.name === 'string' ? reference.name.trim() : '';
    if (!name || name.length > 80) throw new Error('资料库名称为空或长度异常。');
    if (!Object.hasOwn(REFERENCE_TYPE_CONFIG, reference.type)) throw new Error(`资料库“${name}”的资料类型不正确。`);
    if (typeof reference.content !== 'string' || reference.content.length > 2_000_000) throw new Error(`资料库“${name}”的内容缺失或长度异常。`);
    if (typeof reference.enabled !== 'boolean') throw new Error(`资料库“${name}”的启用状态格式不正确。`);
    if (!['global', 'character'].includes(reference.scope)) throw new Error(`资料库“${name}”的生效范围不正确。`);
    if (!['before', 'prompt', 'chat'].includes(reference.position)) throw new Error(`资料库“${name}”的注入位置不正确。`);
    if (!Number.isInteger(reference.depth) || reference.depth < 0 || reference.depth > 20) throw new Error(`资料库“${name}”的注入深度不正确。`);
    if (!['system', 'user', 'assistant'].includes(reference.role)) throw new Error(`资料库“${name}”的注入角色不正确。`);
    if (typeof reference.addToCheck !== 'boolean') throw new Error(`资料库“${name}”的自动问题状态格式不正确。`);
    if (typeof reference.autoQuestion !== 'string' || reference.autoQuestion.length > 10000) throw new Error(`资料库“${name}”的自动问题格式不正确。`);
    return {
        name,
        type: reference.type,
        content: reference.content,
        scope: reference.scope,
        position: reference.position,
        depth: reference.depth,
        role: reference.role,
        addToCheck: reference.addToCheck,
        autoQuestion: reference.autoQuestion,
    };
}

function validateImportedReferencePayload(payload) {
    if (!isPlainObject(payload)) throw new Error('文件内容不是有效的资料库对象。');

    if (payload.format === STSC_REFERENCE_EXPORT_FORMAT) {
        if (payload.formatVersion !== STSC_REFERENCE_EXPORT_VERSION) throw new Error('该资料库文件版本暂不受支持。');
        if (!isPlainObject(payload.reference)) throw new Error('文件中缺少参考资料库内容。');
        return { isBundle: false, references: [validateImportedReferenceRecord(payload.reference)] };
    }

    if (payload.format === STSC_REFERENCE_BUNDLE_EXPORT_FORMAT) {
        if (payload.formatVersion !== STSC_REFERENCE_BUNDLE_EXPORT_VERSION) throw new Error('该资料库合集文件版本暂不受支持。');
        if (!Array.isArray(payload.references) || !payload.references.length) throw new Error('资料库合集为空。');
        if (payload.references.length > 500) throw new Error('资料库合集条目过多。');
        return { isBundle: true, references: payload.references.map(validateImportedReferenceRecord) };
    }

    throw new Error('文件不是由墨提斯之镜 插件导出的资料库或资料库合集。');
}

async function importReferenceFile(file) {
    if (!file) return;
    if (file.size > STSC_REFERENCE_IMPORT_MAX_BYTES) {
        toastr.error('格式不匹配：文件过大，无法作为参考资料库或资料库合集导入。', '墨提斯之镜');
        return;
    }

    try {
        const text = await file.text();
        let payload;
        try {
            payload = JSON.parse(text.replace(/^\uFEFF/, ''));
        } catch {
            throw new Error('文件不是有效的 JSON 资料库文件。');
        }

        const importedPayload = validateImportedReferencePayload(payload);
        const settings = getUiSettings();
        const created = [];
        const renamed = [];
        let containsCharacterScope = false;

        for (const imported of importedPayload.references) {
            const uniqueName = makeUniqueReferenceName(imported.name);
            const reference = createReference(uniqueName, imported.type);
            reference.content = imported.content;
            reference.scope = imported.scope;
            reference.position = imported.position;
            reference.depth = imported.depth;
            reference.role = imported.role;
            reference.autoQuestion = imported.autoQuestion || reference.autoQuestion;
            // 分享文件不得自动注入到接收者的角色扮演中；导入后必须由用户检查并手动启用。
            reference.enabled = false;
            reference.addToCheck = false;
            reference.characterKey = '';
            settings.references.push(reference);
            created.push(reference);
            if (!importedPayload.isBundle) expandedReferenceIds.add(reference.id);
            if (uniqueName !== imported.name) renamed.push(`${imported.name} → ${uniqueName}`);
            if (imported.scope === 'character') containsCharacterScope = true;
        }

        markDirty();
        renderAll();

        const modeText = importedPayload.isBundle ? `已从资料库合集导入 ${created.length} 个资料库` : `已导入资料库“${created[0]?.name || ''}”`;
        const renameNote = renamed.length ? `；${renamed.length} 个重名条目已自动改名` : '';
        const bindingNote = containsCharacterScope ? '；角色专属绑定不会随文件导入，请手动绑定当前角色' : '';
        toastr.success(`${modeText}${renameNote}${bindingNote}。为了安全，所有导入资料库均保持关闭，请检查后手动启用并保存。`, '墨提斯之镜', { timeOut: 8000 });
    } catch (error) {
        console.warn('[STSC] 导入参考资料库失败：', error);
        toastr.error(`格式不匹配，文件错误或不是本插件导出的参考资料库。${error?.message ? ` ${error.message}` : ''}`, '墨提斯之镜', { timeOut: 7000 });
    }
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

function openCreateReferenceDialog() {
    openDialog(
        '新建参考资料库',
        `<div class="stsc-field">
            <label>资料库名称</label>
            <input id="stsc_new_reference_name" class="text_pole" type="text" maxlength="80" placeholder="请输入不重复的资料库名称">
        </div>
        <div class="stsc-field" style="margin-top:10px">
            <label>资料类型</label>
            <select id="stsc_new_reference_type" class="text_pole">
                <option value="style">文风</option>
                <option value="restriction">限制</option>
                <option value="other">其他</option>
            </select>
        </div>
        <div class="stsc-reference-type-help">
            <div><strong>文风：</strong>自动放在主提示词内，并生成“是否遵照该文风、如何体现”的自检问题。</div>
            <div><strong>限制：</strong>自动以 System 身份插入聊天深度 0，靠近本轮生成位置，并生成强制限制检查问题。</div>
            <div><strong>其他：</strong>使用通用推荐位置与通用检查问题，之后仍可手动调整。</div>
        </div>
        <div id="stsc_new_reference_error" class="stsc-dialog-error"></div>`,
        `<button class="menu_button" type="button" data-dialog-action="cancel">取消</button>
         <button class="menu_button stsc-primary-button" type="button" data-dialog-action="create-reference">确认创建</button>`
    );
    setTimeout(() => $('#stsc_new_reference_name').trigger('focus'), 0);
}

function looksLikeQuestion(text) {
    const value = String(text || '').trim();
    if (!value) return false;
    if (/[？?]\s*$/.test(value)) return true;
    return /^(是否|有无|能否|可否|当前|本轮|此时|角色|两人|他们|应该|应当|如何|为何|为什么|什么|哪|哪些|怎样|怎么|请(?:说明|判断|分析|确认|回答|概括|检查)|根据.+(?:如何|是否|应该))/u.test(value);
}

function splitBulkQuestions(raw) {
    const text = String(raw || '').replace(/\r\n?/g, '\n').trim();
    if (!text) return [];

    const output = text
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean)
        .map(line => line.replace(/^\s*(?:[-*•·]+|(?:\d+|[一二三四五六七八九十百]+)[\.、：:)）-])\s*/u, '').trim())
        .filter(Boolean);

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
            <textarea id="stsc_bulk_raw" class="text_pole stsc-bulk-raw" placeholder="每行填写一道问题。即使同一行有多个问号，也只会识别为一道问题。">${escapeHtml(bulkDraft.raw)}</textarea>
        </div>
        <div class="stsc-toolbar" style="margin-top:9px">
            <button class="menu_button" type="button" data-dialog-action="recognize-bulk">开始识别 / 重新识别</button>
            <button class="menu_button" type="button" data-dialog-action="add-bulk-item">＋ 手动补一条</button>
        </div>
        <div class="stsc-muted" style="margin-top:9px">仅按换行识别：每个非空行视为一道完整问题，不会按问号拆分。识别结果只是临时草稿，可先修改或删除，确认后才会加入当前预设。</div>
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
        toastr.warning('当前没有生效的问题可以测试。', '墨提斯之镜');
        return;
    }

    testBusy = true;
    const loader = context.loader?.show?.({
        message: '正在测试自检预设…',
        title: '墨提斯之镜',
        toastMode: 'stoppable',
    });

    try {
        clearRuntimePrompts();
        applyReferencePrompts(references);
        const questionText = questions.map((q, i) => `${i + 1}. [${q.type === 'boolean' ? '判断题' : '开放问答'}｜${q.length}｜${q.requireEvidence ? '需要依据' : '无需强制依据'}] ${q.text}`).join('\n');
        const prompt = `
这是墨提斯之镜 插件的“测试预设”功能。请读取当前角色设定、聊天上文、已注入的参考资料以及下面全部问题。

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
        toastr.success('测试完成，没有生成正文。', '墨提斯之镜');
        switchTab('presets');
        renderAll();
    } catch (error) {
        internalQuietActive = false;
        console.error('[STSC] 测试预设失败：', error);
        toastr.error('测试调用失败，请检查当前API连接。', '墨提斯之镜');
    } finally {
        clearRuntimePrompts();
        testBusy = false;
        await loader?.hide?.();
    }
}

function bindUiEvents() {
    $('#stsc_close_manager').on('click', closeManager);
    $('#stsc_version_button').on('click', openVersionDialog);
    $('#stsc_log_button').on('click', openLogDialog);
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
        openManager(floatingPanelPage === 'instructions' ? 'temporary' : floatingPanelPage === 'review' ? 'settings' : 'status');
    });
    $('#stsc_floating_panel').on('click', '[data-floating-page]', function (event) {
        event.preventDefault();
        const requestedPage = String($(this).data('floating-page') || 'check');
        const nextPage = ['check', 'instructions', 'review'].includes(requestedPage) ? requestedPage : 'check';
        if (floatingPanelPage === nextPage) return;
        floatingPanelPage = nextPage;
        renderFloating();
        if (floatingPanelPage === 'check' && !$('#stsc_floating_panel').hasClass('stsc-hidden')) void markLatestIssueViewed();
    });
    $('#stsc_floating_panel').on('change', '[data-floating-instruction-mode]', function () {
        const id = $(this).closest('[data-floating-temp-id]').data('floating-temp-id');
        const previous = instructionActivationMode(id, normalizeSettings());
        if (!setInstructionActivation(id, this.value)) this.value = previous;
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
            toastr.warning('预设名称不能为空。', '墨提斯之镜');
            renderPresetsTab();
            return;
        }
        if (presetNameExists(nextName, preset.id)) {
            toastr.warning('已经存在同名预设，请换一个名称。', '墨提斯之镜');
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
        if (field === 'enabled') card.find('.stsc-summary-enable span').text(question.enabled ? '已启用' : '未启用');
        if (field === 'text') card.find('.stsc-question-summary-text span').text(String(question.text || '').trim() || '未填写问题内容');
        markDirty();
        renderCompact();
        renderManagerSubtitle();
    });

    $('#stsc_manager_overlay').on('input change', '[data-reference-field]', function (event) {
        const $card = $(this).closest('[data-reference-id]');
        const id = $card.data('reference-id');
        const reference = getUiSettings().references.find(x => x.id === id);
        if (!reference) return;
        const field = $(this).data('reference-field');

        if (field === 'name') {
            const nextName = String(this.value || '').trim();
            const $error = $card.find('[data-reference-name-error]');
            if (!nextName) {
                $error.text('资料库名称不能为空。');
                if (event.type === 'change') {
                    this.value = reference.name;
                    $error.empty();
                    toastr.warning('资料库名称不能为空。', '墨提斯之镜');
                }
                return;
            }
            if (referenceNameExists(nextName, reference.id)) {
                $error.text('已经存在同名资料库，请换一个名称。');
                if (event.type === 'change') {
                    this.value = reference.name;
                    $error.empty();
                    toastr.warning('已经存在同名资料库，请换一个名称。', '墨提斯之镜');
                }
                return;
            }
            $error.empty();
            reference.name = nextName;
            $card.find('.stsc-reference-summary-name').text(nextName);
            markDirty();
            renderCompact();
            renderManagerSubtitle();
            return;
        }

        if (field === 'enabled') {
            reference.enabled = this.checked;
            markDirty();
            renderReferencesTab();
            renderCompact();
            renderManagerSubtitle();
            return;
        }

        if (field === 'type') {
            applyReferenceTypeDefaults(reference, this.value);
            markDirty();
            renderReferencesTab();
            renderCompact();
            renderManagerSubtitle();
            toastr.info(`已切换为“${referenceTypeLabel(reference.type)}”，并应用推荐注入位置。`, '墨提斯之镜');
            return;
        }

        if (field === 'addToCheck') {
            if (!reference.enabled) {
                reference.addToCheck = false;
                this.checked = false;
                toastr.warning('请先启用这个资料库，才能启用对应的自检问题。', '墨提斯之镜');
                return;
            }
            reference.addToCheck = this.checked;
        } else {
            reference[field] = this.type === 'checkbox' ? this.checked : this.value;
        }

        if (field === 'depth') reference.depth = clampNumber(reference.depth, 0, 20, 0);
        markDirty();
        renderCompact();
        renderManagerSubtitle();
    });

    $('#stsc_manager_overlay').on('input change', '[data-temp-field]', function () {
        const $card = $(this).closest('[data-temp-id]');
        const id = $card.data('temp-id');
        const instruction = getUiSettings().temporaryInstructions.find(x => x.id === id);
        if (!instruction) return;
        const field = $(this).data('temp-field');
        instruction[field] = this.value;
        if (field === 'name') $card.find('.stsc-temp-summary-text b').text(instruction.name || '未命名快捷指令');
        if (field === 'content') $card.find('.stsc-temp-summary-text span').text(String(instruction.content || '').trim() || '尚未填写指令内容');
        markDirty();
    });

    $('#stsc_manager_overlay').on('change', '#stsc_setting_enabled', function () {
        getUiSettings().enabled = this.checked;
        markDirty();
        renderAll();
    });
    $('#stsc_manager_overlay').on('change', '#stsc_setting_mode', function () {
        getUiSettings().mode = ['single', 'dual_api'].includes(this.value) ? this.value : 'single';
        markDirty();
        renderAll();
    });
    $('#stsc_manager_overlay').on('input change', '#stsc_dual_endpoint', function (event) {
        const dual = getUiSettings().dualApi;
        dual.endpoint = this.value;
        if (event.type === 'change') {
            const normalized = normalizeDualApiBaseUrl(this.value);
            if (normalized) {
                dual.endpoint = normalized;
                this.value = normalized;
            }
        }
        markDirty();
        resetDualApiModelState();
        if (normalizeDualApiBaseUrl(dual.endpoint)) scheduleDualApiModelFetch(event.type === 'change' ? 0 : 800);
    });
    $('#stsc_manager_overlay').on('change', '#stsc_dual_model', function () {
        if (!dualApiModels.includes(this.value)) return;
        getUiSettings().dualApi.model = this.value;
        markDirty();
    });
    $('#stsc_manager_overlay').on('input change', '#stsc_dual_api_key', function (event) {
        getUiSettings().dualApi.apiKey = this.value;
        markDirty();
        resetDualApiModelState();
        if (normalizeDualApiBaseUrl(getUiSettings().dualApi.endpoint)) {
            scheduleDualApiModelFetch(event.type === 'change' ? 0 : 800);
        }
    });
    $('#stsc_manager_overlay').on('click', '#stsc_refresh_models', function () {
        scheduleDualApiModelFetch(0, { force: true, showToast: true });
    });
    $('#stsc_manager_overlay').on('click', '#stsc_toggle_api_key', function () {
        const input = document.getElementById('stsc_dual_api_key');
        if (!input) return;
        const showing = input.type === 'text';
        input.type = showing ? 'password' : 'text';
        $(this).text(showing ? '显示' : '隐藏');
    });
    $('#stsc_manager_overlay').on('change', '#stsc_dual_max_tokens', function () {
        getUiSettings().dualApi.maxTokens = clampNumber(this.value, 256, 12000, 4096);
        this.value = Math.round(getUiSettings().dualApi.maxTokens);
        markDirty();
    });
    $('#stsc_manager_overlay').on('change', '#stsc_dual_timeout_seconds', function () {
        getUiSettings().dualApi.timeoutSeconds = clampNumber(this.value, 60, 300, 150);
        this.value = Math.round(getUiSettings().dualApi.timeoutSeconds);
        markDirty();
    });
    $('#stsc_manager_overlay').on('change', '#stsc_dual_retry_transient', function () {
        getUiSettings().dualApi.retryTransient = this.checked;
        markDirty();
    });
    $('#stsc_manager_overlay').on('change', '#stsc_dual_context_mode', function () {
        getUiSettings().dualApi.contextMode = ['recent5', 'custom', 'all'].includes(this.value) ? this.value : 'recent5';
        markDirty();
        renderSettingsTab();
        updateSaveState();
    });
    $('#stsc_manager_overlay').on('change', '#stsc_dual_custom_turns', function () {
        getUiSettings().dualApi.customTurns = clampNumber(this.value, 1, 100, 5);
        this.value = Math.round(getUiSettings().dualApi.customTurns);
        markDirty();
    });
    $('#stsc_manager_overlay').on('change', '#stsc_dual_transform_format', function () {
        getUiSettings().dualApi.transformFormat = this.checked;
        markDirty();
        renderSettingsTab();
        updateSaveState();
    });
    $('#stsc_floating_panel').on('change', '[data-review-issue-id]', async function () {
        const latest = getLatestResult();
        const issue = latest?.previousReview?.issues?.find(item => item.id === String($(this).data('review-issue-id') || ''));
        if (!issue) return;
        issue.selected = this.checked;
        await saveLatestResult(latest);
        renderFloatingReviewPage();
    });
    $('#stsc_manager_overlay').on('change', '#stsc_previous_review', function () {
        getUiSettings().dualApi.previousReview = this.checked;
        markDirty();
        renderSettingsTab();
        updateSaveState();
    });
    $('#stsc_manager_overlay').on('change', '#stsc_dual_failure_mode', function () {
        getUiSettings().dualApi.failureMode = ['fallback_single', 'stop'].includes(this.value) ? this.value : 'fallback_single';
        markDirty();
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

    $('#stsc_manager_overlay').on('change', '#stsc_floating_style', function () {
        getUiSettings().appearance.floatingStyle = this.value;
        markDirty();
        applyFloatingAppearance(getUiSettings());
        layoutFloatingPanel();
    });
    $('#stsc_manager_overlay').on('input change', '#stsc_floating_opacity', function () {
        getUiSettings().appearance.floatingOpacity = clampNumber(Number(this.value) / 100, 0.1, 1, 0.94);
        $('#stsc_floating_opacity_value').text(`${Math.round(getUiSettings().appearance.floatingOpacity * 100)}%`);
        markDirty();
        applyFloatingAppearance(getUiSettings());
    });
    $('#stsc_manager_overlay').on('input change', '#stsc_floating_button_size', function () {
        getUiSettings().appearance.floatingButtonSize = clampNumber(this.value, 34, 50, 50);
        $('#stsc_floating_button_size_value').text(`${Math.round(getUiSettings().appearance.floatingButtonSize)}px`);
        markDirty();
        applyFloatingAppearance(getUiSettings());
        applyFloatingPosition(getUiSettings());
        if (!$('#stsc_floating_panel').hasClass('stsc-hidden')) layoutFloatingPanel();
    });
    $('#stsc_manager_overlay').on('input change', '#stsc_floating_width', function () {
        getUiSettings().appearance.floatingWidth = clampNumber(this.value, 300, 680, 420);
        $('#stsc_floating_width_value').text(`${Math.round(getUiSettings().appearance.floatingWidth)}px`);
        markDirty();
        applyFloatingAppearance(getUiSettings());
        layoutFloatingPanel();
    });
    $('#stsc_manager_overlay').on('input change', '#stsc_floating_height', function () {
        getUiSettings().appearance.floatingHeight = clampNumber(this.value, 300, 820, 640);
        $('#stsc_floating_height_value').text(`${Math.round(getUiSettings().appearance.floatingHeight)}px`);
        markDirty();
        applyFloatingAppearance(getUiSettings());
        layoutFloatingPanel();
    });

    $('#stsc_manager_overlay').on('click', '[data-action]', async function () {
        const action = $(this).data('action');
        const settings = getUiSettings();
        const preset = getEditingPreset(null, settings);

        if (action === 'import-dev-settings' || action === 'restore-dev-migration') {
            openDevMigrationDialog(action === 'restore-dev-migration');
            return;
        } else if (action === 'open-create-preset') {
            openCreatePresetDialog($(this).data('kind'));
            return;
        } else if (action === 'open-create-reference') {
            openCreateReferenceDialog();
            return;
        } else if (action === 'batch-export-references') {
            openBatchReferenceExportDialog();
            return;
        } else if (action === 'check-plugin-update') {
            await checkForPluginUpdate({ force: true, userInitiated: true });
            renderUpdatesTab();
            return;
        } else if (action === 'update-plugin-now') {
            await updatePluginFromManager();
            return;
        } else if (action === 'update-plugin-direct') {
            await updatePluginFromManager({ skipCheck: true });
            return;
        } else if (action === 'open-sillytavern-extensions') {
            openExtensionManagerForUpdate();
            return;
        } else if (action === 'open-extension-manager') {
            openVersionDialog();
            return;
        } else if (action === 'import-reference') {
            const input = document.getElementById('stsc_reference_import_file');
            if (input) {
                input.value = '';
                input.click();
            }
            return;
        } else if (action === 'toggle-reference-collapse') {
            const id = $(this).closest('[data-reference-id]').data('reference-id');
            if (expandedReferenceIds.has(id)) expandedReferenceIds.delete(id);
            else expandedReferenceIds.add(id);
            renderReferencesTab();
            return;
        } else if (action === 'toggle-question-collapse') {
            const id = $(this).closest('[data-question-id]').data('question-id');
            if (expandedQuestionIds.has(id)) expandedQuestionIds.delete(id);
            else expandedQuestionIds.add(id);
            renderPresetsTab();
            return;
        } else if (action === 'toggle-temp-collapse') {
            const id = $(this).closest('[data-temp-id]').data('temp-id');
            if (expandedInstructionIds.has(id)) expandedInstructionIds.delete(id);
            else expandedInstructionIds.add(id);
            renderTemporaryTab();
            return;
        } else if (action === 'export-preset') {
            downloadPresetFile(preset);
            return;
        } else if (action === 'import-preset') {
            const input = document.getElementById('stsc_preset_import_file');
            if (input) {
                input.value = '';
                input.click();
            }
            return;
        } else if (action === 'copy-preset' && preset) {
            const copied = clone(preset);
            copied.id = uid('preset');
            copied.name = makeUniquePresetName(`${preset.name} 副本`);
            copied.builtinKey = '';
            copied.questions = copied.questions.map(q => ({ ...q, id: uid('q') }));
            copied.boundCharacterKey = '';
            copied.boundCharacterName = '';
            settings.presets.push(copied);
            if (copied.kind === 'character') settings.ui.editingCharacterPresetId = copied.id;
            else settings.ui.editingGeneralPresetId = copied.id;
        } else if (action === 'delete-preset' && preset) {
            if (preset.kind === 'general' && settings.presets.filter(x => x.kind === 'general').length <= 1) {
                toastr.warning('至少要保留一个通用预设。', '墨提斯之镜');
                return;
            }
            openDeleteConfirmation({
                title: '确认删除预设',
                message: `确定删除预设“${preset.name}”吗？`,
                detail: `其中包含 ${preset.questions.length} 个问题。`,
                perform: () => {
                    settings.presets = settings.presets.filter(x => x.id !== preset.id);
                    for (const question of preset.questions) expandedQuestionIds.delete(question.id);
                    if (preset.kind === 'general') {
                        const remaining = settings.presets.filter(x => x.kind === 'general');
                        if (settings.generalPresetId === preset.id) settings.generalPresetId = remaining[0]?.id || '';
                        settings.ui.editingGeneralPresetId = remaining[0]?.id || '';
                    } else {
                        settings.ui.editingCharacterPresetId = settings.presets.find(x => x.kind === 'character')?.id || '';
                    }
                    markDirty();
                    renderAll();
                },
            });
            return;
        } else if (action === 'set-general-preset' && preset?.kind === 'general') {
            settings.generalPresetId = preset.id;
            settings.generalEnabled = true;
            toastr.success(`已将“${preset.name}”设为当前通用预设。`, '墨提斯之镜');
        } else if (action === 'bind-current-character' && preset?.kind === 'character') {
            const character = getCurrentCharacterEntity();
            if (!character.key) {
                toastr.warning('当前页面未找到角色卡，请先进入一个角色卡聊天页面。', '墨提斯之镜');
                return;
            }
            for (const other of settings.presets.filter(x => x.kind === 'character' && x.id !== preset.id && x.boundCharacterKey === character.key)) {
                other.boundCharacterKey = '';
                other.boundCharacterName = '';
            }
            preset.boundCharacterKey = character.key;
            preset.boundCharacterName = character.name;
            settings.characterEnabled = true;
            toastr.success(`已将“${preset.name}”绑定到 ${character.name}。`, '墨提斯之镜');
        } else if (action === 'unbind-preset' && preset?.kind === 'character') {
            preset.boundCharacterKey = '';
            preset.boundCharacterName = '';
        } else if (action === 'test-preset') {
            await testCurrentPreset();
            return;
        } else if (action === 'add-question' && preset) {
            const question = createQuestion();
            preset.questions.push(question);
            expandedQuestionIds.add(question.id);
        } else if (action === 'open-batch-import' && preset) {
            openBulkImportDialog(preset);
            return;
        } else if (['delete-question', 'move-question-up', 'move-question-down'].includes(action) && preset) {
            const id = $(this).closest('[data-question-id]').data('question-id');
            const index = preset.questions.findIndex(x => x.id === id);
            const question = index >= 0 ? preset.questions[index] : null;
            if (action === 'delete-question' && question) {
                openDeleteConfirmation({
                    title: '确认删除问题',
                    message: `确定删除 Q${index + 1} 吗？`,
                    detail: String(question.text || '').trim() || '这个问题尚未填写内容。',
                    perform: () => {
                        const currentIndex = preset.questions.findIndex(item => item.id === id);
                        if (currentIndex >= 0) preset.questions.splice(currentIndex, 1);
                        expandedQuestionIds.delete(id);
                        markDirty();
                        renderAll();
                    },
                });
                return;
            }
            if (index > 0 && action === 'move-question-up') [preset.questions[index - 1], preset.questions[index]] = [preset.questions[index], preset.questions[index - 1]];
            if (index >= 0 && index < preset.questions.length - 1 && action === 'move-question-down') [preset.questions[index + 1], preset.questions[index]] = [preset.questions[index], preset.questions[index + 1]];
        } else if (action === 'export-reference') {
            const id = $(this).closest('[data-reference-id]').data('reference-id');
            const reference = settings.references.find(item => item.id === id);
            downloadReferenceFile(reference);
            return;
        } else if (action === 'delete-reference') {
            const id = $(this).closest('[data-reference-id]').data('reference-id');
            const reference = settings.references.find(item => item.id === id);
            if (!reference) return;
            openDeleteConfirmation({
                title: '确认删除资料库',
                message: `确定删除资料库“${reference.name}”吗？`,
                detail: `类型：${referenceTypeLabel(reference.type)}。资料内容与关联的自动自检问题都会一起删除。`,
                perform: () => {
                    settings.references = settings.references.filter(item => item.id !== id);
                    expandedReferenceIds.delete(id);
                    markDirty();
                    renderAll();
                },
            });
            return;
        } else if (action === 'bind-reference-character') {
            const id = $(this).closest('[data-reference-id]').data('reference-id');
            const reference = settings.references.find(x => x.id === id);
            const character = getCurrentCharacterEntity();
            if (!reference || !character.key) {
                toastr.warning('当前页面未找到角色卡，请先进入一个角色卡聊天页面。', '墨提斯之镜');
                return;
            }
            reference.scope = 'character';
            reference.characterKey = character.key;
        } else if (action === 'add-temp') {
            const instruction = createTemporaryInstruction();
            settings.temporaryInstructions.push(instruction);
            expandedInstructionIds.add(instruction.id);
        } else if (action === 'delete-temp') {
            const id = $(this).closest('[data-temp-id]').data('temp-id');
            const instruction = settings.temporaryInstructions.find(item => item.id === id);
            if (!instruction) return;
            openDeleteConfirmation({
                title: '确认删除快捷指令',
                message: `确定删除指令“${instruction.name}”吗？`,
                detail: String(instruction.content || '').trim() || '这条指令尚未填写内容。',
                perform: () => {
                    settings.temporaryInstructions = settings.temporaryInstructions.filter(item => item.id !== id);
                    settings.pendingInstructionIds = settings.pendingInstructionIds.filter(value => value !== id);
                    settings.persistentInstructionIds = settings.persistentInstructionIds.filter(value => value !== id);
                    expandedInstructionIds.delete(id);
                    markDirty();
                    renderAll();
                },
            });
            return;
        } else {
            return;
        }

        markDirty();
        renderAll();
    });

    $('#stsc_manager_overlay').on('change', '#stsc_preset_import_file', async function () {
        const file = this.files?.[0] || null;
        this.value = '';
        await importPresetFile(file);
    });

    $('#stsc_manager_overlay').on('change', '#stsc_reference_import_file', async function () {
        const file = this.files?.[0] || null;
        this.value = '';
        await importReferenceFile(file);
    });

    $('#stsc_dialog_overlay').on('change', '[data-batch-reference-id]', function () {
        const count = $('#stsc_dialog_body [data-batch-reference-id]:checked').length;
        $('#stsc_batch_reference_count').text(`已选择 ${count} 个`);
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

    $('#stsc_dialog_overlay').on('keydown', '#stsc_new_reference_name', function (event) {
        if (event.key === 'Enter') {
            event.preventDefault();
            $('#stsc_dialog_overlay [data-dialog-action="create-reference"]').trigger('click');
        }
    });

    $('#stsc_dialog_overlay').on('click', '[data-dialog-action]', function () {
        const action = $(this).data('dialog-action');
        const settings = getUiSettings();

        if (action === 'confirm-import-dev-settings' || action === 'confirm-restore-dev-migration') {
            const restore = action === 'confirm-restore-dev-migration';
            try {
                const migrated = applyDevSettingsMigration({ restore });
                closeDialog();
                applyTheme(migrated);
                renderAll();
                toastr.success(restore ? '已恢复迁入前的正式版设置。' : 'DEV 设置已迁入并保存。请在酒馆扩展页停用 DEV 并刷新页面。', '墨提斯之镜');
            } catch (error) {
                toastr.warning(error.message, '墨提斯之镜');
            }
            return;
        }

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
        if (action === 'check-plugin-update') {
            void checkForPluginUpdate({ force: true, userInitiated: true }).then(openVersionDialog);
            return;
        }
        if (action === 'update-plugin-now') {
            void updatePluginFromManager();
            return;
        }
        if (action === 'update-plugin-direct') {
            void updatePluginFromManager({ skipCheck: true });
            return;
        }
        if (action === 'open-sillytavern-extensions') {
            closeDialog();
            openExtensionManagerForUpdate();
            return;
        }
        if (action === 'export-logs') {
            exportRuntimeLogs();
            return;
        }
        if (action === 'clear-runtime-cache') {
            dualApiModels = [];
            dualApiModelsError = '';
            dualApiModelsSignature = '';
            latestRemoteReleaseInfo = null;
            toastr.success('模型列表与更新检查缓存已清理；预设、资料库和日志未受影响。', '墨提斯之镜');
            return;
        }
        if (action === 'delete-log') {
            const id = String($(this).data('log-id') || '');
            normalizeSettings().logs = normalizeSettings().logs.filter(item => item.id !== id);
            saveSettings(); openLogDialog();
            return;
        }
        if (action === 'ask-clear-logs') {
            openDialog('清除运行日志', '<div class="stsc-delete-warning"><b>确定清除全部运行日志吗？</b><div class="stsc-muted">该操作无法撤销。</div></div>', '<button class="menu_button" type="button" data-dialog-action="cancel">取消</button><button class="menu_button stsc-danger-button" type="button" data-dialog-action="confirm-clear-logs">确认清除</button>');
            return;
        }
        if (action === 'confirm-clear-logs') {
            normalizeSettings().logs = [];
            normalizeSettings().logLastViewedAt = Date.now();
            saveSettings(); closeDialog(); renderLogBadge();
            toastr.success('运行日志已清除。', '墨提斯之镜');
            return;
        }
        if (action === 'confirm-delete') {
            const request = pendingDeleteRequest;
            pendingDeleteRequest = null;
            closeDialog();
            request?.();
            return;
        }
        if (action === 'batch-reference-select-all' || action === 'batch-reference-select-none') {
            const checked = action === 'batch-reference-select-all';
            $('#stsc_dialog_body [data-batch-reference-id]').prop('checked', checked).trigger('change');
            return;
        }
        if (action === 'confirm-batch-reference-export') {
            const ids = $('#stsc_dialog_body [data-batch-reference-id]:checked').map((_, element) => String($(element).data('batch-reference-id') || '')).get().filter(Boolean);
            const references = settings.references.filter(reference => ids.includes(reference.id));
            if (!references.length) {
                toastr.warning('请至少选择一个要导出的资料库。', '墨提斯之镜');
                return;
            }
            if (downloadReferenceBundleFile(references)) closeDialog();
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
        if (action === 'create-reference') {
            const name = String($('#stsc_new_reference_name').val() || '').trim();
            const type = Object.hasOwn(REFERENCE_TYPE_CONFIG, $('#stsc_new_reference_type').val())
                ? $('#stsc_new_reference_type').val()
                : 'other';
            if (!name) {
                $('#stsc_new_reference_error').text('请输入资料库名称。');
                return;
            }
            if (referenceNameExists(name)) {
                $('#stsc_new_reference_error').text('已经存在同名资料库，请换一个名称。');
                return;
            }
            const reference = createReference(name, type);
            settings.references.push(reference);
            markDirty();
            closeDialog();
            renderAll();
            setTimeout(() => document.querySelector(`[data-reference-id="${CSS.escape(reference.id)}"]`)?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' }), 0);
            return;
        }
        if (action === 'recognize-bulk') {
            if (!bulkDraft) return;
            bulkDraft.raw = String($('#stsc_bulk_raw').val() || '');
            bulkDraft.items = splitBulkQuestions(bulkDraft.raw);
            if (!bulkDraft.items.length) toastr.warning('没有识别到明显的问题，请调整原文或手动补充。', '墨提斯之镜');
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
                toastr.warning('没有可以导入的问题。', '墨提斯之镜');
                return;
            }
            const createdQuestions = items.map(text => createQuestion(text));
            preset.questions.push(...createdQuestions);
            for (const question of createdQuestions) expandedQuestionIds.add(question.id);
            markDirty();
            const count = items.length;
            closeDialog();
            renderAll();
            toastr.success(`已确认导入 ${count} 个问题。`, '墨提斯之镜');
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


function openExtensionManagerForUpdate() {
    if (editDirty) {
        toastr.warning('当前还有未保存的插件设置，请先保存，再打开酒馆扩展页面。', '墨提斯之镜');
        return;
    }
    closeDialog();
    performCloseManager();
    const detailsButton = document.querySelector('#extensions_details');
    if (detailsButton) {
        detailsButton.click();
        return;
    }

    const menuButton = document.querySelector('#extensionsMenuButton');
    menuButton?.click?.();
    setTimeout(() => {
        const retryButton = document.querySelector('#extensions_details');
        if (retryButton) retryButton.click();
        else window.open('https://github.com/chenxyeah/SillyTavern-Self-Check', '_blank', 'noopener,noreferrer');
    }, 150);
}

async function getInstalledExtensionType() {
    const context = ctx();
    try {
        const response = await fetch('/api/extensions/discover', {
            method: 'GET',
            headers: context?.getRequestHeaders?.(),
        });
        if (!response.ok) return 'local';
        const extensions = await response.json();
        const match = Array.isArray(extensions)
            ? extensions.find(item => item?.name === `third-party/${STSC_EXTENSION_FOLDER_NAME}`)
            : null;
        return match?.type === 'global' ? 'global' : 'local';
    } catch (error) {
        console.debug('[STSC] 无法判断插件安装位置，将按本地扩展检查更新。', error);
        return 'local';
    }
}

async function fetchOwnExtensionVersion(isGlobal) {
    const context = ctx();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
        const response = await fetch('/api/extensions/version', {
            method: 'POST',
            headers: context?.getRequestHeaders?.() || { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                extensionName: STSC_EXTENSION_FOLDER_NAME,
                global: Boolean(isGlobal),
            }),
            signal: controller.signal,
        });
        if (!response.ok) {
            const detail = compactPromptText(await response.text());
            const error = new Error(detail || `HTTP ${response.status}`);
            error.httpStatus = response.status;
            throw error;
        }
        return await response.json();
    } finally {
        clearTimeout(timer);
    }
}

function compareVersions(left, right) {
    const parse = value => String(value || '')
        .trim()
        .replace(/^v/i, '')
        .split(/[.-]/)
        .map(part => (/^\d+$/.test(part) ? Number(part) : part));
    const a = parse(left);
    const b = parse(right);
    const length = Math.max(a.length, b.length);
    for (let index = 0; index < length; index += 1) {
        const av = a[index] ?? 0;
        const bv = b[index] ?? 0;
        if (typeof av === 'number' && typeof bv === 'number') {
            if (av !== bv) return av > bv ? 1 : -1;
            continue;
        }
        const result = String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: 'base' });
        if (result !== 0) return result > 0 ? 1 : -1;
    }
    return 0;
}

function decodeRemoteJsonPayload(payload) {
    if (!payload || typeof payload !== 'object' || payload.encoding !== 'base64' || typeof payload.content !== 'string') return payload;
    const binary = atob(payload.content.replace(/\s+/g, ''));
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    return JSON.parse(new TextDecoder('utf-8').decode(bytes));
}

async function fetchRemoteJsonUrl(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    const separator = url.includes('?') ? '&' : '?';
    try {
        const response = await fetch(`${url}${separator}stsc=${Date.now()}`, {
            method: 'GET',
            cache: 'no-store',
            headers: { Accept: 'application/json, application/vnd.github+json' },
            signal: controller.signal,
        });
        if (!response.ok) {
            const error = new Error(`HTTP ${response.status}`);
            error.httpStatus = response.status;
            throw error;
        }
        return decodeRemoteJsonPayload(await response.json());
    } finally {
        clearTimeout(timer);
    }
}

function fetchRemoteJsonFromMirrors(urls, label) {
    return new Promise((resolve, reject) => {
        const failures = [];
        let remaining = urls.length;
        for (const url of urls) {
            fetchRemoteJsonUrl(url).then(resolve).catch(error => {
                failures.push(error);
                remaining -= 1;
                if (remaining === 0) {
                    const combined = new Error(`${label}的 ${urls.length} 个网络地址都没有连接成功。`);
                    combined.causes = failures;
                    reject(combined);
                }
            });
        }
    });
}

function plainUpdateFailureReason(error) {
    const raw = compactPromptText(error?.message || error || '没有收到具体原因');
    const status = Number(error?.httpStatus) || Number(raw.match(/HTTP\s*(\d{3})/i)?.[1]) || 0;
    if (/AbortError|aborted|超时|timeout/i.test(raw)) return '等待超时，网络或酒馆服务没有及时回答';
    if (/Failed to fetch|NetworkError|fetch failed|network|ECONN|ENOTFOUND/i.test(raw)) return '没有连接成功，可能是网络暂时无法访问该地址';
    if (status === 401 || status === 403) return `请求被拒绝（${status}），可能是权限或网络代理限制`;
    if (status === 404) return '当前酒馆没有这个检查接口，或插件目录没有找到（404）';
    if (status >= 500) return `酒馆或远程服务内部出错（${status}）`;
    if (/Git repository|not a Git|不是.*Git/i.test(raw)) return '当前插件不是通过 Git 仓库安装，酒馆无法直接拉取更新';
    if (/\d+ 个网络地址都没有连接成功/.test(raw)) return raw;
    return raw || '没有收到具体原因';
}

async function fetchRemoteManifestVersion() {
    const manifest = await fetchRemoteJsonFromMirrors(STSC_REMOTE_MANIFEST_URLS, '远程版本号');
    const version = String(manifest?.version || '').trim();
    if (!version) throw new Error('远程版本文件已经收到，但里面没有版本号。');
    return version;
}


async function fetchRemoteReleaseInfo() {
    const info = await fetchRemoteJsonFromMirrors(STSC_REMOTE_RELEASE_URLS, '远程更新说明');
    const version = String(info?.version || '').trim();
    if (!version) throw new Error('远程更新说明已经收到，但里面没有版本号。');
    return {
        version,
        releasedAt: String(info?.releasedAt || ''),
        title: String(info?.title || ''),
        changes: Array.isArray(info?.changes) ? info.changes.filter(item => typeof item === 'string').slice(0, 30) : [],
    };
}

function markInstalledReleaseSeen() {
    const settings = normalizeSettings();
    if (!settings?.updateNotice || settings.updateNotice.lastSeenInstalledVersion === STSC_VERSION) return;
    settings.updateNotice.lastSeenInstalledVersion = STSC_VERSION;
    saveSettings();
}

function clearPluginUpdateNotice() {
    updateAvailableVersion = '';
    gitUpdateAvailable = false;
    latestRemoteReleaseInfo = null;
    renderHeaderUpdateBadge();
    $('#stsc_extensions_menu_button').removeClass('stsc-has-update').find('.stsc-menu-update-badge').remove();
    if (updateToast) {
        try { toastr.clear(updateToast); } catch { /* 忽略旧 toast 清理失败 */ }
        updateToast = null;
    }
}

function showPluginUpdateNotice(remoteVersion = '', releaseInfo = null, { gitOnly = false } = {}) {
    updateAvailableVersion = String(remoteVersion || releaseInfo?.version || '').trim();
    gitUpdateAvailable = Boolean(gitOnly);
    latestRemoteReleaseInfo = releaseInfo || latestRemoteReleaseInfo;
    if (!gitUpdateAvailable && (!updateAvailableVersion || compareVersions(updateAvailableVersion, STSC_VERSION) <= 0)) {
        clearPluginUpdateNotice();
        return;
    }
    renderHeaderUpdateBadge();

    const $menuButton = $('#stsc_extensions_menu_button');
    $menuButton.addClass('stsc-has-update');
    if (!$menuButton.find('.stsc-menu-update-badge').length) {
        $menuButton.append('<span class="stsc-menu-update-badge">更新</span>');
    }

    const settings = normalizeSettings();
    if (settings?.updateNotice?.lastNotifiedVersion === updateAvailableVersion || updateToast) return;
    if (settings?.updateNotice) {
        settings.updateNotice.lastNotifiedVersion = updateAvailableVersion;
        settings.updateNotice.lastNotifiedAt = Date.now();
        saveSettings();
    }

    const versionText = updateAvailableVersion ? ` v${updateAvailableVersion}` : '';
    const detail = Array.isArray(releaseInfo?.changes) && releaseInfo.changes.length
        ? ` 更新内容：${releaseInfo.changes.slice(0, 2).join('；')}`
        : '';
    updateToast = toastr.info(
        `检测到“墨提斯之镜”有新版本${versionText}。${detail} 点击打开插件内更新页面。`,
        '插件有更新｜立即查看',
        {
            timeOut: 0,
            extendedTimeOut: 0,
            closeButton: true,
            tapToDismiss: false,
            onclick: () => openVersionDialog(),
            onHidden: () => { updateToast = null; },
        },
    );
}

function plainExtensionUpdateFailure(error) {
    const raw = compactPromptText(error?.message || error || '没有收到具体原因');
    const status = Number(error?.httpStatus) || Number(raw.match(/HTTP\s*(\d{3})/i)?.[1]) || 0;
    if (/not a Git|Git repository|不是.*Git/i.test(raw)) return '当前插件文件夹不是通过 GitHub 仓库安装的，所以酒馆不能直接拉取更新。请到酒馆扩展页面删除后，再用 正式仓库链接重新安装。';
    if (status === 401 || status === 403) return '酒馆拒绝了更新操作。若插件安装在全局扩展目录，请使用管理员账号更新。';
    if (status === 404) return '酒馆没有找到这个插件目录，可能是插件文件夹名称被改过，或当前酒馆版本不支持这个更新接口。';
    if (status >= 500) return `酒馆没有成功拉取插件文件（返回 ${status}）。常见原因是插件不是 Git 安装、GitHub 暂时连不上，或插件目录里的 Git 状态异常。`;
    if (/AbortError|timeout|超时/i.test(raw)) return '更新等待超时，酒馆没有及时从 GitHub 拉到文件。请稍后重试或在扩展页面更新。';
    if (/Failed to fetch|NetworkError|network|连接/i.test(raw)) return '更新时没有连接成功，请检查酒馆服务器到 GitHub 的网络。';
    return `酒馆没有完成更新。酒馆给出的提示是：${raw}`;
}

async function updatePluginFromManager({ skipCheck = false } = {}) {
    if (updateCheckInFlight || updateCheckState === 'updating') return;
    if (editDirty) {
        toastr.warning('当前还有未保存的修改，请先点击“保存更改”再更新插件。', '墨提斯之镜');
        return;
    }
    if (installedExtensionGitState === 'non_git') {
        updateCheckState = 'error';
        updateCheckError = '当前插件不是通过 GitHub 仓库安装的，酒馆无法在插件内直接更新。';
        updateCheckDiagnostics = ['请打开酒馆扩展页面，删除当前插件，再使用 正式仓库链接重新安装；插件设置通常保存在酒馆设置中，不会因为重装插件文件而清空。'];
        addRuntimeLog('error', '插件更新', updateCheckError, updateCheckDiagnostics[0]);
        renderUpdatesTab();
        toastr.error(updateCheckError, '无法直接更新', { timeOut: 7000 });
        return;
    }
    if (!skipCheck && updateCheckState !== 'available' && !gitUpdateAvailable && (!updateAvailableVersion || compareVersions(updateAvailableVersion, STSC_VERSION) <= 0)) {
        await checkForPluginUpdate({ force: true, userInitiated: true });
        if (updateCheckState !== 'available') return;
    }

    updateCheckInFlight = true;
    updateCheckState = 'updating';
    updateCheckError = '';
    renderUpdatesTab();

    try {
        const installType = await getInstalledExtensionType();
        const context = ctx();
        const response = await fetch('/api/extensions/update', {
            method: 'POST',
            headers: context?.getRequestHeaders?.() || { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                extensionName: STSC_EXTENSION_FOLDER_NAME,
                global: installType === 'global',
            }),
        });
        if (!response.ok) {
            const detail = compactPromptText(await response.text());
            const error = new Error(detail || `HTTP ${response.status}`);
            error.httpStatus = response.status;
            throw error;
        }
        const result = await response.json();
        if (result?.isUpToDate) {
            if (skipCheck) {
                updateCheckState = 'latest';
                updateCheckError = '';
                updateCheckDiagnostics = [];
                clearPluginUpdateNotice();
                addRuntimeLog('info', '插件更新', '酒馆已经直接检查过插件文件，当前没有可拉取的新提交。', '当前插件已经是 Git 仓库能获取到的最新内容。');
                toastr.success('酒馆已经直接检查过，当前没有可拉取的新提交。', '插件已经是最新状态');
            } else {
                updateCheckState = 'available';
                addRuntimeLog('warning', '插件更新', '远程版本号显示有更新，但酒馆没有拉取到新提交。', '请确认插件安装分支是 main；如果仍然如此，请到酒馆扩展页面重新安装 正式仓库。');
                toastr.warning('远程版本号显示有更新，但酒馆没有拉取到新提交。请确认插件安装分支为 main，或重新安装插件。', '插件未能更新');
            }
            return;
        }

        const installedTargetVersion = gitUpdateAvailable ? '' : updateAvailableVersion;
        addRuntimeLog('info', '插件更新', `插件文件已经成功更新${installedTargetVersion ? `到 v${installedTargetVersion}` : '到远程最新提交'}。`, '页面会自动刷新并加载新版本。');
        clearPluginUpdateNotice();
        toastr.success(`已拉取新版本${installedTargetVersion ? ` v${installedTargetVersion}` : ''}，页面即将刷新。`, '插件更新成功', {
            timeOut: 1400,
            extendedTimeOut: 0,
        });
        setTimeout(() => window.location.reload(), 900);
    } catch (error) {
        updateCheckState = 'error';
        updateCheckError = plainExtensionUpdateFailure(error);
        updateCheckDiagnostics = ['可以稍后重试；也可以打开酒馆扩展页面使用酒馆自带的更新按钮。'];
        addRuntimeLog('error', '插件更新', updateCheckError, updateCheckDiagnostics[0]);
        console.error('[STSC] 插件内更新失败：', error);
        toastr.error(updateCheckError, '插件更新失败', { timeOut: 6000 });
    } finally {
        updateCheckInFlight = false;
        if (updateCheckState !== 'updating') renderUpdatesTab();
    }
}

async function checkForPluginUpdate({ force = false, userInitiated = false } = {}) {
    if (updateCheckInFlight) return;

    const now = Date.now();
    if (!force && now - lastRuntimeUpdateCheckAt < STSC_UPDATE_CHECK_INTERVAL_MS) return;
    lastRuntimeUpdateCheckAt = now;
    updateCheckInFlight = true;
    updateCheckState = 'checking';
    updateCheckError = '';
    updateCheckDiagnostics = [];
    if (initialized) renderUpdatesTab();

    const settings = normalizeSettings();
    if (settings?.updateNotice) {
        settings.updateNotice.lastCheckedAt = now;
        saveSettings();
    }

    try {
        const installType = await getInstalledExtensionType();
        const [gitResult, manifestResult, releaseResult] = await Promise.allSettled([
            fetchOwnExtensionVersion(installType === 'global'),
            fetchRemoteManifestVersion(),
            fetchRemoteReleaseInfo(),
        ]);

        const manifestVersion = manifestResult.status === 'fulfilled' ? manifestResult.value : '';
        const releaseInfo = releaseResult.status === 'fulfilled' ? releaseResult.value : null;
        const remoteVersion = [manifestVersion, releaseInfo?.version]
            .filter(Boolean)
            .sort((a, b) => compareVersions(b, a))[0] || '';
        const gitData = gitResult.status === 'fulfilled' ? gitResult.value : null;
        installedExtensionGitState = gitData?.currentCommitHash
            ? 'git'
            : (gitResult.status === 'fulfilled' && gitData?.isUpToDate === true ? 'non_git' : 'unknown');
        const semanticVersionHasUpdate = Boolean(remoteVersion && compareVersions(remoteVersion, STSC_VERSION) > 0);
        const gitHasUpdate = installedExtensionGitState === 'git' && gitData?.isUpToDate === false;
        const gitCheckUsable = installedExtensionGitState === 'git' && typeof gitData?.isUpToDate === 'boolean';

        latestRemoteReleaseInfo = releaseInfo;
        if (semanticVersionHasUpdate || gitHasUpdate) {
            updateCheckState = 'available';
            showPluginUpdateNotice(remoteVersion, releaseInfo, { gitOnly: gitHasUpdate && !semanticVersionHasUpdate });
            if (userInitiated) addRuntimeLog('info', '更新检查', `检查完成：发现新版本${remoteVersion ? ` v${remoteVersion}` : '或新的远程提交'}。`, '可以在插件的“版本更新”页面点击“立即更新”。');
        } else if (remoteVersion || gitCheckUsable) {
            updateCheckState = 'latest';
            clearPluginUpdateNotice();
            if (userInitiated) addRuntimeLog('info', '更新检查', `检查完成：当前插件 v${STSC_VERSION} 已经是最新版本。`, '不需要进行任何操作。');
        } else {
            updateCheckState = 'error';
            updateCheckError = installedExtensionGitState === 'non_git'
                ? '远程版本地址没有连接成功，而且当前插件不是 Git 安装，酒馆也无法替它检查远程提交。'
                : '插件已经尝试了多个远程地址和酒馆自身的检查接口，但这次都没有拿到结果。';
            updateCheckDiagnostics = [
                gitResult.status === 'rejected'
                    ? `酒馆自身检查：${plainUpdateFailureReason(gitResult.reason)}`
                    : installedExtensionGitState === 'non_git'
                        ? '酒馆自身检查：当前插件文件夹不是 Git 安装，无法直接比较远程提交'
                        : '酒馆自身检查：没有返回足够的信息',
                manifestResult.status === 'rejected'
                    ? `远程版本号：${plainUpdateFailureReason(manifestResult.reason)}`
                    : '远程版本号：已经读取成功',
                releaseResult.status === 'rejected'
                    ? `远程更新说明：${plainUpdateFailureReason(releaseResult.reason)}`
                    : '远程更新说明：已经读取成功',
            ];
            if (userInitiated) addRuntimeLog('warning', '更新检查', updateCheckError, `${updateCheckDiagnostics.join('；')}。可以点击“跳过检查，直接尝试更新”，或打开酒馆扩展页面。`);
        }
    } catch (error) {
        updateCheckState = 'error';
        updateCheckError = '检查更新时发生了意外问题，这不影响插件继续自检。';
        updateCheckDiagnostics = [`具体情况：${plainUpdateFailureReason(error)}`];
        if (userInitiated) addRuntimeLog('warning', '更新检查', updateCheckError, `${updateCheckDiagnostics[0]}。可以稍后重试或打开酒馆扩展页面。`);
        console.debug('[STSC] 插件更新检查失败：', error);
    } finally {
        updateCheckInFlight = false;
        if (initialized) renderUpdatesTab();
    }
}

function addExtensionsMenuButton() {
    if ($('#stsc_extensions_menu_button').length || !$('#extensionsMenu').length) return;
    const button = $(
        `<div id="stsc_extensions_menu_button" class="list-group-item flex-container flexGap5 interactable" title="打开墨提斯之镜">
            <i class="fa-solid fa-list-check"></i>
            <span>墨提斯之镜</span>
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
    removeLegacyMessageBadges();
    initialized = true;
    bindUiEvents();
    addExtensionsMenuButton();
    const events = context.eventTypes || context.event_types;
    context.eventSource.on(events.MESSAGE_RECEIVED, handleMessageReceived);
    context.eventSource.on(events.CHAT_CHANGED, renderAll);
    context.eventSource.on(events.GENERATION_ENDED, onGenerationEnded);
    context.eventSource.on(events.GENERATION_STOPPED, onGenerationStopped);

    renderAll();
    markInstalledReleaseSeen();
    setTimeout(() => void checkForPluginUpdate({ force: true }), 2500);
    if (updatePollTimer) clearInterval(updatePollTimer);
    updatePollTimer = setInterval(() => void checkForPluginUpdate(), STSC_UPDATE_CHECK_INTERVAL_MS);
    console.info(`[STSC] 墨提斯之镜 v${STSC_VERSION} 已加载。`);
}

jQuery(() => {
    const context = ctx();
    const events = context?.eventTypes || context?.event_types;
    const start = async () => {
        try {
            await initialize();
        } catch (error) {
            console.error('[STSC] 插件初始化失败：', error);
            toastr.error('墨提斯之镜 插件加载失败，请查看浏览器控制台。');
        }
    };

    if (context?.eventSource && events?.APP_READY) {
        context.eventSource.on(events.APP_READY, start);
    } else {
        start();
    }
});
