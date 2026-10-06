import {
  useCallback,
  useContext,
  useEffect,
  useState,
  createContext,
} from "react"

// ════════════════════════════════════════════════════════════════════════════
// TOYAKU — versión desplegable
//
// A diferencia del prototipo de Figma Make, este build no tieneRoutes de demo:
// no hay selector de pantallas, ni marco de teléfono, ni leyenda de
// accesibilidad. Es la app tal como la usaría Rosa o el chofer.
//
// Flujo real:
//   1. Elige rol (una vez, se recuerda en localStorage)
//   2. Vecina → Inicio · Historial · Ayuda · Ajustes
//      Chofer  → Reparto · Ruta · Ajustes
// ════════════════════════════════════════════════════════════════════════════

// ─── Types ────────────────────────────────────────────────────────────────────
type Role = "vecina" | "chofer"

type VecinaScreen = "home" | "history" | "help" | "settings"
type ChoferScreen = "driver-home" | "driver-route" | "settings"
type Modal =
  | "notification"
  | "confirmation"
  | "no-confirm"
  | "offline"
  | "where-is-truck"
  | "driver-login"
  | "driver-trip"
  | "driver-summary"

type A11y = {
  fontSize: "normal" | "large" | "xlarge"
  highContrast: boolean
  voiceEnabled: boolean
  setFontSize: (v: "normal" | "large" | "xlarge") => void
  setHighContrast: (v: boolean) => void
  setVoiceEnabled: (v: boolean) => void
  speak: (text: string) => void
}

type Stop = {
  n: number
  street: string
  detail: string
  jugs: number
  x: number
  y: number
}

// ─── Data ─────────────────────────────────────────────────────────────────────

/**
 * El ETA no lo inventa la app: viene del GPS del celular del chofer, que él
 * activa con un botón y emite cada 2 minutos. Toyaku calcula distancia /
 * velocidad y lo marca como aproximado. Nunca muestra una hora estimada cuando
 * no puede verificarla.
 */
const ETA = {
  minutes: 18,
  updatedAt: "9:41 am",
  cadence: "cada 2 min",
  source: "GPS del camión",
}

const HISTORY = [
  { date: "Lun 25 ago", time: "9:14 am", status: "received", by: "Rosa" },
  { date: "Vie 22 ago", time: "10:02 am", status: "missed", by: "Rosa" },
  { date: "Mar 19 ago", time: "8:47 am", status: "received", by: "Luz" },
  { date: "Sáb 16 ago", time: "9:30 am", status: "received", by: "Rosa" },
  { date: "Mié 13 ago", time: "11:15 am", status: "missed", by: "Luz" },
]

const STOPS: Stop[] = [
  {
    n: 1,
    street: "Jr. Los Álamos 342",
    detail: "Portón gris, 3er segundo piso",
    jugs: 3,
    x: 62,
    y: 330,
  },
  {
    n: 2,
    street: "Jr. Las Flores 118",
    detail: "Casa blanca, sin reja",
    jugs: 2,
    x: 62,
    y: 208,
  },
  {
    n: 3,
    street: "Av. Los Álamos 450",
    detail: "Frente a la panadería",
    jugs: 4,
    x: 172,
    y: 130,
  },
  {
    n: 4,
    street: "Psje. 3 de Octubre 22",
    detail: "Última de la ruta",
    jugs: 2,
    x: 252,
    y: 58,
  },
]

// ─── Voice scripts ────────────────────────────────────────────────────────────
const VOICE: Record<string, string> = {
  home:
    "El camión cisterna llega en 18 minutos. Este dato es aproximado y viene del GPS del camión, actualizado a las 9:41 de la mañana. Dirección: Junior Los Álamos 342, Sector 3. Prepara tus baldes. Botón: Ver historial.",
  offline:
    "No podemos calcular la hora. Último dato conocido: hoy a las 6:30 de la mañana el camión estaba a seis calles. En tu calle, tres vecinos ya confirmaron recibo hoy. Botón: Avisar a mi familia. No mostramos una hora estimada cuando no podemos verificarla.",
  notification:
    "El camión llega en aproximadamente 10 minutos. Prepara tus baldes en la puerta. El dato viene del GPS del camión y puede variar según el tráfico y las paradas. Toca Abrir para confirmar.",
  "where-is-truck":
    "Ubicación aproximada del camión. Última actualización 9:41 de la mañana, hace un minuto. Está a cuatro calles. Ojo: el GPS en esta zona puede tener un error de cincuenta metros, por eso se muestra como un círculo y no como un punto exacto. No necesitas venir a la puerta: la app te avisa cuando esté a diez minutos.",
  confirmation:
    "¿Llegó tu agua? Toca una sola vez para registrar la entrega. Botón verde: Sí, la recibí. Botón rojo: No llegó. Botón: Cancelar.",
  "no-confirm":
    "¿Confirmas que no llegó el camión? Se enviará un reporte a la JASS. Esto no puede deshacerse. Botón: Sí, confirmar reporte. Botón: Volver.",
  history:
    "Historial de entregas. Tres entregas confirmadas, dos no llegaron. Cada registro dice el día, la hora y quién confirmó que recibió el agua.",
  help:
    "Ayuda. Botón principal: Llamar a la JASS, Juntas Administradoras de Servicios de Saneamiento. Botón secundario: Reportar incidencia. Explica de dónde sale la hora estimada.",
  settings:
    "Ajustes. Tamaño de texto. Alto contraste. Leer en voz alta. Estados de prueba: modo sin señal. Cambiar de rol.",
  role:
    "Toyaku. Elige cómo vas a usar la app. Soy vecina: recibo avisos del camión y confirmo la entrega. Soy chofer: registro mis entregas y obtengo mi comprobante de cobro.",
  "driver-login":
    "Ingreso del chofer. Una sola vez. Te enviamos un enlace por WhatsApp. Tocas el enlace y quedás registrado. No hay contraseña.",
  "driver-home":
    "Tu incentivo: cada entrega que registrás queda con hora y lugar y sirve como comprobante para que te paguen. Botón grande: Iniciar reparto.",
  "driver-trip":
    "Reparto en curso. Próxima parada 1 de 4. Junior Los Álamos 342. Tres baldes. Botón grande: Entregado.",
  "driver-route":
    "Ruta del reparto. Cuatro paradas. Mírala cuando pares, no conduciendo.",
  "driver-summary":
    "Reparto terminado. Cuatro paradas, tres entregas confirmadas, una no atendida. Este registro es tu comprobante de cobro.",
}

// ─── Context ──────────────────────────────────────────────────────────────────
const A11yCtx = createContext<A11y>({
  fontSize: "normal",
  highContrast: false,
  voiceEnabled: false,
  setFontSize: () => {},
  setHighContrast: () => {},
  setVoiceEnabled: () => {},
  speak: () => {},
})

function useA11y() {
  return useContext(A11yCtx)
}

function useTokens() {
  const { highContrast } = useA11y()
  return {
    bg: highContrast ? "#000000" : "#F0F7FB",
    bgCard: highContrast ? "#111111" : "#FFFFFF",
    primary: highContrast ? "#FFD700" : "#065A82",
    primaryText: highContrast ? "#000000" : "#FFFFFF",
    secondary: highContrast ? "#FFFFFF" : "#1C7293",
    accent: highContrast ? "#FFD700" : "#F2A73B",
    accentText: highContrast ? "#000000" : "#065A82",
    success: highContrast ? "#00FF7F" : "#2E7D32",
    successBg: highContrast ? "#003300" : "#E8F5E9",
    danger: highContrast ? "#FF4444" : "#C62828",
    dangerBg: highContrast ? "#330000" : "#FFEBEE",
    text: highContrast ? "#FFFFFF" : "#065A82",
    textSub: highContrast ? "#CCCCCC" : "#1C7293",
    border: highContrast ? "#FFFFFF" : "#E1EEF6",
    cardShadow: highContrast
      ? "0 0 0 2px #FFFFFF"
      : "0 1px 4px rgba(6,90,130,0.08)",
  }
}

function useFontSize() {
  const { fontSize } = useA11y()
  const scale = fontSize === "xlarge" ? 1.35 : fontSize === "large" ? 1.18 : 1
  return (base: number) => Math.round(base * scale)
}

// ─── Web Speech ───────────────────────────────────────────────────────────────
function useSpeech() {
  const speak = useCallback((text: string) => {
    if (!("speechSynthesis" in window)) return
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = "es-PE"
    u.rate = 0.88
    u.pitch = 1.05
    window.speechSynthesis.speak(u)
  }, [])
  const stop = useCallback(() => {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel()
  }, [])
  return { speak, stop }
}

// ─── Focus ring (WCAG 2.4.7) ──────────────────────────────────────────────────
function focusRing(hc: boolean) {
  return {
    onFocus: (e: React.FocusEvent<HTMLButtonElement | HTMLAnchorElement>) => {
      e.currentTarget.style.outline = `3px solid ${hc ? "#FFFFFF" : "#F2A73B"}`
      e.currentTarget.style.outlineOffset = "2px"
    },
    onBlur: (e: React.FocusEvent<HTMLButtonElement | HTMLAnchorElement>) => {
      e.currentTarget.style.outline = "none"
    },
  }
}

// ─── Chrome pieces ────────────────────────────────────────────────────────────
function StatusBar({ light = false }: { light?: boolean }) {
  const { highContrast } = useA11y()
  const color = highContrast ? "#FFD700" : light ? "white" : "#065A82"
  return (
    <div
      aria-hidden="true"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "max(14px, env(safe-area-inset-top)) 20px 4px",
        fontSize: 12,
        fontWeight: 700,
        color,
        flexShrink: 0,
      }}
    >
      <span>9:41</span>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <svg width="16" height="12" viewBox="0 0 16 12" fill={color}>
          <rect x="0" y="6" width="3" height="6" rx="1" opacity="0.4" />
          <rect x="4.5" y="4" width="3" height="8" rx="1" opacity="0.6" />
          <rect x="9" y="2" width="3" height="10" rx="1" opacity="0.8" />
          <rect x="13.5" y="0" width="3" height="12" rx="1" />
        </svg>
        <svg width="25" height="12" viewBox="0 0 25 12" fill="none">
          <rect
            x="0.5"
            y="0.5"
            width="21"
            height="11"
            rx="3.5"
            stroke={color}
            strokeOpacity="0.5"
          />
          <rect x="2" y="2" width="17" height="8" rx="2" fill={color} />
        </svg>
      </div>
    </div>
  )
}

