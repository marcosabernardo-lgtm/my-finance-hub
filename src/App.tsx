import { useState, useEffect, useMemo } from "react";
import UploadPlanilha from "./components/UploadPlanilha";
import Resumo from "./components/Resumo";
import Movimentacoes from "./components/Movimentacoes";
import ControleSemanal from "./components/ControleSemanal";
import FaturaCartao from "./components/FaturaCartao";
import ResumoClassificacao from "./components/ResumoClassificacao";
import Limites from "./components/Limites";
import DRE from "./components/DRE";
import Cartoes from "./components/Cartoes";
import Pendente from "./components/Pendente";

import type { Movimentacao } from "./types/movimentacao";
import { FinancialService } from "./services/financialService";

import homeImage from "./assets/Home.jpg";

import {
  BarChart3,
  List,
  Calendar,
  CreditCard,
  Wallet,
  FileText,
  Settings
} from "lucide-react";

type DespesaConfig = {
  Categoria: string;
  Classificação: string;
  Limite_Gastos: number;
  Exemplos: string;
};

type Cartao = {
  "Nome do Cartão": string;
  "Data do Fechamento da Fatura": number;
  "Data do Vencimento da Fatura": number;
  "Limite Total do Cartão": number;
};

const nomesMeses = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
];

type Pagina =
  | "home"
  | "resumo"
  | "movimentacoes"
  | "limites"
  | "semanal"
  | "fatura"
  | "dre"
  | "cartoes"
  | "pendente";

/* =========================
   CONVERSOR DATA BR
========================= */

function parseDataBR(data: any): Date | null {

  if (!data) return null;

  if (data instanceof Date) return data;

  if (typeof data === "string") {

    const partes = data.split("/");

    if (partes.length === 3) {

      const dia = Number(partes[0]);
      const mes = Number(partes[1]) - 1;
      const ano = Number(partes[2]);

      return new Date(ano, mes, dia);

    }

    return new Date(data);

  }

  return null;

}

