import assert from "node:assert/strict";
import test from "node:test";
import { createCorpus } from "../src/documents/corpus.js";
import { routeQuestion } from "../src/documents/routing.js";

function fixture() {
  const corpus = createCorpus();
  corpus.addDocument(
    "contrato.txt",
    "El alquiler mensual vence el quinto día de cada mes y se paga por adelantado.",
  );
  return corpus;
}

test("el routing explícito separa respuesta general, documentos y documento completo", () => {
  const corpus = fixture();
  assert.equal(routeQuestion({ text: "hola", mode: "general", corpus }).kind, "general");
  assert.equal(
    routeQuestion({ text: "¿cuándo vence?", mode: "documents", corpus }).kind,
    "grounded",
  );
  assert.equal(
    routeQuestion({ text: "COMPLETA: resumí todo", mode: "general", corpus }).kind,
    "full",
  );
});

test("una pregunta sin coincidencias no llama al modelo", () => {
  const route = routeQuestion({
    text: "¿qué dice sobre astronautas?",
    mode: "documents",
    corpus: fixture(),
  });
  assert.deepEqual(route, {
    kind: "no-match",
    message: "No encontré información relevante en los documentos cargados.",
  });
});

test("sin documentos COMPLETA vuelve al modo general", () => {
  const route = routeQuestion({
    text: "COMPLETA: escribí una idea",
    mode: "documents",
    corpus: createCorpus(),
  });
  assert.deepEqual(route, { kind: "general", prompt: "escribí una idea" });
});

test("el modo completo informa truncamiento por contexto", () => {
  const corpus = createCorpus({ maxFullPromptChars: 20 });
  corpus.addDocument("largo.txt", "Este texto supera el límite pequeño.\n\nOtro bloque.");
  const route = routeQuestion({ text: "resumí", mode: "full", corpus });
  assert.equal(route.kind, "full");
  assert.equal(route.truncated, true);
  assert.ok(route.selectedCount < route.totalCount);
});