function BackButton({ onClick, label }: { onClick: () => void; label: string }) {
  const t = useTokens()
  const { highContrast } = useA11y()
  return (
    <button
      onClick={onClick}
      aria-label={label}
      style={{
        width: 44,
        height: 44,
        borderRadius: "50%",
        background: t.bgCard,
        border: `2px solid ${t.border}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        cursor: "pointer",
        outline: "none",
      }}
      {...focusRing(highContrast)}
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke={t.primary}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M19 12H5M12 5l-7 7 7 7" />
      </svg>
    </button>
  )
}

/** Interruptor accesible: se usa con role="switch" y aria-checked. */
function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: () => void
  label: string
}) {
  const t = useTokens()
  const { highContrast } = useA11y()
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      style={{
        width: 52,
        height: 32,
        borderRadius: 999,
        padding: 3,
        display: "flex",
        alignItems: "center",
        justifyContent: checked ? "flex-end" : "flex-start",
        background: checked ? t.primary : t.border,
        border: `2px solid ${checked ? t.primary : t.border}`,
        cursor: "pointer",
        outline: "none",
        flexShrink: 0,
      }}
      {...focusRing(highContrast)}
    >
      <span
        style={{
          width: 22,
          height: 22,
          borderRadius: "50%",
          background: highContrast ? "#000" : "#FFF",
          boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
          display: "block",
        }}
      />
    </button>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// SHELL
// ════════════════════════════════════════════════════════════════════════════

/**
 * Contenedor de la app. En celular ocupa todo el ancho; en escritorio se
 * centra con un ancho máximo cómodo para leer, sobre un fondo sobrio.
 */
function AppShell({ children }: { children: React.ReactNode }) {
  const { highContrast } = useA11y()
  return (
    <div
      style={{
        minHeight: "100dvh",
        background: highContrast ? "#000" : "#DFE8EE",
        display: "flex",
        justifyContent: "center",
        fontFamily: "'Nunito', sans-serif",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 430,
          height: "100dvh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          position: "relative",
          background: highContrast ? "#000" : "#F0F7FB",
          boxShadow: highContrast ? "none" : "0 0 40px rgba(6,90,130,0.12)",
        }}
      >
        {children}
      </div>
    </div>
  )
}

// ─── Bottom nav ───────────────────────────────────────────────────────────────
type NavItem = {
  key: string
  label: string
  aria: string
  icon: React.ReactNode
}

function BottomNav({
  items,
  current,
  onChange,
}: {
  items: NavItem[]
  current: string
  onChange: (k: string) => void
}) {
  const t = useTokens()
  const fs = useFontSize()
  const { highContrast } = useA11y()
  return (
    <nav
      aria-label="Navegación principal"
      style={{
        display: "flex",
        flexShrink: 0,
        borderTop: `1px solid ${t.border}`,
        background: t.bgCard,
        paddingBottom: "max(10px, env(safe-area-inset-bottom))",
      }}
    >
      {items.map(it => {
        const active = current === it.key
        return (
          <button
            key={it.key}
            onClick={() => onChange(it.key)}
            aria-current={active ? "page" : undefined}
            aria-label={it.aria}
            style={{
              flex: 1,
              minHeight: 58,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 3,
              background: "none",
              border: "none",
              cursor: "pointer",
              outline: "none",
              color: active ? t.primary : t.textSub,
              borderTop: `3px solid ${active ? t.primary : "transparent"}`,
            }}
            {...focusRing(highContrast)}
          >
            <svg
              width="23"
              height="23"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              {it.icon}
            </svg>
            <span style={{ fontSize: fs(11), fontWeight: 800 }}>{it.label}</span>
          </button>
        )
      })}
    </nav>
  )
}

const VECINA_NAV: NavItem[] = [
  {
    key: "home",
    label: "Inicio",
    aria: "Inicio: tiempo estimado de llegada del camión",
    icon: <path d="M12 2.69l5.66 5.66a8 8 0 11-11.31 0z" />,
  },
  {
    key: "history",
    label: "Historial",
    aria: "Historial de entregas",
    icon: (
      <>
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </>
    ),
  },
  {
    key: "help",
    label: "Ayuda",
    aria: "Ayuda: llamar a la JASS y reportar incidencia",
    icon: (
      <>
        <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 11.5a19.79 19.79 0 01-3.07-8.67A2 2 0 012.18 1h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 8.15a16 16 0 006 6l1.52-1.52a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 14.92v2z" />
      </>
    ),
  },
  {
    key: "settings",
    label: "Ajustes",
    aria: "Ajustes: tamaño de texto, contraste y lector de voz",
    icon: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.6a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0020.4 9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" />
      </>
    ),
  },
]

const CHOFER_NAV: NavItem[] = [
  {
    key: "driver-home",
    label: "Reparto",
    aria: "Reparto: iniciar o continuar el reparto de hoy",
    icon: (
      <>
        <path d="M1 3h15v13H1z" />
        <path d="M16 8h4l3 3v5h-7V8z" />
        <circle cx="5.5" cy="18.5" r="2.5" />
        <circle cx="18.5" cy="18.5" r="2.5" />
      </>
    ),
  },
  {
    key: "driver-route",
    label: "Ruta",
    aria: "Ruta del reparto: paradas de hoy",
    icon: (
      <>
        <circle cx="6" cy="19" r="3" />
        <circle cx="18" cy="5" r="3" />
        <path d="M9 19h6a4 4 0 000-8h-4" />
      </>
    ),
  },
  {
    key: "settings",
    label: "Ajustes",
    aria: "Ajustes: tamaño de texto, contraste y lector de voz",
    icon: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.6a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0020.4 9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" />
      </>
    ),
  },
]

// ════════════════════════════════════════════════════════════════════════════
// ROLE SELECT
// ════════════════════════════════════════════════════════════════════════════

function RoleSelectScreen({ onPick }: { onPick: (r: Role) => void }) {
  const t = useTokens()
  const fs = useFontSize()
  const { highContrast, voiceEnabled, speak } = useA11y()

  useEffect(() => {
    if (voiceEnabled) speak(VOICE.role)
  }, [voiceEnabled])

  const options: {
    role: Role
    title: string
    body: string
    icon: React.ReactNode
  }[] = [
    {
      role: "vecina",
      title: "Soy vecina",
      body: "Recibo el aviso cuando llega el camión y confirmo que recibí el agua.",
      icon: (
        <path d="M14 2C14 2 2 16 2 22A12 12 0 0 0 26 22C26 16 14 2 14 2Z" />
      ),
    },
    {
      role: "chofer",
      title: "Soy chofer",
      body: "Registro mis entregas y obtengo el comprobante para que me paguen.",
      icon: (
        <>
          <path d="M1 3h15v13H1z" />
          <path d="M16 8h4l3 3v5h-7V8z" />
          <circle cx="5.5" cy="18.5" r="2.5" />
          <circle cx="18.5" cy="18.5" r="2.5" />
        </>
      ),
    },
  ]

  return (
    <AppShell>
      <main
        role="main"
        aria-label="Elegir cómo usar Toyaku"
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflowY: "auto",
        }}
      >
        <StatusBar />
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: "16px 20px 28px",
          }}
        >
          <div style={{ textAlign: "center", marginBottom: 28 }}>
            <div
              aria-hidden="true"
              style={{
                width: 64,
                height: 64,
                margin: "0 auto 12px",
                borderRadius: 18,
                background: t.primary,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg width="34" height="34" viewBox="0 0 28 36" fill="none">
                <path
                  d="M14 2C14 2 2 16 2 22A12 12 0 0 0 26 22C26 16 14 2 14 2Z"
                  fill={t.accent}
                />
              </svg>
            </div>
            <p
              style={{
                fontSize: fs(30),
                fontWeight: 900,
                color: t.text,
                lineHeight: 1.1,
              }}
            >
              Toyaku
            </p>
            <p
              style={{
                fontSize: fs(14),
                fontWeight: 600,
                color: t.textSub,
                marginTop: 6,
              }}
            >
              ¿Cómo vas a usar la app?
            </p>
          </div>

          {options.map(o => (
            <button
              key={o.role}
              onClick={() => onPick(o.role)}
              aria-label={`${o.title}. ${o.body}`}
              style={{
                width: "100%",
                borderRadius: 20,
                padding: "20px 18px",
                marginBottom: 14,
                display: "flex",
                alignItems: "center",
                gap: 16,
                textAlign: "left",
                background: t.bgCard,
                border: `2px solid ${t.border}`,
                boxShadow: t.cardShadow,
                cursor: "pointer",
                outline: "none",
              }}
              {...focusRing(highContrast)}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 14,
                  flexShrink: 0,
                  background: t.bg,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <svg
                  width="26"
                  height="26"
                  viewBox="0 0 28 36"
                  fill="none"
                  stroke={t.primary}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  {o.icon}
                </svg>
              </span>
              <span style={{ flex: 1 }}>
                <span
                  style={{
                    display: "block",
                    fontSize: fs(18),
                    fontWeight: 900,
                    color: t.text,
                  }}
                >
                  {o.title}
                </span>
                <span
                  style={{
                    display: "block",
                    fontSize: fs(13),
                    fontWeight: 600,
                    color: t.textSub,
                    marginTop: 4,
                    lineHeight: 1.4,
                  }}
                >
                  {o.body}
                </span>
              </span>
            </button>
          ))}
        </div>
      </main>
    </AppShell>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// VECINA — Inicio
// ════════════════════════════════════════════════════════════════════════════

function HomeScreen({
  onNav,
  onModal,
  offlineOn,
  onToggleOffline,
}: {
  onNav: (k: string) => void
  onModal: (m: Modal) => void
  offlineOn: boolean
  onToggleOffline: () => void
}) {
  const t = useTokens()
  const fs = useFontSize()
  const { highContrast, voiceEnabled, speak } = useA11y()

  useEffect(() => {
    if (voiceEnabled) speak(VOICE.home)
  }, [voiceEnabled])

  return (
    <main
      role="main"
      aria-label="Pantalla de inicio"
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
      }}
    >
      <StatusBar />

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 16px 12px",
          flexShrink: 0,
        }}
      >
        <div>
          <p
            aria-label="Tu dirección registrada"
            style={{
              fontSize: fs(10),
              color: t.textSub,
              fontWeight: 800,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}
          >
            Tu dirección
          </p>
          <p style={{ fontSize: fs(15), color: t.text, fontWeight: 900 }}>
            Jr. Los Álamos 342, Sector 3
          </p>
        </div>
        <span
          aria-hidden="true"
          style={{
            fontSize: fs(13),
            fontWeight: 900,
            color: t.accentText,
            background: t.accent,
            borderRadius: 999,
            padding: "5px 12px",
          }}
        >
          Toyaku
        </span>
      </div>

      <div
        style={{
          margin: "0 16px",
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
        }}
      >
        <button
          onClick={() => onModal("notification")}
          aria-label={`El camión cisterna llega en aproximadamente ${ETA.minutes} minutos. Dato aproximado tomado del ${ETA.source}, actualizado a las ${ETA.updatedAt}. Toca para ver el aviso.`}
          style={{
            width: "100%",
            borderRadius: 24,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            background: highContrast
              ? t.primary
              : "linear-gradient(160deg, #065A82 0%, #1C7293 100%)",
            padding: "28px 20px",
            flex: 1,
            minHeight: 280,
            cursor: "pointer",
            border: highContrast ? `3px solid ${t.primaryText}` : "none",
            outline: "none",
          }}
          {...focusRing(highContrast)}
        >
          <div
            aria-hidden="true"
            style={{
              marginBottom: 10,
              display: "flex",
              alignItems: "flex-end",
              gap: 8,
            }}
          >
            <svg width="66" height="50" viewBox="0 0 80 60" fill="none">
              <rect
                x="8"
                y="22"
                width="42"
                height="26"
                rx="4"
                fill="white"
                opacity="0.95"
              />
              <path d="M50 28h14l6 8v12H50V28z" fill="white" opacity="0.9" />
              <rect
                x="52"
                y="31"
                width="10"
                height="8"
                rx="2"
                fill="#065A82"
                opacity="0.6"
              />
              <circle cx="20" cy="50" r="7" fill="#1C7293" />
              <circle cx="20" cy="50" r="3.5" fill="white" />
              <circle cx="55" cy="50" r="7" fill="#1C7293" />
              <circle cx="55" cy="50" r="3.5" fill="white" />
              <path
                d="M12 34 Q22 30 32 34 Q42 38 50 34"
                stroke="#1C7293"
                strokeWidth="2"
                strokeLinecap="round"
                fill="none"
                opacity="0.5"
              />
            </svg>
            <svg width="24" height="31" viewBox="0 0 28 36" fill="none">
              <path
                d="M14 2C14 2 2 16 2 22A12 12 0 0 0 26 22C26 16 14 2 14 2Z"
                fill={t.accent}
              />
            </svg>
          </div>

          <p
            aria-hidden="true"
            style={{
              fontSize: fs(76),
              fontWeight: 900,
              color: t.primaryText,
              lineHeight: 1,
              letterSpacing: "-2px",
            }}
          >
            {ETA.minutes}
          </p>
          <p
            aria-hidden="true"
            style={{
              fontSize: fs(21),
              fontWeight: 700,
              color: highContrast ? t.primaryText : "rgba(255,255,255,0.85)",
              marginTop: 2,
            }}
          >
            min
          </p>

          <div
            role="status"
            aria-live="polite"
            style={{
              marginTop: 10,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              borderRadius: 999,
              padding: "4px 12px",
              background: highContrast ? "transparent" : "rgba(0,0,0,0.18)",
              border: `1px solid ${highContrast ? t.primaryText : "rgba(255,255,255,0.35)"}`,
            }}
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke={highContrast ? t.primaryText : "rgba(255,255,255,0.8)"}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <span
              aria-hidden="true"
              style={{
                fontSize: fs(12),
                fontWeight: 800,
                color: highContrast ? t.primaryText : "rgba(255,255,255,0.9)",
              }}
            >
              APROXIMADO
            </span>
          </div>

          <p
            aria-hidden="true"
            style={{
              fontSize: fs(13),
              color: highContrast ? t.primaryText : "rgba(255,255,255,0.75)",
              fontWeight: 600,
              marginTop: 8,
              textAlign: "center",
            }}
          >
            GPS del camión · act. {ETA.updatedAt}
          </p>
          <p
            aria-hidden="true"
            style={{
              fontSize: fs(15),
              fontWeight: 600,
              color: highContrast ? t.primaryText : "rgba(255,255,255,0.7)",
              marginTop: 6,
            }}
          >
            para que llegue el camión
          </p>

          <div
            style={{
              marginTop: 18,
              borderRadius: 999,
              padding: "8px 20px",
              background: t.accent,
            }}
          >
            <p
              style={{
                fontSize: fs(13),
                fontWeight: 800,
                color: t.accentText,
              }}
            >
              ¡Prepara tus baldes!
            </p>
          </div>
        </button>

        <button
          onClick={() => onNav("history")}
          aria-label="Ver historial de entregas"
          style={{
            width: "100%",
            marginTop: 14,
            borderRadius: 16,
            height: 58,
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            background: t.bgCard,
            border: `2.5px solid ${t.primary}`,
            color: t.primary,
            fontSize: fs(17),
            fontWeight: 800,
            cursor: "pointer",
            outline: "none",
          }}
          {...focusRing(highContrast)}
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          Ver historial
        </button>

        {/* Acción secundaria y optativa. Va deliberadamente discreta: el dato
            central de esta pantalla sigue siendo el ETA (H8). */}
        <button
          onClick={() => onModal("where-is-truck")}
          aria-label="Ver dónde está el camión. Muestra una ubicación aproximada, no exacta."
          style={{
            width: "100%",
            marginTop: 10,
            minHeight: 48,
            borderRadius: 12,
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            background: "none",
            border: "none",
            color: t.textSub,
            fontSize: fs(13),
            fontWeight: 700,
            textDecoration: "underline",
            textUnderlineOffset: 3,
            cursor: "pointer",
            outline: "none",
          }}
          {...focusRing(highContrast)}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 21s-7-5.5-7-11a7 7 0 1114 0c0 5.5-7 11-7 11z" />
            <circle cx="12" cy="10" r="2.5" />
          </svg>
          Ver dónde está
        </button>

        {/* Estado sin señal: se declara, no se disimula */}
        <div
          style={{
            marginTop: 10,
            marginBottom: 10,
            padding: "10px 14px",
            borderRadius: 12,
            display: "flex",
            alignItems: "center",
            gap: 12,
            background: t.bgCard,
            border: `1.5px dashed ${t.border}`,
            flexShrink: 0,
          }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke={t.textSub}
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line x1="1" y1="1" x2="23" y2="23" />
            <path d="M16.72 11.06A10.94 10.94 0 0119 12.55M5 12.55a10.94 10.94 0 015.17-2.39M10.71 5.05A16 16 0 0122.58 9M1.42 9a15.91 15.91 0 014.7-2.88" />
            <line x1="12" y1="20" x2="12.01" y2="20" />
          </svg>
          <p
            style={{
              flex: 1,
              fontSize: fs(13),
              fontWeight: 700,
              color: t.textSub,
            }}
          >
            Modo sin señal
          </p>
          <Switch
            checked={offlineOn}
            onChange={onToggleOffline}
            label="Activar el modo sin señal para ver qué muestra la app cuando no hay cobertura GPS"
          />
        </div>
      </div>

      <BottomNav
        items={VECINA_NAV}
        current="home"
        onChange={k => onNav(k)}
      />
    </main>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// VECINA — Historial
// ════════════════════════════════════════════════════════════════════════════

function HistoryScreen({ onNav }: { onNav: (k: string) => void }) {
  const t = useTokens()
  const fs = useFontSize()
  const { highContrast, voiceEnabled, speak } = useA11y()

  useEffect(() => {
    if (voiceEnabled) speak(VOICE.history)
  }, [voiceEnabled])

  return (
    <main
      role="main"
      aria-label="Historial de entregas"
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
      }}
    >
      <StatusBar />
      <div style={{ padding: "10px 20px 14px", flexShrink: 0 }}>
        <p
          role="heading"
          aria-level={1}
          style={{ fontSize: fs(24), fontWeight: 900, color: t.text }}
        >
          Historial
        </p>
      </div>

      <div
        role="region"
        aria-label="Resumen de entregas"
        style={{
          padding: "0 20px 14px",
          display: "flex",
          gap: 10,
          flexShrink: 0,
        }}
      >
        <div
          style={{
            borderRadius: 999,
            padding: "7px 14px",
            display: "flex",
            alignItems: "center",
            gap: 7,
            background: t.successBg,
            border: highContrast ? `2px solid ${t.success}` : "none",
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: t.success,
            }}
          />
          <span style={{ fontSize: fs(12), fontWeight: 800, color: t.success }}>
            3 confirmadas
          </span>
        </div>
        <div
          style={{
            borderRadius: 999,
            padding: "7px 14px",
            display: "flex",
            alignItems: "center",
            gap: 7,
            background: t.dangerBg,
            border: highContrast ? `2px solid ${t.danger}` : "none",
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: t.danger,
            }}
          />
          <span style={{ fontSize: fs(12), fontWeight: 800, color: t.danger }}>
            2 no llegaron
          </span>
        </div>
      </div>

      <ul
        role="list"
        aria-label="Lista de entregas"
        style={{
          padding: "0 20px",
          display: "flex",
          flexDirection: "column",
          gap: 10,
          overflowY: "auto",
          flex: 1,
          minHeight: 0,
          listStyle: "none",
          margin: 0,
        }}
      >
        {HISTORY.map((item, i) => (
          <li
            key={i}
            role="listitem"
            aria-label={`${item.date} a las ${item.time}: ${item.status === "received" ? "agua recibida" : "no llegó el camión"}. Confirmado por ${item.by}.`}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              borderRadius: 16,
              padding: "14px",
              background: t.bgCard,
              boxShadow: t.cardShadow,
              border: highContrast ? `2px solid ${t.border}` : "none",
            }}
          >
            <div
              aria-hidden="true"
              style={{
                width: 40,
                height: 40,
                borderRadius: "50%",
                background:
                  item.status === "received" ? t.successBg : t.dangerBg,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                border: highContrast
                  ? `2px solid ${item.status === "received" ? t.success : t.danger}`
                  : "none",
              }}
            >
              {item.status === "received" ? (
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={t.success}
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={t.danger}
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              )}
            </div>
            <div style={{ flex: 1 }}>
              <p
                style={{ fontSize: fs(15), fontWeight: 800, color: t.text }}
              >
                {item.date}
              </p>
              <p
                style={{
                  fontSize: fs(12),
                  color: t.textSub,
                  fontWeight: 600,
                }}
              >
                {item.time} · Confirmado por {item.by}
              </p>
            </div>
            <span
              style={{
                borderRadius: 999,
                padding: "4px 11px",
                fontSize: fs(11),
                fontWeight: 800,
                background:
                  item.status === "received" ? t.successBg : t.dangerBg,
                color: item.status === "received" ? t.success : t.danger,
                border: highContrast
                  ? `2px solid ${item.status === "received" ? t.success : t.danger}`
                  : "none",
              }}
            >
              {item.status === "received" ? "Recibido" : "No llegó"}
            </span>
          </li>
        ))}

      </ul>

      <BottomNav items={VECINA_NAV} current="history" onChange={onNav} />
    </main>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// VECINA — Ayuda
// ════════════════════════════════════════════════════════════════════════════

function JassTooltip({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false)
  const { highContrast } = useA11y()
  return (
    <span
      style={{ position: "relative", display: "inline" }}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      <span
        style={{
          borderBottom: `2px dashed ${highContrast ? "#FFD700" : "rgba(255,255,255,0.6)"}`,
          cursor: "help",
        }}
        aria-describedby="jass-tooltip"
      >
        {children}
      </span>
      {visible && (
        <span
          id="jass-tooltip"
          role="tooltip"
          style={{
            position: "absolute",
            bottom: "calc(100% + 8px)",
            left: "50%",
            transform: "translateX(-50%)",
            background: highContrast ? "#FFD700" : "#044060",
            color: highContrast ? "#000" : "white",
            fontSize: 12,
            fontWeight: 700,
            lineHeight: 1.4,
            padding: "8px 12px",
            borderRadius: 10,
            whiteSpace: "nowrap",
            zIndex: 100,
            boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
            pointerEvents: "none",
            fontFamily: "'Nunito', sans-serif",
          }}
        >
          Juntas Administradoras de
          <br />
          Servicios de Saneamiento
        </span>
      )}
    </span>
  )
}

function HelpScreen({
  onNav,
  onModal,
}: {
  onNav: (k: string) => void
  onModal: (m: Modal) => void
}) {
  const t = useTokens()
  const fs = useFontSize()
  const { highContrast, voiceEnabled, speak } = useA11y()

  useEffect(() => {
    if (voiceEnabled) speak(VOICE.help)
  }, [voiceEnabled])

  return (
    <main
      role="main"
      aria-label="Pantalla de ayuda"
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
      }}
    >
      <StatusBar />
      <div style={{ padding: "10px 20px 14px", flexShrink: 0 }}>
        <p
          role="heading"
          aria-level={1}
          style={{ fontSize: fs(24), fontWeight: 900, color: t.text }}
        >
          Ayuda
        </p>
      </div>

      <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
        <div
          role="region"
          aria-label="Información de la JASS"
          style={{
            margin: "0 20px",
            borderRadius: 22,
            background: highContrast
              ? t.primary
              : "linear-gradient(160deg, #065A82 0%, #1C7293 100%)",
            padding: "22px 20px",
            border: highContrast ? `3px solid ${t.primaryText}` : "none",
          }}
        >
          <p
            style={{
              fontSize: fs(11),
              fontWeight: 800,
              color: highContrast ? "#000" : "rgba(255,255,255,0.7)",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            Junta de Agua
          </p>
          <p
            style={{
              fontSize: fs(17),
              fontWeight: 900,
              color: highContrast ? "#000" : "white",
              marginTop: 4,
            }}
          >
            <JassTooltip>JASS</JassTooltip> Sector 3 — Villa El Salvador
          </p>
          <p
            style={{
              fontSize: fs(13),
              color: highContrast ? "#000" : "rgba(255,255,255,0.8)",
              fontWeight: 600,
              marginTop: 4,
            }}
          >
            Lun–Sáb · 7:00 am – 5:00 pm
          </p>
        </div>

        <div style={{ padding: "18px 20px 0" }}>
          <a
            href="tel:+51999000111"
            aria-label="Llamar a la JASS, Juntas Administradoras de Servicios de Saneamiento"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 14,
              minHeight: 66,
              borderRadius: 16,
              background: highContrast ? "#FFD700" : "#065A82",
              color: highContrast ? "#000" : "white",
              fontSize: fs(18),
              fontWeight: 900,
              textDecoration: "none",
              border: highContrast ? "3px solid #FFF" : "none",
              outline: "none",
            }}
            {...focusRing(highContrast)}
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 11.5a19.79 19.79 0 01-3.07-8.67A2 2 0 012.18 1h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 8.15a16 16 0 006 6l1.52-1.52a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 14.92v2z" />
            </svg>
            Llamar a la <JassTooltip>JASS</JassTooltip>
          </a>
        </div>

        <div style={{ padding: "12px 20px 0" }}>
          <button
            onClick={() => onModal("no-confirm")}
            aria-label="Reportar que el camión cisterna no llegó"
            style={{
              width: "100%",
              minHeight: 60,
              borderRadius: 16,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 14,
              background: t.bgCard,
              border: `2.5px solid ${t.primary}`,
              color: t.primary,
              fontSize: fs(16),
              fontWeight: 900,
              cursor: "pointer",
              outline: "none",
            }}
            {...focusRing(highContrast)}
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
              <line x1="4" y1="22" x2="4" y2="15" />
            </svg>
            Reportar incidencia
          </button>
        </div>

        <div
          style={{
            margin: "16px 20px",
            borderRadius: 16,
            padding: 16,
            background: t.bgCard,
            border: `2px solid ${t.border}`,
          }}
        >
          <p
            style={{
              fontSize: fs(13),
              fontWeight: 800,
              color: t.text,
              marginBottom: 8,
            }}
          >
            ¿Qué hace Toyaku?
          </p>
          <p
            style={{
              fontSize: fs(13),
              color: t.textSub,
              fontWeight: 600,
              lineHeight: 1.6,
            }}
          >
            Te avisa cuando el camión cisterna está cerca y guarda un registro de
            cada entrega para tu zona.
          </p>
        </div>

        {/* La pregunta que siempre aparece */}
        <div
          style={{
            margin: "0 20px 20px",
            borderRadius: 16,
            padding: 16,
            background: t.bgCard,
            border: `2px solid ${t.border}`,
          }}
        >
          <p
            style={{
              fontSize: fs(13),
              fontWeight: 800,
              color: t.text,
              marginBottom: 8,
            }}
          >
            ¿De dónde sale la hora?
          </p>
          <ul
            style={{
              margin: 0,
              paddingLeft: 18,
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            {[
              "El chofer pulsa Iniciar reparto: un botón.",
              "Su celular envía su ubicación cada 2 minutos.",
              "Toyaku calcula la distancia y la velocidad.",
              "Sin señal, la app lo dice en vez de inventar una hora.",
            ].map(line => (
              <li
                key={line}
                style={{
                  fontSize: fs(12),
                  color: t.textSub,
                  fontWeight: 600,
                  lineHeight: 1.5,
                }}
              >
                {line}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <BottomNav items={VECINA_NAV} current="help" onChange={onNav} />
    </main>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// Ajustes (antes: panel flotante de accesibilidad)
// ════════════════════════════════════════════════════════════════════════════

function SettingsScreen({
  onNav,
  role,
  onChangeRole,
  offlineOn,
  onToggleOffline,
}: {
  onNav: (k: string) => void
  role: Role
  onChangeRole: () => void
  offlineOn: boolean
  onToggleOffline: () => void
}) {
  const t = useTokens()
  const fs = useFontSize()
  const {
    fontSize,
    highContrast,
    voiceEnabled,
    setFontSize,
    setHighContrast,
    setVoiceEnabled,
    speak,
  } = useA11y()

  useEffect(() => {
    if (voiceEnabled) speak(VOICE.settings)
  }, [voiceEnabled])

  function Row({
    title,
    hint,
    control,
  }: {
    title: string
    hint?: string
    control: React.ReactNode
  }) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "14px 16px",
          borderBottom: `1px solid ${t.border}`,
        }}
      >
        <div style={{ flex: 1 }}>
          <p
            style={{ fontSize: fs(15), fontWeight: 800, color: t.text }}
          >
            {title}
          </p>
          {hint && (
            <p
              style={{
                fontSize: fs(12),
                fontWeight: 600,
                color: t.textSub,
                marginTop: 3,
                lineHeight: 1.4,
              }}
            >
              {hint}
            </p>
          )}
        </div>
        {control}
      </div>
    )
  }

  return (
    <main
      role="main"
      aria-label="Ajustes"
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
      }}
    >
      <StatusBar />
      <div style={{ padding: "10px 20px 14px", flexShrink: 0 }}>
        <p
          role="heading"
          aria-level={1}
          style={{ fontSize: fs(24), fontWeight: 900, color: t.text }}
        >
          Ajustes
        </p>
      </div>

      <div style={{ flex: 1, overflowY: "auto", minHeight: 0, padding: "0 16px 20px" }}>
        <p
          style={{
            fontSize: fs(11),
            fontWeight: 900,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: t.textSub,
            margin: "4px 4px 8px",
          }}
        >
            Lectura y visión
        </p>

        <div
          style={{
            borderRadius: 16,
            overflow: "hidden",
            background: t.bgCard,
            border: highContrast ? `2px solid ${t.border}` : "none",
            boxShadow: t.cardShadow,
            marginBottom: 22,
          }}
        >
          <Row
            title="Tamaño del texto"
            hint="Aumenta el tamaño de toda la app"
            control={
              <div
                role="group"
                aria-label="Tamaño del texto"
                style={{ display: "flex", gap: 6 }}
              >
                {(
                  [
                    { v: "normal", l: "A", s: 15 },
                    { v: "large", l: "A", s: 18 },
                    { v: "xlarge", l: "A", s: 22 },
                  ] as const
                ).map(o => {
                  const active = fontSize === o.v
                  return (
                    <button
                      key={o.v}
                      onClick={() => setFontSize(o.v)}
                      aria-pressed={active}
                      aria-label={`Texto ${
                        o.v === "normal" ? "normal" : o.v === "large" ? "grande" : "muy grande"
                      }`}
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 10,
                        fontSize: o.s,
                        fontWeight: 900,
                        cursor: "pointer",
                        background: active
                          ? highContrast
                            ? "#FFD700"
                            : "#065A82"
                          : t.bg,
                        color: active
                          ? highContrast
                            ? "#000"
                            : "#FFF"
                          : t.primary,
                        border: `2px solid ${active ? t.primary : t.border}`,
                        fontFamily: "'Nunito', sans-serif",
                        outline: "none",
                      }}
                      {...focusRing(highContrast)}
                    >
                      {o.l}
                    </button>
                  )
                })}
              </div>
            }
          />

          <Row
            title="Alto contraste"
            hint="Colores más fuertes para ver mejor bajo el sol"
            control={
              <Switch
                checked={highContrast}
                onChange={() => setHighContrast(!highContrast)}
                label="Activar el alto contraste"
              />
            }
          />

          <Row
            title="Leer en voz alta"
            hint="La app te lee cada pantalla al abrirla"
            control={
              <Switch
                checked={voiceEnabled}
                onChange={() => {
                  setVoiceEnabled(!voiceEnabled)
                  if (voiceEnabled) window.speechSynthesis?.cancel()
                }}
                label="Activar el lector de voz"
              />
            }
          />
        </div>

        <p
          style={{
            fontSize: fs(11),
            fontWeight: 900,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: t.textSub,
            margin: "0 4px 8px",
          }}
        >
          Cuenta
        </p>

        <div
          style={{
            borderRadius: 16,
            overflow: "hidden",
            background: t.bgCard,
            border: highContrast ? `2px solid ${t.border}` : "none",
            boxShadow: t.cardShadow,
            marginBottom: 22,
          }}
        >
          <Row
            title="Estás usando Toyaku como"
            hint={
              role === "vecina"
                ? "Vecina — recibes avisos y confirmas entregas"
                : "Chofer — registras entregas y generas tu comprobante"
            }
            control={
              <button
                onClick={onChangeRole}
                aria-label="Cambiar de rol"
                style={{
                  padding: "9px 16px",
                  borderRadius: 10,
                  background: t.bg,
                  border: `2px solid ${t.primary}`,
                  color: t.primary,
                  fontSize: fs(13),
                  fontWeight: 800,
                  cursor: "pointer",
                  outline: "none",
                  whiteSpace: "nowrap",
                }}
                {...focusRing(highContrast)}
              >
                Cambiar
              </button>
            }
          />
        </div>

        <p
          style={{
            fontSize: fs(11),
            fontWeight: 900,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: t.textSub,
            margin: "0 4px 8px",
          }}
        >
          Estados de prueba
        </p>

        <div
          style={{
            borderRadius: 16,
            overflow: "hidden",
            background: t.bgCard,
            border: highContrast ? `2px solid ${t.border}` : "none",
            boxShadow: t.cardShadow,
          }}
        >
          <Row
            title="Modo sin señal"
            hint="Ver qué muestra la app cuando no hay cobertura GPS"
            control={
              <Switch
                checked={offlineOn}
                onChange={onToggleOffline}
                label="Activar el modo sin señal"
              />
            }
          />
        </div>

        <p
          style={{
            fontSize: fs(12),
            fontWeight: 600,
            color: t.textSub,
            textAlign: "center",
            marginTop: 20,
            lineHeight: 1.5,
          }}
        >
          Toyaku · Proyecto de Interacción Hombre-Máquina
          <br />
          Prototipo de avance 1
        </p>
      </div>

      <BottomNav
        items={role === "vecina" ? VECINA_NAV : CHOFER_NAV}
        current="settings"
        onChange={onNav}
      />
    </main>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// MODALES — VECINA
// ════════════════════════════════════════════════════════════════════════════

function NotificationModal({ onClose, onOpen }: { onClose: () => void; onOpen: (m: Modal) => void }) {
  const t = useTokens()
  const fs = useFontSize()
  const { highContrast, voiceEnabled, speak } = useA11y()

  useEffect(() => {
    if (voiceEnabled) speak(VOICE.notification)
  }, [voiceEnabled])

  return (
    <main
      role="dialog"
      aria-modal="true"
      aria-label="Aviso: el camión está cerca"
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        background: "#0a0a0a",
      }}
    >
      <StatusBar light />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: "14px 20px 22px",
        }}
      >
        <p
          aria-hidden="true"
          style={{
            fontSize: fs(42),
            fontWeight: 300,
            color: "white",
            lineHeight: 1,
          }}
        >
          9:41
        </p>
        <p
          style={{
            fontSize: fs(13),
            color: "rgba(255,255,255,0.7)",
            fontWeight: 600,
            marginTop: 4,
          }}
        >
          martes, 1 de septiembre
        </p>
      </div>

      <div style={{ margin: "0 12px" }}>
        <div
          role="alert"
          aria-live="assertive"
          style={{
            borderRadius: 16,
            overflow: "hidden",
            background: "rgba(255,255,255,0.15)",
            border: "1px solid rgba(255,255,255,0.1)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "12px 16px 8px",
              borderBottom: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            <div
              aria-hidden="true"
              style={{
                width: 30,
                height: 30,
                borderRadius: 9,
                background: "#065A82",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 28 36" fill="none">
                <path
                  d="M14 2C14 2 2 16 2 22A12 12 0 0 0 26 22C26 16 14 2 14 2Z"
                  fill="#F2A73B"
                />
              </svg>
            </div>
            <span style={{ fontSize: fs(12), fontWeight: 800, color: "white" }}>
              TOYAKU
            </span>
            <span
              style={{
                fontSize: fs(11),
                color: "rgba(255,255,255,0.5)",
                marginLeft: "auto",
              }}
            >
              ahora
            </span>
          </div>
          <div style={{ padding: "16px" }}>
            <p
              style={{
                fontSize: fs(16),
                fontWeight: 800,
                color: "white",
                lineHeight: 1.3,
              }}
            >
              🚛 El camión llega en ~10 min
            </p>
            <p
              style={{
                fontSize: fs(14),
                color: "rgba(255,255,255,0.8)",
                fontWeight: 600,
                marginTop: 6,
                lineHeight: 1.4,
              }}
            >
              Prepara tus baldes en la puerta — Jr. Los Álamos 342
            </p>
            <p
              style={{
                fontSize: fs(11),
                color: "rgba(255,255,255,0.55)",
                fontWeight: 600,
                marginTop: 10,
                lineHeight: 1.4,
                borderTop: "1px solid rgba(255,255,255,0.1)",
                paddingTop: 8,
              }}
            >
              Dato del GPS del camión, actualizado ahora.
              <br />
              Puede variar según el tráfico y las paradas.
            </p>
          </div>
          <div
            style={{
              display: "flex",
              borderTop: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            <button
              onClick={onClose}
              style={{
                flex: 1,
                padding: "12px",
                color: "rgba(255,255,255,0.6)",
                fontSize: fs(14),
                fontWeight: 600,
                background: "none",
                border: "none",
                cursor: "pointer",
                outline: "none",
                minHeight: 48,
              }}
              aria-label="Ignorar el aviso"
              {...focusRing(highContrast)}
            >
              Ignorar
            </button>
            <div
              style={{ width: 1, background: "rgba(255,255,255,0.1)" }}
            />
            <button
              onClick={() => onOpen("confirmation")}
              style={{
                flex: 1,
                padding: "12px",
                color: t.accent,
                fontSize: fs(14),
                fontWeight: 800,
                background: "none",
                border: "none",
                cursor: "pointer",
                outline: "none",
                minHeight: 48,
              }}
              aria-label="Abrir la confirmación de recepción"
              {...focusRing(highContrast)}
            >
              Abrir
            </button>
          </div>
        </div>
      </div>

      <div style={{ flex: 1 }} />

      <button
        onClick={() => onOpen("confirmation")}
        aria-label="Confirmar recepción del agua"
        style={{
          margin: "0 16px max(20px, env(safe-area-inset-bottom))",
          borderRadius: 16,
          minHeight: 58,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: highContrast ? "#FFD700" : "#065A82",
          color: highContrast ? "#000" : "white",
          fontSize: fs(17),
          fontWeight: 800,
          border: highContrast ? "3px solid #FFF" : "none",
          cursor: "pointer",
          outline: "none",
          flexShrink: 0,
        }}
        {...focusRing(highContrast)}
      >
        Confirmar recepción
      </button>
    </main>
  )
}

function ConfirmationModal({
  onClose,
  onOpen,
}: {
  onClose: () => void
  onOpen: (m: Modal) => void
}) {
  const t = useTokens()
  const fs = useFontSize()
  const { highContrast, voiceEnabled, speak } = useA11y()

  useEffect(() => {
    if (voiceEnabled) speak(VOICE.confirmation)
  }, [voiceEnabled])

  return (
    <main
      role="dialog"
      aria-modal="true"
      aria-label="Confirmar si recibiste el agua"
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
      }}
    >
      <StatusBar />
      <div
        style={{
          padding: "10px 20px 14px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexShrink: 0,
        }}
      >
        <BackButton onClick={onClose} label="Cerrar y volver al inicio" />
        <p style={{ fontSize: fs(12), color: t.textSub, fontWeight: 600 }}>
          Hoy, martes 1 sep
        </p>
      </div>

      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "0 24px",
          minHeight: 0,
        }}
      >
        <div
          aria-hidden="true"
          style={{
            width: 84,
            height: 84,
            borderRadius: "50%",
            background: highContrast
              ? t.primary
              : "linear-gradient(160deg, #065A82 0%, #1C7293 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 22,
            border: highContrast ? `3px solid ${t.primaryText}` : "none",
          }}
        >
          <svg width="42" height="42" viewBox="0 0 28 36" fill="none">
            <path
              d="M14 2C14 2 2 16 2 22A12 12 0 0 0 26 22C26 16 14 2 14 2Z"
              fill={highContrast ? "#000" : "white"}
            />
          </svg>
        </div>
        <p
          role="heading"
          aria-level={1}
          style={{
            fontSize: fs(27),
            fontWeight: 900,
            color: t.text,
            textAlign: "center",
            lineHeight: 1.2,
          }}
        >
          ¿Llegó tu agua?
        </p>
        <p
          style={{
            fontSize: fs(14),
            color: t.textSub,
            fontWeight: 600,
            marginTop: 10,
            textAlign: "center",
            lineHeight: 1.4,
          }}
        >
          Toca una sola vez para registrar la entrega.
        </p>
      </div>

      <div
        style={{
          padding: "0 20px max(20px, env(safe-area-inset-bottom))",
          display: "flex",
          flexDirection: "column",
          gap: 12,
          flexShrink: 0,
        }}
      >
        <button
          onClick={onClose}
          aria-label="Sí, recibí el agua. Registrar la entrega."
          style={{
            minHeight: 64,
            borderRadius: 16,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            background: t.success,
            color: "white",
            fontSize: fs(19),
            fontWeight: 900,
            border: highContrast ? "3px solid #FFF" : "none",
            cursor: "pointer",
            outline: "none",
          }}
          {...focusRing(highContrast)}
        >
          <svg
            width="26"
            height="26"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Sí, la recibí
        </button>

        <button
          onClick={() => onOpen("no-confirm")}
          aria-label="No llegó el agua. Reportar a la JASS."
          style={{
            minHeight: 64,
            borderRadius: 16,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            background: t.bgCard,
            color: t.danger,
            fontSize: fs(19),
            fontWeight: 900,
            border: `3px solid ${t.danger}`,
            cursor: "pointer",
            outline: "none",
          }}
          {...focusRing(highContrast)}
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke={t.danger}
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
          No llegó
        </button>

        <button
          onClick={onClose}
          aria-label="Cancelar y volver al inicio"
          style={{
            background: "none",
            border: "none",
            color: t.textSub,
            fontSize: fs(14),
            fontWeight: 700,
            cursor: "pointer",
            padding: "8px",
            minHeight: 44,
            outline: "none",
          }}
          {...focusRing(highContrast)}
        >
          Cancelar
        </button>

        <p
          role="note"
          style={{
            fontSize: fs(12),
            color: t.textSub,
            fontWeight: 600,
            textAlign: "center",
            lineHeight: 1.4,
          }}
        >
          Queda registrado el día y la hora de la entrega.
        </p>
      </div>
    </main>
  )
}

function NoConfirmModal({ onClose }: { onClose: () => void }) {
  const t = useTokens()
  const fs = useFontSize()
  const { highContrast, voiceEnabled, speak } = useA11y()

  useEffect(() => {
    if (voiceEnabled) speak(VOICE["no-confirm"])
  }, [voiceEnabled])

  return (
    <main
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="nc-title"
      aria-describedby="nc-desc"
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
      }}
    >
      <StatusBar />
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "0 24px",
          minHeight: 0,
        }}
      >
        <div
          role="img"
          aria-label="Icono de advertencia"
          style={{
            width: 84,
            height: 84,
            borderRadius: "50%",
            background: t.dangerBg,
            border: `3px solid ${t.danger}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 22,
          }}
        >
          <svg
            width="42"
            height="42"
            viewBox="0 0 24 24"
            fill="none"
            stroke={t.danger}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </div>
        <p
          id="nc-title"
          role="heading"
          aria-level={1}
          style={{
            fontSize: fs(23),
            fontWeight: 900,
            color: t.text,
            textAlign: "center",
            lineHeight: 1.3,
          }}
        >
          ¿Confirmas que no llegó el camión?
        </p>
        <p
          id="nc-desc"
          style={{
            fontSize: fs(14),
            color: t.textSub,
            fontWeight: 600,
            marginTop: 10,
            textAlign: "center",
            lineHeight: 1.5,
          }}
        >
          Se enviará un reporte a la JASS de tu zona.
          <br />
          Esto no puede deshacerse.
        </p>
      </div>

      <div
        style={{
          padding: "0 20px max(20px, env(safe-area-inset-bottom))",
          display: "flex",
          flexDirection: "column",
          gap: 12,
          flexShrink: 0,
        }}
      >
        <button
          onClick={onClose}
          aria-label="Confirmar que no llegó el camión y enviar el reporte a la JASS. Esta acción no se puede deshacer."
          style={{
            minHeight: 62,
            borderRadius: 16,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: t.danger,
            color: "white",
            fontSize: fs(17),
            fontWeight: 900,
            border: highContrast ? "3px solid #FFF" : "none",
            cursor: "pointer",
            outline: "none",
          }}
          {...focusRing(highContrast)}
        >
          Sí, confirmar reporte
        </button>
        <button
          onClick={onClose}
          aria-label="Volver sin reportar nada"
          style={{
            minHeight: 54,
            borderRadius: 16,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: t.bgCard,
            color: t.primary,
            fontSize: fs(16),
            fontWeight: 800,
            border: `2.5px solid ${t.primary}`,
            cursor: "pointer",
            outline: "none",
          }}
          {...focusRing(highContrast)}
        >
          Volver
        </button>
      </div>
    </main>
  )
}

