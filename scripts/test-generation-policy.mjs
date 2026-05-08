import { getMockGenerationPolicyResponse } from "../mockApi.js";
import { createStateMachine } from "../stateMachine.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function includes(listOrText, value) {
  if (Array.isArray(listOrText)) return listOrText.includes(value);
  return String(listOrText || "").includes(value);
}

function policyFor(currentExperience, recoveryCount = 0) {
  return getMockGenerationPolicyResponse({
    currentState: "VALUE_EVALUATION",
    currentExperience,
    evaluation: {},
    inputInterpretation: {},
    missingInfoPriority: [],
    recoveryCount,
  });
}

async function runFlow(inputs) {
  const sm = createStateMachine();
  sm.getInitialResponse();
  let response = null;
  for (const input of inputs) {
    response = await sm.handleUserInput(input);
  }
  return { response, snapshot: sm.snapshot() };
}

const results = [];

{
  const policy = policyFor({
    scene: "社团招新活动",
    action: "我帮忙做了一些事情",
    result: "用于社团活动宣传",
  });
  assert(policy.gateStatus === "recoverable", "Case 1 gateStatus should be recoverable.");
  assert(policy.canGenerateFormalBullet === false, "Case 1 should not generate formal bullet.");
  assert(policy.recoveryType === "low_quality_field", "Case 1 recoveryType should be low_quality_field.");
  assert(includes(policy.lowQualityFields, "action"), "Case 1 should mark action as low quality.");
  results.push({ name: "Case 1", policy });
}

{
  const policy = policyFor({
    scene: "参与了一个活动",
    action: "参与",
    result: "完成了",
  });
  assert(policy.gateStatus === "recoverable", "Case 2 gateStatus should be recoverable.");
  assert(policy.canGenerateFormalBullet === false, "Case 2 should not generate formal bullet.");
  assert(includes(policy.lowQualityFields, "scene"), "Case 2 should mark scene as low quality.");
  assert(includes(policy.lowQualityFields, "action"), "Case 2 should mark action as low quality.");
  results.push({ name: "Case 2", policy });
}

{
  const policy = policyFor({
    scene: "账号内容发布",
    action: "发布抖音视频",
    result: "获得10万浏览量",
    scale: "10万浏览量",
  });
  assert(policy.gateStatus === "pass", "Case 3 should pass.");
  assert(policy.canGenerateFormalBullet === true, "Case 3 can generate.");
  assert(["draft_bullet", "formal_bullet"].includes(policy.outputType), "Case 3 outputType should be draft/formal.");
  results.push({ name: "Case 3", policy });
}

{
  const policy = policyFor({
    scene: "市场调研课程小组项目",
    action: "整理问卷数据",
    result: "用于小组展示",
  });
  assert(policy.gateStatus === "pass", "Case 4 should pass.");
  assert(policy.canGenerateFormalBullet === true, "Case 4 can generate.");
  results.push({ name: "Case 4", policy });
}

{
  const policy = policyFor({
    scene: "",
    action: "",
    result: "",
  }, 3);
  assert(policy.gateStatus === "fail", "Case 5 should fail after repeated recovery.");
  assert(policy.canGenerateFormalBullet === false, "Case 5 should not generate.");
  assert(["save_as_lead", "stop_and_switch"].includes(policy.fallbackMode), "Case 5 should use fallback mode.");
  assert(["experience_lead", "guidance_only"].includes(policy.outputType), "Case 5 should degrade output.");
  results.push({ name: "Case 5", policy });
}

{
  const { response, snapshot } = await runFlow([
    "运营/新媒体/内容",
    "有，我想写一段经历",
    "社团招新活动",
    "我帮忙做了一些事情",
    "用于社团活动宣传",
  ]);
  assert(response.nextState !== "USER_CONFIRMATION", "Low-quality action should not enter resume translation.");
  assert(snapshot.resumeDraft.resumeBullets.length === 0, "Low-quality action should not write resume bullet.");
  assert(snapshot.runtime.lastGenerationPolicy.canGenerateFormalBullet === false, "Policy should block generation.");
  results.push({
    name: "Runtime block",
    finalState: response.nextState,
    assistantMessage: response.assistantMessage,
    policy: snapshot.runtime.lastGenerationPolicy,
  });
}

{
  const { response, snapshot } = await runFlow([
    "运营/新媒体/内容",
    "有，我想写一段经历",
    "不知道",
    "不知道",
    "不知道",
  ]);
  assert(response.nextState === "OUTPUT_RESULT", "Repeated stuck input should degrade to output result lead.");
  assert(snapshot.resumeDraft.resumeBullets.length === 0, "Repeated stuck input should not generate formal bullet.");
  assert(snapshot.runtime.lastGenerationPolicy.gateStatus === "fail", "Policy should fail after repeated recovery.");
  results.push({
    name: "Runtime fail fallback",
    finalState: response.nextState,
    assistantMessage: response.assistantMessage,
    policy: snapshot.runtime.lastGenerationPolicy,
  });
}

{
  const { response, snapshot } = await runFlow([
    "运营/新媒体/内容",
    "发布抖音算吗，我在抖音发布过一个视频获得了10万浏览量",
    "是社团发的宣传社团活动",
    "我负责选题、标题文案、发布和看数据",
  ]);
  assert(response.nextState === "USER_CONFIRMATION", "High-quality flow should reach resume translation.");
  assert(snapshot.resumeDraft.resumeBullets.length > 0, "High-quality flow should write resume bullet.");
  assert(snapshot.runtime.lastGenerationPolicy.canGenerateFormalBullet === true, "Policy should allow generation.");
  results.push({
    name: "Runtime pass",
    finalState: response.nextState,
    resumeBullet: snapshot.resumeDraft.resumeBullets[0],
    policy: snapshot.runtime.lastGenerationPolicy,
  });
}

console.log(JSON.stringify({ passed: results.length, results }, null, 2));
