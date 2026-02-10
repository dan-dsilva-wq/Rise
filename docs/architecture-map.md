# Rise Architecture Map

This map is optimized for fast task targeting when making changes.

## Entry Surfaces
- Dashboard home: `src/components/dashboard/DashboardContent.tsx`
- Pathfinder UI: `src/components/path-finder/PathFinderChat.tsx`
- Milestone mode UI: `src/components/milestone-mode/MilestoneModeChat.tsx`
- Project detail: `src/components/projects/ProjectDetailContent.tsx`
- Milestone list and pipeline controls: `src/components/projects/MilestoneList.tsx`

## API Routes (App Router)
- Pathfinder API: `src/app/api/path-finder/route.ts`
- Milestone mode API: `src/app/api/milestone-mode/route.ts`
- Project chat API: `src/app/api/chat/route.ts`
- Morning briefing API: `src/app/api/morning-briefing/route.ts`
- Evening reflection API: `src/app/api/evening-reflection/route.ts`
- Reorganize milestones API: `src/app/api/projects/reorganize/route.ts`
- Dispatch API: `src/app/api/orchestration/dispatch/route.ts`

## Route Decomposition Pattern
For complex AI routes, use this structure:
- `route.ts`: request/response flow and orchestration only
- `prompt.ts`: system prompt assembly
- `parsing.ts`: response tag parsing and cleanup
- `service.ts`: persistence and side-effects
- `types.ts`: local route contracts

Implemented:
- `src/app/api/path-finder/*`
- `src/app/api/milestone-mode/*`

## Pathfinder Modules
- UI types: `src/components/path-finder/types.ts`
- UI constants and message transform helpers: `src/components/path-finder/chat-constants.ts`
- Project/milestone action execution: `src/components/path-finder/project-actions.ts`
- Message list renderer: `src/components/path-finder/PathFinderMessageList.tsx`
- Chat composer: `src/components/path-finder/PathFinderComposer.tsx`
- Main component: `src/components/path-finder/PathFinderChat.tsx`

## Milestone Mode Modules
- UI types: `src/components/milestone-mode/types.ts`
- UI constants/helpers: `src/components/milestone-mode/chat-constants.ts`
- Main component: `src/components/milestone-mode/MilestoneModeChat.tsx`

## AI and Memory Core
- Shared model config: `src/lib/ai/model-config.ts`
- Conversation windowing/summarization: `src/lib/ai/conversationHistory.ts`
- Memory facade + cache wrappers: `src/lib/ai/memoryWeaver.ts`
- Memory modules:
  - Shared parsing/personality/step resolution: `src/lib/ai/memory-weaver/shared.ts`
  - Greeting/openers/signals: `src/lib/ai/memory-weaver/greetings.ts`
  - Cross-thread weaving engine: `src/lib/ai/memory-weaver/weave.ts`
  - User thread synthesis: `src/lib/ai/memory-weaver/user-thread.ts`
- Intelligence facade: `src/services/intelligence.ts`
- Intelligence modules:
  - Gap prompt + analysis engine: `src/services/intelligence/gap.ts`
  - Notification timing/context: `src/services/intelligence/notifications.ts`
  - Proactive question persistence: `src/services/intelligence/proactive-questions.ts`
- Orchestration context/dispatch logic: `src/services/orchestration.ts`

## Data Access and Hooks
- Supabase types: `src/lib/supabase/types.ts`
- Project + milestone operations: `src/lib/hooks/useProject.ts`
- Milestone conversation state: `src/lib/hooks/useMilestoneConversation.ts`
- Pathfinder conversation state: `src/lib/hooks/usePathFinderConversation.ts`
- Daily log and morning flow: `src/lib/hooks/useDailyLog.ts`

## Milestone Focus Pipeline
- Core rebalance logic: `src/lib/milestones/focusPipeline.ts`
- Called from:
  - `src/components/path-finder/project-actions.ts`
  - `src/components/dashboard/DashboardContent.tsx`
  - `src/components/milestone-mode/MilestoneModeChat.tsx`

## Typical Change Paths
- Update AI behavior in Pathfinder:
  1. Edit prompt: `src/app/api/path-finder/prompt.ts`
  2. Edit tags parsing: `src/app/api/path-finder/parsing.ts`
  3. Edit DB write behavior: `src/app/api/path-finder/service.ts`

- Update milestone completion automation:
  1. UI action handling: `src/components/milestone-mode/MilestoneModeChat.tsx`
  2. API action parsing: `src/app/api/milestone-mode/parsing.ts`
  3. Pipeline transitions: `src/lib/milestones/focusPipeline.ts`

- Update token/cost behavior:
  1. Model routing defaults: `src/lib/ai/model-config.ts`
  2. History trimming/summarization: `src/lib/ai/conversationHistory.ts`
  3. Prompt size controls: route-level `prompt.ts` modules

## Fast Search Hints
- Find where a tag is parsed: `rg -n "\[TAG_NAME\]|parseTagBlocks" src/app/api`
- Find where a UI action is applied: `rg -n "apply.*Action|complete_.*|set_focus" src/components src/lib`
- Find where a model is selected: `rg -n "ANTHROPIC_.*MODEL|model:" src`
