export function getMockAssistantResponse({ currentState, userInput, promptKey }) {
  console.log("[mockApi] placeholder response requested", { currentState, userInput, promptKey });

  return {
    assistantMessage: "Mock API placeholder: stateMachine.js owns the v0.1 product flow.",
    quickReplies: [],
    nextStage: currentState,
  };
}

function includesAny(input, phrases) {
  return phrases.some((phrase) => input.includes(phrase));
}

function createDefaultInterpreterResponse(userInput = "") {
  return {
    hasTargetRole: false,
    targetRole: "",
    targetRoleStatus: "unknown",
    hasExperience: false,
    experienceSeed: "",
    experienceConfidence: "unknown",
    selectedExperienceTypes: [],
    intent: "provide_info",
    needsReassurance: false,
    shouldGoToInventory: false,
    shouldGoToDeepDive: false,
    shouldStayInCurrentState: false,
    acknowledgement: "",
    reason: `mock interpreter fallback for: ${userInput}`,
  };
}

function extractDouyinSeed(input) {
  if (!includesAny(input, ["发布抖音", "发抖音", "抖音"])) return null;
  const hasViews = /(\d+|十|百|千|万)/.test(input) && includesAny(input, ["浏览", "播放", "观看", "阅读"]);
  return {
    experienceSeed: "发布抖音",
    result: hasViews ? input.match(/[^，,。]*?(?:\d+|十|百|千|万)[^，,。]*?(?:浏览|播放|观看|阅读)[^，,。]*/)?.[0] || "" : "",
    scale: hasViews ? input.match(/(?:\d+(?:\.\d+)?|十|百|千|万)+\s*万?[^，,。]*?(?:浏览|播放|观看|阅读)/)?.[0] || "" : "",
  };
}