function OfflineModal({ onClose }: { onClose: () => void }) {
  const t = useTokens()
  const fs = useFontSize()
  const { highContrast, voiceEnabled, speak } = useA11y()

  useEffect(() => {
    if (voiceEnabled) speak(VOICE.offline)
  }, [voiceEnabled])

  return (
    <main
      role="dialog"
      aria-modal="true"
      aria-label="Sin señal: no se puede calcular la hora"
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
      }}
    >
      <StatusBar />
      <div
        style={{
          padding: "10px 20px 14px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexShrink: 0,
        }}
      >
        <BackButton onClick={onClose} label="Salir del modo sin señal" />
        <p style={{ fontSize: fs(12), color: t.textSub, fontWeight: 700 }}>
          Sin cobertura GPS
        </p>
      </div>

      <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
        <div
          style={{
            margin: "0 16px",
            borderRadius: 22,
            padding: "28px 22px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            background: "#7A93A8",
            border: highContrast ? `3px solid ${t.primaryText}` : "none",
          }}
        >
          <svg
            width="56"
            height="56"
            viewBox="0 0 24 24"
            fill="none"
            stroke={highContrast ? t.primaryText : "#FFFFFF"}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          <p
            role="heading"
            aria-level={1}
            style={{
              fontSize: fs(32),
              fontWeight: 900,
              color: highContrast ? t.primaryText : "#FFFFFF",
              marginTop: 12,
              textAlign: "center",
              lineHeight: 1.1,
            }}
          >
            Sin señal
          </p>
          <p
            style={{
              fontSize: fs(16),
              color: highContrast ? t.primaryText : "#E8F1F6",
              fontWeight: 600,
              marginTop: 6,
              textAlign: "center",
            }}
          >
            No podemos calcular la hora
          </p>
          <p
            style={{
              fontSize: fs(12),
              color: highContrast ? t.primaryText : "rgba(255,255,255,0.85)",
              fontWeight: 600,
              marginTop: 18,
              textAlign: "center",
              lineHeight: 1.4,
            }}
          >
            No mostramos una hora estimada
            <br />
            cuando no podemos verificarla.
          </p>
        </div>

        <div
          style={{
            padding: "16px",
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          {[
            {
              title: "Último dato conocido",
              detail: "Hoy, 6:30 am · El camión estaba a 6 calles",
              icon: (
                <>
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </>
              ),
            },
            {
              title: "En tu calle",
              detail: "3 vecinos ya confirmaron recibo hoy",
              icon: (
                <>
                  <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 00-3-3.87" />
                </>
              ),
            },
          ].map(b => (
            <div
              key={b.title}
              role="group"
              aria-label={`${b.title}: ${b.detail}`}
              style={{
                borderRadius: 12,
                padding: 14,
                display: "flex",
                alignItems: "center",
                gap: 14,
                background: t.bgCard,
                border: highContrast ? `2px solid ${t.border}` : "none",
                boxShadow: t.cardShadow,
              }}
            >
              <div
                aria-hidden="true"
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  background: t.bg,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={t.primary}
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  {b.icon}
                </svg>
              </div>
              <div>
                <p
                  style={{
                    fontSize: fs(14),
                    fontWeight: 800,
                    color: t.text,
                  }}
                >
                  {b.title}
                </p>
                <p
                  style={{
                    fontSize: fs(12),
                    color: t.textSub,
                    fontWeight: 600,
                    marginTop: 2,
                  }}
                >
                  {b.detail}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div
        style={{
          padding: "0 16px max(20px, env(safe-area-inset-bottom))",
          display: "flex",
          flexDirection: "column",
          gap: 10,
          flexShrink: 0,
        }}
      >
        <p
          style={{
            fontSize: fs(12),
            color: t.textSub,
            fontWeight: 600,
            textAlign: "center",
            lineHeight: 1.4,
          }}
        >
          Ellos recibirán el aviso aunque tú no tengas señal.
        </p>
        <button
          onClick={onClose}
          aria-label="Avisar a mi familia que el camión está en camino"
          style={{
            minHeight: 58,
            borderRadius: 16,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            background: t.primary,
            color: highContrast ? "#000" : "#FFF",
            fontSize: fs(17),
            fontWeight: 800,
            border: highContrast ? `3px solid ${t.primaryText}` : "none",
            cursor: "pointer",
            outline: "none",
          }}
          {...focusRing(highContrast)}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 01-3.46 0" />
          </svg>
          Avisar a mi familia
        </button>
      </div>
    </main>
  )
}

/**
 * Ubicación aproximada del camión.
 *
 * No es navegación ni un mapa en vivo. Es un esquema estático, y lo importante
 * es que dibuja un CÍRCULO de incertidumbre en vez de un punto: en un
 * asentamiento periurbano el GPS se desvía decenas de metros, así que un punto
 * exacto afirmaría una certeza que el dato no tiene.
 *
 * Además no muestra una ruta a "seguir": la app avisa cuando el camión está a
 * 10 minutos. Darle a Rosa una ruta la tienta a salir a la puerta antes de
 * tiempo, que es justo el problema que la app resuelve.
 */
function WhereIsTruckModal({ onClose }: { onClose: () => void }) {
  const t = useTokens()
  const fs = useFontSize()
  const { highContrast, voiceEnabled, speak } = useA11y()

  useEffect(() => {
    if (voiceEnabled) speak(VOICE["where-is-truck"])
  }, [voiceEnabled])

  const TRUCK = { x: 108, y: 108 }
  const HOME = { x: 246, y: 318 }
  const streets = [58, 130, 208, 318]
  const avenues = [72, 176, 246]

  return (
    <main
      role="dialog"
      aria-modal="true"
      aria-label="Ubicación aproximada del camión cisterna"
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
      }}
    >
      <StatusBar />
      <div
        style={{
          padding: "10px 20px 14px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexShrink: 0,
        }}
      >
        <BackButton onClick={onClose} label="Volver al inicio" />
        <p
          role="heading"
          aria-level={1}
          style={{ fontSize: fs(19), fontWeight: 900, color: t.text }}
        >
          Dónde está el camión
        </p>
      </div>

      <div style={{ flex: 1, padding: "0 16px", minHeight: 0 }}>
        <figure
          style={{
            margin: 0,
            height: "100%",
            minHeight: 0,
            borderRadius: 18,
            overflow: "hidden",
            background: highContrast ? "#000" : "#E8F0F6",
            border: `1.5px solid ${t.border}`,
          }}
        >
          <svg
            viewBox="0 0 320 400"
            width="100%"
            height="100%"
            preserveAspectRatio="xMidYMid meet"
            role="img"
            aria-label={`Mapa esquemático de la zona. El camión está a cuatro calles, en una posición aproximada con un margen de error de cincuenta metros. Tu casa está marcada en la esquina inferior derecha.`}
          >
            {/* Calles del asentamiento */}
            <g
              stroke={highContrast ? "#FFFFFF" : "#D3E1EB"}
              strokeWidth="8"
              strokeLinecap="round"
            >
              {streets.map(y => (
                <line key={`s${y}`} x1="16" y1={y} x2="304" y2={y} />
              ))}
              {avenues.map(x => (
                <line key={`a${x}`} x1={x} y1="20" x2={x} y2="384" />
              ))}
            </g>

            {/* Tramo restante, punteado: referencia, no guía */}
            <polyline
              points={`${TRUCK.x},${TRUCK.y} ${TRUCK.x},208 ${HOME.x},208 ${HOME.x},${HOME.y}`}
              fill="none"
              stroke={highContrast ? "#FFD700" : "#F2A73B"}
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray="2 8"
              opacity="0.85"
            />

            {/* Cámara de incertidumbre: el dato central de honestidad */}
            <circle
              cx={TRUCK.x}
              cy={TRUCK.y}
              r="34"
              fill={highContrast ? "#FFD700" : "#F2A73B"}
              opacity="0.16"
            />
            <circle
              cx={TRUCK.x}
              cy={TRUCK.y}
              r="34"
              fill="none"
              stroke={highContrast ? "#FFD700" : "#D4891A"}
              strokeWidth="1.5"
              strokeDasharray="4 4"
            />

            {/* El camión */}
            <g transform={`translate(${TRUCK.x - 14} ${TRUCK.y - 12})`}>
              <svg
                width="28"
                height="24"
                viewBox="0 0 28 24"
                fill="none"
                aria-hidden="true"
              >
                <rect
                  x="1"
                  y="4"
                  width="15"
                  height="13"
                  rx="2"
                  fill={highContrast ? "#000" : "#1C7293"}
                />
                <path
                  d="M16 8h5l5 5v4h-10V8z"
                  fill={highContrast ? "#000" : "#1C7293"}
                />
                <circle cx="7" cy="19" r="3" fill={highContrast ? "#FFD700" : "#065A82"} />
                <circle cx="21" cy="19" r="3" fill={highContrast ? "#FFD700" : "#065A82"} />
              </svg>
            </g>

            {/* Tu casa */}
            <g transform={`translate(${HOME.x - 11} ${HOME.y - 11})`}>
              <svg width="22" height="22" viewBox="0 0 28 36" fill="none" aria-hidden="true">
                <path
                  d="M14 2C14 2 2 16 2 22A12 12 0 0 0 26 22C26 16 14 2 14 2Z"
                  fill={highContrast ? "#FFD700" : "#065A82"}
                />
              </svg>
            </g>
            <circle
              cx={HOME.x}
              cy={HOME.y}
              r="20"
              fill="none"
              stroke={highContrast ? "#FFD700" : "#065A82"}
              strokeWidth="1.5"
              opacity="0.45"
            />
          </svg>
        </figure>
      </div>

      <div style={{ padding: "14px 16px max(20px, env(safe-area-inset-bottom))", flexShrink: 0 }}>
        <div
          style={{
            display: "flex",
            gap: 14,
            alignItems: "center",
            padding: 14,
            borderRadius: 14,
            background: t.bgCard,
            border: `1.5px dashed ${t.border}`,
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: 42,
              height: 42,
              borderRadius: "50%",
              border: "1.5px dashed #D4891A",
              background: "rgba(242,167,59,0.16)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <svg width="22" height="20" viewBox="0 0 28 24" fill="none">
              <rect x="1" y="4" width="15" height="13" rx="2" fill="#1C7293" />
              <path d="M16 8h5l5 5v4h-10V8z" fill="#1C7293" />
              <circle cx="7" cy="19" r="3" fill="#065A82" />
              <circle cx="21" cy="19" r="3" fill="#065A82" />
            </svg>
          </span>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: fs(15), fontWeight: 900, color: t.text }}>
              A 4 calles de tu casa
            </p>
            <p
              style={{
                fontSize: fs(12),
                fontWeight: 600,
                color: t.textSub,
                marginTop: 3,
              }}
            >
              Última actualización 9:41 am · hace 1 min
            </p>
          </div>
        </div>

        <p
          role="note"
          style={{
            fontSize: fs(12),
            fontWeight: 600,
            color: t.textSub,
            textAlign: "center",
            lineHeight: 1.5,
            marginTop: 12,
          }}
        >
          El círculo es el margen de error del GPS aquí (±50 m). Por eso no te
          mostramos un punto exacto.
        </p>

        <p
          style={{
            fontSize: fs(13),
            fontWeight: 700,
            color: t.text,
            textAlign: "center",
            lineHeight: 1.4,
            marginTop: 10,
          }}
        >
          No vengas a la puerta todavía.
          <br />
          Te avisamos cuando esté a 10 min.
        </p>
      </div>
    </main>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// CHOFER
// ════════════════════════════════════════════════════════════════════════════

/** Botón de acción del chofer: se aprieta sin mirar, por eso es enorme. */
function DriverCTA({
  label,
  sub,
  onClick,
  ariaLabel,
  tone = "primary",
  big = true,
}: {
  label: string
  sub?: string
  onClick: () => void
  ariaLabel: string
  tone?: "primary" | "success" | "ghost"
  big?: boolean
}) {
  const { highContrast } = useA11y()
  const fs = useFontSize()
  const bg =
    tone === "success"
      ? "#1B7F4B"
      : tone === "ghost"
        ? "rgba(255,255,255,0.1)"
        : "#F2A73B"
  const fg = tone === "ghost" ? "#FFFFFF" : "#101418"
  const border = tone === "ghost" ? "2.5px solid rgba(255,255,255,0.5)" : "none"

  return (
    <button
      onClick={onClick}
      aria-label={ariaLabel}
      style={{
        width: "100%",
        minHeight: big ? 96 : 60,
        borderRadius: 20,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 2,
        background: highContrast ? "#FFD700" : bg,
        color: highContrast ? "#000" : fg,
        border: highContrast ? "3px solid #FFFFFF" : border,
        cursor: "pointer",
        outline: "none",
      }}
      {...focusRing(highContrast)}
    >
      <span
        style={{ fontSize: big ? 29 : 19, fontWeight: 900, letterSpacing: "0.01em" }}
      >
        {label}
      </span>
      {sub && (
        <span style={{ fontSize: fs(12), fontWeight: 700, opacity: 0.85 }}>
          {sub}
        </span>
      )}
    </button>
  )
}

function DriverLoginModal({ onClose, onNext }: { onClose: () => void; onNext: () => void }) {
  const fs = useFontSize()
  const { highContrast, voiceEnabled, speak } = useA11y()

  useEffect(() => {
    if (voiceEnabled) speak(VOICE["driver-login"])
  }, [voiceEnabled])

  return (
    <main
      role="dialog"
      aria-modal="true"
      aria-label="Ingreso del chofer"
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        background: "#101418",
        color: "#FFFFFF",
      }}
    >
      <div
        aria-hidden="true"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "max(14px, env(safe-area-inset-top)) 20px 4px",
          fontSize: 12,
          fontWeight: 700,
          color: "#7C8B99",
        }}
      >
        <span>9:41</span>
        <span>TOYAKU CHOFER</span>
      </div>

      <div
        style={{
          padding: "8px 16px 12px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexShrink: 0,
        }}
      >
        <button
          onClick={onClose}
          aria-label="Volver a la elección de rol"
          style={{
            width: 44,
            height: 44,
            borderRadius: "50%",
            background: "rgba(255,255,255,0.12)",
            border: "2px solid rgba(255,255,255,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            cursor: "pointer",
            outline: "none",
          }}
          {...focusRing(highContrast)}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#FFFFFF"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
        </button>
        <p
          role="heading"
          aria-level={1}
          style={{ fontSize: fs(19), fontWeight: 900, color: "#FFFFFF" }}
        >
          Entrar
        </p>
      </div>

      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "0 24px 20px",
          minHeight: 0,
          overflowY: "auto",
        }}
      >
        <p
          style={{
            fontSize: fs(21),
            fontWeight: 900,
            textAlign: "center",
            lineHeight: 1.25,
            color: "#FFFFFF",
          }}
        >
          Una sola vez, por WhatsApp
        </p>
        <p
          style={{
            fontSize: fs(14),
            fontWeight: 600,
            textAlign: "center",
            color: "#A9B7C4",
            marginTop: 10,
            lineHeight: 1.5,
          }}
        >
          Te enviamos un enlace a tu WhatsApp. Lo tocas y quedás registrado. No
          hay contraseña ni formulario.
        </p>

        <div
          role="note"
          style={{
            marginTop: 22,
            padding: 14,
            borderRadius: 14,
            background: "rgba(255,255,255,0.07)",
            border: "1.5px solid rgba(255,255,255,0.18)",
          }}
        >
          <p style={{ fontSize: fs(13), fontWeight: 800, color: "#FFFFFF" }}>
            Por qué te conviene entrar
          </p>
          <p
            style={{
              fontSize: fs(12),
              fontWeight: 600,
              color: "#A9B7C4",
              marginTop: 6,
              lineHeight: 1.5,
            }}
          >
            Cada entrega que registres queda con hora y lugar. Ese registro es tu
            comprobante para que la asociación te pague, y evita que te discutan
            cobros.
          </p>
        </div>
      </div>

      <div style={{ padding: "0 16px max(20px, env(safe-area-inset-bottom))" }}>
        <DriverCTA
          label="Enviarme el enlace"
          sub="Te llega al WhatsApp en 10 segundos"
          ariaLabel="Enviarme el enlace de ingreso por WhatsApp"
          onClick={onNext}
        />
      </div>
    </main>
  )
}

