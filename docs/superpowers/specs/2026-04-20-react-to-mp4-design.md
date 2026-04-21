# React → MP4 Converter — Design Spec

**Fecha:** 2026-04-20  
**Estado:** Aprobado

---

## Resumen

App de escritorio para Windows que convierte proyectos React (con build) a video MP4. El usuario elige una carpeta de proyecto React, configura resolución, FPS y duración, y la app automatiza el proceso completo: build, renderizado headless y encoding de video. Incluye modo Single, Batch Queue y CLI.

---

## Stack tecnológico

| Capa | Tecnología |
|---|---|
| App de escritorio | **Electron** (Chromium + Node.js) |
| Lenguaje | **TypeScript** (todo el proyecto) |
| GUI | **React + Tailwind CSS** (renderer process) |
| Renderizado de animaciones | **puppeteer-core** (usa el Chromium de Electron, sin descarga extra) |
| Encoding de video | **FFmpeg** (via `fluent-ffmpeg`) |
| Servidor de archivos local | **`serve`** (npm package) |
| CLI | Entry point `cli.ts` con `commander` |
| Empaquetado | **electron-builder** → `.exe` instalable |

---

## Arquitectura

La app tiene tres capas principales que se comunican via IPC de Electron:

```
GUI (Renderer Process)
  ↕ IPC
Main Process (Orquestador)
  ├── Builder    → npm install + npm run build + serve /dist
  ├── Capturer   → Puppeteer abre localhost, captura frames PNG
  ├── Encoder    → FFmpeg ensambla frames → MP4
  └── Queue      → Batch job queue (FIFO, secuencial)

CLI Entry Point → invoca la misma lógica del Main Process sin GUI
```

### Flujo de una conversión

1. Usuario selecciona carpeta del proyecto React
2. `Builder` ejecuta `npm install` y `npm run build` en esa carpeta
3. `Builder` levanta un servidor HTTP local (puerto aleatorio libre) sirviendo `/dist`
4. `Capturer` lanza Puppeteer apuntando a `localhost:<puerto>`
5. `Capturer` captura frames PNG a la tasa de FPS configurada durante la duración indicada
6. `Encoder` invoca FFmpeg con los frames capturados → genera MP4 en la carpeta de salida
7. El servidor local se cierra y los frames temporales se eliminan

---

## Módulos principales

### `builder.ts`
- Corre `npm install` + `npm run build` como child process
- Detecta y reporta errores de build
- Levanta servidor HTTP local en puerto aleatorio libre
- Devuelve la URL donde está sirviendo el proyecto

### `capturer.ts`
- Recibe: URL, width, height, fps, duration
- Lanza `puppeteer-core` usando `executablePath` del Chromium de Electron (evita doble descarga)
- Configura viewport al width/height indicado
- Espera a que la página cargue completamente (`networkidle2`)
- Captura `fps × duration` frames en intervalos exactos de `1000/fps` ms
- Guarda frames como PNG en carpeta temporal
- Emite eventos de progreso (`frame-captured`, `progress-percent`)

### `encoder.ts`
- Recibe: carpeta de frames, output path, width, height, fps
- Invoca FFmpeg via `fluent-ffmpeg`
- Parámetros: codec H.264, pixel format yuv420p, escala exacta
- Emite eventos de progreso de FFmpeg
- Limpia carpeta de frames al finalizar

### `queue.ts`
- Cola FIFO de jobs (objetos `ConversionJob`)
- Procesa jobs secuencialmente (uno a la vez)
- Cada job tiene estado: `pending | in_progress | completed | failed`
- Emite eventos de cambio de estado via IPC al renderer

---

## Tipos de datos

```typescript
interface ConversionOptions {
  width: number;       // px, default: 1920
  height: number;      // px, default: 1080
  fps: number;         // default: 30, la UI ofrece 24/30/60 pero acepta cualquier valor
  duration: number;    // segundos, default: 5
  outputName: string;  // default: "output.mp4"
}

interface ConversionJob {
  id: string;
  inputPath: string;   // carpeta del proyecto React
  outputPath: string;  // carpeta de destino
  options: ConversionOptions;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  progress: number;    // 0-100
  error?: string;
}
```

---

## GUI

### Ventana principal — dos pestañas

**Pestaña Single:**
- File picker: selección de carpeta del proyecto React
- File picker: selección de carpeta de salida
- Panel de opciones (derecha):
  - Duración (input numérico, segundos)
  - Ancho × Alto (dos inputs numéricos)
  - FPS (botones rápidos: 24 / 30 / 60)
  - Nombre del archivo de salida
  - Presets rápidos: "1080p 60fps", "720p 30fps", "4K 24fps"
- Barra de progreso con estado textual
- Botones: **Convertir**, Cancelar, **+ Agregar a Batch**

**Pestaña Batch Queue:**
- Lista de jobs con estado visual (✅ completado, ⏳ en progreso, ⏸ en espera, ❌ fallido)
- Barra de progreso individual por job en progreso
- Botones: **Iniciar todo**, Pausar, Limpiar completados

### Tema visual
- Dark mode por defecto
- Colores: violeta (`#6366f1`) como acento principal

---

## CLI

Entry point: `cli.ts`, registrado como binario en `package.json`.

```bash
# Conversión simple con defaults
react-to-mp4 --input ./mi-proyecto --output ./video.mp4

# Con todas las opciones
react-to-mp4 --input ./mi-proyecto --output ./video.mp4 \
  --width 1920 --height 1080 --fps 60 --duration 5

# Batch via archivo JSON
react-to-mp4 --batch ./jobs.json
```

**Formato de `jobs.json`:**
```json
[
  { "input": "./hero-anim", "output": "./hero.mp4", "fps": 30, "duration": 5 },
  { "input": "./loading",   "output": "./loading.mp4", "fps": 60, "duration": 3 }
]
```

El CLI muestra progreso en terminal con spinners y porcentajes. Exits con código 0 en éxito, 1 en error.

---

## Empaquetado y distribución

- `electron-builder` genera un instalador `.exe` para Windows (NSIS)
- FFmpeg se incluye como binario embebido (no requiere instalación en el sistema)
- `puppeteer-core` reutiliza el Chromium de Electron (sin descarga adicional)
- Node.js no es requerido en el sistema del usuario final

---

## Manejo de errores

| Escenario | Comportamiento |
|---|---|
| El proyecto no tiene `package.json` | Error inmediato con mensaje claro |
| `npm run build` falla | Muestra el stderr del build al usuario |
| Puerto local ocupado | Reintenta con siguiente puerto disponible |
| Puppeteer no puede cargar la página | Timeout de 30s, luego error |
| FFmpeg no puede escribir el output | Error con ruta de destino mostrada |
| Job de batch falla | El job se marca como `failed`, la cola continúa con el siguiente |

---

## Escalabilidad futura

La arquitectura de módulos independientes (`builder`, `capturer`, `encoder`, `queue`) permite agregar features sin romper las existentes:

- **Más formatos de salida** → nuevo módulo `encoder-gif.ts`, `encoder-webm.ts`
- **Vista previa** → el Capturer ya tiene acceso al Puppeteer page, se puede reutilizar
- **Más presets** → solo datos en un archivo de configuración JSON
- **Cloud rendering** → reemplazar `builder.ts` por un cliente HTTP remoto
- **Plugins** → exponer los módulos como API pública con tipos TypeScript
