// realApi.js
// 最小可用的真实 API 接入文件
// 兼容现有 stateMachine 和 unified schema
// fallback 会继续调用 mockApi，保证页面不会崩

const runtimeConfig = globalThis.window || globalThis;
const API_URL = runtimeConfig.LINGXIU_API_URL || "";
const API_KEY = runtimeConfig.LINGXIU_API_KEY || "";
const API_MODEL = runtimeConfig.LINGXIU_MODEL || "openai/gpt-4o-mini";

// 导入 mockApi，用于 fallback
import {
  getMockAssistantResponse,
  getMockFieldReconcilerResponse,
  getMockGenerationPolicyResponse,
  getMockInputInterpreterResponse,
  getMockQuestionGeneratorResponse,
  getMockResumeTranslationResponse,
} from "./mockApi.js";
import { fieldReconcilerPrompt, generationPolicyPrompt, inputInterpreterPrompt, questionGeneratorPrompt, resumeTranslationPrompt } from "./prompts.js";

function extractResponseContent(data) {
  if (typeof data === "string") return data;
  if (typeof data?.choices?.[0]?.message?.content === "string") return data.choices[0].message.content;
  if (typeof data?.choices?.[0]?.text === "string") return data.choices[0].text;
  return data;
}

function stripJsonFence(text) {
  return text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
}

function normalizeResumeTranslationResponse(parsed, promptInput, source = "realApi") {
  const fallbackBullet =
    typeof parsed === "string"
      ? stripJsonFence(parsed)
      : parsed?.resumeDraft?.resumeBullets?.[0] || parsed?.resumeBullets?.[0] || parsed?.bullet || "";

  const resumeDraft = parsed?.resumeDraft || {};
  const resumeBullets = Array.isArray(resumeDraft.resumeBullets)
    ? resumeDraft.resumeBullets
    : Array.isArray(parsed?.resumeBullets)
      ? parsed.resumeBullets
      : fallbackBullet
        ? [fallbackBullet]
        : [];

  const normalized = {
    resumeDraft: {
      resumeBullets,
      experienceCard: resumeDraft.experienceCard || parsed?.experienceCard || {
        scene: promptInput.currentExperience?.scene || "",
        action: promptInput.currentExperience?.action || "",
        result: promptInput.currentExperience?.result || "",
        scale: promptInput.currentExperience?.scale || "",
      },
      usedFacts: resumeDraft.usedFacts || parsed?.usedFacts || [
        promptInput.currentExperience?.scene,
        promptInput.currentExperience?.action,
        promptInput.currentExperience?.result,
        promptInput.currentExperience?.scale,
      ].filter(Boolean),
      riskWarnings: resumeDraft.riskWarnings || parsed?.riskWarnings || [],
      needsUserConfirmation:
        typeof resumeDraft.needsUserConfirmation === "boolean"
          ? resumeDraft.needsUserConfirmation
          : typeof parsed?.needsUserConfirmation === "boolean"
            ? parsed.needsUserConfirmation
            : true,
      source,
    },
    fallbackUsed: false,
  };

  if (!normalized.resumeDraft.resumeBullets.length) {
    throw new Error("RESUME_TRANSLATION returned empty resumeBullets.");
  }

  return normalized;
}

