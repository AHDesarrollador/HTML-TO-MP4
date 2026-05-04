import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useConversion } from './hooks/useConversion'
import { useBatchQueue } from './hooks/useBatchQueue'
import { ipc } from './ipc'
import type { ConversionOptions, ConversionJob } from '../../main/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const basename = (p: string): string =>
  p ? p.replace(/\\/g, '/').split('/').pop() ?? p : ''

const ext = (name: string): string =>
  name.includes('.') ? name.split('.').pop()! : 'default'

// ---------------------------------------------------------------------------
// FileIcon
// ---------------------------------------------------------------------------
function FileIcon({ name }: { name: string }) {
  const e = ext(name)
  const map: Record<string, string> = { jsx: '{ }', tsx: '{ }', html: '</>', js: 'JS', ts: 'TS' }
  const cls = ['jsx', 'tsx'].includes(e) ? 'ext-jsx'
    : e === 'html' ? 'ext-html'
    : ['js', 'ts'].includes(e) ? 'ext-js'
    : 'ext-default'
  return <span className={`file-icon ${cls}`}>{map[e] ?? '·'}</span>
}

// ---------------------------------------------------------------------------
// TopMenu
// ---------------------------------------------------------------------------
const DOCS_URL = 'https://github.com/AHDesarrollador/HTML-TO-MP4/blob/master/README.md'

