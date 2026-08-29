import { APP_VERSION, DEFAULT_SYSTEM_PROMPT, MODEL_OPTIONS } from "./config.js";
import { createCorpus } from "./documents/corpus.js";
import { routeQuestion } from "./documents/routing.js";
import { createFileImporter } from "./documents/uploader.js";
import { createLanguageModelClient } from "./model/language-model.js";
import { createChatView } from "./ui/chat-view.js";
import "./styles.css";

const view = createChatView(document);
const corpus = createCorpus();
const model = createLanguageModelClient({ options: MODEL_OPTIONS });
let busy = false;
let availabilityState = null;
let dragDepth = 0;

function policyAllowsModel() {
  try {
    const policy = document.permissionsPolicy ?? document.featurePolicy;
    return policy && typeof policy.allowsFeature === "function"
      ? policy.allowsFeature("language-model")
      : null;
  } catch (error) {
    console.error("No se pudo consultar la política de permisos.", error);
    return null;
  }
}

function environment() {
  return {
    topLevel: self === top,
    secure: isSecureContext,
    origin: location.origin,
    api: model.isSupported(),
    policy: policyAllowsModel(),
    availability: availabilityState,
  };
}

function refreshDiagnostics() {
  view.setDiagnostics(environment());
}

function refreshDocuments(message = null, kind = "info") {
  view.renderAttachments(corpus.list(), (name) => {
    corpus.removeDocument(name);
    refreshDocuments();
  });
  view.updateDocumentStatus(corpus.summary(), message, kind);
}

function setUsage() {
  view.updateUsage(model.usage());
}

async function inspectModel() {
  refreshDiagnostics();
  if (!isSecureContext) {
    view.setStatus("red", "contexto no seguro");
    view.showSetup(
      "Abrí MicroChat desde un servidor local",
      "La Prompt API requiere localhost o HTTPS.",
    );
    return;
  }
  if (!model.isSupported()) {
    view.setStatus("red", "navegador sin Prompt API");
    view.showSetup(
      "Este Chrome no expone Gemini Nano",
      "Usá Chrome de escritorio 149 o superior y activá los flags indicados.",
      true,
    );
    return;
  }

  try {
    availabilityState = await model.availability();
    refreshDiagnostics();
    if (availabilityState === "available") {
      view.setStatus("green", "modelo disponible");
      view.elements.activateModel.disabled = false;
      view.elements.activateModel.textContent = "Activar Gemini Nano";
      view.showSetup("Gemini Nano está disponible", "Tocá el botón para crear la sesión local.");
    } else if (availabilityState === "downloadable" || availabilityState === "downloading") {
      view.setStatus("yellow", "modelo listo para descargar");
      view.elements.activateModel.disabled = false;
      view.elements.activateModel.textContent = "Descargar y activar Gemini Nano";
      view.showSetup("Chrome necesita preparar el modelo", "El botón inicia la descarga local.");
    } else {
      view.setStatus("orange", "modelo no disponible");
      view.elements.activateModel.disabled = true;
      view.elements.activateModel.textContent = "Gemini Nano no disponible";
      view.showSetup(
        "Este equipo todavía no puede usar Gemini Nano",
        "Revisá Chrome, hardware, flags y descarga.",
        true,
      );
    }
  } catch (error) {
    view.setStatus("red", "error al consultar el modelo");
    view.showSetup("No se pudo consultar Gemini Nano", `${error.name}: ${error.message}`, true);
    console.error(error);
  }
}

