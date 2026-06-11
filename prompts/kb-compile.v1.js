// Templates + fenced context construction moved verbatim from ai-service.js
// compileKnowledgeBase (2026-06 prompt versioning). The <user_content>
// fencing is part of the prompt's security posture — it versions WITH the
// prompt, never gets stripped in a refactor.

import { DEFAULT_MODEL } from './model.js';

export const kbCompileV1 = {
    id: 'kb-compile',
    version: 1,
    model: DEFAULT_MODEL,
    maxTokens: 8192,
    timeoutMs: 120000,
    build({ tagName: rawTagName, newsletters, entities, existingArticles = [] }, language) {
        // Everything below derives from user-controlled data (tag names, newsletter
        // titles/senders/summaries, entity names) — fence it all in <user_content>
        // so the SYSTEM_PROMPT injection guard applies, same as generateSummary.
        const tagName = `<user_content>${rawTagName}</user_content>`;

        // Format newsletter summaries for context
        const newsletterContext = '<user_content>\n' + newsletters
            .map(n => `- "${n.title}" (${n.sender}, ${n.date_added}): ${n.summary}`)
            .join('\n') + '\n</user_content>';

        // Format entities for knowledge graph structure
        const entityContext = '<user_content>\n' + entities
            .map(e => `- ${e.name} (${e.node_type}, mentioned ${e.mention_count}x)${e.connections ? ': connects to ' + e.connections.join(', ') : ''}`)
            .join('\n') + '\n</user_content>';

        // Format existing articles if this is a recompile
        const existingContext = existingArticles.length > 0
            ? `\n\nExisting articles (for reference and to avoid duplication):\n<user_content>\n${existingArticles.map(a => `- ${a.title}`).join('\n')}\n</user_content>`
            : '';

        const prompts = {
            es: `Eres un experto en síntesis de conocimiento. Tu tarea es compilar una base de conocimiento temática sobre "${tagName}" basada en un conjunto de newsletters.

Newsletters (resúmenes):
${newsletterContext}

Entidades clave del gráfico de conocimiento:
${entityContext}
${existingContext}

Genera 5-10 artículos conceptuales temáticos (NO uno por newsletter, sino por TEMA) que sinteticen el contenido. Cada artículo debe:
- Tener 300-600 palabras
- Estar en markdown
- Ser temático y transversal (no sobre un newsletter individual)
- Incluir ejemplos concretos y hallazgos clave
- Identificar relaciones con otros conceptos

Después, genera UN artículo índice maestro que resuma todos los temas y enlace a los artículos.

Para enlaces entre artículos, usa [[Título del Artículo]] en el contenido.

Responde SOLO con JSON válido, sin texto adicional, en este formato exacto:
{
  "articles": [
    {
      "type": "concept|index",
      "title": "Article Title",
      "slug": "article-slug",
      "content": "Markdown content...",
      "summary": "One-line summary",
      "crossLinks": ["Article Title 1", "Article Title 2"],
      "sourceNewsletterIds": [id1, id2]
    }
  ]
}`,
            en: `You are a knowledge synthesis expert. Your task is to compile a thematic knowledge base about "${tagName}" based on a set of newsletters.

Newsletters (summaries):
${newsletterContext}

Key entities from knowledge graph:
${entityContext}
${existingContext}

Generate 5-10 thematic concept articles (NOT one per newsletter, but by THEME) that synthesize the content. Each article should:
- Be 300-600 words
- Be in markdown format
- Be thematic and cross-cutting (not about a single newsletter)
- Include concrete examples and key findings
- Identify relationships with other concepts

Then, generate ONE master index article that summarizes all topics and links to the articles.

For links between articles, use [[Article Title]] in the content.

Respond ONLY with valid JSON, no additional text, in this exact format:
{
  "articles": [
    {
      "type": "concept|index",
      "title": "Article Title",
      "slug": "article-slug",
      "content": "Markdown content...",
      "summary": "One-line summary",
      "crossLinks": ["Article Title 1", "Article Title 2"],
      "sourceNewsletterIds": [id1, id2]
    }
  ]
}`
        };
        return prompts[language] || prompts.en;
    },
};