export function getMockInputInterpreterResponse(promptInput = {}) {
  const currentState = promptInput.currentState || "";
  const userInput = String(promptInput.userInput || "").trim();
  const normalized = userInput.replace(/\s/g, "");
  const response = createDefaultInterpreterResponse(userInput);

  if (!normalized) {
    return {
      ...response,
      intent: "uncertain",
      shouldStayInCurrentState: true,
      acknowledgement: "没关系，我们先从一个很小的入口开始。",
    };
  }

  if (includesAny(normalized, ["金融行业研究员", "行业研究员", "行业研究", "金融研究"])) {
    return {
      ...response,
      hasTargetRole: true,
      targetRole: userInput,
      targetRoleStatus: "known",
      intent: "provide_target_role",
      acknowledgement: "明白，行业研究方向通常会看资料搜集、行业理解、逻辑分析和报告表达。我们先按这个方向整理，后面也可以再调整。",
    };
  }

  if (includesAny(normalized, ["运营/新媒体/内容", "新媒体运营", "内容运营", "产品助理", "项目助理", "行政", "文职", "教务", "培训"])) {
    return {
      ...response,
      hasTargetRole: true,
      targetRole: userInput,
      targetRoleStatus: "known",
      intent: "provide_target_role",
      acknowledgement: `明白，${userInput}方向通常会看内容敏感度、信息整理、发布执行和基础数据意识。我们先按这些能力线索来找经历。`,
    };
  }

  if (includesAny(normalized, ["暂时不确定", "不知道投什么", "不确定投什么", "没想好投什么"])) {
    return {
      ...response,
      targetRoleStatus: "uncertain",
      intent: "uncertain",
      needsReassurance: true,
      acknowledgement: "可以，我们先做一版通用简历素材，后面看到具体岗位时再把表达贴过去。",
    };
  }

  if (includesAny(normalized, ["小组ppt", "小组PPT", "组内ppt", "组内PPT", "ppt算吗", "PPT算吗"])) {
    return {
      ...response,
      hasExperience: true,
      experienceSeed: "小组PPT",
      experienceConfidence: "low",
      intent: "ask_validation",
      needsReassurance: true,
      shouldGoToDeepDive: true,
      acknowledgement: "算，这类小组展示也可以拆出内容整理、页面制作或沟通协作。我们先不用判断它强不强，先看你具体做过哪一部分。",
    };
  }

  const douyinSeed = extractDouyinSeed(userInput);
  if (douyinSeed) {
    return {
      ...response,
      hasExperience: true,
      experienceSeed: douyinSeed.experienceSeed,
      experienceConfidence: "high",
      intent: "provide_experience",
      shouldGoToDeepDive: true,
      currentExperience: {
        result: douyinSeed.result,
        scale: douyinSeed.scale,
      },
      acknowledgement: "这个已经可以拆了。先不用急着总结成简历，我们先看你当时主要负责哪一部分。",
    };
  }

  if (includesAny(normalized, ["有一段经历", "有个经历", "一段经历"]) && includesAny(normalized, ["很水", "没什么实际成效", "没啥实际成效", "普通"])) {
    return {
      ...response,
      hasExperience: true,
      experienceSeed: userInput,
      experienceConfidence: "low",
      intent: "ask_validation",
      needsReassurance: true,
      shouldGoToDeepDive: true,
      acknowledgement: "可以先算候选经历。我们不用先判断它够不够强，先把真实做过的部分拆清楚，再决定怎么写。",
    };
  }

  if (includesAny(normalized, ["都不确定", "想不起来", "没有", "没做过", "不知道"])) {
    return {
      ...response,
      intent: normalized.includes("没有") || normalized.includes("没做过") ? "reject" : "uncertain",
      needsReassurance: true,
      shouldGoToInventory: currentState === "ASK_EXPERIENCE_STATUS",
      shouldStayInCurrentState: currentState === "INVENTORY_SCREENING" || currentState === "SELECT_EXPERIENCE",
      acknowledgement: "没关系，这种情况很常见。我们可以先从最低压力的经历入口里慢慢找。",
    };
  }

  const categories = [
    "课程作业/小组项目",
    "社团/班级事务",
    "帮老师或同学做事",
    "兼职/实习",
    "账号运营/内容发布",
    "志愿活动/校园活动",
    "自己做过的小作品",
  ];
  const selectedExperienceTypes = categories.filter((item) => normalized.includes(item.replace(/[\/]/g, "")) || normalized.includes(item.split("/")[0]));
  if (selectedExperienceTypes.length) {
    return {
      ...response,
      selectedExperienceTypes: selectedExperienceTypes.slice(0, 3),
      intent: "choose_option",
      acknowledgement: `可以，${selectedExperienceTypes[0]}这个方向可以拆。你先想一个最具体的小动作或内容，比如发布过一条内容、写过一篇推文、剪过一段视频，随便说一句就行。`,
    };
  }

  if (currentState === "ASK_EXPERIENCE_STATUS" && includesAny(normalized, ["有", "经历", "做过", "项目", "课程", "小组", "社团", "兼职", "活动", "老师", "同学", "调研", "账号", "内容", "作品"])) {
    return {
      ...response,
      hasExperience: true,
      experienceSeed: userInput,
      experienceConfidence: "high",
      intent: "provide_experience",
      shouldGoToDeepDive: true,
      acknowledgement: "可以，这已经是一个候选经历了。我们先不急着判断它强不强，把里面真实做过的部分拆出来。",
    };
  }

  if (currentState === "SELECT_EXPERIENCE" && !includesAny(normalized, ["都不确定", "想不起来", "没有", "不知道"])) {
    return {
      ...response,
      hasExperience: true,
      experienceSeed: userInput,
      experienceConfidence: "unknown",
      intent: "provide_experience",
      shouldGoToDeepDive: true,
      acknowledgement: "可以，我们就先拿这一件小事来拆，不用一开始就说得很完整。",
    };
  }

  return response;
}

function createEmptyReconcilerResponse(userInput = "") {
  return {
    extractedFields: {
      scene: "",
      action: "",
      result: "",
      scale: "",
      role: "",
      resultMetric: "",
      experienceSeed: "",
    },
    fieldQuality: {
      scene: "missing",
      action: "missing",
      result: "missing",
      scale: "missing",
      role: "missing",
    },
    updatedExperienceSummary: "",
    nextMissingField: "scene",
    acknowledgement: "",
    reason: `mock field reconciler fallback for: ${userInput}`,
    source: "mockApi",
    fallbackUsed: true,
  };
}

