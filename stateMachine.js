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
    currentExperience: {
      scene: "",
      action: "",
      result: "",
      scale: "",
      knownFacts: [],
      missingInfoPriority: "",
    },
    evaluation: {
      score: null,
      level: "",
      recommendedSection: "",
      isMainExperienceCandidate: false,
      dimensionScores: {},
      strengths: [],
      weaknesses: [],
      nextQuestion: "",
      rewriteRisk: "",
      allowedPositioning: "",
      forbiddenClaims: [],
    },
    resumeDraft: {
      resumeBullets: [],
      experienceCard: null,
      usedFacts: [],
      riskWarnings: [],
      needsUserConfirmation: false,
      userConfirmation: "",
    },
    nextAction: {
      recommendedNextAction: "",
      nextQuestions: [],
      quickReplies: [],
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

function getPrimaryResumeBullet(schema) {
  return schema.resumeDraft.resumeBullets[0] || "";
}

function buildResumeBullet(schema) {
  const { scene, action, result, scale } = schema.currentExperience;
  return `在【${scene || "相关场景"}】中，协助完成【${action || "相关工作"}】，支持【${result || "后续使用"}】，涉及【${scale || "一定规模"}】。`;
}

function buildOutputMessage(schema) {
  const bullet = getPrimaryResumeBullet(schema) || buildResumeBullet(schema);
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

  function getInitialResponse() {
    return makeResponse({
      assistantMessage: "我们先不急着写完整简历。你现在大概想投哪类岗位？不确定也可以，先做一版通用简历。",
      quickReplyOptions: quickReplies.START,
      nextState: STATES.START,
    });
  }

  function handleUserInput(userText) {
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
            assistantMessage: "可以，我们先不急着写漂亮。我先帮你把它拆清楚：这件事当时发生在什么场景里？",
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
          assistantMessage: "可以，我们先不急着写漂亮。我先帮你把它拆清楚：这件事当时发生在什么场景里？",
          nextState: STATES.DEEP_DIVE_SCENE,
        });

      case STATES.DEEP_DIVE_SCENE:
        schema.currentExperience.scene = input;
        return makeResponse({
          assistantMessage: "你当时具体做了什么？可以只说一个最小的动作，比如整理、核对、沟通、发布、记录。",
          nextState: STATES.DEEP_DIVE_ACTION,
        });

      case STATES.DEEP_DIVE_ACTION:
        schema.currentExperience.action = input;
        return makeResponse({
          assistantMessage: "你做完之后，这件事后来给谁用了？或者产生了什么结果？没有明确结果也可以说不确定。",
          nextState: STATES.DEEP_DIVE_RESULT,
        });

      case STATES.DEEP_DIVE_RESULT: {
        schema.currentExperience.result = input;
        const { scene, action, result } = schema.currentExperience;
        schema.evaluation.level = scene.trim() && action.trim() && result.trim() ? "可写经历" : "辅助经历";
        const evaluationMessage =
          schema.evaluation.level === "可写经历"
            ? "这段经历可以写，只是还需要补一点具体信息。我再问你一个小问题，把它写得更实一点。"
            : "这件事可以先作为辅助经历记录下来。我们再补一个细节，看看能不能写得更具体。";

        return makeResponse({
          assistantMessage: `${evaluationMessage}\n\n这件事大概涉及多少人、多少份资料、几次活动，或者持续了多久？大概数也可以。`,
          nextState: STATES.MISSING_INFO_FOLLOWUP,
        });
      }

      case STATES.MISSING_INFO_FOLLOWUP:
        schema.currentExperience.scale = input;
        schema.resumeDraft.resumeBullets = [buildResumeBullet(schema)];
        schema.resumeDraft.needsUserConfirmation = true;
        return makeResponse({
          assistantMessage: `我先试着把它写成简历语言，你看看像不像你做过的事：

- ${getPrimaryResumeBullet(schema)}

这句话基本符合事实吗？`,
          quickReplyOptions: quickReplies.USER_CONFIRMATION,
          nextState: STATES.USER_CONFIRMATION,
        });

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
          schema.evaluation.level = "";
          schema.resumeDraft.resumeBullets = [];
          schema.resumeDraft.userConfirmation = "";
          schema.resumeDraft.needsUserConfirmation = false;
          schema.currentExperience = createEmptyCurrentExperience();
          return makeResponse({
            assistantMessage: "好，我们继续找第二段。下面哪些你做过？可以选 1-3 个。",
            quickReplyOptions: quickReplies.INVENTORY_SCREENING,
            nextState: STATES.INVENTORY_SCREENING,
          });
        }
        if (input.includes("重新")) {
          schema.currentExperience = createEmptyCurrentExperience();
          schema.resumeDraft.resumeBullets = [];
          schema.resumeDraft.needsUserConfirmation = false;
          return makeResponse({
            assistantMessage: "可以，我们重新拆这一段：这件事当时发生在什么场景里？",
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
