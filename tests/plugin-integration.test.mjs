import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as adapters from '../api-providers.mjs';
import * as errorHelp from '../error-help.mjs';

const source = readFileSync(new URL('../index.js', import.meta.url), 'utf8').replace(/^import[\s\S]*?;\r?\n/gm, '');
const tick = () => new Promise(resolve => setImmediate(resolve));

function plugin() {
    const html = {};
    const events = new Map();
    const nodes = new Map();
    const notices = [];
    const updateToasts = [];
    const clearedToasts = [];
    const classes = new Map();
    const requestBodies = [];
    const st = { extensionSettings: {}, chat: [], saveSettingsDebounced() {}, getRequestHeaders: () => ({ 'X-CSRF-Token': 'LOCAL' }) };
    const $ = selector => {
        const chain = new Proxy({}, { get(_target, method) {
            if (method === 'toggleClass') return (name, enabled) => { classes.set(selector + ':' + name, Boolean(enabled)); return chain; };
            if (method === 'data' && typeof selector === 'object') return key => selector.data?.[key];
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
    for (const id of ['stsc_dual_model', 'stsc_refresh_models', 'stsc_dual_model_status', 'stsc_dual_model_manual', 'stsc_test_api_connection', 'stsc_api_profile_name']) {
        nodes.set(id, { innerHTML: '', disabled: false, value: '', textContent: '', classList: { toggle() {} } });
    }
    const scope = { ...adapters, ...errorHelp, $, jQuery() {}, URL, AbortController, structuredClone, Error, TypeError,
        setTimeout: (fn, delay) => { const timer = setTimeout(fn, delay); timer.unref(); return timer; }, clearTimeout,
        document: { getElementById: id => nodes.get(id) || null },
        window: { addEventListener() {} },
        SillyTavern: { getContext: () => st },
        toastr: { success: message => notices.push(message), error: message => notices.push(message), warning: message => notices.push(message),
            info: (message, title, options) => { const toast = { message, title, options }; updateToasts.push(toast); return toast; },
            clear: toast => { clearedToasts.push(toast); } },
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
    return { run, scope, st, html, nodes, notices, requestBodies, updateToasts, clearedToasts, classes,
        toggleUpdateNotice(checked) { return events.get('change:#stsc_update_notices_enabled').call({ checked }); },
        event(type, id, value) { return events.get(type + ':' + id).call({ value, checked: value }, { type }); },
        action(action, referenceId) { return events.get('click:[data-action]').call({ data: { action, 'reference-id': referenceId } }); },
        dialogAction(action, data = {}) { return events.get('click:[data-dialog-action]').call({ data: { 'dialog-action': action, ...data } }); },
        planAction(action, referenceId) { return events.get('click:[data-plan-action]').call({ data: { 'plan-action': action, 'plan-reference-id': referenceId } }); },
        planField(field, referenceId, checked) { return events.get('change:[data-plan-field]').call({ checked, data: { 'plan-field': field, 'plan-reference-id': referenceId } }); }
    };
}

function promptSourceApp() {
    const app = plugin();
    app.st.characters = [{name:'角色本人',avatar:'character.png',description:'真实角色设定'}];
    app.st.characterId=0;
    app.run(`general=createPreset('默认通用自检_SOURCE_GENERAL','general');
        general.questions=[createQuestion('本轮是否替用户做决定？','open','standard',true)];
        character=createPreset('角色自检预设_SOURCE_CHARACTER','character');
        character.boundCharacterKey='character:character.png';
        character.questions=[createQuestion('角色本轮应如何回应？','open','detailed',false)];
        editDraft.presets=[general,character]; editDraft.generalPresetId=general.id;
        questions=getActiveQuestions(editDraft);
        parsed=parseModelOutput('<stsc_self_check><item id="q1"><answer>不得替用户做决定。</answer><evidence>用户没有选择行动。</evidence></item><item id="q2"><answer>角色应平静回应。</answer></item></stsc_self_check>',questions);`);
    return app;
}

test('log dialog includes guide entry, normal logs have no view button, and problems do', () => {
    const app=plugin();
    app.run(`openLogDialog(); normalLog={id:'ok',level:'info',stage:'本轮结果',message:'正常完成'};
        problemLog={id:'bad',level:'warning',stage:'本轮结果',message:'自检格式不完整',helpIds:[7]};`);
    assert.ok(app.html['#stsc_dialog_footer'].includes('open-error-help'));
    assert.ok(!app.run('runtimeLogHtml(normalLog)').includes('view-log-help'));
    assert.ok(app.run('runtimeLogHtml(problemLog)').includes('view-log-help'));
    assert.ok(app.run('runtimeLogHtml(problemLog)').includes('delete-log'));
    assert.ok(app.run('runtimeLogHtml({id:"unknown",level:"error",stage:"unknown"})').includes('view-log-help'));
});

test('guide opens, searches title/number only and resets without modifying logs/settings', () => {
    const app=plugin();
    app.run('normalizeSettings()');
    const before=app.run('JSON.stringify(normalizeSettings())');
    app.dialogAction('open-error-help');
    assert.equal((app.html['#stsc_error_help_results'].match(/data-help-id=/g)||[]).length,52);
    app.event('input','#stsc_error_help_search','47');
    assert.match(app.html['#stsc_error_help_results'],/data-help-id="47" open/);
    assert.equal((app.html['#stsc_error_help_results'].match(/data-help-id=/g)||[]).length,1);
    for(const label of ['适用','影响','原因','处理']) assert.ok(app.html['#stsc_error_help_results'].includes('<dt>'+label+'</dt>'));
    app.event('input','#stsc_error_help_search','检查更新');
    assert.ok(app.html['#stsc_error_help_results'].includes('data-help-id="47"'));
    app.event('input','#stsc_error_help_search','稍后重试');
    assert.ok(app.html['#stsc_error_help_results'].includes('没有匹配的标题'));
    app.dialogAction('show-all-error-help');
    assert.equal((app.html['#stsc_error_help_results'].match(/data-help-id=/g)||[]).length,52);
    assert.equal(app.run('JSON.stringify(normalizeSettings())'),before);
    assert.equal(app.requestBodies.length,0);
});

test('view button opens exact stored entry, multiple causes, and unknown legacy help safely', () => {
    const app=plugin();
    app.run(`normalizeSettings().logs=[{id:'matched',level:'warning',helpIds:[7]}, {id:'multi',level:'error',helpIds:[23,34]}, {id:'unknown',level:'error',stage:'unknown',message:'UNKNOWN'}, {id:'xss',level:'warning',stage:'unknown',message:'<img src=x>'}];`);
    app.dialogAction('view-log-help',{'log-id':'matched'});
    assert.match(app.html['#stsc_error_help_results'],/data-help-id="7" open/);
    assert.equal((app.html['#stsc_error_help_results'].match(/data-help-id=/g)||[]).length,1);
    app.dialogAction('view-log-help',{'log-id':'multi'});
    assert.equal((app.html['#stsc_error_help_results'].match(/data-help-id=/g)||[]).length,2);
    assert.ok(app.html['#stsc_error_help_results'].includes('data-help-id="23"'));
    assert.ok(app.html['#stsc_error_help_results'].includes('data-help-id="34"'));
    app.dialogAction('view-log-help',{'log-id':'unknown'});
    assert.ok(app.html['#stsc_dialog_body'].includes('无法精确匹配'));
    app.dialogAction('view-log-help',{'log-id':'removed'});
    assert.ok(app.html['#stsc_dialog_body'].includes('日志已不存在'));
    app.dialogAction('return-to-logs');
    assert.ok(app.html['#stsc_dialog_body'].includes('&lt;img'));
    assert.ok(!app.html['#stsc_dialog_body'].includes('<img'));
    assert.equal(app.run('errorHelpState'),null);
    assert.equal(app.run('normalizeSettings().logs.length'),4);
});

test('new logs save safe help IDs before compacting/truncation; result mapping keeps source of warning', () => {
    const app=plugin();
    app.run(`addRuntimeLog('warning','自检API','TEST_MESSAGE','TEST_HANDLING',[23,34,999]);`);
    assert.equal(app.run('JSON.stringify(normalizeSettings().logs[0].helpIds)'),'[23,34]');
    app.run(`addGenerationResultLog({mode:'dual_api',status:'format_error',answeredCount:2,expectedCount:2,formatIssues:['酒馆主API意外重复输出了自检内容，插件已自动移除。']},'正文');`);
    assert.equal(app.run('JSON.stringify(normalizeSettings().logs[0].helpIds)'),'[7]');
    app.run(`addGenerationResultLog({mode:'dual_api',status:'dual_ok',answeredCount:2,expectedCount:2,formatIssues:[],previousReview:{status:'content_missing'}},'正文');`);
    assert.equal(app.run('JSON.stringify(normalizeSettings().logs[0].helpIds)'),'[11]');
    assert.ok(app.run('runtimeLogHtml(normalizeSettings().logs[0])').includes('view-log-help'));
});

function assertNoPresetSources(text) {
    assert.ok(!/<source\b/i.test(text));
    for (const label of ['默认通用自检_SOURCE_GENERAL','角色自检预设_SOURCE_CHARACTER','通用自检预设-','角色自检预设-']) {
        assert.ok(!text.includes(label), 'model prompt must omit generated provenance: '+label);
    }
}

test('question serialization omits preset source metadata but preserves task text, numbering and requirements', () => {
    const app=promptSourceApp();
    const before=app.run('JSON.stringify(questions)');
    const xml=app.run('buildQuestionXml(questions)');
    assertNoPresetSources(xml);
    assert.ok(xml.includes('<question id="q1" index="1" evidence_required="true">'));
    assert.ok(xml.includes('<question id="q2" index="2" evidence_required="false">'));
    assert.ok(xml.includes('<text>本轮是否替用户做决定？</text>'));
    assert.ok(xml.includes('<required_fields>answer,evidence</required_fields>'));
    assert.ok(xml.includes('<required_fields>answer</required_fields>'));
    assert.ok(xml.includes('<type>'));
    assert.ok(xml.includes('<length>'));
    assert.equal(app.run('JSON.stringify(questions)'),before);
    assertNoPresetSources(app.run('buildSinglePrompt(questions)'));
});

test('single API prompt asks for visible final answers before unchanged story formatting, not internal reasoning', () => {
    const app = promptSourceApp();
    const prompt = app.run('buildSinglePrompt(questions)');
    for (const rule of ['自检答案 → 正文', '不能只在内部完成检查后直接输出正文',
        '正文应落实这些结论', '不要求展示内部推理', '先按原规则完整闭合',
        'think/thinking/reasoning/analysis', '正文保留原有格式', '不加入说明文字或代码围栏']) {
        assert.ok(prompt.includes(rule), rule);
    }
    assert.ok(!prompt.includes('输出任何角色扮演正文、对白、动作描写、状态栏、HTML、XML'));
    assert.ok(!prompt.includes('无需依据：<item'));
    assert.ok(!prompt.includes('需要依据：<item'));
    assertNoPresetSources(prompt);
    assert.equal(app.requestBodies.length, 0);
});

test('single API template matches every actual item ID and evidence flag for one, six and many questions', () => {
    const app = plugin();
    for (const count of [1, 6, 32]) for (const evidenceMode of ['none', 'all', 'mixed']) {
        app.run(`templateQuestions = Array.from({length:${count}}, (_,i) => ({
            ...createQuestion('题目'+(i+1),'open','standard',false),
            id:'saved-id-'+(100+i), source:'SHOULD_NOT_BE_SENT',
            requireEvidence:${evidenceMode === 'all' ? 'true' : evidenceMode === 'mixed' ? 'i%2===0' : 'false'}
        }));`);
        const prompt = app.run('buildSinglePrompt(templateQuestions)');
        const template = prompt.match(/^<stsc_self_check>\n[\s\S]*?^<\/stsc_self_check>/m)?.[0];
        assert.ok(template);
        assert.equal((template.match(/<item\b/g) || []).length, count);
        for (let i = 0; i < count; i++) {
            const item = template.match(new RegExp('<item id="q' + (i + 1) + '">([\\s\\S]*?)</item>'))?.[1];
            assert.ok(item);
            assert.equal(item.includes('<evidence>'), evidenceMode === 'all' || (evidenceMode === 'mixed' && i % 2 === 0));
        }
        assert.ok(prompt.includes('全部' + count + '题'));
        assert.ok(!prompt.includes('saved-id-'));
        assert.ok(!prompt.includes('SHOULD_NOT_BE_SENT'));
        assert.ok(!template.includes('id="q' + (count + 1) + '"'));
        assert.ok(prompt.indexOf('本轮问题：') < prompt.indexOf('自检格式模板'));
        assert.ok(prompt.endsWith('正文保留原有格式，不套用新的插件标签。'));
    }
});

test('compact single questions preserve exact text, type, length, order and evidence without mutating saved questions', () => {
    const app = plugin();
    app.run(`singleQuestions = ['brief','standard','detailed'].flatMap(length => [false,true].map(requireEvidence => ({
        ...createQuestion('原文 & <tag> "引号"\\n第二行',requireEvidence?'boolean':'open',length,requireEvidence),
        source:'PRIVATE_PRESET_NAME'
    })));`);
    const before = app.run('JSON.stringify(singleQuestions)');
    const prompt = app.run('buildSinglePrompt(singleQuestions)');
    for (let i = 0; i < 6; i++) {
        const question = prompt.match(new RegExp('<question id="q' + (i + 1) + '"[^>]*>[\\s\\S]*?</question>'))?.[0];
        assert.ok(question);
        assert.ok(question.includes('type="' + (i % 2 ? 'boolean' : 'open') + '"'));
        assert.ok(question.includes('evidence_required="' + Boolean(i % 2) + '"'));
        assert.ok(question.includes(app.run('escapeXml(singleQuestions[' + i + '].text)')));
        assert.ok(question.includes('<length>' + app.run('lengthInstruction(singleQuestions[' + i + '].length)') + '</length>'));
    }
    for (const rule of ['answer以“是”或“否”开头', '不得只写“已注意”“会遵守”', '同一item内必须另写非空evidence']) {
        assert.ok(prompt.includes(rule));
    }
    assert.ok(!prompt.includes('<required_fields>'), 'shared field rules should not be repeated in each single-call question');
    assert.ok(!prompt.includes('PRIVATE_PRESET_NAME'));
    assert.equal(app.run('JSON.stringify(singleQuestions)'), before);
});

test('single answer template stays compatible with existing parser and preserves roleplay body formatting', () => {
    const app = promptSourceApp();
    app.run(`singlePrompt = buildSinglePrompt(questions);
        template = singlePrompt.match(/^<stsc_self_check>\\n[\\s\\S]*?^<\\/stsc_self_check>/m)[0];
        answerText = template.replaceAll('本题的具体结论','本轮不替用户做决定，保持角色边界。')
            .replaceAll('支持本题结论的具体依据','用户本轮只提出问题，未选择行动。');
        storyText = '<content><div class="story">正文 & 原有HTML</div></content>\\n<status>状态栏</status>\\n\\x60\\x60\\x60html\\n<div>保留正文代码块</div>\\n\\x60\\x60\\x60';
        singleParsed = parseModelOutput(answerText + '\\n' + storyText, questions);`);
    assert.equal(app.run('singleParsed.status'), 'ok');
    assert.equal(app.run('singleParsed.answers.filter(answer => answer.answer.trim()).length'), 2);
    assert.equal(app.run('singleParsed.body.trim()'), app.run('storyText'));
    assert.equal(app.run('singleParsed.formatIssues.length'), 0);
    assert.equal(app.run('singleParsed.answers[0].source'), app.run('questions[0].source'));
});

test('optimized single and fallback injection keep saved position/role, one prompt and no added API calls', async () => {
    for (const mode of ['single', 'dual_api']) for (const customPosition of [false, true]) {
        const app = promptSourceApp();
        app.run(`editDraft.mode=${JSON.stringify(mode)};
            editDraft.injection=${customPosition ? "{position:'chat',depth:3,role:'user'}" : "{position:'before',depth:0,role:'system'}"};
            ctx().extensionSettings[STSC_MODULE]=clone(editDraft);
            captured=[];secondaryCalls=0;ctx().setExtensionPrompt=(...args)=>captured.push(args);
            callDualApiSelfCheck=async()=>{secondaryCalls++;throw new Error('TEST_FAILURE')};`);
        await app.run('sillyTavernSelfCheckInterceptor([],10000,()=>{throw new Error("unexpected abort")},"normal")');
        assert.equal(app.run('pendingRun.mode'), 'single');
        assert.equal(app.run('secondaryCalls'), mode === 'dual_api' ? 1 : 0);
        assert.equal(app.run('captured.filter(args=>args[0]==="stsc_main" && args[1]).length'), 1);
        assert.equal(app.run('captured.find(args=>args[0]==="stsc_main" && args[1])[1]'), app.run('buildSinglePrompt(questions)'));
        assert.equal(app.run('captured.find(args=>args[0]==="stsc_main" && args[1])[2]'), customPosition ? 1 : 2);
        assert.equal(app.run('captured.find(args=>args[0]==="stsc_main" && args[1])[3]'), customPosition ? 3 : 0);
        assert.equal(app.run('captured.find(args=>args[0]==="stsc_main" && args[1])[5]'), customPosition ? 1 : 0);
        assert.equal(app.requestBodies.length, 0);
    }
});

for (const transform of [false,true]) for (const compact of [false,true]) {
    test(`actual secondary API request omits preset metadata: strong=${transform}, compact=${compact}`, async () => {
        const app=promptSourceApp();
        app.run(`editDraft.dualApi.transformFormat=${transform};
            ctx().name1='用户本人';ctx().powerUserSettings={persona_description:'真实用户身份'};`);
        const sent=[];
        app.scope.fetch=async (_url,options)=>{
            sent.push(JSON.parse(options.body));
            return new Response(JSON.stringify({choices:[{message:{content:'<stsc_self_check><item id="q1"><answer>不得替用户行动。</answer><evidence>本轮未选择。</evidence></item><item id="q2"><answer>平静回应。</answer></item></stsc_self_check>'}}]}));
        };
        await app.run(`callDualApiSelfCheck({chat:[],questions,references:[],temporaryInstructions:[],settings:editDraft},{compact:${compact}})`);
        assert.equal(sent.length,1);
        const text=sent[0].messages.map(message=>message.content).join('\n');
        assertNoPresetSources(text);
        for(const value of ['本轮是否替用户做决定？','角色本轮应如何回应？','真实角色设定','真实用户身份','<stsc_self_check>','evidence_required="true"']) assert.ok(text.includes(value));
    });
}

test('both primary API injection formats ignore provenance while internal result sources remain available', () => {
    const app=promptSourceApp();
    for(const fn of ['buildDualApiRawInjection','buildDualApiContractInjection']) {
        const text=app.run(`${fn}(questions,parsed)`);
        assertNoPresetSources(text);
        assert.ok(text.includes('不得替用户做决定。'));
        assert.ok(text.includes('用户没有选择行动。'));
        app.run('differentSources=questions.map(question=>({...question,source:"SHOULD_NEVER_APPEAR"}))');
        assert.equal(app.run(`${fn}(differentSources,parsed)`),text);
    }
    app.run('captured=[];ctx().setExtensionPrompt=(...args)=>captured.push(args)');
    for(const strong of [false,true]) {
        app.run(`editDraft.dualApi.transformFormat=${strong};applyDualApiMainPrompt(questions,parsed,'',editDraft)`);
        assertNoPresetSources(app.run('captured.at(-1)[1]'));
        assert.equal(app.run('captured.at(-1)[5]'),strong?0:2,'system vs assistant role unchanged');
    }
    assert.equal(app.run('parsed.answers[0].source'),'通用自检预设-默认通用自检_SOURCE_GENERAL');
    assert.equal(app.run('parsed.answers[1].source'),'角色自检预设-角色自检预设_SOURCE_CHARACTER');
});

test('actual single API and dual-to-single fallback prompts both omit preset provenance', async () => {
    for(const mode of ['single','dual_api']) {
        const app=promptSourceApp();
        app.run(`editDraft.mode=${JSON.stringify(mode)};
            ctx().extensionSettings[STSC_MODULE]=clone(editDraft);
            captured=[];ctx().setExtensionPrompt=(...args)=>captured.push(args);
            callDualApiSelfCheck=async()=>{throw new Error('TEST_FAILURE')};`);
        await app.run('sillyTavernSelfCheckInterceptor([],10000,()=>{throw new Error("unexpected abort")},"normal")');
        const prompt=app.run('captured.find(args=>args[0]==="stsc_main")[1]');
        assertNoPresetSources(prompt);
        assert.ok(prompt.includes('本轮是否替用户做决定？'));
        assert.ok(prompt.includes('角色本轮应如何回应？'));
        assert.equal(app.run('pendingRun.mode'),'single');
    }
});

test('review omits provenance while UI/preset exports retain metadata without keyword-scrubbing real content', () => {
    const app=promptSourceApp();
    app.run(`reviewFixture={latest:{answers:parsed.answers},output:'上一轮真实正文'};
        reviewPrompt=buildPreviousReviewRequest(editDraft,{source:reviewFixture});`);
    assertNoPresetSources(app.run('reviewPrompt'));
    assert.ok(app.run('reviewPrompt').includes('上一轮真实正文'));
    assert.ok(app.run('reviewPrompt').includes('不得替用户做决定。'));
    app.run(`authored=[{...questions[0],text:'请解释“默认通用自检”和 <source> 是什么意思。'}];`);
    assert.ok(app.run('buildQuestionXml(authored)').includes('请解释“默认通用自检”和 &lt;source&gt; 是什么意思。'));
    assert.ok(app.run('general.name').includes('SOURCE_GENERAL'));
    assert.ok(app.run('questions[0].source').includes('SOURCE_GENERAL'));
    assert.ok(app.run('renderAnswerCard(parsed.answers[0],0)').includes('问题来源：通用自检预设-默认通用自检_SOURCE_GENERAL'));
    assert.equal(app.run('makePresetExportPayload(general).preset.name'),'默认通用自检_SOURCE_GENERAL');
});

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

const fenceCheckFixture = '<stsc_self_check><item id="q1"><answer>不替用户选择。</answer><evidence>用户没有选择行动。</evidence></item><item id="q2"><answer>保持角色边界。</answer></item></stsc_self_check>';

test('self-check normalization does not remove body-only trailing, leading or independent code fences', () => {
    const app = plugin();
    const bodies = [
        fenceCheckFixture + '\n```html\n<div>末尾代码块</div>\n```',
        fenceCheckFixture + '\n末尾反引号不是外层围栏```',
        '```xml\n<prefix>保留前面的代码块</prefix>\n```\n' + fenceCheckFixture,
        '```xml\n<prefix>第一块</prefix>\n```\n' + fenceCheckFixture + '\n```html\n<div>第二块</div>\n```',
        '```html\n<div>' + fenceCheckFixture + '</div>\n```',
        '```javascript\nconst literal = ' + JSON.stringify(fenceCheckFixture) + ';\n```',
        '```xml\n' + fenceCheckFixture,
        '````xml\n' + fenceCheckFixture + '\n```',
        '~~~xml\n' + fenceCheckFixture + '\n~~~',
    ];
    for (const original of bodies) {
        app.scope.fenceOriginal = original;
        assert.equal(app.run('normalizeModelXmlText(fenceOriginal).source'), original);
    }
});

test('only complete whole-response XML or untyped fences are unwrapped, including longer delimiters and CRLF', () => {
    const app = plugin();
    for (const [opening, closing, newline] of [
        ['```xml', '```', '\n'], ['```', '```', '\n'], ['```XML', '```', '\r\n'],
        ['```` xml', '`````', '\n'], ['```xml', '```', '\r'],
    ]) {
        app.scope.fenceOriginal = ' \n' + opening + newline + fenceCheckFixture + newline + closing + '\n ';
        assert.equal(app.run('normalizeModelXmlText(fenceOriginal).source'), fenceCheckFixture);
    }
});

test('outer four-backtick wrapper preserves an inner triple-backtick body and escaped protocol compatibility', () => {
    const app = promptSourceApp();
    const body = '<content>正文</content>\n```html\n<div>保留内部代码块</div>\n```';
    for (const escaped of [false, true]) {
        app.scope.fenceInner = fenceCheckFixture + '\n' + body;
        const inner = escaped ? app.run('escapeXml(fenceInner)') : app.scope.fenceInner;
        app.scope.fenceOriginal = '````xml\n' + inner + '\n````';
        const parsed = app.run('parseModelOutput(fenceOriginal,questions)');
        assert.equal(parsed.status, escaped ? 'recovered' : 'ok');
        assert.equal(parsed.body, body);
        assert.equal(parsed.answers.length, 2);
        assert.equal(parsed.formatIssues.length, 0);
    }
});

test('first closing fence must finish the whole message; separate XML blocks cannot become a false outer wrapper', () => {
    const app = promptSourceApp();
    const original = '```xml\n<prefix>第一块</prefix>\n```\n' + fenceCheckFixture + '\n```\n第二块\n```';
    app.scope.fenceOriginal = original;
    assert.equal(app.run('normalizeModelXmlText(fenceOriginal).source'), original);
    assert.equal(app.run('parseModelOutput(fenceOriginal,questions).body'), original.replace(fenceCheckFixture, ''));
    app.scope.fenceOriginal = '```xml\n' + fenceCheckFixture + '\n```\n围栏后的正文';
    assert.equal(app.run('normalizeModelXmlText(fenceOriginal).source'), app.scope.fenceOriginal);
});

test('single and dual reply processing preserve trailing code fences in message and swipe without touching reasoning', async () => {
    for (const mode of ['single', 'dual_api']) {
        const app = promptSourceApp();
        const body = '<content>正文</content>\n```html\n<div>末尾代码块</div>\n```';
        app.scope.fenceCheck = fenceCheckFixture;
        app.scope.fenceBody = body;
        app.run(`ctx().extensionSettings[STSC_MODULE] = clone(editDraft);
            pendingRun = {mode:${JSON.stringify(mode)},targetMessageFloor:0,questions,
                dualCheck:fenceCheck,dualParsed:parseModelOutput(fenceCheck,questions)};
            refreshMessageDom=()=>{};saveLatestResult=async latest=>{receivedLatest=latest};
            ctx().chat=[{is_user:false,mes:fenceCheck+'\\n'+fenceBody,
                swipes:[fenceCheck+'\\n'+fenceBody],swipe_id:0,extra:{reasoning:'DO_NOT_CHANGE'}}];`);
        await app.run('handleMessageReceived(0)');
        assert.equal(app.st.chat[0].mes, body);
        assert.equal(app.st.chat[0].swipes[0], body);
        assert.equal(app.st.chat[0].extra.reasoning, 'DO_NOT_CHANGE');
        assert.equal(app.run('receivedLatest.mode'), mode);
        assert.equal(app.run('pendingRun'), null);
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

test('version/identity are formal v0.4.13; release metadata and UI stay in sync', () => {
    const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url)));
    const release = JSON.parse(readFileSync(new URL('../version.json', import.meta.url)));
    assert.equal(manifest.version, '0.4.13');
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

function referenceApp() {
    const app = plugin();
    app.run(`editDraft.references = ['a', 'b', 'c'].map(id => ({
        ...createReference(id, 'other'), id, enabled: true, scope: 'global',
        content: 'CONTENT-' + id, addToCheck: true, autoQuestion: 'QUESTION-' + id
    }));
    ctx().extensionSettings[STSC_MODULE] = clone(editDraft);
    applyTheme = clearRuntimePrompts = () => {};
    renderAll = renderReferencesTab;`);
    return app;
}

function referencePlanApp() {
    const app = referenceApp();
    app.st.characters = [{ name: '角色A', avatar: 'A.png' }, { name: '角色B', avatar: 'B.png' }, { name: '角色C', avatar: 'C.png' }];
    app.st.characterId = 0;
    app.run(`planA = createReferencePlan('A方案', ['a', 'b']);
        planB = createReferencePlan('B方案', ['b', 'c']);
        planC = createReferencePlan('C方案', ['a', 'b', 'c']);
        bindReferencePlan(planA.id);`);
    return app;
}

test('legacy libraries migrate without changing their active selection, content or order', () => {
    const app = referenceApp();
    app.run(`delete editDraft.referencePlans; delete editDraft.referencePlanBindings; delete editDraft.defaultReferencePlanId;
        editDraft.references[1].enabled = false;
        ctx().extensionSettings[STSC_MODULE] = clone(editDraft);`);
    assert.equal(app.run("getActiveReferences().map(x => x.id).join(',')"), 'a,c');
    assert.equal(app.run('normalizeSettings().referencePlans.length'), 0);
    assert.equal(app.run('normalizeSettings().defaultReferencePlanId'), '');
    assert.equal(app.run("normalizeSettings().references[1].content"), 'CONTENT-b');
});

test('reference plans support overlapping A/B/C selections and switch by stable character card identity', () => {
    const app = referencePlanApp();
    app.run('commitEditDraft({notify:false})');
    assert.equal(app.run("getActiveReferences().map(x=>x.id).join(',')"), 'a,b');
    app.st.characterId = 1;
    app.run('bindReferencePlan(planB.id); commitEditDraft({notify:false})');
    assert.equal(app.run("getActiveReferences().map(x=>x.id).join(',')"), 'b,c');
    app.st.characterId = 2;
    app.run('bindReferencePlan(planC.id); commitEditDraft({notify:false})');
    assert.equal(app.run("getActiveReferences().map(x=>x.id).join(',')"), 'a,b,c');
    app.st.characterId = 0;
    app.st.characters[0].name = '角色改名但卡未换';
    assert.equal(app.run("getActiveReferences().map(x=>x.id).join(',')"), 'a,b');
    assert.equal(app.run('normalizeSettings().references.length'), 3);
    assert.equal(app.requestBodies.length, 0);
});

test('character binding wins over default; unbound/no-character/group safely use default or legacy config', () => {
    const app = referencePlanApp();
    app.run('editDraft.defaultReferencePlanId = planB.id; commitEditDraft({notify:false})');
    assert.equal(app.run('getEffectiveReferencePlan().id'), app.run('planA.id'));
    app.st.characterId = 1;
    assert.equal(app.run('getEffectiveReferencePlan().id'), app.run('planB.id'));
    app.st.groupId = 'group1';
    assert.equal(app.run('getEffectiveReferencePlan().id'), app.run('planB.id'));
    app.st.groupId = null;
    app.st.characterId = undefined;
    assert.equal(app.run('getEffectiveReferencePlan().id'), app.run('planB.id'));
    app.run('editDraft.defaultReferencePlanId = ""; commitEditDraft({notify:false})');
    assert.equal(app.run('getEffectiveReferencePlan()'), null);
    assert.equal(app.run("getActiveReferences().map(x=>x.id).join(',')"), 'a,b,c');
});

test('empty and all-disabled bound plans mean no references, never fall back to full library', () => {
    const app = referencePlanApp();
    app.run('empty = createReferencePlan("空方案", []); bindReferencePlan(empty.id); commitEditDraft({notify:false})');
    assert.equal(app.run('getActiveReferences().length'), 0);
    app.run('bindReferencePlan(planA.id); editDraft.referencePlans.find(x=>x.id===planA.id).entries.forEach(x=>x.enabled=false); commitEditDraft({notify:false})');
    assert.equal(app.run('getActiveReferences().length'), 0);
});

test('plan enable/check/order are independent of library and other plans, shared source updates stay live', () => {
    const app = referencePlanApp();
    app.run(`editDraft.references[0].enabled = false; editDraft.references[0].scope = 'character'; editDraft.references[0].characterKey = 'character:other';
        planA.entries[1].enabled = false; planA.entries[0].addToCheck = false; commitEditDraft({notify:false});`);
    assert.equal(app.run("getActiveReferences().map(x=>x.id).join(',')"), 'a', 'explicit plan membership owns scope/enable');
    assert.equal(app.run("getActiveQuestions().filter(x=>x.id.startsWith('ref_')).length"), 0);
    assert.equal(app.run('editDraft.referencePlans.find(x=>x.id===planB.id).entries[0].enabled'), true);
    app.run(`editDraft.references[0].content = 'UPDATED'; editDraft.references[0].name = '新名称';
        editDraft.references[0].autoQuestion = '新问题'; commitEditDraft({notify:false});`);
    assert.equal(app.run('getActiveReferences()[0].content'), 'UPDATED');
    app.run('bindReferencePlan(planC.id); commitEditDraft({notify:false})');
    assert.equal(app.run('getActiveReferences()[0].name'), '新名称');
    assert.equal(app.run('getActiveReferences()[0].autoQuestion'), '新问题');
    assert.equal(app.run('Object.hasOwn(normalizeSettings().referencePlans[0].entries[0], "content")'), false);
});

test('plan ordering drives both API question lists and reference prompt order without changing library', () => {
    const app = referencePlanApp();
    app.run('renderReferencePlansDialog(planA.id)');
    app.planAction('up', 'b');
    app.planField('addToCheck', 'a', false);
    app.run('commitEditDraft({notify:false})');
    assert.equal(app.run("getActiveReferences().map(x=>x.id).join(',')"), 'b,a');
    assert.equal(app.run("normalizeSettings().references.map(x=>x.id).join(',')"), 'a,b,c');
    for (const method of ['getActiveQuestions', 'getDualApiQuestions']) {
        assert.equal(app.run(`${method}().filter(x=>x.id.startsWith('ref_')).map(x=>x.id).join(',')`), 'ref_b');
    }
    const prompt = app.run('buildDualApiReferenceContext(getActiveReferences())');
    assert.ok(prompt.indexOf('CONTENT-b') < prompt.indexOf('CONTENT-a'));
    assert.ok(!prompt.includes('CONTENT-c'));
    app.run('seenRefs=[]; setRuntimePrompt=(key, text)=>seenRefs.push(key); applyReferencePrompts(getActiveReferences())');
    assert.equal(app.run("seenRefs.join(',')"), 'stsc_ref_b,stsc_ref_a');
});

test('plan create/select/modify/bind remain draft-only until save; discard and reopen restore settings', () => {
    const app = referencePlanApp();
    assert.equal(app.run('normalizeSettings().referencePlans.length'), 0);
    assert.equal(app.run('getEffectiveReferencePlan()'), null);
    app.run('commitEditDraft({notify:false}); beginEditSession(); renderReferencePlansDialog(planB.id)');
    app.planAction('bind');
    assert.equal(app.run('getEffectiveReferencePlan().id'), app.run('planA.id'));
    app.planField('enabled', 'b', false);
    assert.equal(app.run('editDirty'), true);
    app.run('discardEditDraft(); beginEditSession()');
    assert.equal(app.run('getEffectiveReferencePlan(editDraft).id'), app.run('planA.id'));
    assert.equal(app.run('editDraft.referencePlans.find(x=>x.id===planB.id).entries[0].enabled'), true);
    app.run('bindReferencePlan(planB.id); commitEditDraft({notify:false}); beginEditSession()');
    assert.equal(app.run('getEffectiveReferencePlan().id'), app.run('planB.id'));
    assert.equal(app.run('getEffectiveReferencePlan(editDraft).id'), app.run('planB.id'));
});

test('minus removes only membership; plus de-duplicates and only adds existing references', () => {
    const app = referencePlanApp();
    const original = app.run('JSON.stringify(editDraft.references)');
    app.run('renderReferencePlansDialog(planA.id)');
    app.planAction('remove', 'a');
    assert.equal(app.run('JSON.stringify(editDraft.references)'), original);
    assert.equal(app.run('planA.entries.map(x=>x.referenceId).join(",")'), 'b');
    assert.equal(app.run('planC.entries.length'), 3);
    app.run('addReferencePlanEntries(planA, ["b","a","a","missing"])');
    assert.equal(app.run('planA.entries.map(x=>x.referenceId).join(",")'), 'b,a');
    assert.equal(app.run('JSON.stringify(editDraft.references)'), original);
});

test('deleting a plan cleans all its bindings/default without deleting any library content', () => {
    const app = referencePlanApp();
    app.st.characterId = 1;
    app.run('bindReferencePlan(planA.id); editDraft.defaultReferencePlanId=planA.id');
    const original = app.run('JSON.stringify(editDraft.references)');
    app.run('deleteReferencePlan(planA.id)');
    assert.equal(app.run('editDraft.referencePlanBindings.length'), 0);
    assert.equal(app.run('editDraft.defaultReferencePlanId'), '');
    assert.equal(app.run('editDraft.referencePlans.length'), 2);
    assert.equal(app.run('JSON.stringify(editDraft.references)'), original);
});

test('source deletion prunes stale plan entries safely; corrupted/duplicate bindings normalize deterministically', () => {
    const app = referencePlanApp();
    app.run(`editDraft.references.splice(1,1);
        editDraft.referencePlans.push(null, {...clone(planA)}, {id:'bad', name:'', entries:[null, {referenceId:'a',enabled:false}, {referenceId:'a'}, {referenceId:'missing'}]});
        editDraft.referencePlanBindings.push(null, {characterKey:'character:A.png',planId:planB.id}, {characterKey:'group:1',planId:planB.id}, {characterKey:'character:X',planId:'missing'});
        editDraft.defaultReferencePlanId='missing';
        normalizeReferencePlans(editDraft);`);
    assert.equal(app.run('editDraft.referencePlans[0].entries.map(x=>x.referenceId).join(",")'), 'a');
    assert.equal(app.run('new Set(editDraft.referencePlans.map(x=>x.id)).size'), 5);
    assert.equal(app.run('editDraft.referencePlanBindings.length'), 1);
    assert.equal(app.run('editDraft.referencePlanBindings[0].planId'), app.run('planA.id'));
    assert.equal(app.run('editDraft.referencePlans.at(-1).entries.length'), 1);
    assert.equal(app.run('editDraft.referencePlans.at(-1).entries[0].enabled'), false);
    assert.equal(app.run('editDraft.defaultReferencePlanId'), '');
});

test('plan names validate, escape markup and never become duplicated content/config exports', () => {
    const app = referencePlanApp();
    for (const name of ['', '  ', 'x'.repeat(81), 'A方案']) assert.throws(() => app.run(`createReferencePlan(${JSON.stringify(name)}, [])`));
    app.run(`special=createReferencePlan('<img src=x onerror=alert(1)>', ['a']); renderReferencePlansDialog(special.id)`);
    const html = app.html['#stsc_dialog_body'];
    assert.ok(html.includes('&lt;img'));
    assert.ok(!html.includes('<img'));
    assert.ok(!html.includes('data-reference-field="content"'));
    const payload = app.run('JSON.stringify(makeReferenceBundleExportPayload(editDraft.references))');
    assert.ok(!payload.includes('referencePlans'));
    assert.ok(!payload.includes('TEST_SECRET'));
    app.st.groupId='g';
    assert.throws(() => app.run('bindReferencePlan(special.id)'));
});

test('plan UI only lists members and picker lists only non-members; edit selection never applies a plan', () => {
    const app = referencePlanApp();
    app.run('renderReferencePlansDialog(planA.id)');
    let markup=app.html['#stsc_dialog_body'];
    assert.equal((markup.match(/data-plan-reference-id=/g)||[]).length, 2);
    assert.ok(!markup.includes('data-plan-reference-id="c"'));
    app.event('change', '#stsc_reference_plan_select', app.run('planB.id'));
    assert.equal(app.run('getEffectiveReferencePlan(editDraft).id'), app.run('planA.id'));
    app.planAction('add');
    markup=app.html['#stsc_dialog_body'];
    assert.ok(markup.includes('data-plan-pick-id="a"'));
    assert.ok(!markup.includes('data-plan-pick-id="b"'));
    assert.ok(!markup.includes('data-plan-pick-id="c"'));
});

test('reference ordering controls are visible when collapsed and disabled at list boundaries', () => {
    const app = referenceApp();
    app.run('renderReferencesTab()');
    const markup = app.html['#stsc_tab_references'];
    const cards = markup.split('data-reference-id=').slice(1);
    assert.equal(cards.length, 3);
    for (let i = 0; i < cards.length; i++) {
        const header = cards[i].split('class="stsc-reference-body"')[0];
        assert.equal(/data-action="move-reference-up"[^>]*disabled/.test(header), i === 0);
        assert.equal(/data-action="move-reference-down"[^>]*disabled/.test(header), i === 2);
        assert.ok(header.includes('aria-label="上移资料及自检问题"'));
    }
    app.run('editDraft.references.splice(1); renderReferencesTab()');
    const single = app.html['#stsc_tab_references'];
    assert.match(single, /data-action="move-reference-up"[^>]*disabled/);
    assert.match(single, /data-action="move-reference-down"[^>]*disabled/);
    app.run('editDraft.references = []; renderReferencesTab()');
    assert.ok(!app.html['#stsc_tab_references'].includes('data-action="move-reference-'));
});

test('reference reorder changes draft only, retains all fields/expanded state, saves and survives normalization', async () => {
    const app = referenceApp();
    const original = app.run('JSON.stringify(editDraft.references)');
    app.run("expandedReferenceIds.add('b')");
    await app.action('move-reference-up', 'b');
    assert.equal(app.run("editDraft.references.map(x => x.id).join(',')"), 'b,a,c');
    assert.equal(app.run("normalizeSettings().references.map(x => x.id).join(',')"), 'a,b,c');
    assert.equal(app.run("expandedReferenceIds.has('b')"), true);
    assert.equal(app.run('editDirty'), true);
    const reordered = JSON.parse(app.run('JSON.stringify(editDraft.references)'));
    assert.deepEqual(reordered, [JSON.parse(original)[1], JSON.parse(original)[0], JSON.parse(original)[2]]);
    app.run('commitEditDraft({ notify: false })');
    assert.equal(app.run("normalizeSettings().references.map(x => x.id).join(',')"), 'b,a,c');
    await app.action('move-reference-down', 'b');
    assert.equal(app.run("editDraft.references.map(x => x.id).join(',')"), 'a,b,c');
    app.run('discardEditDraft()');
    assert.equal(app.run("editDraft.references.map(x => x.id).join(',')"), 'b,a,c');
    assert.equal(app.requestBodies.length, 0);
});

test('invalid or boundary moves do not mark dirty or mutate reference data', async () => {
    const app = referenceApp();
    const before = app.run('JSON.stringify(editDraft.references)');
    for (const [action, id] of [['move-reference-up', 'a'], ['move-reference-down', 'c'], ['move-reference-up', 'missing']]) {
        await app.action(action, id);
        assert.equal(app.run('JSON.stringify(editDraft.references)'), before);
        assert.equal(app.run('editDirty'), false);
    }
});

test('single/dual self-check reference question order follows saved sorting and skips inactive entries', async () => {
    const app = referenceApp();
    await app.action('move-reference-up', 'c');
    await app.action('move-reference-up', 'c');
    app.run("editDraft.references.find(x => x.id === 'b').enabled = false; commitEditDraft({ notify: false })");
    for (const fn of ['getActiveQuestions', 'getDualApiQuestions']) {
        assert.equal(app.run(`${fn}(normalizeSettings()).filter(q => q.id.startsWith('ref_')).map(q => q.id).join(',')`), 'ref_c,ref_a');
    }
    app.run("editDraft.references.find(x => x.id === 'c').addToCheck = false; commitEditDraft({ notify: false })");
    assert.equal(app.run("getActiveQuestions().filter(q => q.id.startsWith('ref_')).map(q => q.id).join(',')"), 'ref_a');
});

test('reference bundle roundtrip preserves custom ordering', async () => {
    const app = referenceApp();
    await app.action('move-reference-down', 'a');
    const order = app.run('JSON.stringify(makeReferenceBundleExportPayload(editDraft.references))');
    app.scope.bundle = JSON.parse(order);
    const imported = app.run('validateImportedReferencePayload(bundle)');
    assert.deepEqual(Array.from(imported.references, item => item.name), ['b', 'a', 'c']);
});

function updateNoticeApp(enabled = true) {
    const app = plugin();
    app.run(`ctx().extensionSettings[STSC_MODULE] = clone(DEFAULT_SETTINGS);
        ctx().extensionSettings[STSC_MODULE].updateNotice.enabled = ${enabled};
        editDraft = clone(ctx().extensionSettings[STSC_MODULE]);
        applyTheme = renderAll = clearRuntimePrompts = () => {};`);
    return app;
}

function assertUpdateDots(app, header, menu) {
    assert.equal(app.run("shouldShowUpdateBadge('header')"), header);
    assert.equal(app.run("shouldShowUpdateBadge('menu')"), menu);
    assert.equal(app.classes.get('#stsc_version_button:has-notice'), header);
    assert.equal(app.classes.get('#stsc_extensions_menu_button:stsc-has-update'), menu);
}

test('update preference defaults on for old settings; editing checkbox stays in draft', () => {
    const app = updateNoticeApp();
    app.run('delete ctx().extensionSettings[STSC_MODULE].updateNotice.enabled');
    assert.equal(app.run('normalizeSettings().updateNotice.enabled'), true);
    app.run('renderSettingsTab()');
    assert.match(app.html['#stsc_tab_settings'], /id="stsc_update_notices_enabled"[^>]*checked/);
    app.toggleUpdateNotice(false);
    assert.equal(app.run('editDraft.updateNotice.enabled'), false);
    assert.equal(app.run('normalizeSettings().updateNotice.enabled'), true);
    assert.equal(app.run('editDirty'), true);
    assert.equal(app.requestBodies.length, 0);
});

test('enabled notices toast once per version and retain both dots after viewing/rechecking', () => {
    const app = updateNoticeApp();
    app.run("showPluginUpdateNotice('9.0.0')");
    assertUpdateDots(app, true, true);
    assert.equal(app.updateToasts.length, 1);
    app.run("markUpdateNoticeViewed('header'); markUpdateNoticeViewed('menu'); clearUpdateToast(); showPluginUpdateNotice('9.0.0')");
    assertUpdateDots(app, true, true);
    assert.equal(app.updateToasts.length, 1);
    app.run("showPluginUpdateNotice('9.0.1')");
    assert.equal(app.updateToasts.length, 2);
    assertUpdateDots(app, true, true);
});

test('silent notices acknowledge each entry independently and survive a fresh page', () => {
    const app = updateNoticeApp(false);
    app.run("showPluginUpdateNotice('9.0.0'); markUpdateNoticeViewed('menu')");
    assertUpdateDots(app, true, false);
    assert.equal(app.updateToasts.length, 0);
    const fresh = updateNoticeApp(false);
    fresh.st.extensionSettings = structuredClone(app.st.extensionSettings);
    fresh.run("editDraft = clone(normalizeSettings()); showPluginUpdateNotice('9.0.0')");
    assertUpdateDots(fresh, true, false);
    fresh.run("markUpdateNoticeViewed('header'); showPluginUpdateNotice('9.0.0')");
    assertUpdateDots(fresh, false, false);
    fresh.run("showPluginUpdateNotice('9.0.1')");
    assertUpdateDots(fresh, true, true);
    assert.equal(fresh.updateToasts.length, 0);
});

test('saving the switch clears active notification; in-flight checks respect the latest saved preference', async () => {
    const app = updateNoticeApp();
    app.run("showPluginUpdateNotice('9.0.0')");
    app.toggleUpdateNotice(false);
    assert.equal(app.clearedToasts.length, 0);
    app.run('commitEditDraft({ notify: false })');
    assert.equal(app.clearedToasts.length, 1);
    let finish;
    app.scope.fetchRemoteManifestVersion = () => new Promise(resolve => { finish = resolve; });
    app.run(`getInstalledExtensionType = async () => 'local';
        fetchOwnExtensionVersion = async () => ({ currentCommitHash: 'LOCAL', isUpToDate: false });
        fetchRemoteReleaseInfo = async () => null; addRuntimeLog = () => {};`);
    const check = app.run('checkForPluginUpdate({ force: true, userInitiated: true })');
    await tick();
    finish('9.0.1');
    await check;
    assert.equal(app.updateToasts.length, 1, 'no new automatic toast while disabled, even on manual check');
    assertUpdateDots(app, true, true);
    assert.equal(app.run('updateCheckState'), 'available', 'viewing a badge must not disable updating');
});

test('stale draft saves do not overwrite read receipts or notification deduplication metadata', () => {
    const app = updateNoticeApp(false);
    app.run("showPluginUpdateNotice('9.0.0'); markUpdateNoticeViewed('menu'); markUpdateNoticeViewed('header'); commitEditDraft({ notify: false })");
    assertUpdateDots(app, false, false);
    assert.equal(app.run('normalizeSettings().updateNotice.menuSeenVersion'), '9.0.0');
    app.toggleUpdateNotice(true);
    app.run('commitEditDraft({ notify: false })');
    assert.equal(app.updateToasts.length, 1);
    app.run("clearUpdateToast(); commitEditDraft({ notify: false }); showPluginUpdateNotice('9.0.0')");
    assert.equal(app.updateToasts.length, 1, 'saving an old draft must not re-notify same version');
    assertUpdateDots(app, true, true);
});

test('real entry handlers acknowledge only their own silent badge; manual version dialog remains available', () => {
    const app = updateNoticeApp(false);
    app.run(`opened = []; openManager = tab => opened.push(tab);
        renderUpdatesTab = () => {}; openDialog = title => opened.push(title);
        showPluginUpdateNotice('9.0.0'); openManagerFromMenu();`);
    assertUpdateDots(app, true, false);
    app.event('click', '#stsc_version_button', '');
    assertUpdateDots(app, false, false);
    assert.equal(app.run('JSON.stringify(opened)'), '["status","版本更新"]');
    assert.equal(app.updateToasts.length, 0);
});

test('no update leaves no badges; stable Git-only updates can be acknowledged without version metadata', () => {
    const app = updateNoticeApp(false);
    app.run('showPluginUpdateNotice(STSC_VERSION)');
    assertUpdateDots(app, false, false);
    app.run("showPluginUpdateNotice('', null, { gitOnly: true })");
    assertUpdateDots(app, true, true);
    app.run("markUpdateNoticeViewed('header'); markUpdateNoticeViewed('menu'); showPluginUpdateNotice('', null, { gitOnly: true })");
    assertUpdateDots(app, false, false);
    assert.equal(app.updateToasts.length, 0);
    app.run("showPluginUpdateNotice('9.0.0'); clearPluginUpdateNotice()");
    assertUpdateDots(app, false, false);
});

test('a closed older toast cannot clear a newer toast and checking before an update does not mark it read', () => {
    const app = updateNoticeApp();
    app.run("showPluginUpdateNotice('9.0.0'); showPluginUpdateNotice('9.0.1')");
    app.updateToasts[0].options.onHidden();
    assert.equal(app.run('updateToast'), app.updateToasts[1]);
    const silent = updateNoticeApp(false);
    silent.run("markUpdateNoticeViewed('header'); markUpdateNoticeViewed('menu'); showPluginUpdateNotice('9.0.0')");
    assertUpdateDots(silent, true, true);
});

test('preset picker keeps native fallback, type filtering and escaped names without Select2', () => {
    const app = plugin();
    app.run(`editDraft.presets = [
        { id: 'g', name: '通用一', kind: 'general', questions: [], enabled: true },
        { id: 'c1', name: '<img src=x>', kind: 'character', questions: [], enabled: true }
    ]; editDraft.ui.presetSection = 'character'; renderPresetsTab();`);
    let html = app.html['#stsc_tab_presets'];
    assert.ok(html.includes('id="stsc_character_preset_select"'));
    assert.ok(html.includes('aria-label="角色预设，可输入名称搜索"'));
    assert.ok(html.includes('&lt;img src=x&gt;'));
    assert.ok(!html.includes('<img src=x>'));
    assert.ok(!html.includes('<option value="g"'));
    app.run("editDraft.ui.presetSection = 'general'; renderPresetsTab()");
    html = app.html['#stsc_tab_presets'];
    assert.ok(html.includes('id="stsc_general_preset_select"'));
    assert.ok(!html.includes('<option value="c1"'));
    assert.equal(app.requestBodies.length, 0);
});

test('preset selection retains binding/activation and the existing unsaved-change guard', () => {
    const app = plugin();
    app.run(`editDraft.presets = [
        { id: 'c1', name: '同名', kind: 'character', questions: [], boundCharacterKey: '' },
        { id: 'c2', name: '同名', kind: 'character', questions: [], boundCharacterKey: '' }
    ]; editDraft.ui.presetSection = 'character'; editDraft.ui.editingCharacterPresetId = 'c1';`);
    app.event('change', '#stsc_character_preset_select', 'c2');
    assert.equal(app.run('editDraft.ui.editingCharacterPresetId'), 'c2');
    assert.equal(app.run("editDraft.presets.every(p => !p.boundCharacterKey)"), true);
    assert.equal(app.run('editDirty'), false);
    app.run('editDirty = true; openDialog = () => {}');
    app.event('change', '#stsc_character_preset_select', 'c1');
    assert.equal(app.run('editDraft.ui.editingCharacterPresetId'), 'c2');
    assert.equal(app.run('typeof pendingUnsavedAction'), 'function');
    assert.equal(app.requestBodies.length, 0);
});

test('review content filter defaults off and respects UI draft, save, discard and disabled state', () => {
    const app = plugin();
    assert.equal(app.run('normalizeSettings().dualApi.reviewContentOnly'), false);
    app.run('renderSettingsTab()');
    assert.match(app.html['#stsc_tab_settings'], /id="stsc_review_content_only"[^>]*disabled/);
    app.event('change', '#stsc_previous_review', true);
    assert.doesNotMatch(app.html['#stsc_tab_settings'], /id="stsc_review_content_only"[^>]*disabled/);
    app.event('change', '#stsc_review_content_only', true);
    assert.equal(app.run('editDirty'), true);
    assert.equal(app.run('normalizeSettings().dualApi.reviewContentOnly'), false);
    app.run('applyTheme = renderAll = clearRuntimePrompts = () => {}; commitEditDraft({ notify: false })');
    assert.equal(app.run('normalizeSettings().dualApi.reviewContentOnly'), true);
    app.event('change', '#stsc_review_content_only', false);
    app.run('discardEditDraft()');
    assert.equal(app.run('editDraft.dualApi.reviewContentOnly'), true);
    assert.equal(app.requestBodies.length, 0);
});

test('review extraction only accepts complete content blocks, preserving order and inner markup', () => {
    const app = plugin();
    const samples = [
        ['外部<content>正文\n第二行</content><status>秘密</status>', '正文\n第二行'],
        ['<CONTENT class="story">一</CONTENT>外部<content>二</content>', '一\n\n二'],
        ['<content><b>正文</b><content>内层</content>结尾</content>外部', '<b>正文</b><content>内层</content>结尾'],
        ['<content> </content>', ''], ['<content>未闭合', ''],
        ['&lt;content&gt;伪标签&lt;/content&gt;', ''],
        ['<content-extra>不是正文</content-extra>', ''],
        ['<content>完整</content><content>未闭合外部', '完整'],
        ['</content>外部<content>正文</content>', '正文'],
    ];
    for (const [input, expected] of samples) {
        assert.equal(app.run(`extractReviewContent(${JSON.stringify(input)})`), expected);
    }
});

function reviewApp() {
    const app = plugin();
    app.run(`testSettings = clone(DEFAULT_SETTINGS); testSettings.mode = 'dual_api';
        testSettings.dualApi.previousReview = true;
        testSettings.dualApi.reviewContentOnly = true;
        ctx().chatId = 'chat-a';
        ctx().chat = [
            { is_user: false, name: '角色', send_date: 'old', mes: 'OLDER_HISTORY' },
            { is_user: true, mes: '用户上一轮' },
            { is_user: false, name: '角色', send_date: 'unique-last', extra: { reasoning: 'PRIVATE_THOUGHT' },
              mes: '<think>OUTSIDE_THOUGHT</think><content>STORY_ONE</content><status>OUTSIDE_STATUS</status><content>STORY_TWO</content>' },
            { is_user: true, mes: 'USER_CURRENT' }
        ];
        ctx().chatMetadata = { [STSC_CHAT_META_KEY]: {
            mode: 'dual_api', chatId: 'chat-a', messageId: 2,
            answers: [{ question: 'QUESTION', answer: 'ANSWER', evidence: 'EVIDENCE' }]
        } };
        getDualApiCharacterContext = () => 'CHARACTER'; selectedRepairDirectives = () => [];
        outgoing = ctx().chat.map(m => ({ ...m }));`);
    return app;
}

test('review filter covers review text and duplicate history in normal and compact requests', () => {
    const app = reviewApp();
    const original = app.run('JSON.stringify(ctx().chat)');
    for (const compact of [false, true]) {
        const messages = JSON.parse(app.run(`JSON.stringify(buildDualApiMessages(outgoing, [], [], [], testSettings, { compact: ${compact} }))`));
        const payload = JSON.stringify(messages);
        for (const value of ['STORY_ONE', 'STORY_TWO', 'QUESTION', 'ANSWER', 'EVIDENCE', 'OLDER_HISTORY', 'USER_CURRENT']) assert.ok(payload.includes(value), value);
        for (const value of ['OUTSIDE_THOUGHT', 'OUTSIDE_STATUS', 'PRIVATE_THOUGHT']) assert.ok(!payload.includes(value), value);
        assert.equal(messages.find(m => m.role === 'assistant' && m.content.includes('STORY_ONE')).content, 'STORY_ONE\n\nSTORY_TWO');
    }
    assert.equal(app.run('JSON.stringify(ctx().chat)'), original, 'do not rewrite saved chat');
    assert.equal(app.run('JSON.stringify(outgoing)'), original, 'do not rewrite main API outgoing chat');
    app.run('testSettings.dualApi.reviewContentOnly = false');
    const full = app.run('JSON.stringify(buildDualApiMessages(outgoing, [], [], [], testSettings))');
    assert.ok(full.includes('OUTSIDE_STATUS'));
    assert.ok(full.includes('OUTSIDE_THOUGHT'));
});

test('review filtering matches regex-processed and deep-copied history without changing user messages', () => {
    const app = reviewApp();
    app.run(`outgoing[2].mes = '<think>REGEX_THOUGHT</think><content>PROCESSED_STORY</content><status>REGEX_STATUS</status>';
        outgoing[3].mes = ctx().chat[2].mes;`);
    for (const deepCopy of [false, true]) {
        if (deepCopy) app.run('outgoing = clone(outgoing)');
        const rows = JSON.parse(app.run('JSON.stringify(filterReviewChat(outgoing, getReviewSource(testSettings)))'));
        assert.equal(rows[2].mes, 'PROCESSED_STORY');
        assert.equal(rows[3].mes, app.st.chat[2].mes);
        assert.equal(rows[0].mes, 'OLDER_HISTORY');
    }
    app.run("outgoing[2].mes = 'TAGS_REMOVED_BY_REGEX'");
    assert.ok(!app.run('JSON.stringify(filterReviewChat(outgoing, getReviewSource(testSettings))[2])').includes('TAGS_REMOVED_BY_REGEX'));
});

test('review filter does not activate without a valid enabled same-chat dual API review', () => {
    const app = reviewApp();
    for (const setup of [
        'testSettings.dualApi.previousReview = false',
        "testSettings.dualApi.previousReview = true; ctx().chatMetadata[STSC_CHAT_META_KEY].chatId = 'other'",
        "ctx().chatMetadata[STSC_CHAT_META_KEY].chatId = 'chat-a'; ctx().chatMetadata[STSC_CHAT_META_KEY].mode = 'single'",
    ]) {
        app.run(setup);
        assert.equal(app.run('buildPreviousReviewRequest(testSettings)'), '');
        assert.ok(app.run('JSON.stringify(buildDualApiMessages(outgoing, [], [], [], testSettings))').includes('OUTSIDE_STATUS'));
    }
});

test('missing content skips review without full-text fallback, extra retry or blocking self-check', async () => {
    const app = reviewApp();
    app.run(`ctx().chat[2].mes = '<status>NO_STORY_SECRET</status>'; outgoing = ctx().chat.map(m => ({ ...m }));`);
    assert.equal(app.run('buildPreviousReviewRequest(testSettings)'), '');
    const payload = app.run('JSON.stringify(buildDualApiMessages(outgoing, [], [], [], testSettings))');
    assert.ok(!payload.includes('NO_STORY_SECRET'));
    assert.ok(!payload.includes('必须先完整输出 <stsc_previous_review>'));
    app.run(`normalizeSettings = () => testSettings;
        getActiveQuestions = getDualApiQuestions = () => [{ id: 'q1', text: '问题', requireEvidence: false }];
        getActiveReferences = getSelectedTemporaryInstructions = () => [];
        clearRuntimePrompts = applyReferencePrompts = applyTemporaryPrompt = applyDualApiMainPrompt = () => {};
        calls = 0; callDualApiSelfCheck = async () => {
            calls++;
            return { text: '<stsc_self_check><item id="q1"><answer>结论</answer></item></stsc_self_check>', attempts: 1 };
        };`);
    await app.run('sillyTavernSelfCheckInterceptor(outgoing, 10000, () => { throw new Error("must not abort"); }, "normal")');
    assert.equal(app.run('calls'), 1);
    assert.equal(app.run('pendingRun.previousReview.status'), 'content_missing');
    app.run('ctx().chatMetadata[STSC_CHAT_META_KEY].previousReview = pendingRun.previousReview; renderFloatingReviewPage()');
    assert.ok(app.html['#stsc_floating_content'].includes('本轮跳过复盘'));
    assert.ok(!app.html['#stsc_floating_content'].includes('上一轮未发现明显问题'));
});

test('dual API carries the active user persona in single/group chats, every history scope and compact retry', () => {
    const app = plugin();
    app.st.name1 = '用户甲';
    app.st.name2 = '角色乙';
    app.st.powerUserSettings = {
        persona_description: 'ACTIVE_USER_PROFILE', persona_description_position: 0,
        persona_descriptions: { other: { description: 'UNSELECTED_PROFILE' } },
    };
    const before = JSON.stringify(app.st.powerUserSettings);
    for (const groupId of [null, 'group-a']) {
        app.st.groupId = groupId;
        for (const mode of ['recent5', 'custom', 'all']) {
            app.run(`editDraft.dualApi.contextMode = '${mode}'`);
            for (const compact of [false, true]) {
                const messages = JSON.parse(app.run(`JSON.stringify(buildDualApiMessages([], [], [], [], editDraft, { compact: ${compact} }))`));
                assert.ok(messages[0].content.includes('【当前用户身份设定（User / Persona）】'));
                assert.ok(messages[0].content.includes('用户甲'));
                assert.ok(messages[0].content.includes('ACTIVE_USER_PROFILE'));
                assert.ok(!JSON.stringify(messages).includes('UNSELECTED_PROFILE'));
            }
        }
    }
    assert.equal(JSON.stringify(app.st.powerUserSettings), before, 'identity remains read-only');
});

test('persona switches and cleared descriptions are read fresh, not cached or revived from the library', () => {
    const app = plugin();
    app.st.name1 = 'FIRST_NAME';
    app.st.powerUserSettings = { persona_description: 'FIRST_PROFILE' };
    assert.ok(app.run('getDualApiUserContext()').includes('FIRST_PROFILE'));
    app.st.name1 = 'SECOND_NAME';
    app.st.powerUserSettings.persona_description = 'SECOND_PROFILE';
    const next = app.run('JSON.stringify(buildDualApiMessages([], [], [], [], editDraft))');
    assert.ok(next.includes('SECOND_NAME'));
    assert.ok(next.includes('SECOND_PROFILE'));
    assert.ok(!next.includes('FIRST_'));
    app.st.powerUserSettings.persona_description = '';
    app.st.getCharacterCardFields = () => { throw new Error('must not replace explicitly empty persona'); };
    const empty = app.run('getDualApiUserContext()');
    assert.ok(empty.includes('SECOND_NAME'));
    assert.ok(empty.includes('没有可读取'));
    assert.ok(!empty.includes('SECOND_PROFILE'));
});

test('persona opt-out is respected without consulting the fallback or macro resolver', () => {
    const app = plugin();
    app.st.name1 = 'USERNAME';
    app.st.getCharacterCardFields = app.st.substituteParams = () => { throw new Error('opt-out must not read'); };
    for (const position of [9, '9']) {
        app.st.powerUserSettings = { persona_description_position: position, persona_description: 'DO_NOT_SEND' };
        const text = app.run('JSON.stringify(buildDualApiMessages([], [], [], [], editDraft))');
        assert.ok(!text.includes('DO_NOT_SEND'));
        assert.ok(text.includes('不发送'));
    }
    for (const position of [0, 1, 2, 3, 4]) {
        app.st.powerUserSettings.persona_description_position = position;
        assert.ok(app.run('getDualApiUserContext()').includes('DO_NOT_SEND'), 'all enabled injection positions are supported');
    }
});

test('persona macros use the host substitution API once, preserving raw text on resolver failure', () => {
    const app = plugin();
    app.st.name1 = '用户甲'; app.st.name2 = '角色乙';
    app.st.powerUserSettings = { persona_description: '{{user}}认识{{char}}。' };
    let calls = 0;
    app.st.substituteParams = (text, user, char, original, group, replaceCard) => {
        calls++;
        assert.equal(replaceCard, false);
        return text.replace('{{user}}', user).replace('{{char}}', char);
    };
    assert.ok(app.run('getDualApiUserContext()').includes('用户甲认识角色乙。'));
    assert.equal(calls, 1);
    app.st.substituteParams = () => { throw new Error('unsupported macro'); };
    assert.ok(app.run('getDualApiUserContext()').includes('{{user}}认识{{char}}。'));
});

test('persona getter fallback supports missing context fields without aborting self-check', () => {
    const app = plugin();
    app.st.getCharacterCardFields = () => ({ persona: 'FALLBACK_PROFILE' });
    assert.ok(app.run('getDualApiUserContext()').includes('FALLBACK_PROFILE'));
    app.st.getCharacterCardFields = () => { throw new Error('old host'); };
    assert.ok(app.run('getDualApiUserContext()').includes('没有可读取'));
    delete app.st.getCharacterCardFields;
    assert.ok(!app.run('getDualApiUserContext()').includes('undefined'));
    app.run('SillyTavern.getContext = () => null');
    assert.ok(app.run('getDualApiUserContext()').includes('未读取到'));
});

test('long persona is full in normal requests and retains head/tail in compact retry', () => {
    const app = plugin();
    const description = 'PROFILE_START' + '字'.repeat(18000) + 'PROFILE_END';
    app.st.powerUserSettings = { persona_description: description };
    assert.ok(app.run('getDualApiUserContext()').includes(description));
    const compact = app.run('getDualApiUserContext({ compact: true })');
    assert.ok(compact.includes('PROFILE_START') && compact.includes('PROFILE_END'));
    assert.ok(compact.includes('精简重试已省略中段'));
    assert.ok(compact.length < 12300);
    assert.equal(app.st.powerUserSettings.persona_description, description);
});

test('generation sends active persona to the configured secondary API; connection test still sends no persona', async () => {
    const app = plugin();
    app.st.name1 = 'PRIVATE_USER_NAME';
    app.st.powerUserSettings = { persona_description: 'PRIVATE_USER_PROFILE' };
    const bodies = [];
    app.scope.fetch = async (_url, options) => {
        bodies.push(JSON.parse(options.body));
        return new Response(JSON.stringify({ choices: [{ message: { content: 'OK' } }] }));
    };
    await app.run('callDualApiSelfCheck({ chat: [], questions: [], references: [], temporaryInstructions: [], settings: editDraft })');
    assert.ok(JSON.stringify(bodies[0].messages).includes('PRIVATE_USER_PROFILE'));
    await app.run('testDualApiConnection()');
    assert.deepEqual(bodies[1].messages, [{ role: 'user', content: 'Reply with OK only.' }]);
    assert.ok(!JSON.stringify(app.notices).includes('PRIVATE_USER'));
    assert.ok(!app.run('JSON.stringify(normalizeSettings().logs)').includes('PRIVATE_USER'));
});

function profileApp() {
    const app = plugin();
    app.run(`ctx().extensionSettings[STSC_MODULE] = clone(editDraft);
        applyTheme = renderAll = clearRuntimePrompts = () => {}; beginEditSession();`);
    return app;
}

test('API profile migration preserves old connection once and survives a new editing session', () => {
    const app = profileApp();
    const id = app.run('editDraft.activeApiProfileId');
    assert.ok(id);
    assert.equal(app.run('editDraft.apiProfiles.length'), 1);
    assert.equal(app.run('editDraft.apiProfiles[0].name'), '原有API配置');
    assert.equal(app.run('editDraft.apiProfiles[0].config.apiKey'), 'TEST_SECRET');
    app.run('normalizeSettings(); normalizeSettings(); beginEditSession()');
    assert.equal(app.run('editDraft.activeApiProfileId'), id);
    assert.equal(app.run('editDraft.apiProfiles.length'), 1);
    assert.equal(app.requestBodies.length, 0);
});

test('API profiles restore independent same-provider keys, models and parameters while global options stay put', () => {
    const app = profileApp();
    app.run(`firstId = editDraft.activeApiProfileId;
        editDraft.dualApi.apiKey = 'KEY_B'; editDraft.dualApi.endpoint = 'https://b.example/v1';
        editDraft.dualApi.model = 'model-b'; editDraft.dualApi.temperature = '0'; editDraft.dualApi.maxTokens = 4096;
        secondId = createApiProfile('备用').id;
        editDraft.dualApi.contextMode = 'all'; editDraft.dualApi.previousReview = true;
        switchApiProfile(firstId);`);
    assert.equal(app.run('editDraft.dualApi.apiKey'), 'TEST_SECRET', 'save-as-new must not overwrite original key');
    assert.equal(app.run('editDraft.dualApi.model'), 'private-model');
    app.run(`editDraft.dualApi.apiKey = 'UPDATED_A'; switchApiProfile(secondId)`);
    assert.equal(app.run('editDraft.dualApi.apiKey'), 'KEY_B');
    assert.equal(app.run('editDraft.dualApi.endpoint'), 'https://b.example/v1');
    assert.equal(app.run('editDraft.dualApi.temperature'), '0');
    assert.equal(app.run('editDraft.dualApi.maxTokens'), 4096);
    assert.equal(app.run('editDraft.dualApi.contextMode'), 'all');
    assert.equal(app.run('editDraft.dualApi.previousReview'), true);
    app.run('switchApiProfile(firstId); commitEditDraft({ notify: false }); beginEditSession(); switchApiProfile(secondId); switchApiProfile(firstId)');
    assert.equal(app.run('editDraft.dualApi.apiKey'), 'UPDATED_A');
    assert.equal(app.run('editDraft.apiProfiles.length'), 2);
    assert.equal(app.requestBodies.length, 0);
});

test('profile switch remains draft-only, discards safely and saves current edits even without switching', () => {
    const app = profileApp();
    app.run(`editDraft.dualApi.apiKey = 'UNSAVED'; createApiProfile('临时'); markDirty();`);
    assert.equal(app.run('normalizeSettings().dualApi.apiKey'), 'TEST_SECRET');
    app.run('discardEditDraft()');
    assert.equal(app.run('editDraft.apiProfiles.length'), 1);
    assert.equal(app.run('editDraft.dualApi.apiKey'), 'TEST_SECRET');
    app.event('input', '#stsc_dual_api_key', 'ROTATED');
    app.run('commitEditDraft({ notify: false }); beginEditSession()');
    assert.equal(app.run('editDraft.apiProfiles[0].config.apiKey'), 'ROTATED');
    assert.equal(app.run('editDraft.dualApi.apiKey'), 'ROTATED');
});

test('changing supplier protects the saved old key and selecting a profile resets connection/model state', () => {
    const app = profileApp();
    const id = app.run('editDraft.activeApiProfileId');
    app.event('input', '#stsc_dual_api_key', 'ORIGINAL_KEY');
    app.event('change', '#stsc_dual_provider', 'deepseek');
    assert.equal(app.run('editDraft.activeApiProfileId'), '');
    assert.equal(app.run('editDraft.dualApi.apiKey'), '');
    assert.equal(app.run('editDraft.apiProfiles[0].config.apiKey'), 'ORIGINAL_KEY');
    app.event('input', '#stsc_dual_api_key', 'NEW_SUPPLIER_KEY');
    app.run(`createApiProfile('新供应商'); dualApiModels = ['STALE']; dualApiModelsError = 'old error';
        dualApiConnectionTestResult = { ok: true };`);
    app.event('change', '#stsc_api_profile_select', id);
    assert.equal(app.run('editDraft.dualApi.provider'), 'custom');
    assert.equal(app.run('editDraft.dualApi.apiKey'), 'ORIGINAL_KEY');
    assert.equal(app.run('dualApiModels.length'), 0);
    assert.equal(app.run('dualApiConnectionTestResult'), null);
    assert.equal(app.run('editDirty'), true);
    assert.equal(app.requestBodies.length, 0);
});

test('API profile controls create and rename escaped names without displaying keys or accepting duplicates', async () => {
    const app = profileApp();
    app.nodes.get('stsc_api_profile_name').value = '<img src=x>';
    await app.action('create-api-profile');
    assert.equal(app.run('editDraft.apiProfiles.length'), 2);
    app.run('renderSettingsTab()');
    const markup = app.html['#stsc_tab_settings'];
    assert.ok(markup.includes('&lt;img src=x&gt;'));
    assert.ok(!markup.includes('<img src=x>'));
    assert.ok(!markup.slice(markup.indexOf('stsc-api-profiles'), markup.indexOf('for="stsc_dual_provider"')).includes('TEST_SECRET'));
    await app.action('create-api-profile');
    assert.equal(app.run('editDraft.apiProfiles.length'), 2, 'duplicate rejected');
    app.nodes.get('stsc_api_profile_name').value = '新名字';
    await app.action('rename-api-profile');
    assert.equal(app.run('editDraft.apiProfiles[1].name'), '新名字');
    app.nodes.get('stsc_api_profile_name').value = '';
    await app.action('rename-api-profile');
    assert.equal(app.run('editDraft.apiProfiles[1].name'), '新名字');
    assert.ok(!JSON.stringify(app.notices).includes('TEST_SECRET'));
});

test('API profile deletion requires confirmation and supports cancel/discard, fallback and clearing the last key', async () => {
    const app = profileApp();
    app.run(`createApiProfile('备用'); commitEditDraft({ notify: false })`);
    await app.action('delete-api-profile');
    assert.equal(app.run('editDraft.apiProfiles.length'), 2);
    app.run('closeDialog()');
    assert.equal(app.run('editDraft.apiProfiles.length'), 2);
    await app.action('delete-api-profile');
    app.run('pendingDeleteRequest(); closeDialog()');
    assert.equal(app.run('editDraft.apiProfiles.length'), 1);
    assert.equal(app.run('editDraft.activeApiProfileId'), app.run('editDraft.apiProfiles[0].id'));
    app.run('discardEditDraft()');
    assert.equal(app.run('editDraft.apiProfiles.length'), 2);
    app.run('deleteApiProfile(editDraft.activeApiProfileId); deleteApiProfile(editDraft.activeApiProfileId); commitEditDraft({ notify: false })');
    assert.equal(app.run('normalizeSettings().apiProfiles.length'), 0, 'migration must not resurrect deleted profile');
    assert.equal(app.run('normalizeSettings().dualApi.apiKey'), '');
    assert.equal(app.run('normalizeSettings().dualApi.endpoint'), '');
});

test('API profiles normalize malformed storage without collecting unrelated settings or cross-profile keys', () => {
    const app = profileApp();
    app.run(`editDraft.apiProfiles = [null, {id:'invalid', config:null},
        {id:'same', name:'A', config:{...editDraft.dualApi, unknown:'MUST_DROP', references:['PRIVATE']}},
        {id:'same', name:'B', config:{apiKey:'B_KEY', provider:'not-a-vendor'}}];
        editDraft.activeApiProfileId = 'missing'; normalizeApiProfiles(editDraft);`);
    assert.equal(app.run('editDraft.apiProfiles.length'), 2);
    assert.equal(app.run('new Set(editDraft.apiProfiles.map(p => p.id)).size'), 2);
    assert.equal(app.run('editDraft.activeApiProfileId'), '');
    const profiles = app.run('JSON.stringify(editDraft.apiProfiles)');
    assert.ok(!profiles.includes('MUST_DROP') && !profiles.includes('PRIVATE'));
    assert.equal(app.run('editDraft.apiProfiles[1].config.apiKey'), 'B_KEY');
    assert.equal(app.run('editDraft.apiProfiles[1].config.provider'), 'custom');
    assert.equal(app.run('switchApiProfile("missing")'), false);
});

test('saved profile generation uses the matching endpoint/key while unsaved switches do not alter runtime', async () => {
    const app = profileApp();
    app.run(`firstId = editDraft.activeApiProfileId;
        editDraft.dualApi.apiKey = 'SECOND_KEY'; editDraft.dualApi.endpoint = 'https://second.example/v1';
        secondId = createApiProfile('第二套').id; markDirty();`);
    const bodies = [];
    app.scope.fetch = async (_url, options) => {
        bodies.push(JSON.parse(options.body));
        return new Response(JSON.stringify({choices:[{message:{content:'OK'}}]}));
    };
    const generate = () => app.run('callDualApiSelfCheck({chat:[],questions:[],references:[],temporaryInstructions:[],settings:normalizeSettings()})');
    await generate();
    app.run('commitEditDraft({ notify: false })');
    await generate();
    app.run('switchApiProfile(firstId); commitEditDraft({ notify: false })');
    await generate();
    assert.deepEqual(bodies.map(b => b.custom_url), ['https://custom.example/v1', 'https://second.example/v1', 'https://custom.example/v1']);
    assert.deepEqual(bodies.map(b => JSON.parse(b.custom_include_headers).Authorization), ['Bearer TEST_SECRET', 'Bearer SECOND_KEY', 'Bearer TEST_SECRET']);
    assert.ok(!app.run('JSON.stringify(normalizeSettings().logs)').includes('SECOND_KEY'));
    const exported = app.run('JSON.stringify(makeReferenceBundleExportPayload([]))');
    assert.ok(!exported.includes('TEST_SECRET') && !exported.includes('SECOND_KEY'));
});

test('streaming defaults on, can be disabled, and persists separately in saved API profiles', () => {
    const app = profileApp();
    assert.equal(app.run('normalizeSettings().dualApi.stream'), true);
    app.run('firstId = editDraft.activeApiProfileId; renderSettingsTab()');
    assert.match(app.html['#stsc_tab_settings'], /id="stsc_dual_stream"[^>]*checked/);
    app.event('change', '#stsc_dual_stream', false);
    app.run(`secondId = createApiProfile('非流式接口').id; commitEditDraft({notify:false}); beginEditSession();`);
    assert.equal(app.run('editDraft.dualApi.stream'), false);
    app.run('switchApiProfile(firstId)');
    assert.equal(app.run('editDraft.dualApi.stream'), true);
    app.run('switchApiProfile(secondId)');
    assert.equal(app.run('editDraft.dualApi.stream'), false);
    app.event('change', '#stsc_dual_stream', true);
    app.run('discardEditDraft()');
    assert.equal(app.run('editDraft.dualApi.stream'), false);
});

function timedStreamApp() {
    const app = plugin();
    app.run(`editDraft.dualApi.timeoutSeconds = 60; editDraft.dualApi.retryTransient = false;
        buildDualApiMessages = () => [{role:'user',content:'TEST'}];`);
    let now = 0, next = 0;
    const timers = new Map();
    app.scope.setTimeout = (fn, delay) => { const id = ++next; timers.set(id, { at: now + delay, fn }); return id; };
    app.scope.clearTimeout = id => timers.delete(id);
    let controller, cancelled = false;
    app.scope.fetch = async () => new Response(new ReadableStream({ start(c) { controller = c; }, cancel() { cancelled = true; } }));
    const advance = async milliseconds => {
        const target = now + milliseconds;
        while (true) {
            const earliest = [...timers].filter(([,timer]) => timer.at <= target).sort((a,b) => a[1].at-b[1].at)[0];
            if (!earliest) break;
            now = earliest[1].at; timers.delete(earliest[0]); earliest[1].fn(); await tick();
        }
        now = target; await tick();
    };
    return { app, advance, timers,
        send: data => controller.enqueue(new TextEncoder().encode(data)),
        cancelled: () => cancelled,
    };
}

test('active streams may exceed the old total timeout and all timers clear on success', async () => {
    const t = timedStreamApp();
    const pending = t.app.run('callDualApiSelfCheck({settings:getUiSettings()})');
    await tick();
    await t.advance(40000); t.send('data: {"choices":[{"delta":{"content":"A "}}]}\n\n'); await tick();
    await t.advance(40000); t.send(': heartbeat\n\n'); await tick();
    await t.advance(40000); t.send('data: {"choices":[{"delta":{"content":"B"},"finish_reason":"stop"}]}\n\n');
    assert.equal((await pending).text, 'A B');
    assert.equal(t.timers.size, 0);
});

test('a stream with no activity times out, cancels its reader and clears its total timer', async () => {
    const t = timedStreamApp();
    const pending = t.app.run('callDualApiSelfCheck({settings:getUiSettings()})');
    const check = assert.rejects(pending, error => error.code === 'timeout' && error.message.includes('连续未收到数据'));
    await tick(); await t.advance(60001); await check;
    assert.equal(t.cancelled(), true);
    assert.equal(t.timers.size, 0);
});

test('heartbeats cannot bypass the streaming overall deadline', async () => {
    const t = timedStreamApp();
    const pending = t.app.run('callDualApiSelfCheck({settings:getUiSettings()})');
    const check = assert.rejects(pending, error => error.code === 'timeout' && error.message.includes('180秒流式总等待上限'));
    await tick();
    for (let i = 0; i < 4; i++) { await t.advance(40000); t.send(': heartbeat\n\n'); await tick(); }
    await t.advance(20001); await check;
    assert.equal(t.cancelled(), true);
    assert.equal(t.timers.size, 0);
});

test('interrupted streams retry only once with a fresh accumulator and compact context', async () => {
    const app = plugin();
    app.run(`buildDualApiMessages = () => [{role:'user',content:'TEST'}]; waitForDualApiRetry = async () => {};`);
    let calls = 0;
    app.scope.fetch = async () => new Response('data: ' + JSON.stringify({ choices: [{ delta: { content: ++calls === 1 ? 'PARTIAL' : 'FINAL' }, finish_reason: calls === 1 ? null : 'stop' }] }) + '\n\n');
    const result = await app.run('callDualApiSelfCheck({settings:getUiSettings()})');
    assert.equal(calls, 2);
    assert.equal(result.text, 'FINAL');
    assert.equal(result.compact, true);
});

test('complete-looking stream XML is not injected into main API before the provider finishes', async () => {
    const app = plugin();
    app.run(`testSettings = clone(editDraft); testSettings.dualApi.retryTransient = false; normalizeSettings = () => testSettings;
        getActiveQuestions = getDualApiQuestions = () => [{id:'q1',text:'问题',requireEvidence:false}];
        getActiveReferences = getSelectedTemporaryInstructions = () => [];
        clearRuntimePrompts = applyReferencePrompts = applyTemporaryPrompt = () => {};
        injected = false; applyDualApiMainPrompt = () => { injected = true; };`);
    let controller;
    app.scope.fetch = async () => new Response(new ReadableStream({ start(c) { controller = c; } }));
    const pending = app.run('sillyTavernSelfCheckInterceptor([],10000,()=>{},"normal")');
    await tick();
    const xml = '<stsc_self_check><item id="q1"><answer>结论</answer></item></stsc_self_check>';
    controller.enqueue(new TextEncoder().encode('data: ' + JSON.stringify({choices:[{delta:{content:xml}}]}) + '\n\n'));
    await tick();
    assert.equal(app.run('injected'), false);
    controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
    await pending;
    assert.equal(app.run('injected'), true);
    assert.equal(app.run('pendingRun.mode'), 'dual_api');
});

test('HTTP200 provider errors and empty/safety results are no longer misreported as key errors', () => {
    const app = plugin();
    for (const payload of [
        {error:{message:'Google AI Studio Candidate text empty'}},
        {error:{message:'Prompt was blocked due to : SAFETY'}},
        {error:{message:'Unknown provider failure'}},
    ]) {
        app.scope.errorToFormat = adapters.providerError(200, payload);
        const text = app.run('dualApiFailureMessage(errorToFormat)');
        assert.ok(!text.includes('通常是API密钥错误'), text);
    }
    app.scope.errorToFormat = adapters.providerError(200,{error:{message:'Unauthorized'}});
    assert.ok(app.run('dualApiFailureMessage(errorToFormat)').includes('密钥错误'));
});
