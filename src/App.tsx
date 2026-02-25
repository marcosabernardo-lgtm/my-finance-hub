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
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

export default function App() {
  const hoje = new Date();

  const [movimentacoes, setMovimentacoes] = useState<Movimentacao[]>([]);
  const [despesasConfig, setDespesasConfig] = useState<DespesaConfig[]>([]);
  const [cartoes, setCartoes] = useState<Cartao[]>([]);

  const [abaAtiva, setAbaAtiva] = useState<
    | "resumo"
    | "movimentacoes"
    | "limites"
    | "semanal"
    | "fatura"
    | "gerencial"
    | "dre"
    | "cartoes"
    | "pendente"
  >("resumo");

  const [mesSelecionado, setMesSelecionado] = useState<number>(
    hoje.getMonth()
  );

  const [anoSelecionado, setAnoSelecionado] = useState<number>(
    hoje.getFullYear()
  );

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
          m["Data da Movimentação"] &&
          typeof m["Data da Movimentação"] === "string"
            ? new Date(m["Data da Movimentação"])
            : null,
        "Data do Pagamento":
          m["Data do Pagamento"] &&
          typeof m["Data do Pagamento"] === "string"
            ? new Date(m["Data do Pagamento"])
            : null,
      }));

      setMovimentacoes(convertidas);
    }

    if (despSalvos) {
      setDespesasConfig(JSON.parse(despSalvos));
    }

    if (cartoesSalvos) {
      setCartoes(JSON.parse(cartoesSalvos));
    }
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

  const resumoData = useMemo(() => {
    return financialService.getResumoMesAtual();
  }, [financialService]);

  const controleSemanalData = useMemo(() => {
    return financialService.getControleSemanal();
  }, [financialService]);

  const movimentacoesOrdenadas = useMemo(() => {
    return financialService.getMovimentacoesOrdenadas();
  }, [financialService]);

  const resumoClassificacaoData = useMemo(() => {
    return financialService.getResumoClassificacao();
  }, [financialService]);

  const faturaData = useMemo(() => {
    if (!cartaoFiltro) return [];
    return financialService.getFaturaCartao(cartaoFiltro);
  }, [financialService, cartaoFiltro]);

  const dreData = useMemo(() => {
    return financialService.getDREAnual();
  }, [financialService]);

  const cartoesAnualData = useMemo(() => {
    return financialService.getCartoesAnual();
  }, [financialService]);

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto", padding: 20 }}>
      <h1>Controle Financeiro Pessoal</h1>

      <UploadPlanilha onDataLoaded={handleDataLoaded} />

      {/* FILTRO GLOBAL */}
      <div style={{ marginTop: 20 }}>
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

      {/* BOTÕES */}
      <div style={{ marginTop: 20 }}>
        <button onClick={() => setAbaAtiva("resumo")}>Resumo</button>
        <button onClick={() => setAbaAtiva("movimentacoes")}>
          Movimentações
        </button>
        <button onClick={() => setAbaAtiva("semanal")}>Semanal</button>
        <button onClick={() => setAbaAtiva("fatura")}>Fatura Cartão</button>
        <button onClick={() => setAbaAtiva("cartoes")}>Cartões</button>
        <button onClick={() => setAbaAtiva("pendente")}>Pendentes</button>
        <button onClick={() => setAbaAtiva("gerencial")}>
          Resumo Gerencial
        </button>
        <button onClick={() => setAbaAtiva("dre")}>DRE</button>
        <button onClick={() => setAbaAtiva("limites")}>Limites</button>
      </div>

      {abaAtiva === "resumo" && <Resumo resumoData={resumoData} />}

      {abaAtiva === "movimentacoes" && (
        <Movimentacoes movimentacoes={movimentacoesOrdenadas} />
      )}

      {abaAtiva === "limites" && (
        <Limites despesasConfig={despesasConfig} />
      )}

      {abaAtiva === "semanal" && (
        <ControleSemanal controleData={controleSemanalData} />
      )}

      {abaAtiva === "fatura" && (
        <FaturaCartao
          cartoes={cartoes}
          cartaoFiltro={cartaoFiltro}
          setCartaoFiltro={setCartaoFiltro}
          dados={faturaData}
        />
      )}

      {abaAtiva === "cartoes" && (
        <Cartoes dados={cartoesAnualData} />
      )}

      {abaAtiva === "pendente" && (
        <Pendente financialService={financialService} />
      )}

      {abaAtiva === "gerencial" && (
        <ResumoClassificacao dados={resumoClassificacaoData} />
      )}

      {abaAtiva === "dre" && <DRE dados={dreData} />}
    </div>
  );
}