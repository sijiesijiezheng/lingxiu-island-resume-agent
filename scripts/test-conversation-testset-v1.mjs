import fs from "node:fs";
import { createStateMachine } from "../stateMachine.js";
import {
  getMockFieldReconcilerResponse,
  getMockGenerationPolicyResponse,
  getMockInputInterpreterResponse,
} from "../mockApi.js";

const testset = JSON.parse(fs.readFileSync("scripts/conversation-testset-v1.0.json", "utf8"));

const DIRTY_RESUME_PHRASES = ["算吗", "就是刚才", "老师让做的", "我负责", "在【", "协助完成【"];
const TEMPLATE_QUESTIONS = ["这件事发生在什么场景里", "你当时具体做了什么", "你当时主要负责哪一部分"];

function includesAny(text, phrases) {
  return phrases.some((phrase) => String(text || "").includes(phrase));
}

function getPathValue(source, path) {
  return path.split(".").reduce((value, key) => (value == null ? value : value[key]), source);
}

function textMatchesExpected(actual, expected) {
  const actualText = String(actual || "");
  const expectedText = String(expected || "");
  if (!expectedText) return true;
  if (actualText.includes(expectedText)) return true;
  if (expectedText.includes("撰写文案") && actualText.includes("撰写") && actualText.includes("文案")) return true;

  const compactExpected = expectedText
    .split(/[，,、\/\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  return compactExpected.every((item) => actualText.includes(item));
}

function pushIssue(issues, condition, layer, message) {
  if (!condition) issues.push({ layer, message });
}

function firstFailedLayer(issues) {
  return issues[0]?.layer || "None";
}

function compactSnapshot(snapshot) {
  return {
    currentState: snapshot.session.currentState,
    targetRoleStatus: snapshot.userProfile.targetRoleStatus,
    targetRole: snapshot.userProfile.targetRole,
    experienceStatus: snapshot.experienceDiscovery.experienceStatus,
    selectedExperienceTypes: snapshot.experienceDiscovery.selectedExperienceTypes,
    experienceSeed: snapshot.experienceDiscovery.experienceSeed,
    currentExperience: snapshot.currentExperience,
    evaluation: {
      score: snapshot.evaluation.score,
      level: snapshot.evaluation.level,
      readyToGenerate: snapshot.evaluation.readyToGenerate,
      missingInfoPriority: snapshot.evaluation.missingInfoPriority,
    },
    resumeDraft: snapshot.resumeDraft,
    runtime: {
      lastInputInterpretation: snapshot.runtime.lastInputInterpretation,
      lastFieldReconciliation: snapshot.runtime.lastFieldReconciliation,
      lastGenerationPolicy: snapshot.runtime.lastGenerationPolicy,
      resumeTranslationFallbackUsed: snapshot.runtime.resumeTranslationFallbackUsed,
    },
    stuckCounts: snapshot.session.stuckCounts,
  };
}

async function runFlow(inputs) {
  const sm = createStateMachine();
  sm.getInitialResponse();
  const statePath = ["START"];
  const generated = [];
  let response = null;

  for (const input of inputs) {
    response = await sm.handleUserInput(input);
    generated.push(response.assistantMessage || "");
    statePath.push(response.nextState);
  }

  return {
    sm,
    response,
    snapshot: sm.snapshot(),
    statePath,
    generatedText: generated.join("\n\n"),
  };
}

async function runCase(caseDef) {
  const issues = [];
  let flow = null;
  let recommendation = "继续作为回归测试保留。";

  if (caseDef.caseId === "C01") {
    flow = await runFlow(caseDef.inputs);
    const snapshot = flow.snapshot;
    const interp = snapshot.runtime.lastInputInterpretation || {};

    pushIssue(issues, snapshot.userProfile.targetRoleStatus === "uncertain", "InputInterpreter", "targetRoleStatus should be uncertain.");
    pushIssue(issues, interp.hasTargetRole === false, "InputInterpreter", "hasTargetRole should be false.");
    pushIssue(issues, !flow.generatedText.includes("按这个方向帮你看"), "QuestionGenerator", "Should not say “按这个方向帮你看” for uncertain target.");
    pushIssue(issues, includesAny(flow.generatedText, ["通用简历素材", "通用版本", "后面看到具体岗位"]), "QuestionGenerator", "Should acknowledge generic-version path.");
  }

  if (caseDef.caseId === "C02") {
    flow = await runFlow(caseDef.inputs);
    const snapshot = flow.snapshot;
    const interp = snapshot.runtime.lastInputInterpretation || {};

    pushIssue(issues, snapshot.userProfile.targetRoleStatus === "known", "InputInterpreter", "targetRoleStatus should be known.");
    pushIssue(issues, Boolean(snapshot.userProfile.targetRole), "InputInterpreter", "targetRole should be written.");
    pushIssue(issues, interp.hasTargetRole === true, "InputInterpreter", "hasTargetRole should be true.");
    pushIssue(issues, includesAny(flow.generatedText, ["内容敏感度", "信息整理", "发布执行", "基础数据意识"]), "QuestionGenerator", "Assistant should acknowledge role-related capabilities.");
  }

  if (caseDef.caseId === "C03") {
    flow = await runFlow(["暂时不确定", ...caseDef.inputs]);
    const snapshot = flow.snapshot;
    const interp = snapshot.runtime.lastInputInterpretation || {};

    pushIssue(issues, interp.intent === "ask_validation", "InputInterpreter", "intent should be ask_validation.");
    pushIssue(issues, interp.hasExperience === true, "InputInterpreter", "hasExperience should be true.");
    pushIssue(issues, interp.needsReassurance === true, "InputInterpreter", "needsReassurance should be true.");
    pushIssue(issues, snapshot.experienceDiscovery.experienceSeed.includes("小组PPT"), "FieldReconciler", "experienceSeed should include 小组PPT.");
    pushIssue(issues, flow.response.nextState.startsWith("DEEP_DIVE"), "QuestionGenerator", "Should enter DEEP_DIVE instead of inventory selection.");
    pushIssue(issues, !includesAny(flow.generatedText, ["下面哪些你做过", "你选的这些里面", "重新选"]), "QuestionGenerator", "Should not ask the user to choose another experience.");
  }

  if (caseDef.caseId === "C04") {
    flow = await runFlow(["暂时不确定", ...caseDef.inputs]);
    const snapshot = flow.snapshot;
    const interp = snapshot.runtime.lastInputInterpretation || {};

    pushIssue(issues, interp.hasExperience === true, "InputInterpreter", "hasExperience should be true.");
    pushIssue(issues, interp.experienceConfidence === "low", "InputInterpreter", "experienceConfidence should be low.");
    pushIssue(issues, interp.needsReassurance === true, "InputInterpreter", "needsReassurance should be true.");
    pushIssue(issues, flow.response.nextState.startsWith("DEEP_DIVE"), "QuestionGenerator", "Low-confidence candidate should enter DEEP_DIVE.");
    pushIssue(issues, includesAny(flow.generatedText, ["不急着判断强不强", "不一定没价值", "拆"]), "QuestionGenerator", "Assistant should reassure before asking for details.");
    pushIssue(issues, !includesAny(flow.generatedText, ["请选择经历类型", "下面哪些你做过"]), "QuestionGenerator", "Should not send low-confidence user to inventory cards.");
  }

  if (caseDef.caseId === "C05") {
    flow = await runFlow(["运营/新媒体/内容", "有一段经历，但是很水，没什么实际成效", ...caseDef.inputs]);
    const snapshot = flow.snapshot;
    const rec = snapshot.runtime.lastFieldReconciliation || {};

    pushIssue(issues, String(snapshot.currentExperience.action || "").includes("文案"), "FieldReconciler", "Action should capture 文案.");
    pushIssue(issues, String(snapshot.currentExperience.role || "").includes("文案"), "FieldReconciler", "Role should capture 文案.");
    pushIssue(issues, !String(snapshot.currentExperience.scene || "").includes("文案"), "FieldReconciler", "Action input should not be written as scene.");
    pushIssue(issues, !snapshot.currentExperience.scene, "FieldReconciler", "Should not infer a concrete scene from “我负责写文案” without context.");
    pushIssue(issues, rec.nextMissingField === "scene" || flow.response.nextState === "DEEP_DIVE_SCENE", "QuestionGenerator", "Next turn should continue filling scene.");
    pushIssue(issues, !includesAny(flow.response.assistantMessage, TEMPLATE_QUESTIONS), "QuestionGenerator", "Should not repeat generic action/template question.");
  }

  if (caseDef.caseId === "C06") {
    flow = await runFlow(["运营/新媒体/内容", ...caseDef.inputs]);
    const snapshot = flow.snapshot;
    const exp = snapshot.currentExperience;
    const policy = snapshot.runtime.lastGenerationPolicy || {};

    pushIssue(issues, String(snapshot.experienceDiscovery.experienceSeed || "").includes("抖音"), "FieldReconciler", "experienceSeed should include 抖音.");
    pushIssue(issues, String(exp.scene || "").includes("社团") || String(exp.scene || "").includes("宣传"), "FieldReconciler", "scene should capture 社团宣传.");
    pushIssue(issues, String(exp.action || "").includes("文案") || String(exp.action || "").includes("发布"), "FieldReconciler", "action should capture 文案/发布.");
    pushIssue(issues, String(exp.resultMetric || "").includes("10万"), "FieldReconciler", "resultMetric should capture 10万浏览量.");
    pushIssue(issues, !String(exp.scale || "").includes("浏览"), "OutputResult", "Views should not be stored as scale.");
    pushIssue(issues, !includesAny(flow.response.assistantMessage, ["这件事发生在什么场景里", "主要负责哪一部分"]), "QuestionGenerator", "Should not repeat fields already provided.");
    pushIssue(issues, policy.canGenerateFormalBullet === true || snapshot.evaluation.readyToGenerate === true, "GenerationPolicy", "Rich input should be allowed to generate or be ready for evaluation.");
  }

  if (caseDef.caseId === "C07") {
    const policy = getMockGenerationPolicyResponse({
      currentExperience: {
        scene: "课程项目",
        action: caseDef.inputs[0],
        result: "用于课堂展示",
        scale: "",
      },
      recoveryCount: 0,
    });

    flow = await runFlow(["运营/新媒体/内容", "课程小组项目", "课程项目", caseDef.inputs[0], "用于课堂展示"]);
    const snapshot = flow.snapshot;

    pushIssue(issues, policy.gateStatus === "recoverable", "GenerationPolicy", "Low-quality input should be recoverable.");
    pushIssue(issues, policy.canGenerateFormalBullet === false, "GenerationPolicy", "Low-quality input should not generate formal bullet.");
    pushIssue(issues, policy.recoveryType === "low_quality_field", "GenerationPolicy", "Recovery type should be low_quality_field.");
    pushIssue(issues, policy.lowQualityFields.includes("action"), "GenerationPolicy", "lowQualityFields should include action.");
    pushIssue(issues, snapshot.resumeDraft.resumeBullets.length === 0 || !flow.generatedText.includes("我先试着把它写成简历语言"), "ResumeTranslation", "Runtime should not directly enter formal resume translation for vague action.");
  }

  if (caseDef.caseId === "C08") {
    flow = await runFlow(["运营/新媒体/内容", "有一段经历，但是很水，没什么实际成效", ...caseDef.inputs]);
    const snapshot = flow.snapshot;
    const messages = flow.generatedText.split("\n\n").filter(Boolean);
    const uniqueMessages = new Set(messages);
    const policy = snapshot.runtime.lastGenerationPolicy || {};

    pushIssue(issues, uniqueMessages.size > 1, "QuestionGenerator", "Repeated stuck input should not repeat the same fallback sentence.");
    pushIssue(issues, includesAny(flow.generatedText, ["选择题", "最低门槛入口", "课程作业", "小组展示", "经历线索"]), "QuestionGenerator", "Should trigger second-level degradation.");
    pushIssue(issues, policy.gateStatus === "fail" || snapshot.resumeDraft.resumeBullets.length === 0, "GenerationPolicy", "Long-term stuck input should fail or avoid formal generation.");
    pushIssue(issues, snapshot.resumeDraft.resumeBullets.length === 0, "ResumeTranslation", "Should not generate formal bullet after repeated stuck input.");
  }

  if (!flow) {
    flow = await runFlow(caseDef.inputs);
    issues.push({ layer: "None", message: "No specific runner was configured for this case." });
  }

  const snapshot = flow.snapshot;
  const generatedText = flow.generatedText;
  const isOutput = snapshot.session.currentState === "OUTPUT_RESULT";

  if (snapshot.resumeDraft.resumeBullets.length) {
    const bulletText = snapshot.resumeDraft.resumeBullets.join("\n");
    pushIssue(issues, !includesAny(bulletText, DIRTY_RESUME_PHRASES), "ResumeTranslation", "Resume bullet should not contain dirty spoken phrases or placeholder template.");
  }

  if (isOutput && snapshot.resumeDraft.resumeBullets.length) {
    pushIssue(issues, includesAny(generatedText, snapshot.resumeDraft.resumeBullets), "OutputResult", "OUTPUT_RESULT should display resumeDraft.resumeBullets.");
    pushIssue(issues, !generatedText.includes("规模/周期：10万浏览"), "OutputResult", "OUTPUT_RESULT should not show resultMetric as scale.");
  }

  const expectedFields = caseDef.expected?.schemaFields || {};
  for (const [path, expectedValue] of Object.entries(expectedFields)) {
    if (path.startsWith("inputInterpretation.") || path.startsWith("generationPolicy.")) continue;
    const actual = getPathValue(snapshot, path);
    if (typeof expectedValue === "string" && expectedValue) {
      pushIssue(issues, textMatchesExpected(actual, expectedValue), path.startsWith("currentExperience") ? "FieldReconciler" : "InputInterpreter", `${path} should include ${expectedValue}.`);
    }
  }

  if (issues.length) {
    recommendation =
      firstFailedLayer(issues) === "InputInterpreter"
        ? "优先修 Input Interpreter 的意图和分流识别。"
        : firstFailedLayer(issues) === "FieldReconciler"
          ? "优先修 Field Reconciler 的字段抽取和合并规则。"
          : firstFailedLayer(issues) === "QuestionGenerator"
            ? "优先修 Question Generator 的上下文承接和追问策略。"
            : firstFailedLayer(issues) === "GenerationPolicy"
              ? "优先修 Generation Policy 的 gate 条件。"
              : firstFailedLayer(issues) === "ResumeTranslation"
                ? "优先修 Resume Translation 的清洗和正式表达规则。"
                : "优先检查 OUTPUT_RESULT 展示清洗。";
  }

  return {
    caseId: caseDef.caseId,
    userType: caseDef.userType,
    pass: issues.length === 0,
    failedLayer: firstFailedLayer(issues),
    issues: issues.map((issue) => issue.message),
    statePath: flow.statePath,
    schemaSnapshot: compactSnapshot(snapshot),
    generatedText,
    recommendation,
  };
}

const results = [];
for (const caseDef of testset) {
  results.push(await runCase(caseDef));
}

const passed = results.filter((result) => result.pass).length;
const failed = results.length - passed;
const failureDistribution = results.reduce((acc, result) => {
  if (!result.pass) acc[result.failedLayer] = (acc[result.failedLayer] || 0) + 1;
  return acc;
}, {});

const mechanismIssues = Object.entries(failureDistribution)
  .filter(([, count]) => count > 1)
  .map(([layer]) => layer);

const report = {
  summary: {
    total: results.length,
    passed,
    failed,
    passRate: `${Math.round((passed / results.length) * 100)}%`,
    failureDistribution,
    singlePointIssues: results.filter((result) => !result.pass && failureDistribution[result.failedLayer] === 1).map((result) => result.caseId),
    mechanismIssues,
    canEnterUiPolish: failed === 0,
    nextPriorityLayer: mechanismIssues[0] || results.find((result) => !result.pass)?.failedLayer || "None",
  },
  results,
};

console.log(JSON.stringify(report, null, 2));
