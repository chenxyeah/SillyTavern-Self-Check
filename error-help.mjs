// Stable documentation IDs. These are guide numbers, not HTTP status codes.
const helpEntry = (id, title, mode, impact, cause, action) => Object.freeze({ id, title, mode, impact, cause, action });

export const COMMON_ERROR_HELP = Object.freeze([
    helpEntry(1, '未输出自检问答／完全没有自检标签',
        '主要是单API或双API回退后；副API缺标签也可能显示为返回格式不完整。',
        '影响自检：本轮没有可识别的答案。正文可能正常，但不能因此认定自检成功。',
        '可能真的没写，也可能标签错误、被正则删除，或本轮已经回退单API。',
        '先看日志有没有回退单API，再检查原始回复、隐藏正则和预设中的冲突要求。'),
    helpEntry(2, '缺少某题回答／应答10题只识别到6题／自检格式不完整',
        '单API、双API都可能出现。',
        '自检不完整。单API可能保留部分答案和正文；双API缺少必要答案时会补救，仍失败则回退或停止。',
        'AI漏题、答案截断，或写了但格式没有被识别。',
        '减少题目、缩短每题回答要求，并检查实际返回是否完整。'),
    helpEntry(3, '判断题没有以“是”或“否”开头',
        '单API、双API都可能出现。',
        '通常不直接阻止正文，但这道题会被标记格式不合格，不等于完全没有答案。',
        '题目设成判断题，AI却用了其他回答方式。',
        '要求先回答“是”或“否”；需要自由讨论的题可以改为开放问答。'),
    helpEntry(4, '缺少独立的依据／没有evidence依据',
        '单API、双API都可能出现。',
        '影响题目完整性；双API缺少必需依据时不能作为完整自检提交，补救失败后会回退或停止。',
        '勾选了需要依据，但AI没写，或把依据混进答案而没有单独给出。',
        '要求提供具体剧情、设定或资料依据。确实不需要依据的题，可取消该题的依据要求。'),
    helpEntry(5, '格式已自动修复／题号已恢复／结束标签已补全',
        '单API、双API都可能出现。',
        '答案完整、正文正常时通常没有实质影响。这是修复提醒，不是本轮失败。',
        'AI的标签、转义或题号有小问题，插件已恢复可识别的内容。',
        '确认答案和正文正常即可继续；频繁出现时再检查提示词和模型输出。'),
    helpEntry(6, '正文被think、thinking等思考标签包住',
        '单API、双API都可能出现。',
        '可能影响正文显示，被其他功能当成思考内容隐藏。插件无法确认正文边界时不会冒险删除。',
        '模型或酒馆预设把正文也塞进了思考标签。',
        '检查酒馆预设的思考与正文分隔要求，避免把整段回复都放进思考标签。'),
    helpEntry(7, '主API重复输出自检，插件已自动移除',
        '双API模式。',
        '清理完整且正文、副API答案正常时，一般不影响使用，也不使原自检失效；多余输出仍会增加用量和等待。',
        '主API又写出了自检标记，可能受旧提示词、上下文或错误要求影响。此提示不代表逐字核对过两份内容。',
        '没有残留、正文正常时可继续。反复出现就检查“再次输出自检”的要求；标签不完整或正文受损时请反馈。'),
    helpEntry(8, '没有可显示的正文／生成结束但没收到正文',
        '单API、双API都可能出现。',
        '本轮正文或结果记录没有正常完成；即使已做自检，也不能算整轮完全成功。',
        '可能只出了自检、回复为空，或酒馆没有正常交回最终消息。',
        '重新生成一次；连续发生时检查主API、回复长度和酒馆控制台。'),
    helpEntry(9, '本轮生成提前停止',
        '单API、双API都可能出现。',
        '本轮可能没有完整结果，不会因此作废以前已完成的聊天。',
        '可能手动点了停止，也可能连接中断。',
        '手动停止可以忽略；不是手动停止，就检查网络和主API。'),
    helpEntry(10, '没有返回上一轮复盘／复盘重试失败',
        '双API，并开启上一轮复盘。',
        '通常只影响本次复盘。本轮自检完整时仍可继续正文，不等于自检失败。',
        'AI漏写复盘、格式错误，或复盘补救没成功。',
        '先确认本轮自检正常；反复出现时减少题目或上下文后测试。'),
    helpEntry(11, '过滤标签后找不到正文／本轮跳过复盘',
        '双API，并开启复盘和过滤标签。',
        '只跳过上一轮复盘，不影响本轮自检和正文；不会擅自回退发送全文。',
        '上一轮没有完整且非空的 <content>…</content> 正文。',
        '使用content格式就检查标签是否完整；正文不用这种格式，就关闭过滤标签。'),
    helpEntry(12, 'API地址没填／地址格式不正确',
        '副API配置、连接测试和双API调用。',
        '相关副API请求不能正常发出。单API不使用副API时，不受未配置副接口影响。',
        '地址为空、填成网页，或包含不支持的路径、密钥等内容。',
        '按服务商说明填写基础地址，不随意增删/v1，不把密钥放进地址。'),
    helpEntry(13, '密钥没填／密钥不能含换行',
        '副API配置、连接测试和双API调用。',
        '需要密钥的副API不能正常请求；不影响未使用副API的单API模式。',
        '没有填写密钥，或复制时带入了换行。',
        '重新复制对应供应商的密钥，检查首尾和换行，不要发送给其他人。'),
    helpEntry(14, '没选模型／模型ID格式不正确',
        '副API配置、连接测试和双API调用。',
        '副API可能无法发出请求或找不到对应模型。',
        '没有填模型，或使用了服务商不认可的简称、格式。',
        '填写服务商提供的完整模型ID，然后保存。'),
    helpEntry(15, '温度、Top P等参数超出范围',
        '副API参数设置与双API请求。',
        '无效参数不能正常应用，或使副API请求失败；不代表其他配置全坏了。',
        '数值填错，或不同供应商允许的范围不同。',
        '不确定就留空，使用供应商默认值，不照搬其他模型的整套参数。'),
    helpEntry(16, '不支持当前思考档位／无法透传思考档位',
        '副API配置与双API请求。',
        '相关副API请求可能失败，不是插件永久不能使用。',
        '当前供应商、模型或酒馆转发方式不支持这个选项。',
        '将思考档位改为供应商默认；需要其他协议时使用服务商明确提供的地址。'),
    helpEntry(17, '密钥无效／没有权限／401、403',
        '这里主要指双API的副API；主API同类问题通常由酒馆提示。',
        '对应API请求失败；双API实际使用时按设置回退或停止。',
        '密钥错误、失效，或账号没有模型、套餐的使用权限。',
        '核对供应商、密钥和模型是否配套，Plan接口要检查对应专属密钥。'),
    helpEntry(18, '额度不足／套餐不可用',
        '这里主要指双API的副API；主API也可能有同类问题。',
        '对应请求不能完成，双API失败后是否继续正文取决于失败处理设置。',
        '余额、套餐、模型权限或使用限制不满足要求。',
        '到服务商后台查余额、套餐和权限，先查清楚，不要直接盲目充值。'),
    helpEntry(19, '请求太频繁／限流／429',
        '主要是双API的副API。',
        '本次请求可能失败或等待重试，不代表预设、资料或聊天损坏。',
        '请求太快、并发太多，或服务商限制了使用量。',
        '等一会儿再试，减少同时请求的数量；反复出现再查账号限制。'),
    helpEntry(20, '地址或模型不存在／404',
        '副API连接测试和双API调用。',
        '相关副API请求无法完成。',
        '地址路径、模型ID不对，或模型已下线；提示说地址问题也可能是模型没找到。',
        '同时核对服务商提供的地址和完整模型ID，不要只改一个。'),
    helpEntry(21, '不接受当前请求／参数错误／400',
        '副API连接测试和双API调用。',
        '副API没接受这次请求，不能算自检成功。',
        '接口不接受当前模型、参数、回复长度或请求方式。',
        '温度、Top P、思考档位先恢复默认，核对模型与最大回复长度。'),
    helpEntry(22, '无法连接／网络错误／fetch失败',
        '这里主要指双API的副API。',
        '副API请求不能正常完成，不一定是密钥或模型错误。',
        '插件到酒馆，或酒馆到服务商的连接有问题。',
        '检查酒馆、网络、代理和接口线路，必要时换网络做对照测试。'),
    helpEntry(23, '连接测试超时／无数据超时／总等待超时',
        '副API连接测试和双API调用。',
        '本次测试或自检没在时限内完成；实际自检最终失败后会回退或停止。',
        '接口慢、长期没数据，或整个流式请求拖得太久。',
        '减少题目和上下文，确认流式支持情况，必要时适当增加等待。一直没数据时只延长时间未必有用。'),
    helpEntry(24, '返回空结果／没有最终文本',
        '副API连接测试和双API调用。',
        '没有拿到可用最终答案；接口有响应不等于自检成功。',
        '可能只有思考内容、真正空回或返回格式不兼容，不能只凭空回断定内容被拦截。',
        '用少量题目、短上下文和默认参数测试，核对供应商选项、模型与接口格式。'),
    helpEntry(25, '内容被拦截／模型没有接受本轮内容',
        '这里主要指双API的副API。',
        '本次副API没有可用答案，最终失败后按设置回退或停止。',
        '服务商明确限制了本轮请求中的内容。',
        '用普通短内容对照测试并遵守服务商规则；插件开关不能强制平台放行。'),
    helpEntry(26, '达到回复或思考长度上限',
        '双API的副API。',
        '自检可能只完成一部分，不能当作完整结果使用。',
        '模型没答完，就用完了允许的回复或思考长度。',
        '减少题目、缩短答案；模型允许时再适当提高最大回复长度。'),
    helpEntry(27, '不支持流式／浏览器无法读取流式',
        '双API，并开启副API流式请求。',
        '副API不能按当前方式完成接收，不是主API的流式正文设置出错。',
        '接口或当前浏览器不支持这种接收方式。',
        '关闭“独立自检API使用流式请求”，保存后重试。'),
    helpEntry(28, '流式连接中断／模型异常结束',
        '双API的副API流式请求。',
        '不会把半截自检作为完整结果提交，后续重试、回退或停止。',
        '网络中断、接口异常，或没有正常结束标记。',
        '先重试一次；反复发生就检查线路，也可关闭流式做对照测试。'),
    helpEntry(29, '返回格式异常／不是JSON／无法识别流式响应',
        '副API连接测试和双API调用。',
        '插件读不懂返回内容，所以拿不到可用自检。',
        '返回了网页、错误页、不兼容的中转格式或损坏数据。',
        '核对供应商选项和地址，向服务商确认接口格式，流式问题可关闭流式对照。'),
    helpEntry(30, '响应过长／流式事件过长，停止接收',
        '双API的副API流式接收。',
        '插件主动停止接收，本次结果不能作为完整自检使用。',
        '数据超过安全接收上限，不只是普通的“回答有点长”。',
        '减少输出要求；正常几道题也出现时，让服务商检查是否返回了异常数据。'),
    helpEntry(31, '模型列表不可用／没有提供模型列表',
        '副API设置页面，单API或双API设置时都可能看到。',
        '通常不影响正常使用，只是不能从列表选模型，仍可手动填写。',
        '接口不提供模型列表，或列表读取暂时失败。',
        '手动填写服务商给出的模型ID再测试，不要仅凭列表失败就认定接口不能用。'),
    helpEntry(32, '返回200但包含错误／接口调用失败',
        '双API的副API。',
        '如果返回的是错误而不是答案，自检仍失败；200不保证任务成功。',
        '酒馆或中转把错误包装在200响应里，也可能是其他服务商错误，包括服务端故障。',
        '查看具体原因，做短请求对照测试；服务端繁忙可稍后重试，不要直接认定是密钥问题。'),
    helpEntry(33, '已精简重试一次，仍未成功',
        '双API的副API。',
        '补救没有完成，不是额外一种新故障；后续按设置回退或停止。',
        '前面的超时、空回、格式不完整等问题仍然存在。',
        '看这句话前面的具体原因，按对应条目处理，不要只重复点击重试。'),
    helpEntry(34, '副API失败，已自动退回单API',
        '从双API发起，本轮已改成单API继续。',
        '正文可以继续，但并非正常完成的双API。主API现在还要尝试自检，仍可能成功或漏答。',
        '副API失败，而失败处理选的是回退单API。',
        '查看前面的副API失败原因；不接受回退时，可以自行把失败处理改成停止。'),
    helpEntry(35, '副API失败，本轮生成已停止',
        '双API，失败处理选为停止。',
        '影响本轮生成，不会继续正常生成正文。',
        '副API失败，插件按设置停止了这一轮。',
        '解决前面的具体错误；希望失败后继续时，可自行改为回退单API。'),
    helpEntry(36, '上一轮独立自检仍在处理中',
        '双API。',
        '主要拦住新的重复请求，不代表上一轮失败，不影响旧聊天。',
        '上一轮没结束，又发起了新一轮。',
        '等待上一轮完成，不要连续重复点击发送。'),
    helpEntry(37, '名称为空／名称过长／名称重复',
        '单API、双API的管理页面。',
        '通常只影响创建或重命名，不代表已保存配置失效。',
        '预设、资料、资料方案或API配置的名称不合要求。',
        '填写不重复的名称，长度不超过80字。'),
    helpEntry(38, '未找到当前角色／请先进入角色聊天',
        '单API、双API的绑定操作。',
        '只影响本次绑定；未完成绑定，就不能期待该角色自动使用它。',
        '当前不在对应角色单聊，或在群聊中进行角色绑定。',
        '先进入对应角色卡的单聊，再绑定。'),
    helpEntry(39, '资料方案已不存在',
        '单API、双API的资料方案操作。',
        '本次方案操作无法完成，不代表总资料库损坏。',
        '方案已被删除，或页面保留了过时的选择。',
        '重新打开资料方案，选择仍然存在的方案。'),
    helpEntry(40, '没有生效的问题／没有可导出内容／指令为空／资料未启用',
        '单API、双API都可能出现。',
        '没有问题就没有自检任务；空指令或未启用资料不会生效；没有导出内容只影响导出。',
        '要操作的内容尚未填写、启用或选中。',
        '按提示补内容、启用或选择项目；使用资料方案时也要检查方案内的开关。'),
    helpEntry(41, '批量导入没有识别到问题',
        '单API、双API的批量导入操作。',
        '只影响本次问题导入，不影响原有自检运行。',
        '粘贴内容为空，或没有形成可导入条目。',
        '尽量一行一道题，也可手动补充；此功能不是让AI生成问题。'),
    helpEntry(42, '至少要保留一个通用预设',
        '单API、双API的删除预设操作。',
        '只拦住本次删除，不影响正常生成。',
        '插件不允许把通用预设全部删空。',
        '保留一个，或先新建再删除旧的；不想启用通用自检可关闭它。'),
    helpEntry(43, '导入格式不匹配／不是插件导出的文件／格式版本不支持',
        '单API、双API的导入操作。',
        '本次文件不能正常导入，通常不影响原有预设和资料。',
        '文件选错、JSON损坏、字段缺失或导出格式不兼容。',
        '使用本插件导出的对应文件，保留原件，不随意修改文件内容。'),
    helpEntry(44, '导入文件过大／条目过多／内容长度异常',
        '单API、双API的导入操作。',
        '只影响本次导入，不等于已有资料全部不能使用。',
        '文件、条目数或某个字段超过导入限制。',
        '拆分导入：预设文件上限2MiB，资料文件上限16MiB；问题或资料合集超过500条需拆分，单条超长也要缩短。'),
    helpEntry(45, '请先保存、放弃修改，或等待生成结束',
        '单API、双API的更新、迁移等操作。',
        '主要拦住当前操作，不表示正在运行的自检全部失败。',
        '有未保存修改，或当前生成、测试尚未结束。',
        '先决定是否保存，再等任务结束。只有确定不要修改时才选择放弃。'),
    helpEntry(46, '未找到DEV设置／没有迁移前备份／设置尚未就绪',
        '单API、双API的迁移或恢复操作。',
        '主要影响迁移、恢复，不代表正式版自检不能用。',
        '没有对应DEV数据或备份，或酒馆还没加载完成。',
        '先等酒馆加载完；本来就没有数据或备份时，不需要强行迁移恢复。'),
    helpEntry(47, '检查更新失败／远程文件没有版本号',
        '单API、双API都可能出现。',
        '通常只影响检查新版本，已正常加载的自检一般仍可使用。',
        '暂时连不上GitHub，或远程版本文件没有正常读取。',
        '稍后重试，或到酒馆扩展管理中检查更新。不要因此重新配置API。'),
    helpEntry(48, '不是通过GitHub仓库安装，无法直接更新',
        '单API、双API都可能出现。',
        '不能用当前方式拉取更新；插件已正常加载时，原功能通常仍可用。',
        '手动复制文件安装，没有可拉取更新的仓库记录。',
        '先备份酒馆设置、预设和资料，再用正式仓库链接重新安装，不要删除聊天。'),
    helpEntry(49, '酒馆拒绝更新／更新权限不足',
        '单API、双API都可能出现。',
        '主要影响更新，不是模型API的调用权限问题。',
        '当前酒馆账号没有修改对应扩展目录的权限。',
        '全局扩展可能需要酒馆管理员账户更新，不是让你更换模型密钥。'),
    helpEntry(50, '找不到插件目录／拉取失败／更新超时',
        '单API、双API都可能出现。',
        '更新没确认成功；如果文件更新到一半，还可能影响插件加载，不能一概说无影响。',
        '目录改名、GitHub网络问题、仓库状态异常或酒馆不支持对应更新方式。',
        '先用酒馆扩展管理更新，仍失败再查网络和目录；重装前先备份，不直接清空数据。'),
    helpEntry(51, '显示有新版本，但没有拉取到新提交',
        '单API、双API都可能出现。',
        '通常是没有真正更新到目标版本，不直接代表本轮自检失败，旧版可能仍可用。',
        '远程版本提示、缓存、安装仓库或分支没有对上。',
        '确认是正式仓库main分支，更新后刷新；仍不一致再反馈版本和截图。'),
    helpEntry(52, '插件加载失败',
        '单API、双API都受影响。',
        '插件不能保证正常工作，包括界面和自检；酒馆主聊天是否受影响要另行判断。',
        '文件不完整、浏览器加载出错或酒馆兼容问题。',
        '先刷新并检查文件和版本；仍失败就提供控制台错误截图，不要只反复修改API。'),
]);

