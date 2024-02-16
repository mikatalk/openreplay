import App from '../app/index.js'
import { hasTag } from './guards.js'
import Message, { CanvasNode } from './messages.gen.js'

// create a dummy canvas outside to reuse over and over without affecting memory
const resizedCanvas = document.createElement('canvas')

interface CanvasSnapshot {
  images: { data: string; id: number }[]
  createdAt: number
}

interface Options {
  fps: number
  quality: 'low' | 'medium' | 'high'
  isDebug?: boolean
}

class CanvasRecorder {
  private snapshots: Record<number, CanvasSnapshot> = {}
  private readonly intervals: NodeJS.Timeout[] = []
  private readonly interval: number

  constructor(
    private readonly app: App,
    private readonly options: Options,
  ) {
    this.interval = 1000 / options.fps
  }

  startTracking() {
    setTimeout(() => {
      this.app.nodes.scanTree(this.handleCanvasEl)
      this.app.nodes.attachNodeCallback((node: Node): void => {
        this.handleCanvasEl(node)
      })
    }, 500)
  }

  restartTracking = () => {
    this.clear()
    this.app.nodes.scanTree(this.handleCanvasEl)
  }

  handleCanvasEl = (node: Node) => {
    const id = this.app.nodes.getID(node)
    if (!id || !hasTag(node, 'canvas')) {
      return
    }

    const isIgnored = this.app.sanitizer.isObscured(id) || this.app.sanitizer.isHidden(id)
    if (isIgnored || !hasTag(node, 'canvas') || this.snapshots[id]) {
      return
    }
    const ts = this.app.timestamp()
    this.snapshots[id] = {
      images: [],
      createdAt: ts,
    }
    const canvasMsg = CanvasNode(id.toString(), ts)
    this.app.send(canvasMsg as Message)
    const int = setInterval(() => {
      const cid = this.app.nodes.getID(node)
      const canvas = cid ? this.app.nodes.getNode(cid) : undefined
      if (!canvas || !hasTag(canvas, 'canvas') || canvas !== node) {
        this.app.debug.log('Canvas element not in sync')
        clearInterval(int)
      } else {
        const snapshot = captureSnapshot(canvas, this.options.quality)
        this.snapshots[id].images.push({ id: this.app.timestamp(), data: snapshot })
        if (this.snapshots[id].images.length > 9) {
          this.sendSnaps(this.snapshots[id].images, id, this.snapshots[id].createdAt)
          this.snapshots[id].images = []
        }
      }
    }, this.interval)
    this.intervals.push(int)
  }

  sendSnaps(images: { data: string; id: number }[], canvasId: number, createdAt: number) {
    if (Object.keys(this.snapshots).length === 0) {
      return
    }
    const formData = new FormData()
    images.forEach((snapshot) => {
      const blob = dataUrlToBlob(snapshot.data)
      if (!blob) return
      formData.append('snapshot', blob[0], `${createdAt}_${canvasId}_${snapshot.id}.jpeg`)
      if (this.options.isDebug) {
        saveImageData(snapshot.data, `${createdAt}_${canvasId}_${snapshot.id}.jpeg`)
      }
    })

    fetch(this.app.options.ingestPoint + '/v1/web/images', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.app.session.getSessionToken() ?? ''}`,
      },
      body: formData,
    })
      .then(() => {
        return true
      })
      .catch((e) => {
        this.app.debug.error('error saving canvas', e)
      })
  }

  clear() {
    this.intervals.forEach((int) => clearInterval(int))
    this.snapshots = {}
  }
}

const qualityInt = {
  low: 0.33,
  medium: 0.55,
  high: 0.8,
}

function captureSnapshot(canvas: HTMLCanvasElement, quality: 'low' | 'medium' | 'high' = 'medium') {
  const scale = 0.25, // 1/4 downscale
    maxWidth = 1000, // max width of 1000 px
    maxHeight = 1000, // max height of 1000 px
    imageFormat = 'image/jpeg' // or /png';

  // scale new size
  let width = canvas.width * scale;
  let height = canvas.height * scale;

  // fit within max bounds
  const scaleX = width / maxWidth;
  const scaleY = height / maxHeight;
  if (scaleX > 0 || scaleY > 0) {
    // out of bound, scale down
    const scale = Math.min(scaleX, scaleY);
    width *= scale;
    height *= scale;
  }
  
  // resize dummy canvas to the new capture size:
  resizedCanvas.height = canvas.width * scale;
  resizedCanvas.width = canvas.height* scale;
  
  // clear and draw the new image capture to the scaled target
  resizedContext.clearRect(canvas, 0, 0, resizedContext.width, resizedContext.height);
  resizedContext.drawImage(canvas, 0, 0, resizedContext.width, resizedContext.height);
  
  return resizedCanvas.toDataURL(imageFormat, qualityInt[quality])
}

function dataUrlToBlob(dataUrl: string): [Blob, Uint8Array] | null {
  const [header, base64] = dataUrl.split(',')
  const encParts = header.match(/:(.*?);/)
  if (!encParts) return null
  const mime = encParts[1]
  const blobStr = atob(base64)
  let n = blobStr.length
  const u8arr = new Uint8Array(n)

  while (n--) {
    u8arr[n] = blobStr.charCodeAt(n)
  }

  return [new Blob([u8arr], { type: mime }), u8arr]
}

function saveImageData(imageDataUrl: string, name: string) {
  const link = document.createElement('a')
  link.href = imageDataUrl
  link.download = name
  link.style.display = 'none'

  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

export default CanvasRecorder
