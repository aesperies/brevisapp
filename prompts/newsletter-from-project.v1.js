// Templates + context construction moved verbatim from ai-service.js
// generateNewsletterFromProject (2026-06 prompt versioning).

import { DEFAULT_MODEL } from './model.js';

export const newsletterFromProjectV1 = {
    id: 'newsletter-from-project',
    version: 1,
    model: DEFAULT_MODEL,
    maxTokens: 4096,
    timeoutMs: 90000,
    build({ template, reports, urls }, language) {
        // Build context from reports and URLs
        const reportContent = reports.length > 0
            ? reports.map((r, i) => `--- Reporte ${i+1}: ${r.name} ---\n${r.content}`).join('\n\n')
            : '';

        const urlContent = urls.length > 0
            ? urls.map((u, i) => `--- Fuente ${i+1}: ${u.url} ---\n${u.content}`).join('\n\n')
            : '';

        const contextSection = (reportContent || urlContent)
            ? `\n\nContenido de referencia para incorporar:\n<user_content>\n${reportContent}\n${urlContent}\n</user_content>`
            : '';

        const prompts = {
            es: `Eres un escritor de newsletters profesional.

Usando esta plantilla como guía de estilo y estructura:
<user_content>
${template}
</user_content>
${contextSection}

Genera una nueva newsletter con estilo, tono y estructura similares a la plantilla.
${contextSection ? 'Incorpora la información relevante del contenido de referencia de manera natural.' : ''}
Genera solo el contenido de la newsletter, formateado en HTML limpio.`,
            en: `You are a professional newsletter writer.

Using this template as a style and structure guide:
<user_content>
${template}
</user_content>
${contextSection}

Generate a new newsletter with similar style, tone, and structure to the template.
${contextSection ? 'Incorporate relevant information from the reference content naturally.' : ''}
Output only the newsletter content, formatted in clean HTML.`
        };
        return prompts[language] || prompts.es;
    },
};
