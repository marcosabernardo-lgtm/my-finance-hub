import React, { useState, useEffect, useMemo } from "react";
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
        "Data da Movimentação":
          typeof m["Data da Movimentação"] === "string"
            ? new Date(m["Data da Movimentação"])
            : m["Data da Movimentação"],
        "Data do Pagamento":
          typeof m["Data do Pagamento"] === "string"
            ? new Date(m["Data do Pagamento"])
            : m["Data do Pagamento"],
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

  const abas: { label: string; key: Pagina }[] = [
    { label: "Resumo", key: "resumo" },
    { label: "Movimentações", key: "movimentacoes" },
    { label: "Semanal", key: "semanal" },
    { label: "Fatura Cartão", key: "fatura" },
    { label: "Cartões", key: "cartoes" },
    { label: "Pendentes", key: "pendente" },
    { label: "DRE", key: "dre" },
    { label: "Limites", key: "limites" },
  ];

  const renderConteudo = () => {
    switch (pagina) {
      case "resumo":
        return (
          <>
            <Resumo resumoData={financialService.getResumoMesAtual()} />
            <div style={{ marginTop: 40 }}>
              <ResumoClassificacao dados={financialService.getResumoClassificacao()} />
            </div>
          </>
        );

      case "movimentacoes":
        return <Movimentacoes movimentacoes={financialService.getMovimentacoesOrdenadas()} />;

      case "semanal":
        return <ControleSemanal controleData={financialService.getControleSemanal()} />;

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
        return <Cartoes dados={financialService.getCartoesAnual()} />;

      case "dre":
        return <DRE dados={financialService.getDREAnual()} />;

      case "pendente":
        return <Pendente financialService={financialService} />;

      case "limites":
        return <Limites despesasConfig={despesasConfig} />;

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
          CONTROLE FINANCEIRO PESSOAL
        </h1>

        <div style={{ display: "flex", gap: 15, marginTop: 30, flexWrap: "wrap" }}>
          {abas.map((aba) => (
            <button
              key={aba.key}
              onClick={() => setPagina(aba.key)}
              style={{
                padding: "10px 18px",
                backgroundColor: "#111827",
                border: "1px solid #374151",
                color: "white",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              {aba.label}
            </button>
          ))}
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

        {abas.map((aba) => (
          <button
            key={aba.key}
            onClick={() => setPagina(aba.key)}
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
              fontWeight: aba.key === pagina ? "bold" : "normal",
            }}
          >
            {aba.label}
          </button>
        ))}
      </div>

      <div style={{ padding: "110px 20px 20px 20px" }}>
        <h3>Filtro Global</h3>

        <div style={{ marginBottom: 20 }}>
          <label>Mês: </label>
          <select
            value={mesSelecionado}
            onChange={(e) => setMesSelecionado(Number(e.target.value))}
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
            onChange={(e) => setAnoSelecionado(Number(e.target.value))}
            style={{ width: 100 }}
          />
        </div>

        {renderConteudo()}
      </div>
    </>
  );
}