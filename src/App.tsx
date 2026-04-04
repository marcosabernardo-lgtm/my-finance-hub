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

import {
  BarChart3, List, Calendar, CreditCard, Wallet,
  FileText, Database, PlusCircle, CheckCircle, Layers,
  BookOpen, Upload, Bell, ChevronLeft, ChevronRight,
  LogOut, Home as HomeIcon, ChevronDown, Sparkles, MessageSquare,
} from "lucide-react";

// ─── Theme Context ────────────────────────────────────────────────────────────

type Theme = "dark"

interface ThemeTokens {
  // Sidebar
  sidebarBg: string
  sidebarBorder: string
  sidebarGroupLabel: string
  sidebarItemHover: string
  sidebarText: string
  sidebarSubtext: string
  // Conteúdo
  contentBg: string
  // Home
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
  contentBg: "#f8fafc",
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
  | "cadastros" | "lancamento" | "confirmar" | "extrato" | "upload" | "alertas" | "notificacoes" | "consultor" | "conferencia"

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
      { label: "Lançar",            key: "lancamento",  icon: PlusCircle  },
      { label: "Confirmar Débitos", key: "confirmar",   icon: CheckCircle },
      { label: "Movimentações",     key: "movimentacoes", icon: List      },
      { label: "Conf. WhatsApp",    key: "conferencia", icon: MessageSquare, accent: "#22c55e" },
    ],
  },
  {
    label: "Análises",
    items: [
      { label: "Consultor IA", key: "consultor", icon: Sparkles, accent: "#667eea" },
      { label: "Alertas",      key: "alertas",   icon: Bell,     accent: "#ef4444" },
      { label: "Resumo",       key: "resumo",    icon: BarChart3                   },
      { label: "Semanal",      key: "semanal",   icon: Calendar                    },
      { label: "DRE",          key: "dre",       icon: FileText                    },
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

const cardConfig: {
  key: Pagina; label: string; desc: string; icon: React.ElementType
  accent: string; iconBg: string; iconColor: string
  group: "configuracao" | "lancamentos" | "analises" | "bancos"
}[] = [
  { key: "cadastros",     label: "Cadastros",         group: "configuracao", desc: "Categorias, cartões e contas",                  icon: Database,        accent: "#64748b", iconBg: "#1e293b", iconColor: "#94a3b8" },
  { key: "upload",        label: "Importar Planilha", group: "configuracao", desc: "Importe dados históricos via Excel (.xlsx)",     icon: Upload,          accent: "#0891b2", iconBg: "#083344", iconColor: "#22d3ee" },
  { key: "notificacoes",  label: "Notificações",      group: "configuracao", desc: "Configure alertas diários via WhatsApp",         icon: Bell,            accent: "#7c3aed", iconBg: "#2e1065", iconColor: "#a78bfa" },
  { key: "lancamento",    label: "Lançar",            group: "lancamentos",  desc: "Registre despesas, receitas e transferências",   icon: PlusCircle,      accent: "#0d7280", iconBg: "#1e3a6e", iconColor: "#60a5fa" },
  { key: "confirmar",     label: "Confirmar Débitos", group: "lancamentos",  desc: "Confirme lançamentos previstos em aberto",       icon: CheckCircle,     accent: "#22c55e", iconBg: "#14532d", iconColor: "#4ade80" },
  { key: "movimentacoes", label: "Movimentações",     group: "lancamentos",  desc: "Histórico completo com filtros avançados",       icon: List,            accent: "#14b8a6", iconBg: "#042f2e", iconColor: "#2dd4bf" },
  { key: "consultor",     label: "Consultor IA",      group: "analises",     desc: "Análise personalizada com IA baseada nos seus dados",    icon: Sparkles,        accent: "#667eea", iconBg: "#1e1b4b", iconColor: "#a5b4fc" },
  { key: "alertas",       label: "Alertas",           group: "analises",     desc: "Vencidos, limites estourados e riscos do mês",   icon: Bell,            accent: "#ef4444", iconBg: "#450a0a", iconColor: "#fca5a5" },
  { key: "resumo",        label: "Resumo",            group: "analises",     desc: "Visão geral de receitas, despesas e saldo",      icon: BarChart3,       accent: "#8b5cf6", iconBg: "#2e1065", iconColor: "#a78bfa" },
  { key: "semanal",       label: "Controle Semanal",  group: "analises",     desc: "Despesas por semana e categoria",                icon: Calendar,        accent: "#06b6d4", iconBg: "#083344", iconColor: "#22d3ee" },
  { key: "dre",           label: "DRE",               group: "analises",     desc: "Demonstrativo anual com projeções",              icon: FileText,        accent: "#ec4899", iconBg: "#500724", iconColor: "#f472b6" },
  { key: "fatura",        label: "Fatura Cartão",     group: "bancos",       desc: "Gerencie e pague faturas dos cartões",           icon: CreditCard,      accent: "#f59e0b", iconBg: "#451a03", iconColor: "#fbbf24" },
  { key: "extrato",       label: "Extrato Conta",     group: "bancos",       desc: "Entradas, saídas e saldo por conta bancária",    icon: BookOpen,        accent: "#0891b2", iconBg: "#083344", iconColor: "#22d3ee" },
  { key: "cartoes",       label: "Cartões",           group: "bancos",       desc: "Visão anual e comprometimento de limite",        icon: Wallet,          accent: "#0d7280", iconBg: "#1e3a6e", iconColor: "#60a5fa" },
]

const mes = new Date().toLocaleString("pt-BR", { month: "long", year: "numeric" })
const mesFormatado = mes.charAt(0).toUpperCase() + mes.slice(1)

const SIDEBAR_EXPANDED  = 220
const SIDEBAR_COLLAPSED = 56

// ─── Home ─────────────────────────────────────────────────────────────────────

function Home({ onNavigate, onSignOut, email }: {
  onNavigate: (p: Pagina) => void; onSignOut: () => void; email: string
}) {
  const { tokens } = useTheme()
  const configuracao = cardConfig.filter(c => c.group === "configuracao")
  const lancamentos  = cardConfig.filter(c => c.group === "lancamentos")
  const analises     = cardConfig.filter(c => c.group === "analises")
  const bancos       = cardConfig.filter(c => c.group === "bancos")

  return (
    <div style={{ background: tokens.homeBg, minHeight: "100vh", color: tokens.homeCardText }}>
      <div style={{ background: tokens.homeTopbarBg, borderBottom: `1px solid ${tokens.homeHeroBorder}`, padding: "14px 32px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, background: "#0d7280", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Layers size={17} color="white" />
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: tokens.homeCardText }}>Finance Hub</div>
            <div style={{ fontSize: 11, color: tokens.homeCardDesc }}>Controle Financeiro Pessoal</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ background: tokens.homeTagBg, border: `1px solid ${tokens.homeTagBorder}`, padding: "5px 14px", borderRadius: 20, fontSize: 12, color: tokens.homeTagText }}>{email}</div>
          <button onClick={onSignOut} style={{ background: "#7f1d1d", border: "none", color: "#fca5a5", padding: "6px 14px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>Sair</button>
        </div>
      </div>

      <div style={{ padding: "36px 32px 24px", borderBottom: `1px solid ${tokens.homeHeroBorder}` }}>
        <div style={{ fontSize: 11, color: "#0d7280", fontWeight: 600, letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: 8 }}>Painel Principal</div>
        <div style={{ fontSize: 26, fontWeight: 700, color: tokens.homeCardText }}>Bem-vindo de volta 👋</div>
        <div style={{ fontSize: 13, color: tokens.homeCardDesc, marginTop: 4 }}>Selecione um módulo para começar</div>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: tokens.homeTagBg, border: `1px solid ${tokens.homeTagBorder}`, padding: "4px 12px", borderRadius: 6, fontSize: 11, color: tokens.homeTagText, marginTop: 12 }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e" }} />
          {mesFormatado} · Sistema online
        </div>
      </div>

      <div style={{ padding: "24px 32px" }}>
        <GroupLabel>Configuração</GroupLabel>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 28 }}>
          {configuracao.map(c => <CardBtn key={c.key} card={c} onClick={() => onNavigate(c.key)} />)}
        </div>
        <GroupLabel>Lançamentos</GroupLabel>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 28 }}>
          {lancamentos.map(c => <CardBtn key={c.key} card={c} onClick={() => onNavigate(c.key)} />)}
        </div>
        <GroupLabel>Análises</GroupLabel>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 28 }}>
          {analises.map(c => <CardBtn key={c.key} card={c} onClick={() => onNavigate(c.key)} />)}
        </div>
        <GroupLabel>Bancos</GroupLabel>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          {bancos.map(c => <CardBtn key={c.key} card={c} onClick={() => onNavigate(c.key)} />)}
        </div>
      </div>
    </div>
  )
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  const { tokens } = useTheme()
  return <div style={{ fontSize: 11, fontWeight: 600, color: tokens.homeGroupLabel, letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: 14 }}>{children}</div>
}