const guideIds = new Set(COMMON_ERROR_HELP.map(item => item.id));
const searchKey = value => String(value ?? '').normalize('NFKC').toLowerCase().replace(/\s+/g, '');

export function normalizeHelpIds(ids) {
    return Array.isArray(ids) ? [...new Set(ids.filter(id => Number.isInteger(id) && guideIds.has(id)))] : [];
}

export function searchErrorHelp(query) {
    const key = searchKey(query);
    if (!key) return [...COMMON_ERROR_HELP];
    // Valid guide numbers take precedence. Other numbers (e.g. 401) may match a title.
    if (/^\d+$/.test(key) && guideIds.has(Number(key))) return COMMON_ERROR_HELP.filter(item => item.id === Number(key));
    return COMMON_ERROR_HELP.filter(item => searchKey(item.title).includes(key));
}

const apiCodeHelp = Object.freeze({ auth: 17, quota: 18, rate_limit: 19, timeout: 23, empty: 24,
    content_blocked: 25, output_limit: 26, stream_unsupported: 27, stream_incomplete: 28, stream_format: 29 });

export function getApiErrorHelpIds(error = {}) {
    const text = String(error.message || '');
    const status = Number(error.httpStatus) || Number(text.match(/(?:HTTP|返回)\s*([45]\d\d|200)/i)?.[1]) || 0;
    let ids = [];
    if (/响应过长|事件过长/.test(text)) ids.push(30);
    else if (Object.hasOwn(apiCodeHelp, error.code)) ids.push(apiCodeHelp[error.code]);
    else if (status === 200) ids.push(32); // Legacy HTTP200/key wording was misleading.
    else if ([401, 403].includes(status)) ids.push(17);
    else if (status === 404) ids.push(20);
    else if (status === 429) ids.push(19);
    else if (status === 400) ids.push(21);
    else {
        const rules = [
            [2, /返回格式不完整|识别到\s*\d+\s*\/\s*\d+|题目没有答全/],
            [12, /(?:未|请|尚未).*(?:填写|填).*地址|有效.*(?:地址|HTTP)|Responses.*路径/],
            [13, /请填写.*密钥|密钥不能含换行/],
            [14, /尚未填写自检模型|手动填写或选择自检模型|Gemini 模型 ID 格式|先.*填写.*模型/],
            [15, /(?:temperature|top_p|温度|Top P).*必须.*之间/],
            [16, /不支持此思考档位|不能透传思考档位/],
            [17, /密钥无效|没有权限|unauthori|authentication/i],
            [18, /额度不足|套餐不可用|insufficient.quota/i],
            [19, /限流|请求太频繁|请求过多/],
            [20, /地址或模型不存在|模型不存在/],
            [21, /不接受当前请求|没有接受当前模型设置/],
            [22, /无法连接|没有连接上|网络|fetch failed|network|socket/i],
            [23, /超时|timeout|未收到数据|等待上限/i],
            [24, /空结果|未返回最终文本|没有.*最终.*文本/],
            [25, /内容限制|拦截|未接受本轮自检内容/],
            [26, /回复或思考长度上限|未完整完成自检/],
            [27, /不支持流式|无法读取流式/],
            [28, /完成前中断|流式.*中断|模型异常结束/],
            [29, /流式响应格式异常|可识别.*(?:JSON|流式)|未返回 JSON/i],
            [30, /响应过长|事件过长/],
        ];
        ids = rules.filter(([, re]) => re.test(text)).map(([id]) => id);
        if (ids.includes(30)) ids = ids.filter(id => id !== 29);
        if (error.name === 'TypeError' && !ids.length) ids.push(22);
    }
    if (!ids.length) ids.push(32);
    if (Number(error.attempts) > 1 || /精简重试.*(?:失败|不完整|未成功)|已自动精简重试/.test(text)) ids.push(33);
    return normalizeHelpIds(ids);
}

