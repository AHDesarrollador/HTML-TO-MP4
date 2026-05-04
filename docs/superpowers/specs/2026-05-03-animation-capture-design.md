# Animation Capture — Design Spec
**Fecha:** 2026-05-03  
**Estado:** Aprobado

## Objetivo

Hacer que la app convierta cualquier tipo de animación web a MP4 con captura determinista frame-perfecta. Cada frame capturado corresponde exactamente al estado visual en `t = i × (1000/fps)` ms.

## Problema actual

`capturer.ts` usa `BrowserWindow.capturePage()` con `sleep(1000/fps)` entre frames. Las animaciones corren en tiempo real: si la máquina es lenta o la animación usa `requestAnimationFrame`, los frames capturados no corresponden a tiempos precisos. Three.js/WebGL falla completamente porque el compositor no siempre flushea antes de `capturePage()`.

## Alcance de cambios

| Archivo | Cambio |
|---------|--------|
| `src/main/capturer.ts` | Reescritura completa — Puppeteer + CDP virtual time |
| `src/main/builder.ts` | Extensión — detección Next.js + static export |
| `package.json` | Añadir `puppeteer ^22.0.0` a `dependencies` |
| Todo lo demás | Sin cambios |

## Arquitectura

```
ipc.ts (sin cambios)
  └─ builder.ts → buildAndServe() → { url, stop() }
       ├── sin package.json          → Express static (sin cambios)
       ├── Next.js detectado         → npm install + next build → serve out/  [NUEVO]
       ├── sin build script          → serve dist/ o raíz (sin cambios)
       └── con build script          → npm install + build → serve dist/ (sin cambios)
  └─ capturer.ts → captureFrames()  [REESCRITO]
       ├── Puppeteer headless --use-gl=swiftshader
       ├── patch preserveDrawingBuffer antes de cargar página
       ├── CDP: congelar tiempo virtual en t=0
       └── por frame: advance(1000/fps ms) → await expired → screenshot
  └─ encoder.ts → encodeToMp4() (sin cambios)
```

## capturer.ts — Diseño detallado

### Lanzamiento de Puppeteer

```typescript
puppeteer.launch({
  headless: true,
  args: [
    `--window-size=${width},${height}`,
    '--use-gl=swiftshader',          // WebGL por software (sin GPU requerida)
    '--enable-webgl',
    '--disable-web-security',        // permite CDN imports (GSAP, anime.js via CDN)
    '--no-sandbox',                  // requerido en CI/Linux headless
    '--disable-setuid-sandbox',
    '--allow-file-access-from-files',
  ],
})
```

### Patch WebGL (antes de cargar la página)

Inyectado via `page.evaluateOnNewDocument()` para que aplique antes de que cualquier script de la página corra:

```typescript
HTMLCanvasElement.prototype.getContext = function(type, attrs) {
  if (type === 'webgl' || type === 'webgl2')
    attrs = { ...(attrs ?? {}), preserveDrawingBuffer: true }
  return origGetContext.call(this, type, attrs)
}
```

Sin este patch, Three.js borra el buffer de WebGL después de cada draw call y `canvas.toDataURL()` devuelve una imagen negra.

### Loop de captura

```
1. page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 })
2. sleep(500ms) real — tiempo para que React/Three.js monte y registre animaciones
3. Crear CDPSession
4. CDP setVirtualTimePolicy({ policy: 'pauseIfNetworkFetchesPending', budget: 0 })
   → congela: Date.now(), performance.now(), CSS animations/transitions, rAF, setTimeout/setInterval
5. for i = 0 to totalFrames - 1:
     a. Registrar listener para 'Emulation.virtualTimeBudgetExpired'
     b. CDP setVirtualTimePolicy({ policy: 'advance', budget: 1000/fps })
     c. await evento → todos los rAF, CSS transitions, springs físicos han corrido exactamente 1 frame
     d. captureFrame(page, width, height) → Buffer PNG
     e. escribir frame-XXXXXX.png
     f. onProgress(i+1, totalFrames)
6. browser.close()
7. return { framesDir, frameCount }
```

