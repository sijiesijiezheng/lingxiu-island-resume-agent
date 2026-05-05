# Lingxiu Island ResumeAgent｜统一 Schema v1.0

## Purpose

This schema is the single source of truth for field naming, state machine data, prompt inputs/outputs, and future API integration.

It defines the canonical camelCase data contract that should sit between the frontend UI, `stateMachine.js`, prompt execution, mock API responses, and any future backend API.

## Full Data Object

```js
{
  session: {
    currentState,
    stage,
    mode
  },
  userProfile: {
    targetRoleStatus,
    targetRole
  },
  experienceDiscovery: {
    experienceStatus,
    selectedExperienceTypes,
    recommendedExperienceType,
    experienceSeed,
    screeningReason
  },
  currentExperience: {
    scene,
    action,
    result,
    scale,
    knownFacts,
    missingInfoPriority
  },
  evaluation: {
    score,
    level,
    recommendedSection,
    isMainExperienceCandidate,
    dimensionScores,
    strengths,
    weaknesses,
    nextQuestion,
    rewriteRisk,
    allowedPositioning,
    forbiddenClaims
  },
  resumeDraft: {
    resumeBullets,
    experienceCard,
    usedFacts,
    riskWarnings,
    needsUserConfirmation,
    userConfirmation
  },
  nextAction: {
    recommendedNextAction,
    nextQuestions,
    quickReplies
  }
}
```

## Field Definitions

| Field | Meaning | Written by state | Read by prompt | Required |
| --- | --- | --- | --- | --- |
| `session.currentState` | Current finite state machine state. | All states via `makeResponse` | Opening Router, Deep Dive, Improvement / Review | Required |
| `session.stage` | Product stage or visual/conversation phase. | All states via `makeResponse` | Opening Router, Deep Dive, Improvement / Review | Required |
| `session.mode` | Conversation mode, such as `soft` or `deep`. Current app does not set this yet. | Future routing or user preference state | Experience Inventory, Value Evaluation, Deep Dive, Resume Translation | Optional |
| `userProfile.targetRoleStatus` | Whether target role is known, uncertain, or unknown. | Opening Router / `START` | Opening Router, Experience Inventory, Value Evaluation, Deep Dive, Resume Translation | Optional in current app, required for prompt pipeline |
| `userProfile.targetRole` | User's target job direction, or a fallback such as general resume. | `START` | Experience Inventory, Value Evaluation, Deep Dive, Resume Translation, Improvement / Review | Required |
| `experienceDiscovery.experienceStatus` | Whether user has an experience, has none, or is uncertain. | `ASK_EXPERIENCE_STATUS` | Opening Router, Experience Inventory | Required |
| `experienceDiscovery.selectedExperienceTypes` | Low-pressure categories selected during inventory. | `INVENTORY_SCREENING` | Experience Inventory | Optional |
| `experienceDiscovery.recommendedExperienceType` | Best category to deep-dive first after inventory screening. | Experience Inventory / future API state | Deep Dive, Value Evaluation | Optional in current app, required after prompt integration |
| `experienceDiscovery.experienceSeed` | User's short description of the focused experience. | `SELECT_EXPERIENCE` or Opening Router direct deep dive | Deep Dive, Value Evaluation, Resume Translation | Required once an experience is selected |
| `experienceDiscovery.screeningReason` | Backend or prompt explanation for why the recommended experience was chosen. | Experience Inventory / future API state | Improvement / Review | Optional |
| `currentExperience.scene` | Context where the experience happened. | `DEEP_DIVE_SCENE` | Deep Dive, Value Evaluation, Resume Translation | Required for resume bullet |
| `currentExperience.action` | Specific action the user took. | `DEEP_DIVE_ACTION` | Deep Dive, Value Evaluation, Resume Translation | Required for resume bullet |
| `currentExperience.result` | Output, later usage, impact, or result. | `DEEP_DIVE_RESULT` | Deep Dive, Value Evaluation, Resume Translation | Required for stronger resume bullet |
| `currentExperience.scale` | People, amount, duration, frequency, scope, or approximate size. | `MISSING_INFO_FOLLOWUP` | Value Evaluation, Resume Translation | Optional but strongly recommended |
| `currentExperience.knownFacts` | Structured facts extracted from conversation. | Deep Dive / future fact extraction prompt | Value Evaluation, Resume Translation | Optional in current app, required for prompt pipeline |
| `currentExperience.missingInfoPriority` | Most important missing field to ask next. | Value Evaluation / Deep Dive | Deep Dive, Improvement / Review | Optional |
| `evaluation.score` | Internal score for experience value. Not shown directly to user. | Value Evaluation | Deep Dive, Resume Translation, Improvement / Review | Optional |
| `evaluation.level` | Experience level: main, writable, supporting, or not recommended. | `DEEP_DIVE_RESULT` in current simple form; Value Evaluation in future | Deep Dive, Resume Translation, Improvement / Review | Required after evaluation |
| `evaluation.recommendedSection` | Suggested resume section such as internship, project, campus experience, skills, or not recommended. | Value Evaluation | Resume Translation | Optional in current app, required for full generation |
| `evaluation.isMainExperienceCandidate` | Whether the experience can be treated as a main resume experience. | Value Evaluation | Resume Translation, Improvement / Review | Optional |
| `evaluation.dimensionScores` | Per-dimension scoring object. | Value Evaluation | Deep Dive, Improvement / Review | Optional |
| `evaluation.strengths` | Useful strengths found in the experience. | Value Evaluation | Resume Translation, Improvement / Review | Optional |
| `evaluation.weaknesses` | Missing or weak parts that should be improved. | Value Evaluation | Deep Dive, Improvement / Review | Optional |
| `evaluation.nextQuestion` | Recommended next low-pressure question. | Value Evaluation or Deep Dive | UI, Deep Dive | Optional |
| `evaluation.rewriteRisk` | Risk if the experience is rewritten too strongly. | Value Evaluation | Resume Translation, Improvement / Review | Optional |
| `evaluation.allowedPositioning` | Safe positioning that does not exaggerate facts. | Value Evaluation | Resume Translation | Optional |
| `evaluation.forbiddenClaims` | Claims that must not be used because they are unsupported. | Value Evaluation | Resume Translation, Improvement / Review | Optional |
| `resumeDraft.resumeBullets` | Resume-ready bullet strings. | Resume Translation / `MISSING_INFO_FOLLOWUP` current simple bullet | User Confirmation, Improvement / Review | Required once generated |
| `resumeDraft.experienceCard` | User-facing structured explanation of the experience. | Resume Translation | Improvement / Review | Optional |
| `resumeDraft.usedFacts` | Facts used to create the resume draft. | Resume Translation | User Confirmation, Improvement / Review | Optional |
| `resumeDraft.riskWarnings` | Warnings about weak, missing, or risky claims. | Resume Translation | User Confirmation, Improvement / Review | Optional |
| `resumeDraft.needsUserConfirmation` | Whether user confirmation is required before final use. | Resume Translation | User Confirmation | Required after resume translation |
| `resumeDraft.userConfirmation` | User feedback on whether the draft matches facts. | `USER_CONFIRMATION` | Improvement / Review, Resume Translation retry | Required after draft is shown |
| `nextAction.recommendedNextAction` | Suggested next product action. | Improvement / Review, `OUTPUT_RESULT` | UI | Optional |
| `nextAction.nextQuestions` | Follow-up questions or prompts for missing information. | Deep Dive, Improvement / Review | UI | Optional |
| `nextAction.quickReplies` | UI quick reply buttons. | All assistant response states | UI | Optional |

