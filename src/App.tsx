import { useState, useEffect, createContext, useContext } from "react";
import { useAuth } from "./hooks/useAuth";
import Login from "./components/Login";
import Resumo from "./components/Resumo";
import Movimentacoes from "./components/Movimentacoes";
import ControleSemanal from "./components/ControleSemanal";
import FaturaCartao from "./components/FaturaCartao";
import DRE from "./components/DRE";
import Cartoes from "./components/Cartoes";
import Cadastros from "./components/Cadastros";
import Lancamento from "./components/Lancamento";
import ConfirmarDebito from "./components/ConfirmarDebito";
import ExtratoConta from "./components/ExtratoConta";
import UploadPlanilha from "./components/UploadPlanilha";
import Alertas from "./components/Alertas";
import NotificacoesConfig from "./components/NotificacoesConfig";
import ConsultorIA from "./components/ConsultorIA";
import ConferenciaWhatsApp from "./components/ConferenciaWhatsApp";
import Endividamento from "./components/Endividamento";
import HomePanel from "./components/HomePanel"
import Calendario from "./components/Calendario";
import ConsumoMensal from "./components/ConsumoMensal";

import {
  BarChart3, List, Calendar, CreditCard, Wallet,
  FileText, Database, PlusCircle, CheckCircle, Layers,
  BookOpen, Upload, Bell, ChevronLeft, ChevronRight,
  LogOut, Home as HomeIcon, ChevronDown, Sparkles,
  TrendingDown, ShoppingCart, Sun, Moon,
} from "lucide-react";

// ─── Theme Context ────────────────────────────────────────────────────────────

type Theme = "dark" | "light"

interface ThemeTokens {
  sidebarBg: string
  sidebarBorder: string
  sidebarGroupLabel: string
  sidebarItemHover: string
  sidebarText: string
  sidebarSubtext: string
  sidebarAccent: string
  contentBg: string
  homeBg: string
  homeCardBg: string
  homeCardBorder: string
  homeCardText: string
  homeCardDesc: string
  homeTopbarBg: string
  homeHeroBorder: string
  homeTagBg: string
  homeTagBorder: string
  homeTagText: string
  homeGroupLabel: string
}

const DARK: ThemeTokens = {
  sidebarBg:         "#141b2d",
  sidebarBorder:     "#1e2d45",
  sidebarGroupLabel: "#475569",
  sidebarItemHover:  "#1e2d45",
  sidebarText:       "#94a3b8",
  sidebarSubtext:    "#64748b",
  sidebarAccent:     "#667eea",
  contentBg:         "#0b1120",
  homeBg:            "#0b1120",
  homeCardBg:        "#0d1526",
  homeCardBorder:    "#1e2d45",
  homeCardText:      "#f1f5f9",
  homeCardDesc:      "#475569",
  homeTopbarBg:      "#0d1526",
  homeHeroBorder:    "#1e2d45",
  homeTagBg:         "#1e2d45",
  homeTagBorder:     "#2a3f5f",
  homeTagText:       "#94a3b8",
  homeGroupLabel:    "#475569",
}

const LIGHT: ThemeTokens = {
  sidebarBg:         "#1e293b",
  sidebarBorder:     "#334155",
  sidebarGroupLabel: "#64748b",
  sidebarItemHover:  "#334155",
  sidebarText:       "#cbd5e1",
  sidebarSubtext:    "#94a3b8",
  sidebarAccent:     "#667eea",
  contentBg:         "#f5f0e8",
  homeBg:            "#f5f0e8",
  homeCardBg:        "#ffffff",
  homeCardBorder:    "#e2e8f0",
  homeCardText:      "#111827",
  homeCardDesc:      "#64748b",
  homeTopbarBg:      "#ffffff",
  homeHeroBorder:    "#e2e8f0",
  homeTagBg:         "#f1f5f9",
  homeTagBorder:     "#e2e8f0",
  homeTagText:       "#64748b",
  homeGroupLabel:    "#94a3b8",
}

const ThemeCtx = createContext<{ theme: Theme; tokens: ThemeTokens; toggle: () => void }>({
  theme: "dark", tokens: DARK, toggle: () => {}
})

const useTheme = () => useContext(ThemeCtx)

// ─── Types ────────────────────────────────────────────────────────────────────

type Pagina =
  | "home" | "resumo" | "movimentacoes"
  | "semanal" | "fatura" | "dre" | "cartoes"
  | "cadastros" | "lancamento" | "confirmar" | "extrato" | "upload"
  | "alertas" | "notificacoes" | "consultor" | "conferencia"
  | "endividamento" | "calendario" | "consumo"

