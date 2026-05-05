# AI Site Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Goalden ask Groq whether the current page is a distraction for the active task, then use that answer in the block screen and coach copy.

**Architecture:** Keep the Groq key out of committed code. Store it locally in Chrome storage, call Groq only from the background service worker, and sync only non-secret AI preferences through Supabase.

**Tech Stack:** Chrome extension MV3, Vue 3, TypeScript, Supabase REST, Groq chat completions.

---

### Task 1: AI State

**Files:**
- Modify: `extension/src/shared/types.ts`
- Modify: `extension/src/shared/state.ts`

- [x] Add `AiSettings`, `AiDecision`, and message types for saving AI settings, saving the local Groq key, and evaluating the current page.
- [x] Add default AI settings to `DEFAULT_STATE`.
- [x] Normalize AI settings so old local state still loads safely.

### Task 2: Groq Evaluator

**Files:**
- Create: `extension/src/shared/aiCoach.ts`
- Modify: `extension/src/background.ts`

- [x] Build a strict JSON prompt for `openai/gpt-oss-120b`.
- [x] Call `https://api.groq.com/openai/v1/chat/completions` from background only.
- [x] Add a deterministic fallback when the key is missing, the API is down, or the model returns bad JSON.
- [x] Cache decisions briefly by hostname, URL path, active task, and task update timestamp.

### Task 3: Overlay and Side Panel

**Files:**
- Modify: `extension/src/content/goaldenGate.ts`
- Modify: `extension/src/sidepanel/SidePanel.vue`

- [x] Let the content script ask background for a page decision before showing the gate.
- [x] Show the model reason and coach question in the gate.
- [x] Add a compact AI settings panel in the side panel with enable toggle, model field, and local Groq key field.

### Task 4: Supabase Shape

**Files:**
- Modify: `extension/src/shared/supabaseAuth.ts`
- Add: `supabase/migrations/20260503000000_add_goalden_ai_settings.sql`

- [x] Save `ai_settings` in `goalden_settings` as JSONB.
- [x] Do not save `groq_api_key` to Supabase.
- [x] Add the SQL migration for the new column.

### Task 5: Verification

**Commands:**
- `npx tsc -p extension\tsconfig.json --noEmit`
- `npm run extension:build`
- scan extension source and dist for Cyrillic strings
- scan extension source and dist for the provided Groq key

- [x] Confirm typecheck passes.
- [x] Confirm build passes.
- [x] Confirm the Groq key is not committed or bundled.
