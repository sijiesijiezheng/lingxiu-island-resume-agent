import { createStateMachine } from "../stateMachine.js";

const LAYERS = {
  input: "InputInterpreter",
  field: "FieldReconciler",
  question: "QuestionGenerator",
  policy: "GenerationPolicy",
  resume: "ResumeTranslation",
  output: "OutputResult",
  state: "StateMachine",
};

function includesAny(text, phrases) {
  return phrases.some((phrase) => String(text || "").includes(phrase));
}

function notIncludesAny(text, phrases) {
  return !includesAny(text, phrases);
}

async function runFlow(inputs) {
  const sm = createStateMachine();
  sm.getInitialResponse();
  const statePath = ["START"];
  const messages = [];
  let response = null;

  for (const input of inputs) {
    response = await sm.handleUserInput(input);
    statePath.push(response.nextState);
    messages.push(response.assistantMessage || "");
  }

  return {
    sm,
    response,
    snapshot: sm.snapshot(),
    statePath,
    generatedText: messages.join("\n\n"),
  };
}

function pass(caseId, result = {}) {
  return {
    caseId,
    pass: true,
    failedLayer: "None",
    issue: "",
    recommendation: "",
    ...result,
  };
}

function fail(caseId, failedLayer, issue, recommendation, result = {}) {
  return {
    caseId,
    pass: false,
    failedLayer,
    issue,
    recommendation,
    ...result,
  };
}

async function runCaseP001() {
  const flow = await runFlow(["运营/新媒体/内容", "有，我想写一段经历"]);
  const snap = flow.snapshot;
  if (snap.experienceDiscovery.experienceSeed) {
    return fail("P0-01", LAYERS.state, "quickReply command was written into experienceSeed.", "Keep command handling before interpreter/reconciler.", flow);
  }
  if (snap.runtime.lastFieldReconciliation) {
    return fail("P0-01", LAYERS.field, "quickReply command entered Field Reconciler.", "Bypass Field Reconciler for flow commands.", flow);
  }
  if (flow.generatedText.includes("我先接住这个线索：有，我想写一段经历")) {
    return fail("P0-01", LAYERS.question, "Assistant treated command text as experience content.", "Render command-specific seed prompt.", flow);
  }
  return pass("P0-01", flow);
}

async function runCaseP002() {
  const flow = await runFlow(["运营/新媒体/内容", "有，我想写一段经历", "实习"]);
  const snap = flow.snapshot;
  if (snap.experienceDiscovery.experienceSeed) {
    return fail("P0-02", LAYERS.state, "Broad type was written into experienceSeed.", "Store broad categories only in selectedExperienceTypes.", flow);
  }
  if (snap.currentExperience.scene) {
    return fail("P0-02", LAYERS.field, "Broad type was written as scene.", "Do not reconcile broad type as concrete experience.", flow);
  }
  if (!snap.experienceDiscovery.selectedExperienceTypes.includes("兼职/实习")) {
    return fail("P0-02", LAYERS.state, "Broad type was not stored as selectedExperienceTypes.", "Map broad input to experience type.", flow);
  }
  if (!flow.response.assistantMessage.includes("具体的小事")) {
    return fail("P0-02", LAYERS.question, "Assistant did not ask for a specific task under the broad type.", "Ask for one concrete small event.", flow);
  }
  return pass("P0-02", flow);
}

async function runCaseP003() {
  const flow = await runFlow(["运营/新媒体/内容", "有，我想写一段经历", "实习时做过客户信息表"]);
  const snap = flow.snapshot;
  if (!snap.experienceDiscovery.experienceSeed.includes("实习时做过客户信息表")) {
    return fail("P0-03", LAYERS.input, "Concrete internship event was not stored as experienceSeed.", "Recognize concrete event after seed prompt.", flow);
  }
  if (!flow.response.nextState.startsWith("DEEP_DIVE")) {
    return fail("P0-03", LAYERS.state, "Concrete event did not enter deep dive.", "Route concrete events to DEEP_DIVE.", flow);
  }
  return pass("P0-03", flow);
}

async function runCaseP004() {
  const flow = await runFlow(["运营/新媒体/内容", "我在社团负责发布抖音宣传视频，写文案，最后有10万浏览量"]);
  const exp = flow.snapshot.currentExperience;
  if (exp.scene !== "社团宣传") return fail("P0-04", LAYERS.field, "Rich input did not extract scene.", "Extract scene from compound input.", flow);
  if (!exp.action.includes("发布抖音宣传视频") || !exp.action.includes("文案")) {
    return fail("P0-04", LAYERS.field, "Rich input did not extract compound action.", "Extract action and role from compound input.", flow);
  }
  if (!exp.resultMetric.includes("10万")) return fail("P0-04", LAYERS.field, "Rich input did not extract resultMetric.", "Extract view count as resultMetric.", flow);
  if (exp.scale.includes("浏览")) return fail("P0-04", LAYERS.field, "View count was stored in scale.", "Keep view/play data out of scale.", flow);
  if (flow.generatedText.includes("主要负责哪一部分")) {
    return fail("P0-04", LAYERS.question, "System repeated an already answered action question.", "After full extraction, evaluate or generate.", flow);
  }
  return pass("P0-04", flow);
}

