import { callFieldReconcilerApi, callGenerationPolicyApi, callInputInterpreterApi, callQuestionGeneratorApi, callResumeTranslationApi } from "./realApi.js";
import {
  getDeepDiveActionMessage,
  getDeepDiveResultMessage,
  getDeepDiveSceneMessage,
  isDeepDiveStuckInput,
} from "./prompts.js";

export const STATES = {
  START: "START",
  ASK_EXPERIENCE_STATUS: "ASK_EXPERIENCE_STATUS",
  INVENTORY_SCREENING: "INVENTORY_SCREENING",
  SELECT_EXPERIENCE: "SELECT_EXPERIENCE",
  DEEP_DIVE_SCENE: "DEEP_DIVE_SCENE",
  DEEP_DIVE_ACTION: "DEEP_DIVE_ACTION",
  DEEP_DIVE_RESULT: "DEEP_DIVE_RESULT",
  MISSING_INFO_FOLLOWUP: "MISSING_INFO_FOLLOWUP",
  USER_CONFIRMATION: "USER_CONFIRMATION",
  OUTPUT_RESULT: "OUTPUT_RESULT",
};

const quickReplies = {
  START: ["运营/新媒体/内容", "行政/助理/文职", "产品/项目助理", "教育/教务/培训", "暂时不确定"],
  ASK_EXPERIENCE_STATUS: ["有，我想写一段经历", "没有/不确定，帮我找找", "我只有很普通的小事"],
  INVENTORY_SCREENING: ["课程作业/小组项目", "社团/班级事务", "帮老师或同学做事", "兼职/实习", "账号运营/内容发布", "志愿活动/校园活动", "自己做过的小作品", "都不确定"],
  USER_CONFIRMATION: ["基本符合", "有点夸大", "还需要改"],
  OUTPUT_RESULT: ["继续补第二段经历", "生成经历草稿", "重新整理这一段"],
};

const stageMap = {
  START: 1,
  ASK_EXPERIENCE_STATUS: 2,
  INVENTORY_SCREENING: 3,
  SELECT_EXPERIENCE: 3,
  DEEP_DIVE_SCENE: 4,
  DEEP_DIVE_ACTION: 4,
  DEEP_DIVE_RESULT: 4,
  MISSING_INFO_FOLLOWUP: 4,
  USER_CONFIRMATION: 5,
  OUTPUT_RESULT: 5,
};

const flowCommands = {
  HAS_EXPERIENCE: "有，我想写一段经历",
  FIND_EXPERIENCE: "没有/不确定，帮我找找",
  ORDINARY_THINGS: "我只有很普通的小事",
  CONTINUE_SECOND: "继续补第二段经历",
  SAVE_DRAFT: "保存这段经历草稿",
  SHOW_DRAFT: "生成经历草稿",
  REWORK: "重新整理这一段",
  CONFIRM_OK: "基本符合",
  CONFIRM_OVERSTATED: "有点夸大",
  CONFIRM_NEEDS_EDIT: "还需要改",
};

const broadExperienceTypeMap = [
  { tokens: ["实习", "兼职", "兼职/实习"], label: "兼职/实习" },
  { tokens: ["社团", "班级", "社团/班级事务"], label: "社团/班级事务" },
  { tokens: ["课程作业", "课程", "小组项目", "课程作业/小组项目"], label: "课程作业/小组项目" },
  { tokens: ["账号运营", "内容发布", "账号运营/内容发布"], label: "账号运营/内容发布" },
  { tokens: ["志愿活动", "校园活动", "志愿活动/校园活动"], label: "志愿活动/校园活动" },
  { tokens: ["作品", "小作品", "自己做过的小作品"], label: "自己做过的小作品" },
];

function createEmptyCurrentExperience() {
  return {
    scene: "",
    action: "",
    result: "",
    scale: "",
    role: "",
    resultMetric: "",
    knownFacts: [],
    missingInfoPriority: "",
  };
}

function createEmptyEvaluation() {
  return {
    score: 0,
    level: "信息不足",
    recommendedSection: "待补充",
    isMainExperienceCandidate: false,
    dimensionScores: {
      scene: 0,
      action: 0,
      result: 0,
      scale: 0,
    },
    strengths: [],
    weaknesses: [],
    missingInfoPriority: [],
    nextQuestion: "",
    rewriteRisk: "medium",
    allowedPositioning: [],
    forbiddenClaims: [
      "主导",
      "独立负责",
      "显著提升",
      "大幅增长",
      "获奖",
      "排名",
      "转化率",
      "用户增长",
    ],
    readyToGenerate: false,
  };
}

function createInitialSchema() {
  return {
    session: {
      currentState: STATES.START,
      stage: STATES.START,
      mode: "",
      conversation: [],
      stuckCounts: {},
    },
    userProfile: {
      targetRoleStatus: "",
      targetRole: "",
    },
    experienceDiscovery: {
      experienceStatus: "",
      selectedExperienceTypes: [],
      recommendedExperienceType: "",
      experienceSeed: "",
      screeningReason: "",
    },
    currentExperience: createEmptyCurrentExperience(),
    evaluation: createEmptyEvaluation(),
    resumeDraft: {
      resumeBullets: [],
      experienceCard: null,
      usedFacts: [],
      riskWarnings: [],
      needsUserConfirmation: false,
      userConfirmation: "",
      source: "",
    },
    nextAction: {
      recommendedNextAction: "",
      nextQuestions: [],
      quickReplies: [],
    },
    runtime: {
      resumeTranslationFallbackUsed: false,
      inputInterpreterFallbackUsed: false,
      questionGeneratorFallbackUsed: false,
      generationPolicyFallbackUsed: false,
      generationPolicyRecoveryCount: 0,
      lastInputInterpretation: null,
      lastFieldReconciliation: null,
      lastQuestionGeneration: null,
      lastGenerationPolicy: null,
    },
  };
}

function cloneData(data) {
  return JSON.parse(JSON.stringify(data));
}

