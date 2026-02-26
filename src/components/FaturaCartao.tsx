import type { Movimentacao } from "../types/movimentacao";
import GraficoCategoria from "./GraficoCategoria";
import React, { useState } from "react";

type Cartao = {
  "Nome do Cartão": string;
  "Data do Fechamento da Fatura": number;
  "Data do Vencimento da Fatura": number;
  "Limite Total do Cartão": number;
};

type Props = {
  cartoes: Cartao[];
  cartaoFiltro: string;
  setCartaoFiltro: (valor: string) => void;
  dados: Movimentacao[];
};

export default function FaturaCartao({
  cartoes,
  cartaoFiltro,
  setCartaoFiltro,
  dados,
}: Props) {
  const [modoVisualizacao, setModoVisualizacao] =
    useState<"tabela" | "grafico">("tabela");

  const formatarMoeda = (valor?: number) =>
    (valor || 0).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const formatarDescricao = (texto?: string) => {
    if (!texto) return "";
    return texto
      .toLowerCase()
      .split(" ")
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join(" ");
  };

  const totalFatura = (dados || []).reduce(
    (acc, mov) => acc + (mov.Valor || 0),
    0
  );

  return (
    <div style={{ marginTop: 25, width: "100%" }}>
      <h2 style={{ marginBottom: 15 }}>Fatura Cartão</h2>

      {/* CONTROLES */}
      <div style={{ display: "flex", gap: 20, marginBottom: 20 }}>
        <select
          value={cartaoFiltro}
          onChange={(e) => setCartaoFiltro(e.target.value)}
          style={{ padding: 6, minWidth: 240 }}
        >
          <option value="">Selecione o Cartão</option>
          {cartoes.map((c) => (
            <option
              key={c["Nome do Cartão"]}
              value={c["Nome do Cartão"]}
            >
              {c["Nome do Cartão"]}
            </option>
          ))}
        </select>

        <div
          style={{
            display: "flex",
            background: "#1e1e1e",
            borderRadius: 8,
            overflow: "hidden",
          }}
        >
          <button
            onClick={() => setModoVisualizacao("tabela")}
            style={{
              padding: "6px 14px",
              border: "none",
              background:
                modoVisualizacao === "tabela"
                  ? "#2c2c2c"
                  : "transparent",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            Tabela
          </button>

          <button
            onClick={() => setModoVisualizacao("grafico")}
            style={{
              padding: "6px 14px",
              border: "none",
              background:
                modoVisualizacao === "grafico"
                  ? "#2c2c2c"
                  : "transparent",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            Gráfico
          </button>
        </div>
      </div>

      <h3 style={{ marginBottom: 20 }}>
        Total Fatura: {formatarMoeda(totalFatura)}
      </h3>

      {modoVisualizacao === "tabela" ? (
        (dados || []).length === 0 ? (
          <p>Nenhuma movimentação encontrada.</p>
        ) : (
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 12,
            }}
          >
            <thead>
              <tr style={{ backgroundColor: "#111827" }}>
                <th style={thPadrao}>Data</th>
                <th style={thPadrao}>Categoria</th>
                <th style={thPadrao}>Descrição</th>
                <th style={thValor}>Valor</th>
                <th style={thPadrao}>Forma</th>
                <th style={thPadrao}>Parcela</th>
              </tr>
            </thead>

            <tbody>
              {dados.map((m) => (
                <tr key={m.ID_Movimentacao}>
                  <td style={tdPadrao}>
                    {m["Data da Movimentação"]?.toLocaleDateString("pt-BR")}
                  </td>

                  <td style={tdPadrao}>
                    {m.Categoria}
                  </td>

                  <td style={tdPadrao}>
                    {formatarDescricao(m.Descrição)}
                  </td>

                  <td style={tdValor}>
                    {formatarMoeda(m.Valor)}
                  </td>

                  <td style={tdPadrao}>
                    {m["Forma de Pagamento"]}
                  </td>

                  <td style={tdPadrao}>
                    {m["Nº da Parcela"]}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      ) : (
        <div style={{ width: "100%", height: 500 }}>
          <GraficoCategoria dados={dados || []} />
        </div>
      )}
    </div>
  );
}

/* ===== ESTILO PADRÃO ===== */

const thPadrao: React.CSSProperties = {
  textAlign: "left",
  padding: "6px 8px",
};

const thValor: React.CSSProperties = {
  textAlign: "right",
  padding: "6px 8px",
};

const tdPadrao: React.CSSProperties = {
  padding: "6px 8px",
  borderBottom: "1px solid #1f2937",
};

const tdValor: React.CSSProperties = {
  padding: "6px 8px",
  textAlign: "right",
  borderBottom: "1px solid #1f2937",
  fontWeight: 600,
};