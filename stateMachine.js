import { callResumeTranslationApi } from "./realApi.js";
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
  OUTPUT_RESULT: ["继续补第二段经历", "先生成简历", "重新整理这一段"],
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

function createEmptyCurrentExperience() {
  return {
    scene: "",
    action: "",
    result: "",
    scale: "",
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

function userHasExperience(input) {
  const clean = input.trim();
  if (clean.includes("没有") || clean.includes("不确定") || clean.includes("普通")) return false;
  return clean.includes("有") || clean.includes("想写") || clean.includes("经历");
}

function isMeaningfulCoreField(value) {
  const clean = value.trim();
  if (!clean) return false;
  if (isDeepDiveStuckInput(clean)) return false;
  return !["做过一点", "一点", "有一点", "不太记得", "随便做了点"].some((phrase) => clean.includes(phrase));
}

function evaluateCurrentExperience(schema) {
  const evaluation = createEmptyEvaluation();
  const { scene, action, result, scale } = schema.currentExperience;
  const hasScene = isMeaningfulCoreField(scene);
  const hasAction = isMeaningfulCoreField(action);
  const hasResult = isMeaningfulCoreField(result);
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
  schema.currentExperience.knownFacts = [scene, action, result, scale].filter(Boolean);

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

function buildOutputMessage(schema) {
  const bullet = getPrimaryResumeBullet(schema) || "暂未生成经历草稿。";
  const { scene, action, result, scale } = schema.currentExperience;

  return `这一段我们先整理成这样：

经历草稿：
- ${bullet}

已提取信息：
- 目标方向：${schema.userProfile.targetRole || "暂未确定"}
- 经历场景：${scene || "暂未填写"}
- 具体动作：${action || "暂未填写"}
- 结果/用途：${result || "暂未填写"}
- 规模/周期：${scale || "暂未填写"}

下一步可以继续补第二段经历，或者把这一段写进简历。`;
}

export function createStateMachine() {
  const schema = createInitialSchema();

  function dataSnapshot() {
    return cloneData(schema);
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
      case STATES.START:
        schema.userProfile.targetRole = input;
        schema.userProfile.targetRoleStatus = input.includes("不确定") || input.includes("暂时") ? "uncertain" : "known";
        return makeResponse({
          assistantMessage: "好，我先按这个方向帮你看。你现在有一段想写进简历的经历吗？有的话随便说一句就行；没有的话我帮你一起找。",
          quickReplyOptions: quickReplies.ASK_EXPERIENCE_STATUS,
          nextState: STATES.ASK_EXPERIENCE_STATUS,
        });

      case STATES.ASK_EXPERIENCE_STATUS:
        schema.experienceDiscovery.experienceStatus = input;
        if (userHasExperience(input)) {
          return makeResponse({
            assistantMessage: getDeepDiveSceneMessage(input),
            nextState: STATES.DEEP_DIVE_SCENE,
          });
        }
        return makeResponse({
          assistantMessage: "没关系，很多能写进简历的事，一开始都不像经历。下面哪些你做过？可以选 1-3 个。",
          quickReplyOptions: quickReplies.INVENTORY_SCREENING,
          nextState: STATES.INVENTORY_SCREENING,
        });

      case STATES.INVENTORY_SCREENING:
        schema.experienceDiscovery.selectedExperienceTypes = parseExperienceTypes(input);
        return makeResponse({
          assistantMessage: "我们先从最具体的一件小事开始。你选的这些里面，有没有一件你还记得比较清楚？随便说一句就行。",
          nextState: STATES.SELECT_EXPERIENCE,
        });

      case STATES.SELECT_EXPERIENCE:
        schema.experienceDiscovery.experienceSeed = input;
        return makeResponse({
          assistantMessage: getDeepDiveSceneMessage(input),
          nextState: STATES.DEEP_DIVE_SCENE,
        });

      case STATES.DEEP_DIVE_SCENE:
        if (isDeepDiveStuckInput(input)) {
          return makeResponse({
            assistantMessage: getDeepDiveSceneMessage(input),
            nextState: STATES.DEEP_DIVE_SCENE,
          });
        }
        schema.currentExperience.scene = input;
        return makeResponse({
          assistantMessage: getDeepDiveActionMessage(input),
          nextState: STATES.DEEP_DIVE_ACTION,
        });

      case STATES.DEEP_DIVE_ACTION:
        if (isDeepDiveStuckInput(input)) {
          return makeResponse({
            assistantMessage: getDeepDiveActionMessage(input),
            nextState: STATES.DEEP_DIVE_ACTION,
          });
        }
        schema.currentExperience.action = input;
        return makeResponse({
          assistantMessage: getDeepDiveResultMessage(input),
          nextState: STATES.DEEP_DIVE_RESULT,
        });

      case STATES.DEEP_DIVE_RESULT: {
        if (isDeepDiveStuckInput(input)) {
          return makeResponse({
            assistantMessage: getDeepDiveResultMessage(input),
            nextState: STATES.DEEP_DIVE_RESULT,
          });
        }
        schema.currentExperience.result = input;
        schema.evaluation = evaluateCurrentExperience(schema);

        if (!schema.evaluation.readyToGenerate) {
          return makeCoreFieldFollowupResponse();
        }

        if (schema.evaluation.score < 60) {
          return makeSingleEnhancementFollowupResponse();
        }

        return makeResumeTranslationResponse();
      }

      case STATES.MISSING_INFO_FOLLOWUP:
        schema.currentExperience.scale = input;
        schema.evaluation = evaluateCurrentExperience(schema);
        return makeResumeTranslationResponse();

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
          return makeResponse({
            assistantMessage: getDeepDiveSceneMessage(input),
            nextState: STATES.DEEP_DIVE_SCENE,
          });
        }
        return makeResponse({
          assistantMessage: "先生成简历这一步我们暂时不接真实生成。当前版本先停在经历整理结果，后面再接入简历生成。",
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