function parseExperienceTypes(input) {
  const clean = input.trim();
  if (!clean) return [];
  return clean
    .split(/[，,、\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 3);
}

function isMeaningfulCoreField(value) {
  const clean = value.trim();
  if (!clean) return false;
  if (isDeepDiveStuckInput(clean)) return false;
  return !["做过一点", "一点", "有一点", "不太记得", "随便做了点"].some((phrase) => clean.includes(phrase));
}

function joinMessages(...parts) {
  return parts
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join("\n\n");
}

function isInterpretedStuck(interpretation) {
  return interpretation?.intent === "uncertain" || interpretation?.intent === "reject";
}

function countOccurrences(text, phrase) {
  return String(text || "").split(phrase).length - 1;
}

function normalizeCommandText(input = "") {
  return String(input || "").trim().replace(/\s/g, "");
}

function isFlowCommand(input, command) {
  return normalizeCommandText(input) === normalizeCommandText(command);
}

function isAskExperienceSeedCommand(input) {
  return isFlowCommand(input, flowCommands.HAS_EXPERIENCE);
}

function isInventoryEntryCommand(input) {
  return isFlowCommand(input, flowCommands.FIND_EXPERIENCE) || isFlowCommand(input, flowCommands.ORDINARY_THINGS);
}

function isMixedExperienceInput(input = "") {
  const normalized = normalizeCommandText(input);
  const hasInternship = /实习|客户表|客户信息/.test(normalized);
  const hasClubContent = /社团|抖音|视频|账号|内容/.test(normalized);
  const hasConnector = /也|还|同时|另外|，|,|、/.test(input);
  return hasInternship && hasClubContent && hasConnector;
}

function makeMixedExperienceChoiceMessage() {
  return "这里其实有两段经历，我们先选一件最具体的小事来写。你想先写实习里的客户表整理，还是社团抖音发布？";
}

function getBroadExperienceType(input = "") {
  const normalized = normalizeCommandText(input);
  if (!normalized) return "";

  for (const item of broadExperienceTypeMap) {
    if (item.tokens.some((token) => normalizeCommandText(token) === normalized)) {
      return item.label;
    }
  }

  return "";
}

function makeAskExperienceSeedMessage() {
  return "可以，那你先随便说一句这段经历是什么。比如是哪段实习、哪个课程项目、哪个活动里的一件小事？";
}

function makeInventorySelectionMessage(selectedTypes = []) {
  const primaryType = selectedTypes[0] || "这个方向";
  if (primaryType.includes("实习") || primaryType.includes("兼职")) {
    return "可以，先从这类经历里挑一件最具体的小事。比如实习里你整理过资料、做过表格、沟通过信息，或者协助过一次活动？随便说一个就行。";
  }
  if (primaryType.includes("账号") || primaryType.includes("内容")) {
    return "可以，账号运营/内容发布这个方向可以拆。你先想一个最具体的内容动作，比如发布过一条抖音或小红书、写过一篇推文、剪过一段视频，随便说一句就行。";
  }
  if (primaryType.includes("课程") || primaryType.includes("小组")) {
    return "可以，课程作业或小组项目这个方向可以拆。你先想一件最具体的小事，比如做过一次 PPT、整理过资料、汇总过问卷，随便说一句就行。";
  }
  return `可以，${primaryType}这个方向可以拆。你先想一件最具体的小事，随便说一句就行。`;
}

function makeActionFollowupForSeed(seed = "") {
  if (seed.includes("抖音") || seed.includes("内容") || seed.includes("账号")) {
    return "这个已经可以拆了。你当时主要负责哪一部分？比如选题、拍摄、剪辑、发布、标题文案，还是数据复盘？";
  }
  if (seed.includes("PPT") || seed.includes("小组")) {
    return "这个已经可以拆了。你当时主要负责哪一部分？比如整理资料、做 PPT、排版、汇报，还是和组员对接？";
  }
  return "好，我们就围绕这件事往下拆。你当时主要负责哪一部分？";
}

function makeSceneFollowupAfterAcknowledgement(input = "") {
  if (input.includes("PPT") || input.includes("小组")) {
    return "先确认一个小背景：它是课程小组作业、课堂展示，还是社团/班级里的小组任务？";
  }
  if (input.includes("经历") || input.includes("很水")) {
    return "我们先只确认场景：这件事大概发生在课程、社团/班级、兼职，还是帮老师同学做事的时候？";
  }
  return "先确认一个小背景：这件事大概发生在课程、社团/班级、兼职，还是帮老师同学做事的时候？";
}

function makeInventoryStuckMessage(count) {
  if (count <= 1) {
    return "没关系，这种情况很常见。你可以先从最低压力入口里选一个：课程作业或小组展示、社团班级事务、兼职或帮别人处理资料。";
  }
  if (count === 2) {
    return "没关系，我们换成选择题。它更像发生在：课程作业或小组展示 / 社团班级事务 / 兼职或帮别人处理资料？选一个最接近的就行。";
  }
  return "那我们先用最低门槛入口：课程作业或小组展示。你只要说有没有类似“小组 PPT、课堂展示、课程报告”这类小事就行。";
}

function inferConcreteExperienceFromInput(input) {
  const normalized = input.replace(/\s/g, "");
  const inferred = {
    isConcrete: false,
    seed: "",
    scene: "",
    result: "",
    scale: "",
  };

  if (normalized.includes("抖音") || normalized.includes("发布") || normalized.includes("小红书") || normalized.includes("推文")) {
    inferred.isConcrete = true;
    inferred.seed = normalized.includes("抖音") ? "发布抖音" : input;
  }

  const resultMatch = input.match(/[^，,。]*?(?:\d+(?:\.\d+)?|十|百|千|万)[^，,。]*?(?:浏览量|浏览|播放量|播放|观看|阅读)[^，,。]*/);
  if (resultMatch) {
    inferred.isConcrete = true;
    inferred.result = resultMatch[0].trim();
  }

  return inferred;
}

function inferFieldsFromInput(input) {
  const normalized = input.replace(/\s/g, "");
  const fields = {};

  if (normalized.includes("社团") || normalized.includes("宣传活动") || normalized.includes("宣传社团活动")) {
    fields.scene = input;
  } else if (normalized.includes("课程") || normalized.includes("课堂") || normalized.includes("小组作业") || normalized.includes("创业课") || normalized.includes("老师让做")) {
    fields.scene = input;
  }

  if (["选题", "拍摄", "剪辑", "发布", "标题", "文案", "数据复盘", "通知", "整理", "排版", "汇报", "负责"].some((phrase) => normalized.includes(phrase))) {
    fields.action = input;
  }

  const useMatch = input.match(/用于[^，,。]+|支持[^，,。]+|帮助[^，,。]+|获得[^，,。]+|给[^，,。]+用/);
  if (useMatch) {
    fields.result = useMatch[0].trim();
  }

  const resultMatch = input.match(/[^，,。]*?(?:\d+(?:\.\d+)?|十|百|千|万)[^，,。]*?(?:浏览量|浏览|播放量|播放|观看|阅读)[^，,。]*/);
  if (resultMatch) {
    fields.result = resultMatch[0].trim();
    fields.resultMetric = resultMatch[0].trim();
  }

  return fields;
}

function fieldQuality(value = "") {
  const clean = String(value || "").trim();
  if (!clean) return "missing";
  if (clean.length <= 2 || ["帮忙", "参与", "完成了", "有用", "活动"].includes(clean)) return "low";
  return "usable";
}

function isCleanerField(newValue = "", oldValue = "") {
  const cleanNew = String(newValue || "").trim();
  const cleanOld = String(oldValue || "").trim();
  if (!cleanNew) return false;
  if (!cleanOld) return true;
  const dirtyWords = ["算吗", "就是刚才", "老师让做", "介绍自己卖的东西", "嗯", "我们组那个", "这种小事"];
  const newDirty = dirtyWords.some((word) => cleanNew.includes(word));
  const oldDirty = dirtyWords.some((word) => cleanOld.includes(word));
  if (oldDirty && !newDirty) return true;
  if (fieldQuality(cleanOld) !== "usable" && fieldQuality(cleanNew) === "usable") return true;
  return cleanNew.length > cleanOld.length && !newDirty;
}

function mergeFieldIfBetter(schema, field, value) {
  if (!value) return;
  if (field === "resultMetric") {
    schema.currentExperience.resultMetric = value;
    return;
  }
  if (field === "experienceSeed") {
    if (!schema.experienceDiscovery.experienceSeed || isCleanerField(value, schema.experienceDiscovery.experienceSeed)) {
      schema.experienceDiscovery.experienceSeed = value;
    }
    return;
  }
  if (isCleanerField(value, schema.currentExperience[field])) {
    schema.currentExperience[field] = value;
  }
}

function hasExtractedFields(reconciliation) {
  const fields = reconciliation?.extractedFields || {};
  return ["scene", "action", "result", "scale", "role", "resultMetric", "experienceSeed"].some((field) => Boolean(fields[field]));
}

function hasCoreReadyForEvaluation(schema) {
  return (
    isMeaningfulCoreField(schema.currentExperience.scene) &&
    isMeaningfulCoreField(schema.currentExperience.action) &&
    (isMeaningfulCoreField(schema.currentExperience.result) || isMeaningfulCoreField(schema.currentExperience.resultMetric || ""))
  );
}

function evaluateCurrentExperience(schema) {
  const evaluation = createEmptyEvaluation();
  const { scene, action, result, scale, resultMetric } = schema.currentExperience;
  const hasScene = isMeaningfulCoreField(scene);
  const hasAction = isMeaningfulCoreField(action);
  const hasResult = isMeaningfulCoreField(result) || isMeaningfulCoreField(resultMetric || "");
  const hasScale = isMeaningfulCoreField(scale);

  evaluation.dimensionScores = {
    scene: hasScene ? 18 : 0,
    action: hasAction ? 18 : 0,
    result: hasResult ? 18 : 0,
    scale: hasScale ? 20 : 0,
  };
  evaluation.readyToGenerate = hasScene && hasAction && hasResult;
  evaluation.score =
    evaluation.dimensionScores.scene +
    evaluation.dimensionScores.action +
    evaluation.dimensionScores.result +
    evaluation.dimensionScores.scale;

  if (!hasScene) evaluation.missingInfoPriority.push("scene");
  if (!hasAction) evaluation.missingInfoPriority.push("action");
  if (!hasResult) evaluation.missingInfoPriority.push("result");
  if (evaluation.readyToGenerate && !hasScale) evaluation.missingInfoPriority.push("scale");

  schema.currentExperience.missingInfoPriority = evaluation.missingInfoPriority[0] || "";
  schema.currentExperience.knownFacts = [scene, action, result, resultMetric, scale].filter(Boolean);

  evaluation.level = evaluation.readyToGenerate ? "可写经历" : "辅助经历";
  evaluation.recommendedSection = evaluation.readyToGenerate ? "项目经历/校园经历" : "经历素材库";
  evaluation.isMainExperienceCandidate = evaluation.readyToGenerate && evaluation.score >= 60;
  evaluation.strengths = [
    hasScene ? "已有明确场景" : "",
    hasAction ? "已有真实动作" : "",
    hasResult ? "已有用途或结果" : "",
  ].filter(Boolean);
  evaluation.weaknesses = [
    !hasScene ? "缺少经历场景" : "",
    !hasAction ? "缺少具体动作" : "",
    !hasResult ? "缺少结果或用途" : "",
    evaluation.readyToGenerate && !hasScale ? "缺少规模或周期信息" : "",
  ].filter(Boolean);
  evaluation.nextQuestion =
    evaluation.missingInfoPriority[0] === "scale"
      ? "这件事大概涉及多少人、多少份资料、几次活动，或者持续了多久？大概数也可以。"
      : "";
  evaluation.rewriteRisk = evaluation.readyToGenerate ? "low" : "medium";
  evaluation.allowedPositioning = [
    schema.userProfile.targetRole,
    evaluation.level,
    "项目协作",
    "资料整理",
    "执行支持",
  ].filter(Boolean);

  return evaluation;
}

function getPrimaryResumeBullet(schema) {
  return schema.resumeDraft.resumeBullets[0] || "";
}

function cleanDisplayText(value = "") {
  return String(value || "")
    .replace(/算吗/g, "")
    .replace(/就是/g, "")
    .replace(/刚才那个/g, "")
    .replace(/刚才/g, "")
    .replace(/嗯+/g, "")
    .replace(/我负责/g, "负责")
    .replace(/有一个有/g, "获得")
    .replace(/我们组/g, "小组")
    .replace(/有(\d+万浏览量)/g, "约$1")
    .replace(/我们创业课老师让做的[，,、]*/g, "创业课程")
    .replace(/创业课老师让做的[，,、]*/g, "创业课程")
    .replace(/老师让做的[，,、]*/g, "")
    .replace(/介绍自己卖的东西/g, "产品展示")
    .replace(/\s+/g, "")
    .replace(/^[，,、。]+|[，,、。]+$/g, "")
    .slice(0, 42);
}

function displayScene(value = "") {
  const text = String(value || "");
  if (/创业课|创业课程|老师让做|产品展示|介绍自己卖的东西/.test(text)) return "创业课程产品展示短视频";
  if (/社团|宣传活动/.test(text)) return "社团活动宣传内容";
  if (/抖音|短视频/.test(text)) return "抖音短视频内容发布";
  return cleanDisplayText(text) || "暂未填写";
}

function displayAction(value = "") {
  const text = String(value || "");
  if (/抖音|短视频/.test(text) && /文案|标题/.test(text)) return "撰写抖音短视频文案";
  if (/发布/.test(text) && /抖音|短视频/.test(text)) return "发布抖音短视频";
  return cleanDisplayText(text) || "暂未填写";
}

function displayResultUse(schema) {
  const { scene, action, result } = schema.currentExperience;
  const combined = [scene, action, result].join(" ");
  if (/创业课|创业课程|产品展示|介绍自己卖的东西/.test(combined)) return "支持小组完成产品展示";
  if (/社团|宣传活动/.test(combined)) return "用于社团活动宣传";
  const cleaned = cleanDisplayText(result);
  if (/浏览|播放/.test(cleaned)) return "暂未填写";
  return cleaned || "暂未填写";
}

  function displayResultMetric(schema) {
  const combined = [schema.currentExperience.resultMetric, schema.currentExperience.result, schema.currentExperience.scale].join(" ");
  const match = combined.match(/(?:约)?(?:\d+(?:\.\d+)?|十|百|千|万)+\s*万?[^，,。]*?(?:浏览量|浏览|播放量|播放|观看|阅读)/);
  if (!match) return "";
  let metric = cleanDisplayText(match[0]);
  metric = metric.replace(/^有/, "").replace(/^获得/, "").replace(/浏览$/, "浏览量");
  if (!metric.startsWith("约") && /10万|十万/.test(metric)) metric = `约${metric}`;
  if (!metric.includes("单条内容")) metric = `单条内容${metric}`;
  return metric;
}

function displayScale(schema) {
  const scale = cleanDisplayText(schema.currentExperience.scale);
  if (!scale || /浏览|播放|观看|阅读/.test(scale)) return "未补充";
  return scale;
}

function buildOutputMessage(schema) {
  const bullet = getPrimaryResumeBullet(schema) || "暂未生成经历草稿。";
  const resultMetric = displayResultMetric(schema);

  return `这一段我们先整理成这样：

经历草稿：
- ${bullet}

已提取信息：
- 目标方向：${cleanDisplayText(schema.userProfile.targetRole) || "暂未确定"}
- 经历场景：${displayScene(schema.currentExperience.scene)}
- 具体动作：${displayAction(schema.currentExperience.action)}
- 结果/用途：${displayResultUse(schema)}
${resultMetric ? `- 结果数据：${resultMetric}\n` : ""}- 规模/周期：${displayScale(schema)}

下一步可以继续补第二段经历，或者先保存这段经历草稿。`;
}

export function createStateMachine() {
  const schema = createInitialSchema();

  function dataSnapshot() {
    return cloneData(schema);
  }

  function resetStuckCount(state = schema.session.currentState) {
    schema.session.stuckCounts[state] = 0;
  }

  function incrementStuckCount(state = schema.session.currentState) {
    schema.session.stuckCounts[state] = (schema.session.stuckCounts[state] || 0) + 1;
    return schema.session.stuckCounts[state];
  }

  function getMissingField() {
    if (isMeaningfulCoreField(schema.currentExperience.result) && !isMeaningfulCoreField(schema.currentExperience.action)) return "action";
    if (!isMeaningfulCoreField(schema.currentExperience.scene)) return "scene";
    if (!isMeaningfulCoreField(schema.currentExperience.action)) return "action";
    if (!isMeaningfulCoreField(schema.currentExperience.result) && !isMeaningfulCoreField(schema.currentExperience.resultMetric || "")) return "result";
    if (!isMeaningfulCoreField(schema.currentExperience.scale)) return "scale";
    return "role";
  }

  function getStateForField(field) {
    if (field === "scene") return STATES.DEEP_DIVE_SCENE;
    if (field === "action" || field === "role") return STATES.DEEP_DIVE_ACTION;
    if (field === "result") return STATES.DEEP_DIVE_RESULT;
    return STATES.MISSING_INFO_FOLLOWUP;
  }

  function applySemanticFields(input, expectedField = "") {
    const fields = inferFieldsFromInput(input);

    if (fields.scene) schema.currentExperience.scene = fields.scene;
    if (fields.action) schema.currentExperience.action = fields.action;
    if (fields.result) schema.currentExperience.result = fields.result;
    if (fields.scale) schema.currentExperience.scale = fields.scale;

    if (!fields.scene && !fields.action && !fields.result && !fields.scale && expectedField) {
      if (expectedField === "scene") schema.currentExperience.scene = input;
      if (expectedField === "action" || expectedField === "role") schema.currentExperience.action = input;
      if (expectedField === "result") schema.currentExperience.result = input;
      if (expectedField === "scale") schema.currentExperience.scale = input;
    }
  }

  async function generateQuestion({ userInput = "", inputInterpretation = null, missingField = getMissingField(), stuckCount = 0 } = {}) {
    const question = await callQuestionGeneratorApi({
      currentState: schema.session.currentState,
      userInput,
      inputInterpretation: inputInterpretation || schema.runtime.lastInputInterpretation,
      currentExperience: cloneData(schema.currentExperience),
      targetRole: schema.userProfile.targetRole,
      missingField,
      stuckCount,
    });
    schema.runtime.lastQuestionGeneration = cloneData(question);
    schema.runtime.questionGeneratorFallbackUsed = Boolean(question.fallbackUsed);
    return question;
  }

  async function reconcileUserInput(input, inputInterpretation = null) {
    const reconciliation = await callFieldReconcilerApi({
      currentState: schema.session.currentState,
      userInput: input,
      inputInterpretation: inputInterpretation || schema.runtime.lastInputInterpretation,
      currentExperience: cloneData({
        ...schema.currentExperience,
        experienceSeed: schema.experienceDiscovery.experienceSeed,
      }),
      targetRole: schema.userProfile.targetRole,
    });
    schema.runtime.lastFieldReconciliation = cloneData(reconciliation);

    const extracted = reconciliation.extractedFields || {};
    ["scene", "action", "result", "scale", "role", "resultMetric", "experienceSeed"].forEach((field) => {
      mergeFieldIfBetter(schema, field, extracted[field]);
    });

    return reconciliation;
  }

  async function makeGeneratedQuestionResponse({ userInput = "", inputInterpretation = null, missingField = getMissingField(), stuckCount = 0 } = {}) {
    const question = await generateQuestion({ userInput, inputInterpretation, missingField, stuckCount });
    return makeResponse({
      assistantMessage: question.assistantMessage,
      nextState: getStateForField(question.targetField || missingField),
    });
  }

  async function runGenerationPolicy() {
    const policy = await callGenerationPolicyApi({
      currentState: schema.session.currentState,
      currentExperience: cloneData(schema.currentExperience),
      evaluation: cloneData(schema.evaluation),
      inputInterpretation: schema.runtime.lastInputInterpretation,
      missingInfoPriority: schema.evaluation.missingInfoPriority,
      recoveryCount: schema.runtime.generationPolicyRecoveryCount,
    });
    schema.runtime.lastGenerationPolicy = cloneData(policy);
    schema.runtime.generationPolicyFallbackUsed = Boolean(policy.fallbackUsed);
    return policy;
  }

  function makeGenerationPolicyRecoveryResponse(policy) {
    schema.runtime.generationPolicyRecoveryCount += 1;
    const field = policy.lowQualityFields?.[0] || policy.missingFields?.[0] || "action";
    return makeResponse({
      assistantMessage: policy.nextQuestion || "这段现在还不能直接写成简历。我们先补一个更具体的信息：你当时真实做过的一个小动作是什么？",
      nextState: getStateForField(field),
    });
  }

  function makeGenerationPolicyFailResponse(policy) {
    const { scene, action, result } = schema.currentExperience;
    const lead = [scene, action, result].filter(Boolean).join("；") || schema.experienceDiscovery.experienceSeed || "这段经历线索";
    schema.resumeDraft = {
      ...schema.resumeDraft,
      resumeBullets: [],
      experienceCard: {
        scene,
        action,
        result,
        scale: schema.currentExperience.scale,
      },
      usedFacts: [scene, action, result, schema.currentExperience.scale].filter(Boolean),
      riskWarnings: ["Generation Policy 阻止生成正式简历 bullet：当前信息尚未达到最小表达粒度。"],
      needsUserConfirmation: false,
      source: "generationPolicy",
    };

    return makeResponse({
      assistantMessage: `这段我先不硬写成简历句子，避免写得空泛或像编出来的。\n\n我会先把它保存成经历线索：${lead}\n\n下一步可以换一段更清楚的经历，或者之后再回来补具体场景、动作和用途。`,
      quickReplyOptions: quickReplies.OUTPUT_RESULT,
      nextState: STATES.OUTPUT_RESULT,
    });
  }

  async function handleEvaluatedExperience() {
    const policy = await runGenerationPolicy();

    if (policy.gateStatus === "fail") {
      return makeGenerationPolicyFailResponse(policy);
    }

    if (!policy.canGenerateFormalBullet) {
      return makeGenerationPolicyRecoveryResponse(policy);
    }

    if (policy.needsRecovery && policy.outputType === "draft_bullet" && schema.runtime.generationPolicyRecoveryCount < 1) {
      return makeGenerationPolicyRecoveryResponse(policy);
    }

    schema.runtime.generationPolicyRecoveryCount = 0;
    return makeResumeTranslationResponse();
  }

  function makeStuckGuidance(state, count) {
    if (count <= 1) {
      if (state === STATES.DEEP_DIVE_ACTION) return getDeepDiveActionMessage("不知道");
      if (state === STATES.DEEP_DIVE_RESULT) return getDeepDiveResultMessage("不知道");
      return getDeepDiveSceneMessage("不知道");
    }

    if (count === 2) {
      if (state === STATES.DEEP_DIVE_ACTION) {
        return "没关系，我们换成选择题。你当时更像是在做哪一种：整理资料 / 做 PPT 或排版 / 通知或对接别人？选一个最接近的就行。";
      }
      if (state === STATES.DEEP_DIVE_RESULT) {
        return "没关系，我们换个方式选。它后来更像是给谁用：小组课堂展示 / 老师或同学查看 / 活动或任务后续执行？选一个接近的就行。";
      }
      return "没关系，我们换成选择题。它更像发生在：课程作业或小组展示 / 社团班级事务 / 兼职或帮别人处理资料？选一个最接近的就行。";
    }

    if (state === STATES.DEEP_DIVE_ACTION) {
      return "那我们先用最低门槛入口：如果这是课程作业或小组展示，你可以先说“我做了 PPT”或“我整理了资料”，后面再慢慢修。";
    }
    if (state === STATES.DEEP_DIVE_RESULT) {
      return "那我们先用最低门槛入口：如果是课程作业或小组展示，结果可以先记成“用于课堂展示或小组提交”。如果不准确，你再改。";
    }
    return "那我们先用最低门槛入口：课程作业或小组展示。你只要说有没有类似“小组 PPT、课堂展示、课程报告”这类小事就行。";
  }

  async function interpretUserInput(input) {
    const interpretation = await callInputInterpreterApi({
      currentState: schema.session.currentState,
      schema: dataSnapshot(),
      userInput: input,
    });
    schema.runtime.lastInputInterpretation = cloneData(interpretation);
    schema.runtime.inputInterpreterFallbackUsed = Boolean(interpretation.fallbackUsed);
    return interpretation;
  }

  function applyInterpretationToSchema(interpretation, input) {
    if (interpretation.hasTargetRole || interpretation.targetRoleStatus === "uncertain") {
      schema.userProfile.targetRoleStatus = interpretation.targetRoleStatus || "unknown";
      schema.userProfile.targetRole = interpretation.hasTargetRole
        ? interpretation.targetRole || input
        : "";
    }

    if (interpretation.hasExperience) {
      schema.experienceDiscovery.experienceStatus =
        interpretation.experienceConfidence === "low" ? "hasExperience_lowConfidence" : "hasExperience";
    } else if (interpretation.intent === "reject" || interpretation.intent === "uncertain") {
      schema.experienceDiscovery.experienceStatus = interpretation.intent;
    }

    if (interpretation.experienceSeed) {
      schema.experienceDiscovery.experienceSeed = interpretation.experienceSeed;
    }

    if (Array.isArray(interpretation.selectedExperienceTypes) && interpretation.selectedExperienceTypes.length) {
      schema.experienceDiscovery.selectedExperienceTypes = interpretation.selectedExperienceTypes.slice(0, 3);
    }

    if (interpretation.currentExperience) {
      const { scene, action, result, scale } = interpretation.currentExperience;
      if (scene) schema.currentExperience.scene = scene;
      if (action) schema.currentExperience.action = action;
      if (result) schema.currentExperience.result = result;
      if (scale && !/浏览|播放|观看|阅读|点赞/.test(scale)) schema.currentExperience.scale = scale;
      if (scale && /浏览|播放|观看|阅读|点赞/.test(scale)) schema.currentExperience.resultMetric = cleanDisplayText(scale);
    }

    const inferred = inferConcreteExperienceFromInput(input);
    if (inferred.isConcrete) {
      if (inferred.seed) schema.experienceDiscovery.experienceSeed = inferred.seed;
      if (inferred.result && !schema.currentExperience.result) schema.currentExperience.result = inferred.result;
      if (inferred.scale && !schema.currentExperience.scale) schema.currentExperience.scale = inferred.scale;
    }
  }

  function makeResponse({ assistantMessage, quickReplyOptions = [], nextState, stage = nextState }) {
    schema.session.currentState = nextState;
    schema.session.stage = stage;
    schema.session.conversation.push({ role: "assistant", content: assistantMessage, state: nextState });
    schema.nextAction.quickReplies = [...quickReplyOptions];

    return {
      assistantMessage,
      quickReplies: [...quickReplyOptions],
      nextState,
      stage,
      visualStage: stageMap[nextState] || 1,
      dataSnapshot: dataSnapshot(),
    };
  }

  function createResumeTranslationInput() {
    return {
      targetRole: schema.userProfile.targetRole,
      currentExperience: cloneData(schema.currentExperience),
      allowedPositioning: schema.evaluation.allowedPositioning,
      forbiddenClaims: schema.evaluation.forbiddenClaims,
      evaluation: {
        level: schema.evaluation.level,
        readyToGenerate: schema.evaluation.readyToGenerate,
        score: schema.evaluation.score,
        missingInfoPriority: schema.evaluation.missingInfoPriority,
      },
    };
  }

  async function translateResumeDraft() {
    const result = await callResumeTranslationApi(createResumeTranslationInput());
    schema.resumeDraft = {
      ...schema.resumeDraft,
      ...result.resumeDraft,
      userConfirmation: schema.resumeDraft.userConfirmation,
    };
    schema.runtime.resumeTranslationFallbackUsed = Boolean(result.fallbackUsed);
    return result;
  }

  async function makeResumeTranslationResponse() {
    await translateResumeDraft();
    return makeResponse({
      assistantMessage: `我先试着把它写成简历语言，你看看像不像你做过的事：

- ${getPrimaryResumeBullet(schema)}

这句话基本符合事实吗？`,
      quickReplyOptions: quickReplies.USER_CONFIRMATION,
      nextState: STATES.USER_CONFIRMATION,
    });
  }

  function makeCoreFieldFollowupResponse() {
    const missing = schema.evaluation.missingInfoPriority[0];

    if (missing === "scene") {
      return makeResponse({
        assistantMessage: getDeepDiveSceneMessage("不知道"),
        nextState: STATES.DEEP_DIVE_SCENE,
      });
    }

    if (missing === "action") {
      return makeResponse({
        assistantMessage: getDeepDiveActionMessage("不知道"),
        nextState: STATES.DEEP_DIVE_ACTION,
      });
    }

    return makeResponse({
      assistantMessage: getDeepDiveResultMessage("不知道"),
      nextState: STATES.DEEP_DIVE_RESULT,
    });
  }

  function makeSingleEnhancementFollowupResponse() {
    const question =
      schema.evaluation.nextQuestion ||
      "这件事大概涉及多少人、多少份资料、几次活动，或者持续了多久？大概数也可以。";

    return makeResponse({
      assistantMessage: `这段经历已经够写一版基础简历了。为了让它更具体，我只再补一个小问题：\n\n${question}`,
      nextState: STATES.MISSING_INFO_FOLLOWUP,
    });
  }

  function makeInventoryEntryResponse({ message = "", count = 1 } = {}) {
    return makeResponse({
      assistantMessage: message || (count > 1
        ? makeStuckGuidance(STATES.INVENTORY_SCREENING, count)
        : "没关系，很多能写进简历的事，一开始都不像经历。你可以先从下面这些低压力入口里选 1-3 个。"),
      quickReplyOptions: quickReplies.INVENTORY_SCREENING,
      nextState: STATES.INVENTORY_SCREENING,
    });
  }

  function getInitialResponse() {
    return makeResponse({
      assistantMessage: "我们先不急着写完整简历。你现在大概想投哪类岗位？不确定也可以，先做一版通用简历。",
      quickReplyOptions: quickReplies.START,
      nextState: STATES.START,
    });
  }

  async function handleUserInput(userText) {
    const input = userText.trim();
    schema.session.conversation.push({ role: "user", content: input, state: schema.session.currentState });

    switch (schema.session.currentState) {
      case STATES.START: {
        if (isMixedExperienceInput(input)) {
          resetStuckCount(STATES.START);
          schema.userProfile.targetRoleStatus = "uncertain";
          schema.experienceDiscovery.experienceStatus = "multiple_experience_candidates";
          schema.experienceDiscovery.selectedExperienceTypes = ["兼职/实习", "账号运营/内容发布"];
          schema.experienceDiscovery.experienceSeed = "";
          return makeResponse({
            assistantMessage: makeMixedExperienceChoiceMessage(),
            nextState: STATES.SELECT_EXPERIENCE,
          });
        }

        const interpretation = await interpretUserInput(input);
        applyInterpretationToSchema(interpretation, input);
        resetStuckCount(STATES.START);

        const acknowledgement =
          interpretation.acknowledgement ||
          (schema.userProfile.targetRoleStatus === "uncertain"
            ? "可以，我们先做一版通用简历素材，后面看到具体岗位时再把表达贴过去。"
            : "明白，我们先按这个方向整理。");
        const nextQuestion =
          schema.userProfile.targetRoleStatus === "uncertain"
            ? "你现在有一段想写进简历的经历吗？有的话随便说一句就行；没有的话我帮你一起找。"
            : "你现在有一段想写进简历的经历吗？有的话随便说一句就行；没有的话我帮你一起找。";
        return makeResponse({
          assistantMessage: joinMessages(acknowledgement, nextQuestion),
          quickReplyOptions: quickReplies.ASK_EXPERIENCE_STATUS,
          nextState: STATES.ASK_EXPERIENCE_STATUS,
        });
      }

      case STATES.ASK_EXPERIENCE_STATUS: {
        if (isMixedExperienceInput(input)) {
          resetStuckCount(STATES.ASK_EXPERIENCE_STATUS);
          schema.experienceDiscovery.experienceStatus = "multiple_experience_candidates";
          schema.experienceDiscovery.selectedExperienceTypes = ["兼职/实习", "账号运营/内容发布"];
          schema.experienceDiscovery.experienceSeed = "";
          return makeResponse({
            assistantMessage: makeMixedExperienceChoiceMessage(),
            nextState: STATES.SELECT_EXPERIENCE,
          });
        }

        if (isAskExperienceSeedCommand(input)) {
          resetStuckCount(STATES.ASK_EXPERIENCE_STATUS);
          schema.experienceDiscovery.experienceStatus = "has_experience";
          schema.experienceDiscovery.experienceSeed = "";
          return makeResponse({
            assistantMessage: makeAskExperienceSeedMessage(),
            nextState: STATES.SELECT_EXPERIENCE,
          });
        }

        if (isInventoryEntryCommand(input)) {
          const count = incrementStuckCount(STATES.ASK_EXPERIENCE_STATUS);
          schema.experienceDiscovery.experienceStatus = isFlowCommand(input, flowCommands.ORDINARY_THINGS)
            ? "ordinary"
            : "uncertain_or_none";
          return makeInventoryEntryResponse({
            count,
            message: "没关系，很多能写进简历的事，一开始都不像经历。你可以先从下面这些低压力入口里选 1-3 个。",
          });
        }

        const broadType = getBroadExperienceType(input);
        if (broadType) {
          resetStuckCount(STATES.ASK_EXPERIENCE_STATUS);
          schema.experienceDiscovery.experienceStatus = "experience_type_selected";
          schema.experienceDiscovery.selectedExperienceTypes = [broadType];
          schema.experienceDiscovery.experienceSeed = "";
          return makeResponse({
            assistantMessage: makeInventorySelectionMessage([broadType]),
            nextState: STATES.SELECT_EXPERIENCE,
          });
        }

        const interpretation = await interpretUserInput(input);
        applyInterpretationToSchema(interpretation, input);

        if (isInterpretedStuck(interpretation)) {
          const count = incrementStuckCount(STATES.ASK_EXPERIENCE_STATUS);
          return makeInventoryEntryResponse({
            count,
            message: count > 1
              ? makeStuckGuidance(STATES.INVENTORY_SCREENING, count)
            : "没关系，很多能写进简历的事，一开始都不像经历。你可以先从下面这些低压力入口里选 1-3 个。",
          });
        }

        const reconciliation = await reconcileUserInput(input, interpretation);
        if (interpretation.shouldGoToDeepDive || interpretation.hasExperience || hasExtractedFields(reconciliation)) {
          resetStuckCount(STATES.ASK_EXPERIENCE_STATUS);
          if (hasCoreReadyForEvaluation(schema)) {
            schema.evaluation = evaluateCurrentExperience(schema);
            return handleEvaluatedExperience();
          }
          const missingField = reconciliation.nextMissingField !== "none" ? reconciliation.nextMissingField : getMissingField();
          return makeGeneratedQuestionResponse({
            userInput: input,
            inputInterpretation: interpretation,
            missingField,
          });
        }

        resetStuckCount(STATES.ASK_EXPERIENCE_STATUS);
        return makeInventoryEntryResponse({
          message: "很多能写进简历的事，一开始都不像经历。你可以先从下面这些低压力入口里选 1-3 个。",
        });
      }

      case STATES.INVENTORY_SCREENING: {
        if (isMixedExperienceInput(input)) {
          resetStuckCount(STATES.INVENTORY_SCREENING);
          schema.experienceDiscovery.experienceStatus = "multiple_experience_candidates";
          schema.experienceDiscovery.selectedExperienceTypes = ["兼职/实习", "账号运营/内容发布"];
          schema.experienceDiscovery.experienceSeed = "";
          return makeResponse({
            assistantMessage: makeMixedExperienceChoiceMessage(),
            nextState: STATES.SELECT_EXPERIENCE,
          });
        }

        const broadType = getBroadExperienceType(input);
        if (broadType) {
          resetStuckCount(STATES.INVENTORY_SCREENING);
          schema.experienceDiscovery.experienceStatus = "experience_type_selected";
          schema.experienceDiscovery.selectedExperienceTypes = [broadType];
          schema.experienceDiscovery.experienceSeed = "";
          return makeResponse({
            assistantMessage: makeInventorySelectionMessage([broadType]),
            nextState: STATES.SELECT_EXPERIENCE,
          });
        }

        const interpretation = await interpretUserInput(input);
        applyInterpretationToSchema(interpretation, input);
        const reconciliation = await reconcileUserInput(input, interpretation);

        if (interpretation.shouldGoToDeepDive || interpretation.hasExperience) {
          resetStuckCount(STATES.INVENTORY_SCREENING);
          if (hasCoreReadyForEvaluation(schema)) {
            schema.evaluation = evaluateCurrentExperience(schema);
            return handleEvaluatedExperience();
          }
          return makeGeneratedQuestionResponse({
            userInput: input,
            inputInterpretation: interpretation,
            missingField: reconciliation.nextMissingField !== "none" ? reconciliation.nextMissingField : getMissingField(),
          });
        }

        if (isInterpretedStuck(interpretation) || interpretation.shouldStayInCurrentState) {
          const count = incrementStuckCount(STATES.INVENTORY_SCREENING);
          return makeResponse({
            assistantMessage: makeInventoryStuckMessage(count),
            quickReplyOptions: quickReplies.INVENTORY_SCREENING,
            nextState: STATES.INVENTORY_SCREENING,
          });
        }

        const selected = interpretation.selectedExperienceTypes.length
          ? interpretation.selectedExperienceTypes
          : parseExperienceTypes(input);
        schema.experienceDiscovery.selectedExperienceTypes = selected;

        if (!selected.length) {
          const count = incrementStuckCount(STATES.INVENTORY_SCREENING);
          return makeResponse({
            assistantMessage: makeInventoryStuckMessage(count),
            quickReplyOptions: quickReplies.INVENTORY_SCREENING,
            nextState: STATES.INVENTORY_SCREENING,
          });
        }

        resetStuckCount(STATES.INVENTORY_SCREENING);
        return makeResponse({
          assistantMessage: makeInventorySelectionMessage(selected),
          nextState: STATES.SELECT_EXPERIENCE,
        });
      }

      case STATES.SELECT_EXPERIENCE: {
        if (isMixedExperienceInput(input)) {
          resetStuckCount(STATES.SELECT_EXPERIENCE);
          schema.experienceDiscovery.experienceStatus = "multiple_experience_candidates";
          schema.experienceDiscovery.selectedExperienceTypes = ["兼职/实习", "账号运营/内容发布"];
          schema.experienceDiscovery.experienceSeed = "";
          return makeResponse({
            assistantMessage: makeMixedExperienceChoiceMessage(),
            nextState: STATES.SELECT_EXPERIENCE,
          });
        }

        if (isAskExperienceSeedCommand(input)) {
          schema.experienceDiscovery.experienceStatus = "has_experience";
          schema.experienceDiscovery.experienceSeed = "";
          return makeResponse({
            assistantMessage: makeAskExperienceSeedMessage(),
            nextState: STATES.SELECT_EXPERIENCE,
          });
        }

        const broadType = getBroadExperienceType(input);
        if (broadType) {
          resetStuckCount(STATES.SELECT_EXPERIENCE);
          schema.experienceDiscovery.experienceStatus = "experience_type_selected";
          schema.experienceDiscovery.selectedExperienceTypes = [broadType];
          schema.experienceDiscovery.experienceSeed = "";
          return makeResponse({
            assistantMessage: makeInventorySelectionMessage([broadType]),
            nextState: STATES.SELECT_EXPERIENCE,
          });
        }

        const interpretation = await interpretUserInput(input);
        applyInterpretationToSchema(interpretation, input);
        const reconciliation = await reconcileUserInput(input, interpretation);
        if (schema.experienceDiscovery.selectedExperienceTypes.length && !schema.currentExperience.scene) {
          schema.currentExperience.scene = schema.experienceDiscovery.selectedExperienceTypes[0];
        }

        if (isInterpretedStuck(interpretation) || interpretation.shouldStayInCurrentState) {
          const count = incrementStuckCount(STATES.SELECT_EXPERIENCE);
          if (count >= 3) {
            schema.runtime.generationPolicyRecoveryCount = 3;
            schema.evaluation = evaluateCurrentExperience(schema);
            return handleEvaluatedExperience();
          }
          return makeResponse({
            assistantMessage: makeInventoryStuckMessage(count),
            quickReplyOptions: count >= 2 ? quickReplies.INVENTORY_SCREENING : [],
            nextState: STATES.SELECT_EXPERIENCE,
          });
        }

        resetStuckCount(STATES.SELECT_EXPERIENCE);
        if (!hasExtractedFields(reconciliation)) applySemanticFields(input, "action");
        schema.experienceDiscovery.experienceSeed = interpretation.experienceSeed || input;
        const inferred = inferConcreteExperienceFromInput(input);
        if (inferred.isConcrete) {
          if (!schema.currentExperience.scene) {
            schema.currentExperience.scene = schema.experienceDiscovery.selectedExperienceTypes[0] || schema.experienceDiscovery.experienceSeed;
          }
          if (hasCoreReadyForEvaluation(schema)) {
            schema.evaluation = evaluateCurrentExperience(schema);
            return handleEvaluatedExperience();
          }
          return makeGeneratedQuestionResponse({
            userInput: input,
            inputInterpretation: interpretation,
            missingField: reconciliation.nextMissingField !== "none" ? reconciliation.nextMissingField : getMissingField(),
          });
        }
        if (hasCoreReadyForEvaluation(schema)) {
          schema.evaluation = evaluateCurrentExperience(schema);
          return handleEvaluatedExperience();
        }
        return makeGeneratedQuestionResponse({
          userInput: input,
          inputInterpretation: interpretation,
          missingField: reconciliation.nextMissingField !== "none" ? reconciliation.nextMissingField : getMissingField(),
        });
      }

      case STATES.DEEP_DIVE_SCENE: {
        if (isDeepDiveStuckInput(input)) {
          const count = incrementStuckCount(STATES.DEEP_DIVE_SCENE);
          if (count >= 3) {
            schema.runtime.generationPolicyRecoveryCount = 3;
            schema.evaluation = evaluateCurrentExperience(schema);
            return handleEvaluatedExperience();
          }
          return makeGeneratedQuestionResponse({
            userInput: input,
            missingField: "scene",
            stuckCount: count,
          });
        }
        resetStuckCount(STATES.DEEP_DIVE_SCENE);
        const interpretation = await interpretUserInput(input);
        applyInterpretationToSchema(interpretation, input);
        const reconciliation = await reconcileUserInput(input, interpretation);
        if (!hasExtractedFields(reconciliation)) applySemanticFields(input, "scene");
        if (hasCoreReadyForEvaluation(schema)) {
          schema.evaluation = evaluateCurrentExperience(schema);
          return handleEvaluatedExperience();
        }
        return makeGeneratedQuestionResponse({
          userInput: input,
          inputInterpretation: interpretation,
          missingField: reconciliation.nextMissingField !== "none" ? reconciliation.nextMissingField : getMissingField(),
        });
      }

      case STATES.DEEP_DIVE_ACTION: {
        if (isDeepDiveStuckInput(input)) {
          const count = incrementStuckCount(STATES.DEEP_DIVE_ACTION);
          if (count >= 3) {
            schema.runtime.generationPolicyRecoveryCount = 3;
            schema.evaluation = evaluateCurrentExperience(schema);
            return handleEvaluatedExperience();
          }
          return makeGeneratedQuestionResponse({
            userInput: input,
            missingField: "action",
            stuckCount: count,
          });
        }
        resetStuckCount(STATES.DEEP_DIVE_ACTION);
        const interpretation = await interpretUserInput(input);
        applyInterpretationToSchema(interpretation, input);
        const reconciliation = await reconcileUserInput(input, interpretation);
        if (!hasExtractedFields(reconciliation)) applySemanticFields(input, "action");
        if (!isMeaningfulCoreField(schema.currentExperience.action)) {
          return makeGeneratedQuestionResponse({
            userInput: input,
            inputInterpretation: interpretation,
            missingField: reconciliation.nextMissingField !== "none" ? reconciliation.nextMissingField : "action",
          });
        }
        if (hasCoreReadyForEvaluation(schema)) {
          schema.evaluation = evaluateCurrentExperience(schema);

          return handleEvaluatedExperience();
        }
        return makeGeneratedQuestionResponse({
          userInput: input,
          inputInterpretation: interpretation,
          missingField: reconciliation.nextMissingField !== "none" ? reconciliation.nextMissingField : getMissingField(),
        });
      }

      case STATES.DEEP_DIVE_RESULT: {
        if (isDeepDiveStuckInput(input)) {
          const count = incrementStuckCount(STATES.DEEP_DIVE_RESULT);
          if (count >= 3) {
            schema.runtime.generationPolicyRecoveryCount = 3;
            schema.evaluation = evaluateCurrentExperience(schema);
            return handleEvaluatedExperience();
          }
          return makeGeneratedQuestionResponse({
            userInput: input,
            missingField: "result",
            stuckCount: count,
          });
        }
        resetStuckCount(STATES.DEEP_DIVE_RESULT);
        const interpretation = await interpretUserInput(input);
        applyInterpretationToSchema(interpretation, input);
        const reconciliation = await reconcileUserInput(input, interpretation);
        if (!hasExtractedFields(reconciliation)) applySemanticFields(input, "result");
        if (hasCoreReadyForEvaluation(schema)) {
          schema.evaluation = evaluateCurrentExperience(schema);
          return handleEvaluatedExperience();
        }
        return makeGeneratedQuestionResponse({
          userInput: input,
          inputInterpretation: interpretation,
          missingField: reconciliation.nextMissingField !== "none" ? reconciliation.nextMissingField : getMissingField(),
        });
      }

      case STATES.MISSING_INFO_FOLLOWUP:
        {
          const interpretation = await interpretUserInput(input);
          applyInterpretationToSchema(interpretation, input);
          const reconciliation = await reconcileUserInput(input, interpretation);
          if (!hasExtractedFields(reconciliation)) applySemanticFields(input, "scale");
        }
        schema.evaluation = evaluateCurrentExperience(schema);
        return handleEvaluatedExperience();

      case STATES.USER_CONFIRMATION: {
        schema.resumeDraft.userConfirmation = input;
        const prefix =
          input.includes("夸大") || input.includes("改")
            ? "好，我们先不硬写。我会把它降一点表达，保留真实动作。\n\n"
            : "";
        return makeResponse({
          assistantMessage: `${prefix}${buildOutputMessage(schema)}`,
          quickReplyOptions: quickReplies.OUTPUT_RESULT,
          nextState: STATES.OUTPUT_RESULT,
        });
      }

      case STATES.OUTPUT_RESULT:
        if (input.includes("继续")) {
          schema.experienceDiscovery.experienceStatus = input;
          schema.experienceDiscovery.experienceSeed = "";
          schema.evaluation = createEmptyEvaluation();
          schema.resumeDraft = {
            resumeBullets: [],
            experienceCard: null,
            usedFacts: [],
            riskWarnings: [],
            needsUserConfirmation: false,
            userConfirmation: "",
            source: "",
          };
          schema.runtime.resumeTranslationFallbackUsed = false;
          schema.runtime.generationPolicyRecoveryCount = 0;
          schema.currentExperience = createEmptyCurrentExperience();
          return makeResponse({
            assistantMessage: "好，我们继续找第二段。下面哪些你做过？可以选 1-3 个。",
            quickReplyOptions: quickReplies.INVENTORY_SCREENING,
            nextState: STATES.INVENTORY_SCREENING,
          });
        }
        if (input.includes("重新")) {
          schema.currentExperience = createEmptyCurrentExperience();
          schema.evaluation = createEmptyEvaluation();
          schema.resumeDraft = {
            resumeBullets: [],
            experienceCard: null,
            usedFacts: [],
            riskWarnings: [],
            needsUserConfirmation: false,
            userConfirmation: "",
            source: "",
          };
          schema.runtime.resumeTranslationFallbackUsed = false;
          schema.runtime.generationPolicyRecoveryCount = 0;
          return makeResponse({
            assistantMessage: getDeepDiveSceneMessage(input),
            nextState: STATES.DEEP_DIVE_SCENE,
          });
        }
        if (input.includes("生成经历草稿") || input.includes("保存这段经历草稿")) {
          return makeResponse({
            assistantMessage: buildOutputMessage(schema),
            quickReplyOptions: quickReplies.OUTPUT_RESULT,
            nextState: STATES.OUTPUT_RESULT,
          });
        }
        return makeResponse({
          assistantMessage: buildOutputMessage(schema),
          quickReplyOptions: quickReplies.OUTPUT_RESULT,
          nextState: STATES.OUTPUT_RESULT,
        });

      default:
        return makeResponse({
          assistantMessage: "这一步先停一下。你可以继续补充刚才那段经历，我会按真实信息往下拆。",
          nextState: schema.session.currentState,
        });
    }
  }

  function snapshot() {
    return dataSnapshot();
  }

  return {
    getInitialResponse,
    handleUserInput,
    snapshot,
  };
}
