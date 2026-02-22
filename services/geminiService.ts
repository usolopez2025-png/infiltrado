
import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export interface GameData {
  word: string;
  hint: string;
}

export const getGameData = async (categoryName: string): Promise<GameData> => {
  try {
    // Fix: Using responseSchema for strictly typed JSON responses as per guidelines
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Eres un experto bíblico. Genera una palabra secreta y una pista sutil para el juego "Infiltrado".
      Categoría: "${categoryName}".
      
      Reglas:
      1. La palabra debe ser literal y muy conocida en la Biblia.
      2. La pista para el infiltrado debe ser sutil: no debe ser demasiado literal para que no lo atrapen, pero debe darle una idea del tema para que pueda mentir con éxito.`,
      config: {
        temperature: 0.8,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            word: {
              type: Type.STRING,
              description: 'The secret word for the disciples.',
            },
            hint: {
              type: Type.STRING,
              description: 'A subtle hint for the infiltrator.',
            },
          },
          required: ['word', 'hint'],
        },
      },
    });

    // Fix: Access response.text property safely
    const text = response.text;
    if (!text) {
      throw new Error("Empty response from AI");
    }

    const data = JSON.parse(text);
    return {
      word: (data.word || 'GÉNESIS').toUpperCase(),
      hint: data.hint || 'Se trata de un comienzo importante.'
    };
  } catch (error) {
    console.error("Error generating game data:", error);
    return {
      word: 'GÉNESIS',
      hint: 'Se trata de un comienzo importante.'
    };
  }
};
