# 灵秀岛 ResumeAgent Conversation Test Set v1.0

本测试集用于人工评估灵秀岛 ResumeAgent 的多轮对话体验、字段吸收能力和生成策略控制能力，防止系统对单一路径过拟合。

覆盖层级：
- Input Interpreter：识别用户意图、目标方向、经历线索和低信心表达。
- Field Reconciler：抽取并合并 scene / action / result / scale / role / resultMetric。
- Question Generator：基于已知上下文追问缺失字段，避免模板化和重复追问。
- Generation Policy：判断当前信息是否达到最小表达粒度，阻断低质量输入直接生成正式 bullet。
- Resume Translation：在允许生成时输出清洗后的简历经历草稿。

| caseId | 用户类型 | 用户输入序列 | 测试目标 | 预期识别 | 预期状态路径 | 不允许出现的问题 | 验收标准 |
|---|---|---|---|---|---|---|---|
| C01 | 目标不明确用户 | 暂时不确定 | 验证目标方向不明确时的承接方式 | `targetRoleStatus=uncertain`；不写入具体 `targetRole`；可先做通用版本 | `START -> ASK_EXPERIENCE_STATUS` | 不允许回复“按这个方向帮你看”；不允许假设具体岗位 | 回复应承接“可以先做通用版本，后面再贴具体岗位”；继续询问是否有经历 |
| C02 | 目标明确用户 | 我想做运营/新媒体/内容 | 验证明确岗位方向识别和岗位能力承接 | `targetRoleStatus=known`；`targetRole` 包含“运营/新媒体/内容” | `START -> ASK_EXPERIENCE_STATUS` | 不允许只机械回复“好”；不允许忽略岗位方向 | 回复应提到内容敏感度、信息整理、发布执行、基础数据意识等能力线索 |
| C03 | 反问型用户 | 做过一个小组PPT算吗？ | 验证反问型经历线索能直接进入深挖 | `intent=ask_validation`；`hasExperience=true`；`experienceSeed` 包含“小组PPT” | `ASK_EXPERIENCE_STATUS -> DEEP_DIVE_SCENE` 或其他 `DEEP_DIVE_*` | 不允许继续让用户重新选经历；不允许把“算吗”写入正式字段 | 系统应先肯定可作为候选经历，再围绕场景/动作继续深挖 |
| C04 | 低信心用户 | 有一段经历，但是很水，没什么实际成效 | 验证低信心表达被接住并进入深挖 | `hasExperience=true`；`experienceConfidence=low`；`needsReassurance=true`；`intent=ask_validation` | `ASK_EXPERIENCE_STATUS -> DEEP_DIVE_ACTION` 或其他 `DEEP_DIVE_*` | 不允许否定用户经历；不允许进入经历盘点卡片；不允许直接生成 bullet | 回复应先接住“不一定没价值/先不判断强不强”，再引导拆动作和结果 |
| C05 | 信息错位用户 | 系统问场景时：我负责写文案 | 验证用户答非所问时 Field Reconciler 能优先吸收真实字段 | `action=撰写文案` 或结合上下文为“撰写抖音短视频文案”；`role=负责文案`；`scene` 不应被错误写成该输入 | `DEEP_DIVE_SCENE -> DEEP_DIVE_SCENE` 或转向缺失 `scene` 的下一问 | 不允许把“我负责写文案”写成 scene；不允许重复问“你主要负责哪一部分” | 下一轮应承接“文案这块记下来了”，再补问课程项目/社团宣传/账号内容发布等 scene |
| C06 | 信息丰富用户 | 我在社团负责发布抖音宣传视频，写文案，最后有10万浏览量 | 验证单句信息密集输入能被拆成多个字段 | `experienceSeed=抖音宣传视频`；`scene` 包含社团宣传；`action` 包含发布/文案撰写；`resultMetric` 包含约10万浏览量；浏览量不进入 `scale` | `ASK_EXPERIENCE_STATUS -> DEEP_DIVE_* -> VALUE_EVALUATION` 或只补一个关键字段 | 不允许重复问已回答字段；不允许把浏览量当作规模/周期；不允许原话拼接 | 系统应只追问缺失的关键字段，或在核心字段足够时进入评价/生成策略 |
| C07 | 低质量输入用户 | 我帮忙做了一些事情 | 验证 Generation Policy 阻断低质量输入直接生成 | `lowQualityFields` 包含 `action`；`gateStatus=recoverable`；`canGenerateFormalBullet=false`；`recoveryType=low_quality_field` | `DEEP_DIVE_* -> Generation Policy -> Recovery` | 不允许进入正式 `RESUME_TRANSLATION`；不允许生成空泛 bullet | 系统应追问具体动作，例如整理、核对、发布、剪辑、通知等 |
| C08 | 连续卡住用户 | 不知道 -> 没有 -> 想不起来 | 验证多轮卡住时的降级策略和非正式输出 | `intent=uncertain/reject`；`stuckCount` 递增；多轮后 `gateStatus=fail`；`outputType=experience_lead` 或 `guidance_only` | `DEEP_DIVE_* -> Recovery -> fallback OUTPUT_RESULT` 或停留引导 | 不允许重复同一句兜底；不允许生成正式 bullet；不允许强行编造经历 | 第一次给例子，第二次给选择题，第三次推荐最低门槛入口或保存为经历线索 |

## 使用方式

人工测试时，逐条输入 case 中的用户输入序列，观察：

- 是否正确承接用户语气和信心状态。
- 是否把信息写入正确字段，而不是只按当前状态机械推进。
- 是否避免重复追问已经回答过的字段。
- 是否在信息不足或低质量时阻断正式简历生成。
- 是否在输出草稿时清洗口语、避免夸大和原话拼接。

自动测试时，可读取 `scripts/conversation-testset-v1.0.json`，逐 case 调用状态机并断言 `expected` 中的字段、状态路径、禁止词和验收标准。
