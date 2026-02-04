import fetch from 'node-fetch';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

// Plan definitions
export const PLANS = {
    free: {
        name: 'Free',
        canSummarize: false,
        canReport: false,
        priceMonthly: 0,
        priceAnnual: 0
    },
    pro: {
        name: 'Pro',
        canSummarize: true,
        canReport: false,
        priceMonthly: 7.99,
        priceAnnual: 69.99
    },
    premium: {
        name: 'Premium',
        canSummarize: true,
        canReport: true,
        priceMonthly: 9.99,
        priceAnnual: 89.99
    }
};

export function canUserPerformAction(user, action) {
    const plan = PLANS[user.plan] || PLANS.free;

    switch(action) {
        case 'generate_summary':
            return plan.canSummarize;
        case 'generate_brief':
            return plan.canSummarize;
        case 'generate_report':
            return plan.canReport;
        default:
            return false;
    }
}

export async function generateSummary(newsletter, language = 'es') {
    if (!ANTHROPIC_API_KEY) {
        throw new Error('ANTHROPIC_API_KEY not configured');
    }

    const prompts = {
        es: `Crea un resumen en 4-6 bullet points del siguiente newsletter para ayudar al lector a decidir si quiere leerlo completo.

Reglas:
- Exactamente 4-6 bullet points
- Cada punto debe ser una frase corta y directa
- Captura solo las ideas más importantes
- En español

Newsletter:
Título: ${newsletter.title}
Contenido: ${newsletter.content}

Resumen (4-6 bullets):`,
        en: `Create a summary in 4-6 bullet points of the following newsletter to help the reader decide if they want to read the full article.

Rules:
- Exactly 4-6 bullet points
- Each point should be a short, direct sentence
- Capture only the most important ideas
- In English

Newsletter:
Title: ${newsletter.title}
Content: ${newsletter.content}

Summary (4-6 bullets):`
    };

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);
        const response = await fetch(ANTHROPIC_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': ANTHROPIC_API_KEY,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: 'claude-sonnet-4-20250514',
                max_tokens: 1024,
                messages: [{
                    role: 'user',
                    content: prompts[language] || prompts.es
                }]
            }),
            signal: controller.signal
        });
        clearTimeout(timeout);

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Claude API error: ${error}`);
        }

        const data = await response.json();
        return data.content[0].text;
    } catch (error) {
        console.error('Error generating summary:', error);
        throw error;
    }
}

export async function generateBatchBrief(newsletters, language = 'es', purpose = '') {
    if (!ANTHROPIC_API_KEY) {
        throw new Error('ANTHROPIC_API_KEY not configured');
    }

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

Newsletters:
${newsletterList}

Brief ejecutivo:`,
        en: `Here are ${newsletters.length} newsletters. Create an executive "brief" with key points from all of them.
${purposeTextEn}
Format:
- Use bullet points
- Group by themes if possible
- Maximum 10-15 points total
- Be concise but informative
- In English

Newsletters:
${newsletterList}

Executive brief:`
    };

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 60000);
        const response = await fetch(ANTHROPIC_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': ANTHROPIC_API_KEY,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: 'claude-sonnet-4-20250514',
                max_tokens: 2048,
                messages: [{
                    role: 'user',
                    content: prompts[language] || prompts.es
                }]
            }),
            signal: controller.signal
        });
        clearTimeout(timeout);

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Claude API error: ${error}`);
        }

        const data = await response.json();
        return data.content[0].text;
    } catch (error) {
        console.error('Error generating brief:', error);
        throw error;
    }
}

export async function generateBatchReport(newsletters, language = 'es', purpose = '') {
    if (!ANTHROPIC_API_KEY) {
        throw new Error('ANTHROPIC_API_KEY not configured');
    }

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

Newsletters:
${newsletterList}

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

Newsletters:
${newsletterList}

Report:`
    };

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 90000);
        const response = await fetch(ANTHROPIC_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': ANTHROPIC_API_KEY,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: 'claude-sonnet-4-20250514',
                max_tokens: 4096,
                messages: [{
                    role: 'user',
                    content: prompts[language] || prompts.es
                }]
            }),
            signal: controller.signal
        });
        clearTimeout(timeout);

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Claude API error: ${error}`);
        }

        const data = await response.json();
        return data.content[0].text;
    } catch (error) {
        console.error('Error generating report:', error);
        throw error;
    }
}

export async function generateNewsletterFromTemplate(template, reportIds, language = 'es') {
    if (!ANTHROPIC_API_KEY) {
        throw new Error('ANTHROPIC_API_KEY not configured');
    }

    const prompts = {
        es: `Eres un escritor de newsletters profesional. Usando esta plantilla como guía de estilo:

${template}

Genera una nueva newsletter con estilo, tono y estructura similares. Mantén los mismos patrones de formato.

Los IDs de reportes seleccionados son: ${reportIds.join(', ')}
(Nota: El contenido de los reportes se incorporará cuando estén disponibles)

Genera solo el contenido de la newsletter, formateado en HTML limpio.`,
        en: `You are a professional newsletter writer. Using this template as a style guide:

${template}

Generate a new newsletter with similar style, tone, and structure. Keep the same formatting patterns.

The selected report IDs are: ${reportIds.join(', ')}
(Note: Report content will be incorporated when available)

Output only the newsletter content, formatted in clean HTML.`
    };

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 90000);
        const response = await fetch(ANTHROPIC_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': ANTHROPIC_API_KEY,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: 'claude-sonnet-4-20250514',
                max_tokens: 4096,
                messages: [{
                    role: 'user',
                    content: prompts[language] || prompts.es
                }]
            }),
            signal: controller.signal
        });
        clearTimeout(timeout);

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Claude API error: ${error}`);
        }

        const data = await response.json();
        return data.content[0].text;
    } catch (error) {
        console.error('Error generating newsletter from template:', error);
        throw error;
    }
}