function normalizeInputInterpreterResponse(parsed, promptInput, source = "realApi") {
  const mock = getMockInputInterpreterResponse(promptInput);
  const normalized = {
    hasTargetRole: Boolean(parsed?.hasTargetRole),
    targetRole: typeof parsed?.targetRole === "string" ? parsed.targetRole : "",
    targetRoleStatus: ["known", "uncertain", "unknown"].includes(parsed?.targetRoleStatus)
      ? parsed.targetRoleStatus
      : "unknown",
    hasExperience: Boolean(parsed?.hasExperience),
    experienceSeed: typeof parsed?.experienceSeed === "string" ? parsed.experienceSeed : "",
    experienceConfidence: ["high", "low", "unknown"].includes(parsed?.experienceConfidence)
      ? parsed.experienceConfidence
      : "unknown",
    selectedExperienceTypes: Array.isArray(parsed?.selectedExperienceTypes)
      ? parsed.selectedExperienceTypes.filter((item) => typeof item === "string").slice(0, 3)
      : [],
    intent: [
      "provide_info",
      "ask_validation",
      "uncertain",
      "reject",
      "choose_option",
      "provide_target_role",
      "provide_experience",
    ].includes(parsed?.intent)
      ? parsed.intent
      : "provide_info",
    needsReassurance: Boolean(parsed?.needsReassurance),
    shouldGoToInventory: Boolean(parsed?.shouldGoToInventory),
    shouldGoToDeepDive: Boolean(parsed?.shouldGoToDeepDive),
    shouldStayInCurrentState: Boolean(parsed?.shouldStayInCurrentState),
    acknowledgement: typeof parsed?.acknowledgement === "string" ? parsed.acknowledgement : "",
    reason: typeof parsed?.reason === "string" ? parsed.reason : "",
    currentExperience:
      parsed?.currentExperience && typeof parsed.currentExperience === "object"
        ? {
            scene: typeof parsed.currentExperience.scene === "string" ? parsed.currentExperience.scene : "",
            action: typeof parsed.currentExperience.action === "string" ? parsed.currentExperience.action : "",
            result: typeof parsed.currentExperience.result === "string" ? parsed.currentExperience.result : "",
            scale: typeof parsed.currentExperience.scale === "string" ? parsed.currentExperience.scale : "",
          }
        : null,
    source,
    fallbackUsed: false,
  };

  if (!normalized.acknowledgement && mock.acknowledgement) {
    normalized.acknowledgement = mock.acknowledgement;
  }

  return normalized;
}

function normalizeQuestionGeneratorResponse(parsed, promptInput, source = "realApi") {
  const fallback = getMockQuestionGeneratorResponse(promptInput);
  const targetField = ["scene", "action", "result", "scale", "role"].includes(parsed?.targetField)
    ? parsed.targetField
    : fallback.targetField || promptInput.missingField || "action";
  const assistantMessage =
    typeof parsed?.assistantMessage === "string" && parsed.assistantMessage.trim()
      ? parsed.assistantMessage.trim()
      : fallback.assistantMessage;

  if (!assistantMessage) {
    throw new Error("QUESTION_GENERATOR returned empty assistantMessage.");
  }

  return {
    assistantMessage,
    targetField,
    reason: typeof parsed?.reason === "string" ? parsed.reason : fallback.reason || "",
    source,
    fallbackUsed: false,
  };
}

function normalizeGenerationPolicyResponse(parsed, promptInput, source = "realApi") {
  const fallback = getMockGenerationPolicyResponse(promptInput);
  const gateStatus = ["pass", "recoverable", "fail"].includes(parsed?.gateStatus)
    ? parsed.gateStatus
    : fallback.gateStatus;
  const recoveryType = ["missing_field", "low_quality_field", "none"].includes(parsed?.recoveryType)
    ? parsed.recoveryType
    : fallback.recoveryType;
  const fallbackMode = ["none", "save_as_lead", "guidance_only", "stop_and_switch"].includes(parsed?.fallbackMode)
    ? parsed.fallbackMode
    : fallback.fallbackMode;
  const outputType = ["formal_bullet", "draft_bullet", "experience_lead", "guidance_only"].includes(parsed?.outputType)
    ? parsed.outputType
    : fallback.outputType;

  return {
    gateStatus,
    canGenerateFormalBullet:
      typeof parsed?.canGenerateFormalBullet === "boolean"
        ? parsed.canGenerateFormalBullet
        : fallback.canGenerateFormalBullet,
    needsRecovery:
      typeof parsed?.needsRecovery === "boolean"
        ? parsed.needsRecovery
        : fallback.needsRecovery,
    recoveryType,
    missingFields: Array.isArray(parsed?.missingFields)
      ? parsed.missingFields.filter((item) => typeof item === "string")
      : fallback.missingFields,
    lowQualityFields: Array.isArray(parsed?.lowQualityFields)
      ? parsed.lowQualityFields.filter((item) => typeof item === "string")
      : fallback.lowQualityFields,
    fallbackMode,
    outputType,
    nextQuestion: typeof parsed?.nextQuestion === "string" ? parsed.nextQuestion : fallback.nextQuestion,
    reason: typeof parsed?.reason === "string" ? parsed.reason : fallback.reason,
    source,
    fallbackUsed: false,
  };
}

