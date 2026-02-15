export type CapabilityAudience = 'general' | 'path_finder' | 'project_chat' | 'milestone_mode' | 'council'

interface CapabilitySection {
  title: string
  bullets: string[]
}

interface AudienceSnapshot {
  audience: CapabilityAudience
  block: string
  sections: CapabilitySection[]
}

const SHARED_SECTIONS: CapabilitySection[] = [
  {
    title: 'Core Product Surfaces',
    bullets: [
      'Dashboard supports morning wake flow, daily mission focus, and quick access to projects/path finder.',
      'Path Finder is for discovery, exploration, and project planning with persistent memory.',
      'Project Chat is a focused cofounder-style chat for a selected project.',
      'Milestone Mode is execution support for one milestone at a time.',
      'Progress tab renders the Knowledge Network from profile facts, insights, patterns, and brain dump summaries.',
    ],
  },
  {
    title: 'Memory System',
    bullets: [
      'Persistent memory comes from user_profile_facts, ai_insights, project_context, conversation logs, and daily logs.',
      'Memory should prioritize durable user truths, decisions, blockers, and preferences.',
      'Low-signal chatter, greetings, and duplicates should not be treated as memory-worthy.',
    ],
  },
  {
    title: 'Brain Dump + Voice',
    bullets: [
      'Brain Dump supports both voice and typed input.',
      'Voice uses transcription and text-to-speech endpoints under /api/brain-dump/*.',
      'Brain dump completion writes summary + extracted profile facts/insights used by Progress and memory.',
    ],
  },
  {
    title: 'Notification + Check-in',
    bullets: [
      'Proactive question notifications deep-link into Path Finder with question context.',
      'When a deep-linked question is opened, Path Finder starts from that question and can mark it answered.',
    ],
  },
]

const AUDIENCE_SPECIFIC: Record<CapabilityAudience, CapabilitySection[]> = {
  general: [
    {
      title: 'General Guardrails',
      bullets: [
        'Do not claim the app can perform actions not listed in this map.',
        'If a feature is unclear, ask for clarification rather than inventing hidden tools.',
      ],
    },
  ],
  path_finder: [
    {
      title: 'Path Finder Actions',
      bullets: [
        'Can create/update projects, milestones, ideas, notes, focus levels, and ordering via structured action tags.',
        'Should use discovery-first behavior before pushing toward concrete plans when context is still shallow.',
        'Should reference known profile facts and prior decisions only when genuinely relevant.',
      ],
    },
  ],
  project_chat: [
    {
      title: 'Project Chat Actions',
      bullets: [
        'Can guide or do execution work depending on selected approach.',
        'Can run in single-mind mode or council mode (analyst, critic, strategist, operator).',
        'Should ground advice in active milestone state, context bank, and remembered blockers/preferences.',
      ],
    },
  ],
  milestone_mode: [
    {
      title: 'Milestone Mode Actions',
      bullets: [
        'Focuses on one active milestone and step progression.',
        'Supports completion tags ([COMPLETE_STEP], [COMPLETE_MILESTONE]) after explicit user confirmation.',
        'Should avoid drifting into unrelated planning when the user is in execution mode.',
      ],
    },
  ],
  council: [
    {
      title: 'Council Room Actions',
      bullets: [
        'Runs a structured multi-perspective reasoning pass: Analyst, Critic, Strategist, Operator.',
        'Focuses on general decision-making (life/work strategy) rather than project execution details.',
        'Returns one synthesized recommendation and practical next steps.',
      ],
    },
  ],
}

function formatSections(sections: CapabilitySection[]): string {
  return sections
    .map(section => `### ${section.title}\n${section.bullets.map(line => `- ${line}`).join('\n')}`)
    .join('\n\n')
}

export function getCapabilitySnapshot(audience: CapabilityAudience = 'general'): AudienceSnapshot {
  const sections = [...SHARED_SECTIONS, ...AUDIENCE_SPECIFIC[audience]]
  const block = `## App Capability Map\nUse this as the source of truth for what Rise can do in this codebase.\n\n${formatSections(sections)}`
  return {
    audience,
    block,
    sections,
  }
}

export async function getAppCapabilitiesPromptBlock(audience: CapabilityAudience = 'general'): Promise<string> {
  return getCapabilitySnapshot(audience).block
}
