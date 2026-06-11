// Templates + list construction moved verbatim from ai-service.js
// generateBatchReport (2026-06 prompt versioning).

import { DEFAULT_MODEL } from './model.js';

export const batchReportV1 = {
    id: 'batch-report',
    version: 1,
    model: DEFAULT_MODEL,
    maxTokens: 4096,
    timeoutMs: 90000,
    build({ newsletters, purpose = '' }, language) {
        const newsletterList = newsletters.map((n, i) =>
            `## Newsletter ${i + 1}: ${n.title}\nDe: ${n.sender}\n\n${n.content.substring(0, 1000)}...`
        ).join('\n\n---\n\n');

        const purposeText = purpose ? `\nPropósito del reporte: ${purpose}\nEnfoca el análisis y conclusiones hacia este objetivo.\n` : '';
        const purposeTextEn = purpose ? `\nPurpose of this report: ${purpose}\nFocus the analysis and conclusions towards this goal.\n` : '';

        const prompts = {
            es: `He aquí ${newsletters.length} newsletters. Crea un reporte/artículo extenso que:
${purposeText}
1. Analice los temas principales
2. Identifique tendencias y patrones
3. Sintetice insights clave
4. Proporcione conclusiones accionables

Formato:
- Artículo bien estructurado con secciones
- 500-800 palabras
- Tono profesional pero accesible
- En español

<user_content>
${newsletterList}
</user_content>

Reporte:`,
            en: `Here are ${newsletters.length} newsletters. Create an extensive report/article that:
${purposeTextEn}
1. Analyzes main themes
2. Identifies trends and patterns
3. Synthesizes key insights
4. Provides actionable conclusions

Format:
- Well-structured article with sections
- 500-800 words
- Professional but accessible tone
- In English

<user_content>
${newsletterList}
</user_content>

Report:`
        };
        return prompts[language] || prompts.es;
    },
};
