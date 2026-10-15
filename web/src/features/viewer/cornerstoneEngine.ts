/**
 * Настоящий движок вьюера на cornerstone3D. Модули тяжёлые (WebGL, WASM-кодеки, воркеры),
 * поэтому грузятся только при первом открытии вьюера.
 *
 * Раскладка мыши как на рабочих станциях: левая — выбранный инструмент (по умолчанию
 * окно/уровень), средняя — сдвиг, правая — масштаб, колесо — листание срезов.
 */
import type { ToolName, ViewerEngine, ViewportState } from './engine'

type Core = typeof import('@cornerstonejs/core')
type Tools = typeof import('@cornerstonejs/tools')
type Loader = typeof import('@cornerstonejs/dicom-image-loader')
type StackViewport = import('@cornerstonejs/core').StackViewport

interface Cornerstone {
  core: Core
  tools: Tools
  loader: Loader
}

let ready: Promise<Cornerstone> | null = null

/** Accept для каждого кадра — загрузчик глобальный, поэтому и таблица общая на все вьюеры. */
const acceptByImageId = new Map<string, string>()

function initCornerstone(): Promise<Cornerstone> {
  ready ??= (async () => {
    const [core, tools, loader] = await Promise.all([
      import('@cornerstonejs/core'),
      import('@cornerstonejs/tools'),
      import('@cornerstonejs/dicom-image-loader'),
    ])
    core.init()
    loader.init({
      maxWebWorkers: Math.max(1, Math.min(4, navigator.hardwareConcurrency ?? 2)),
      // Свой Accept на кадр: просим родное сжатие. Сюда же в фазе 8 добавится Bearer-токен.
      beforeSend: (_xhr, imageId) => {
        const accept = acceptByImageId.get(imageId)
        return accept ? { Accept: accept } : undefined
      },
    })
    tools.init()
    for (const Tool of [tools.WindowLevelTool, tools.PanTool, tools.ZoomTool, tools.StackScrollTool, tools.LengthTool, tools.AngleTool]) {
      tools.addTool(Tool)
    }
    return { core, tools, loader }
  })()
  return ready
}

let counter = 0

