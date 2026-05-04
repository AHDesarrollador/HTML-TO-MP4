# React → MP4

Convierte proyectos React (animaciones, presentaciones, demos) a archivos MP4 sin grabar la pantalla manualmente. Disponible como aplicación de escritorio (Electron, Windows) y como CLI de Node.js.

---

## Tabla de contenidos

1. [Requisitos previos](#1-requisitos-previos)
2. [Instalación desde GitHub](#2-instalación-desde-github)
3. [Modo desarrollo (sin empaquetar)](#3-modo-desarrollo-sin-empaquetar)
4. [Generar el instalador de Windows](#4-generar-el-instalador-de-windows)
5. [Uso — aplicación de escritorio](#5-uso--aplicación-de-escritorio)
6. [Uso — CLI](#6-uso--cli)
7. [Opciones de conversión](#7-opciones-de-conversión)
8. [Compatibilidad con proyectos de entrada](#8-compatibilidad-con-proyectos-de-entrada)
9. [Arquitectura interna](#9-arquitectura-interna)
10. [Estructura de archivos](#10-estructura-de-archivos)
11. [Scripts NPM](#11-scripts-npm)
12. [Limitaciones conocidas](#12-limitaciones-conocidas)

---

## 1. Requisitos previos

| Herramienta | Versión mínima | Para qué se necesita |
|---|---|---|
| Node.js | 18 LTS | Ejecutar la app en modo dev y el CLI |
| npm | 9 | Instalar dependencias |
| Git | cualquiera | Clonar el repositorio |
| Windows 10/11 x64 | — | El instalador empaquetado solo soporta Windows x64 |

> FFmpeg está incluido en la aplicación (`ffmpeg-static`). No necesitas instalarlo por separado.

---

## 2. Instalación desde GitHub

```bash
# 1. Clonar el repositorio
git clone https://github.com/<tu-usuario>/react-to-mp4.git
cd react-to-mp4

# 2. Instalar dependencias
npm install
```

Eso es todo. No hay variables de entorno requeridas ni pasos extra.

---

## 3. Modo desarrollo (sin empaquetar)

Ejecuta la app Electron directamente desde el código fuente con recarga en caliente:

```bash
npm run dev
```

Se abre la ventana de la aplicación. Los cambios en el código fuente (`src/`) recargan automáticamente la interfaz (renderer). Los cambios en el proceso principal (`src/main/`) requieren reiniciar el comando.

---

## 4. Generar el instalador de Windows

```bash
npm run package
```

Este comando:
1. Compila todo el código TypeScript con `electron-vite build` → carpeta `out/`
2. Empaqueta la app con `electron-builder` → carpeta `dist-electron/`

El resultado es un instalador NSIS en `dist-electron/`:

```
dist-electron/
  React to MP4 Setup 1.0.0.exe   ← instalador con asistente
```

El instalador permite elegir la carpeta de destino, crea acceso directo en el escritorio y en el menú Inicio.

**Para instalar:** ejecutar `React to MP4 Setup 1.0.0.exe` y seguir el asistente.

---

## 5. Uso — aplicación de escritorio

La ventana tiene dos pestañas: **Conversión** y **Cola Batch**.

### Pestaña "Conversión" (un solo proyecto)

1. Hacer clic en **Explorar** junto a "Proyecto React (carpeta)" y seleccionar la carpeta raíz del proyecto a convertir.
2. Hacer clic en **Explorar** junto a "Carpeta de salida" y elegir dónde guardar el MP4.
3. Configurar las **Opciones de exportación** (ver sección 7).
4. Hacer clic en **Convertir a MP4**.
5. La barra de progreso muestra tres fases: `building` → `capturing` → `encoding`.
6. Al terminar aparece el mensaje "Video exportado correctamente." con un botón **Nuevo** para reiniciar.
7. Si ocurre un error, se muestra el mensaje completo con el botón **Reintentar**.

Para **cancelar** durante la conversión: hacer clic en el botón **Cancelar** (rojo).

### Pestaña "Cola Batch" (múltiples proyectos)

1. Configurar las **Opciones de exportación** que se aplicarán a todos los proyectos nuevos.
2. Hacer clic en **+ Agregar proyecto**:
   - Primer diálogo: seleccionar la carpeta del proyecto React.
   - Segundo diálogo: seleccionar la carpeta de salida para ese proyecto.
3. Repetir el paso 2 para cada proyecto.
4. Hacer clic en **Iniciar cola** para procesar todos los trabajos en orden FIFO (uno a la vez).
5. Cada trabajo muestra su estado: `pending` → `in_progress` → `completed` / `failed`.
6. Hacer clic en **Detener cola** para pausar después del trabajo actual.
7. Una vez que todos terminan, hacer clic en **Limpiar** para quitar los trabajos completados.

---

## 6. Uso — CLI

El CLI se llama `r2mp4`. En desarrollo, ejecutarlo con:

```bash
npx ts-node src/cli.ts <comando> [opciones]
```

Si lo instalas globalmente desde el paquete compilado:

```bash
npm run build
npm link
r2mp4 <comando> [opciones]
```

### Comando `convert` — un solo proyecto

```bash
r2mp4 convert -i <ruta-proyecto> -o <ruta-salida> [opciones]
```

| Flag | Alias | Tipo | Valor por defecto | Descripción |
|---|---|---|---|---|
| `--input` | `-i` | string | *requerido* | Ruta a la carpeta raíz del proyecto React |
| `--output` | `-o` | string | *requerido* | Carpeta donde se guardará el MP4 |
| `--width` | `-w` | número | `1920` | Ancho del video en píxeles |
| `--height` | `-h` | número | `1080` | Alto del video en píxeles |
| `--fps` | `-f` | número | `30` | Fotogramas por segundo |
| `--duration` | `-d` | número | `5` | Duración a capturar en segundos |
| `--name` | `-n` | string | `output.mp4` | Nombre del archivo de salida |

Ejemplo:

```bash
r2mp4 convert -i ./mi-animacion -o ./videos -w 1280 -h 720 -f 30 -d 10 -n demo.mp4
```

### Comando `batch` — múltiples proyectos desde JSON

```bash
r2mp4 batch -b <ruta-archivo-json>
```

El archivo JSON debe ser un array de objetos con esta estructura:

```json
[
  {
    "id": "job-1",
    "inputPath": "/ruta/absoluta/proyecto-a",
    "outputPath": "/ruta/absoluta/videos",
    "options": {
      "width": 1920,
      "height": 1080,
      "fps": 30,
      "duration": 5,
      "outputName": "animacion-a.mp4"
    },
    "status": "pending",
    "progress": 0
  },
  {
    "id": "job-2",
    "inputPath": "/ruta/absoluta/proyecto-b",
    "outputPath": "/ruta/absoluta/videos",
    "options": {
      "width": 1280,
      "height": 720,
      "fps": 24,
      "duration": 8,
      "outputName": "animacion-b.mp4"
    },
    "status": "pending",
    "progress": 0
  }
]
```

Los campos `id`, `status` y `progress` son obligatorios por el tipo `ConversionJob` pero el CLI los ignora (siempre empieza desde cero). Puedes poner cualquier valor.

---

## 7. Opciones de conversión

| Opción | Valores posibles | Por defecto | Descripción |
|---|---|---|---|
| Ancho | 1 – sin límite px | `1920` | Ancho del video en píxeles |
| Alto | 1 – sin límite px | `1080` | Alto del video en píxeles |
| FPS | 24, 30, 60 (GUI) / cualquier número (CLI) | `30` | Fotogramas por segundo |
| Duración | 1 – 300 segundos (GUI) / cualquier número (CLI) | `5` | Cuántos segundos de la animación capturar |
| Nombre de archivo | cualquier string | `output.mp4` | Nombre del MP4 resultante |

**Presets rápidos disponibles en la GUI:**

| Preset | Resolución | FPS |
|---|---|---|
| 1080p 30fps | 1920 × 1080 | 30 |
| 720p 30fps | 1280 × 720 | 30 |
| 4K 24fps | 3840 × 2160 | 24 |

**Configuración del codec:** el video se codifica siempre con H.264 (`libx264`), espacio de color `yuv420p`, preset `fast`, CRF 18 (alta calidad). No es configurable desde la UI.

---

## 8. Compatibilidad con proyectos de entrada

La app detecta automáticamente el tipo de proyecto:

### Caso A — Proyecto Remotion

**Condición de detección:** el `package.json` del proyecto contiene `remotion` o cualquier paquete `@remotion/*` en `dependencies` o `devDependencies`.

**Proceso:**
1. Ejecuta `npm install` en el proyecto.
2. Lista las composiciones disponibles con `npx remotion compositions`.
3. Renderiza la primera composición encontrada con `npx remotion render <composicionId> <salida.mp4> --overwrite`.

El render lo hace Remotion directamente; la app no captura frames ni usa FFmpeg.

### Caso B — Proyecto React estándar (con script `build`)

**Condición:** el `package.json` tiene un script `build`.

**Proceso:**
1. Ejecuta `npm install` y `npm run build`.
2. Si el build falla y hay un archivo `vite.config.*`, reintenta con `npx vite build` (omite errores de TypeScript).
3. Sirve la carpeta `dist/` con Express en un puerto libre (≥40000).
4. Captura frames usando `BrowserWindow.webContents.capturePage()` de Electron.
5. Codifica los frames PNG con FFmpeg.

### Caso C — Proyecto sin script `build`

**Condición:** el `package.json` no tiene script `build`, o no hay `package.json`.

**Proceso:**
- Si existe `dist/`: sirve esa carpeta directamente.
- Si no existe `dist/`: sirve la carpeta raíz del proyecto directamente.
- Requiere que exista un `index.html` en la carpeta raíz.

---

## 9. Arquitectura interna

```
src/
├── main/               # Proceso principal de Electron (Node.js)
│   ├── index.ts        # Punto de entrada: crea la ventana y registra IPC
│   ├── ipc.ts          # Handlers IPC: dialogo, convert:start/cancel, batch:add/start/stop/clear
│   ├── builder.ts      # Detecta tipo de proyecto, ejecuta npm install/build, sirve con Express
│   ├── capturer.ts     # Crea BrowserWindow offscreen y captura frames PNG
│   ├── encoder.ts      # Codifica frames PNG a MP4 con FFmpeg (fluent-ffmpeg)
│   ├── remotion.ts     # Detecta proyectos Remotion, lista composiciones, ejecuta npx remotion render
│   ├── queue.ts        # Cola FIFO de trabajos (EventEmitter), procesa uno a la vez
│   └── types.ts        # Tipos compartidos: ConversionOptions, ConversionJob, ProgressData
├── preload/
│   └── index.ts        # Bridge seguro entre renderer y main via contextBridge
├── renderer/
│   └── src/
│       ├── App.tsx                      # Layout principal con tabs
│       ├── ipc.ts                       # Wrapper tipado del objeto window.api
│       ├── components/
│       │   ├── SingleTab.tsx            # UI de conversión individual
│       │   ├── BatchTab.tsx             # UI de cola batch
│       │   ├── OptionsPanel.tsx         # Panel de opciones (resolución, FPS, duración, nombre)
│       │   ├── ProgressBar.tsx          # Barra de progreso con fase y porcentaje
│       │   └── JobItem.tsx              # Fila de trabajo en la cola batch
│       └── hooks/
│           ├── useConversion.ts         # Estado y lógica de conversión individual
│           └── useBatchQueue.ts         # Estado y lógica de la cola batch
└── cli.ts              # CLI independiente (commander), usa builder + capturer con Puppeteer + encoder
```

### Flujo de datos (conversión estándar)

```
Usuario hace clic "Convertir"
  → renderer: useConversion.start()
  → IPC: convert:start(inputPath, outputPath, options)
  → main: ipc.ts → runConversion()
      → builder.ts: buildAndServe() → URL local (ej: http://localhost:40001)
      → capturer.ts: capturePage() × N frames → /tmp/react-to-mp4-<ts>/*.png
      → encoder.ts: ffmpeg frames/*.png → output.mp4
  → IPC: convert:done
  → renderer: estado "done"
```

### Flujo de datos (proyecto Remotion)

```
main: runConversion()
  → remotion.ts: isRemotionProject() → true
  → remotion.ts: installDeps() → npm install
  → remotion.ts: listRemotionCompositions() → ["MyComp"]
  → remotion.ts: renderRemotionToMp4() → npx remotion render MyComp output.mp4
```

### IPC channels

| Canal | Dirección | Descripción |
|---|---|---|
| `dialog:selectFolder` | invoke | Abre el diálogo de selección de carpeta, devuelve la ruta o `null` |
| `convert:start` | invoke | Inicia una conversión individual |
| `convert:cancel` | send | Cancela la conversión en curso |
| `convert:progress` | main→renderer | Emite `{ phase, message, percent }` durante la conversión |
| `convert:done` | main→renderer | Señala fin de conversión; si hay error envía el mensaje de error |
| `batch:add` | invoke | Agrega un trabajo a la cola, devuelve el `ConversionJob` |
| `batch:start` | send | Inicia el procesamiento de la cola |
| `batch:stop` | send | Detiene el procesamiento de la cola |
| `batch:clear` | send | Elimina los trabajos completados de la cola |
| `batch:updated` | main→renderer | Emite el array completo de `ConversionJob[]` al actualizarse |

---

## 10. Estructura de archivos

```
.
├── src/                    # Código fuente (ver sección 9)
├── build/                  # Recursos del instalador (icono .ico) — crear antes de empaquetar
├── out/                    # Salida compilada por electron-vite (ignorado por git)
├── dist-electron/          # Instalador generado por electron-builder (ignorado por git)
├── docs/superpowers/       # Documentos de diseño e implementación internos
├── electron-builder.yml    # Configuración del empaquetado (NSIS, Windows x64)
├── electron.vite.config.ts # Configuración de electron-vite (main, preload, renderer)
├── package.json
├── tsconfig.json
└── README.md
```

---

## 11. Scripts NPM

| Script | Comando completo | Descripción |
|---|---|---|
| `npm run dev` | `electron-vite dev` | Inicia la app en modo desarrollo con hot-reload |
| `npm run build` | `electron-vite build` | Compila TypeScript a `out/` |
| `npm run package` | `electron-vite build && electron-builder` | Compila y genera el instalador en `dist-electron/` |
| `npm test` | `vitest run` | Ejecuta los tests una vez |
| `npm run test:watch` | `vitest` | Ejecuta los tests en modo watch |

---

## 12. Limitaciones conocidas

- **Solo Windows x64:** el binario de FFmpeg incluido (`ffmpeg-static`) y la configuración del instalador (`electron-builder.yml`) son exclusivos de Windows x64. Para macOS/Linux hay que adaptar `electron-builder.yml` y la ruta del FFmpeg en `src/main/index.ts`.

- **Proyecto Remotion — solo la primera composición:** cuando hay múltiples composiciones, se renderiza únicamente la primera encontrada. No hay opción en la UI para elegir cuál.

- **El CLI usa Puppeteer en lugar de Electron para capturar:** el CLI (`src/cli.ts`) captura frames con Puppeteer, que **no está en las dependencias del proyecto**. Para usar el CLI necesitas instalar Puppeteer manualmente: `npm install puppeteer`. La app de escritorio usa `capturePage()` de Electron y no tiene esta dependencia.

- **Duración fija:** la app captura exactamente los primeros N segundos del proyecto. No detecta automáticamente cuándo termina la animación. Si la animación dura menos que `duration`, los últimos frames serán estáticos.

- **Sin audio:** el MP4 generado no tiene pista de audio. FFmpeg solo codifica los frames visuales.
