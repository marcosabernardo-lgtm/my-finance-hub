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

  const formatarMoeda = (valor?: number) => {
    if (!valor) return "R$ 0,00";
    return valor.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  };

  const formatarDescricao = (texto?: string) => {
    if (!texto || typeof texto !== "string") return "";
    return texto
      .toLowerCase()
      .split(" ")
      .map(
        (palavra) =>
          palavra.charAt(0).toUpperCase() + palavra.slice(1)
      )
      .join(" ");
  };

  const totalFatura = (dados || []).reduce(
    (acc, mov) => acc + (mov.Valor || 0),
    0
  );

  const celulaStyle: React.CSSProperties = {
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    padding: "8px 4px",
  };

  return (
    <>
      <h2 style={{ marginTop: 30 }}>Fatura Cartão</h2>

      {/* LINHA SUPERIOR */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 20,
          marginBottom: 25,
        }}
      >
        {/* Seletor de cartão */}
        <select
          value={cartaoFiltro}
          onChange={(e) => setCartaoFiltro(e.target.value)}
          style={{
            minWidth: 240,
            padding: 6,
          }}
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

        {/* Toggle Tabela / Gráfico */}
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

      <h3 style={{ marginBottom: 25 }}>
        Total Fatura: {formatarMoeda(totalFatura)}
      </h3>

      {/* CONTEÚDO */}
      {modoVisualizacao === "tabela" ? (
        (dados || []).length === 0 ? (
          <p>Nenhuma movimentação encontrada.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                tableLayout: "fixed",
                borderCollapse: "separate",
                borderSpacing: "16px 10px",
                fontSize: "13px",
              }}
            >
              <thead>
                <tr>
                  <th style={{ width: "12%", textAlign: "left" }}>
                    Data
                  </th>
                  <th style={{ width: "22%", textAlign: "left" }}>
                    Categoria
                  </th>
                  <th style={{ width: "26%", textAlign: "left" }}>
                    Descrição
                  </th>
                  <th style={{ width: "14%", textAlign: "right" }}>
                    Valor
                  </th>
                  <th style={{ width: "16%", textAlign: "left" }}>
                    Forma
                  </th>
                  <th style={{ width: "10%", textAlign: "left" }}>
                    Parcela
                  </th>
                </tr>
              </thead>

              <tbody>
                {(dados || []).map((m, index) => (
                  <tr
                    key={m.ID_Movimentacao}
                    style={{
                      background:
                        index % 2 === 0
                          ? "#1a1a1a"
                          : "#161616",
                    }}
                  >
                    <td style={celulaStyle}>
                      {m["Data da Movimentação"]?.toLocaleDateString()}
                    </td>
                    <td style={celulaStyle}>
                      {m.Categoria}
                    </td>
                    <td style={celulaStyle}>
                      {formatarDescricao(m.Descrição)}
                    </td>
                    <td
                      style={{
                        ...celulaStyle,
                        textAlign: "right",
                        fontWeight: 600,
                      }}
                    >
                      {formatarMoeda(m.Valor)}
                    </td>
                    <td style={celulaStyle}>
                      {m["Forma de Pagamento"]}
                    </td>
                    <td style={celulaStyle}>
                      {m["Nº da Parcela"]}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : (
        <GraficoCategoria dados={dados || []} />
      )}
    </>
  );
}