type MenuAction = 'export' | 'open' | 'exit' | 'docs'
interface TopMenuProps {
  onAction: (a: MenuAction) => void
  status: string
}
function TopMenu({ onAction, status }: TopMenuProps) {
  const [open, setOpen] = useState<string | null>(null)
  const busy = status === 'running'

  const menus: Record<string, Array<{ label?: string; shortcut?: string; divider?: boolean; check?: boolean; action?: MenuAction }>> = {
    Archivo: [
      { label: 'Abrir proyecto...', shortcut: 'Ctrl+O', action: 'open' },
      { divider: true },
      { label: 'Salir', shortcut: 'Alt+F4', action: 'exit' },
    ],
    Editar: [
      { label: 'Deshacer', shortcut: 'Ctrl+Z' },
      { label: 'Rehacer', shortcut: 'Ctrl+Y' },
      { divider: true },
      { label: 'Preferencias', shortcut: 'Ctrl+,' },
    ],
    Vista: [
      { label: 'Pantalla completa', shortcut: 'F11' },
      { divider: true },
      { label: 'Tema oscuro', check: true },
      { label: 'Cuadrícula de referencia', check: false },
    ],
    Exportar: [
      { label: 'Exportar ahora', shortcut: 'Ctrl+E', action: 'export' },
      { label: 'Exportar GIF' },
      { divider: true },
      { label: 'Cola de renderizado' },
    ],
    Ayuda: [
      { label: 'Documentación', shortcut: 'F1', action: 'docs' },
      { label: 'Reportar problema' },
      { divider: true },
      { label: 'Acerca de RenderCast' },
    ],
  }

  return (
    <div className="topmenu" onMouseLeave={() => setOpen(null)}>
      <div className="topmenu-brand">
        <span className="brand-dot" />
        rendercast
      </div>
      {Object.keys(menus).map((name) => (
        <div
          key={name}
          className={`topmenu-item ${open === name ? 'active' : ''}`}
          onMouseEnter={() => open && setOpen(name)}
          onClick={() => setOpen(open === name ? null : name)}
        >
          {name}
          {open === name && (
            <div className="topmenu-dropdown">
              {menus[name].map((it, i) =>
                it.divider ? (
                  <div key={i} className="dd-divider" />
                ) : (
                  <div
                    key={i}
                    className="dd-item"
                    onClick={() => {
                      setOpen(null)
                      if (it.action) onAction(it.action)
                    }}
                  >
                    <span>{it.label}</span>
                    {it.check !== undefined && (
                      <span className="dd-check">{it.check ? '✓' : ''}</span>
                    )}
                    {it.shortcut && <span className="dd-shortcut">{it.shortcut}</span>}
                  </div>
                )
              )}
            </div>
          )}
        </div>
      ))}
      <div className="topmenu-spacer" />
      <div className="topmenu-status">
        <span className={`status-dot ${busy ? 'busy' : 'ok'}`} />
        {busy ? 'procesando' : 'listo'}
        <span className="status-sep">·</span>
        v1.4.2
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// DropZone
// ---------------------------------------------------------------------------
function DropZone({ onDrop }: { onDrop: (path: string) => void }) {
  const [over, setOver] = useState(false)
  return (
    <div
      className={`dropzone ${over ? 'over' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        const f = e.dataTransfer.files?.[0]
        if (f) {
          // Electron exposes .path on File objects
          const path = (f as unknown as { path?: string }).path ?? f.name
          onDrop(path)
        }
      }}
      onClick={onDrop.bind(null, '')}
    >
      <div className="dropzone-plus">[ + ]</div>
      <div className="dropzone-text">arrastra .jsx · .html · carpeta</div>
      <div className="dropzone-hint">o haz clic para abrir</div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Dynamic file tree — loads from the open project folder via IPC
// ---------------------------------------------------------------------------
interface TreeNode {
  name: string
  fullPath: string
  isDir: boolean
  size?: number
  open?: boolean
  children?: TreeNode[]
  loaded?: boolean
}

const fmtSize = (bytes?: number): string => {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

async function loadDir(folderPath: string): Promise<TreeNode[]> {
  const entries = await ipc.listFolder(folderPath)
  return entries.map((e: { name: string; isDir: boolean; size?: number }) => ({
    name: e.name,
    fullPath: folderPath + '/' + e.name,
    isDir: e.isDir,
    size: e.size,
    open: false,
    children: e.isDir ? undefined : undefined,
    loaded: !e.isDir,
  }))
}

function FileTree({ rootPath, activeFile, onSelect }: {
  rootPath: string
  activeFile: string
  onSelect: (name: string) => void
}) {
  const [nodes, setNodes] = useState<TreeNode[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!rootPath) { setNodes([]); return }
    setLoading(true)
    loadDir(rootPath)
      .then(setNodes)
      .catch(() => setNodes([]))
      .finally(() => setLoading(false))
  }, [rootPath])

  const toggleDir = async (idxPath: number[]) => {
    setNodes((prev) => {
      const clone: TreeNode[] = JSON.parse(JSON.stringify(prev))
      let node: TreeNode = { children: clone } as unknown as TreeNode
      idxPath.forEach((i) => { node = node.children![i] })
      node.open = !node.open
      return clone
    })

    // Lazy-load children when opening for the first time
    setNodes((prev) => {
      const clone: TreeNode[] = JSON.parse(JSON.stringify(prev))
      let node: TreeNode = { children: clone } as unknown as TreeNode
      idxPath.forEach((i) => { node = node.children![i] })
      if (node.open && !node.loaded) {
        loadDir(node.fullPath).then((children) => {
          setNodes((p2) => {
            const c2: TreeNode[] = JSON.parse(JSON.stringify(p2))
            let n2: TreeNode = { children: c2 } as unknown as TreeNode
            idxPath.forEach((i) => { n2 = n2.children![i] })
            n2.children = children
            n2.loaded = true
            return c2
          })
        })
      }
      return clone
    })
  }

  const renderNode = (node: TreeNode, idxPath: number[], depth: number): React.ReactNode => {
    if (node.isDir) {
      return (
        <div key={node.fullPath}>
          <div
            className="tree-row tree-folder"
            style={{ paddingLeft: 8 + depth * 14 }}
            onClick={() => toggleDir(idxPath)}
          >
            <span className="tree-caret">{node.open ? '▾' : '▸'}</span>
            <span className="tree-folder-icon">{node.open ? '▤' : '▥'}</span>
            <span className="tree-name">{node.name}</span>
          </div>
          {node.open && node.children?.map((c, i) => renderNode(c, [...idxPath, i], depth + 1))}
        </div>
      )
    }
    const isActive = activeFile === node.name
    return (
      <div
        key={node.fullPath}
        className={`tree-row tree-file ${isActive ? 'active' : ''}`}
        style={{ paddingLeft: 8 + depth * 14 }}
        onClick={() => onSelect(node.name)}
      >
        <FileIcon name={node.name} />
        <span className="tree-name">{node.name}</span>
        {node.size !== undefined && <span className="tree-size">{fmtSize(node.size)}</span>}
      </div>
    )
  }

  if (!rootPath) {
    return (
      <div className="tree" style={{ padding: '8px 14px 12px', color: 'var(--text-mute)', fontSize: 11 }}>
        sin proyecto abierto
      </div>
    )
  }
  if (loading) {
    return (
      <div className="tree" style={{ padding: '8px 14px 12px', color: 'var(--text-mute)', fontSize: 11 }}>
        cargando...
      </div>
    )
  }
  return (
    <div className="tree">
      {nodes.length === 0
        ? <div style={{ padding: '8px 14px', color: 'var(--text-mute)', fontSize: 11 }}>carpeta vacía</div>
        : nodes.map((n, i) => renderNode(n, [i], 0))
      }
    </div>
  )
}

// ---------------------------------------------------------------------------
// QueueRow
// ---------------------------------------------------------------------------
function QueueRow({ job }: { job: ConversionJob }) {
  const labels: Record<ConversionJob['status'], string> = {
    pending: 'en espera',
    in_progress: `⟳ ${Math.round(job.progress)}%`,
    completed: '✓ listo',
    failed: '! error',
  }
  return (
    <div className={`q-row ${job.status}`}>
      <div className="q-main">
        <FileIcon name={basename(job.inputPath) || 'proyecto'} />
        <div className="q-info">
          <div className="q-name">{basename(job.inputPath) || job.id}</div>
          <div className="q-meta">
            {job.options.width}×{job.options.height} · {job.options.fps}fps · {job.options.duration}s
          </div>
        </div>
        <span className={`q-status ${job.status}`}>{labels[job.status]}</span>
      </div>
      {job.status === 'in_progress' && (
        <div className="q-bar">
          <div className="q-bar-fill" style={{ width: `${job.progress}%` }} />
        </div>
      )}
      {job.status === 'failed' && job.error && (
        <div style={{ fontSize: 9, color: 'var(--bad)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {job.error}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// ConfigPanel
// ---------------------------------------------------------------------------
interface ConfigPanelProps {
  options: ConversionOptions
  onChange: (o: ConversionOptions) => void
  format: 'MP4' | 'H.264'
  onFormatChange: (f: 'MP4' | 'H.264') => void
  outputPath: string
  pickOutput: () => void
}
function ConfigPanel({ options, onChange, format, onFormatChange, outputPath, pickOutput }: ConfigPanelProps) {
  const fileExt = format === 'MP4' ? 'mp4' : '264'
  // Derive base name from outputName (strip extension)
  const baseName = options.outputName.replace(/\.[^.]+$/, '') || 'output'

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Sanitize: no path separators or special chars
    const v = e.target.value.replace(/[<>:"/\\|?*\x00-\x1F]/g, '').trimStart() || 'output'
    onChange({ ...options, outputName: `${v}.${fileExt}` })
  }

  return (
    <div className="config">
      <div className="cfg-row">
        <label>Resolución</label>
        <div className="seg">
          <button className="seg-btn active">1080p</button>
        </div>
        <div className="cfg-readout">24 fps</div>
      </div>

      <div className="cfg-row">
        <label>Formato</label>
        <div className="format-switch">
          <button
            className={`fs-opt ${format === 'MP4' ? 'active' : ''}`}
            onClick={() => onFormatChange('MP4')}
          >
            MP4
          </button>
          <div
            className={`fs-track ${format === 'MP4' ? 'left' : 'right'}`}
            onClick={() => onFormatChange(format === 'MP4' ? 'H.264' : 'MP4')}
          >
            <div className="fs-knob" />
          </div>
          <button
            className={`fs-opt ${format === 'H.264' ? 'active' : ''}`}
            onClick={() => onFormatChange('H.264')}
          >
            H.264
          </button>
        </div>
        <div className="cfg-readout">.{fileExt}</div>
      </div>

      <div className="cfg-row">
        <label>Nombre</label>
        <input
          className="cfg-filename-input"
          value={baseName}
          onChange={handleNameChange}
          spellCheck={false}
          placeholder="output"
        />
        <div className="cfg-readout">.{fileExt}</div>
      </div>

      <div className="cfg-dest">
        <div className="cfg-dest-label">CARPETA DE DESTINO</div>
        <div className="cfg-dest-row">
          <div className={`cfg-dest-path ${!outputPath ? 'empty' : ''}`}>
            {outputPath ? outputPath.replace(/\\/g, '/') : 'sin seleccionar'}
          </div>
          <button className="cfg-dest-btn" onClick={pickOutput} title="Seleccionar carpeta">
            …
          </button>
        </div>
      </div>

    </div>
  )
}

// ---------------------------------------------------------------------------
// Preview (orbital animation via CSS)
// ---------------------------------------------------------------------------
function PreviewCanvas({ playing, currentTime, duration, inputName }: {
  playing: boolean
  currentTime: number
  duration: number
  inputName: string
}) {
  const animState = playing ? 'running' : 'paused'
  const pctStr = `${String(currentTime.toFixed(2)).padStart(5, '0')} / ${duration.toFixed(2)}`

  return (
    <div className="preview">
      <div className="preview-grid" />
      {inputName ? (
        <svg viewBox="0 0 600 360" className="preview-svg">
          <g className="orbit-b-g" style={{ animationPlayState: animState }}>
            <circle cx="300" cy="180" r="130" fill="none" stroke="#c4f542" strokeOpacity="0.18" strokeDasharray="2 6" />
            <circle cx="300" cy="50" r="6" fill="#c4f542" />
          </g>
          <g className="orbit-a-g" style={{ animationPlayState: animState }}>
            <circle cx="300" cy="180" r="80" fill="none" stroke="#c4f542" strokeOpacity="0.35" strokeDasharray="3 5" />
            <circle cx="380" cy="180" r="5" fill="#c4f542" />
          </g>
          <circle
            className="orbit-core-el"
            cx="300" cy="180" r="14"
            fill="#c4f542"
            style={{ animationPlayState: animState, filter: 'drop-shadow(0 0 10px #c4f54299)' }}
          />
        </svg>
      ) : (
        <div className="preview-empty">
          <div className="preview-empty-icon">[ ]</div>
          <div>SIN ARCHIVO — abre o arrastra un proyecto</div>
        </div>
      )}
      <div className="preview-hud">
        <div className="hud-tag">PREVIEW · 16:9</div>
        <div className="hud-tag">{pctStr}</div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------
function Timeline({ playing, setPlaying, currentTime, setCurrentTime, duration }: {
  playing: boolean
  setPlaying: (p: boolean) => void
  currentTime: number
  setCurrentTime: (t: number) => void
  duration: number
}) {
  const pct = duration > 0 ? (currentTime / duration) * 100 : 0
  const tickCount = Math.min(Math.floor(duration) + 1, 13)

  return (
    <div className="timeline">
      <div className="tl-controls">
        <button className="tl-btn" onClick={() => setCurrentTime(0)}>⏮</button>
        <button className="tl-btn primary" onClick={() => setPlaying(!playing)}>
          {playing ? '⏸' : '▶'}
        </button>
        <button className="tl-btn" onClick={() => setCurrentTime(duration)}>⏭</button>
        <div className="tl-time">
          {currentTime.toFixed(2)}s / {duration.toFixed(2)}s
        </div>
      </div>
      <div
        className="tl-track"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          setCurrentTime(((e.clientX - r.left) / r.width) * duration)
        }}
      >
        <div className="tl-fill" style={{ width: `${pct}%` }} />
        <div className="tl-playhead" style={{ left: `${pct}%` }} />
        <div className="tl-ticks">
          {Array.from({ length: tickCount }).map((_, i) => (
            <div
              key={i}
              className="tl-tick"
              style={{ left: `${(i / Math.max(tickCount - 1, 1)) * 100}%` }}
            >
              <span>{i}s</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ExportModal
// ---------------------------------------------------------------------------
type ConvStatus = 'idle' | 'running' | 'done' | 'error'
interface ExportModalProps {
  open: boolean
  onClose: () => void
  status: ConvStatus
  percent: number
  phase: string
  message: string
  errorMsg: string
  options: ConversionOptions
  format: 'MP4' | 'H.264'
  outputPath: string
}
function ExportModal({ open, onClose, status, percent, phase, message, errorMsg, options, format, outputPath }: ExportModalProps) {
  if (!open) return null
  const done = status === 'done'
  const isErr = status === 'error'
  const ext = format === 'MP4' ? 'mp4' : '264'

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="brand-dot" />
          {isErr ? 'error de exportación' : done ? 'exportación completada' : `exportando · ${format}`}
          <button className="modal-x" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className={`modal-stage ${isErr ? 'error' : !done ? 'with-cursor' : ''}`}>
            {isErr ? 'error al procesar' : done ? 'completado' : phase}
          </div>
          <div className="modal-bar">
            <div
              className={`modal-fill ${isErr ? 'error' : ''}`}
              style={{ width: `${isErr ? 100 : percent}%` }}
            />
          </div>
          <div className="modal-meta">
            <div><span>fase</span><span>{phase || '—'}</span></div>
            <div><span>progreso</span><span>{Math.round(percent)}%</span></div>
            <div><span>resolución</span><span>{options.width}×{options.height}</span></div>
            <div><span>destino</span><span>output.{ext}</span></div>
          </div>
          {isErr && errorMsg && (
            <div className="modal-error-msg">{errorMsg}</div>
          )}
          {message && !isErr && !done && (
            <div style={{ fontSize: 10, color: 'var(--text-mute)', marginTop: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {message}
            </div>
          )}
          {(done || isErr) && (
            <div className="modal-done">
              <button className="btn-secondary" onClick={onClose}>Cerrar</button>
              {done && (
                <button
                  className="btn-primary"
                  onClick={() => outputPath && ipc.openFolder(outputPath)}
                >
                  Abrir carpeta
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------
export default function App(): React.ReactElement {
  const conv = useConversion()
  const batch = useBatchQueue(conv.outputPath)

  const [format, setFormat] = useState<'MP4' | 'H.264'>('MP4')
  const [playing, setPlaying] = useState(true)
  const [currentTime, setCurrentTime] = useState(0)
  const [exportModalOpen, setExportModalOpen] = useState(false)
  const [activeFile, setActiveFile] = useState('animation.jsx')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({
    archivo: false,
    explorador: true,
    cola: false,
    config: false,
  })
  const togglePanel = (name: string) =>
    setCollapsed((p) => ({ ...p, [name]: !p[name] }))

  const pendingExportRef = useRef(false)

  // Timeline playback
  useEffect(() => {
    if (!playing) return
    let raf: number
    let last = performance.now()
    const tick = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      setCurrentTime((t) => {
        const n = t + dt
        return n > conv.options.duration ? 0 : n
      })
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, conv.options.duration])

  // Auto-start after output path is selected
  useEffect(() => {
    if (pendingExportRef.current && conv.outputPath) {
      pendingExportRef.current = false
      conv.start()
      setExportModalOpen(true)
    }
  }, [conv.outputPath])

  // Open modal when conversion starts
  useEffect(() => {
    if (conv.status === 'running') setExportModalOpen(true)
  }, [conv.status])

  const handleExport = useCallback(async () => {
    if (conv.status === 'running') {
      conv.cancel()
      setExportModalOpen(false)
      return
    }
    // Pick input first if missing
    if (!conv.inputPath) {
      await conv.pickInput()
      return
    }
    // Pick output if missing, then auto-start via useEffect
    if (!conv.outputPath) {
      pendingExportRef.current = true
      await conv.pickOutput()
      return
    }
    conv.start()
    setExportModalOpen(true)
  }, [conv])

  const handleModalClose = useCallback(() => {
    setExportModalOpen(false)
    if (conv.status === 'done' || conv.status === 'error') {
      conv.reset()
    }
  }, [conv])

  const handleMenuAction = useCallback((action: MenuAction) => {
    if (action === 'export') handleExport()
    if (action === 'open') conv.pickInput()
    if (action === 'exit') window.close()
    if (action === 'docs') ipc.openUrl(DOCS_URL)
  }, [handleExport, conv])

  const handleDrop = useCallback(async (path: string) => {
    if (path) {
      // path from drag-and-drop
      // useConversion doesn't expose setInputPath, so fall back to the picker
      await conv.pickInput()
    } else {
      await conv.pickInput()
    }
  }, [conv])

  const inputName = basename(conv.inputPath)
  const running = conv.status === 'running'

  const doneCount = batch.jobs.filter((j) => j.status === 'completed').length
  const activeCount = batch.jobs.filter((j) => j.status === 'in_progress').length
  const queuedCount = batch.jobs.filter((j) => j.status === 'pending').length

  return (
    <div className="app">
      <TopMenu onAction={handleMenuAction} status={conv.status} />

      <div className="body">
        {/* ===== SIDEBAR ===== */}
        <aside className="sidebar">
          {/* Archivo de entrada */}
          <section className="panel">
            <div className="panel-head" onClick={() => togglePanel('archivo')}>
              <span className={`panel-toggle ${!collapsed.archivo ? 'open' : ''}`}>▸</span>
              <span className="panel-title">ARCHIVO DE ENTRADA</span>
              <span className="panel-actions" onClick={(e) => e.stopPropagation()}>
                <button className="ph-btn" title="Abrir proyecto" onClick={conv.pickInput}>⊕</button>
                <button className="ph-btn" title="Limpiar" onClick={conv.reset}>↺</button>
              </span>
            </div>
            {!collapsed.archivo && (
              <>
                <div className={`active-file ${!inputName ? 'empty' : ''}`}>
                  <FileIcon name={inputName || 'carpeta'} />
                  <span className="active-file-name">
                    {inputName || 'sin proyecto seleccionado'}
                  </span>
                  {inputName && <span className="active-file-status">●</span>}
                </div>
                <DropZone onDrop={handleDrop} />
              </>
            )}
          </section>

          {/* Explorador */}
          <section className="panel">
            <div className="panel-head" onClick={() => togglePanel('explorador')}>
              <span className={`panel-toggle ${!collapsed.explorador ? 'open' : ''}`}>▸</span>
              <span className="panel-title">EXPLORADOR</span>
              <span className="panel-actions" onClick={(e) => e.stopPropagation()}>
                <button className="ph-btn">▤</button>
              </span>
            </div>
            {!collapsed.explorador && (
              <FileTree rootPath={conv.inputPath} activeFile={activeFile} onSelect={setActiveFile} />
            )}
          </section>

          {/* Cola de proyectos */}
          <section className="panel">
            <div className="panel-head" onClick={() => togglePanel('cola')}>
              <span className={`panel-toggle ${!collapsed.cola ? 'open' : ''}`}>▸</span>
              <span className="panel-title">COLA DE PROYECTOS</span>
              <span className="panel-actions" onClick={(e) => e.stopPropagation()}>
                <span className="queue-badge">{batch.jobs.length}</span>
              </span>
            </div>
            {!collapsed.cola && (
              <>
                <div className="queue-summary">
                  <div className="qs-item">
                    <span className="qs-num">{batch.jobs.length}</span>
                    <span className="qs-lbl">total</span>
                  </div>
                  <div className="qs-item">
                    <span className={`qs-num ${activeCount > 0 ? 'accent' : ''}`}>{activeCount}</span>
                    <span className="qs-lbl">activo</span>
                  </div>
                  <div className="qs-item">
                    <span className="qs-num">{queuedCount}</span>
                    <span className="qs-lbl">en cola</span>
                  </div>
                  <div className="qs-item">
                    <span className="qs-num">{doneCount}</span>
                    <span className="qs-lbl">listo</span>
                  </div>
                </div>
                <div className="queue-list">
                  {batch.jobs.length === 0 && (
                    <div style={{ textAlign: 'center', color: 'var(--text-mute)', fontSize: 11, padding: '12px 0' }}>
                      sin proyectos en cola
                    </div>
                  )}
                  {batch.jobs.map((job) => <QueueRow key={job.id} job={job} />)}
                </div>
                <div className="queue-actions">
                  <button className="q-act-btn" disabled={batch.running} onClick={batch.addJob}>
                    + añadir
                  </button>
                  <button
                    className="q-act-btn"
                    disabled={batch.running}
                    onClick={batch.clear}
                  >
                    ⌫ limpiar
                  </button>
                </div>
                <button
                  className="queue-export-all-btn"
                  disabled={batch.running || batch.jobs.filter(j => j.status === 'pending').length === 0}
                  onClick={batch.running ? batch.stop : batch.start}
                >
                  {batch.running ? (
                    <>■ DETENER COLA</>
                  ) : (
                    <>▶ EXPORTAR COLA ({batch.jobs.filter(j => j.status === 'pending').length})</>
                  )}
                </button>
              </>
            )}
          </section>

          {/* Configuración */}
          <section className="panel">
            <div className="panel-head" onClick={() => togglePanel('config')}>
              <span className={`panel-toggle ${!collapsed.config ? 'open' : ''}`}>▸</span>
              <span className="panel-title">CONFIGURACIÓN</span>
            </div>
            {!collapsed.config && (
              <ConfigPanel
                options={conv.options}
                onChange={conv.setOptions}
                format={format}
                onFormatChange={(f) => {
                  setFormat(f)
                  const base = conv.options.outputName.replace(/\.[^.]+$/, '') || 'output'
                  conv.setOptions({
                    ...conv.options,
                    outputName: `${base}.${f === 'MP4' ? 'mp4' : '264'}`,
                  })
                }}
                outputPath={conv.outputPath}
                pickOutput={conv.pickOutput}
              />
            )}
          </section>
        </aside>

        {/* ===== MAIN AREA ===== */}
        <main className="main">
          <div className="main-toolbar">
            <div className="tab-strip">
              <div className="tab active">
                <FileIcon name={inputName || 'proyecto.jsx'} />
                {inputName || 'sin archivo'}
                <span style={{ color: 'var(--text-mute)', fontSize: 14, marginLeft: 4 }}>×</span>
              </div>
              <div className="tab-add">+</div>
            </div>
            <div className="main-tools">
              <button className="tool-btn" onClick={conv.pickInput}>↺ recargar</button>
              <button className="tool-btn" onClick={() => setPlaying(!playing)}>
                {playing ? '⏸ pausar' : '▶ play'}
              </button>
            </div>
          </div>

          <PreviewCanvas
            playing={playing}
            currentTime={currentTime}
            duration={conv.options.duration}
            inputName={inputName}
          />

          <Timeline
            playing={playing}
            setPlaying={setPlaying}
            currentTime={currentTime}
            setCurrentTime={setCurrentTime}
            duration={conv.options.duration}
          />

          <button
            className={`export-btn ${running ? 'cancel-mode' : ''}`}
            onClick={handleExport}
            disabled={!running && !conv.inputPath}
          >
            <span className="export-icon">{running ? '■' : '▶'}</span>
            <span>{running ? 'CANCELAR' : `EXPORTAR ${format}`}</span>
            {!running && (
              <span className="export-meta">
                1080p · 24fps · {conv.options.duration.toFixed(1)}s
              </span>
            )}
          </button>
        </main>
      </div>

      {/* Status bar */}
      <div className="statusbar">
        <span>
          <span className={`status-dot ${running ? 'busy' : 'ok'}`} style={{ marginRight: 6 }} />
          {running ? 'procesando' : 'conectado'}
        </span>
        <span className="sep">·</span>
        <span>react 18 · electron</span>
        <span className="sep">·</span>
        <span>{inputName || 'sin archivo'}</span>
        <div className="sb-spacer" />
        {running && conv.progress && (
          <>
            <span style={{ color: 'var(--accent)' }}>{conv.progress.phase} — {Math.round(conv.progress.percent)}%</span>
            <span className="sep">·</span>
          </>
        )}
        <span>1920×1080 @ 24fps</span>
      </div>

      <ExportModal
        open={exportModalOpen}
        onClose={handleModalClose}
        status={conv.status}
        percent={conv.progress?.percent ?? (conv.status === 'done' ? 100 : 0)}
        phase={conv.progress?.phase ?? (conv.status === 'done' ? 'completado' : 'iniciando')}
        message={conv.progress?.message ?? ''}
        errorMsg={conv.errorMsg}
        options={conv.options}
        format={format}
        outputPath={conv.outputPath}
      />
    </div>
  )
}
