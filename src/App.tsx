import { useState } from "react";
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

import {
  BarChart3, List, Calendar, CreditCard, Wallet,
  FileText, Database, PlusCircle, CheckCircle, Layers
} from "lucide-react";

type Pagina =
  | "home" | "resumo" | "movimentacoes"
  | "semanal" | "fatura" | "dre" | "cartoes"
  | "cadastros" | "lancamento" | "confirmar"

const abas: { label: string; key: Pagina; icon: React.ElementType }[] = [
  { label: "Cadastros",         key: "cadastros",     icon: Database    },
  { label: "Lançar",            key: "lancamento",    icon: PlusCircle  },
  { label: "Confirmar Débitos", key: "confirmar",     icon: CheckCircle },
  { label: "Resumo",            key: "resumo",        icon: BarChart3   },
  { label: "Movimentações",     key: "movimentacoes", icon: List        },
  { label: "Semanal",           key: "semanal",       icon: Calendar    },
  { label: "Fatura Cartão",     key: "fatura",        icon: CreditCard  },
  { label: "Cartões",           key: "cartoes",       icon: Wallet      },
  { label: "DRE",               key: "dre",           icon: FileText    },
]

const cardConfig: {
  key: Pagina
  label: string
  desc: string
  icon: React.ElementType
  accent: string
  iconBg: string
  iconColor: string
  group: "configuracao" | "lancamentos" | "analises"
}[] = [
  {
    key: "cadastros", label: "Cadastros", group: "configuracao",
    desc: "Categorias, cartões e contas",
    icon: Database, accent: "#64748b", iconBg: "#1e293b", iconColor: "#94a3b8",
  },
  {
    key: "lancamento", label: "Lançar", group: "lancamentos",
    desc: "Registre despesas, receitas e transferências",
    icon: PlusCircle, accent: "#2563eb", iconBg: "#1e3a6e", iconColor: "#60a5fa",
  },
  {
    key: "confirmar", label: "Confirmar Débitos", group: "lancamentos",
    desc: "Confirme lançamentos previstos em aberto",
    icon: CheckCircle, accent: "#22c55e", iconBg: "#14532d", iconColor: "#4ade80",
  },
  {
    key: "fatura", label: "Fatura Cartão", group: "lancamentos",
    desc: "Gerencie e pague faturas dos cartões",
    icon: CreditCard, accent: "#f59e0b", iconBg: "#451a03", iconColor: "#fbbf24",
  },
  {
    key: "resumo", label: "Resumo", group: "analises",
    desc: "Visão geral de receitas, despesas e saldo",
    icon: BarChart3, accent: "#8b5cf6", iconBg: "#2e1065", iconColor: "#a78bfa",
  },
  {
    key: "semanal", label: "Controle Semanal", group: "analises",
    desc: "Despesas por semana e categoria",
    icon: Calendar, accent: "#06b6d4", iconBg: "#083344", iconColor: "#22d3ee",
  },
  {
    key: "dre", label: "DRE", group: "analises",
    desc: "Demonstrativo anual com projeções",
    icon: FileText, accent: "#ec4899", iconBg: "#500724", iconColor: "#f472b6",
  },
  {
    key: "cartoes", label: "Cartões", group: "analises",
    desc: "Visão anual e comprometimento de limite",
    icon: Wallet, accent: "#2563eb", iconBg: "#1e3a6e", iconColor: "#60a5fa",
  },
  {
    key: "movimentacoes", label: "Movimentações", group: "analises",
    desc: "Histórico completo com filtros avançados",
    icon: List, accent: "#14b8a6", iconBg: "#042f2e", iconColor: "#2dd4bf",
  },

]

const mes = new Date().toLocaleString("pt-BR", { month: "long", year: "numeric" })
const mesFormatado = mes.charAt(0).toUpperCase() + mes.slice(1)

function Home({ onNavigate, onSignOut, email }: {
  onNavigate: (p: Pagina) => void
  onSignOut: () => void
  email: string
}) {
  const configuracao = cardConfig.filter(c => c.group === "configuracao")
  const lancamentos  = cardConfig.filter(c => c.group === "lancamentos")
  const analises     = cardConfig.filter(c => c.group === "analises")

  return (
    <div style={{ background: "#0b1120", minHeight: "100vh", color: "white" }}>

      {/* Topbar */}
      <div style={{
        background: "#0d1526", borderBottom: "1px solid #1e2d45",
        padding: "14px 32px", display: "flex", alignItems: "center", justifyContent: "space-between"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 32, height: 32, background: "#2563eb", borderRadius: 8,
            display: "flex", alignItems: "center", justifyContent: "center"
          }}>
            <Layers size={17} color="white" />
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "white" }}>Finance Hub</div>
            <div style={{ fontSize: 11, color: "#64748b" }}>Controle Financeiro Pessoal</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            background: "#1e2d45", border: "1px solid #2a3f5f",
            padding: "5px 14px", borderRadius: 20, fontSize: 12, color: "#94a3b8"
          }}>
            {email}
          </div>
          <button onClick={onSignOut} style={{
            background: "#7f1d1d", border: "none", color: "#fca5a5",
            padding: "6px 14px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 600
          }}>
            Sair
          </button>
        </div>
      </div>

      {/* Hero */}
      <div style={{ padding: "36px 32px 24px", borderBottom: "1px solid #1e2d45" }}>
        <div style={{ fontSize: 11, color: "#2563eb", fontWeight: 600, letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: 8 }}>
          Painel Principal
        </div>
        <div style={{ fontSize: 26, fontWeight: 700, color: "white" }}>
          Bem-vindo de volta 👋
        </div>
        <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>
          Selecione um módulo para começar
        </div>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          background: "#1e2d45", border: "1px solid #2a3f5f",
          padding: "4px 12px", borderRadius: 6, fontSize: 11, color: "#94a3b8", marginTop: 12
        }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e" }} />
          {mesFormatado} · Sistema online
        </div>
      </div>

      {/* Cards */}
      <div style={{ padding: "24px 32px" }}>

        {/* Configuração */}
        <div style={{ fontSize: 11, fontWeight: 600, color: "#475569", letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: 14 }}>
          Configuração
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 28 }}>
          {configuracao.map(c => (
            <CardBtn key={c.key} card={c} onClick={() => onNavigate(c.key)} />
          ))}
        </div>

        {/* Lançamentos */}
        <div style={{ fontSize: 11, fontWeight: 600, color: "#475569", letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: 14 }}>
          Lançamentos
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 28 }}>
          {lancamentos.map(c => (
            <CardBtn key={c.key} card={c} onClick={() => onNavigate(c.key)} />
          ))}
        </div>

        {/* Análises */}
        <div style={{ fontSize: 11, fontWeight: 600, color: "#475569", letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: 14 }}>
          Análises
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          {analises.map(c => (
            <CardBtn key={c.key} card={c} onClick={() => onNavigate(c.key)} />
          ))}
        </div>

      </div>
    </div>
  )
}

