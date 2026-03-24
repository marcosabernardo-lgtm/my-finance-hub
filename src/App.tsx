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

import homeImage from "./assets/Home.jpg";

import {
  BarChart3, List, Calendar, CreditCard, Wallet,
  FileText, Database, PlusCircle, CheckCircle
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type Pagina =
  | "home" | "resumo" | "movimentacoes"
  | "semanal" | "fatura" | "dre" | "cartoes"
  | "cadastros" | "lancamento" | "confirmar"

// ─── Abas ─────────────────────────────────────────────────────────────────────

const abas: { label: string; key: Pagina; icon: React.ElementType }[] = [
  { label: "Lançar",           key: "lancamento",   icon: PlusCircle  },
  { label: "Confirmar Débitos",key: "confirmar",    icon: CheckCircle },
  { label: "Resumo",           key: "resumo",       icon: BarChart3   },
  { label: "Movimentações",    key: "movimentacoes",icon: List        },
  { label: "Semanal",          key: "semanal",      icon: Calendar    },
  { label: "Fatura Cartão",    key: "fatura",       icon: CreditCard  },
  { label: "Cartões",          key: "cartoes",      icon: Wallet      },
  { label: "DRE",              key: "dre",          icon: FileText    },
  { label: "Cadastros",        key: "cadastros",    icon: Database    },
]

// ─── AppContent ───────────────────────────────────────────────────────────────

function AppContent({ signOut }: { signOut: () => void }) {
  const [pagina, setPagina] = useState<Pagina>("home")

  const renderConteudo = () => {
    switch (pagina) {
      case "lancamento":   return <Lancamento />
      case "confirmar":    return <ConfirmarDebito />
      case "resumo":       return <Resumo />
      case "movimentacoes":return <Movimentacoes />
      case "semanal":      return <ControleSemanal />
      case "fatura":       return <FaturaCartao />
      case "cartoes":      return <Cartoes />
      case "dre":          return <DRE />
      case "cadastros":    return <Cadastros />
      default:             return null
    }
  }

  if (pagina === "home") {
    return (
      <div style={{
        width: "100vw", height: "100vh",
        backgroundImage: `url(${homeImage})`,
        backgroundSize: "cover", backgroundPosition: "center",
        display: "flex", flexDirection: "column",
        justifyContent: "center", alignItems: "center",
        position: "relative",
      }}>
        <button
          onClick={signOut}
          style={{
            position: "absolute", top: 20, right: 20,
            backgroundColor: "#ef4444", border: "none", color: "white",
            padding: "8px 14px", borderRadius: 6, cursor: "pointer", fontWeight: "bold"
          }}
        >
          Sair
        </button>

        <h1 style={{ fontSize: 48, color: "white", textAlign: "center", textShadow: "0 2px 8px rgba(0,0,0,0.5)" }}>
          CONTROLE FINANCEIRO PESSOAL
        </h1>

        <div style={{ display: "flex", gap: 12, marginTop: 32, flexWrap: "wrap", justifyContent: "center" }}>
          {abas.map((aba) => {
            const Icon = aba.icon
            return (
              <button
                key={aba.key}
                onClick={() => setPagina(aba.key)}
                style={{
                  padding: "10px 18px", backgroundColor: "#111827",
                  border: "1px solid #374151", color: "white",
                  borderRadius: 8, cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 8,
                  fontSize: 14, fontWeight: 500,
                }}
              >
                <Icon size={18} />
                {aba.label}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <>
      <div style={{
        position: "fixed", top: 0, left: 0, width: "100%",
        backgroundColor: "#0f172a", padding: "12px 20px",
        zIndex: 1000, borderBottom: "1px solid #1f2937",
        display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center",
        boxSizing: "border-box",
      }}>
        <button
          onClick={() => setPagina("home")}
          style={{
            backgroundColor: "transparent", border: "1px solid #374151",
            color: "#9ca3af", padding: "7px 12px", borderRadius: 6,
            cursor: "pointer", fontSize: 13, marginRight: 8,
          }}
        >
          ← Início
        </button>

        {abas.map((aba) => {
          const Icon = aba.icon
          const ativa = aba.key === pagina
          return (
            <button
              key={aba.key}
              onClick={() => setPagina(aba.key)}
              style={{
                backgroundColor: ativa ? "#1e3a5f" : "#111827",
                border: ativa ? "2px solid #3b82f6" : "1px solid #374151",
                color: ativa ? "#60a5fa" : "#d1d5db",
                padding: "7px 13px", borderRadius: 6,
                fontWeight: ativa ? 700 : 400,
                display: "flex", alignItems: "center", gap: 6,
                cursor: "pointer", fontSize: 13,
                transition: "all 0.15s",
              }}
            >
              <Icon size={15} />
              {aba.label}
            </button>
          )
        })}

        <button
          onClick={signOut}
          style={{
            marginLeft: "auto", backgroundColor: "#ef4444",
            border: "none", color: "white", padding: "7px 14px",
            borderRadius: 6, cursor: "pointer", fontWeight: "bold", fontSize: 13,
          }}
        >
          Sair
        </button>
      </div>

      <div style={{ paddingTop: 72 }}>
        {renderConteudo()}
      </div>
    </>
  )
}

export default function App() {
  const { user, loading, signOut } = useAuth()

  if (loading) return (
    <div style={{
      color: "white", backgroundColor: "#0f172a",
      width: "100vw", height: "100vh",
      display: "flex", justifyContent: "center", alignItems: "center", fontSize: 18
    }}>
      Carregando...
    </div>
  )

  if (!user) return <Login />

  return <AppContent signOut={signOut} />
}