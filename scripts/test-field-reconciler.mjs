import { getMockFieldReconcilerResponse } from "../mockApi.js";
import { createStateMachine } from "../stateMachine.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function notIncludes(text, phrase, label) {
  assert(!String(text || "").includes(phrase), `${label} should not include ${phrase}.`);
}

function reconcile(userInput, currentState, currentExperience = {}) {
  return getMockFieldReconcilerResponse({
    currentState,
    userInput,
    inputInterpretation: {},
    currentExperience,
    targetRole: "运营/新媒体/内容",
  });
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

const results = [];

{
  const rec = reconcile("我负责写文案", "DEEP_DIVE_SCENE");
  assert(rec.extractedFields.action === "撰写内容文案", "C05 should extract generic clean action.");
  assert(rec.extractedFields.role === "负责文案", "C05 should extract role.");
  assert(!rec.extractedFields.scene, "C05 should not infer scene from isolated writing action.");
  assert(!rec.extractedFields.experienceSeed, "C05 should not over-specify experienceSeed from isolated writing action.");
  assert(rec.nextMissingField === "scene", "C05 should ask scene next.");

  const { response, snapshot } = await runFlow(["运营/新媒体/内容", "有一段经历，但是很水，没什么实际成效", "我负责写文案"]);
  assert(snapshot.currentExperience.action === "撰写内容文案", "C05 runtime should merge generic action.");
  assert(snapshot.currentExperience.role === "负责文案", "C05 runtime should merge role.");
  assert(!snapshot.currentExperience.scene, "C05 runtime should keep scene empty.");
  assert(response.nextState === "DEEP_DIVE_SCENE", "C05 runtime should ask missing scene next.");
  assert(response.assistantMessage.includes("文案"), "C05 response should acknowledge copywriting.");
  assert(!response.assistantMessage.includes("主要负责哪一部分"), "C05 should not repeat action question.");
  results.push({ name: "C05 isolated action", response: response.assistantMessage, currentExperience: snapshot.currentExperience });
}

{
  const richInput = "我在社团负责发布抖音宣传视频，写文案，最后有10万浏览量";
  const rec = reconcile(richInput, "DEEP_DIVE_SCENE");
  assert(rec.extractedFields.scene === "社团宣传", "C06 should extract scene.");
  assert(rec.extractedFields.experienceSeed === "抖音宣传视频", "C06 should extract seed.");
  assert(rec.extractedFields.action === "发布抖音宣传视频，撰写内容文案", "C06 should extract compound action.");
  assert(rec.extractedFields.role === "负责发布和文案", "C06 should extract role.");
  assert(rec.extractedFields.resultMetric === "单条内容约10万浏览量", "C06 should extract resultMetric.");
  assert(rec.extractedFields.result === "支持社团宣传内容传播", "C06 should extract result/use.");
  assert(!rec.extractedFields.scale, "C06 should not put views into scale.");
  assert(rec.nextMissingField === "none", "C06 should not ask action after all core fields are extracted.");

  const { response, snapshot } = await runFlow(["运营/新媒体/内容", richInput]);
  assert(snapshot.currentExperience.scene === "社团宣传", "C06 runtime should merge scene.");
  assert(snapshot.currentExperience.action === "发布抖音宣传视频，撰写内容文案", "C06 runtime should merge action.");
  assert(snapshot.currentExperience.role === "负责发布和文案", "C06 runtime should merge role.");
  assert(snapshot.currentExperience.resultMetric === "单条内容约10万浏览量", "C06 runtime should merge resultMetric.");
  assert(snapshot.experienceDiscovery.experienceSeed === "抖音宣传视频", "C06 runtime should merge seed.");
  assert(!snapshot.currentExperience.scale, "C06 runtime should not merge views into scale.");
  assert(!response.assistantMessage.includes("主要负责哪一部分"), "C06 runtime should not ask answered action question.");
  results.push({ name: "C06 rich input", response: response.assistantMessage, currentExperience: snapshot.currentExperience });
}

{
  const rec = reconcile("文案", "DEEP_DIVE_ACTION", {
    experienceSeed: "发布抖音短视频",
    resultMetric: "单条内容约10万浏览量",
  });
  assert(rec.extractedFields.action === "撰写抖音短视频文案", "Case 1 should extract clean action.");
  assert(rec.extractedFields.role === "负责文案", "Case 1 should extract role.");

  const { response, snapshot } = await runFlow(["运营/新媒体/内容", "发布抖音，有10万浏览量算吗", "文案"]);
  assert(snapshot.currentExperience.action === "撰写抖音短视频文案", "Case 1 runtime should merge action.");
  assert(snapshot.currentExperience.role === "负责文案", "Case 1 runtime should merge role.");
  assert(response.nextState === "DEEP_DIVE_SCENE", "Case 1 next state should ask missing scene.");
  assert(!response.assistantMessage.includes("主要负责哪一部分"), "Case 1 should not repeat role question.");
  results.push({ name: "Case 1", response: response.assistantMessage, currentExperience: snapshot.currentExperience });
}

{
  const rec = reconcile("发布抖音，有10万浏览量算吗", "DEEP_DIVE_SCENE");
  assert(rec.extractedFields.experienceSeed === "发布抖音短视频", "Case 2 should extract seed.");
  assert(rec.extractedFields.resultMetric === "单条内容约10万浏览量", "Case 2 should extract resultMetric.");
  assert(!rec.extractedFields.scale, "Case 2 should not put views into scale.");
  const { response, snapshot } = await runFlow(["运营/新媒体/内容", "发布抖音，有10万浏览量算吗"]);
  assert(snapshot.currentExperience.resultMetric === "单条内容约10万浏览量", "Case 2 runtime should merge resultMetric.");
  assert(!snapshot.currentExperience.scale, "Case 2 runtime should not merge view count into scale.");
  assert(response.nextState === "DEEP_DIVE_ACTION", "Case 2 next question should ask action/role.");
  results.push({ name: "Case 2", response: response.assistantMessage, currentExperience: snapshot.currentExperience });
}

{
  const rec = reconcile("我们创业课老师让做的，介绍自己卖的东西", "DEEP_DIVE_SCENE");
  assert(rec.extractedFields.scene === "创业课程产品展示", "Case 3 should extract clean scene.");
  notIncludes(rec.extractedFields.scene, "老师让做的", "Case 3 scene");
  notIncludes(rec.extractedFields.scene, "介绍自己卖的东西", "Case 3 scene");
  assert(rec.nextMissingField === "action", "Case 3 should ask action next.");
  results.push({ name: "Case 3", reconciliation: rec });
}

{
  const rec = reconcile("就是刚才那个短视频，我们组发布的抖音视频，我负责写文案", "DEEP_DIVE_ACTION");
  assert(rec.extractedFields.action === "撰写抖音短视频文案", "Case 4 should extract clean action.");
  assert(rec.extractedFields.role === "负责文案", "Case 4 should extract role.");
  assert(rec.extractedFields.scene === "小组抖音视频发布", "Case 4 should supplement scene.");
  notIncludes(rec.extractedFields.action, "就是刚才那个", "Case 4 action");
  results.push({ name: "Case 4", reconciliation: rec });
}

{
  const { sm, response, snapshot } = await runFlow([
    "运营/新媒体/内容",
    "发布抖音，有10万浏览量算吗",
    "文案",
    "我们创业课老师让做的，介绍自己卖的东西",
  ]);
  assert(response.nextState === "USER_CONFIRMATION", "Case 5 should reach USER_CONFIRMATION.");
  assert(snapshot.currentExperience.action === "撰写抖音短视频文案", "Case 5 should keep action.");
  assert(snapshot.currentExperience.role === "负责文案", "Case 5 should keep role.");
  assert(snapshot.currentExperience.resultMetric === "单条内容约10万浏览量", "Case 5 should keep resultMetric.");
  assert(snapshot.currentExperience.scene === "创业课程产品展示", "Case 5 should keep clean scene.");
  const confirm = await sm.handleUserInput("基本符合");
  assert(confirm.nextState === "OUTPUT_RESULT", "Case 5 should reach OUTPUT_RESULT.");
  const output = confirm.assistantMessage;
  ["算吗", "老师让做的", "介绍自己卖的东西", "就是刚才"].forEach((phrase) => notIncludes(output, phrase, "Case 5 output"));
  assert(output.includes("撰写抖音短视频文案"), "Case 5 output should include clean action.");
  assert(output.includes("单条内容约10万浏览量"), "Case 5 output should include result metric.");
  results.push({ name: "Case 5", output, resumeBullet: snapshot.resumeDraft.resumeBullets[0] });
}

console.log(JSON.stringify({ passed: results.length, results }, null, 2));
