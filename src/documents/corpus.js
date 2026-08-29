import {
  CHUNK_OVERLAP_CHARS,
  DOCUMENT_RULES,
  MAX_CHUNK_CHARS,
  MAX_FULL_PROMPT_CHARS,
  TOP_K,
} from "../config.js";

const STOP_WORDS = new Set(
  "de la que el en y a los se del las un por con no una su para es al lo como mas o pero sus le ya este si porque esta entre cuando muy sin sobre tambien me hasta hay donde quien desde todo nos durante todos uno les ni contra otros ese eso ante ellos e esto mi antes algunos que unos yo otro otras otra el tan".split(
    " ",
  ),
);

function normalize(text) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function tokenize(text) {
  return normalize(text)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

function allowedErrors(token) {
  if (token.length <= 4) return 0;
  if (token.length <= 7) return 1;
  return 2;
}

function editDistanceAtMost(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return Infinity;

  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let row = 1; row <= a.length; row += 1) {
    const current = [row];
    let rowMinimum = row;
    for (let column = 1; column <= b.length; column += 1) {
      const cost = a[row - 1] === b[column - 1] ? 0 : 1;
      const value = Math.min(
        current[column - 1] + 1,
        previous[column] + 1,
        previous[column - 1] + cost,
      );
      current[column] = value;
      rowMinimum = Math.min(rowMinimum, value);
    }
    if (rowMinimum > max) return Infinity;
    previous = current;
  }
  return previous[b.length];
}

function tokenSimilarity(queryToken, indexedToken) {
  if (queryToken === indexedToken) return 1;
  const maxErrors = allowedErrors(queryToken);
  if (Math.abs(queryToken.length - indexedToken.length) > maxErrors) return 0;
  const distance = editDistanceAtMost(queryToken, indexedToken, maxErrors);
  return distance > maxErrors ? 0 : 1 - distance / Math.max(queryToken.length, indexedToken.length);
}

function splitLongBlock(block, maxChars, overlapChars) {
  const chunks = [];
  let start = 0;
  while (start < block.length) {
    let end = Math.min(start + maxChars, block.length);
    if (end < block.length) {
      const boundary = block.lastIndexOf(" ", end);
      if (boundary > start + maxChars * 0.5) end = boundary;
    }
    const value = block.slice(start, end).trim();
    if (value) chunks.push(value);
    if (end >= block.length) break;
    start = Math.max(end - overlapChars, start + 1);
  }
  return chunks;
}

