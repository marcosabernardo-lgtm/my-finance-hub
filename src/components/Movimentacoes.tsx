import { useMemo, useState } from "react";
import type { Movimentacao } from "../types/movimentacao";

type Props = {
  movimentacoes: Movimentacao[];
};

export default function Movimentacoes({ movimentacoes }: Props) {

  const [filtroSituacao, setFiltroSituacao] = useState("Todas");
  const [filtroTipo, setFiltroTipo] = useState("Todos");
  const [filtroCategoria, setFiltroCategoria] = useState("Todas");
  const [filtroMetodo, setFiltroMetodo] = useState("Todos");

  /* =============================
     LIMPAR FILTROS
  ============================= */

  const limparFiltros = () => {
    setFiltroSituacao("Todas");
    setFiltroTipo("Todos");
    setFiltroCategoria("Todas");
    setFiltroMetodo("Todos");
  };

  /* =============================
     ORDENAÇÃO
  ============================= */

  const movimentacoesOrdenadas = useMemo(() => {
    return [...movimentacoes].sort(
      (a, b) => Number(b.ID_Movimentacao) - Number(a.ID_Movimentacao)
    );
  }, [movimentacoes]);

  /* =============================
     FILTROS BASE
  ============================= */

  const filtradoSituacao = useMemo(() => {
    if (filtroSituacao === "Todas") return movimentacoesOrdenadas;

    return movimentacoesOrdenadas.filter(
      m => (m.Situação || "").trim() === filtroSituacao
    );
  }, [movimentacoesOrdenadas, filtroSituacao]);

  const filtradoTipo = useMemo(() => {
    if (filtroTipo === "Todos") return filtradoSituacao;

    return filtradoSituacao.filter(
      m => m.Tipo === filtroTipo
    );
  }, [filtradoSituacao, filtroTipo]);

  const filtradoCategoria = useMemo(() => {
    if (filtroCategoria === "Todas") return filtradoTipo;

    return filtradoTipo.filter(
      m => m.Categoria === filtroCategoria
    );
  }, [filtradoTipo, filtroCategoria]);

  const movimentacoesFiltradas = useMemo(() => {
    if (filtroMetodo === "Todos") return filtradoCategoria;

    return filtradoCategoria.filter(
      m => m["Método de Pagamento"] === filtroMetodo
    );
  }, [filtradoCategoria, filtroMetodo]);

  /* =============================
     LISTAS DINÂMICAS FILTROS
  ============================= */

  const situacoes = useMemo(() => {
    return [
      "Todas",
      ...Array.from(
        new Set(movimentacoes.map(m => (m.Situação || "").trim()))
      )
    ];
  }, [movimentacoes]);

  const tipos = useMemo(() => {
    return [
      "Todos",
      ...Array.from(new Set(filtradoSituacao.map(m => m.Tipo)))
    ];
  }, [filtradoSituacao]);

  const categorias = useMemo(() => {
    return [
      "Todas",
      ...Array.from(new Set(filtradoTipo.map(m => m.Categoria)))
    ];
  }, [filtradoTipo]);

  const metodos = useMemo(() => {
    return [
      "Todos",
      ...Array.from(
        new Set(filtradoCategoria.map(m => m["Método de Pagamento"]))
      )
    ];
  }, [filtradoCategoria]);

  /* =============================
     TOTAIS
  ============================= */

  const totalReceitas = useMemo(() => {
    return movimentacoesFiltradas
      .filter(m => m.Tipo === "Receita")
      .reduce((s, m) => s + Number(m.Valor || 0), 0);
  }, [movimentacoesFiltradas]);

  const totalDespesas = useMemo(() => {
    return movimentacoesFiltradas
      .filter(m => m.Tipo === "Despesa")
      .reduce((s, m) => s + Number(m.Valor || 0), 0);
  }, [movimentacoesFiltradas]);

  const saldo = totalReceitas - totalDespesas;

  /* =============================
     FORMATADORES
  ============================= */

  const moeda = (v: number) =>
    v.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL"
    });

  const data = (d: Date | null) =>
    d ? new Date(d).toLocaleDateString("pt-BR") : "-";

  const corSituacao = (s: string) => {
    if (s === "Pendente") return "#EF4444";
    if (s === "Pago") return "#10B981";
    if (s === "Faturado") return "#F59E0B";
    return "white";
  };

  return (
    <div style={{ marginTop: 25 }}>

      <h2>Todas as Movimentações</h2>

      {/* =============================
         FILTROS
      ============================= */}

      <div
        style={{
          display: "flex",
          gap: 20,
          flexWrap: "wrap",
          marginBottom: 20,
          alignItems: "flex-end"
        }}
      >

        <div>
          <label>Situação</label><br />
          <select
            value={filtroSituacao}
            onChange={e => setFiltroSituacao(e.target.value)}
          >
            {situacoes.map(s => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>

        <div>
          <label>Tipo</label><br />
          <select
            value={filtroTipo}
            onChange={e => setFiltroTipo(e.target.value)}
          >
            {tipos.map(t => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </div>

        <div>
          <label>Categoria</label><br />
          <select
            value={filtroCategoria}
            onChange={e => setFiltroCategoria(e.target.value)}
          >
            {categorias.map(c => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>

        <div>
          <label>Método</label><br />
          <select
            value={filtroMetodo}
            onChange={e => setFiltroMetodo(e.target.value)}
          >
            {metodos.map(m => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </div>

        <button
          onClick={limparFiltros}
          style={{
            height: 30,
            padding: "0 14px",
            backgroundColor: "#1f2937",
            color: "white",
            border: "1px solid #374151",
            borderRadius: 4,
            cursor: "pointer"
          }}
        >
          Limpar filtros
        </button>

      </div>

      {/* =============================
         RESUMO
      ============================= */}

      <div style={{ marginBottom: 20, fontSize: 15 }}>

        <b>Receitas:</b>
        <span style={{ color: "#10B981", marginLeft: 5 }}>
          {moeda(totalReceitas)}
        </span>

        <span style={{ marginLeft: 30 }}>
          <b>Despesas:</b>
          <span style={{ color: "#EF4444", marginLeft: 5 }}>
            {moeda(totalDespesas)}
          </span>
        </span>

        <span style={{ marginLeft: 30 }}>
          <b>Saldo:</b>
          <span
            style={{
              color: saldo >= 0 ? "#10B981" : "#EF4444",
              marginLeft: 5
            }}
          >
            {moeda(saldo)}
          </span>
        </span>

      </div>

      {/* =============================
         TABELA
      ============================= */}

      <div
        style={{
          height: 500,
          overflowY: "auto",
          border: "1px solid #1f2937"
        }}
      >

        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 12
          }}
        >

          <thead>
            <tr style={{ backgroundColor: "#111827" }}>
              <th style={{ minWidth: 70 }}>ID</th>
              <th style={{ minWidth: 130 }}>Data Mov.</th>
              <th style={{ minWidth: 130 }}>Data Pag.</th>
              <th style={{ minWidth: 100 }}>Tipo</th>
              <th style={{ minWidth: 160 }}>Categoria</th>
              <th style={{ minWidth: 300 }}>Descrição</th>
              <th style={{ minWidth: 110 }}>Valor</th>
              <th style={{ minWidth: 150 }}>Método</th>
              <th style={{ minWidth: 110 }}>Situação</th>
            </tr>
          </thead>

          <tbody>

            {movimentacoesFiltradas.map(m => (

              <tr key={m.ID_Movimentacao}>

                <td>{m.ID_Movimentacao}</td>
                <td>{data(m["Data da Movimentação"])}</td>
                <td>{data(m["Data do Pagamento"])}</td>
                <td>{m.Tipo}</td>
                <td>{m.Categoria}</td>
                <td>{m.Descrição}</td>

                <td
                  style={{
                    color: m.Tipo === "Despesa" ? "#EF4444" : "#10B981",
                    fontWeight: 600
                  }}
                >
                  {moeda(m.Valor)}
                </td>

                <td>{m["Método de Pagamento"]}</td>

                <td
                  style={{
                    color: corSituacao(m.Situação),
                    fontWeight: 600
                  }}
                >
                  {m.Situação}
                </td>

              </tr>

            ))}

          </tbody>

        </table>

      </div>

    </div>
  );
}