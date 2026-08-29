export function createChatView(document) {
  const elements = {
    dot: document.querySelector("#status-dot"),
    version: document.querySelector("#version"),
    statusText: document.querySelector("#status-text"),
    newChat: document.querySelector("#new-chat"),
    systemPrompt: document.querySelector("#sysprompt"),
    systemHint: document.querySelector("#system-hint"),
    setupPanel: document.querySelector("#setup-panel"),
    setupTitle: document.querySelector("#setup-title"),
    setupReason: document.querySelector("#setup-reason"),
    setupHelp: document.querySelector("#setup-help"),
    activateModel: document.querySelector("#activate-model"),
    diagnostics: document.querySelector("#environment-diagnostics"),
    chat: document.querySelector("#chat"),
    composerWrap: document.querySelector("#composer-wrap"),
    docsToggle: document.querySelector("#docs-toggle"),
    docStatus: document.querySelector("#doc-status"),
    attachments: document.querySelector("#attachments"),
    attachButton: document.querySelector("#attach-btn"),
    fileInput: document.querySelector("#file-input"),
    dropOverlay: document.querySelector("#drop-overlay"),
    input: document.querySelector("#input"),
    send: document.querySelector("#send"),
    stop: document.querySelector("#stop"),
    usage: document.querySelector("#usage"),
  };

  function setStatus(statusClass, text) {
    elements.dot.className = `dot ${statusClass}`;
    elements.statusText.textContent = text;
  }

  function showSetup(title, reason, showHelp = false) {
    elements.setupTitle.textContent = title;
    elements.setupReason.textContent = reason;
    elements.setupHelp.hidden = !showHelp;
    elements.setupPanel.hidden = false;
    elements.chat.hidden = true;
    elements.composerWrap.hidden = true;
  }

  function showChat() {
    elements.setupPanel.hidden = true;
    elements.chat.hidden = false;
    elements.composerWrap.hidden = false;
    elements.input.disabled = false;
    elements.send.disabled = false;
    elements.newChat.disabled = false;
    elements.input.focus();
  }

  function setBusy(busy) {
    elements.input.disabled = busy;
    elements.send.disabled = busy;
    elements.newChat.disabled = busy;
    elements.stop.hidden = !busy;
    elements.stop.disabled = !busy;
  }

  function addSystemNotice(text) {
    const notice = document.createElement("div");
    notice.className = "sysnotice";
    notice.textContent = `System prompt: ${text}`;
    elements.chat.append(notice);
    elements.chat.scrollTop = elements.chat.scrollHeight;
  }

  function addBubble(className, text) {
    const bubble = document.createElement("div");
    bubble.className = `bubble ${className}`;
    bubble.textContent = text;
    elements.chat.append(bubble);
    elements.chat.scrollTop = elements.chat.scrollHeight;
    return bubble;
  }

  function addAnswerBubble() {
    const bubble = document.createElement("div");
    bubble.className = "bubble nano";
    const speaker = document.createElement("span");
    speaker.className = "speaker";
    speaker.textContent = "MicroChat";
    const answer = document.createElement("div");
    answer.className = "bubble-answer";
    const meta = document.createElement("div");
    meta.className = "bubble-meta";
    bubble.append(speaker, answer, meta);
    elements.chat.append(bubble);
    elements.chat.scrollTop = elements.chat.scrollHeight;
    return { answer, meta };
  }

  function addAnswerMeta(meta, { label, onRetry } = {}) {
    if (label) {
      const labelElement = document.createElement("span");
      labelElement.className = "meta-label";
      labelElement.textContent = label;
      meta.append(labelElement);
    }
    if (onRetry) {
      const retry = document.createElement("button");
      retry.type = "button";
      retry.className = "retry";
      retry.textContent = "↻ Consultar documento completo";
      retry.addEventListener("click", () => {
        retry.disabled = true;
        retry.textContent = "Consultando…";
        onRetry();
      });
      meta.append(retry);
    }
  }

  function renderAttachments(documents, onRemove) {
    elements.attachments.replaceChildren();
    for (const documentInfo of documents) {
      const chip = document.createElement("span");
      chip.className = "chip";
      const name = document.createElement("span");
      name.className = "chip-name";
      name.textContent = documentInfo.name;
      name.title = `${documentInfo.name} — ${documentInfo.paragraphs} fragmentos`;
      const size = document.createElement("span");
      size.className = "chip-size";
      size.textContent = `${documentInfo.paragraphs} fr.`;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "✕";
      remove.title = `Quitar ${documentInfo.name}`;
      remove.setAttribute("aria-label", `Quitar ${documentInfo.name}`);
      remove.addEventListener("click", () => onRemove(documentInfo.name));
      chip.append(name, size, remove);
      elements.attachments.append(chip);
    }
  }

  function updateDocumentStatus(summary, message = null, kind = "info") {
    if (message) {
      elements.docStatus.style.color = kind === "error" ? "var(--red)" : "var(--muted)";
      elements.docStatus.textContent = message;
      return;
    }
    elements.docStatus.style.color = summary.documents ? "var(--green)" : "var(--muted)";
    elements.docStatus.textContent = summary.documents
      ? `✓ ${summary.documents} documento(s) · ${summary.paragraphs} fragmentos`
      : "sin documentos — adjuntá archivos de texto con 📎 o arrastralos acá";
  }

  function updateUsage(usage) {
    if (!usage) {
      elements.usage.textContent = "";
      return;
    }
    elements.usage.textContent = `contexto usado: ${usage.used} / ${usage.limit} tokens (${usage.percentage}%)`;
  }

  function setSystemPromptPending(pending) {
    elements.systemHint.textContent = pending
      ? "Cambio pendiente: aplicalo con Nueva conversación."
      : "Se usa al crear la sesión local.";
    elements.systemHint.classList.toggle("pending", pending);
  }

  function setDiagnostics(value) {
    elements.diagnostics.textContent = JSON.stringify(value, null, 2);
  }

  return {
    elements,
    setStatus,
    showSetup,
    showChat,
    setBusy,
    addSystemNotice,
    addBubble,
    addAnswerBubble,
    addAnswerMeta,
    renderAttachments,
    updateDocumentStatus,
    updateUsage,
    setSystemPromptPending,
    setDiagnostics,
    getSystemPrompt: () => elements.systemPrompt.value.trim(),
    hasDocumentsEnabled: () => elements.docsToggle.checked,
    showDropOverlay: (visible) => {
      elements.dropOverlay.hidden = !visible;
    },
  };
}
