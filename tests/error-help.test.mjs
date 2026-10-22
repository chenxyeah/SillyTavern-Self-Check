import test from 'node:test';
import assert from 'node:assert/strict';
import { COMMON_ERROR_HELP, searchErrorHelp, normalizeHelpIds, getApiErrorHelpIds, getResultHelpIds, getLogHelpIds } from '../error-help.mjs';

test('all 52 stable guide entries include separate mode/impact/cause/action fields', () => {
    assert.equal(COMMON_ERROR_HELP.length, 52);
    assert.deepEqual(COMMON_ERROR_HELP.map(item => item.id), Array.from({length:52},(_,i)=>i+1));
    for (const entry of COMMON_ERROR_HELP) {
        for (const key of ['title','mode','impact','cause','action']) assert.ok(typeof entry[key] === 'string' && entry[key].trim());
        assert.ok(Object.isFrozen(entry));
    }
    assert.ok(COMMON_ERROR_HELP[6].impact.includes('不影响使用'));
    assert.ok(COMMON_ERROR_HELP[46].impact.includes('只影响检查'));
});

test('guide numbers match exactly, including padded/fullwidth numbers; HTTP codes match titles', () => {
    for (let id=1;id<=52;id++) assert.deepEqual(searchErrorHelp(String(id)).map(item=>item.id),[id]);
    for (const q of ['047',' 47 ','４７']) assert.deepEqual(searchErrorHelp(q).map(item=>item.id),[47]);
    assert.deepEqual(searchErrorHelp('401').map(item=>item.id),[17]);
    assert.deepEqual(searchErrorHelp('404').map(item=>item.id),[20]);
    assert.deepEqual(searchErrorHelp('99999'),[]);
});

test('search only uses visible titles, never mode, impact, cause or solutions', () => {
    assert.deepEqual(searchErrorHelp('检查更新失败').map(item=>item.id),[47]);
    assert.deepEqual(searchErrorHelp('检查更新').map(item=>item.id),[47]);
    assert.ok(COMMON_ERROR_HELP[46].action.includes('稍后重试'));
    for (const text of ['稍后重试','到酒馆扩展管理中检查更新','暂时连不上GitHub','已正常加载的自检一般仍可使用']) {
        assert.deepEqual(searchErrorHelp(text),[]);
    }
    assert.equal(searchErrorHelp('  ').length,52);
    assert.deepEqual(searchErrorHelp('<img src=x>'),[]);
    assert.deepEqual(searchErrorHelp('.*'),[],'user search is literal, not a regex');
});

test('help IDs only accept known integer guide numbers', () => {
    assert.deepEqual(normalizeHelpIds([47,47,7,'7',null,0,53,Infinity,{},[]]),[47,7]);
    assert.deepEqual(normalizeHelpIds('47'),[]);
});

test('structured API errors map precisely without trusting incidental words in the message', () => {
    const codes={auth:17,quota:18,rate_limit:19,timeout:23,empty:24,content_blocked:25,output_limit:26,stream_unsupported:27,stream_incomplete:28,stream_format:29};
    for(const [code,id] of Object.entries(codes)) assert.deepEqual(getApiErrorHelpIds({code,message:'请检查密钥和模型'}),[id]);
    assert.deepEqual(getApiErrorHelpIds({code:'stream_format',message:'流式事件过长，已停止接收。'}),[30]);
    assert.deepEqual(getApiErrorHelpIds({code:'timeout',attempts:2,message:'已超时'}),[23,33]);
    assert.deepEqual(getApiErrorHelpIds({code:'toString',message:'unknown'}),[32]);
});

test('legacy HTTP200/key wording stays ambiguous instead of asserting auth failure', () => {
    assert.deepEqual(getApiErrorHelpIds({httpStatus:200,message:'密钥无效或请检查密钥'}),[32]);
    assert.deepEqual(getLogHelpIds({level:'error',stage:'自检API',message:'自检API拒绝了请求（返回 200），请检查密钥'}),[32]);
    assert.deepEqual(getLogHelpIds({level:'warning',stage:'自检API',message:'接口返回200错误',helpIds:[24,34]}),[24,34]);
});

test('result links survive compacting and distinguish duplicate output from incomplete answers', () => {
    const base={status:'format_error',answeredCount:4,expectedCount:4};
    assert.deepEqual(getResultHelpIds({...base,formatIssues:['酒馆主API意外重复输出了自检内容，插件已自动移除。']},'正文'),[7]);
    assert.deepEqual(getResultHelpIds({...base,formatIssues:['问题“测试”已勾选需要依据，但AI没有输出独立的<evidence>依据。']},'正文'),[4]);
    assert.deepEqual(getResultHelpIds({...base,answeredCount:2,formatIssues:['缺少问题“测试”的回答。']},'正文'),[2]);
    assert.deepEqual(getResultHelpIds({...base,status:'missing',answeredCount:0},'正文'),[1]);
    assert.deepEqual(getResultHelpIds({...base},''),[8]);
    assert.deepEqual(getResultHelpIds({...base,status:'recovered',formatIssues:[]},'正文'),[]);
    assert.deepEqual(getResultHelpIds({...base,status:'dual_ok',formatIssues:[],previousReview:{status:'content_missing'}},'正文'),[11]);
});

test('old result logs support conservative matching, and normal logs do not get guessed errors', () => {
    assert.deepEqual(getLogHelpIds({level:'info',stage:'本轮结果',message:'正常完成',handling:'本轮运行正常，无需处理。'}),[]);
    assert.deepEqual(getLogHelpIds({level:'warning',stage:'本轮结果',message:'角色卡“没有找到插件要求的自检回答”：收到了自检内容，只完整识别到 4/4 题。',handling:'正文AI把插件内部自检也写进了正文，插件已经自动删掉。'}),[7]);
    assert.deepEqual(getLogHelpIds({level:'warning',stage:'本轮结果',message:'识别到 2/4 题'}),[2]);
    assert.deepEqual(getLogHelpIds({level:'warning',stage:'本轮结果',message:'正文已经输出，但没有找到插件要求的自检回答。'}),[1]);
    assert.deepEqual(getLogHelpIds({level:'warning',stage:'本轮结果',message:'信息已经丢失'}),[]);
    assert.deepEqual(getLogHelpIds({level:'error',stage:'陌生阶段',message:'错误999'}),[]);
});

test('update errors map to update help rather than API authentication/network help', () => {
    const fixtures=[['更新检查','检查更新失败',47],['插件更新','不是通过GitHub仓库安装',48],['插件更新','酒馆拒绝了更新操作。请使用管理员账号更新。',49],['插件更新','酒馆没有找到插件目录 HTTP404',50],['插件更新','远程版本号显示有更新，但酒馆没有拉取到新提交。',51]];
    for(const [stage,message,id] of fixtures) assert.deepEqual(getLogHelpIds({level:'error',stage,message}),[id]);
});

test('API log links retain the cause plus fallback/stop outcome without inventing uniqueness', () => {
    assert.deepEqual(getLogHelpIds({level:'warning',stage:'自检API',message:'自检API已超时',handling:'插件已经自动改用单API继续生成'}),[23,34]);
    assert.deepEqual(getLogHelpIds({level:'error',stage:'自检API',message:'密钥无效',handling:'当前设置要求双API失败时停止，因此本轮生成已经停止。'}),[17,35]);
});
