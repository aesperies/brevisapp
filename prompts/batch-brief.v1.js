// Templates + list construction moved verbatim from ai-service.js
// generateBatchBrief (2026-06 prompt versioning).

import { DEFAULT_MODEL } from './model.js';

export const batchBriefV1 = {
    id: 'batch-brief',
    version: 1,
    model: DEFAULT_MODEL,
    maxTokens: 2048,
    timeoutMs: 60000,
    build({ newsletters, purpose = '' }, language) {
        const newsletterList = newsletters.map((n, i) =>
            `${i + 1}. ${n.title}\n   De: ${n.sender}\n   ${n.content.substring(0, 500)}...`
        ).join('\n\n');

        const purposeText = purpose ? `\nPropósito del brief: ${purpose}\nEnfoca el contenido hacia este objetivo.\n` : '';
        const purposeTextEn = purpose ? `\nPurpose of this brief: ${purpose}\nFocus the content towards this goal.\n` : '';

        const prompts = {
            es: `He aquí ${newsletters.length} newsletters. Crea un "brief" ejecutivo con los puntos clave de todos ellos.
${purposeText}
Formato:
- Usa bullet points
- Agrupa por temas si es posible
- Máximo 10-15 puntos en total
- Sé conciso pero informativo
- En español

<user_content>
${newsletterList}
</user_content>

Brief ejecutivo:`,
            en: `Here are ${newsletters.length} newsletters. Create an executive "brief" with key points from all of them.
${purposeTextEn}
Format:
- Use bullet points
- Group by themes if possible
- Maximum 10-15 points total
- Be concise but informative
- In English

<user_content>
${newsletterList}
</user_content>

Executive brief:`
        };
        return prompts[language] || prompts.es;
    },
};
