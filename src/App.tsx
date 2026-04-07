import { useState, createContext, useContext } from "react";
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
import Dashboard from "./components/Dashboard";
import Alertas from "./components/Alertas";
import NotificacoesConfig from "./components/NotificacoesConfig";
import ConsultorIA from "./components/ConsultorIA";
import ConferenciaWhatsApp from "./components/ConferenciaWhatsApp";
import Endividamento from "./components/Endividamento"; // ← NOVO

import {
  BarChart3, List, Calendar, CreditCard, Wallet,
  FileText, Database, PlusCircle, CheckCircle, Layers,
  BookOpen, Upload, Bell, ChevronLeft, ChevronRight,
  LogOut, Home as HomeIcon, ChevronDown, Sparkles, MessageSquare, LayoutDashboard,
  TrendingDown, // ← NOVO ícone para Endividamento
} from "lucide-react";

// ─── Theme Context ────────────────────────────────────────────────────────────

type Theme = "dark"

interface ThemeTokens {
  sidebarBg: string
  sidebarBorder: string
  sidebarGroupLabel: string
  sidebarItemHover: string
  sidebarText: string
  sidebarSubtext: string
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
  sidebarBg: "#0d7280",
  sidebarBorder: "#0a5f6b",
  sidebarGroupLabel: "#a8d8de",
  sidebarItemHover: "#0a5f6b",
  sidebarText: "#e2f4f6",
  sidebarSubtext: "#a8d8de",
  contentBg: "#f5f0e8",
  homeBg: "#0b1120",
  homeCardBg: "#0d1526",
  homeCardBorder: "#1e2d45",
  homeCardText: "white",
  homeCardDesc: "#475569",
  homeTopbarBg: "#0d1526",
  homeHeroBorder: "#1e2d45",
  homeTagBg: "#1e2d45",
  homeTagBorder: "#2a3f5f",
  homeTagText: "#94a3b8",
  homeGroupLabel: "#475569",
}

const ThemeCtx = createContext<{ theme: Theme; tokens: ThemeTokens; toggle: () => void }>({
  theme: "dark", tokens: DARK, toggle: () => {}
})

const useTheme = () => useContext(ThemeCtx)

// ─── Types ────────────────────────────────────────────────────────────────────

