// realApi.js
// 最小可用的真实 API 接入文件
// 兼容现有 stateMachine 和 unified schema
// fallback 会继续调用 mockApi，保证页面不会崩

const runtimeConfig = globalThis.window || globalThis;
const API_URL = runtimeConfig.LINGXIU_API_URL || "";
const API_KEY = runtimeConfig.LINGXIU_API_KEY || "";
const API_MODEL = runtimeConfig.LINGXIU_MODEL || "openai/gpt-4o-mini";

// 导入 mockApi，用于 fallback
import { getMockAssistantResponse, getMockResumeTranslationResponse } from "./mockApi.js";
import { resumeTranslationPrompt } from "./prompts.js";

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
