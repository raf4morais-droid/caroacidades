import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'

// Synthetic terrain point cloud for Tupanciretã area (UTM 22S)
// Demos all 7 req (228-234); replaced by Potree when VITE_POTREE_URL is set.

const N = 80_000
const AREA = 2000 // 2km × 2km

type ColorMode = 'elevation' | 'intensity' | 'classification'

function buildPositions(): { pos: Float32Array; ints: Float32Array; zMin: number; zMax: number } {
  const pos = new Float32Array(N * 3)
  const ints = new Float32Array(N)
  let zMin = Infinity, zMax = -Infinity

  for (let i = 0; i < N; i++) {
    const x = (Math.random() - 0.5) * AREA
    const y = (Math.random() - 0.5) * AREA
    const z =
      Math.sin(x / 360) * 18 + Math.sin(y / 260) * 14 +
      Math.sin((x - y) / 500) * 12 + Math.sin(x / 120) * 5 +
      Math.sin(y / 180) * 4 + (Math.random() - 0.5) * 1.5

    pos[i * 3] = x
    pos[i * 3 + 1] = z * 4   // 4× vertical exaggeration
    pos[i * 3 + 2] = y
    ints[i] = 0.3 + Math.random() * 0.7

    if (z < zMin) zMin = z
    if (z > zMax) zMax = z
  }
  return { pos, ints, zMin, zMax }
}

function elevColors(pos: Float32Array, zMin: number, zMax: number): Float32Array {
  const c = new Float32Array(N * 3)
  const range = zMax - zMin
  for (let i = 0; i < N; i++) {
    const t = (pos[i * 3 + 1] / 4 - zMin) / range
    let r: number, g: number, b: number
    if (t < 0.25) { r = 0; g = t * 4; b = 1 }
    else if (t < 0.5) { r = 0; g = 1; b = 1 - (t - 0.25) * 4 }
    else if (t < 0.75) { r = (t - 0.5) * 4; g = 1; b = 0 }
    else { r = 1; g = 1 - (t - 0.75) * 4; b = 0 }
    c[i * 3] = r; c[i * 3 + 1] = g; c[i * 3 + 2] = b
  }
  return c
}

function intColors(ints: Float32Array): Float32Array {
  const c = new Float32Array(N * 3)
  for (let i = 0; i < N; i++) {
    const v = ints[i]; c[i * 3] = v; c[i * 3 + 1] = v; c[i * 3 + 2] = v
  }
  return c
}

const CLASS_COLORS = [[0.55, 0.35, 0.15], [0.5, 0.8, 0.2], [0.2, 0.6, 0.1], [0.1, 0.3, 0.05]]
function classColors(pos: Float32Array, zMin: number, zMax: number): Float32Array {
  const c = new Float32Array(N * 3)
  const range = zMax - zMin
  for (let i = 0; i < N; i++) {
    const t = (pos[i * 3 + 1] / 4 - zMin) / range
    const [r, g, b] = CLASS_COLORS[Math.min(3, Math.floor(t * 4))]
    c[i * 3] = r; c[i * 3 + 1] = g; c[i * 3 + 2] = b
  }
  return c
}

// Shoelace on XZ plane (real meters — X and Z not exaggerated)
function shoelaceXZ(pts: THREE.Vector3[]): number {
  let s = 0
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length
    s += pts[i].x * pts[j].z - pts[j].x * pts[i].z
  }
  return Math.abs(s) / 2
}

// Ray-casting PIP on XZ plane
function pipXZ(px: number, pz: number, poly: THREE.Vector3[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, zi = poly[i].z
    const xj = poly[j].x, zj = poly[j].z
    if ((zi > pz) !== (zj > pz) && px < (xj - xi) * (pz - zi) / (zj - zi) + xi)
      inside = !inside
  }
  return inside
}

// Orbit: left-drag=rotate, right-drag=pan, scroll=zoom (req 231)
class Orbit {
  private theta = Math.PI / 4
  private phi = Math.PI / 3
  private radius = 1600
  private isOrbit = false
  private isPan = false
  private lastX = 0; private lastY = 0
  private target = new THREE.Vector3()

