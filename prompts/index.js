// Versioned prompt registry. Every Claude prompt lives here as a frozen,
// versioned module — model choice, token budget, timeout, and the template
// itself. ai-service.js only does API mechanics and response parsing.
//
// Rules:
// - NEVER edit a published prompt version in place. Copy to .v2, change there,
//   and switch the registry entry — git history then shows exactly which
//   prompt version produced which behavior, and rollback is one line.
// - tests/ai-prompts.test.js snapshots the full request body for every prompt;
//   a changed snapshot must always be a deliberate version bump.
// - User-derived text MUST stay inside <user_content> fencing (see
//   prompts/system.v1.js for the injection guard it pairs with).

export { DEFAULT_MODEL } from './model.js';

import { newsletterSummaryV1 } from './newsletter-summary.v1.js';
import { batchBriefV1 } from './batch-brief.v1.js';
import { batchReportV1 } from './batch-report.v1.js';
import { newsletterFromTemplateV1 } from './newsletter-from-template.v1.js';
import { newsletterFromProjectV1 } from './newsletter-from-project.v1.js';
import { kbCompileV1 } from './kb-compile.v1.js';
import { kbQueryV1 } from './kb-query.v1.js';

export const PROMPTS = {
    newsletterSummary: newsletterSummaryV1,
    batchBrief: batchBriefV1,
    batchReport: batchReportV1,
    newsletterFromTemplate: newsletterFromTemplateV1,
    newsletterFromProject: newsletterFromProjectV1,
    kbCompile: kbCompileV1,
    kbQuery: kbQueryV1,
};
