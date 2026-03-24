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
import Pendentes from "./components/Pendentes"; // Nova tela

import homeImage from "./assets/Home.jpg";

import {
  BarChart3, List, Calendar, CreditCard, Wallet,
  FileText, Database, PlusCircle, BellRing
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type Pagina =
  | "home" | "resumo" | "movimentacoes"
  | "semanal" | "fatura" | "dre" | "cartoes"
  | "cadastros" | "lancamento" | "pendentes"

// ─── Abas ─────────────────────────────────────────────────────────────────────

const abas: { label: string; key: Pagina; icon: React.ElementType }[] = [
  { label: "Lançar",           key: "lancamento",   icon: PlusCircle  },
  { label: "Pendentes",        key: "pendentes",    icon: BellRing    }, // Substituindo o antigo confirmar
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
      case "pendentes":    return <Pendentes />
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

  // ── Home ───────────────────────────────────────────────────────────────────
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

        <h1 style={{ 
          fontSize: 48, 
          color: "white", 
          textAlign: "center", 
          textShadow: "0 2px 10px rgba(0,0,0,0.7)",
          fontWeight: 800,
          maxWidth: "800px"
        }}>
          FINANCE HUB
        </h1>

        <div style={{ display: "flex", gap: 12, marginTop: 32, flexWrap: "wrap", justifyContent: "center", maxWidth: "900px" }}>
          {abas.map((aba) => {
            const Icon = aba.icon
            return (
              <button
                key={aba.key}
                onClick={() => setPagina(aba.key)}
                style={{
                  padding: "12px 20px", backgroundColor: "#111827",
                  border: "1px solid #374151", color: "white",
                  borderRadius: 10, cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 10,
                  fontSize: 14, fontWeight: 600,
                  transition: "transform 0.1s"
                }}
                onMouseOver={(e) => e.currentTarget.style.transform = "scale(1.05)"}
                onMouseOut={(e) => e.currentTarget.style.transform = "scale(1)"}
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

  // ── App shell ──────────────────────────────────────────────────────────────
  return (
    <div style={{ backgroundColor: "#f8fafc", minHeight: "100vh" }}>
      {/* Navbar fixa */}
      <div style={{
        position: "fixed", top: 0, left: 0, width: "100%",
        backgroundColor: "#0f172a", padding: "10px 20px",
        zIndex: 1000, borderBottom: "1px solid #1f2937",
        display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center",
        boxSizing: "border-box",
      }}>
        <button
          onClick={() => setPagina("home")}
          style={{
            backgroundColor: "#1e293b", border: "1px solid #374151",
            color: "#fff", padding: "8px 14px", borderRadius: 8,
            cursor: "pointer", fontSize: 13, marginRight: 10, fontWeight: 600
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
                backgroundColor: ativa ? "#2563eb" : "transparent",
                border: "none",
                color: ativa ? "#fff" : "#94a3b8",
                padding: "8px 14px", borderRadius: 8,
                fontWeight: ativa ? 700 : 500,
                display: "flex", alignItems: "center", gap: 8,
                cursor: "pointer", fontSize: 13,
                transition: "all 0.2s",
              }}
            >
              <Icon size={16} />
              {aba.label}
            </button>
          )
        })}

        <button
          onClick={signOut}
          style={{
            marginLeft: "auto", backgroundColor: "#ef4444",
            border: "none", color: "white", padding: "8px 16px",
            borderRadius: 8, cursor: "pointer", fontWeight: "bold", fontSize: 13,
          }}
        >
          Sair
        </button>
      </div>

      {/* Conteúdo com fundo claro para as telas internas */}
      <div style={{ paddingTop: 80 }}>
        {renderConteudo()}
      </div>
    </div>
  )
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const { user, loading, signOut } = useAuth()

  if (loading) return (
    <div style={{
      color: "white", backgroundColor: "#0f172a",
      width: "100vw", height: "100vh",
      display: "flex", justifyContent: "center", alignItems: "center", fontSize: 18, fontFamily: "sans-serif"
    }}>
      Carregando...
    </div>
  )

  if (!user) return <Login />

  return <AppContent signOut={signOut} />
}