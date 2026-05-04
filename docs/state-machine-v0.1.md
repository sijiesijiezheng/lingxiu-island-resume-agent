# ResumeAgent State Machine v0.1

## Goal

ResumeAgent v0.1 is a low-pressure, conversation-guided resume starter for users who may feel they have "no experience." The current state machine does not generate a complete resume. It guides the user from target direction selection, through experience discovery and deep-dive questions, into a first resume-style experience bullet that the user can confirm.

Core product principle:

- Do not invent facts.
- Ask one small question at a time.
- Turn ordinary experience into usable resume material only after collecting scene, action, result, and scale.

## State List

| State | Visual stage | Purpose |
| --- | ---: | --- |
| `START` | 1 | Ask for the user's target role or direction. |
| `ASK_EXPERIENCE_STATUS` | 2 | Ask whether the user already has one experience in mind. |
| `INVENTORY_SCREENING` | 3 | Offer low-pressure experience categories if the user has no clear experience. |
| `SELECT_EXPERIENCE` | 3 | Ask the user to name one specific small experience from selected categories. |
| `DEEP_DIVE_SCENE` | 4 | Collect the scene/context of the focused experience. |
| `DEEP_DIVE_ACTION` | 4 | Collect what the user specifically did. |
| `DEEP_DIVE_RESULT` | 4 | Collect what happened after the action or who used the output. |
| `MISSING_INFO_FOLLOWUP` | 4 | Collect scale, duration, frequency, people, or amount of work. |
| `USER_CONFIRMATION` | 5 | Show a draft resume-style bullet and ask whether it matches the facts. |
| `OUTPUT_RESULT` | 5 | Show the structured result and offer next actions. |

## Data Object

```json
{
  "targetRole": "",
  "experienceStatus": "",
  "selectedExperienceTypes": [],
  "experienceSeed": "",
  "evaluationLevel": "",
  "resumeBullet": "",
  "userConfirmation": "",
  "currentExperience": {
    "scene": "",
    "action": "",
    "result": "",
    "scale": ""
  }
}
```

Runtime state also keeps:

```json
{
  "currentState": "START",
  "stage": "START",
  "conversation": []
}
```

## Transition Map

| Current state | User input writes | Condition | Next state |
| --- | --- | --- | --- |
| `START` | `data.targetRole` | Always | `ASK_EXPERIENCE_STATUS` |
| `ASK_EXPERIENCE_STATUS` | `data.experienceStatus` | Input suggests the user has an experience | `DEEP_DIVE_SCENE` |
| `ASK_EXPERIENCE_STATUS` | `data.experienceStatus` | Input says no experience, uncertain, or ordinary small things | `INVENTORY_SCREENING` |
| `INVENTORY_SCREENING` | `data.selectedExperienceTypes` | Always | `SELECT_EXPERIENCE` |
| `SELECT_EXPERIENCE` | `data.experienceSeed` | Always | `DEEP_DIVE_SCENE` |
| `DEEP_DIVE_SCENE` | `data.currentExperience.scene` | Always | `DEEP_DIVE_ACTION` |
| `DEEP_DIVE_ACTION` | `data.currentExperience.action` | Always | `DEEP_DIVE_RESULT` |
| `DEEP_DIVE_RESULT` | `data.currentExperience.result`, `data.evaluationLevel` | Scene, action, and result exist | `MISSING_INFO_FOLLOWUP` |
| `DEEP_DIVE_RESULT` | `data.currentExperience.result`, `data.evaluationLevel` | Some key fact is missing | `MISSING_INFO_FOLLOWUP` |
| `MISSING_INFO_FOLLOWUP` | `data.currentExperience.scale`, `data.resumeBullet` | Always | `USER_CONFIRMATION` |
| `USER_CONFIRMATION` | `data.userConfirmation` | Always | `OUTPUT_RESULT` |
| `OUTPUT_RESULT` | Resets current experience fields | Input includes `继续` | `INVENTORY_SCREENING` |
| `OUTPUT_RESULT` | Resets current experience fields | Input includes `重新` | `DEEP_DIVE_SCENE` |
| `OUTPUT_RESULT` | None | Any other input, including "generate resume" | `OUTPUT_RESULT` |

## Current Limitations

- Evaluation is rule-light: `evaluationLevel` is only `可写经历` or `辅助经历`, based on whether scene/action/result are non-empty.
- The prompt files are placeholders and are not yet wired into a real LLM API.
- `mockApi.js` is a placeholder and is not used for production response generation.
- No real resume generation step exists yet; `OUTPUT_RESULT` explicitly stops at experience organization.
- The state machine only tracks one focused experience at a time.
- There is no persisted storage, backend session, or export format.
- Field naming is mostly camelCase in code, but future prompt output schemas include additional fields not yet represented in `stateMachine.js`.

## Next Planned Version

v0.2 should connect the current deterministic flow to the prompt pipeline:

- Add structured prompt outputs for opening routing, inventory screening, deep dive, value evaluation, resume translation, and improvement review.
- Expand `currentExperience` into structured facts: role, actions, objects, tools, scale, result, target-role relevance, missing fields, and risk flags.
- Replace the simple `evaluationLevel` rule with the Notion value-evaluation schema: score, level, recommended section, dimension scores, missing-info priority, allowed positioning, and forbidden claims.
- Add a real resume translation stage that generates bullets, an experience card, and a review report while preserving the "no invented facts" boundary.
- Support multiple experiences and a final resume assembly step.