function beginSession(clearConversation = false) {
  if (busy) return;
  const systemPrompt = view.getSystemPrompt() || DEFAULT_SYSTEM_PROMPT;
  view.setBusy(true);
  view.elements.activateModel.disabled = true;
  view.elements.activateModel.textContent = "Activando Gemini Nano…";
  view.showSetup(
    "Activando Gemini Nano",
    "No cierres esta pestaña mientras Chrome prepara la sesión.",
  );

  model
    .create({
      systemPrompt,
      onDownloadProgress: (loaded) => {
        const percent = Math.round(loaded * 100);
        view.setStatus("yellow", `descargando Gemini Nano: ${percent}%`);
        view.elements.setupReason.textContent = `Descarga local del modelo (${percent}%).`;
      },
      onContextOverflow: () => {
        view.elements.usage.textContent =
          "El contexto llegó al límite y descartó mensajes antiguos.";
      },
    })
    .then((session) => {
      if (clearConversation) view.elements.chat.replaceChildren();
      if (Number.isFinite(session.contextWindow)) corpus.setFullPromptCap(session.contextWindow);
      view.setStatus("green", "conectado a Gemini Nano");
      view.showChat();
      view.setSystemPromptPending(false);
      view.addSystemNotice(`“${systemPrompt}”`);
      setUsage();
      refreshDiagnostics();
    })
    .catch((error) => {
      if (error.name === "AbortError") {
        view.setStatus("yellow", "activación cancelada");
        view.showSetup("Activación cancelada", "Podés volver a intentarlo cuando quieras.");
        return;
      }
      view.setStatus("red", "falló la sesión local");
      view.elements.activateModel.disabled = false;
      view.elements.activateModel.textContent = "Reintentar activación";
      view.showSetup("No se pudo crear la sesión", `${error.name}: ${error.message}`, true);
      console.error(error);
      refreshDiagnostics();
    })
    .finally(() => {
      view.setBusy(false);
      view.elements.newChat.disabled = !model.hasSession();
      if (model.hasSession()) view.elements.input.focus();
    });
}

async function runQuestion(question, mode) {
  if (busy || !model.hasSession()) return;
  busy = true;
  view.setBusy(true);
  const route = routeQuestion({ text: question, mode, corpus });
  const result = view.addAnswerBubble();
  try {
    if (route.kind === "no-match") {
      result.answer.textContent = route.message;
      view.addAnswerMeta(result.meta, {
        label: "sin coincidencias",
        onRetry: () => runQuestion(question, "full"),
      });
      return;
    }

    const response = await model.stream(route.prompt, {
      onChunk: (chunk) => {
        result.answer.append(chunk);
        view.elements.chat.scrollTop = view.elements.chat.scrollHeight;
      },
    });
    if (!result.answer.textContent) result.answer.textContent = response;
    view.addAnswerMeta(result.meta, {
      label: route.label,
      onRetry: route.kind === "general" ? null : () => runQuestion(question, "full"),
    });
  } catch (error) {
    result.answer.textContent =
      error.name === "AbortError"
        ? `${result.answer.textContent}\n\n(respuesta detenida)`
        : `⚠ Error: ${error.message}`;
    if (error.name !== "AbortError") console.error(error);
  } finally {
    busy = false;
    view.setBusy(false);
    setUsage();
    view.elements.input.focus();
  }
}

async function send() {
  const question = view.elements.input.value.trim();
  if (!question || busy || !model.hasSession()) return;
  view.elements.input.value = "";
  view.addBubble("user", question);
  await runQuestion(question, view.hasDocumentsEnabled() ? "documents" : "general");
}

function bindFileInput() {
  const importer = createFileImporter({
    corpus,
    onChanged: () => refreshDocuments(),
    onError: (message) => refreshDocuments(message, "error"),
  });
  view.elements.attachButton.addEventListener("click", () => view.elements.fileInput.click());
  view.elements.fileInput.addEventListener("change", async () => {
    await importer.handleFiles(view.elements.fileInput.files);
    view.elements.fileInput.value = "";
  });
  window.addEventListener("dragenter", (event) => {
    if (!Array.from(event.dataTransfer?.types ?? []).includes("Files")) return;
    event.preventDefault();
    dragDepth += 1;
    view.showDropOverlay(true);
  });
  window.addEventListener("dragover", (event) => event.preventDefault());
  window.addEventListener("dragleave", (event) => {
    event.preventDefault();
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) view.showDropOverlay(false);
  });
  window.addEventListener("drop", async (event) => {
    event.preventDefault();
    dragDepth = 0;
    view.showDropOverlay(false);
    if (event.dataTransfer?.files.length) await importer.handleFiles(event.dataTransfer.files);
  });
}

view.elements.version.textContent = `v${APP_VERSION}`;
view.elements.systemPrompt.value = DEFAULT_SYSTEM_PROMPT;
view.elements.systemPrompt.addEventListener("input", () => {
  if (!model.hasSession()) return;
  view.setSystemPromptPending(true);
});
view.elements.activateModel.addEventListener("click", () => beginSession());
view.elements.newChat.addEventListener("click", () => beginSession(true));
view.elements.send.addEventListener("click", send);
view.elements.stop.addEventListener("click", () => model.stop());
view.elements.input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    send();
  }
});
window.addEventListener("pagehide", () => model.destroy(), { once: true });

refreshDocuments();
bindFileInput();
inspectModel();
