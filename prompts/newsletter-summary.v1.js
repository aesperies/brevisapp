// Templates moved verbatim from ai-service.js generateSummary
// (2026-06 prompt versioning).

import { DEFAULT_MODEL } from './model.js';

export const newsletterSummaryV1 = {
    id: 'newsletter-summary',
    version: 1,
    model: DEFAULT_MODEL,
    maxTokens: 1024,
    timeoutMs: 30000,
    build({ newsletter }, language) {
        const prompts = {
            es: `Crea un resumen en 4-6 bullet points del siguiente newsletter para ayudar al lector a decidir si quiere leerlo completo.

Reglas:
- Exactamente 4-6 bullet points
- Cada punto debe ser una frase corta y directa
- Captura solo las ideas más importantes
- En español

<user_content>
Título: ${newsletter.title}
Contenido: ${newsletter.content}
</user_content>

Resumen (4-6 bullets):`,
            en: `Create a summary in 4-6 bullet points of the following newsletter to help the reader decide if they want to read the full article.

Rules:
- Exactly 4-6 bullet points
- Each point should be a short, direct sentence
- Capture only the most important ideas
- In English

<user_content>
Title: ${newsletter.title}
Content: ${newsletter.content}
</user_content>

Summary (4-6 bullets):`
        };
        return prompts[language] || prompts.es;
    },
};
