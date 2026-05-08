import { createStateMachine } from "../stateMachine.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function includes(text = "", phrase = "") {
  return String(text).includes(phrase);
}

function excludesTemplates(message) {
  assert(!includes(message, "这种小事也可以拆"), "should not use generic template: 这种小事也可以拆.");
  assert(!includes(message, "你只要说一个自己做过的动作就行"), "should not use generic action template.");
  assert(!includes(message, "这件事大概发生在课程、社团、兼职还是帮别人做事的时候"), "should not ask generic background.");
}

async function runSteps(steps) {
  const sm = createStateMachine();
  sm.getInitialResponse();
  let response = null;
  for (const step of steps) {
    response = await sm.handleUserInput(step);
  }
  return { response, snapshot: sm.snapshot() };
}

const results = [];

{
  const input = "发布抖音算吗，我在抖音发布过一个视频获得了10万浏览量";
  const { response, snapshot } = await runSteps(["运营/新媒体/内容", input]);
  assert(snapshot.experienceDiscovery.experienceSeed.includes("发布抖音"), "Case 1 should identify concrete Douyin experience.");
  assert(includes(snapshot.currentExperience.result, "10万") || includes(snapshot.currentExperience.scale, "10万"), "Case 1 should store 10万 result/scale.");
  assert(includes(response.assistantMessage, "10万") || includes(response.assistantMessage, "播放量"), "Case 1 message should use the data.");
  assert(["选题", "拍摄", "剪辑", "发布", "数据复盘"].some((item) => includes(response.assistantMessage, item)), "Case 1 should ask action/role.");
  assert(!includes(response.assistantMessage, "小背景"), "Case 1 should not ask generic background.");
  excludesTemplates(response.assistantMessage);
  results.push({ name: "Case 1", finalState: response.nextState, assistantMessage: response.assistantMessage });
}

{
  const { response, snapshot } = await runSteps([
    "运营/新媒体/内容",
    "发布抖音算吗，我在抖音发布过一个视频获得了10万浏览量",
    "是我们社团发的宣传社团活动",
  ]);
  assert(includes(snapshot.currentExperience.scene, "社团"), "Case 2 should store scene.");
  assert(includes(response.assistantMessage, "社团"), "Case 2 should acknowledge society context.");
  assert(includes(response.assistantMessage, "内容制作") || includes(response.assistantMessage, "发布"), "Case 2 should ask concrete responsibility.");
  assert(!includes(response.assistantMessage, "这种小事"), "Case 2 should not say 这种小事.");
  excludesTemplates(response.assistantMessage);
  results.push({ name: "Case 2", finalState: response.nextState, assistantMessage: response.assistantMessage });
}

{
  const { response, snapshot } = await runSteps(["运营/新媒体/内容", "我有一段经历但是很水"]);
  const interpretation = snapshot.runtime.lastInputInterpretation;
  assert(interpretation.hasExperience === true, "Case 3 should identify experience.");
  assert(interpretation.experienceConfidence === "low", "Case 3 should identify low confidence.");
  assert(includes(response.assistantMessage, "不一定没价值") || includes(response.assistantMessage, "不急着判断强不强"), "Case 3 should reassure and validate.");
  assert(includes(response.assistantMessage, "动作") || includes(response.assistantMessage, "结果") || includes(response.assistantMessage, "参与"), "Case 3 should guide toward fields.");
  excludesTemplates(response.assistantMessage);
  results.push({ name: "Case 3", finalState: response.nextState, assistantMessage: response.assistantMessage });
}

{
  const { response, snapshot } = await runSteps([
    "运营/新媒体/内容",
    "发布抖音算吗，我在抖音发布过一个视频获得了10万浏览量",
    "不知道",
    "不知道",
  ]);
  const assistantMessages = snapshot.session.conversation
    .filter((item) => item.role === "assistant")
    .map((item) => item.content);
  assert(assistantMessages.at(-1) !== assistantMessages.at(-2), "Case 4 should not repeat stuck fallback.");
  assert(includes(response.assistantMessage, "选择题") || includes(response.assistantMessage, "最低门槛") || includes(response.assistantMessage, "内容制作"), "Case 4 should degrade guidance.");
  excludesTemplates(response.assistantMessage);
  results.push({ name: "Case 4", finalState: response.nextState, assistantMessage: response.assistantMessage });
}

{
  const { response, snapshot } = await runSteps([
    "运营/新媒体/内容",
    "发布抖音算吗，我在抖音发布过一个视频获得了10万浏览量",
    "是社团发的宣传社团活动",
    "我负责选题、标题文案、发布和看数据",
  ]);
  assert(response.nextState === "USER_CONFIRMATION", "Case 5 should reach resume translation confirmation.");
  assert(snapshot.evaluation.readyToGenerate === true, "Case 5 should be ready to generate.");
  assert(snapshot.resumeDraft.resumeBullets.length > 0, "Case 5 should write resume bullet.");
  const allAssistant = snapshot.session.conversation.filter((item) => item.role === "assistant").map((item) => item.content).join("\n");
  assert(includes(allAssistant, "抖音") || includes(allAssistant, "播放量"), "Case 5 should keep Douyin/result context.");
  excludesTemplates(allAssistant);
  results.push({
    name: "Case 5",
    finalState: response.nextState,
    assistantMessage: response.assistantMessage,
    resumeBullet: snapshot.resumeDraft.resumeBullets[0],
  });
}

console.log(JSON.stringify({ passed: results.length, cases: results }, null, 2));