function qualityFor(value = "") {
  const clean = String(value || "").trim();
  if (!clean) return "missing";
  if (clean.length <= 2 || ["帮忙", "参与", "完成了", "有用", "活动"].includes(clean)) return "low";
  return "usable";
}

function getNextMissingFieldFromFields(fields = {}) {
  if (!fields.scene) return "scene";
  if (!fields.action) return "action";
  if (!fields.result && !fields.resultMetric) return "result";
  if (!fields.role) return "role";
  return "none";
}

export function getMockFieldReconcilerResponse(promptInput = {}) {
  const userInput = String(promptInput.userInput || "").trim();
  const normalized = userInput.replace(/\s/g, "");
  const current = promptInput.currentExperience || {};
  const response = createEmptyReconcilerResponse(userInput);
  const fields = { ...response.extractedFields };

  if (
    includesAny(normalized, ["社团", "活动"]) &&
    includesAny(normalized, ["发布抖音", "发抖音", "抖音宣传视频", "抖音"]) &&
    includesAny(normalized, ["写文案", "文案", "发布"]) &&
    includesAny(normalized, ["浏览", "播放", "10万", "十万"])
  ) {
    fields.scene = "社团宣传";
    fields.action = "发布抖音宣传视频，撰写内容文案";
    fields.role = "负责发布和文案";
    fields.result = "支持社团宣传内容传播";
    fields.resultMetric = "单条内容约10万浏览量";
    fields.experienceSeed = "抖音宣传视频";
    response.acknowledgement = "社团抖音宣传视频、文案动作和传播数据都记下来了。";
  } else if (/^(我)?(主要)?负责写文案$/.test(normalized) || normalized === "我负责文案") {
    fields.action = "撰写内容文案";
    fields.role = "负责文案";
    response.acknowledgement = "文案这块记下来了。";
  } else if (includesAny(normalized, ["发布抖音", "发抖音", "抖音"]) && includesAny(normalized, ["浏览", "播放", "10万", "十万"])) {
    fields.experienceSeed = "发布抖音短视频";
    fields.resultMetric = "单条内容约10万浏览量";
    fields.result = "内容获得较好传播";
    response.acknowledgement = "这条内容的传播结果已经记下来了。";
  } else if (includesAny(normalized, ["创业课", "创业课程", "老师让做", "介绍自己卖的东西"])) {
    fields.scene = "创业课程产品展示";
    fields.experienceSeed = "创业课程产品展示短视频";
    response.acknowledgement = "创业课程产品展示这个场景记下来了。";
  } else if (includesAny(normalized, ["就是刚才", "我们组", "抖音视频"])) {
    fields.action = "撰写抖音短视频文案";
    fields.role = "负责文案";
    fields.scene = "小组抖音视频发布";
    fields.experienceSeed = "抖音短视频内容发布";
    response.acknowledgement = "文案这块记下来了。";
  } else if (normalized === "文案" || normalized === "写文案") {
    const context = [current.experienceSeed, current.scene, current.action, current.result, current.resultMetric].join(" ");
    fields.action = /抖音|视频|内容发布/.test(context) ? "撰写抖音短视频文案" : "撰写内容文案";
    fields.role = "负责文案";
    response.acknowledgement = "文案这块记下来了。";
  } else if (includesAny(normalized, ["给同学用", "用于展示", "给老师看", "小组展示", "课堂展示"])) {
    fields.result = normalized.includes("老师") ? "用于老师查看" : normalized.includes("同学") ? "给同学使用" : "用于小组展示";
    response.acknowledgement = "用途这块记下来了。";
  } else if (/^\d+人$/.test(normalized) || /^一周$/.test(normalized) || /^\d+份问卷$/.test(normalized)) {
    fields.scale = userInput;
    response.acknowledgement = "规模信息记下来了。";
  } else if (/^(?:约)?(?:\d+(?:\.\d+)?|十|百|千|万)+\s*万?[^，,。]*?(?:浏览量|浏览|播放量|播放|点赞)$/.test(normalized)) {
    fields.resultMetric = normalized.includes("10万") || normalized.includes("十万") ? "单条内容约10万浏览量" : userInput;
    response.acknowledgement = "结果数据记下来了。";
  }

  const merged = {
    scene: fields.scene || current.scene || "",
    action: fields.action || current.action || "",
    result: fields.result || current.result || "",
    scale: fields.scale || current.scale || "",
    role: fields.role || current.role || "",
    resultMetric: fields.resultMetric || current.resultMetric || "",
  };

  response.extractedFields = fields;
  response.fieldQuality = {
    scene: qualityFor(merged.scene),
    action: qualityFor(merged.action),
    result: qualityFor(merged.result || merged.resultMetric),
    scale: qualityFor(merged.scale),
    role: qualityFor(merged.role),
  };
  response.updatedExperienceSummary = [merged.scene, merged.action, merged.result, merged.resultMetric].filter(Boolean).join("；");
  response.nextMissingField = getNextMissingFieldFromFields(merged);
  return response;
}