function CardBtn({ card, onClick }: { card: typeof cardConfig[0]; onClick: () => void }) {
  const [hovered, setHovered] = useState(false)
  const Icon = card.icon

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? "#111d35" : "#0d1526",
        border: `1px solid ${hovered ? card.accent : "#1e2d45"}`,
        borderRadius: 12, padding: "18px 20px", cursor: "pointer",
        position: "relative", overflow: "hidden",
        transition: "border-color .2s, background .2s",
      }}
    >
      {/* Accent bar */}
      <div style={{
        position: "absolute", top: 0, left: 0,
        width: 3, height: "100%", background: card.accent,
        borderRadius: "12px 0 0 12px"
      }} />

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 10,
          background: card.iconBg,
          display: "flex", alignItems: "center", justifyContent: "center"
        }}>
          <Icon size={20} color={card.iconColor} />
        </div>
        <span style={{ color: card.accent, fontSize: 18, opacity: hovered ? 1 : 0, transition: "opacity .2s" }}>→</span>
      </div>

      <div style={{ fontSize: 15, fontWeight: 600, color: "white" }}>{card.label}</div>
      <div style={{ fontSize: 11, color: "#475569", marginTop: 6, lineHeight: 1.5 }}>{card.desc}</div>
    </div>
  )
}

function AppContent({ signOut, email }: { signOut: () => void; email: string }) {
  const [pagina, setPagina] = useState<Pagina>("home")

  const renderConteudo = () => {
    switch (pagina) {
      case "lancamento":    return <Lancamento />
      case "confirmar":     return <ConfirmarDebito />
      case "resumo":        return <Resumo />
      case "movimentacoes": return <Movimentacoes />
      case "semanal":       return <ControleSemanal />
      case "fatura":        return <FaturaCartao />
      case "cartoes":       return <Cartoes />
      case "dre":           return <DRE />
      case "cadastros":     return <Cadastros />
      default:              return null
    }
  }

  if (pagina === "home") {
    return <Home onNavigate={setPagina} onSignOut={signOut} email={email} />
  }

  return (
    <>
      {/* Navbar */}
      <div style={{
        position: "fixed", top: 0, left: 0, width: "100%",
        backgroundColor: "#ffffff", padding: "10px 20px",
        zIndex: 1000, borderBottom: "1px solid #e5e7eb",
        display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center",
        boxSizing: "border-box",
      }}>
        <button onClick={() => setPagina("home")} style={{
          backgroundColor: "#0d1526", border: "none",
          color: "#ffffff", padding: "6px 12px", borderRadius: 6,
          cursor: "pointer", fontSize: 12, marginRight: 6,
          display: "flex", alignItems: "center", gap: 6, fontWeight: 600,
        }}>
          <Layers size={14} /> Finance Hub
        </button>

        {abas.map((aba) => {
          const Icon = aba.icon
          const ativa = aba.key === pagina
          return (
            <button key={aba.key} onClick={() => setPagina(aba.key)} style={{
              backgroundColor: ativa ? "#eff6ff" : "transparent",
              border: ativa ? "1px solid #2563eb" : "1px solid #e5e7eb",
              color: ativa ? "#1d4ed8" : "#374151",
              padding: "6px 12px", borderRadius: 6,
              fontWeight: ativa ? 600 : 400,
              display: "flex", alignItems: "center", gap: 5,
              cursor: "pointer", fontSize: 12,
              transition: "all 0.15s",
            }}>
              <Icon size={13} />
              {aba.label}
            </button>
          )
        })}

        <button onClick={signOut} style={{
          marginLeft: "auto", backgroundColor: "#fee2e2",
          border: "none", color: "#991b1b", padding: "6px 14px",
          borderRadius: 6, cursor: "pointer", fontWeight: 600, fontSize: 12,
        }}>
          Sair
        </button>
      </div>

      <div style={{ paddingTop: 68, background: "#0b1120", minHeight: "100vh" }}>
        <div style={{ background: "#fff", minHeight: "calc(100vh - 68px)" }}>
          {renderConteudo()}
        </div>
      </div>
    </>
  )
}

export default function App() {
  const { user, loading, signOut } = useAuth()

  if (loading) return (
    <div style={{
      color: "white", backgroundColor: "#0b1120",
      width: "100vw", height: "100vh",
      display: "flex", justifyContent: "center", alignItems: "center", fontSize: 18
    }}>
      Carregando...
    </div>
  )

  if (!user) return <Login />

  return <AppContent signOut={signOut} email={user.email ?? ""} />
}