function DriverHomeScreen({
  onNav,
  onModal,
}: {
  onNav: (k: string) => void
  onModal: (m: Modal) => void
}) {
  const fs = useFontSize()
  const { highContrast, voiceEnabled, speak } = useA11y()

  useEffect(() => {
    if (voiceEnabled) speak(VOICE["driver-home"])
  }, [voiceEnabled])

  return (
    <main
      role="main"
      aria-label="Reparto del chofer"
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        background: "#101418",
      }}
    >
      <div
        aria-hidden="true"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "max(14px, env(safe-area-inset-top)) 20px 4px",
          fontSize: 12,
          fontWeight: 700,
          color: "#7C8B99",
          flexShrink: 0,
        }}
      >
        <span>9:41</span>
        <span>TOYAKU CHOFER</span>
      </div>

      <div style={{ padding: "10px 20px 12px", flexShrink: 0 }}>
        <p
          role="heading"
          aria-level={1}
          style={{ fontSize: fs(21), fontWeight: 900, color: "#FFFFFF" }}
        >
          Reparto
        </p>
      </div>

      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          padding: "0 16px 16px",
          gap: 14,
          minHeight: 0,
        }}
      >
        <div
          role="note"
          style={{
            padding: 14,
            borderRadius: 14,
            background: "rgba(27,127,75,0.18)",
            border: "1.5px solid #1B7F4B",
          }}
        >
          <p style={{ fontSize: fs(13), fontWeight: 900, color: "#5FD69B" }}>
            Esto es lo que ganas
          </p>
          <p
            style={{
              fontSize: fs(12),
              fontWeight: 600,
              color: "#C9D6E1",
              marginTop: 6,
              lineHeight: 1.5,
            }}
          >
            Cada parada que marques queda registrada con hora. Al terminar,
            tenés tu comprobante de cobro y la asociación te paga sin discutir.
          </p>
        </div>

        <div
          style={{ display: "flex", justifyContent: "center", gap: 28 }}
        >
          {[
            { k: "4", l: "paradas hoy" },
            { k: "S/ 85", l: "por cobrar" },
          ].map(s => (
            <div key={s.l} style={{ textAlign: "center" }}>
              <p
                style={{
                  fontSize: fs(25),
                  fontWeight: 900,
                  color: "#FFFFFF",
                  lineHeight: 1,
                }}
              >
                {s.k}
              </p>
              <p
                style={{
                  fontSize: fs(11),
                  fontWeight: 700,
                  color: "#7C8B99",
                  marginTop: 4,
                }}
              >
                {s.l}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div
        style={{
          padding: "0 16px 14px",
          display: "flex",
          flexDirection: "column",
          gap: 10,
          flexShrink: 0,
        }}
      >
        <DriverCTA
          label="INICIAR REPARTO"
          sub="Aprieta una vez. Listo."
          ariaLabel="Iniciar reparto. Se registra tu ubicación cada dos minutos."
          onClick={() => onModal("driver-trip")}
        />
      </div>

      <div style={{ background: "#101418", flexShrink: 0 }}>
        <BottomNav items={CHOFER_NAV} current="driver-home" onChange={onNav} />
      </div>
    </main>
  )
}

function DriverTripModal({ onClose, onNext }: { onClose: () => void; onNext: () => void }) {
  const fs = useFontSize()
  const { highContrast, voiceEnabled, speak } = useA11y()

  useEffect(() => {
    if (voiceEnabled) speak(VOICE["driver-trip"])
  }, [voiceEnabled])

  const current = STOPS[0]

  return (
    <main
      role="dialog"
      aria-modal="true"
      aria-label="Reparto en curso"
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        background: "#101418",
        color: "#FFFFFF",
      }}
    >
      <div
        aria-hidden="true"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "max(14px, env(safe-area-inset-top)) 20px 4px",
          fontSize: 12,
          fontWeight: 700,
          color: "#7C8B99",
          flexShrink: 0,
        }}
      >
        <span>9:41</span>
        <span>GPS ENVIANDO</span>
      </div>

      <div style={{ padding: "10px 16px 12px", flexShrink: 0 }}>
        <p
          role="heading"
          aria-level={1}
          style={{ fontSize: fs(21), fontWeight: 900, color: "#FFFFFF" }}
        >
          Parada 1 de {STOPS.length}
        </p>
      </div>

      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={STOPS.length}
        aria-valuenow={1}
        aria-label={`Parada 1 de ${STOPS.length}`}
        style={{
          height: 8,
          margin: "0 16px 14px",
          borderRadius: 999,
          background: "rgba(255,255,255,0.15)",
          overflow: "hidden",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: "12%",
            height: "100%",
            background: "#F2A73B",
            borderRadius: 999,
          }}
        />
      </div>

      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "0 16px 16px",
          gap: 12,
          minHeight: 0,
        }}
      >
        <div
          style={{
            borderRadius: 20,
            padding: "22px 18px",
            background: "rgba(255,255,255,0.07)",
            border: "2px solid rgba(255,255,255,0.2)",
          }}
        >
          <p
            style={{
              fontSize: fs(29),
              fontWeight: 900,
              color: "#FFFFFF",
              lineHeight: 1.15,
            }}
          >
            {current.street}
          </p>
          <p
            style={{
              fontSize: fs(14),
              fontWeight: 700,
              color: "#A9B7C4",
              marginTop: 10,
            }}
          >
            {current.detail}
          </p>
          <div
            style={{
              marginTop: 14,
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              borderRadius: 999,
              padding: "6px 14px",
              background: "rgba(242,167,59,0.18)",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 28 36" fill="none" aria-hidden="true">
              <path
                d="M14 2C14 2 2 16 2 22A12 12 0 0 0 26 22C26 16 14 2 14 2Z"
                fill="#F2A73B"
              />
            </svg>
            <span style={{ fontSize: fs(14), fontWeight: 900, color: "#F2A73B" }}>
              {current.jugs} baldes
            </span>
          </div>
        </div>

        <p
          style={{
            fontSize: fs(12),
            fontWeight: 600,
            color: "#7C8B99",
            lineHeight: 1.4,
          }}
        >
          Si el balde se llenó, aprieta ENTREGADO. No escribas nada.
        </p>
      </div>

      <div
        style={{
          padding: "0 16px max(20px, env(safe-area-inset-bottom))",
          display: "flex",
          flexDirection: "column",
          gap: 10,
          flexShrink: 0,
        }}
      >
        <DriverCTA
          label="ENTREGADO"
          tone="success"
          ariaLabel={`Marcar como entregado en ${current.street}`}
          onClick={onNext}
        />
        <button
          onClick={onClose}
          style={{
            width: "100%",
            minHeight: 48,
            borderRadius: 14,
            background: "none",
            border: "2px solid rgba(255,255,255,0.35)",
            color: "#FFFFFF",
            fontSize: fs(15),
            fontWeight: 700,
            cursor: "pointer",
            outline: "none",
          }}
          {...focusRing(highContrast)}
        >
          Pausar el reparto
        </button>
      </div>
    </main>
  )
}

