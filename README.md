# MicroChat

Desde mayo de 2026 empezó a circular con fuerza la noticia de que Google Chrome podía descargar en algunos equipos un modelo local de varios gigabytes. En distintas publicaciones y foros se discutieron formas de quitarlo; a mí me interesaba explorar qué usos podía tener esa capacidad, por eso desarrollé esta pequeña herramienta como aviso y experimento preliminar. Gemini Nano no está disponible en todas las PCs, no siempre corresponde al mismo modelo y su tamaño puede variar según el equipo, la versión de Chrome y las actualizaciones. Para conocer los requisitos y el funcionamiento documentado, consultá la [documentación oficial de Chrome for Developers sobre Built-in AI](https://developer.chrome.com/docs/ai/get-started).

Chat privado en español con Gemini Nano. El modelo corre en Chrome y los documentos se procesan sólo en la pestaña; esta versión acepta archivos de texto (`.txt`, `.md`, `.csv`, `.tsv`, `.json`, `.log`, `.xml`, `.srt` y `.vtt`). PDF queda fuera del alcance actual.

## Usarlo localmente

Necesitás [Node.js 24 LTS](https://nodejs.org/en/download/) y Chrome de escritorio 149 o superior.

```bash
npm install
npm start
```

Abrí la URL que muestra Vite (normalmente `http://127.0.0.1:5173/`). Chrome puede ya tener un modelo compatible instalado o necesitar descargarlo. Si todavía no está disponible, la primera activación de MicroChat puede iniciar esa descarga administrada por Chrome; la aplicación no descarga ni incluye el modelo. En ese caso, activá en Chrome:

1. `chrome://flags/#prompt-api-for-gemini-nano` → **Enabled**.
2. `chrome://flags/#optimization-guide-on-device-model` → **Enabled**.
3. Reiniciá Chrome y revisá el progreso en `chrome://on-device-internals`.

El botón de activación muestra si el modelo ya está disponible, descargándose o no es compatible con el equipo. La [documentación de Chrome](https://developer.chrome.com/docs/ai/get-started) detalla los requisitos de almacenamiento, memoria y sistema operativo.
También podés consultar directamente la [Prompt API](https://developer.chrome.com/docs/ai/prompt-api), que es la interfaz que utiliza MicroChat.

## Desarrollo y GitHub Pages

```bash
npm run dev       # servidor de desarrollo
npm run check     # lint, formato, tests y build
npm run build     # genera dist/ (no se versiona)
npm run preview   # previsualiza el build
```

El workflow de GitHub Pages publica automáticamente `dist/` al hacer push a `main`. La aplicación es estática: no requiere API, servidor propio ni variables secretas.

## Privacidad

La página se descarga por red y, si Chrome lo necesita, también puede descargar el modelo. Después de eso, MicroChat no envía preguntas, respuestas ni documentos a un servidor: todo queda en memoria dentro de la pestaña. No hay analytics, polling, endpoints de autopilot ni llamadas a APIs externas.

## Estructura

```text
src/
├── index.html
├── styles.css
├── main.js
├── config.js
├── documents/   # corpus, búsqueda, routing e importación de texto
├── model/       # adaptador de la Prompt API
└── ui/          # vista y eventos visuales
tests/           # pruebas unitarias sin navegador ni modelo real
```

## Licencias y marcas

Este repositorio no incluye una licencia de uso: el código propio queda reservado y todos los
derechos permanecen con su autor. `package.json` declara `UNLICENSED` y no se distribuye un
archivo `LICENSE`.

Google, Chrome y Gemini Nano son marcas o servicios de Google. MicroChat no está afiliado,
patrocinado ni respaldado por Google. La aplicación no incluye ni redistribuye el modelo: sólo
utiliza la Prompt API disponible en Chrome, por lo que cada persona debe contar con un navegador
compatible y aceptar los [Términos de Google](https://policies.google.com/terms).

La documentación de Chrome está publicada, salvo indicación contraria, bajo [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), y sus ejemplos de código bajo [Apache 2.0](https://www.apache.org/licenses/LICENSE-2.0). Esas condiciones corresponden a la documentación y a los ejemplos copiados; no obligan a este repositorio a adoptar una de esas licencias. No se agrega una licencia de Google ni del modelo Gemini Nano.
