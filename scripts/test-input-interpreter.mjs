import { createStateMachine } from "../stateMachine.js";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function includes(text = "", phrase = "") {
  return String(text).includes(phrase);
}

async function runCase(name, steps, validate) {
  const sm = createStateMachine();
  sm.getInitialResponse();
  let response = null;

  for (const step of steps) {
    response = await sm.handleUserInput(step);
  }

  const snapshot = sm.snapshot();
  validate({ response, snapshot });
  return { name, response, snapshot };
}

const results = [];

results.push(await runCase("Case 1: uncertain target role", ["暂时不确定"], ({ response, snapshot }) => {
  assert(snapshot.userProfile.targetRoleStatus === "uncertain", "targetRoleStatus should be uncertain.");
  assert(!includes(response.assistantMessage, "按这个方向帮你看"), "should not say 按这个方向帮你看.");
}));

results.push(await runCase("Case 2: group PPT validation", ["暂时不确定", "做过一个小组PPT算吗"], ({ response, snapshot }) => {
  const interpretation = snapshot.runtime.lastInputInterpretation;
  assert(interpretation.hasExperience === true, "hasExperience should be true.");
  assert(includes(snapshot.experienceDiscovery.experienceSeed, "小组PPT"), "experienceSeed should include 小组PPT.");
  assert(interpretation.shouldGoToDeepDive === true, "shouldGoToDeepDive should be true.");
  assert(response.nextState === "DEEP_DIVE_SCENE", "should go to DEEP_DIVE_SCENE.");
}));

results.push(await runCase("Case 3: all uncertain in inventory", ["暂时不确定", "没有", "都不确定"], ({ response }) => {
  assert(response.nextState === "INVENTORY_SCREENING", "should stay in inventory guidance.");
  assert(!includes(response.assistantMessage, "你选的这些里面"), "should not ask selected-types wording.");
}));

results.push(await runCase("Case 4: low confidence experience", ["暂时不确定", "有一段经历，但是很水，没什么实际成效"], ({ response, snapshot }) => {
  const interpretation = snapshot.runtime.lastInputInterpretation;
  assert(interpretation.hasExperience === true, "hasExperience should be true.");
  assert(interpretation.experienceConfidence === "low", "experienceConfidence should be low.");
  assert(interpretation.intent === "ask_validation", "intent should be ask_validation.");
  assert(response.nextState.startsWith("DEEP_DIVE_"), "should go to deep dive.");
}));

results.push(await runCase("Case 5: finance industry research target", ["我想做金融行业的行业研究员，比如研究某一个行业", "做过一个小组PPT算吗"], ({ response, snapshot }) => {
  assert(snapshot.userProfile.targetRoleStatus === "known", "targetRoleStatus should be known.");
  assert(
    includes(snapshot.userProfile.targetRole, "金融行业") || includes(snapshot.userProfile.targetRole, "行业研究"),
    "targetRole should include finance/industry research."
  );
  const assistantText = snapshot.session.conversation
    .filter((item) => item.role === "assistant")
    .map((item) => item.content)
    .join("\n");
  assert(includes(assistantText, "资料搜集"), "acknowledgement should mention role abilities.");
  assert(response.nextState === "DEEP_DIVE_SCENE", "experience should go directly to deep dive.");
}));

results.push(await runCase("Case 6: repeated stuck input", ["暂时不确定", "没有", "都不确定", "不知道"], ({ snapshot }) => {
  const assistantMessages = snapshot.session.conversation
    .filter((item) => item.role === "assistant")
    .map((item) => item.content);
  const last = assistantMessages.at(-1);
  const previous = assistantMessages.at(-2);
  assert(last !== previous, "repeated stuck guidance should not repeat the same sentence.");
  assert(includes(last, "选择题") || includes(last, "最低门槛入口"), "should trigger degraded guidance.");
}));

console.log(JSON.stringify({
  passed: results.length,
  cases: results.map(({ name, response, snapshot }) => ({
    name,
    finalState: snapshot.session.currentState,
    assistantMessage: response.assistantMessage,
    interpretation: snapshot.runtime.lastInputInterpretation,
  })),
}, null, 2));