function normalizeFieldReconcilerResponse(parsed, promptInput, source = "realApi") {
  const fallback = getMockFieldReconcilerResponse(promptInput);
  const extracted = parsed?.extractedFields || {};
  const quality = parsed?.fieldQuality || {};
  const qualityValues = ["missing", "low", "usable"];
  const fields = ["scene", "action", "result", "scale", "role", "resultMetric", "experienceSeed"];

  return {
    extractedFields: Object.fromEntries(fields.map((field) => [
      field,
      typeof extracted?.[field] === "string" ? extracted[field] : fallback.extractedFields[field] || "",
    ])),
    fieldQuality: {
      scene: qualityValues.includes(quality.scene) ? quality.scene : fallback.fieldQuality.scene,
      action: qualityValues.includes(quality.action) ? quality.action : fallback.fieldQuality.action,
      result: qualityValues.includes(quality.result) ? quality.result : fallback.fieldQuality.result,
      scale: qualityValues.includes(quality.scale) ? quality.scale : fallback.fieldQuality.scale,
      role: qualityValues.includes(quality.role) ? quality.role : fallback.fieldQuality.role,
    },
    updatedExperienceSummary:
      typeof parsed?.updatedExperienceSummary === "string"
        ? parsed.updatedExperienceSummary
        : fallback.updatedExperienceSummary,
    nextMissingField: ["scene", "action", "result", "scale", "role", "none"].includes(parsed?.nextMissingField)
      ? parsed.nextMissingField
      : fallback.nextMissingField,
    acknowledgement: typeof parsed?.acknowledgement === "string" ? parsed.acknowledgement : fallback.acknowledgement,
    reason: typeof parsed?.reason === "string" ? parsed.reason : fallback.reason,
    source,
    fallbackUsed: false,
  };
}

async function postChatCompletion(messages) {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: API_MODEL,
      messages,
    }),
  });

  if (!response.ok) {
    throw new Error(`API request failed with status ${response.status}`);
  }

  return response.json();
}

/**
 * 调用 VALUE_EVALUATION 的真实 API
 * @param {Object} promptInput - 结构化 prompt 输入
 * @returns {Object} 返回的结构化 JSON，匹配 unified schema
 */
export async function callValueEvaluationApi(promptInput) {
  // 如果没有配置 API_URL 或 API_KEY，使用 fallback
  if (!API_URL || !API_KEY) {
    console.warn("[realApi] API_URL or API_KEY not set, using mockApi fallback.");
    return getMockAssistantResponse(promptInput);
  }

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are a structured evaluator. Only return JSON compatible with the Lingxiu unified schema."
          },
          {
            role: "user",
            content: JSON.stringify(promptInput)
          }
        ]
      })
    });

    const data = await response.json();

    // 如果返回是 markdown 或文本包裹 JSON，尝试解析
    let parsed = data;
    if (typeof data === "string") {
      try {
        parsed = JSON.parse(data);
      } catch (err) {
        console.warn("[realApi] Failed to parse response JSON, using fallback.", err);
        return getMockAssistantResponse(promptInput);
      }
    }

    // 返回字段只保留 schema 需要的
    const {
      score,
      level,
      recommendedSection,
      isMainExperienceCandidate,
      dimensionScores,
      strengths,
      weaknesses,
      missingInfoPriority,
      nextQuestion,
      rewriteRisk,
      allowedPositioning,
      forbiddenClaims,
      readyToGenerate
    } = parsed;

    return {
      score,
      level,
      recommendedSection,
      isMainExperienceCandidate,
      dimensionScores,
      strengths,
      weaknesses,
      missingInfoPriority,
      nextQuestion,
      rewriteRisk,
      allowedPositioning,
      forbiddenClaims,
      readyToGenerate
    };

  } catch (err) {
    console.error("[realApi] API call failed, using fallback.", err);
    return getMockAssistantResponse(promptInput);
  }
}

