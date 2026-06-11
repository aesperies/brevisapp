// Templates + fenced context construction moved verbatim from ai-service.js
// queryKnowledgeBase (2026-06 prompt versioning). The <user_content> fencing
// versions WITH the prompt.

import { DEFAULT_MODEL } from './model.js';

export const kbQueryV1 = {
    id: 'kb-query',
    version: 1,
    model: DEFAULT_MODEL,
    maxTokens: 2048,
    timeoutMs: 60000,
    build({ question: rawQuestion, tagName: rawTagName, articles, recentQA = [], indexArticle }, language) {
        // The question, tag name, article bodies/summaries, and prior Q&A are all
        // user-controlled — fence them in <user_content> so the SYSTEM_PROMPT
        // injection guard applies (same pattern as generateSummary).
        const tagName = `<user_content>${rawTagName}</user_content>`;
        const question = `<user_content>${rawQuestion}</user_content>`;

        // Build context: index article + article summaries for relevance detection
        let contextText = '';

        if (indexArticle && indexArticle.content) {
            contextText += `Master Index:\n${indexArticle.content}\n\n`;
        }

        contextText += 'Available articles:\n';
        articles.forEach(a => {
            contextText += `- ${a.title}: ${a.summary}\n`;
        });
        contextText = `<user_content>\n${contextText}\n</user_content>`;

        // Build recent Q&A context for consistency
        const qaContext = recentQA.length > 0
            ? `\n\nRecent Q&A for context:\n<user_content>\n${recentQA.map(qa => `Q: ${qa.question}\nA: ${qa.answer}`).join('\n\n')}\n</user_content>`
            : '';

        const prompts = {
            es: `Eres un asistente de búsqueda de base de conocimiento. Responde la pregunta del usuario basándote en el contexto de la base de conocimiento sobre "${tagName}".

Contexto de la base de conocimiento:
${contextText}
${qaContext}

Pregunta del usuario: ${question}

Responde la pregunta de manera clara y completa. Cuando cites información, menciona el título del artículo de donde proviene entre corchetes [así].

Responde en este formato JSON exacto:
{
  "answer": "Your answer here...",
  "citations": [
    {
      "articleTitle": "Article Title",
      "excerpt": "Relevant excerpt from the article"
    }
  ]
}`,
            en: `You are a knowledge base search assistant. Answer the user's question based on the knowledge base context about "${tagName}".

Knowledge base context:
${contextText}
${qaContext}

User question: ${question}

Answer the question clearly and completely. When citing information, mention the article title it comes from in brackets [like this].

Respond in this exact JSON format:
{
  "answer": "Your answer here...",
  "citations": [
    {
      "articleTitle": "Article Title",
      "excerpt": "Relevant excerpt from the article"
    }
  ]
}`
        };
        return prompts[language] || prompts.en;
    },
};
