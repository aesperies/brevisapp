// Templates moved verbatim from ai-service.js generateNewsletterFromTemplate
// (2026-06 prompt versioning).

import { DEFAULT_MODEL } from './model.js';

export const newsletterFromTemplateV1 = {
    id: 'newsletter-from-template',
    version: 1,
    model: DEFAULT_MODEL,
    maxTokens: 4096,
    timeoutMs: 90000,
    build({ template, reportIds }, language) {
        const prompts = {
            es: `Eres un escritor de newsletters profesional. Usando esta plantilla como guía de estilo:

<user_content>
${template}
</user_content>

Genera una nueva newsletter con estilo, tono y estructura similares. Mantén los mismos patrones de formato.

Los IDs de reportes seleccionados son: ${reportIds.join(', ')}
(Nota: El contenido de los reportes se incorporará cuando estén disponibles)

Genera solo el contenido de la newsletter, formateado en HTML limpio.`,
            en: `You are a professional newsletter writer. Using this template as a style guide:

<user_content>
${template}
</user_content>

Generate a new newsletter with similar style, tone, and structure. Keep the same formatting patterns.

The selected report IDs are: ${reportIds.join(', ')}
(Note: Report content will be incorporated when available)

Output only the newsletter content, formatted in clean HTML.`
        };
        return prompts[language] || prompts.es;
    },
};