export function createCornerstoneEngine(): ViewerEngine {
  const id = `dcm4chee-viewer-${++counter}`
  const changeListeners = new Set<(state: ViewportState) => void>()
  const errorListeners = new Set<(error: Error) => void>()
  const cleanups: Array<() => void> = []

  let cs: Cornerstone | null = null
  let engine: InstanceType<Core['RenderingEngine']> | null = null
  let viewport: StackViewport | null = null
  let total = 0

  function toolNames(): Record<ToolName | 'stackScroll', string> {
    const t = cs!.tools
    return {
      windowLevel: t.WindowLevelTool.toolName,
      pan: t.PanTool.toolName,
      zoom: t.ZoomTool.toolName,
      length: t.LengthTool.toolName,
      angle: t.AngleTool.toolName,
      stackScroll: t.StackScrollTool.toolName,
    }
  }

  function emit() {
    if (!viewport || !cs) return
    const properties = viewport.getProperties()
    const range = properties.voiRange
    const voi = range ? cs.core.utilities.windowLevel.toWindowLevel(range.lower, range.upper) : undefined
    const state: ViewportState = {
      index: viewport.getCurrentImageIdIndex(),
      total,
      windowWidth: voi?.windowWidth,
      windowCenter: voi?.windowCenter,
      zoom: viewport.getZoom(),
      inverted: Boolean(properties.invert),
    }
    changeListeners.forEach((listener) => listener(state))
  }

  function fail(error: unknown) {
    const normalized = error instanceof Error ? error : new Error(String(error))
    errorListeners.forEach((listener) => listener(normalized))
  }

  return {
    async mount(element) {
      cs = await initCornerstone()
      const { core, tools } = cs
      engine = new core.RenderingEngine(id)
      engine.enableElement({
        viewportId: id,
        type: core.Enums.ViewportType.STACK,
        element,
        defaultOptions: { background: [0, 0, 0] },
      })
      viewport = engine.getViewport(id) as StackViewport

      const group = tools.ToolGroupManager.createToolGroup(id)!
      const names = toolNames()
      Object.values(names).forEach((name) => group.addTool(name))
      group.addViewport(id, id)
      this.setTool('windowLevel')

      // Правая кнопка — масштаб, контекстное меню браузера ему мешает.
      const noMenu = (event: Event) => event.preventDefault()
      element.addEventListener('contextmenu', noMenu)
      cleanups.push(() => element.removeEventListener('contextmenu', noMenu))

      const { Events } = core.Enums
      for (const event of [Events.STACK_NEW_IMAGE, Events.VOI_MODIFIED, Events.CAMERA_MODIFIED]) {
        element.addEventListener(event, emit)
        cleanups.push(() => element.removeEventListener(event, emit))
      }
      const onFailed = (event: Event) => fail((event as CustomEvent<{ error: unknown }>).detail?.error ?? 'снимок не загрузился')
      core.eventTarget.addEventListener(Events.IMAGE_LOAD_FAILED, onFailed)
      cleanups.push(() => core.eventTarget.removeEventListener(Events.IMAGE_LOAD_FAILED, onFailed))

      const resize = new ResizeObserver(() => engine?.resize(true, true))
      resize.observe(element)
      cleanups.push(() => resize.disconnect())
    },

    async setStack(imageIds, initialIndex, metadata, accept = {}) {
      if (!viewport || !cs) throw new Error('вьюер не смонтирован')
      for (const imageId of imageIds) {
        cs.loader.wadors.metaDataManager.add(imageId, metadata[imageId] as never)
        if (accept[imageId]) acceptByImageId.set(imageId, accept[imageId])
      }
      total = imageIds.length
      try {
        await viewport.setStack(imageIds, Math.min(Math.max(0, initialIndex), imageIds.length - 1))
        viewport.render()
        emit()
      } catch (error) {
        fail(error)
      }
    },

    scrollTo(index) {
      if (!viewport || !total) return
      void viewport.setImageIdIndex(Math.min(Math.max(0, index), total - 1))
    },

    setTool(tool) {
      if (!cs) return
      const { MouseBindings } = cs.tools.Enums
      const group = cs.tools.ToolGroupManager.getToolGroup(id)
      if (!group) return
      const names = toolNames()
      const bindings: Record<string, number[]> = {
        [names.windowLevel]: [],
        [names.pan]: [MouseBindings.Auxiliary],
        [names.zoom]: [MouseBindings.Secondary],
        [names.stackScroll]: [MouseBindings.Wheel],
        [names.length]: [],
        [names.angle]: [],
      }
      bindings[names[tool]].push(MouseBindings.Primary)
      // setToolActive дописывает привязки к прежним — поэтому сначала снимаем все.
      for (const [name, buttons] of Object.entries(bindings)) {
        group.setToolPassive(name, { removeAllBindings: true })
        if (buttons.length) group.setToolActive(name, { bindings: buttons.map((mouseButton) => ({ mouseButton })) })
      }
    },

    setVOI(width, center) {
      if (!viewport || !cs) return
      const range = cs.core.utilities.windowLevel.toLowHighRange(width, center)
      viewport.setProperties({ voiRange: { lower: range.lower, upper: range.upper } })
      viewport.render()
      emit()
    },

    setInvert(inverted) {
      if (!viewport) return
      viewport.setProperties({ invert: inverted })
      viewport.render()
      emit()
    },

    reset() {
      if (!viewport) return
      viewport.resetCamera()
      viewport.resetProperties()
      viewport.render()
      emit()
    },

    onChange(listener) {
      changeListeners.add(listener)
      return () => changeListeners.delete(listener)
    },

    onError(listener) {
      errorListeners.add(listener)
      return () => errorListeners.delete(listener)
    },

    destroy() {
      cleanups.splice(0).forEach((cleanup) => cleanup())
      cs?.tools.ToolGroupManager.destroyToolGroup(id)
      engine?.destroy()
      engine = null
      viewport = null
      changeListeners.clear()
      errorListeners.clear()
    },
  }
}
