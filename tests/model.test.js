import assert from "node:assert/strict";
import test from "node:test";
import { createLanguageModelClient } from "../src/model/language-model.js";

class FakeSession extends EventTarget {
  contextUsage = 12;
  contextWindow = 100;
  destroyed = false;

  async *promptStreaming() {
    yield "pri";
    yield "mera";
  }

  destroy() {
    this.destroyed = true;
  }
}

test("el cliente adapta disponibilidad, creación, streaming y uso de contexto", async () => {
  const session = new FakeSession();
  const api = {
    availability: async () => "readily",
    create: async () => session,
  };
  const client = createLanguageModelClient({ api });
  assert.equal(await client.availability(), "available");
  const created = await client.create({ systemPrompt: "Sos breve" });
  assert.equal(created, session);
  const chunks = [];
  assert.equal(await client.stream("hola", { onChunk: (chunk) => chunks.push(chunk) }), "primera");
  assert.deepEqual(chunks, ["pri", "mera"]);
  assert.deepEqual(client.usage(), { used: 12, limit: 100, percentage: 12 });
  client.destroy();
  assert.equal(session.destroyed, true);
  assert.equal(client.hasSession(), false);
});

test("el cliente informa cuando la Prompt API no existe", async () => {
  const client = createLanguageModelClient({ api: undefined });
  assert.equal(client.isSupported(), false);
  assert.equal(await client.availability(), "unavailable");
});

test("el cliente expone overflow, aborta el streaming y muestra errores de creación", async () => {
  let overflow = 0;
  let rejectStream;
  const session = new (class extends FakeSession {
    promptStreaming(_prompt, { signal }) {
      return (async function* stream() {
        await new Promise((resolve, reject) => {
          rejectStream = reject;
          signal.addEventListener(
            "abort",
            () => reject(new DOMException("detenido", "AbortError")),
            {
              once: true,
            },
          );
        });
        yield "nunca";
      })();
    }
  })();
  const client = createLanguageModelClient({
    api: { availability: async () => "no", create: async () => session },
  });
  await client.create({ onContextOverflow: () => (overflow += 1) });
  session.dispatchEvent(new Event("contextoverflow"));
  assert.equal(overflow, 1);
  const pending = client.stream("hola");
  client.stop();
  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(typeof rejectStream, "function");
  client.destroy();

  const failing = createLanguageModelClient({
    api: {
      availability: async () => "no",
      create: async () => {
        throw new Error("fallo");
      },
    },
  });
  await assert.rejects(() => failing.create({ systemPrompt: "x" }), /fallo/);
});