/**
 * 调用 INPUT_INTERPRETER 的真实 API
 * @param {Object} promptInput - currentState/schema/userInput
 * @returns {Object} 结构化输入解释，失败时 fallback 到 mockApi
 */
export async function callInputInterpreterApi(promptInput) {
  if (!API_URL || !API_KEY) {
    console.warn("[realApi] API_URL or API_KEY not set, using input interpreter mock fallback.");
    return {
      ...getMockInputInterpreterResponse(promptInput),
      source: "mockApi",
      fallbackUsed: true,
    };
  }

  try {
    const data = await postChatCompletion([
      {
        role: "system",
        content: [
          "You are Lingxiu Island's input interpreter.",
          "Return only valid JSON matching the requested schema.",
          "Do not include secrets or API configuration.",
        ].join(" "),
      },
      {
        role: "user",
        content: JSON.stringify({
          promptKey: "INPUT_INTERPRETER",
          prompt: inputInterpreterPrompt,
          input: promptInput,
        }),
      },
    ]);

    const content = extractResponseContent(data);
    if (typeof content === "string") {
      const text = stripJsonFence(content);
      return normalizeInputInterpreterResponse(JSON.parse(text), promptInput);
    }

    return normalizeInputInterpreterResponse(content, promptInput);
  } catch (err) {
    console.error("[realApi] INPUT_INTERPRETER API call failed, using fallback.", err);
    return {
      ...getMockInputInterpreterResponse(promptInput),
      source: "mockApi",
      fallbackUsed: true,
    };
  }
}

/**
 * 调用 FIELD_RECONCILER 的真实 API
 * @param {Object} promptInput - currentState/userInput/currentExperience context
 * @returns {Object} extracted fields，失败时 fallback 到 mockApi
 */
export async function callFieldReconcilerApi(promptInput) {
  if (!API_URL || !API_KEY) {
    console.warn("[realApi] API_URL or API_KEY not set, using field reconciler mock fallback.");
    return getMockFieldReconcilerResponse(promptInput);
  }

  try {
    const data = await postChatCompletion([
      {
        role: "system",
        content: [
          "You are Lingxiu Island's field reconciler.",
          "Return only valid JSON with extractedFields, fieldQuality, updatedExperienceSummary, nextMissingField, acknowledgement, and reason.",
          "Do not include secrets or API configuration.",
        ].join(" "),
      },
      {
        role: "user",
        content: JSON.stringify({
          promptKey: "FIELD_RECONCILER",
          prompt: fieldReconcilerPrompt,
          input: promptInput,
        }),
      },
    ]);

    const content = extractResponseContent(data);
    if (typeof content === "string") {
      const text = stripJsonFence(content);
      return normalizeFieldReconcilerResponse(JSON.parse(text), promptInput);
    }

    return normalizeFieldReconcilerResponse(content, promptInput);
  } catch (err) {
    console.error("[realApi] FIELD_RECONCILER API call failed, using fallback.", err);
    return getMockFieldReconcilerResponse(promptInput);
  }
}

/**
 * 调用 QUESTION_GENERATOR 的真实 API
 * @param {Object} promptInput - state/context/missingField
 * @returns {Object} assistantMessage/targetField，失败时 fallback 到 mockApi
 */