export function getMockQuestionGeneratorResponse(promptInput = {}) {
  const userInput = String(promptInput.userInput || "").trim();
  const normalized = userInput.replace(/\s/g, "");
  const currentExperience = promptInput.currentExperience || {};
  const missingField = promptInput.missingField || "action";
  const stuckCount = Number(promptInput.stuckCount || 0);

  if (includesAny(normalized, ["不知道", "没有", "想不起来", "不记得"])) {
    if (stuckCount <= 1) {
      return {
        assistantMessage: "没关系，我们换个轻一点的入口。你可以先从一个小动作里选，比如选题、找素材、剪辑、发布、写标题，哪个最接近你当时做的？",
        targetField: missingField,
        reason: "first stuck fallback with concrete examples",
        source: "mockApi",
        fallbackUsed: true,
      };
    }
    if (stuckCount === 2) {
      return {
        assistantMessage: "那我给你做成选择题：你更像负责内容制作、发布传播，还是后面看数据？选一个最接近的就行。",
        targetField: missingField,
        reason: "second stuck fallback as choice",
        source: "mockApi",
        fallbackUsed: true,
      };
    }
    return {
      assistantMessage: "我们先用最低门槛入口：如果这条内容是你发出去的，就先记成“负责发布和基础内容整理”。不准确的话你再改。",
      targetField: missingField,
      reason: "third stuck fallback with lowest-friction entry",
      source: "mockApi",
      fallbackUsed: true,
    };
  }

  if (includesAny(normalized, ["很水", "没什么实际成效", "没啥实际成效"])) {
    return {
      assistantMessage: "这不一定没价值，我们先不急着判断强不强。我帮你拆一下，看里面有没有能写的动作和结果。你先想想，当时你具体参与了哪一部分？",
      targetField: "action",
      reason: "low confidence validation",
      source: "mockApi",
      fallbackUsed: true,
    };
  }

  if ((normalized === "文案" || normalized === "写文案") && missingField === "scene") {
    return {
      assistantMessage: "文案这块记下来了。为了把这段经历放准，我再补一个小背景：这是课程项目、社团宣传，还是账号内容发布？",
      targetField: "scene",
      reason: "action captured out of order, ask missing scene",
      source: "mockApi",
      fallbackUsed: true,
    };
  }

  if (includesAny(normalized, ["创业课", "创业课程", "老师让做", "介绍自己卖的东西", "产品展示"])) {
    return {
      assistantMessage: "明白，这是一个创业课程里的产品展示短视频。那这条视频里，你主要做的是文案、拍摄剪辑、发布，还是数据查看？",
      targetField: "action",
      reason: "clean entrepreneurship course scene and ask specific role options",
      source: "mockApi",
      fallbackUsed: true,
    };
  }

  if (includesAny(normalized, ["抖音", "浏览量", "播放量", "10万", "十万"])) {
    return {
      assistantMessage: "这个播放量已经挺不错了，说明这条内容确实被传播出去了。你当时主要负责哪一部分？比如选题、拍摄、剪辑、发布、标题文案，还是后续数据复盘？",
      targetField: "action",
      reason: "concrete content result should ask action/role",
      source: "mockApi",
      fallbackUsed: true,
    };
  }

  if (includesAny(normalized, ["社团", "宣传活动", "宣传社团活动"])) {
    return {
      assistantMessage: "明白，是帮社团做活动宣传。那我们就围绕这条内容来拆：你当时负责的是内容制作，还是发布和传播？",
      targetField: "action",
      reason: "scene provided, ask action",
      source: "mockApi",
      fallbackUsed: true,
    };
  }

  if (includesAny(normalized, ["通知同学"])) {
    return {
      assistantMessage: "好，通知同学这个动作是可以写清楚的。那这次通知后来主要用于什么安排，比如报名、活动到场、材料提交，还是课堂展示？",
      targetField: "result",
      reason: "action provided, ask result",
      source: "mockApi",
      fallbackUsed: true,
    };
  }

  if (includesAny(normalized, ["小组ppt", "小组PPT", "PPT", "ppt"])) {
    if (missingField === "scene") {
      return {
        assistantMessage: "小组 PPT 算一个候选经历。我们先把它放回具体场合里看：这是课程展示、社团活动，还是某次比赛/项目里的 PPT？",
        targetField: "scene",
        reason: "PPT seed without scene asks scene",
        source: "mockApi",
        fallbackUsed: true,
      };
    }
    return {
      assistantMessage: "小组 PPT 可以拆。你当时更偏哪一块：整理资料、搭页面结构、做排版，还是负责上台汇报？",
      targetField: "action",
      reason: "PPT seed asks action",
      source: "mockApi",
      fallbackUsed: true,
    };
  }

  if (missingField === "scene") {
    return {
      assistantMessage: `我先接住这个线索：${userInput || currentExperience.result || "这段经历"}。它具体是在什么场合里发生的，比如社团宣传、课程项目，还是账号内容发布？`,
      targetField: "scene",
      reason: "ask missing scene with context",
      source: "mockApi",
      fallbackUsed: true,
    };
  }

  if (missingField === "result") {
    return {
      assistantMessage: `好，${userInput || currentExperience.action || "这个动作"}已经清楚了一点。后来这件事主要带来了什么结果，或者给谁使用了？`,
      targetField: "result",
      reason: "ask missing result with context",
      source: "mockApi",
      fallbackUsed: true,
    };
  }

  if (missingField === "scale") {
    return {
      assistantMessage: "这段已经能写一版了。为了让它更实一点，我只补一个小信息：大概涉及多少浏览量、几条内容、多少人，或者持续了多久？",
      targetField: "scale",
      reason: "ask scale enhancement",
      source: "mockApi",
      fallbackUsed: true,
    };
  }

  return {
    assistantMessage: `好，我们就围绕${cleanQuestionContext(currentExperience.scene || currentExperience.result || "这件事")}往下拆。你更接近负责文案、拍摄剪辑、发布、数据查看，还是资料整理？`,
    targetField: "action",
    reason: "default action question with context",
    source: "mockApi",
    fallbackUsed: true,
  };
}