### captureFrame() — Fallback WebGL

```
¿Existe canvas con contexto webgl o webgl2?
  sí → page.evaluate():
         crear canvas 2D offscreen del mismo tamaño
         ctx2d.drawImage(webglCanvas, 0, 0, width, height)
         return offscreen.toDataURL('image/png')
       → Buffer.from(base64, 'base64')
  no → page.screenshot({ type: 'png', clip: { x:0, y:0, width, height } })
```

El `drawImage` desde un canvas WebGL a un canvas 2D funciona porque `preserveDrawingBuffer: true` mantiene el buffer populated entre frames.

### Matriz de compatibilidad

| Tipo | Mecanismo |
|------|-----------|
| HTML + CSS animations | Virtual time congela CSS timeline |
| HTML + JS vanilla (GSAP, anime.js) | Virtual time controla rAF |
| React + Framer Motion (springs) | Virtual time avanza física por frame |
| React + GSAP / Motion | Virtual time controla rAF |
| Three.js / WebGL | swiftshader + preserveDrawingBuffer patch + canvas capture |
| React Three Fiber | Igual que Three.js |
| Lottie | rAF controlado por virtual time |
| Next.js (app export) | builder.ts detecta y genera out/ |
| Vite + cualquier librería | Virtual time |
| CDN imports (sin package.json) | `--disable-web-security` + virtual time |

## builder.ts — Detección de Next.js

### Detección

```typescript
function isNextJsProject(pkg: Record<string, unknown>): boolean {
  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) }
  return 'next' in deps
}
```

### buildNextJs()

```
1. npm install
2. Buscar next.config.{js,mjs,ts,cjs}
3. Si el config no contiene output: 'export':
     - Guardar contenido original
     - Añadir/patchear output: 'export'
4. try:
     npm run build  (genera out/ con static export)
   finally:
     Restaurar next.config al contenido original (siempre, incluso si falla)
5. Verificar que out/ existe
6. return serveDir(out/)
```

**Estrategia de patch del config** (maneja formatos CommonJS y ESM):
- Si el archivo existe: insertar `output: 'export'` en el objeto de configuración exportado
- Si no existe: crear `next.config.js` mínimo con `module.exports = { output: 'export' }`

### Integración en buildAndServe()

```
if (!fs.existsSync(pkgPath))     → serveDir(projectPath)     // sin cambios
const pkg = JSON.parse(...)
if (isNextJsProject(pkg))        → buildNextJs(...)           // NUEVO — va primero
if (!hasBuildScript)             → serveDir(dist o root)      // sin cambios
else                             → npm install + build        // sin cambios
```

Next.js se evalúa antes que la lógica existente para no tratarlo como un proyecto Vite genérico.

## package.json

Añadir a `dependencies`:
```json
"puppeteer": "^22.0.0"
```

### Nota para app empaquetada (electron-builder)

En desarrollo, Puppeteer descarga Chromium a `~/.cache/puppeteer` automáticamente. Para el app distribuido con electron-builder, hay que:
1. Incluir el ejecutable de Chromium en `extraResources`
2. Apuntar `PUPPETEER_EXECUTABLE_PATH` al path dentro de `resourcesPath`

Esto no bloquea el desarrollo pero debe resolverse antes del empaquetado final.

## Criterios de éxito

- HTML + CSS puras: cada frame corresponde al estado CSS exacto en `t = i/fps` segundos
- GSAP / anime.js / Framer Motion: animaciones reproducibles frame a frame (mismo resultado en dos runs)
- Three.js / WebGL: frames no negros, geometría visible en máquinas sin GPU
- Next.js: se detecta, se construye y se sirve automáticamente sin intervención del usuario
- CDN imports: página sin package.json con GSAP o anime.js vía CDN funciona
