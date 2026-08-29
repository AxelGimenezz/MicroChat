import { MODEL_OPTIONS } from "../config.js";

function normalizeAvailability(value) {
  return value === "readily"
    ? "available"
    : value === "after-download"
      ? "downloadable"
      : value === "no"
        ? "unavailable"
        : value;
}

/**
 * Adaptador pequeño y testeable para la Prompt API de Chrome.
 * @param {{api?: object, options?: object}} dependencies
 */
export function createLanguageModelClient({
  api = globalThis.LanguageModel,
  options = MODEL_OPTIONS,
} = {}) {
  let session = null;
  let createController = null;
  let promptController = null;

  async function availability() {
    if (!api?.availability) return "unavailable";
    return normalizeAvailability(await api.availability(options));
  }

  function create({ systemPrompt, onDownloadProgress, onContextOverflow } = {}) {
    if (!api?.create) return Promise.reject(new Error("Este navegador no expone la Prompt API."));
    destroy();
    createController = new AbortController();
    const controller = createController;
    let pending;
    try {
      pending = api.create({
        ...options,
        initialPrompts: [{ role: "system", content: systemPrompt }],
        signal: controller.signal,
        monitor(monitor) {
          monitor?.addEventListener?.("downloadprogress", (event) => {
            onDownloadProgress?.(event.loaded);
          });
        },
      });
    } catch (error) {
      pending = Promise.reject(error);
    }

    return Promise.resolve(pending).then((createdSession) => {
      if (createController !== controller) {
        createdSession.destroy?.();
        throw new DOMException("La creación de la sesión fue cancelada.", "AbortError");
      }
      session = createdSession;
      createController = null;
      if (typeof session.addEventListener === "function") {
        session.addEventListener("contextoverflow", () => onContextOverflow?.());
      }
      return session;
    });
  }

  async function stream(prompt, { signal, onChunk } = {}) {
    if (!session) throw new Error("No hay una sesión activa.");
    promptController = new AbortController();
    const controller = promptController;
    const streamOptions = { signal: signal ?? controller.signal };
    let full = "";
    try {
      const streamResult = session.promptStreaming(prompt, streamOptions);
      for await (const chunk of streamResult) {
        full += chunk;
        onChunk?.(chunk);
      }
      return full.trim() || "(respuesta vacía)";
    } finally {
      if (promptController === controller) promptController = null;
    }
  }

  function stop() {
    promptController?.abort();
  }

  function destroy() {
    promptController?.abort();
    createController?.abort();
    promptController = null;
    createController = null;
    session?.destroy?.();
    session = null;
  }

  function usage() {
    if (
      !session ||
      !Number.isFinite(session.contextUsage) ||
      !Number.isFinite(session.contextWindow)
    ) {
      return null;
    }
    const used = session.contextUsage;
    const limit = session.contextWindow;
    return { used, limit, percentage: Math.round((used / limit) * 100) };
  }

  return {
    availability,
    create,
    stream,
    stop,
    destroy,
    usage,
    hasSession: () => Boolean(session),
    isSupported: () => Boolean(api?.availability && api?.create),
  };
}