function cleanQuestionContext(value = "") {
  const text = String(value || "");
  if (/创业课|创业课程|老师让做|介绍自己卖的东西/.test(text)) return "创业课程产品展示短视频";
  if (/抖音|短视频|10万|浏览量|播放量/.test(text)) return "抖音短视频内容发布";
  if (/社团|宣传活动/.test(text)) return "社团活动宣传内容";
  return text
    .replace(/老师让做的/g, "")
    .replace(/介绍自己卖的东西/g, "产品展示")
    .replace(/就是刚才那个/g, "")
    .replace(/算吗/g, "")
    .replace(/嗯+/g, "")
    .replace(/我们组那个/g, "")
    .replace(/这种小事/g, "")
    .trim();
}

const lowQualityPhrases = {
  scene: ["参加活动", "参与了一个活动", "一个活动", "课程项目", "做过一点"],
  action: ["帮忙", "参与", "做了一些事情", "整理了一些东西", "做了一些", "一些事情"],
  result: ["完成了", "给别人用了", "有点用", "有用", "用了"],
};

function isBlank(value = "") {
  return !String(value || "").trim();
}

function isLowQualityField(field, value = "") {
  const clean = String(value || "").trim();
  if (!clean) return false;
  if (clean.length <= 3) return true;
  return (lowQualityPhrases[field] || []).some((phrase) => clean === phrase || clean.includes(phrase));
}

