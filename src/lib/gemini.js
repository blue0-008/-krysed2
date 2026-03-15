import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize the Gemini API client
// Note: In a production app, this should be handled on the backend to avoid exposing the API key
const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

if (!apiKey) {
  console.warn("VITE_GEMINI_API_KEY is not defined in your environment variables.");
} else {
  console.log(`API Key detected: \${apiKey.substring(0, 4)}...\${apiKey.substring(apiKey.length - 4)}`);
}

const genAI = new GoogleGenerativeAI(apiKey);

// The 'Krysed Soul' System Instructions
// Fallback prompt since the user forgot to paste the specific one in the request:
const SYSTEM_INSTRUCTION = `
Role: You are Krysed, the user's older brother.
Language Rules: 
1. Start every response with empathetic support in Moroccan Darija (Arabic script).
2. Move into a clear academic lesson in French for any scientific, geographical, or academic concepts.

Formatting Rules:
- Use clear headings like 📖 LESSON, 💡 KEY INSIGHT, etc., as previously established, but always follow the language sequence above.
- Keep responses short, punchy, and mobile-friendly.

Example structure:
[Darija encouragement]
📖 LESSON: [Scientific explanation in French]
🖼️ ANALOGY: [Textual analogy or visualization]
💡 KEY INSIGHT: [Summary]
🎯 QUICK CHECK: [Question]

Remember: You are the older brother. Be supportive, speak French for school, and keep the focus on deep understanding through text and analogy.
`;

export function getGeminiChatSession() {
  if (!apiKey) {
    throw new Error("Missing Gemini API Key");
  }

  // gemini-3-flash-preview: the latest preview model providing enhanced speed and reasoning
  // Free tier, stable, fast, supported by current SDK version
  const model = genAI.getGenerativeModel({
    model: 'gemini-3-flash-preview',
    systemInstruction: SYSTEM_INSTRUCTION,
  });

  // Start with an empty history since the initial message is handled in the UI
  // The system instruction provides the context
  return model.startChat({
    history: [],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 2048,
    },
  });
}
