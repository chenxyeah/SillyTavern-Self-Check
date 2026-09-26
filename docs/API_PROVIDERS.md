# 自检 API 供应商适配设计（正式版 v0.4.2）

核对日期：2026-09-26。基线：正式版 v0.4.1，提交 `e32802c501a425217e39446c0bbd0bcecc52678e`。
本次版本为正式版 v0.4.2；实现与模拟测试已完成。发布不等于已完成真实供应商联调或移动端交互验收，详见文末测试范围。

## 范围与架构

`api-providers.mjs` 管理供应商元数据、地址校验、酒馆转发请求构建、模型 ID 提取、最终文本读取和安全错误提示。
`index.js` 保留已有自检问题构造、保存草稿、补救重试、复盘、正文注入和失败回退流程，只接入统一适配入口。

浏览器只请求同源的 `/api/backends/chat-completions/status` 或 `/generate`。
不从手机浏览器直连供应商，不引入 CORS 代理，不修改酒馆主 API 设置。

| 供应商 | 默认基础地址 | 酒馆转发源 / 供应商协议 | 模型获取 |
| --- | --- | --- | --- |
| 火山方舟 Plan | `https://ark.cn-beijing.volces.com/api/plan/v3` | custom / OpenAI Chat Completions | 手动 |
| 百度千帆 Plan | `https://qianfan.baidubce.com/v2/tokenplan/personal` | custom / OpenAI Chat Completions | 手动 |
| OpenAI / GPT | `https://api.openai.com/v1` | custom / OpenAI Chat Completions | /models + 手动 |
| DeepSeek | `https://api.deepseek.com` | custom / OpenAI Chat Completions | /models + 手动 |
| Claude | `https://api.anthropic.com/v1` | claude / Messages | /models + 手动 |
| Gemini | `https://generativelanguage.googleapis.com` | makersuite / generateContent | /v1beta/models + 手动 |
| GLM | `https://open.bigmodel.cn/api/paas/v4` | custom / OpenAI Chat Completions | 手动 |
| 自定义兼容 | 用户填写 | custom / OpenAI Chat Completions | 尝试 /models + 手动 |

“手动”表示未把该套餐的 /models 当成官方保证，并不表示生成接口不可用。
模型列表不做静态枚举、不自动选第一个、不覆盖用户已保存的 ID。分页接口当前只显示酒馆转发取得的首批，缺少的模型可手填。列表不保证每个 ID 都支持文本生成。

## 协议差异

- OpenAI 兼容类发送 Bearer 密钥，保留 Plan 和自定义路径，只追加 /chat/completions。
- GPT 使用 `max_completion_tokens`；其他兼容类使用 `max_tokens`。省略 temperature、top_p 和惩罚参数，减少推理模型拒绝请求的情况。使用酒馆 custom 源，避免酒馆 OpenAI 源按模型名额外改写参数。
- Claude 使用酒馆原生源，由酒馆转成 system/messages、max_tokens，并加 `x-api-key` 与 `anthropic-version: 2023-06-01`。适配层优先读取保留的原生 content 文本块，跳过 thinking/tool_use。
- Gemini 使用酒馆原生源，由酒馆转成 systemInstruction、contents、user/model、generationConfig，并选择 generateContent。输入可带 models/ 前缀，发送前移除。读取候选最终文本，排除 thought。
- 模型列表借用酒馆 custom status 路由，Claude 使用 x-api-key，Gemini 使用 x-goog-api-key，并覆盖 Authorization 为空，避免借用主接口保存的密钥。
- 所有独立自检固定非流式；不新增 SSE 解析。主 API 正文流式生成未改。
- 不把 reasoning_content 或 thinking 当作答案。没有最终文本时返回简短错误，交给已有重试／回退逻辑。

## 配置、安全与容错

旧设置缺少 provider 时迁移为 custom；不重置原地址、密钥、模型或其他自检参数。
明确选择另一供应商时清空当前草稿密钥、模型，并填入该供应商默认地址；保存前不影响已保存配置。
不自动发起模型列表／连接请求，只有用户点击或正常自检生成才请求。

地址只接受 HTTP(S)，拒绝用户名密码、查询参数和片段；密钥放独立字段。不把 /responses 静默改写为 Chat Completions。
火山 Agent Plan 保留 /api/plan/v3；Coding Plan 可手填 /api/coding/v3。千帆保留 /v2/tokenplan/personal。
不会在失败时切换到另一家 API 或套餐按量付费地址。原有“退回单 API”仍由用户设置控制。
套餐密钥不同于普通 API 密钥；实际用途、模型及额度以用户套餐授权为准。

插件错误只显示类别和排查方向，不显示供应商原始错误正文，避免回显密钥、角色资料或聊天内容。
密钥仍保存在酒馆插件设置中（不是额外加密的秘密保险箱），与原版一致。酒馆服务端自身日志行为不由插件控制；分享酒馆日志前仍应脱敏。

