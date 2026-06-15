// Translate an existing bullet-point summary into the user's selected language
// (cheap) instead of re-summarizing the newsletter (expensive). The summary is
// fenced in <user_content> because it may contain text that originated in an
// attacker-controlled newsletter body.

import { DEFAULT_MODEL } from './model.js';

export const translateV1 = {
    id: 'translate',
    version: 1,
    model: DEFAULT_MODEL,
    maxTokens: 1024,
    timeoutMs: 30000,
    build({ text }, language) {
        const target = language === 'es' ? 'Spanish' : 'English';
        return `Translate the bullet-point summary below into ${target}.

Rules:
- Keep the exact same bullet/line structure and number of points
- Translate only — do not summarize, add, or remove information
- Output only the translation, with no preamble or commentary

<user_content>
${text}
</user_content>

Translation:`;
    },
};
