import fetch from 'node-fetch';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

// Plan limits
export const PLANS = {
    free: {
        name: 'Free',
        limit: 10,
        canSummarize: false,
        canReport: false,
        price: 0
    },
    pro: {
        name: 'Pro',
        limit: 31,
        canSummarize: true,
        canReport: false,
        price: 9.99
    },
    premium: {
        name: 'Premium',
        limit: -1, // unlimited
        canSummarize: true,
        canReport: true,
        price: 19.99
    }
};

export function canUserPerformAction(user, action) {
    const plan = PLANS[user.plan] || PLANS.free;
    
    switch(action) {
        case 'add_newsletter':
            return plan.limit === -1 || user.newsletters_count < plan.limit;
        case 'summarize':
            return plan.canSummarize;
        case 'report':
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
        es: `Por favor, crea un resumen ejecutivo conciso del siguiente newsletter. 
El resumen debe:
- Tener máximo 3-4 párrafos
- Capturar las ideas principales y puntos clave
- Ser claro y directo
- Estar en español

Newsletter:
Título: ${newsletter.title}
Contenido: ${newsletter.content}

Resumen ejecutivo:`,
        en: `Please create a concise executive summary of the following newsletter.
The summary should:
- Be maximum 3-4 paragraphs
- Capture main ideas and key points
- Be clear and direct
- Be in English

Newsletter:
Title: ${newsletter.title}
Content: ${newsletter.content}

Executive summary:`
    };
    
    try {
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
            })
        });
        
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

export async function generateBatchBrief(newsletters, language = 'es') {
    if (!ANTHROPIC_API_KEY) {
        throw new Error('ANTHROPIC_API_KEY not configured');
    }
    
    const newsletterList = newsletters.map((n, i) => 
        `${i + 1}. ${n.title}\n   De: ${n.sender}\n   ${n.content.substring(0, 500)}...`
    ).join('\n\n');
    
    const prompts = {
        es: `He aquí ${newsletters.length} newsletters. Crea un "brief" ejecutivo con los puntos clave de todos ellos.

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
            })
        });
        
        if (!response.ok) {
            throw new Error('Claude API error');
        }
        
        const data = await response.json();
        return data.content[0].text;
    } catch (error) {
        console.error('Error generating brief:', error);
        throw error;
    }
}

export async function generateBatchReport(newsletters, language = 'es') {
    if (!ANTHROPIC_API_KEY) {
        throw new Error('ANTHROPIC_API_KEY not configured');
    }
    
    const newsletterList = newsletters.map((n, i) => 
        `## Newsletter ${i + 1}: ${n.title}\nDe: ${n.sender}\n\n${n.content.substring(0, 1000)}...`
    ).join('\n\n---\n\n');
    
    const prompts = {
        es: `He aquí ${newsletters.length} newsletters. Crea un reporte/artículo extenso que:

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
            })
        });
        
        if (!response.ok) {
            throw new Error('Claude API error');
        }
        
        const data = await response.json();
        return data.content[0].text;
    } catch (error) {
        console.error('Error generating report:', error);
        throw error;
    }
}
