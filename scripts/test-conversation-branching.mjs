import { createStateMachine } from "../stateMachine.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function includes(text = "", phrase = "") {
  return String(text).includes(phrase);
}

function count(text = "", phrase = "") {
  return String(text).split(phrase).length - 1;
}

async function runSteps(steps) {
  const sm = createStateMachine();
  sm.getInitialResponse();
  let response = null;
  for (const step of steps) {
    response = await sm.handleUserInput(step);
  }
  return { response, snapshot: sm.snapshot(), sm };
}

const results = [];

{
  const { response } = await runSteps(["暂时不确定", "没有/不确定，帮我找找"]);
  assert(count(response.assistantMessage, "没关系") <= 1, "Case A should not repeat two 没关系 paragraphs.");
  assert(response.quickReplies.length > 0, "Case A should show quick replies when asking user to choose.");
  assert(includes(response.assistantMessage, "选 1-3 个"), "Case A should match card/quick reply selection copy.");
  results.push({ name: "Case A", finalState: response.nextState, assistantMessage: response.assistantMessage });
}

{
  const { response, snapshot } = await runSteps(["暂时不确定", "没有/不确定，帮我找找", "账号运营/内容发布"]);
  assert(response.nextState === "SELECT_EXPERIENCE", "Case B should move to SELECT_EXPERIENCE.");
  assert(snapshot.experienceDiscovery.selectedExperienceTypes.includes("账号运营/内容发布"), "Case B should store selected type.");
  assert(!includes(response.assistantMessage, "你选的这些里面"), "Case B should not use old selected-these wording.");
  assert(includes(response.assistantMessage, "发布过一条"), "Case B should guide toward a concrete event.");
  results.push({ name: "Case B", finalState: response.nextState, assistantMessage: response.assistantMessage });
}

{
  const { response, snapshot } = await runSteps(["暂时不确定", "没有/不确定，帮我找找", "账号运营/内容发布", "发布抖音，有一个有10万浏览量"]);
  assert(response.nextState === "DEEP_DIVE_ACTION", "Case C should ask for action/role next.");
  assert(snapshot.experienceDiscovery.experienceSeed.includes("发布抖音"), "Case C should store 发布抖音 seed.");
  assert(includes(snapshot.currentExperience.result, "10万") || includes(snapshot.currentExperience.scale, "10万"), "Case C should store 10万浏览量.");
  assert(!includes(response.assistantMessage, "小背景"), "Case C should not ask generic scene background.");
  assert(includes(response.assistantMessage, "主要负责哪一部分"), "Case C should ask action/role.");
  results.push({ name: "Case C", finalState: response.nextState, assistantMessage: response.assistantMessage });
}

{
  const { response, snapshot } = await runSteps([
    "暂时不确定",
    "没有/不确定，帮我找找",
    "账号运营/内容发布",
    "发布抖音，有一个有10万浏览量",
    "我负责选题、标题文案和发布",
  ]);
  assert(response.nextState === "USER_CONFIRMATION", "Case D should reach resume translation confirmation.");
  assert(snapshot.evaluation.readyToGenerate === true, "Case D should be ready to generate.");
  assert(snapshot.resumeDraft.resumeBullets.length > 0, "Case D should write resume bullet.");
  const assistantMessages = snapshot.session.conversation.filter((item) => item.role === "assistant").map((item) => item.content);
  assert(assistantMessages.every((message) => count(message, "没关系") <= 1), "Case D should not repeat reassurance in one message.");
  results.push({
    name: "Case D",
    finalState: response.nextState,
    assistantMessage: response.assistantMessage,
    resumeBullet: snapshot.resumeDraft.resumeBullets[0],
  });
}

console.log(JSON.stringify({ passed: results.length, cases: results }, null, 2));
