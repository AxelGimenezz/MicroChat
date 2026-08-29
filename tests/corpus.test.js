import assert from "node:assert/strict";
import test from "node:test";
import { createCorpus } from "../src/documents/corpus.js";

test("el corpus conserva documentos, valida duplicados y fragmenta textos largos", () => {
  const corpus = createCorpus({ maxChunkChars: 120, overlapChars: 20 });
  const count = corpus.addDocument(
    "notas.txt",
    "Línea breve.\n\n" +
      "Texto largo con información suficiente para probar la fragmentación. ".repeat(8),
  );
  assert.ok(count > 1);
  assert.deepEqual(corpus.summary(), { documents: 1, paragraphs: count });
  assert.throws(() => corpus.addDocument("notas.txt", "otro texto"), /Ya hay un documento/);
  assert.throws(() => corpus.addDocument("", "texto"), /Nombre de documento/);
  assert.ok(corpus.list()[0].paragraphs > 1);
});

test("la búsqueda fuzzy tolera typos y no inventa coincidencias", () => {
  const corpus = createCorpus();
  corpus.addDocument(
    "novela.txt",
    [
      "Rocinante era el caballo flaco de don Quijote y acompañaba sus aventuras.",
      "Las aspas de los molinos de viento parecían gigantes en la distancia.",
      "Las crónicas espaciales hablan de estrellas lejanas y viajes interplanetarios.",
    ].join("\n\n"),
  );
  assert.match(corpus.search("¿rozinante era un caballo?")[0].text, /Rocinante/);
  assert.match(corpus.search("molinos de viento")[0].text, /molinos/);
  assert.deepEqual(corpus.search("astronautas marcianos inexistentes"), []);
});

test("el prompt completo respeta el límite y el corpus se puede vaciar", () => {
  const corpus = createCorpus({ maxFullPromptChars: 100 });
  corpus.addDocument(
    "datos.txt",
    "Este párrafo contiene datos suficientes para ser incluido.\n\nOtro párrafo también tiene datos suficientes para la prueba.",
  );
  const full = corpus.buildFullPrompt("resumí");
  assert.equal(full.truncated, true);
  assert.ok(full.selectedCount < full.totalCount);
  corpus.clear();
  assert.equal(corpus.hasDocuments(), false);
});