  constructor(private cam: THREE.PerspectiveCamera, private el: HTMLElement) {
    this.apply()
    el.addEventListener('mousedown', this.down)
    el.addEventListener('wheel', this.wheel, { passive: false })
    el.addEventListener('contextmenu', (e) => e.preventDefault())
  }

  private down = (e: MouseEvent) => {
    if (e.button === 2) this.isPan = true; else this.isOrbit = true
    this.lastX = e.clientX; this.lastY = e.clientY
    document.addEventListener('mousemove', this.move)
    document.addEventListener('mouseup', this.up)
  }
  private move = (e: MouseEvent) => {
    const dx = e.clientX - this.lastX, dy = e.clientY - this.lastY
    this.lastX = e.clientX; this.lastY = e.clientY
    if (this.isPan) {
      const right = new THREE.Vector3().setFromMatrixColumn(this.cam.matrix, 0)
      const up = new THREE.Vector3().setFromMatrixColumn(this.cam.matrix, 1)
      const s = this.radius * 0.001
      this.target.addScaledVector(right, -dx * s).addScaledVector(up, dy * s)
    } else if (this.isOrbit) {
      this.theta -= dx * 0.006
      this.phi = Math.max(0.08, Math.min(Math.PI / 2, this.phi - dy * 0.006))
    }
    this.apply()
  }
  private up = () => {
    this.isOrbit = false; this.isPan = false
    document.removeEventListener('mousemove', this.move)
    document.removeEventListener('mouseup', this.up)
  }
  private wheel = (e: WheelEvent) => {
    e.preventDefault()
    this.radius = Math.max(100, Math.min(5000, this.radius * (e.deltaY > 0 ? 1.12 : 0.89)))
    this.apply()
  }
  private apply() {
    this.cam.position.set(
      this.target.x + this.radius * Math.sin(this.phi) * Math.sin(this.theta),
      this.target.y + this.radius * Math.cos(this.phi),
      this.target.z + this.radius * Math.sin(this.phi) * Math.cos(this.theta),
    )
    this.cam.lookAt(this.target)
  }
  dispose() {
    this.el.removeEventListener('mousedown', this.down)
    this.el.removeEventListener('wheel', this.wheel)
  }
}

type AnnotEntry = { pos3d: THREE.Vector3; el: HTMLDivElement }
type ProfilePt = { t: number; h: number }
type AreaResult = { area: number; vol: number }

