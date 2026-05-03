export function createVoiceInput({
  onTranscript,
  onRecordingChange,
  onStatus,
  onUnavailable,
} = {}) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;
  let isRecording = false;

  function setRecording(active) {
    isRecording = active;
    onRecordingChange?.(active);
    if (active) onStatus?.("正在听你说…", "listening");
  }

  if (!SpeechRecognition) {
    console.warn("[voice] SpeechRecognition unavailable");
    onUnavailable?.("当前浏览器暂不支持语音输入，可以先用文字输入。");
    return {
      isSupported: false,
      isRecording: () => false,
      start: () => {},
      stop: () => {},
      toggle: () => {},
    };
  }

  recognition = new SpeechRecognition();
  recognition.lang = "zh-CN";
  recognition.interimResults = true;
  recognition.continuous = false;
  console.log("[voice] SpeechRecognition created", recognition);

  recognition.addEventListener("start", () => {
    console.log("[voice] recognition starts");
    setRecording(true);
  });

  recognition.addEventListener("result", (event) => {
    console.log("[voice] recognition returns result", event);
    let finalTranscript = "";
    let interimTranscript = "";

    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const transcript = event.results[index][0].transcript;
      if (event.results[index].isFinal) finalTranscript += transcript;
      else interimTranscript += transcript;
    }

    if (finalTranscript.trim()) {
      onTranscript?.(finalTranscript.trim());
      return;
    }

    if (interimTranscript.trim()) {
      onStatus?.(`正在听你说… ${interimTranscript.trim()}`, "listening");
    }
  });

  recognition.addEventListener("error", (event) => {
    console.error("[voice] recognition errors", event.error, event);
    setRecording(false);

    if (event.error === "not-allowed" || event.error === "service-not-allowed") {
      onStatus?.("麦克风权限被拒绝，请在浏览器地址栏允许麦克风权限。", "warning");
      return;
    }

    if (event.error === "no-speech") {
      onStatus?.("没有识别到语音，可以再试一次。", "warning");
      return;
    }

    onStatus?.("语音输入暂时不可用，可以先用文字输入。", "warning");
  });

  recognition.addEventListener("end", () => {
    console.log("[voice] recognition ends");
    setRecording(false);
  });

  function start() {
    if (isRecording) return;

    try {
      onStatus?.("");
      setRecording(true);
      recognition.start();
    } catch (error) {
      setRecording(false);
      console.error("[voice] recognition start failed", error);
      onStatus?.("语音输入正在准备中，请稍后再试一次。", "warning");
    }
  }

  function stop() {
    if (!isRecording) return;
    recognition.stop();
    setRecording(false);
  }

  function toggle() {
    console.log("[voice] mic button clicked", { isRecording });
    if (isRecording) stop();
    else start();
  }

  return {
    isSupported: true,
    isRecording: () => isRecording,
    start,
    stop,
    toggle,
  };
}