function makeRecoveryQuestion(field) {
  if (field === "scene") {
    return "这段先不急着写成简历。我们先把场景补具体一点：它是哪个课程、小组、社团活动或账号内容场景？";
  }
  if (field === "action") {
    return "这段还不能直接写成简历，我需要先知道你真实做过的一个具体动作。比如整理、核对、发布、剪辑、通知，哪一个最接近？";
  }
  if (field === "result") {
    return "这段还差一个用途或结果。它后来用于展示、提交、宣传、统计，还是给谁继续使用了？";
  }
  return "这段已经可以先写一版了。为了更具体，只补一个小信息：大概涉及多少人、几条内容、多少数据，或者持续多久？";
}

export function getMockGenerationPolicyResponse(promptInput = {}) {
  const experience = promptInput.currentExperience || {};
  const recoveryCount = Number(promptInput.recoveryCount || 0);
  const scene = String(experience.scene || "").trim();
  const action = String(experience.action || "").trim();
  const result = String(experience.result || experience.resultMetric || experience.use || "").trim();
  const scale = String(experience.scale || "").trim();
  const resultMetric = String(experience.resultMetric || "").trim();

  const missingFields = [];
  if (isBlank(scene)) missingFields.push("scene");
  if (isBlank(action)) missingFields.push("action");
  if (isBlank(result)) missingFields.push("result");

  const lowQualityFields = [];
  if (!isBlank(scene) && isLowQualityField("scene", scene)) lowQualityFields.push("scene");
  if (!isBlank(action) && isLowQualityField("action", action)) lowQualityFields.push("action");
  if (!isBlank(result) && isLowQualityField("result", result)) lowQualityFields.push("result");

  if (recoveryCount >= 3 && (missingFields.length || lowQualityFields.length)) {
    return {
      gateStatus: "fail",
      canGenerateFormalBullet: false,
      needsRecovery: false,
      recoveryType: "none",
      missingFields,
      lowQualityFields,
      fallbackMode: "save_as_lead",
      outputType: "experience_lead",
      nextQuestion: "",
      reason: "core fields still missing or too vague after multiple recovery attempts",
      source: "mockApi",
      fallbackUsed: true,
    };
  }

  if (missingFields.length) {
    return {
      gateStatus: "recoverable",
      canGenerateFormalBullet: false,
      needsRecovery: true,
      recoveryType: "missing_field",
      missingFields,
      lowQualityFields: [],
      fallbackMode: "guidance_only",
      outputType: "guidance_only",
      nextQuestion: makeRecoveryQuestion(missingFields[0]),
      reason: "one or more core fields are missing",
      source: "mockApi",
      fallbackUsed: true,
    };
  }

  if (lowQualityFields.length) {
    return {
      gateStatus: "recoverable",
      canGenerateFormalBullet: false,
      needsRecovery: true,
      recoveryType: "low_quality_field",
      missingFields: [],
      lowQualityFields,
      fallbackMode: "guidance_only",
      outputType: "guidance_only",
      nextQuestion: makeRecoveryQuestion(lowQualityFields[0]),
      reason: "one or more core fields are below Minimum Expressible Unit",
      source: "mockApi",
      fallbackUsed: true,
    };
  }

  if (!scale && !resultMetric) {
    return {
      gateStatus: "pass",
      canGenerateFormalBullet: true,
      needsRecovery: true,
      recoveryType: "missing_field",
      missingFields: ["scale"],
      lowQualityFields: [],
      fallbackMode: "none",
      outputType: "draft_bullet",
      nextQuestion: makeRecoveryQuestion("scale"),
      reason: "core fields are usable; scale can improve quality but is not required",
      source: "mockApi",
      fallbackUsed: true,
    };
  }

  return {
    gateStatus: "pass",
    canGenerateFormalBullet: true,
    needsRecovery: false,
    recoveryType: "none",
    missingFields: [],
    lowQualityFields: [],
    fallbackMode: "none",
    outputType: "formal_bullet",
    nextQuestion: "",
    reason: "core fields meet Minimum Expressible Unit",
    source: "mockApi",
    fallbackUsed: true,
  };
}