const grupos: {
  label: string
  items: { label: string; key: Pagina; icon: React.ElementType; accent?: string }[]
}[] = [
  {
    label: "Configuração",
    items: [
      { label: "Cadastros",    key: "cadastros",    icon: Database },
      { label: "Importar",     key: "upload",       icon: Upload   },
      { label: "Notificações", key: "notificacoes", icon: Bell     },
    ],
  },
  {
    label: "Lançamentos",
    items: [
      { label: "Lançar",            key: "lancamento",    icon: PlusCircle   },
      { label: "Confirmar Débitos", key: "confirmar",     icon: CheckCircle  },
      { label: "Movimentações",     key: "movimentacoes", icon: List         },
    ],
  },
  {
    label: "Análises",
    items: [
      { label: "Consultor IA",   key: "consultor",      icon: Sparkles,    accent: "#667eea"  },
      { label: "Resumo",         key: "resumo",         icon: BarChart3                       },
      { label: "Semanal",        key: "semanal",        icon: Calendar                        },
      { label: "DRE",            key: "dre",            icon: FileText                        },
      { label: "Consumo Mensal", key: "consumo",        icon: ShoppingCart                    },
      { label: "Endividamento",  key: "endividamento",  icon: TrendingDown                    },
      { label: "Calendário",     key: "calendario",     icon: Calendar                            },
    ],
  },
  {
    label: "Bancos",
    items: [
      { label: "Fatura Cartão", key: "fatura",  icon: CreditCard },
      { label: "Extrato Conta", key: "extrato", icon: BookOpen   },
      { label: "Cartões",       key: "cartoes", icon: Wallet     },
    ],
  },
]

const SIDEBAR_EXPANDED  = 220
const SIDEBAR_COLLAPSED = 56

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function Sidebar({ pagina, setPagina, signOut, email, recolhida, setRecolhida }: {
  pagina: Pagina; setPagina: (p: Pagina) => void; signOut: () => void
  email: string; recolhida: boolean; setRecolhida: (v: boolean) => void
}) {
  const { tokens, theme, toggle } = useTheme()
  return (
    <div style={{
      position: "fixed", top: 0, left: 0, height: "100vh",
      width: recolhida ? SIDEBAR_COLLAPSED : SIDEBAR_EXPANDED,
      background: tokens.sidebarBg, borderRight: `1px solid ${tokens.sidebarBorder}`,
      display: "flex", flexDirection: "column",
      transition: "width 0.22s cubic-bezier(.4,0,.2,1)",
      zIndex: 1000, overflow: "hidden",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: recolhida ? "center" : "space-between", padding: recolhida ? "14px 0" : "14px 14px", borderBottom: `1px solid ${tokens.sidebarBorder}`, flexShrink: 0 }}>
        {!recolhida && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }} onClick={() => setPagina("home")}>
            <div style={{ width: 28, height: 28, background: tokens.sidebarAccent, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Layers size={14} color="white" />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "white", whiteSpace: "nowrap" }}>Finance Hub</div>
              <div style={{ fontSize: 10, color: tokens.sidebarSubtext, whiteSpace: "nowrap" }}>Controle Financeiro</div>
            </div>
          </div>
        )}
        {recolhida && (
          <div style={{ width: 28, height: 28, background: tokens.sidebarAccent, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }} onClick={() => setPagina("home")}>
            <Layers size={14} color="white" />
          </div>
        )}
        <button onClick={() => setRecolhida(!recolhida)} style={{ background: "none", border: "none", color: tokens.sidebarSubtext, cursor: "pointer", padding: 4, display: "flex", alignItems: "center", flexShrink: 0, marginLeft: recolhida ? 0 : 4 }}>
          {recolhida ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
        </button>
      </div>

      <div style={{ padding: recolhida ? "8px 0" : "8px 8px", borderBottom: `1px solid ${tokens.sidebarBorder}`, flexShrink: 0 }}>
        <SidebarItem icon={HomeIcon} label="Início" ativa={pagina === "home"} recolhida={recolhida} onClick={() => setPagina("home")} />
      </div>

      <SidebarGrupos pagina={pagina} setPagina={setPagina} recolhida={recolhida} />

      <div style={{ borderTop: `1px solid ${tokens.sidebarBorder}`, padding: recolhida ? "10px 0" : "10px 8px", flexShrink: 0 }}>
        {!recolhida && (
          <div style={{ fontSize: 11, color: tokens.sidebarSubtext, padding: "4px 8px 6px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {email}
          </div>
        )}
        <SidebarItem icon={theme === "dark" ? Sun : Moon} label={theme === "dark" ? "Modo Claro" : "Modo Escuro"} ativa={false} recolhida={recolhida} onClick={toggle} />
        <SidebarItem icon={LogOut} label="Sair" ativa={false} recolhida={recolhida} onClick={signOut} accent="#ef4444" />
      </div>
    </div>
  )
}

function SidebarGrupos({ pagina, setPagina, recolhida }: {
  pagina: Pagina; setPagina: (p: Pagina) => void; recolhida: boolean
}) {
  const { tokens } = useTheme()
  const [abertos, setAbertos] = useState<Record<string, boolean>>({
    "Configuração": false, "Lançamentos": true, "Análises": true, "Bancos": false
  })
  const toggle = (label: string) => setAbertos(prev => ({ ...prev, [label]: !prev[label] }))
  const grupoDoItem = grupos.find(g => g.items.some(i => i.key === pagina))?.label

  return (
    <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: recolhida ? "8px 0" : "8px 8px" }}>
      {grupos.map(grupo => {
        const aberto = abertos[grupo.label] || grupo.label === grupoDoItem
        return (
          <div key={grupo.label} style={{ marginBottom: 2 }}>
            {!recolhida && (
              <div onClick={() => toggle(grupo.label)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 8px", borderRadius: 7, cursor: "pointer", color: tokens.sidebarGroupLabel, background: "transparent", transition: "background 0.15s", userSelect: "none" }}>
                <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", whiteSpace: "nowrap" }}>{grupo.label}</span>
                <ChevronDown size={12} style={{ transition: "transform 0.2s", transform: aberto ? "rotate(0deg)" : "rotate(-90deg)", flexShrink: 0 }} />
              </div>
            )}
            {recolhida && <div style={{ height: 8 }} />}
            {(aberto || recolhida) && grupo.items.map(item => (
              <SidebarItem key={item.key} icon={item.icon} label={item.label} ativa={pagina === item.key} recolhida={recolhida} onClick={() => setPagina(item.key)} accent={item.accent} />
            ))}
          </div>
        )
      })}
    </div>
  )
}