function DriverRouteScreen({ onNav }: { onNav: (k: string) => void }) {
  const fs = useFontSize()
  const { highContrast, voiceEnabled, speak } = useA11y()

  useEffect(() => {
    if (voiceEnabled) speak(VOICE["driver-route"])
  }, [voiceEnabled])

  const streets = [58, 130, 208, 330]
  const avenues = [62, 172, 252]

  return (
    <main
      role="main"
      aria-label="Ruta del reparto"
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        background: "#101418",
      }}
    >
      <div
        aria-hidden="true"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "max(14px, env(safe-area-inset-top)) 20px 4px",
          fontSize: 12,
          fontWeight: 700,
          color: "#7C8B99",
          flexShrink: 0,
        }}
      >
        <span>9:41</span>
        <span>TOYAKU CHOFER</span>
      </div>

      <div style={{ padding: "10px 20px 12px", flexShrink: 0 }}>
        <p
          role="heading"
          aria-level={1}
          style={{ fontSize: fs(21), fontWeight: 900, color: "#FFFFFF" }}
        >
          La ruta
        </p>
      </div>

      <div
        role="note"
        style={{
          margin: "0 16px 12px",
          padding: "10px 14px",
          borderRadius: 12,
          background: "rgba(192,57,43,0.2)",
          border: "1.5px solid #C0392B",
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexShrink: 0,
        }}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#FF8A80"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        </svg>
        <p style={{ fontSize: fs(12), fontWeight: 800, color: "#FF8A80" }}>
          Mírala con el camión detenido, no conduciendo.
        </p>
      </div>

      <div style={{ flex: 1, padding: "0 16px", minHeight: 0 }}>
        <figure
          style={{
            margin: 0,
            height: "100%",
            minHeight: 0,
            borderRadius: 16,
            overflow: "hidden",
            background: "#182028",
            border: "1.5px solid rgba(255,255,255,0.18)",
          }}
        >
          <svg
            viewBox="0 0 320 400"
            width="100%"
            height="100%"
            preserveAspectRatio="xMidYMid meet"
            role="img"
            aria-label={`Ruta de ${STOPS.length} paradas: ${STOPS.map(s => s.street).join(", ")}`}
          >
            <g stroke="#2A3644" strokeWidth="7" strokeLinecap="round">
              {streets.map(y => (
                <line key={`s${y}`} x1="20" y1={y} x2="300" y2={y} />
              ))}
              {avenues.map(x => (
                <line key={`a${x}`} x1={x} y1="20" x2={x} y2="380" />
              ))}
            </g>

            <polyline
              points={STOPS.map(s => `${s.x},${s.y}`).join(" ")}
              fill="none"
              stroke="#F2A73B"
              strokeWidth="5"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="1 9"
            />

            {STOPS.map((s, i) => {
              const active = i === 0
              return (
                <g key={s.n}>
                  {active && (
                    <circle
                      cx={s.x}
                      cy={s.y}
                      r="22"
                      fill="#F2A73B"
                      opacity="0.22"
                    />
                  )}
                  <circle
                    cx={s.x}
                    cy={s.y}
                    r="15"
                    fill={active ? "#F2A73B" : "#101418"}
                    stroke={active ? "#F2A73B" : "#5D6B79"}
                    strokeWidth="2.5"
                  />
                  <text
                    x={s.x}
                    y={s.y + 5}
                    textAnchor="middle"
                    fontSize="15"
                    fontWeight="900"
                    fill={active ? "#101418" : "#A9B7C4"}
                    fontFamily="'Nunito', sans-serif"
                  >
                    {s.n}
                  </text>
                </g>
              )
            })}
          </svg>
        </figure>
      </div>

      <ul
        role="list"
        aria-label="Paradas de la ruta"
        style={{
          listStyle: "none",
          margin: 0,
          padding: "12px 16px 14px",
          display: "flex",
          flexDirection: "column",
          gap: 7,
          flexShrink: 0,
        }}
      >
        {STOPS.map((s, i) => (
          <li
            key={s.n}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "9px 12px",
              borderRadius: 12,
              background: i === 0 ? "rgba(242,167,59,0.16)" : "rgba(255,255,255,0.06)",
              border: i === 0 ? "1.5px solid #F2A73B" : "1.5px solid transparent",
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 26,
                height: 26,
                borderRadius: "50%",
                background: i === 0 ? "#F2A73B" : "rgba(255,255,255,0.2)",
                color: i === 0 ? "#101418" : "#A9B7C4",
                fontSize: 13,
                fontWeight: 900,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              {s.n}
            </span>
            <span style={{ fontSize: fs(13), fontWeight: 800, color: "#FFFFFF", flex: 1 }}>
              {s.street}
            </span>
            <span style={{ fontSize: fs(12), fontWeight: 700, color: "#7C8B99" }}>
              {s.jugs} baldes
            </span>
          </li>
        ))}
      </ul>

      <div style={{ background: "#101418", flexShrink: 0 }}>
        <BottomNav items={CHOFER_NAV} current="driver-route" onChange={onNav} />
      </div>
    </main>
  )
}

