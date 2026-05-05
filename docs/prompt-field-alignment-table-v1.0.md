# Prompt Field Alignment Table v1.0

Source: Notion page section "prompt 字段对齐总表".

| Prompt name | Stage | Input fields | Output fields | Unified field naming | Direction | Need changes |
| --- | --- | --- | --- | --- | --- | --- |
| 开场分流 (Opening Router) | `START` | 无/历史上下文 | `targetRole`, `targetRoleStatus`, `experienceStatus`, `experienceSeed`, `assistantMessage`, `quickReplies`, `nextState` | camelCase 如 `targetRole` | UI -> 状态机 | 已对齐 |
| 经历盘点 (Experience Inventory) | `INVENTORY_SCREENING` | `targetRole`, `experienceStatus`, `selectedExperienceTypes`, `userFreeText` | `recommendedExperienceType`, `experienceSeed`, `screeningReason`, `assistantMessage`, `quickReplies`, `nextState` | camelCase | UI -> 状态机 | 已对齐 |
| 深挖追问 (Deep Dive) | `DEEP_DIVE_SCENE` / `DEEP_DIVE_ACTION` / `DEEP_DIVE_RESULT` | `targetRole`, `experienceSeed`, `currentExperience`, `missingInfoPriority` | `fieldToFill`, `nextQuestion`, `updatedKnownFacts`, `isReadyForEvaluation`, `nextState` | camelCase | 状态机 -> UI | 已对齐 |
| 价值评估 (Value Evaluation) | `VALUE_EVALUATION_MOCK` | `targetRole`, `experienceText`, `knownFacts`, `mode` | `score`, `level`, `recommendedSection`, `isMainExperienceCandidate`, `dimensionScores`, `strengths`, `weaknesses`, `missingInfoPriority`, `nextQuestion`, `rewriteRisk`, `allowedPositioning`, `forbiddenClaims` | camelCase | 状态机 -> UI -> `prompts.js` | 已对齐 |
| 简历转译 (Resume Translation) | `RESUME_TRANSLATION_MOCK` | `targetRole`, `currentExperience`, `evaluation`, `allowedPositioning`, `forbiddenClaims` | `resumeBullets`, `experienceCard`, `usedFacts`, `riskWarnings`, `needsUserConfirmation`, `assistantMessage`, `nextState` | camelCase | 状态机 -> UI -> `prompts.js` | 已对齐 |
| 补强建议/复盘 (Improvement / Review) | `USER_CONFIRMATION` / `OUTPUT_RESULT` | `resumeDraft`, `evaluation`, `weaknesses`, `missingInfoPriority`, `targetRole` | `improvementSuggestions`, `nextQuestions`, `recommendedNextAction`, `assistantMessage`, `quickReplies` | camelCase | 状态机 -> UI | 已对齐 |
