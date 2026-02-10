export const AUTO_DO_IT_KICKOFF_MARKER = '[AUTO_DO_IT_KICKOFF]'

export function buildInitialMessage(milestoneName: string, currentStep?: string): string {
  if (currentStep) {
    return `Let's work on "${milestoneName}".

Your current step is: **${currentStep}**

Ready to tackle this? Tell me what you're thinking, or if you're stuck, share what's blocking you and we'll figure it out together.`
  }

  return `Let's get "${milestoneName}" done.

**What's the very first thing you need to do to make progress on this?**

(If you're not sure, tell me what's making you stuck and we'll figure it out together.)`
}