export async function callQuestionGeneratorApi(promptInput) {
  if (!API_URL || !API_KEY) {
    console.warn("[realApi] API_URL or API_KEY not set, using question generator mock fallback.");
    return getMockQuestionGeneratorResponse(promptInput);
  }

  try {
    const data = await postChatCompletion([
      {
        role: "system",
        content: [
          "You are Lingxiu Island's context-aware question generator.",
          "Return only valid JSON with assistantMessage, targetField, and reason.",
          "Do not include secrets or API configuration.",
        ].join(" "),
      },
      {
        role: "user",
        content: JSON.stringify({
          promptKey: "QUESTION_GENERATOR",
          prompt: questionGeneratorPrompt,
          input: promptInput,
        }),
      },
    ]);

    const content = extractResponseContent(data);
    if (typeof content === "string") {
      const text = stripJsonFence(content);
      return normalizeQuestionGeneratorResponse(JSON.parse(text), promptInput);
    }

    return normalizeQuestionGeneratorResponse(content, promptInput);
  } catch (err) {
    console.error("[realApi] QUESTION_GENERATOR API call failed, using fallback.", err);
    return getMockQuestionGeneratorResponse(promptInput);
  }
}

/**
 * 调用 GENERATION_POLICY 的真实 API
 * @param {Object} promptInput - currentExperience/evaluation/recovery context
 * @returns {Object} generation gate decision，失败时 fallback 到 mockApi
 */
export async function callGenerationPolicyApi(promptInput) {
  if (!API_URL || !API_KEY) {
    console.warn("[realApi] API_URL or API_KEY not set, using generation policy mock fallback.");
    return getMockGenerationPolicyResponse(promptInput);
  }

  try {
    const data = await postChatCompletion([
      {
        role: "system",
        content: [
          "You are Lingxiu Island's generation policy gate.",
          "Return only valid JSON with the generation policy schema.",
          "Do not include secrets or API configuration.",
        ].join(" "),
      },
      {
        role: "user",
        content: JSON.stringify({
          promptKey: "GENERATION_POLICY",
          prompt: generationPolicyPrompt,
          input: promptInput,
        }),
      },
    ]);

    const content = extractResponseContent(data);
    if (typeof content === "string") {
      const text = stripJsonFence(content);
      return normalizeGenerationPolicyResponse(JSON.parse(text), promptInput);
    }

    return normalizeGenerationPolicyResponse(content, promptInput);
  } catch (err) {
    console.error("[realApi] GENERATION_POLICY API call failed, using fallback.", err);
    return getMockGenerationPolicyResponse(promptInput);
  }
}

/**
 * 调用 RESUME_TRANSLATION 的真实 API
 * @param {Object} promptInput - 结构化经历输入
 * @returns {Object} 返回 resumeDraft schema，失败时 fallback 到 mockApi
 */
export async function callResumeTranslationApi(promptInput) {
  if (!API_URL || !API_KEY) {
    console.warn("[realApi] API_URL or API_KEY not set, using resume translation mock fallback.");
    return getMockResumeTranslationResponse(promptInput);
  }

  try {
    const data = await postChatCompletion([
      {
        role: "system",
        content: [
          "You are Lingxiu Island's resume translation agent.",
          "Follow the user's resumeTranslationPrompt for writing quality.",
          "Return either one final Chinese resume bullet, or JSON compatible with { resumeDraft: { resumeBullets, experienceCard, usedFacts, riskWarnings, needsUserConfirmation } }.",
          "Never include secrets or API configuration."
        ].join(" ")
      },
      {
        role: "user",
        content: JSON.stringify({
          promptKey: "RESUME_TRANSLATION",
          prompt: resumeTranslationPrompt,
          schemaInstruction: {
            resumeDraft: {
              resumeBullets: ["string"],
              experienceCard: "object",
              usedFacts: ["string"],
              riskWarnings: ["string"],
              needsUserConfirmation: true,
            }
          },
          input: promptInput,
        })
      }
    ]);

    const content = extractResponseContent(data);
    if (typeof content === "string") {
      const text = stripJsonFence(content);
      try {
        return normalizeResumeTranslationResponse(JSON.parse(text), promptInput);
      } catch {
        return normalizeResumeTranslationResponse(text, promptInput);
      }
    }

    return normalizeResumeTranslationResponse(content, promptInput);
  } catch (err) {
    console.error("[realApi] RESUME_TRANSLATION API call failed, using fallback.", err);
    return getMockResumeTranslationResponse(promptInput);
  }
}