## Field Naming Rules

- Use camelCase in frontend and schema.
- If old backend uses snake_case, map it into camelCase before entering `stateMachine`.
- Do not mix `target_role` and `targetRole`.
- Do not mix `next_step` and `nextState`.
- Prompt input and output contracts should use the same camelCase field names as this schema.
- API adapters may translate external names, but state machine internals should only receive canonical camelCase fields.

## Mapping From Old Backend Fields To New Schema

| Old backend field | New schema field |
| --- | --- |
| `recommended_section` | `recommendedSection` |
| `is_main_experience_candidate` | `isMainExperienceCandidate` |
| `dimension_scores` | `dimensionScores` |
| `scale_data` | `scaleData` |
| `role_contribution` | `roleContribution` |
| `expression_potential` | `expressionPotential` |
| `missing_info_priority` | `missingInfoPriority` |
| `next_question` | `nextQuestion` |
| `rewrite_risk` | `rewriteRisk` |
| `allowed_positioning` | `allowedPositioning` |
| `forbidden_claims` | `forbiddenClaims` |
| `user_feedback` | `userFeedback` |

Note: `scaleData`, `roleContribution`, and `expressionPotential` are expected to live inside nested evaluation or dimension score objects when introduced. Keep their names camelCase even when nested.

## How To Update Schema Safely

When adding/removing/renaming a field, update all of these together:

- `docs/unified-schema-v1.0.md`
- `docs/prompt-field-alignment-table-v1.0.md`
- `docs/prompt-field-alignment-v0.1.json`
- `stateMachine.js`
- `prompts.js`
- `mockApi.js` or future `api.js`

Recommended update process:

1. Update this unified schema first.
2. Update prompt alignment docs so every prompt input/output matches the schema.
3. Update state machine reads/writes.
4. Update prompt templates and API adapters.
5. Verify that no snake_case field crosses into frontend state.

## Current Limitations

- Current app still uses mock states.
- Real prompt execution is not connected yet.
- Only one experience is supported.
- Schema may evolve after user testing.
- Future updates should be versioned as v1.1, v1.2, etc.