function DriverSummaryModal({ onClose }: { onClose: () => void }) {
  const fs = useFontSize()
  const { highContrast, voiceEnabled, speak } = useA11y()

  useEffect(() => {
    if (voiceEnabled) speak(VOICE["driver-summary"])
  }, [voiceEnabled])

  return (
    <main
      role="dialog"
      aria-modal="true"
      aria-label="Reparto terminado: tu comprobante de cobro"
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        background: "#101418",
        color: "#FFFFFF",
      }}
    >
      <div
        aria-hidden="true"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "max(14px, env(safe-area-inset-top)) 20px 4px",
          fontSize: 12,
          fontWeight: 700,
          color: "#7C8B99",
          flexShrink: 0,
        }}
      >
        <span>9:41</span>
        <span>TOYAKU CHOFER</span>
      </div>

      <div style={{ padding: "10px 20px 12px", flexShrink: 0 }}>
        <p
          role="heading"
          aria-level={1}
          style={{ fontSize: fs(21), fontWeight: 900, color: "#FFFFFF" }}
        >
          Reparto terminado
        </p>
      </div>

      <div style={{ flex: 1, overflowY: "auto", minHeight: 0, padding: "0 16px 12px" }}>
        <div
          role="status"
          style={{
            borderRadius: 18,
            padding: 18,
            background: "rgba(27,127,75,0.18)",
            border: "1.5px solid #1B7F4B",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <svg
              width="26"
              height="26"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#5FD69B"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <p style={{ fontSize: fs(17), fontWeight: 900, color: "#5FD69B" }}>
              4 paradas registradas
            </p>
          </div>

          <div
            style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 10 }}
          >
            {[
              { k: "3", l: "entregas confirmadas", c: "#5FD69B" },
              { k: "1", l: "no atendida", c: "#FF8A80" },
              { k: "11", l: "baldes", c: "#FFFFFF" },
              { k: "S/ 85", l: "por cobrar", c: "#F2A73B" },
            ].map(r => (
              <div
                key={r.l}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span
                  style={{ fontSize: fs(13), fontWeight: 600, color: "#A9B7C4" }}
                >
                  {r.l}
                </span>
                <span style={{ fontSize: fs(16), fontWeight: 900, color: r.c }}>
                  {r.k}
                </span>
              </div>
            ))}
          </div>
        </div>

        <p
          style={{
            fontSize: fs(12),
            fontWeight: 600,
            color: "#7C8B99",
            marginTop: 14,
            lineHeight: 1.5,
            textAlign: "center",
          }}
        >
          Este registro es tu comprobante de cobro. La asociación lo ve al
          terminar el día.
        </p>
      </div>

      <div style={{ padding: "0 16px max(20px, env(safe-area-inset-bottom))" }}>
        <DriverCTA
          label="FINALIZAR"
          ariaLabel="Finalizar el reparto y enviar mi comprobante de cobro"
          onClick={onClose}
        />
      </div>
    </main>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// ROOT
