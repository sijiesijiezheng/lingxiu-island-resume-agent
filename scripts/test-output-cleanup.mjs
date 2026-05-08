import { createStateMachine } from "../stateMachine.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function notIncludes(text, phrase, label) {
  assert(!String(text || "").includes(phrase), `${label} should not include ${phrase}.`);
}

async function runFlow(inputs) {
  const sm = createStateMachine();
  sm.getInitialResponse();
  const responses = [];
  for (const input of inputs) {
    responses.push(await sm.handleUserInput(input));
  }
  return { sm, responses, snapshot: sm.snapshot() };
}

const inputs = [
  "运营/新媒体/内容",
  "发布抖音，有10万浏览量算吗",
  "我们创业课老师让做的，介绍自己卖的东西",
  "就是刚才那个短视频，我们组发布的抖音视频，我负责写文案",
];

const { sm, responses, snapshot } = await runFlow(inputs);
const sceneFollowup = responses[2].assistantMessage;

["老师让做的", "介绍自己卖的东西", "就是刚才", "算吗", "嗯", "我们组那个", "这种小事"].forEach((phrase) => {
  notIncludes(sceneFollowup, phrase, "Question Generator followup");
});
assert(
  sceneFollowup.includes("创业课程") && (sceneFollowup.includes("产品展示") || sceneFollowup.includes("短视频")),
  "Question Generator followup should use cleaned entrepreneurship-course context."
);
assert(sceneFollowup.includes("文案") && sceneFollowup.includes("剪辑") && sceneFollowup.includes("发布"), "Question Generator should ask with specific role options.");
assert(sceneFollowup !== responses[1].assistantMessage, "Question Generator should not repeat the previous role question verbatim.");

assert(snapshot.resumeDraft.resumeBullets.length > 0, "Flow should reach resume translation before confirmation.");
const outputResponse = await sm.handleUserInput("基本符合");
const outputText = outputResponse.assistantMessage;
const bullet = snapshot.resumeDraft.resumeBullets[0];

assert(outputResponse.nextState === "OUTPUT_RESULT", "Flow should reach OUTPUT_RESULT.");
assert(outputText.includes(bullet), "OUTPUT_RESULT should display resumeDraft.resumeBullets.");
assert(outputText.includes("具体动作：撰写抖音短视频文案"), "OUTPUT_RESULT should normalize action display.");
assert(outputText.includes("结果/用途：支持小组完成产品展示"), "OUTPUT_RESULT should normalize result/use display.");
assert(outputText.includes("结果数据：单条内容约10万浏览量"), "OUTPUT_RESULT should display result data separately.");
assert(outputText.includes("规模/周期：未补充"), "OUTPUT_RESULT should not treat views as scale/period.");
notIncludes(outputText, "规模/周期：10万浏览", "OUTPUT_RESULT");

["老师让做的", "介绍自己卖的东西", "就是刚才", "算吗", "嗯", "我们组那个", "这种小事"].forEach((phrase) => {
  notIncludes(outputText, phrase, "OUTPUT_RESULT");
});

assert(outputResponse.quickReplies.includes("生成经历草稿"), "Buttons should keep 生成经历草稿.");
assert(!outputResponse.quickReplies.includes("先生成简历"), "Buttons should not include 先生成简历.");

console.log(JSON.stringify({
  passed: 3,
  questionGeneratorFollowup: sceneFollowup,
  outputResult: outputText,
  quickReplies: outputResponse.quickReplies,
}, null, 2));