export function getResultHelpIds(latest, visibleBody = '') {
    const ids = [];
    if (!String(visibleBody || '').trim()) ids.push(8);
    else if (latest.status === 'missing' || !Number(latest.answeredCount)) ids.push(1);
    else {
        if (Number(latest.answeredCount) < Number(latest.expectedCount)) ids.push(2);
        for (const issue of latest.formatIssues || []) {
            const text = String(issue);
            if (/^酒馆主API.*重复输出/.test(text)) ids.push(7);
            else if (/整段可见回复.*思维链|^最终正文.*推理标签/.test(text)) ids.push(6);
            else if (/^缺少问题.*回答|^应回答/.test(text)) ids.push(2);
            else if (/^判断题.*没有以/.test(text)) ids.push(3);
            else if (/独立的.*evidence|没有输出独立/.test(text)) ids.push(4);
            else if (/没有按要求输出.*stsc_self_check|^完全没有输出/.test(text)) ids.push(1);
        }
    }
    if (latest.previousReview?.status === 'missing') ids.push(10);
    if (latest.previousReview?.status === 'content_missing') ids.push(11);
    return normalizeHelpIds(ids);
}

export function getLogHelpIds(item = {}) {
    const explicit = normalizeHelpIds(item.helpIds);
    if (explicit.length) return explicit;
    if (!['warning', 'error'].includes(item.level)) return [];
    // Old logs were compacted. Match conservatively; never claim an exact cause from missing data.
    const stage = String(item.stage || '');
    const message = String(item.message || '').replace(/^角色卡“[\s\S]*?”：/, '');
    const text = message + ' ' + String(item.handling || '');
    if (/更新检查|插件更新/.test(stage)) {
        if (/不是.*(?:Git|仓库)|非Git|没有.*Git.*记录/i.test(text)) return [48];
        if (stage === '更新检查') return [47];
        if (/新版本|远程版本号/.test(text) && /没有拉取|没有.*新提交/.test(text)) return [51];
        if (/401|403|拒绝.*更新|管理员|权限/.test(text)) return [49];
        return [50];
    }
    if (stage === '自检API') {
        const ids = getApiErrorHelpIds({ message });
        if (/回退|退回|改用单API/.test(text)) ids.push(34);
        if (/本轮生成已.*停止|本轮.*停止|设置要求.*停止/.test(text)) ids.push(35);
        return normalizeHelpIds(ids);
    }
    if (!['本轮结果', '自检解析'].includes(stage)) return [];
    const ids = [];
    const rules = [
        [7, /意外重复输出|正文AI把插件内部自检也写进了正文|主API.*重复输出/],
        [6, /整段可见回复.*思维链|最终正文.*推理标签|正文AI把整段可见回复都放进了思维链/],
        [1, /没有找到插件要求的自检回答|没有.*可用的自检结论|没有检测到完整的自检输出|没有输出插件能够识别/],
        [3, /判断题.*没有以/],
        [4, /没有输出独立.*依据|独立的.*evidence|缺少.*依据/],
        [8, /没有生成可显示的正文|没有收到可保存的AI正文/],
        [9, /完成前被停止|提前停止|生成.*被停止/],
        [10, /漏掉了上一轮复盘|没有.*复盘标签|复盘重试失败/],
        [11, /没有完整的.*content|跳过复盘/],
    ];
    for (const [id, re] of rules) if (re.test(text)) ids.push(id);
    const count = message.match(/(?:识别到|完整识别到)\s*(\d+)\s*\/\s*(\d+)/);
    if ((count && Number(count[1]) < Number(count[2])) || /回答不完整|有题目漏答|缺少问题.*回答/.test(text)) ids.push(2);
    if (/自动修复|自动补齐|自动补全|格式有小问题.*自动修好/.test(text)) ids.push(5);
    return normalizeHelpIds(ids);
}
