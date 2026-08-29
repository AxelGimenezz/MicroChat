/**
 * Decide el origen de una respuesta sin invocar al modelo.
 * @param {{text: string, mode?: "general"|"documents"|"full", corpus: ReturnType<import("./corpus.js").createCorpus>}} input
 */
export function routeQuestion({ text, mode = "general", corpus }) {
  const question = text.trim();
  if (!question) return { kind: "general", prompt: "" };

  if (question.toUpperCase().startsWith("COMPLETA:")) {
    const cleanQuestion = question.slice("COMPLETA:".length).trim();
    if (!corpus.hasDocuments()) return { kind: "general", prompt: cleanQuestion };
    const full = corpus.buildFullPrompt(cleanQuestion);
    return { kind: "full", ...full, label: "documento completo" };
  }

  if (mode === "full" && corpus.hasDocuments()) {
    const full = corpus.buildFullPrompt(question);
    return { kind: "full", ...full, label: "documento completo" };
  }
  if (mode !== "documents" || !corpus.hasDocuments()) {
    return { kind: "general", prompt: question };
  }

  const grounded = corpus.buildGroundedPrompt(question);
  if (!grounded.matches.length) {
    return {
      kind: "no-match",
      message: "No encontré información relevante en los documentos cargados.",
    };
  }
  return {
    kind: "grounded",
    prompt: grounded.prompt,
    matchCount: grounded.matches.length,
    label: `${grounded.matches.length} fragmentos`,
  };
}
