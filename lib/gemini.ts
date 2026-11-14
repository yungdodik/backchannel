import { GoogleGenAI, Type } from "@google/genai";

export interface Gemini {
  questions(prompt: string): Promise<string[]>;
}

// D24 says gemini-3.8-flash; it is listed but returned 504/503 (overloaded) on every call, so 3.5-flash. Revisit.
const MODEL = "gemini-3.5-flash";

const MAX = 5;
let active = 0;
const waiting: (() => void)[] = [];

export function createGemini(apiKey: string): Gemini {
  const ai = new GoogleGenAI({ apiKey });
  return {
    async questions(prompt) {
      if (active >= MAX) await new Promise<void>((r) => waiting.push(r));
      active++;
      try {
        const res = await ai.models.generateContent({
          model: MODEL,
          contents: prompt,
          config: {
            abortSignal: AbortSignal.timeout(20_000), // a bad model hangs ~60 s; templates fill in
            responseMimeType: "application/json", responseSchema: { type: Type.ARRAY, items: { type: Type.STRING } } },
        });
        return JSON.parse(res.text ?? "[]") as string[];
      } finally {
        active--;
        waiting.shift()?.();
      }
    },
  };
}
