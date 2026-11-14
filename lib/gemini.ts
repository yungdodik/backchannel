import { GoogleGenAI, Type } from "@google/genai";
import { limiter } from "@/lib/limit";

export interface Gemini {
  questions(prompt: string): Promise<string[]>;
  /** Free-form JSON extraction (round facts, D28); the caller verifies every quote. */
  extract(prompt: string): Promise<unknown>;
}

// D24 says gemini-3.8-flash; it is listed but returned 504/503 (overloaded) on every call, so 3.5-flash. Revisit.
const MODEL = "gemini-3.5-flash";
const limited = limiter(5);

export function createGemini(apiKey: string): Gemini {
  const ai = new GoogleGenAI({ apiKey });
  const json = (prompt: string, timeoutMs: number, responseSchema?: object) =>
    limited(async () => {
      const res = await ai.models.generateContent({
        model: MODEL,
        contents: prompt,
        config: { abortSignal: AbortSignal.timeout(timeoutMs), responseMimeType: "application/json", responseSchema },
      });
      return JSON.parse(res.text ?? "null") as unknown;
    });
  return {
    // a bad model hangs ~60 s; templates fill in
    questions: async (prompt) => ((await json(prompt, 20_000, { type: Type.ARRAY, items: { type: Type.STRING } })) ?? []) as string[],
    // an 8k-char article takes ~10 s
    extract: (prompt) => json(prompt, 60_000),
  };
}
