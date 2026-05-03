import { initUI } from "./ui.js";
import { createVoiceInput } from "./voiceInput.js";
import { createStateMachine } from "./stateMachine.js";

console.log("[app] main.js loaded", { protocol: window.location.protocol });

function bootApp() {
  console.log("[app] DOMContentLoaded fired");

  const ui = initUI();
  const stateMachine = createStateMachine();

  const voiceInput = createVoiceInput({
    onTranscript: (transcript) => {
      ui.appendInputValue(transcript);
    },
    onRecordingChange: (isRecording) => {
      ui.setRecordingActive(isRecording);
      if (!isRecording) ui.updateRecordingStatus("");
    },
    onStatus: (message, state) => {
      ui.updateRecordingStatus(message, state);
    },
    onUnavailable: (message) => {
      ui.setMicDisabled(true);
      ui.updateRecordingStatus(message, "warning");
    },
  });
  console.log("[app] voice input initialized", { isSupported: voiceInput.isSupported });

  function renderAssistantResponse(response) {
    ui.updateVisualStage(response.visualStage);
    ui.renderMessage("ai", response.assistantMessage);
    ui.renderQuickReplies(response.quickReplies);
    ui.triggerAssistantGather();
  }

  function renderAssistantResponseSoon(response, delay = 520) {
    window.setTimeout(() => renderAssistantResponse(response), delay);
  }

  function submitUserInput(rawInput) {
    console.log("[app] send clicked", { rawInput });
    const userInput = rawInput.trim();
    if (!userInput) return;

    ui.renderMessage("user", userInput);
    ui.updateInputValue("");
    ui.clearQuickReplies();
    ui.triggerUserPulse();

    const response = stateMachine.handleUserInput(userInput);
    renderAssistantResponseSoon(response);
  }

  ui.bindSend(submitUserInput);
  ui.bindQuickReply(submitUserInput);
  ui.bindMic(() => voiceInput.toggle());

  const initialResponse = stateMachine.getInitialResponse();
  ui.updateVisualStage(initialResponse.visualStage);
  renderAssistantResponseSoon(initialResponse, 420);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootApp, { once: true });
} else {
  bootApp();
}