// ════════════════════════════════════════════════════════════════════════════

const ROLE_KEY = "toyaku.role"

export default function App() {
  const [role, setRole] = useState<Role | null>(() => {
    if (typeof window === "undefined") return null
    const saved = window.localStorage.getItem(ROLE_KEY)
    return saved === "vecina" || saved === "chofer" ? saved : null
  })

  const [tab, setTab] = useState<string>("home")
  const [modal, setModal] = useState<Modal | null>(null)
  const [offlineOn, setOfflineOn] = useState(false)
  const [driverLoggedIn, setDriverLoggedIn] = useState(false)

  const [fontSize, setFontSize] = useState<"normal" | "large" | "xlarge">("normal")
  const [highContrast, setHighContrast] = useState(false)
  const [voiceEnabled, setVoiceEnabled] = useState(false)
  const { speak, stop } = useSpeech()

  const handleSpeak = useCallback((text: string) => speak(text), [speak])
  const ctx: A11y = {
    fontSize,
    highContrast,
    voiceEnabled,
    setFontSize,
    setHighContrast,
    setVoiceEnabled,
    speak: handleSpeak,
  }

  function pickRole(r: Role) {
    setRole(r)
    try {
      window.localStorage.setItem(ROLE_KEY, r)
    } catch {
      /* modo privado: se pierde el recuerdo, no rompe nada */
    }
    setTab(r === "vecina" ? "home" : "driver-home")
    setModal(r === "chofer" && !driverLoggedIn ? "driver-login" : null)
  }

  function changeRole() {
    setRole(null)
    setModal(null)
    setTab("home")
    try {
      window.localStorage.removeItem(ROLE_KEY)
    } catch {
      /* noop */
    }
  }

  function openModal(m: Modal) {
    if (m === "offline") setOfflineOn(true)
    setModal(m)
  }

  function closeModal() {
    if (modal === "offline") setOfflineOn(false)
    setModal(null)
  }

  function goTab(k: string) {
    setTab(k)
    setModal(null)
  }

  function toggleOffline() {
    setOfflineOn(v => {
      setModal(v ? null : "offline")
      return !v
    })
  }

  // El chofer entra una vez por WhatsApp y después solo pulsa botones.
  useEffect(() => {
    if (role === "chofer" && !driverLoggedIn && !modal) {
      setModal("driver-login")
    }
  }, [role, driverLoggedIn, modal])

  useEffect(() => () => stop(), [stop])

  const ctxValue = ctx

  return (
    <A11yCtx.Provider value={ctxValue}>
      <AppShell>
        {role === null ? (
          <RoleSelectScreen onPick={pickRole} />
        ) : modal !== null ? (
          <>
            {modal === "notification" && (
              <NotificationModal onClose={closeModal} onOpen={openModal} />
            )}
            {modal === "confirmation" && (
              <ConfirmationModal onClose={closeModal} onOpen={openModal} />
            )}
            {modal === "no-confirm" && <NoConfirmModal onClose={closeModal} />}
            {modal === "offline" && <OfflineModal onClose={closeModal} />}
            {modal === "where-is-truck" && (
              <WhereIsTruckModal onClose={closeModal} />
            )}
            {modal === "driver-login" && (
              <DriverLoginModal
                onClose={changeRole}
                onNext={() => {
                  setDriverLoggedIn(true)
                  setModal(null)
                }}
              />
            )}
            {modal === "driver-trip" && (
              <DriverTripModal
                onClose={closeModal}
                onNext={() => openModal("driver-summary")}
              />
            )}
            {modal === "driver-summary" && (
              <DriverSummaryModal onClose={closeModal} />
            )}
          </>
        ) : role === "vecina" ? (
          <>
            {tab === "home" && (
              <HomeScreen
                onNav={goTab}
                onModal={openModal}
                offlineOn={offlineOn}
                onToggleOffline={toggleOffline}
              />
            )}
            {tab === "history" && <HistoryScreen onNav={goTab} />}
            {tab === "help" && <HelpScreen onNav={goTab} onModal={openModal} />}
            {tab === "settings" && (
              <SettingsScreen
                onNav={goTab}
                role={role}
                onChangeRole={changeRole}
                offlineOn={offlineOn}
                onToggleOffline={toggleOffline}
              />
            )}
          </>
        ) : (
          <>
            {tab === "driver-home" && (
              <DriverHomeScreen onNav={goTab} onModal={openModal} />
            )}
            {tab === "driver-route" && <DriverRouteScreen onNav={goTab} />}
            {tab === "settings" && (
              <SettingsScreen
                onNav={goTab}
                role={role}
                onChangeRole={changeRole}
                offlineOn={offlineOn}
                onToggleOffline={toggleOffline}
              />
            )}
          </>
        )}
      </AppShell>
    </A11yCtx.Provider>
  )
}