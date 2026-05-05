export function getMockAssistantResponse({ currentState, userInput, promptKey }) {
  console.log("[mockApi] placeholder response requested", { currentState, userInput, promptKey });

  return {
    assistantMessage: "Mock API placeholder: stateMachine.js owns the v0.1 product flow.",
    quickReplies: [],
    nextStage: currentState,
  };
}

export function getMockResumeTranslationResponse(promptInput = {}) {
  console.warn("[mockApi] resume translation fallback used.");

  const experience = promptInput.currentExperience || {};
  const scene = experience.scene || "相关经历";
  const action = experience.action || "基础支持工作";
  const result = experience.result || "后续整理与执行";
  const scale = experience.scale ? `，涉及${experience.scale}` : "";
  const bullet = `参与${scene}，协助${action}，支持${result}${scale}。`;

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