function chunkText(text, source, maxChars, overlapChars) {
  const blocks = text
    .split(/\n\s*\n/)
    .map((block) => block.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const chunks = [];
  let pending = "";

  const flush = () => {
    if (!pending) return;
    chunks.push(...splitLongBlock(pending, maxChars, overlapChars));
    pending = "";
  };

  for (const block of blocks) {
    const candidate = pending ? `${pending} ${block}` : block;
    if (candidate.length <= maxChars) {
      pending = candidate;
    } else {
      flush();
      pending = block;
      if (pending.length > maxChars) flush();
    }
  }
  flush();
  return chunks.map((value) => ({ text: value, source }));
}

/**
 * Crea un corpus aislado y testeable para documentos en memoria.
 * @param {{maxChunkChars?: number, overlapChars?: number, maxFullPromptChars?: number}} options
 */
export function createCorpus(options = {}) {
  const maxChunkChars = options.maxChunkChars ?? MAX_CHUNK_CHARS;
  const overlapChars = options.overlapChars ?? CHUNK_OVERLAP_CHARS;
  let maxFullPromptChars = options.maxFullPromptChars ?? MAX_FULL_PROMPT_CHARS;
  const documents = [];
  let index = null;

  function invalidate() {
    index = null;
  }

  function addDocument(name, text) {
    if (typeof name !== "string" || !name.trim()) {
      throw new TypeError("Nombre de documento inválido.");
    }
    if (typeof text !== "string") {
      throw new TypeError(`Contenido inválido para “${name}”.`);
    }
    if (documents.some((document) => document.name === name)) {
      throw new Error(`Ya hay un documento llamado “${name}”. Renombralo y volvé a intentar.`);
    }
    const chunks = chunkText(text, name, maxChunkChars, overlapChars);
    documents.push({ name, chunks });
    invalidate();
    return chunks.length;
  }

  function removeDocument(name) {
    const documentIndex = documents.findIndex((document) => document.name === name);
    if (documentIndex < 0) return false;
    documents.splice(documentIndex, 1);
    invalidate();
    return true;
  }

  function buildIndex() {
    if (index) return index;
    const documentFrequency = new Map();
    const tokensByLength = new Map();
    const postings = new Map();
    let chunkCount = 0;

    documents.forEach((document, documentIndex) => {
      document.chunks.forEach((chunk, chunkIndex) => {
        chunkCount += 1;
        const key = `${documentIndex}:${chunkIndex}`;
        for (const token of new Set(tokenize(chunk.text))) {
          documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1);
          if (!tokensByLength.has(token.length)) tokensByLength.set(token.length, new Set());
          tokensByLength.get(token.length).add(token);
          if (!postings.has(token)) postings.set(token, new Set());
          postings.get(token).add(key);
        }
      });
    });

    index = { chunkCount, documentFrequency, tokensByLength, postings };
    return index;
  }

  function invalidateAndGetChunk(key) {
    const [documentIndex, chunkIndex] = key.split(":").map(Number);
    return documents[documentIndex]?.chunks[chunkIndex];
  }

  function inverseDocumentFrequency(token, builtIndex) {
    return (
      1 +
      Math.log((builtIndex.chunkCount + 1) / ((builtIndex.documentFrequency.get(token) ?? 0) + 1))
    );
  }

  function search(question, topK = TOP_K) {
    const allChunks = documents.flatMap((document) => document.chunks);
    if (!allChunks.length) return [];
    const builtIndex = buildIndex();
    const queryTokens = [...new Set(tokenize(question))];
    if (!queryTokens.length) return [];

    const weights = new Map(
      queryTokens.map((token) => [token, inverseDocumentFrequency(token, builtIndex)]),
    );
    const denominator = [...weights.values()].reduce((sum, weight) => sum + weight, 0);
    const bestPerChunk = new Map();

    for (const queryToken of queryTokens) {
      const errors = allowedErrors(queryToken);
      for (
        let length = Math.max(1, queryToken.length - errors);
        length <= queryToken.length + errors;
        length += 1
      ) {
        for (const indexedToken of builtIndex.tokensByLength.get(length) ?? []) {
          const similarity = tokenSimilarity(queryToken, indexedToken);
          if (similarity < 0.6) continue;
          for (const key of builtIndex.postings.get(indexedToken) ?? []) {
            if (!bestPerChunk.has(key)) bestPerChunk.set(key, new Map());
            const matches = bestPerChunk.get(key);
            if ((matches.get(queryToken) ?? 0) < similarity) matches.set(queryToken, similarity);
          }
        }
      }
    }

    return [...bestPerChunk.entries()]
      .map(([key, matches]) => {
        const chunk = invalidateAndGetChunk(key);
        let numerator = 0;
        let best = 0;
        for (const [token, similarity] of matches) {
          numerator += similarity * weights.get(token);
          best = Math.max(best, similarity);
        }
        return { ...chunk, score: numerator / denominator, best };
      })
      .sort((a, b) => b.score - a.score || b.best - a.best)
      .slice(0, topK);
  }

  function buildGroundedPrompt(question) {
    const matches = search(question);
    if (!matches.length) return { matches, prompt: null };
    const fragments = matches
      .map((chunk, index) => `[Fragmento ${index + 1} — ${chunk.source}] ${chunk.text}`)
      .join("\n\n");
    return {
      matches,
      prompt: `${DOCUMENT_RULES}\n\n<documentos>\n${fragments}\n</documentos>\n\nPREGUNTA: ${question}`,
    };
  }

  function buildFullPrompt(question) {
    const allChunks = documents.flatMap((document) => document.chunks);
    const selected = [];
    let characters = 0;
    for (const chunk of allChunks) {
      if (characters + chunk.text.length > maxFullPromptChars) break;
      selected.push(chunk);
      characters += chunk.text.length;
    }
    const fragments = selected
      .map((chunk, index) => `[Fragmento ${index + 1} — ${chunk.source}] ${chunk.text}`)
      .join("\n\n");
    const truncated = selected.length < allChunks.length;
    const note = truncated
      ? `\n\nAVISO: se incluyen ${selected.length} de ${allChunks.length} fragmentos por el límite de contexto.`
      : "";
    return {
      prompt: `${DOCUMENT_RULES}\n\n<documentos>\n${fragments}\n</documentos>\n\nINSTRUCCIONES: ${question}${note}`,
      selectedCount: selected.length,
      totalCount: allChunks.length,
      truncated,
    };
  }

  return {
    addDocument,
    removeDocument,
    clear: () => {
      documents.splice(0, documents.length);
      invalidate();
    },
    hasDocuments: () => documents.length > 0,
    list: () => documents.map(({ name, chunks }) => ({ name, paragraphs: chunks.length })),
    summary: () => ({
      documents: documents.length,
      paragraphs: documents.reduce((sum, document) => sum + document.chunks.length, 0),
    }),
    search,
    buildGroundedPrompt,
    buildFullPrompt,
    setFullPromptCap: (tokens) => {
      maxFullPromptChars = Math.min(
        Math.max(Math.round(Math.max(tokens, 2000) * 3.2), MAX_FULL_PROMPT_CHARS),
        60000,
      );
    },
  };
}