async function runCaseP005() {
  const flow = await runFlow(["运营/新媒体/内容", "有一段经历，但是很水，没什么实际成效", "我负责写文案"]);
  const exp = flow.snapshot.currentExperience;
  if (!exp.action.includes("文案") || !exp.role.includes("文案")) {
    return fail("P0-05", LAYERS.field, "Out-of-order action was not absorbed.", "Extract action/role even when scene was requested.", flow);
  }
  if (exp.scene) return fail("P0-05", LAYERS.field, "Isolated action over-inferred scene.", "Do not infer scene from isolated action.", flow);
  if (flow.response.nextState !== "DEEP_DIVE_SCENE") {
    return fail("P0-05", LAYERS.question, "System did not continue asking for missing scene.", "Ask the true missing field after absorbing answer.", flow);
  }
  return pass("P0-05", flow);
}

async function runCaseP006() {
  const flow = await runFlow(["运营/新媒体/内容", "有，我想写一段经历", "课程项目", "我帮忙做了一些事情", "用于课堂展示"]);
  const policy = flow.snapshot.runtime.lastGenerationPolicy;
  if (!policy) return fail("P0-06", LAYERS.policy, "Generation Policy was not reached.", "Evaluate low-quality core fields before generation.", flow);
  if (policy.canGenerateFormalBullet) return fail("P0-06", LAYERS.policy, "Low-quality input was allowed to generate.", "Block low-quality fields.", flow);
  if (flow.snapshot.resumeDraft.resumeBullets.length) return fail("P0-06", LAYERS.resume, "Low-quality input generated resume bullet.", "Do not call resume translation when policy blocks.", flow);
  return pass("P0-06", flow);
}

async function runCaseP007() {
  const flow = await runFlow([
    "运营/新媒体/内容",
    "发布抖音，有10万浏览量算吗",
    "我们创业课老师让做的，介绍自己卖的东西",
    "就是刚才那个短视频，我们组发布的抖音视频，我负责写文案",
    "基本符合",
  ]);
  const output = flow.response.assistantMessage;
  const dirty = ["算吗", "就是刚才", "老师让做的", "介绍自己卖的东西", "我负责", "在【"];
  if (!notIncludesAny(output, dirty)) return fail("P0-07", LAYERS.output, "OUTPUT_RESULT contains dirty spoken text or template.", "Clean display fields and resume bullet.", flow);
  if (!flow.snapshot.resumeDraft.resumeBullets.length) return fail("P0-07", LAYERS.resume, "No resume bullet was generated for cleaned path.", "Resume translation should write resumeDraft.resumeBullets.", flow);
  return pass("P0-07", flow);
}

async function runCaseP101() {
  const flow = await runFlow(["运营/新媒体/内容", "社团招新时核对名单，涉及6人，一周，最后整理了120份报名表"]);
  const exp = flow.snapshot.currentExperience;
  const scaleText = [exp.scale, exp.resultMetric].join(" ");
  if (!includesAny(scaleText, ["6人", "一周", "120份"])) {
    return fail("P1-01", LAYERS.field, "People/period/document counts were not captured as scale-like data.", "Classify people, duration, and counts as scale.", flow);
  }
  if (exp.resultMetric.includes("浏览") || exp.scale.includes("浏览")) {
    return fail("P1-01", LAYERS.field, "Non-view scale case polluted resultMetric/view fields.", "Separate scale and resultMetric.", flow);
  }
  return pass("P1-01", flow);
}

async function runCaseP102() {
  const flow = await runFlow(["运营/新媒体/内容", "发布抖音视频，获得10万浏览量"]);
  const exp = flow.snapshot.currentExperience;
  if (!exp.resultMetric.includes("10万")) return fail("P1-02", LAYERS.field, "View count was not captured as resultMetric.", "Classify views/play count as resultMetric.", flow);
  if (exp.scale.includes("浏览")) return fail("P1-02", LAYERS.field, "View count was mixed into scale.", "Keep resultMetric out of scale.", flow);
  return pass("P1-02", flow);
}

async function runCaseP103() {
  const flow = await runFlow(["运营/新媒体/内容", "有，我想写一段经历", "不知道", "没有", "想不起来"]);
  const policy = flow.snapshot.runtime.lastGenerationPolicy;
  if (flow.response.nextState !== "OUTPUT_RESULT") return fail("P1-03", LAYERS.state, "Repeated stuck input did not degrade to output lead.", "After repeated stuck input, fail safely.", flow);
  if (policy?.gateStatus !== "fail") return fail("P1-03", LAYERS.policy, "Generation Policy did not fail stuck input.", "Set gateStatus=fail after repeated recovery.", flow);
  if (flow.snapshot.resumeDraft.resumeBullets.length) return fail("P1-03", LAYERS.resume, "Repeated stuck input generated a formal bullet.", "Save as lead/guidance only.", flow);
  return pass("P1-03", flow);
}

