export function getMockAssistantResponse({ currentState, userInput, promptKey }) {
  console.log("[mockApi] placeholder response requested", { currentState, userInput, promptKey });

  return {
    assistantMessage: "Mock API placeholder: stateMachine.js owns the v0.1 product flow.",
    quickReplies: [],
    nextStage: currentState,
  };
}