function CardBtn({ card, onClick }: { card: typeof cardConfig[0]; onClick: () => void }) {
  const [hovered, setHovered] = useState(false)
  const { tokens } = useTheme()
  const Icon = card.icon
  return (
    <div onClick={onClick} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? tokens.sidebarItemHover : tokens.homeCardBg,
        border: `1px solid ${hovered ? card.accent : tokens.homeCardBorder}`,
        borderRadius: 12, padding: "18px 20px", cursor: "pointer",
        position: "relative", overflow: "hidden",
        transition: "border-color .2s, background .2s",
      }}>
      <div style={{ position: "absolute", top: 0, left: 0, width: 3, height: "100%", background: card.accent, borderRadius: "12px 0 0 12px" }} />
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: card.iconBg, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon size={20} color={card.iconColor} />
        </div>
        <span style={{ color: card.accent, fontSize: 18, opacity: hovered ? 1 : 0, transition: "opacity .2s" }}>→</span>
      </div>
      <div style={{ fontSize: 15, fontWeight: 600, color: tokens.homeCardText }}>{card.label}</div>
      <div style={{ fontSize: 11, color: tokens.homeCardDesc, marginTop: 6, lineHeight: 1.5 }}>{card.desc}</div>
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

      {/* Logo + toggle */}
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

      {/* Home button */}
      <div style={{ padding: recolhida ? "8px 0" : "8px 8px", borderBottom: `1px solid ${tokens.sidebarBorder}`, flexShrink: 0 }}>
        <SidebarItem icon={HomeIcon} label="Início" ativa={pagina === "home"} recolhida={recolhida} onClick={() => setPagina("home")} />
      </div>

      {/* Grupos colapsáveis */}
      <SidebarGrupos pagina={pagina} setPagina={setPagina} recolhida={recolhida} />

      {/* Rodapé: tema + email + sair */}
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

  // Se tem item ativo no grupo, abre automaticamente
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
      case "dashboard":     return <Dashboard />
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
      case "conferencia":    return <ConferenciaWhatsApp />
      default:              return null
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

  // Se veio do link de recovery, mostra o Login na tela de nova senha
  const isRecovery = typeof window !== 'undefined' &&
    (window.location.hash.includes('type=recovery'))

  if (!user || isRecovery) return <Login />

  return (
    <ThemeCtx.Provider value={{ theme, tokens: DARK, toggle: () => {} }}>
      <AppContent signOut={signOut} email={user.email ?? ""} />
    </ThemeCtx.Provider>
  )
}
