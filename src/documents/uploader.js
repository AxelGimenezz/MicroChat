import { MAX_FILE_BYTES, TEXT_EXTENSIONS } from "../config.js";

function extensionOf(name) {
  const match = /\.([a-z0-9]+)$/i.exec(name);
  return match?.[1].toLowerCase() ?? "";
}

export function isSupportedTextFile(file) {
  const type = typeof file.type === "string" ? file.type : "";
  if (/\.pdf$/i.test(file.name) || type === "application/pdf") return false;
  return (
    TEXT_EXTENSIONS.has(extensionOf(file.name)) ||
    type.startsWith("text/") ||
    type === "application/json"
  );
}

export function formatFileSize(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

export async function readTextFile(file, maxBytes = MAX_FILE_BYTES) {
  const isPdf = /\.pdf$/i.test(file.name) || file.type === "application/pdf";
  if (isPdf) {
    throw new Error("PDF no soportado en esta versión. Usá un archivo de texto exportado.");
  }
  if (file.size > maxBytes) {
    throw new Error(
      `“${file.name}” pesa ${formatFileSize(file.size)}: el máximo es ${formatFileSize(maxBytes)}.`,
    );
  }
  if (!isSupportedTextFile(file)) {
    throw new Error(
      `“${file.name}” tiene un formato no soportado. Usá texto (.txt, .md, .csv, .json…).`,
    );
  }
  if (typeof file.text === "function") return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(`No se pudo leer “${file.name}”.`));
    reader.readAsText(file, "utf-8");
  });
}

/** Procesa una lista de archivos sin acoplarse al DOM. */
export function createFileImporter({ corpus, onChanged, onError }) {
  async function handleFiles(fileList) {
    for (const file of [...fileList]) {
      try {
        const text = await readTextFile(file);
        corpus.addDocument(file.name, text);
        onChanged?.();
      } catch (error) {
        onError?.(error instanceof Error ? error.message : String(error));
      }
    }
  }
  return { handleFiles };
}