连接测试使用当前草稿，只发一句固定测试文字，不带角色卡／聊天／题目，不写入自检结果，不自动保存。
测试最多发起一次插件请求，不自动做插件层重试；实际供应商调用次数还受酒馆后端内部重试影响。
连接状态和“模型列表成功”分开显示。测试期间配置改变时，旧结果不标记到新配置。
模型请求有 20 秒超时和取消／过期结果隔离。自检保留 60–300 秒配置超时、瞬时错误最多一次精简重试。
认证、参数、模型错误不进行插件层重试；限流／可识别服务器错误可重试。明确关闭重试标记不会被错误文字再次触发。

## 酒馆版本与边界

隔离合同测试使用本机 `SillyTavern-1.12.14/src/endpoints/backends/chat-completions.js` 和 `src/prompt-converters.js` 的实际代码。
测试把 fetch、配置读取和 Express 响应替换为模拟对象，不启动酒馆、不读取真实密钥、不调用供应商。
JSON 编码的 include/exclude 参数使用等价 JSON 测试替身，未替换正在使用的酒馆后端。

Claude/Gemini 的最终转换由安装的酒馆版本负责：旧酒馆对新模型名可能把系统指令并入用户消息、选择不同 API 版本，或丢失原始错误码／结束原因。遇到原生接口失败应先升级酒馆并重试。
本机 Gemini 生成后端使用 URL 的 key 参数；模型列表使用 x-goog-api-key。插件只把密钥交给同源酒馆，且不记录该 URL。
本机旧 Claude/Gemini 后端会把上游认证等错误折叠成 HTTP 500 + error:true，此时不盲目重试，提示检查配置。
不在本轮修改酒馆后端以绕过这些限制。

不包含：Responses 专用模型、Azure OpenAI、Vertex AI OAuth、Bedrock、音频／图像／视频输入输出、工具调用、原生自检流式、模型分页完整同步。
自定义模式支持 OpenAI Chat Completions 协议，不等于任意名为“OpenAI 兼容”的服务都完全兼容。需要 GPT 参数的兼容服务可选 OpenAI 预设后填写其地址。
不能从模拟测试推断真实账户、Plan 用途授权、地域网络或新模型一定可用；发布前仍需真实接口及桌面／手机酒馆交互验收。

## 官方文档依据

以下为核对时使用的官方页面，不使用第三方教程作为协议依据：

- 火山 [Agent Plan 接入其他工具](https://docs.volcengine.com/docs/ark/agent-plan-enterprise-other-tools?lang=zh)：OpenAI 兼容基础路径 /api/plan/v3；另有 [Coding Plan 入门](https://docs.volcengine.com/docs/ark/coding-plan-personal-get-started?lang=zh) 的 /api/coding/v3，不混用。
- 百度 [Token Plan 快速开始](https://cloud.baidu.com/doc/qianfan/s/kmracfgi2) 与 [Cherry Studio 接入](https://cloud.baidu.com/doc/qianfan/s/hmrad6pbq)：专属密钥及 /v2/tokenplan/personal。
- OpenAI [Create chat completion](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create)：max_completion_tokens、旧 max_tokens 与推理模型兼容限制。OpenAI Docs 技能据此指导 GPT 参数分支。
- DeepSeek [Chat Completions](https://api-docs.deepseek.com/api/create-chat-completion/) 与 [API 首页](https://api-docs.deepseek.com/)：OpenAI 兼容地址、消息和输出长度参数。
- Claude [Messages](https://platform.claude.com/docs/en/api/messages/create) 与 [Models](https://platform.claude.com/docs/en/api/models/list)：原生消息、鉴权、文本内容块和模型列表。
- Gemini [generateContent](https://ai.google.dev/api/generate-content)、[Models](https://ai.google.dev/api/models) 与 [API 参考](https://ai.google.dev/api)：原生请求、候选文本、模型列表和密钥。
- 智谱 [对话补全（官方 Markdown）](https://docs.bigmodel.cn/api-reference/模型-api/对话补全.md)：/api/paas/v4/chat/completions、Bearer、messages 和 max_tokens。网页访问不稳定，已直接读取官方 Markdown 核对。

## 测试

无需安装依赖，Node 22+：

```powershell
node --check index.js
node --check api-providers.mjs
node --test --test-reporter=spec tests/*.test.mjs
git diff --check
```

若有本机酒馆源码，额外启用真实后端合同测试：

```powershell
$env:ST_SOURCE_ROOT = 'E:\Sillytavern\SillyTavern-1.12.14'
node --test --test-reporter=spec tests/*.test.mjs
```

本轮结果：60 项全部通过，0 失败，0 跳过（设置了 ST_SOURCE_ROOT）。未设置时会跳过 13 项酒馆合同测试，其余 47 项仍可独立运行。
涵盖八家请求、路径、鉴权、最终文本、配置兼容、列表失败手填、过期结果、测试连接隔离、认证不重试、精简重试、正式版身份与开场白代码围栏回归。
语法、版本 JSON 和 git diff --check 通过。未使用真实 API 密钥；未做真实浏览器视觉／移动端交互测试。