type Pagina =
  | "home" | "dashboard" | "resumo" | "movimentacoes"
  | "semanal" | "fatura" | "dre" | "cartoes"
  | "cadastros" | "lancamento" | "confirmar" | "extrato" | "upload"
  | "alertas" | "notificacoes" | "consultor" | "conferencia"
  | "endividamento" // ← NOVO

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
      { label: "Conf. WhatsApp",    key: "conferencia",   icon: MessageSquare, accent: "#22c55e" },
    ],
  },
  {
    label: "Análises",
    items: [
      { label: "Dashboard",      key: "dashboard",      icon: LayoutDashboard                    },
      { label: "Consultor IA",   key: "consultor",      icon: Sparkles,    accent: "#667eea"     },
      { label: "Alertas",        key: "alertas",        icon: Bell,        accent: "#ef4444"     },
      { label: "Resumo",         key: "resumo",         icon: BarChart3                          },
      { label: "Semanal",        key: "semanal",        icon: Calendar                           },
      { label: "DRE",            key: "dre",            icon: FileText                           },
      { label: "Endividamento",  key: "endividamento",  icon: TrendingDown, accent: "#e05252"    }, // ← NOVO
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

const mes = new Date().toLocaleString("pt-BR", { month: "long", year: "numeric" })
const mesFormatado = mes.charAt(0).toUpperCase() + mes.slice(1)

const SIDEBAR_EXPANDED  = 220
const SIDEBAR_COLLAPSED = 56

// ─── Home ─────────────────────────────────────────────────────────────────────

function Home({ onSignOut, email }: {
  onNavigate: (p: Pagina) => void; onSignOut: () => void; email: string
}) {
  const features = [
    { emoji: "💬", titulo: "Bot WhatsApp", desc: "Lance despesas direto pelo WhatsApp. O sistema interpreta sua mensagem e aguarda confirmação." },
    { emoji: "🔔", titulo: "Alertas Diários", desc: "Receba todo dia às 8h um resumo com saldos das contas e contas a vencer." },
    { emoji: "📊", titulo: "Dashboard Completo", desc: "Visualize saldos, faturas, comprometimento de cartões e comparativo com o mês anterior." },
    { emoji: "🤖", titulo: "Consultor IA", desc: "Análise financeira personalizada com plano anti-dívida e metas de sobra mensal." },
    { emoji: "💳", titulo: "Gestão de Cartões", desc: "Controle faturas, limites e vencimentos de todos os seus cartões de crédito." },
    { emoji: "📈", titulo: "DRE e Resumo", desc: "Demonstrativo anual de receitas e despesas com projeções e controle semanal." },
  ]

  return (
    <div style={{ background: "#0d7280", minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 40px", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 34, height: 34, background: "rgba(255,255,255,0.15)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Layers size={18} color="white" />
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "white" }}>Finance Hub</div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.6)" }}>Controle Financeiro Pessoal</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", background: "rgba(255,255,255,0.1)", padding: "5px 14px", borderRadius: 20 }}>{email}</div>
          <button onClick={onSignOut} style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", color: "white", padding: "6px 16px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>Sair</button>
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 40px 40px", textAlign: "center" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", padding: "6px 16px", borderRadius: 20, fontSize: 12, color: "rgba(255,255,255,0.8)", marginBottom: 28, letterSpacing: "0.5px" }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e" }} />
          {mesFormatado} · Sistema online
        </div>

        <h1 style={{ margin: "0 0 16px", fontSize: 42, fontWeight: 800, color: "white", lineHeight: 1.15, letterSpacing: "-0.5px", maxWidth: 640 }}>
          Controle Financeiro<br />
          <span style={{ color: "#a7e8ed" }}>Inteligente</span>
        </h1>

        <p style={{ margin: "0 0 12px", fontSize: 16, color: "rgba(255,255,255,0.75)", maxWidth: 520, lineHeight: 1.7 }}>
          Gerencie suas finanças pessoais com inteligência artificial, alertas automáticos via WhatsApp e uma visão completa do seu patrimônio.
        </p>

        <p style={{ margin: "0 0 40px", fontSize: 13, color: "rgba(255,255,255,0.5)" }}>
          Use o menu lateral para navegar entre os módulos →
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, maxWidth: 860, width: "100%" }}>
          {features.map((f, i) => (
            <div key={i} style={{
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 14,
              padding: "22px 20px",
              textAlign: "left",
              backdropFilter: "blur(4px)",
            }}>
              <div style={{ fontSize: 28, marginBottom: 10 }}>{f.emoji}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "white", marginBottom: 6 }}>{f.titulo}</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", lineHeight: 1.6 }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ textAlign: "center", padding: "20px", borderTop: "1px solid rgba(255,255,255,0.08)", fontSize: 11, color: "rgba(255,255,255,0.3)" }}>
        my-finance-hub © {new Date().getFullYear()} · Desenvolvido com 💙
      </div>
    </div>
  )
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function Sidebar({ pagina, setPagina, signOut, email, recolhida, setRecolhida }: {
  pagina: Pagina; setPagina: (p: Pagina) => void; signOut: () => void
  email: string; recolhida: boolean; setRecolhida: (v: boolean) => void
}) {
  const { tokens } = useTheme()

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
            <div style={{ width: 28, height: 28, background: "#0d7280", borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Layers size={14} color="white" />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "white", whiteSpace: "nowrap" }}>Finance Hub</div>
              <div style={{ fontSize: 10, color: tokens.sidebarSubtext, whiteSpace: "nowrap" }}>Controle Financeiro</div>
            </div>
          </div>
        )}
        {recolhida && (
          <div style={{ width: 28, height: 28, background: "#0d7280", borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }} onClick={() => setPagina("home")}>
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

  const toggle = (label: string) => {
    setAbertos(prev => ({ ...prev, [label]: !prev[label] }))
  }

  const grupoDoItem = grupos.find(g => g.items.some(i => i.key === pagina))?.label

  return (
    <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: recolhida ? "8px 0" : "8px 8px" }}>
      {grupos.map(grupo => {
        const aberto = abertos[grupo.label] || grupo.label === grupoDoItem
        return (
          <div key={grupo.label} style={{ marginBottom: 2 }}>
            {!recolhida && (
              <div
                onClick={() => toggle(grupo.label)}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "7px 8px", borderRadius: 7, cursor: "pointer",
                  color: tokens.sidebarGroupLabel,
                  background: "transparent",
                  transition: "background 0.15s",
                  userSelect: "none",
                }}
              >
                <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", whiteSpace: "nowrap" }}>
                  {grupo.label}
                </span>
                <ChevronDown
                  size={12}
                  style={{ transition: "transform 0.2s", transform: aberto ? "rotate(0deg)" : "rotate(-90deg)", flexShrink: 0 }}
                />
              </div>
            )}
            {recolhida && <div style={{ height: 8 }} />}
            {(aberto || recolhida) && grupo.items.map(item => (
              <SidebarItem
                key={item.key}
                icon={item.icon}
                label={item.label}
                ativa={pagina === item.key}
                recolhida={recolhida}
                onClick={() => setPagina(item.key)}
                accent={item.accent}
              />
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
  const cor = accent || "#67c4cf"

  return (
    <div onClick={onClick} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      title={recolhida ? label : undefined}
      style={{
        display: "flex", alignItems: "center",
        gap: recolhida ? 0 : 9,
        justifyContent: recolhida ? "center" : "flex-start",
        padding: recolhida ? "9px 0" : "8px 8px",
        borderRadius: 7,
        background: ativa ? `${cor}18` : hovered && !ativa ? tokens.sidebarItemHover : "transparent",
        cursor: "pointer", transition: "background 0.15s", marginBottom: 2, position: "relative",
      }}>
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
  const [pagina, setPagina] = useState<Pagina>("home")
  const [recolhida, setRecolhida] = useState(false)
  const { tokens } = useTheme()

  const renderConteudo = () => {
    switch (pagina) {
      case "dashboard":      return <Dashboard />
      case "alertas":        return <Alertas />
      case "lancamento":     return <Lancamento />
      case "confirmar":      return <ConfirmarDebito />
      case "resumo":         return <Resumo />
      case "movimentacoes":  return <Movimentacoes />
      case "semanal":        return <ControleSemanal />
      case "fatura":         return <FaturaCartao />
      case "extrato":        return <ExtratoConta />
      case "cartoes":        return <Cartoes />
      case "dre":            return <DRE />
      case "cadastros":      return <Cadastros />
      case "upload":         return <UploadPlanilha />
      case "notificacoes":   return <NotificacoesConfig />
      case "consultor":      return <ConsultorIA />
      case "conferencia":    return <ConferenciaWhatsApp />
      case "endividamento":  return <Endividamento /> // ← NOVO
      default:               return null
    }
  }

  const conteudo = pagina === "home"
    ? <Home onNavigate={setPagina} onSignOut={signOut} email={email} />
    : <div style={{ background: tokens.contentBg, minHeight: "100vh" }}>{renderConteudo()}</div>

  return (
    <div style={{ display: "flex" }}>
      <Sidebar pagina={pagina} setPagina={setPagina} signOut={signOut} email={email} recolhida={recolhida} setRecolhida={setRecolhida} />
      <div style={{ marginLeft: recolhida ? SIDEBAR_COLLAPSED : SIDEBAR_EXPANDED, flex: 1, transition: "margin-left 0.22s cubic-bezier(.4,0,.2,1)", minHeight: "100vh" }}>
        {conteudo}
      </div>
    </div>
  )
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const { user, loading, signOut } = useAuth()
  const [theme] = useState<Theme>("dark")

  if (loading) return (
    <div style={{ color: "white", backgroundColor: "#0b1120", width: "100vw", height: "100vh", display: "flex", justifyContent: "center", alignItems: "center", fontSize: 18 }}>
      Carregando...
    </div>
  )

  const isRecovery = typeof window !== 'undefined' &&
    (window.location.hash.includes('type=recovery'))

  if (!user || isRecovery) return <Login />

  return (
    <ThemeCtx.Provider value={{ theme, tokens: DARK, toggle: () => {} }}>
      <AppContent signOut={signOut} email={user.email ?? ""} />
    </ThemeCtx.Provider>
  )
}
