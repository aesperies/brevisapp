import Anthropic from "@anthropic-ai/sdk";

let client;

try {
  client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });
  console.log("✅ Anthropic client initialized successfully");
} catch (error) {
  console.error("❌ Failed to initialize Anthropic client:", error.message);
}

/**
 * Summarize a single newsletter with Claude Haiku
 * @param {string} content - Newsletter content
 * @param {string} language - 'es' or 'en'
 * @returns {Promise<string>} - Summary text
 */
export async function summarizeWithClaude(content, language = "en") {
  try {
    if (!client) {
      throw new Error(
        "Anthropic client not initialized. Check ANTHROPIC_API_KEY environment variable."
      );
    }

    if (!content || content.trim().length === 0) {
      throw new Error("Content cannot be empty");
    }

    const prompt =
      language === "es"
        ? `Por favor, resume el siguiente contenido de newsletter de forma concisa y clara. 
Proporciona los puntos principales en 3-4 párrafos:

${content}`
        : `Please summarize the following newsletter content concisely and clearly.
Provide the main points in 3-4 paragraphs:

${content}`;

    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    if (!message.content || !message.content[0]) {
      throw new Error("Empty response from Anthropic API");
    }

    return message.content[0].text;
  } catch (error) {
    console.error("❌ Error summarizing with Claude:", error.message);
    throw error;
  }
}

/**
 * Generate a report from multiple newsletters
 * @param {Array} newsletters - Array of newsletter objects with title, content, summary
 * @param {string} language - 'es' or 'en'
 * @returns {Promise<string>} - Report text
 */
export async function reportWithClaude(newsletters, language = "en") {
  try {
    if (!client) {
      throw new Error(
        "Anthropic client not initialized. Check ANTHROPIC_API_KEY environment variable."
      );
    }

    if (!newsletters || !Array.isArray(newsletters) || newsletters.length === 0) {
      throw new Error("Newsletters array cannot be empty");
    }

    const newsletterList = newsletters
      .map(
        (n, i) =>
          `${i + 1}. ${n.title || "Untitled"}\n${
            n.summary || n.content?.substring(0, 200) || "No content"
          }`
      )
      .join("\n\n");

    const prompt =
      language === "es"
        ? `Analiza los siguientes resúmenes de newsletters y proporciona un reporte general que incluya:
- Temas principales identificados
- Tendencias y patrones
- Recomendaciones clave
- Insights relevantes

Newsletters:
${newsletterList}`
        : `Analyze the following newsletter summaries and provide a comprehensive report that includes:
- Main topics identified
- Trends and patterns
- Key recommendations
- Relevant insights

Newsletters:
${newsletterList}`;

    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1500,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    if (!message.content || !message.content[0]) {
      throw new Error("Empty response from Anthropic API");
    }

    return message.content[0].text;
  } catch (error) {
    console.error("❌ Error generating report with Claude:", error.message);
    throw error;
  }
}

/**
 * Test function to verify Anthropic API is working
 * @returns {Promise<Object>} - Test result
 */
export async function testAnthropicConnection() {
  try {
    if (!client) {
      throw new Error("Anthropic client not initialized");
    }

    const testContent =
      "This is a test newsletter about artificial intelligence and machine learning advancements in 2025.";
    const summary = await summarizeWithClaude(testContent, "en");

    return {
      success: true,
      message: "Anthropic API is working correctly",
      testSummary: summary,
      model: "claude-haiku-4-5-20251001",
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      model: "claude-haiku-4-5-20251001",
    };
  }
}
