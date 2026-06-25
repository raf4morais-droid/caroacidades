// Renderiza tiles OpenStreetMap no canvas (CORS: Access-Control-Allow-Origin: *)
// e retorna base64 JPEG para incorporar em PDFs jsPDF.

const TILE_SIZE = 256
const OSM_URL = 'https://tile.openstreetmap.org'

function latLngToTilePixel(lat: number, lng: number, zoom: number) {
  const n = Math.pow(2, zoom)
  const xtile = (lng + 180) / 360 * n
  const ytile = (1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * n
  return { xtile, ytile }
}

async function loadTile(z: number, x: number, y: number): Promise<HTMLImageElement | null> {
  return new Promise(resolve => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = `${OSM_URL}/${z}/${x}/${y}.png`
  })
}

export async function fetchStaticMapImage(
  lat: number,
  lng: number,
  zoom = 17,
  cols = 3,
  rows = 2,
): Promise<string | null> {
  try {
    const { xtile, ytile } = latLngToTilePixel(lat, lng, zoom)
    const centerTileX = Math.floor(xtile)
    const centerTileY = Math.floor(ytile)

    const halfCols = Math.floor(cols / 2)
    const halfRows = Math.floor(rows / 2)

    const canvas = document.createElement('canvas')
    canvas.width = cols * TILE_SIZE
    canvas.height = rows * TILE_SIZE
    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    // Load and draw tiles
    const loads: Promise<void>[] = []
    for (let dy = -halfRows; dy < rows - halfRows; dy++) {
      for (let dx = -halfCols; dx < cols - halfCols; dx++) {
        const tx = centerTileX + dx
        const ty = centerTileY + dy
        const canvasX = (dx + halfCols) * TILE_SIZE
        const canvasY = (dy + halfRows) * TILE_SIZE
        loads.push(
          loadTile(zoom, tx, ty).then(img => {
            if (img) ctx.drawImage(img, canvasX, canvasY)
          })
        )
      }
    }
    await Promise.all(loads)

    // Calculate precise pixel position of the marker within the canvas
    const markerCanvasX = (xtile - (centerTileX - halfCols)) * TILE_SIZE
    const markerCanvasY = (ytile - (centerTileY - halfRows)) * TILE_SIZE

    // Draw marker (red pin)
    ctx.save()
    ctx.strokeStyle = '#dc2626'
    ctx.fillStyle = '#dc2626'
    ctx.lineWidth = 2.5
    // Circle
    ctx.beginPath()
    ctx.arc(markerCanvasX, markerCanvasY, 9, 0, 2 * Math.PI)
    ctx.stroke()
    // Crosshair
    ctx.beginPath()
    ctx.moveTo(markerCanvasX, markerCanvasY - 18)
    ctx.lineTo(markerCanvasX, markerCanvasY + 18)
    ctx.moveTo(markerCanvasX - 18, markerCanvasY)
    ctx.lineTo(markerCanvasX + 18, markerCanvasY)
    ctx.stroke()
    ctx.restore()

    return canvas.toDataURL('image/jpeg', 0.88)
  } catch {
    return null
  }
}

export async function fetchStaticMapFromBounds(
  south: number, west: number, north: number, east: number,
  targetW = 1200, targetH = 900,
): Promise<string | null> {
  try {
    // Find highest zoom where the bounds fit inside targetW × targetH
    let zoom = 10
    for (let z = 19; z >= 10; z--) {
      const nw = latLngToTilePixel(north, west, z)
      const se = latLngToTilePixel(south, east, z)
      const spanW = Math.abs(se.xtile - nw.xtile) * TILE_SIZE
      const spanH = Math.abs(se.ytile - nw.ytile) * TILE_SIZE
      if (spanW <= targetW && spanH <= targetH) { zoom = z; break }
    }

    const centerLat = (north + south) / 2
    const centerLng = (west + east) / 2
    const { xtile, ytile } = latLngToTilePixel(centerLat, centerLng, zoom)
    const centerTileX = Math.floor(xtile)
    const centerTileY = Math.floor(ytile)
    const cols = Math.ceil(targetW / TILE_SIZE) + 2
    const rows = Math.ceil(targetH / TILE_SIZE) + 2
    const halfCols = Math.floor(cols / 2)
    const halfRows = Math.floor(rows / 2)

    const bigCanvas = document.createElement('canvas')
    bigCanvas.width = cols * TILE_SIZE
    bigCanvas.height = rows * TILE_SIZE
    const bigCtx = bigCanvas.getContext('2d')
    if (!bigCtx) return null

    const loads: Promise<void>[] = []
    for (let dy = -halfRows; dy < rows - halfRows; dy++) {
      for (let dx = -halfCols; dx < cols - halfCols; dx++) {
        const tx = centerTileX + dx
        const ty = centerTileY + dy
        const canvasX = (dx + halfCols) * TILE_SIZE
        const canvasY = (dy + halfRows) * TILE_SIZE
        loads.push(loadTile(zoom, tx, ty).then(img => { if (img) bigCtx.drawImage(img, canvasX, canvasY) }))
      }
    }
    await Promise.all(loads)

    // Pixel coordinates of the bounds corners on bigCanvas
    const nwTile = latLngToTilePixel(north, west, zoom)
    const seTile = latLngToTilePixel(south, east, zoom)
    const cropX = (nwTile.xtile - (centerTileX - halfCols)) * TILE_SIZE
    const cropY = (nwTile.ytile - (centerTileY - halfRows)) * TILE_SIZE
    const cropW = (seTile.xtile - nwTile.xtile) * TILE_SIZE
    const cropH = (seTile.ytile - nwTile.ytile) * TILE_SIZE

    const out = document.createElement('canvas')
    out.width = targetW
    out.height = targetH
    const outCtx = out.getContext('2d')
    if (!outCtx) return null
    outCtx.drawImage(bigCanvas, cropX, cropY, cropW, cropH, 0, 0, targetW, targetH)

    // Attribution watermark
    outCtx.font = '12px sans-serif'
    const attr = '© OpenStreetMap contributors'
    const tw = outCtx.measureText(attr).width
    outCtx.fillStyle = 'rgba(255,255,255,0.75)'
    outCtx.fillRect(targetW - tw - 10, targetH - 22, tw + 10, 22)
    outCtx.fillStyle = '#333'
    outCtx.fillText(attr, targetW - tw - 5, targetH - 6)

    return out.toDataURL('image/jpeg', 0.92)
  } catch {
    return null
  }
}