export function PointCloudViewer() {
  const mountRef = useRef<HTMLDivElement>(null)
  const profileCanvasRef = useRef<HTMLCanvasElement>(null)

  const stateRef = useRef<{
    renderer: THREE.WebGLRenderer
    scene: THREE.Scene
    camera: THREE.PerspectiveCamera
    orbit: Orbit
    geo: THREE.BufferGeometry
    pts: THREE.Points
    mat: THREE.PointsMaterial
    raycaster: THREE.Raycaster
    mouse: THREE.Vector2
    // distance
    measurePt1: THREE.Vector3 | null
    markers: THREE.Object3D[]
    // area
    areaPts3D: THREE.Vector3[]
    areaMarkers: THREE.Object3D[]
    // profile/cross-section
    profilePt1: THREE.Vector3 | null
    profileMarkers: THREE.Object3D[]
    // annotations
    annotOverlay: HTMLDivElement
    annotations: AnnotEntry[]
    animId: number
    data: ReturnType<typeof buildPositions>
  } | null>(null)

  const [hover, setHover] = useState<{ x: number; y: number; z: number; i: number } | null>(null)

  const [measureMode, setMeasureMode] = useState(false)
  const measureModeRef = useRef(false)
  const [measureStep, setMeasureStep] = useState<0 | 1>(0)
  const [dist, setDist] = useState<number | null>(null)

  const [areaMode, setAreaMode] = useState(false)
  const areaModeRef = useRef(false)
  const [areaPtCount, setAreaPtCount] = useState(0)
  const [areaResult, setAreaResult] = useState<AreaResult | null>(null)

  const [profileMode, setProfileMode] = useState(false)
  const profileModeRef = useRef(false)
  const [profileStep, setProfileStep] = useState<0 | 1 | 2>(0) // 0=idle,1=first,2=done
  const [profileData, setProfileData] = useState<ProfilePt[] | null>(null)
  const [profileLen, setProfileLen] = useState(0)

  const [annotMode, setAnnotMode] = useState(false)
  const annotModeRef = useRef(false)

  const [colorMode, setColorMode] = useState<ColorMode>('elevation')
  const [density, setDensity] = useState(100)
  const [pxSize, setPxSize] = useState(2)
  const [visible, setVisible] = useState(N)

  useEffect(() => { measureModeRef.current = measureMode }, [measureMode])
  useEffect(() => { areaModeRef.current = areaMode }, [areaMode])
  useEffect(() => { profileModeRef.current = profileMode }, [profileMode])
  useEffect(() => { annotModeRef.current = annotMode }, [annotMode])

  // Draw cross-section profile on canvas when data changes
  useEffect(() => {
    const canvas = profileCanvasRef.current
    if (!canvas || !profileData || profileData.length === 0) return
    const dpr = Math.min(window.devicePixelRatio, 2)
    const W = canvas.offsetWidth, H = canvas.offsetHeight
    canvas.width = W * dpr; canvas.height = H * dpr
    const ctx = canvas.getContext('2d')!
    ctx.scale(dpr, dpr)
    ctx.fillStyle = '#0f172a'; ctx.fillRect(0, 0, W, H)

    const pad = { top: 24, right: 16, bottom: 28, left: 52 }
    const pw = W - pad.left - pad.right, ph = H - pad.top - pad.bottom

    const tMin = profileData[0].t, tMax = profileData[profileData.length - 1].t
    let hMin = Infinity, hMax = -Infinity
    for (const p of profileData) { if (p.h < hMin) hMin = p.h; if (p.h > hMax) hMax = p.h }
    const tRange = tMax - tMin || 1, hRange = hMax - hMin || 1

    const toX = (t: number) => pad.left + ((t - tMin) / tRange) * pw
    const toY = (h: number) => pad.top + ph - ((h - hMin) / hRange) * ph

    // Points
    ctx.fillStyle = 'rgba(74,222,128,0.55)'
    for (const p of profileData) {
      ctx.fillRect(Math.round(toX(p.t)), Math.round(toY(p.h)), 1, 1)
    }

    // Axes
    ctx.strokeStyle = '#334155'; ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(pad.left, pad.top); ctx.lineTo(pad.left, pad.top + ph)
    ctx.lineTo(pad.left + pw, pad.top + ph)
    ctx.stroke()

    // Grid Y
    ctx.strokeStyle = '#1e3a5f'; ctx.lineWidth = 0.5
    for (let i = 1; i < 4; i++) {
      const y = pad.top + (ph * i / 4)
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + pw, y); ctx.stroke()
    }

    // Labels
    ctx.fillStyle = '#64748b'; ctx.font = '10px monospace'
    ctx.fillText(`${hMin.toFixed(1)}m`, 2, pad.top + ph + 3)
    ctx.fillText(`${hMax.toFixed(1)}m`, 2, pad.top + 10)
    ctx.fillText('0', pad.left - 10, pad.top + ph + 14)
    ctx.fillText(`${profileLen.toFixed(0)}m`, pad.left + pw - 25, pad.top + ph + 14)
    ctx.fillStyle = '#94a3b8'; ctx.font = '11px sans-serif'
    ctx.fillText(`✂ Corte em seção  (${profileData.length} pts)`, pad.left + 8, pad.top - 6)
  }, [profileData, profileLen])

  // Mount Three.js scene
  useEffect(() => {
    const el = mountRef.current
    if (!el) return

    const W = el.clientWidth, H = el.clientHeight
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x0f172a)

    const camera = new THREE.PerspectiveCamera(55, W / H, 1, 15000)
    camera.position.set(1200, 700, 1200); camera.lookAt(0, 0, 0)

    const renderer = new THREE.WebGLRenderer({ antialias: false })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
    renderer.setSize(W, H)
    el.style.position = 'relative'
    el.appendChild(renderer.domElement)

    const annotOverlay = document.createElement('div')
    annotOverlay.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden;'
    el.appendChild(annotOverlay)

    const orbit = new Orbit(camera, renderer.domElement)

    const data = buildPositions()
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(data.pos, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(elevColors(data.pos, data.zMin, data.zMax), 3))
    geo.setDrawRange(0, N)

    const mat = new THREE.PointsMaterial({ size: 2, vertexColors: true, sizeAttenuation: false })
    const pts = new THREE.Points(geo, mat)
    scene.add(pts)

    const grid = new THREE.GridHelper(2200, 22, 0x1e3a5f, 0x1e3a5f)
    grid.position.y = data.zMin * 4 - 10
    scene.add(grid)

    const raycaster = new THREE.Raycaster()
    raycaster.params.Points!.threshold = 10

    const state = {
      renderer, scene, camera, orbit, geo, pts, mat, raycaster,
      mouse: new THREE.Vector2(-9, -9),
      measurePt1: null as THREE.Vector3 | null,
      markers: [] as THREE.Object3D[],
      areaPts3D: [] as THREE.Vector3[],
      areaMarkers: [] as THREE.Object3D[],
      profilePt1: null as THREE.Vector3 | null,
      profileMarkers: [] as THREE.Object3D[],
      annotOverlay,
      annotations: [] as AnnotEntry[],
      animId: 0, data,
    }
    stateRef.current = state

    // Hover (req 229)
    let hoverTimer = 0
    const onMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect()
      state.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      state.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
      clearTimeout(hoverTimer)
      hoverTimer = window.setTimeout(() => {
        raycaster.setFromCamera(state.mouse, camera)
        const hits = raycaster.intersectObject(pts)
        if (hits.length > 0 && hits[0].index !== undefined) {
          const idx = hits[0].index
          setHover({
            x: data.pos[idx * 3] + 209200,
            y: data.pos[idx * 3 + 2] + 6784500,
            z: data.pos[idx * 3 + 1] / 4,
            i: data.ints[idx],
          })
        } else setHover(null)
      }, 40)
    }

    const markerSphere = (pt: THREE.Vector3, color: number, r = 6) => {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(r, 8, 8),
        new THREE.MeshBasicMaterial({ color })
      )
      m.position.copy(pt); scene.add(m)
      return m
    }

    // Click handler: delegates to active mode
    const onClick = () => {
      const anyActive = measureModeRef.current || areaModeRef.current ||
        profileModeRef.current || annotModeRef.current
      if (!anyActive) return
      raycaster.setFromCamera(state.mouse, camera)
      const hits = raycaster.intersectObject(pts)
      if (hits.length === 0) return
      const pt = hits[0].point.clone()

      // Annotation (req 233)
      if (annotModeRef.current) {
        const text = window.prompt('Texto da anotação:')
        if (!text) return
        state.markers.push(markerSphere(pt, 0xfbbf24, 8))
        const labelEl = document.createElement('div')
        labelEl.textContent = '📍 ' + text
        labelEl.style.cssText = 'position:absolute;background:rgba(251,191,36,0.92);color:#0f172a;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;white-space:nowrap;transform:translate(-50%,-130%)'
        annotOverlay.appendChild(labelEl)
        state.annotations.push({ pos3d: pt, el: labelEl })
        return
      }

      // Profile / cross-section (req 232)
      if (profileModeRef.current) {
        if (!state.profilePt1) {
          state.profilePt1 = pt
          state.profileMarkers.push(markerSphere(pt, 0xa855f7))
          setProfileStep(1)
        } else {
          const p0 = state.profilePt1
          // Direction in XZ
          const dx = pt.x - p0.x, dz = pt.z - p0.z
          const len = Math.sqrt(dx * dx + dz * dz)
          const nx = dx / len, nz = dz / len // line direction
          const CORRIDOR = Math.max(30, len * 0.03) // adaptive corridor width

          const results: ProfilePt[] = []
          const pos = data.pos
          for (let i = 0; i < N; i++) {
            const px = pos[i * 3], pz = pos[i * 3 + 2]
            const ex = px - p0.x, ez = pz - p0.z
            const t = ex * nx + ez * nz                  // distance along line
            const perp = Math.abs(ex * nz - ez * nx)     // perpendicular distance
            if (perp <= CORRIDOR) {
              results.push({ t, h: pos[i * 3 + 1] / 4 })
            }
          }
          results.sort((a, b) => a.t - b.t)

          // Draw section line
          const lineGeo = new THREE.BufferGeometry().setFromPoints([p0, pt])
          const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0xa855f7 }))
          scene.add(line); state.profileMarkers.push(line)
          state.profileMarkers.push(markerSphere(pt, 0xa855f7))

          setProfileData(results)
          setProfileLen(len)
          state.profilePt1 = null
          setProfileStep(2)
        }
        return
      }

      // Area mode (req 232)
      if (areaModeRef.current) {
        state.areaMarkers.push(markerSphere(pt, 0x22d3ee, 5))
        if (state.areaPts3D.length > 0) {
          const prev = state.areaPts3D[state.areaPts3D.length - 1]
          const lg = new THREE.BufferGeometry().setFromPoints([prev, pt])
          const l = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: 0x22d3ee }))
          scene.add(l); state.areaMarkers.push(l)
        }
        state.areaPts3D.push(pt)
        setAreaPtCount(state.areaPts3D.length)
        return
      }

      // Distance (req 232)
      if (!state.measurePt1) {
        state.measurePt1 = pt
        state.markers.push(markerSphere(pt, 0xff4444))
        setMeasureStep(1)
      } else {
        const p1 = state.measurePt1
        const ddx = pt.x - p1.x, ddy = (pt.y - p1.y) / 4, ddz = pt.z - p1.z
        setDist(Math.sqrt(ddx * ddx + ddy * ddy + ddz * ddz))

        const lg = new THREE.BufferGeometry().setFromPoints([p1, pt])
        const l = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: 0xfbbf24 }))
        scene.add(l); state.markers.push(l)
        state.markers.push(markerSphere(pt, 0xff4444))
        state.measurePt1 = null; setMeasureStep(0)
      }
    }

    renderer.domElement.addEventListener('mousemove', onMove)
    renderer.domElement.addEventListener('click', onClick)
    const onResize = () => {
      camera.aspect = el.clientWidth / el.clientHeight
      camera.updateProjectionMatrix()
      renderer.setSize(el.clientWidth, el.clientHeight)
    }
    window.addEventListener('resize', onResize)

    const animate = () => {
      state.animId = requestAnimationFrame(animate)
      renderer.render(scene, camera)
      const cW = el.clientWidth, cH = el.clientHeight
      for (const ann of state.annotations) {
        const v = ann.pos3d.clone().project(camera)
        if (v.z < 1) {
          ann.el.style.left = ((v.x * 0.5 + 0.5) * cW) + 'px'
          ann.el.style.top = ((-v.y * 0.5 + 0.5) * cH) + 'px'
          ann.el.style.display = 'block'
        } else ann.el.style.display = 'none'
      }
    }
    animate()

    return () => {
      cancelAnimationFrame(state.animId)
      clearTimeout(hoverTimer)
      orbit.dispose()
      renderer.domElement.removeEventListener('mousemove', onMove)
      renderer.domElement.removeEventListener('click', onClick)
      window.removeEventListener('resize', onResize)
      state.annotations.forEach((a) => a.el.remove())
      annotOverlay.remove()
      geo.dispose(); mat.dispose(); renderer.dispose()
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement)
      stateRef.current = null
    }
  }, [])

  // Color mode (req 233)
  useEffect(() => {
    const s = stateRef.current; if (!s) return
    const { data } = s
    const c = colorMode === 'elevation' ? elevColors(data.pos, data.zMin, data.zMax)
      : colorMode === 'intensity' ? intColors(data.ints)
        : classColors(data.pos, data.zMin, data.zMax)
    s.geo.setAttribute('color', new THREE.BufferAttribute(c, 3))
  }, [colorMode])

  // Density (req 234)
  useEffect(() => {
    const s = stateRef.current; if (!s) return
    const n = Math.max(2000, Math.floor(N * density / 100))
    s.geo.setDrawRange(0, n); setVisible(n)
  }, [density])

  // Point size (req 234)
  useEffect(() => {
    const s = stateRef.current; if (!s) return
    s.mat.size = pxSize
  }, [pxSize])

  function clearMeasure() {
    const s = stateRef.current; if (!s) return
    s.markers.forEach((m) => s.scene.remove(m)); s.markers = []
    s.measurePt1 = null; setMeasureMode(false); setMeasureStep(0); setDist(null)
  }

  function clearArea() {
    const s = stateRef.current; if (!s) return
    s.areaMarkers.forEach((m) => s.scene.remove(m)); s.areaMarkers = []; s.areaPts3D = []
    setAreaMode(false); setAreaPtCount(0); setAreaResult(null)
  }

  function clearProfile() {
    const s = stateRef.current; if (!s) return
    s.profileMarkers.forEach((m) => s.scene.remove(m)); s.profileMarkers = []
    s.profilePt1 = null; setProfileMode(false); setProfileStep(0); setProfileData(null); setProfileLen(0)
  }

  function closeArea() {
    const s = stateRef.current; if (!s || s.areaPts3D.length < 3) return
    const first = s.areaPts3D[0], last = s.areaPts3D[s.areaPts3D.length - 1]
    const cg = new THREE.BufferGeometry().setFromPoints([last, first])
    const cl = new THREE.Line(cg, new THREE.LineBasicMaterial({ color: 0x22d3ee }))
    s.scene.add(cl); s.areaMarkers.push(cl)

    const area = shoelaceXZ(s.areaPts3D)

    // Volume: points inside polygon, avg height above base elevation
    const pos = s.data.pos, base = s.data.zMin
    let sumH = 0, cnt = 0
    for (let i = 0; i < N; i++) {
      if (pipXZ(pos[i * 3], pos[i * 3 + 2], s.areaPts3D)) {
        sumH += pos[i * 3 + 1] / 4 - base
        cnt++
      }
    }
    const vol = cnt > 0 ? area * (sumH / cnt) : 0

    setAreaResult({ area, vol })
    setAreaMode(false)
  }

  function toggleMeasure() {
    if (measureMode) { clearMeasure(); return }
    clearArea(); clearProfile(); setAnnotMode(false); setMeasureMode(true)
  }
  function toggleArea() {
    if (areaMode) { clearArea(); return }
    clearMeasure(); clearProfile(); setAnnotMode(false); setAreaMode(true)
  }
  function toggleProfile() {
    if (profileMode) { clearProfile(); return }
    clearMeasure(); clearArea(); setAnnotMode(false); setProfileMode(true)
  }
  function toggleAnnot() {
    if (annotMode) { setAnnotMode(false); return }
    clearMeasure(); clearArea(); clearProfile(); setAnnotMode(true)
  }

  const fmtArea = (a: number) => a >= 10000 ? `${(a / 10000).toFixed(4)} ha` : `${a.toFixed(1)} m²`
  const fmtVol = (v: number) => v >= 1000000 ? `${(v / 1000000).toFixed(3)} Mm³`
    : v >= 1000 ? `${(v / 1000).toFixed(2)} km³` : `${v.toFixed(0)} m³`

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#0f172a' }}>

      {/* Top bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 7, padding: '6px 12px',
        background: 'rgba(30,58,95,0.97)', flexShrink: 0, flexWrap: 'wrap',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
      }}>
        <span style={{ color: 'white', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
          🛰️ Nuvem de Pontos 3D
        </span>
        <span style={{ color: '#64748b', fontSize: 11, flexShrink: 0 }}>
          {visible.toLocaleString('pt-BR')} pts
        </span>

        {/* Coordinate readout — req 229 */}
        <div style={{
          background: 'rgba(0,0,0,0.5)', borderRadius: 6, padding: '3px 10px',
          fontFamily: 'monospace', fontSize: 11, color: hover ? '#4ade80' : '#475569',
          flexGrow: 1, minWidth: 240,
        }}>
          {hover
            ? `E ${hover.x.toFixed(1)}  N ${hover.y.toFixed(1)}  Z ${hover.z.toFixed(2)} m  Int ${(hover.i * 100).toFixed(0)}%`
            : 'Passe o mouse sobre um ponto'}
        </div>

        {/* Distance — req 232 */}
        <button onClick={toggleMeasure} style={{
          background: measureMode ? '#7f1d1d' : '#1e3a5f', color: 'white',
          border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6,
          padding: '4px 9px', cursor: 'pointer', fontSize: 12, fontWeight: 600, flexShrink: 0,
        }}>{measureMode ? '✕' : '📏 Dist.'}</button>
        {measureMode && <span style={{ color: '#fbbf24', fontSize: 11, fontStyle: 'italic', flexShrink: 0 }}>
          {measureStep === 0 ? '→ 1º ponto' : '→ 2º ponto'}
        </span>}
        {dist !== null && <span style={{ color: '#fbbf24', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>{dist.toFixed(2)} m</span>}

        {/* Area + Volume — req 232 */}
        <button onClick={toggleArea} style={{
          background: areaMode ? '#14532d' : '#1e3a5f', color: 'white',
          border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6,
          padding: '4px 9px', cursor: 'pointer', fontSize: 12, fontWeight: 600, flexShrink: 0,
        }}>{areaMode ? '✕' : '⬛ Área'}</button>
        {areaMode && areaPtCount >= 3 && (
          <button onClick={closeArea} style={{
            background: '#166534', color: 'white', border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 6, padding: '4px 9px', cursor: 'pointer', fontSize: 12, fontWeight: 600, flexShrink: 0,
          }}>Fechar ({areaPtCount})</button>
        )}
        {areaMode && areaPtCount < 3 && (
          <span style={{ color: '#22d3ee', fontSize: 11, fontStyle: 'italic', flexShrink: 0 }}>
            {areaPtCount === 0 ? '→ Clique para iniciar' : `${areaPtCount} pts — mais ${3 - areaPtCount}`}
          </span>
        )}
        {areaResult && <>
          <span style={{ color: '#22d3ee', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{fmtArea(areaResult.area)}</span>
          <span style={{ color: '#a3e635', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>Vol≈{fmtVol(areaResult.vol)}</span>
        </>}

        {/* Profile / cross-section — req 232 */}
        <button onClick={toggleProfile} style={{
          background: profileMode ? '#4c1d95' : '#1e3a5f', color: 'white',
          border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6,
          padding: '4px 9px', cursor: 'pointer', fontSize: 12, fontWeight: 600, flexShrink: 0,
        }}>{profileMode ? '✕' : '✂ Perfil'}</button>
        {profileMode && <span style={{ color: '#c084fc', fontSize: 11, fontStyle: 'italic', flexShrink: 0 }}>
          {profileStep === 0 || profileStep === 2 ? '→ 1º ponto' : '→ 2º ponto da seção'}
        </span>}

        {/* Annotation — req 233 */}
        <button onClick={toggleAnnot} style={{
          background: annotMode ? '#713f12' : '#1e3a5f', color: 'white',
          border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6,
          padding: '4px 9px', cursor: 'pointer', fontSize: 12, fontWeight: 600, flexShrink: 0,
        }}>{annotMode ? '✕' : '📍 Anotar'}</button>
        {annotMode && <span style={{ color: '#fbbf24', fontSize: 11, fontStyle: 'italic', flexShrink: 0 }}>→ Clique em um ponto</span>}
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>
        {/* 3D canvas column */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {/* 3D viewport */}
          <div ref={mountRef} style={{ flex: 1, minHeight: 0 }} />

          {/* Cross-section profile panel — req 232 */}
          {profileData && (
            <div style={{ height: 160, background: '#0a0f1e', borderTop: '1px solid #1e3a5f', flexShrink: 0, position: 'relative' }}>
              <button
                onClick={clearProfile}
                style={{
                  position: 'absolute', top: 4, right: 8, background: 'transparent',
                  color: '#475569', border: 'none', cursor: 'pointer', fontSize: 14, zIndex: 1,
                }}
              >✕</button>
              <canvas ref={profileCanvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
            </div>
          )}
        </div>

        {/* Controls panel — req 233/234 */}
        <div style={{
          width: 192, background: 'rgba(15,23,42,0.98)', padding: '14px 12px',
          display: 'flex', flexDirection: 'column', gap: 14, flexShrink: 0,
          borderLeft: '1px solid rgba(255,255,255,0.06)', overflowY: 'auto',
        }}>
          {/* Color scheme */}
          <div>
            <label style={{ color: '#94a3b8', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>
              Cores / Intensidade
            </label>
            <select
              value={colorMode}
              onChange={(e) => setColorMode(e.target.value as ColorMode)}
              style={{
                marginTop: 7, width: '100%', background: '#1e293b', color: 'white',
                border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, padding: '6px 8px', fontSize: 12,
              }}
            >
              <option value="elevation">Hipsométrico (elevação)</option>
              <option value="intensity">Intensidade de retorno</option>
              <option value="classification">Classificação LiDAR</option>
            </select>
            <div style={{ display: 'flex', marginTop: 5, borderRadius: 4, overflow: 'hidden' }}>
              {colorMode === 'elevation' && ['#0000ff', '#00ff00', '#ffff00', '#ff0000'].map((c) => (
                <div key={c} style={{ flex: 1, height: 6, background: c }} />
              ))}
              {colorMode === 'intensity' && ['#111', '#555', '#aaa', '#fff'].map((c) => (
                <div key={c} style={{ flex: 1, height: 6, background: c }} />
              ))}
              {colorMode === 'classification' && ['#8b5a26', '#80cc33', '#33991a', '#1a4d0a'].map((c) => (
                <div key={c} style={{ flex: 1, height: 6, background: c }} />
              ))}
            </div>
          </div>

          {/* Density */}
          <div>
            <label style={{ color: '#94a3b8', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>
              Densificação: {density}%
            </label>
            <input type="range" min={10} max={100} step={5} value={density}
              onChange={(e) => setDensity(Number(e.target.value))}
              style={{ width: '100%', marginTop: 6, accentColor: '#3b82f6' }} />
          </div>

          {/* Point size */}
          <div>
            <label style={{ color: '#94a3b8', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>
              Tamanho: {pxSize}px
            </label>
            <input type="range" min={1} max={8} step={0.5} value={pxSize}
              onChange={(e) => setPxSize(Number(e.target.value))}
              style={{ width: '100%', marginTop: 6, accentColor: '#3b82f6' }} />
          </div>

          <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 10 }}>
            <p style={{ color: '#475569', fontSize: 10, margin: 0, lineHeight: 1.6 }}>
              <strong style={{ color: '#94a3b8' }}>Navegação</strong><br />
              Arrastar: rotacionar<br />
              Btn direito: mover<br />
              Scroll: zoom
            </p>
          </div>

          <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 10 }}>
            <p style={{ color: '#92400e', fontSize: 10, margin: 0, lineHeight: 1.6, background: 'rgba(120,53,15,0.15)', padding: 8, borderRadius: 6 }}>
              <strong style={{ color: '#fbbf24' }}>⚠️ Dados sintéticos</strong><br />
              Terreno de demonstração. Aguardando aerolevantamento (Jun/Jul 2026). Configurar <code>VITE_POTREE_URL</code> para produção.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