async function runCaseP104() {
  const flow = await runFlow(["运营/新媒体/内容", "做过一个小组PPT算吗？"]);
  const interp = flow.snapshot.runtime.lastInputInterpretation;
  if (interp?.intent !== "ask_validation") return fail("P1-04", LAYERS.input, "Validation question intent was not recognized.", "Detect ask_validation.", flow);
  if (!interp?.needsReassurance) return fail("P1-04", LAYERS.input, "Validation question did not set needsReassurance.", "Set reassurance for low-confidence validation.", flow);
  if (!flow.snapshot.experienceDiscovery.experienceSeed.includes("小组PPT")) return fail("P1-04", LAYERS.input, "PPT seed was not captured.", "Capture candidate seed.", flow);
  if (flow.generatedText.includes("下面哪些你做过")) return fail("P1-04", LAYERS.state, "Validation question was routed to inventory.", "Route ask_validation to deep dive.", flow);
  return pass("P1-04", flow);
}

async function runCaseP105() {
  const flow = await runFlow(["我做过一段实习，也做过社团抖音，实习主要整理客户表，社团发过视频"]);
  const exp = flow.snapshot.currentExperience;
  const mergedInternAndClub = includesAny([exp.scene, exp.action, exp.result, flow.snapshot.experienceDiscovery.experienceSeed].join(" "), ["实习"]) &&
    includesAny([exp.scene, exp.action, exp.result, flow.snapshot.experienceDiscovery.experienceSeed].join(" "), ["社团", "抖音"]);
  if (mergedInternAndClub && flow.snapshot.resumeDraft.resumeBullets.length) {
    return fail("P1-05", LAYERS.state, "Multiple experiences were merged into one generated bullet.", "Ask user to pick one concrete experience first.", flow);
  }
  if (!includesAny(flow.generatedText, ["先选", "一件", "具体"])) {
    return fail("P1-05", LAYERS.question, "System did not ask user to choose one experience from mixed input.", "Add mixed-experience disambiguation.", flow);
  }
  return pass("P1-05", flow);
}

async function runCaseP106() {
  const flow = await runFlow([
    "运营/新媒体/内容",
    "我在社团发过抖音宣传视频，有10万浏览量",
    "不是社团，是创业课程作业",
    "我只负责写文案，没有负责发布",
    "基本符合",
  ]);
  const combined = [
    flow.snapshot.currentExperience.scene,
    flow.snapshot.currentExperience.action,
    flow.snapshot.resumeDraft.resumeBullets.join(" "),
    flow.generatedText,
  ].join(" ");
  if (!combined.includes("创业") && !combined.includes("课程")) {
    return fail("P1-06", LAYERS.field, "User correction from club to course was not reflected.", "Field Reconciler should update corrected facts.", flow);
  }
  if (flow.snapshot.currentExperience.action.includes("发布") || flow.snapshot.resumeDraft.resumeBullets.join(" ").includes("发布")) {
    return fail("P1-06", LAYERS.field, "Corrected action still contains disclaimed publishing responsibility.", "Remove contradicted claims when user corrects facts.", flow);
  }
  return pass("P1-06", flow);
}

async function runCaseP107() {
  const flow = await runFlow([
    "运营/新媒体/内容",
    "我在社团负责发布抖音宣传视频，写文案，最后有10万浏览量",
    "有点夸大",
  ]);
  const output = flow.response.assistantMessage;
  if (!output.includes("降一点表达") && !output.includes("不硬写")) {
    return fail("P1-07", LAYERS.state, "User denial/overstatement confirmation was not acknowledged.", "Handle 有点夸大 with downgrade message.", flow);
  }
  if (includesAny(output, ["主导", "统筹", "显著提升"])) {
    return fail("P1-07", LAYERS.resume, "Output contains inflated claims after user denied accuracy.", "Respect forbidden claims and downgrade wording.", flow);
  }
  return pass("P1-07", flow);
}

const runners = [
  runCaseP001,
  runCaseP002,
  runCaseP003,
  runCaseP004,
  runCaseP005,
  runCaseP006,
  runCaseP007,
  runCaseP101,
  runCaseP102,
  runCaseP103,
  runCaseP104,
  runCaseP105,
  runCaseP106,
  runCaseP107,
];

const results = [];
for (const runner of runners) {
  try {
    results.push(await runner());
  } catch (err) {
    results.push(fail(runner.name, "StateMachine", err.message, "Fix test runner or state machine exception handling."));
  }
}

const failedCases = results
  .filter((result) => !result.pass)
  .map((result) => ({
    caseId: result.caseId,
    failedLayer: result.failedLayer,
    issue: result.issue,
    recommendation: result.recommendation,
  }));

const totalCases = results.length;
const passed = results.filter((result) => result.pass).length;
const failed = totalCases - passed;

console.log(JSON.stringify({
  totalCases,
  passed,
  failed,
  passRate: `${Math.round((passed / totalCases) * 100)}%`,
  failedCases,
  recommendation: failed === 0 ? "ready_for_packaging" : "need_logic_fix",
}, null, 2));
