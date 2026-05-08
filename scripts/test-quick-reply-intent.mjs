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
  let response = null;
  for (const input of inputs) {
    response = await sm.handleUserInput(input);
  }
  return { sm, response, snapshot: sm.snapshot() };
}

const results = [];

{
  const { response, snapshot } = await runFlow(["运营/新媒体/内容", "有，我想写一段经历"]);
  assert(response.nextState === "SELECT_EXPERIENCE", "Quick reply should move to asking for a concrete experience seed.");
  assert(snapshot.experienceDiscovery.experienceStatus === "has_experience", "Quick reply should set has_experience status.");
  assert(!snapshot.experienceDiscovery.experienceSeed, "Quick reply should not be written into experienceSeed.");
  assert(!snapshot.runtime.lastFieldReconciliation, "Quick reply command should not enter Field Reconciler.");
  assert(response.assistantMessage.includes("先随便说一句这段经历是什么"), "Quick reply should ask for concrete experience content.");
  notIncludes(response.assistantMessage, "我先接住这个线索：有，我想写一段经历", "Case A response");
  results.push({ caseId: "A", response: response.assistantMessage, snapshot: snapshot.experienceDiscovery });
}

{
  const { response, snapshot } = await runFlow(["运营/新媒体/内容", "有，我想写一段经历", "实习"]);
  assert(response.nextState === "SELECT_EXPERIENCE", "Broad experience type should stay in seed-selection state.");
  assert(snapshot.experienceDiscovery.selectedExperienceTypes.includes("兼职/实习"), "Broad type should be stored as selectedExperienceTypes.");
  assert(!snapshot.experienceDiscovery.experienceSeed, "Broad type should not be stored as concrete experienceSeed.");
  assert(!snapshot.currentExperience.scene, "Broad type should not be written as scene.");
  assert(response.assistantMessage.includes("实习里"), "Broad type should ask for a specific internship task.");
  notIncludes(response.assistantMessage, "我先接住这个线索：实习", "Case B response");
  results.push({ caseId: "B", response: response.assistantMessage, snapshot: snapshot.experienceDiscovery });
}

{
  const { response, snapshot } = await runFlow(["运营/新媒体/内容", "有，我想写一段经历", "实习时做过客户信息表"]);
  assert(response.nextState.startsWith("DEEP_DIVE"), "Concrete internship event should enter deep dive.");
  assert(snapshot.experienceDiscovery.experienceSeed.includes("实习时做过客户信息表"), "Concrete event should be stored as experienceSeed.");
  assert(response.assistantMessage.length > 0, "Concrete event should receive a follow-up question.");
  results.push({ caseId: "C", response: response.assistantMessage, snapshot: snapshot.experienceDiscovery });
}

{
  const { response, snapshot } = await runFlow(["运营/新媒体/内容", "发布抖音，有10万浏览量"]);
  assert(response.nextState.startsWith("DEEP_DIVE"), "Concrete Douyin event should enter deep dive.");
  assert(snapshot.experienceDiscovery.experienceSeed.includes("发布抖音"), "Douyin event should be stored as seed.");
  assert(snapshot.currentExperience.resultMetric.includes("10万"), "Douyin event should store resultMetric.");
  notIncludes(response.assistantMessage, "下面哪些你做过", "Case D response");
  results.push({ caseId: "D", response: response.assistantMessage, snapshot: snapshot.currentExperience });
}

{
  const { sm, response, snapshot } = await runFlow([
    "运营/新媒体/内容",
    "我在社团负责发布抖音宣传视频，写文案，最后有10万浏览量",
  ]);
  assert(response.nextState === "USER_CONFIRMATION", "Rich concrete event should reach confirmation.");
  const output = await sm.handleUserInput("基本符合");
  const outputSnapshot = sm.snapshot();
  assert(output.nextState === "OUTPUT_RESULT", "基本符合 should enter OUTPUT_RESULT.");
  assert(outputSnapshot.resumeDraft.userConfirmation === "基本符合", "Confirmation should be stored.");
  assert(output.assistantMessage.includes("经历草稿"), "Confirmation should show output result.");
  results.push({ caseId: "E", response: output.assistantMessage, snapshot: outputSnapshot.resumeDraft });
}

console.log(JSON.stringify({ passed: results.length, results }, null, 2));