export default function App() {

  const hoje = new Date();

  const [movimentacoes, setMovimentacoes] = useState<Movimentacao[]>([]);
  const [despesasConfig, setDespesasConfig] = useState<DespesaConfig[]>([]);
  const [cartoes, setCartoes] = useState<Cartao[]>([]);
  const [pagina, setPagina] = useState<Pagina>("home");

  const [mesSelecionado, setMesSelecionado] = useState<number>(hoje.getMonth());
  const [anoSelecionado, setAnoSelecionado] = useState<number>(hoje.getFullYear());
  const [cartaoFiltro, setCartaoFiltro] = useState("");

  useEffect(() => {

    const movSalvos = localStorage.getItem("movimentacoes");
    const despSalvos = localStorage.getItem("despesasConfig");
    const cartoesSalvos = localStorage.getItem("cartoes");

    if (movSalvos) {

      const parsed: Movimentacao[] = JSON.parse(movSalvos);

      const convertidas = parsed.map((m) => ({
        ...m,
        "Data da Movimentação": parseDataBR(m["Data da Movimentação"]),
        "Data do Pagamento": parseDataBR(m["Data do Pagamento"]),
      }));

      setMovimentacoes(convertidas);

    }

    if (despSalvos) setDespesasConfig(JSON.parse(despSalvos));
    if (cartoesSalvos) setCartoes(JSON.parse(cartoesSalvos));

  }, []);

  const financialService = useMemo(() => {

    return new FinancialService(
      movimentacoes,
      despesasConfig,
      cartoes,
      mesSelecionado,
      anoSelecionado
    );

  }, [movimentacoes, despesasConfig, cartoes, mesSelecionado, anoSelecionado]);

  /* =========================
     ABAS COM ÍCONES
  ========================= */

  const abas = [
    { label: "Resumo", key: "resumo", icon: BarChart3 },
    { label: "Movimentações", key: "movimentacoes", icon: List },
    { label: "Pendentes", key: "pendente", icon: Calendar },
    { label: "Semanal", key: "semanal", icon: Calendar },
    { label: "Fatura Cartão", key: "fatura", icon: CreditCard },
    { label: "Cartões", key: "cartoes", icon: Wallet },
    { label: "DRE", key: "dre", icon: FileText },
    { label: "Limites", key: "limites", icon: Settings },
  ];

  const renderConteudo = () => {

    switch (pagina) {

      case "resumo":
  return (
    <>
      <Resumo resumoData={financialService.getResumoMesAtual()} />

      <div style={{ marginTop: 40 }}>
        <ResumoClassificacao
          financialService={financialService}
        />
      </div>
    </>
  );

      case "movimentacoes":
        return (
          <Movimentacoes
            movimentacoes={financialService.getMovimentacoesOrdenadas()}
          />
        );

      case "semanal":
        return (
          <ControleSemanal
            controleData={financialService.getControleSemanal()}
          />
        );

      case "fatura":
        return (
          <FaturaCartao
            cartoes={cartoes}
            cartaoFiltro={cartaoFiltro}
            setCartaoFiltro={setCartaoFiltro}
            dados={financialService.getFaturaCartao(cartaoFiltro)}
          />
        );

      case "cartoes":
        return (
          <Cartoes dados={financialService.getCartoesAnual()} />
        );

      case "dre":
        return (
          <DRE dados={financialService.getDREAnual()} />
        );

      case "pendente":
        return (
          <Pendente financialService={financialService} />
        );

      case "limites":
        return (
          <Limites despesasConfig={despesasConfig} />
        );

      default:
        return null;

    }

  };

  /* ================= HOME ================= */

  if (pagina === "home") {

    return (
      <div
        style={{
          width: "100vw",
          height: "100vh",
          backgroundImage: `url(${homeImage})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          position: "relative",
        }}
      >

        <div style={{ position: "absolute", top: 20, right: 20 }}>
          <UploadPlanilha
            onDataLoaded={(movs, despesas, cartoesData) => {

              setMovimentacoes(movs);
              setDespesasConfig(despesas);
              setCartoes(cartoesData);

              localStorage.setItem("movimentacoes", JSON.stringify(movs));
              localStorage.setItem("despesasConfig", JSON.stringify(despesas));
              localStorage.setItem("cartoes", JSON.stringify(cartoesData));

            }}
          />
        </div>

        <h1 style={{ fontSize: 48, color: "white", textAlign: "center" }}>
          CONTROLE FINANCEIRO PESSOAL TESTE
        </h1>

        <div
          style={{
            display: "flex",
            gap: 15,
            marginTop: 30,
            flexWrap: "wrap"
          }}
        >

          {abas.map((aba) => {

            const Icon = aba.icon;

            return (
              <button
                key={aba.key}
                onClick={() => setPagina(aba.key as Pagina)}
                style={{
                  padding: "10px 18px",
                  backgroundColor: "#111827",
                  border: "1px solid #374151",
                  color: "white",
                  borderRadius: 6,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 8
                }}
              >
                <Icon size={18} />
                {aba.label}
              </button>
            );

          })}

        </div>

      </div>
    );

  }

  /* ================= OUTRAS PÁGINAS ================= */

  return (
    <>
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100%",
          backgroundColor: "#0f172a",
          padding: "15px 20px",
          zIndex: 1000,
          borderBottom: "1px solid #1f2937",
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
        }}
      >

        <button onClick={() => setPagina("home")}>← Início</button>

        {abas.map((aba) => {

          const Icon = aba.icon;

          return (
            <button
              key={aba.key}
              onClick={() => setPagina(aba.key as Pagina)}
              style={{
                backgroundColor:
                  aba.key === pagina ? "#1f2937" : "#111827",
                border:
                  aba.key === pagina
                    ? "2px solid #3b82f6"
                    : "1px solid #374151",
                color: "white",
                padding: "8px 14px",
                borderRadius: 6,
                fontWeight:
                  aba.key === pagina ? "bold" : "normal",
                display: "flex",
                alignItems: "center",
                gap: 6,
                cursor: "pointer"
              }}
            >
              <Icon size={16} />
              {aba.label}
            </button>
          );

        })}

      </div>

      <div style={{ padding: "110px 20px 20px 20px" }}>

        <h3>Filtro Global</h3>

        <div style={{ marginBottom: 20 }}>

          <label>Mês: </label>

          <select
            value={mesSelecionado}
            onChange={(e) =>
              setMesSelecionado(Number(e.target.value))
            }
          >

            {nomesMeses.map((mes, index) => (
              <option key={mes} value={index}>
                {mes}
              </option>
            ))}

          </select>

          <label style={{ marginLeft: 20 }}>Ano: </label>

          <input
            type="number"
            value={anoSelecionado}
            onChange={(e) =>
              setAnoSelecionado(Number(e.target.value))
            }
            style={{ width: 100 }}
          />

        </div>

        {renderConteudo()}

      </div>
    </>
  );
}