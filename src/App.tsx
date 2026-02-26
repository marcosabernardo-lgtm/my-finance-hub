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

  const handleDataLoaded = (
    movs: Movimentacao[],
    despesas: DespesaConfig[],
    cartoesData: Cartao[]
  ) => {
    setMovimentacoes(movs);
    setDespesasConfig(despesas);
    setCartoes(cartoesData);

    localStorage.setItem("movimentacoes", JSON.stringify(movs));
    localStorage.setItem("despesasConfig", JSON.stringify(despesas));
    localStorage.setItem("cartoes", JSON.stringify(cartoesData));
  };

  const financialService = useMemo(() => {
    return new FinancialService(
      movimentacoes,
      despesasConfig,
      cartoes,
      mesSelecionado,
      anoSelecionado
    );
  }, [movimentacoes, despesasConfig, cartoes, mesSelecionado, anoSelecionado]);

  const resumoData = useMemo(() => financialService.getResumoMesAtual(), [financialService]);
  const controleSemanalData = useMemo(() => financialService.getControleSemanal(), [financialService]);
  const movimentacoesOrdenadas = useMemo(() => financialService.getMovimentacoesOrdenadas(), [financialService]);
  const resumoClassificacaoData = useMemo(() => financialService.getResumoClassificacao(), [financialService]);
  const dreData = useMemo(() => financialService.getDREAnual(), [financialService]);
  const cartoesAnualData = useMemo(() => financialService.getCartoesAnual(), [financialService]);

  const faturaData = useMemo(() => {
    if (!cartaoFiltro) return [];
    return financialService.getFaturaCartao(cartaoFiltro);
  }, [financialService, cartaoFiltro]);

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
            <Resumo resumoData={resumoData} />
            <div style={{ marginTop: 40 }}>
              <ResumoClassificacao dados={resumoClassificacaoData} />
            </div>
          </>
        );
      case "movimentacoes":
        return <Movimentacoes movimentacoes={movimentacoesOrdenadas} />;
      case "limites":
        return <Limites despesasConfig={despesasConfig} />;
      case "semanal":
        return <ControleSemanal controleData={controleSemanalData} />;
      case "fatura":
        return (
          <FaturaCartao
            cartoes={cartoes}
            cartaoFiltro={cartaoFiltro}
            setCartaoFiltro={setCartaoFiltro}
            dados={faturaData}
          />
        );
      case "cartoes":
        return <Cartoes dados={cartoesAnualData} />;
      case "pendente":
        return <Pendente financialService={financialService} />;
      case "dre":
        return <DRE dados={dreData} />;
      default:
        return null;
    }
  };

  if (pagina === "home") {
    return (
      <div
        style={{
          width: "100vw",
          height: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          backgroundImage: `url(${homeImage})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <h1 style={{ fontSize: 48, color: "white" }}>
          CONTROLE FINANCEIRO PESSOAL
        </h1>

        <div style={{ display: "flex", gap: 15, flexWrap: "wrap", marginTop: 30 }}>
          {abas.map((aba) => (
            <button key={aba.key} onClick={() => setPagina(aba.key)}>
              {aba.label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 20 }}>
      {/* 🔹 Navegação Interna */}
      <div style={{ marginBottom: 20, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button onClick={() => setPagina("home")}>← Início</button>

        {abas
          .filter((aba) => aba.key !== pagina)
          .map((aba) => (
            <button key={aba.key} onClick={() => setPagina(aba.key)}>
              {aba.label}
            </button>
          ))}
      </div>

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
  );
}