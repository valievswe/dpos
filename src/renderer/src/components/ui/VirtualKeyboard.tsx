import React, { useCallback, useEffect, useRef, useState } from 'react'

// ─── Key layout ─────────────────────────────────────────────────────────────
const ROWS: string[][] = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', 'BKSP'],
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', "'"],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', '.', 'ENTER'],
  ['SHIFT', 'z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '/', 'SHIFT'],
  ['CAPS', 'SPACE']
]

const SHIFT_MAP: Record<string, string> = {
  '1': '!', '2': '@', '3': '#', '4': '$', '5': '%',
  '6': '^', '7': '&', '8': '*', '9': '(', '0': ')',
  '-': '_', "'": '"', ',': '<', '.': '>', '/': '?'
}

const KEY_LABEL: Record<string, string> = {
  BKSP: '⌫', ENTER: '↵', SHIFT: '⇧', CAPS: 'CAPS', SPACE: 'Probel'
}

const KEY_FLEX: Record<string, number> = {
  BKSP: 1.8, ENTER: 2, SHIFT: 1.9, SPACE: 6
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function resolveChar(key: string, shift: boolean, caps: boolean): string {
  if (key.length === 1) {
    if (/^[a-z]$/.test(key)) return shift !== caps ? key.toUpperCase() : key
    return shift ? (SHIFT_MAP[key] ?? key) : key
  }
  return KEY_LABEL[key] ?? key
}

type EditableEl = HTMLInputElement | HTMLTextAreaElement

function setReactValue(el: EditableEl, value: string) {
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
  setter?.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
}

// ─── Component ───────────────────────────────────────────────────────────────
interface Props {
  enabled: boolean
}

export function VirtualKeyboard({ enabled }: Props) {
  const [visible, setVisible] = useState(false)
  const [caps, setCaps] = useState(false)
  const [shift, setShift] = useState(false)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const posInitialized = useRef(false)
  const activeEl = useRef<EditableEl | null>(null)
  const dragState = useRef<{ ox: number; oy: number; px: number; py: number } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Track focused input
  useEffect(() => {
    function onFocusIn(e: FocusEvent) {
      const t = e.target
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) {
        activeEl.current = t
        if (enabled) {
          if (!posInitialized.current) {
            const kw = Math.min(720, window.innerWidth - 20)
            setPos({
              x: Math.max(0, (window.innerWidth - kw) / 2),
              y: Math.max(10, window.innerHeight - 270)
            })
            posInitialized.current = true
          }
          setVisible(true)
        }
      }
    }
    document.addEventListener('focusin', onFocusIn)
    return () => document.removeEventListener('focusin', onFocusIn)
  }, [enabled])

  // Hide when enabled is turned off
  useEffect(() => {
    if (!enabled) setVisible(false)
  }, [enabled])

  const handleKey = useCallback(
    (key: string) => {
      if (key === 'SHIFT') {
        setShift((p) => !p)
        return
      }
      if (key === 'CAPS') {
        setCaps((p) => !p)
        setShift(false)
        return
      }

      const el = activeEl.current
      if (!el && key !== 'ENTER') return

      if (key === 'BKSP') {
        if (!el) return
        const s = el.selectionStart ?? el.value.length
        const e2 = el.selectionEnd ?? el.value.length
        if (s !== e2) {
          const nv = el.value.slice(0, s) + el.value.slice(e2)
          setReactValue(el, nv)
          setTimeout(() => el.setSelectionRange(s, s), 0)
        } else if (s > 0) {
          const nv = el.value.slice(0, s - 1) + el.value.slice(s)
          setReactValue(el, nv)
          setTimeout(() => el.setSelectionRange(s - 1, s - 1), 0)
        }
        return
      }

      if (key === 'ENTER') {
        if (!el) return
        if (el instanceof HTMLTextAreaElement) {
          const s = el.selectionStart ?? el.value.length
          const e2 = el.selectionEnd ?? el.value.length
          const nv = el.value.slice(0, s) + '\n' + el.value.slice(e2)
          setReactValue(el, nv)
          setTimeout(() => el.setSelectionRange(s + 1, s + 1), 0)
        } else {
          el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }))
          el.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true }))
          // Try submitting parent form
          const form = el.closest('form')
          if (form) {
            const submit = form.querySelector<HTMLButtonElement>('[type=submit]')
            submit?.click()
          }
        }
        return
      }

      if (!el) return
      const char = key === 'SPACE' ? ' ' : resolveChar(key, shift, caps)
      const s = el.selectionStart ?? el.value.length
      const e2 = el.selectionEnd ?? el.value.length
      const nv = el.value.slice(0, s) + char + el.value.slice(e2)
      setReactValue(el, nv)
      setTimeout(() => el.setSelectionRange(s + char.length, s + char.length), 0)
      if (shift) setShift(false)
    },
    [shift, caps]
  )

  // Drag
  const startDrag = useCallback(
    (e: React.MouseEvent) => {
      dragState.current = { ox: e.clientX, oy: e.clientY, px: pos.x, py: pos.y }
      const onMove = (ev: MouseEvent) => {
        if (!dragState.current) return
        setPos({
          x: Math.max(0, dragState.current.px + ev.clientX - dragState.current.ox),
          y: Math.max(0, dragState.current.py + ev.clientY - dragState.current.oy)
        })
      }
      const onUp = () => {
        dragState.current = null
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
      }
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    },
    [pos]
  )

  if (!visible) return null

  return (
    <div
      ref={containerRef}
      style={{
        position: 'fixed',
        left: pos.x,
        top: pos.y,
        zIndex: 9999,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        padding: '6px 8px 10px',
        minWidth: 600,
        maxWidth: 'calc(100vw - 20px)',
        touchAction: 'none'
      }}
    >
      {/* Header / drag handle */}
      <div
        onMouseDown={startDrag}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'grab',
          paddingBottom: 6,
          borderBottom: '1px solid var(--border)',
          marginBottom: 6
        }}
      >
        <span style={{ fontSize: 12, color: 'var(--muted)', letterSpacing: 0.4 }}>
          ⌨ Ekran klaviaturasi
        </span>
        <button
          onMouseDown={(e) => {
            e.stopPropagation()
            e.preventDefault()
          }}
          onClick={() => setVisible(false)}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--muted)',
            cursor: 'pointer',
            fontSize: 18,
            lineHeight: 1,
            padding: '0 4px',
            borderRadius: 4
          }}
        >
          ×
        </button>
      </div>

      {/* Key rows */}
      {ROWS.map((row, ri) => (
        <div key={ri} style={{ display: 'flex', gap: 3, marginBottom: ri < ROWS.length - 1 ? 3 : 0 }}>
          {row.map((key, ki) => {
            const isActive = (key === 'SHIFT' && shift) || (key === 'CAPS' && caps)
            const label = resolveChar(key, shift, caps)
            return (
              <button
                key={ki}
                onMouseDown={(e) => {
                  e.preventDefault()
                  handleKey(key)
                }}
                style={{
                  flex: KEY_FLEX[key] ?? 1,
                  height: 40,
                  padding: '0 4px',
                  background: isActive ? 'var(--accent)' : 'var(--surface-3)',
                  color: isActive ? '#000' : 'var(--text)',
                  border: '1px solid var(--border)',
                  borderRadius: 5,
                  cursor: 'pointer',
                  fontSize: key === 'SPACE' ? 11 : 13,
                  fontWeight: 500,
                  userSelect: 'none',
                  transition: 'background 80ms'
                }}
              >
                {label}
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}

export default VirtualKeyboard
