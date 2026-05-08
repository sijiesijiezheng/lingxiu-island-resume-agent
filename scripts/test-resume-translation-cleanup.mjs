import { createStateMachine } from "../stateMachine.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertNotIncludes(text, phrase, label) {
  assert(!String(text || "").includes(phrase), `${label} should not include ${phrase}.`);
}

async function runFlow(inputs) {
  const sm = createStateMachine();
  sm.getInitialResponse();
  let response = null;
  for (const input of inputs) {
    response = await sm.handleUserInput(input);
  }
  return { sm, response, snapshot: sm.snapshot() };
}

const dirtyFlow = [
  "运营/新媒体/内容",
  "发布抖音，有10万浏览量算吗",
  "我们创业课老师让做的，介绍自己卖的东西",
  "就是刚才那个短视频，我们组发布的抖音视频，我负责写文案",
];

const { sm, response, snapshot } = await runFlow(dirtyFlow);
const resumeBullet = snapshot.resumeDraft.resumeBullets[0] || "";

[
  "算吗",
  "就是刚才",
  "老师让做的",
  "我负责",
  "【",
  "】",
  "介绍自己卖的东西",
  "有一个有",
].forEach((phrase) => assertNotIncludes(resumeBullet, phrase, "resumeBullet"));

["创业课程", "抖音", "文案撰写", "10万浏览量"].forEach((phrase) => {
  assert(resumeBullet.includes(phrase), `resumeBullet should include ${phrase}.`);
});

assert(response.nextState === "USER_CONFIRMATION", "Flow should reach USER_CONFIRMATION before final confirmation.");

const outputResponse = await sm.handleUserInput("基本符合");
const outputText = outputResponse.assistantMessage;

assert(outputResponse.nextState === "OUTPUT_RESULT", "Confirmation should reach OUTPUT_RESULT.");
assert(outputText.includes(resumeBullet), "OUTPUT_RESULT should use resumeDraft.resumeBullets.");
assert(!outputText.includes("在【"), "OUTPUT_RESULT should not use old placeholder template.");
assert(!outputText.includes("协助完成【"), "OUTPUT_RESULT should not use old hard-coded template.");
[
  "算吗",
  "就是刚才",
  "老师让做的",
  "我负责",
  "介绍自己卖的东西",
].forEach((phrase) => assertNotIncludes(outputText, phrase, "OUTPUT_RESULT"));

assert(outputResponse.quickReplies.includes("生成经历草稿"), "Quick replies should include 生成经历草稿.");
assert(!outputResponse.quickReplies.includes("先生成简历"), "Quick replies should not include 先生成简历.");

const draftResponse = await sm.handleUserInput("生成经历草稿");
assert(draftResponse.assistantMessage.includes(resumeBullet), "生成经历草稿 should show current resume draft.");
assert(!draftResponse.assistantMessage.includes("当前版本不支持简历生成"), "Button should not show unsupported resume generation copy.");

console.log(JSON.stringify({
  passed: 3,
  resumeBullet,
  outputResultPreview: outputText,
  quickReplies: outputResponse.quickReplies,
  draftButtonState: draftResponse.nextState,
}, null, 2));
