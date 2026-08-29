import assert from "node:assert/strict";
import test from "node:test";
import { createCorpus } from "../src/documents/corpus.js";
import {
  createFileImporter,
  isSupportedTextFile,
  readTextFile,
} from "../src/documents/uploader.js";

function file(name, text, type = "text/plain") {
  return { name, type, size: Buffer.byteLength(text), text: async () => text };
}

test("el importador acepta texto y rechaza PDF", async () => {
  assert.equal(isSupportedTextFile(file("nota.md", "hola")), true);
  assert.equal(isSupportedTextFile(file("scan.pdf", "x", "application/pdf")), false);
  await assert.rejects(
    () => readTextFile(file("scan.pdf", "x", "application/pdf")),
    /PDF no soportado/,
  );
});

test("el importador registra errores sin detener los archivos siguientes", async () => {
  const corpus = createCorpus();
  const errors = [];
  const importer = createFileImporter({ corpus, onError: (message) => errors.push(message) });
  await importer.handleFiles([
    file("nota.txt", "Un texto suficientemente largo para el corpus."),
    file("archivo.bin", "bin", "application/octet-stream"),
  ]);
  assert.equal(corpus.summary().documents, 1);
  assert.equal(errors.length, 1);
});

test("el lector aplica el límite y el corpus rechaza duplicados", async () => {
  await assert.rejects(() => readTextFile(file("grande.txt", "123456"), 5), /máximo es/);
  const corpus = createCorpus();
  const importer = createFileImporter({ corpus, onError: () => {} });
  await importer.handleFiles([file("nota.txt", "uno"), file("nota.txt", "dos")]);
  assert.equal(corpus.summary().documents, 1);
});