export function getMockResumeTranslationResponse(promptInput = {}) {
  console.warn("[mockApi] resume translation fallback used.");

  const experience = promptInput.currentExperience || {};
  const scene = cleanResumeText(experience.scene || "相关经历");
  const action = cleanResumeText(experience.action || "基础支持工作");
  const result = cleanResumeText(experience.result || "后续整理与执行");
  const scale = cleanResumeText(experience.resultMetric || experience.scale || "");
  const bullet = buildCleanResumeBullet({ scene, action, result, scale });

  return {
    resumeDraft: {
      resumeBullets: [bullet],
      experienceCard: {
        scene: experience.scene || "",
        action: experience.action || "",
        result: experience.result || "",
        scale: experience.scale || "",
      },
      usedFacts: [
        experience.scene,
        experience.action,
        experience.result,
        experience.scale,
      ].filter(Boolean),
      riskWarnings: ["当前为 fallback 结果，建议接入真实 RESUME_TRANSLATION 后再次确认。"],
      needsUserConfirmation: true,
      source: "mockApi",
    },
    fallbackUsed: true,
  };
}

function cleanResumeText(value = "") {
  let text = String(value || "").trim();
  const replacements = [
    [/算吗/g, ""],
    [/就是/g, ""],
    [/刚才那个/g, ""],
    [/嗯+/g, ""],
    [/我们创业课老师让做的[，,、]*/g, "创业课程"],
    [/创业课老师让做的[，,、]*/g, "创业课程"],
    [/我们老师让做的[，,、]*/g, ""],
    [/老师让做的[，,、]*/g, ""],
    [/介绍自己卖的东西/g, "产品展示"],
    [/我负责/g, "负责"],
    [/有一个有/g, "获得"],
    [/我们组/g, "小组"],
    [/刚才/g, ""],
    [/那个/g, ""],
  ];
  replacements.forEach(([pattern, replacement]) => {
    text = text.replace(pattern, replacement);
  });
  text = text.replace(/\s+/g, "").replace(/^[，,、。]+|[，,、。]+$/g, "");

  if (text.includes("创业课程") || text.includes("创业课")) {
    text = "创业课程小组展示项目";
  }
  if (text.includes("发布抖音") || text.includes("抖音发布") || text.includes("抖音视频")) {
    if (text.includes("文案")) return "参与小组抖音视频发布，负责内容文案撰写";
    return "发布抖音短视频";
  }
  if (/10万|十万/.test(text) && /浏览|播放/.test(text)) {
    return "单条内容获得约10万浏览量";
  }
  return text;
}

function buildCleanResumeBullet({ scene, action, result, scale }) {
  const hasCourseVideoContext = [scene, action, result, scale].some((item) => /创业课程|抖音|短视频|文案|10万/.test(item));
  if (hasCourseVideoContext) {
    const parts = [
      "参与创业课程小组短视频内容制作",
      "负责抖音视频文案撰写",
      "支持小组完成产品展示",
      scale || result,
    ].filter(Boolean);
    const uniqueParts = [...new Set(parts)];
    return `${uniqueParts.join("，")}。`;
  }

  const parts = [
    scene ? `参与${scene}` : "",
    action ? `协助${action}` : "",
    result ? `支持${result}` : "",
    scale ? `涉及${scale}` : "",
  ].filter(Boolean);
  return `${parts.join("，")}。`;
}