function SidebarItem({ icon: Icon, label, ativa, recolhida, onClick, accent }: {
  icon: React.ElementType; label: string; ativa: boolean
  recolhida: boolean; onClick: () => void; accent?: string
}) {
  const [hovered, setHovered] = useState(false)
  const { tokens } = useTheme()
  const cor = accent || tokens.sidebarAccent
  return (
    <div onClick={onClick} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      title={recolhida ? label : undefined}
      style={{ display: "flex", alignItems: "center", gap: recolhida ? 0 : 9, justifyContent: recolhida ? "center" : "flex-start", padding: recolhida ? "9px 0" : "8px 8px", borderRadius: 7, background: ativa ? `${cor}18` : hovered && !ativa ? tokens.sidebarItemHover : "transparent", cursor: "pointer", transition: "background 0.15s", marginBottom: 2, position: "relative" }}>
      {ativa && <div style={{ position: "absolute", left: 0, top: "20%", height: "60%", width: 3, background: cor, borderRadius: "0 3px 3px 0" }} />}
      <Icon size={15} color={ativa ? cor : accent ? accent : tokens.sidebarText} style={{ flexShrink: 0 }} />
      {!recolhida && (
        <span style={{ fontSize: 13, fontWeight: ativa ? 600 : 400, color: ativa ? cor : accent ? accent : tokens.sidebarText, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {label}
        </span>
      )}
    </div>
  )
}

// ─── AppContent ───────────────────────────────────────────────────────────────

function AppContent({ signOut, email }: { signOut: () => void; email: string }) {
  const [pagina, setPagina] = useState<Pagina>("calendario")
  const [recolhida, setRecolhida] = useState(false)
  const { tokens } = useTheme()

  const renderConteudo = () => {
    switch (pagina) {
      case "home":          return <HomePanel />
      case "alertas":       return <Alertas />
      case "lancamento":    return <Lancamento />
      case "confirmar":     return <ConfirmarDebito />
      case "resumo":        return <Resumo />
      case "movimentacoes": return <Movimentacoes />
      case "semanal":       return <ControleSemanal />
      case "fatura":        return <FaturaCartao />
      case "extrato":       return <ExtratoConta />
      case "cartoes":       return <Cartoes />
      case "dre":           return <DRE />
      case "cadastros":     return <Cadastros />
      case "upload":        return <UploadPlanilha />
      case "notificacoes":  return <NotificacoesConfig />
      case "consultor":     return <ConsultorIA />
      case "conferencia":   return <ConferenciaWhatsApp />
      case "endividamento": return <Endividamento />
      case "calendario":    return <Calendario />
      case "consumo":       return <ConsumoMensal />
      default:              return null
    }
  }

  return (
    <div style={{ display: "flex" }}>
      <Sidebar pagina={pagina} setPagina={setPagina} signOut={signOut} email={email} recolhida={recolhida} setRecolhida={setRecolhida} />
      <div style={{ marginLeft: recolhida ? SIDEBAR_COLLAPSED : SIDEBAR_EXPANDED, flex: 1, transition: "margin-left 0.22s cubic-bezier(.4,0,.2,1)", minHeight: "100vh", background: tokens.contentBg }}>
        {renderConteudo()}
      </div>
    </div>
  )
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const { user, loading, signOut } = useAuth()
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem("theme") as Theme) || "dark"
  )

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme)
    localStorage.setItem("theme", theme)
  }, [theme])

  const toggle = () => setTheme(t => t === "dark" ? "light" : "dark")
  const tokens = theme === "dark" ? DARK : LIGHT

  if (loading) return (
    <div style={{ color: "white", backgroundColor: "#0b1120", width: "100vw", height: "100vh", display: "flex", justifyContent: "center", alignItems: "center", fontSize: 18 }}>
      Carregando...
    </div>
  )

  const isRecovery = typeof window !== "undefined" && window.location.hash.includes("type=recovery")
  if (!user || isRecovery) return <Login />

  return (
    <ThemeCtx.Provider value={{ theme, tokens, toggle }}>
      <AppContent signOut={signOut} email={user.email ?? ""} />
    </ThemeCtx.Provider>
  )
}
