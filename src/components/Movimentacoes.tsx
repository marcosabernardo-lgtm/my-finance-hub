import React, { useMemo, useState } from "react";
import type { Movimentacao } from "../types/movimentacao";

type Props = {
  movimentacoes: Movimentacao[];
};

export default function Movimentacoes({ movimentacoes }: Props) {
  const [filtroSituacao, setFiltroSituacao] = useState<string>("Todas");

  /* =====================================
     ORDENAÇÃO IGUAL AO EXCEL (ID DESC)
  ===================================== */
  const movimentacoesOrdenadas = useMemo(() => {
    return [...movimentacoes].sort(
      (a, b) =>
        Number(b.ID_Movimentacao) -
        Number(a.ID_Movimentacao)
    );
  }, [movimentacoes]);

  /* =====================================
     SITUAÇÕES DISPONÍVEIS (ROBUSTO)
  ===================================== */
  const situacoesDisponiveis = useMemo(() => {
    const normalizadas = movimentacoes.map((m) =>
      (m.Situação || "").trim()
    );

    const unicas = Array.from(new Set(normalizadas))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));

    return ["Todas", ...unicas];
  }, [movimentacoes]);

  /* =====================================
     FILTRO POR SITUAÇÃO
  ===================================== */
  const movimentacoesFiltradas = useMemo(() => {
    if (filtroSituacao === "Todas")
      return movimentacoesOrdenadas;

    return movimentacoesOrdenadas.filter(
      (m) =>
        (m.Situação || "").trim() ===
        filtroSituacao
    );
  }, [movimentacoesOrdenadas, filtroSituacao]);

  /* =====================================
     FORMATADORES
  ===================================== */
  const formatarMoeda = (valor: number) =>
    Number(valor || 0).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const formatarData = (data: Date | null) =>
    data
      ? new Date(data).toLocaleDateString("pt-BR")
      : "-";

  const corSituacao = (situacao: string) => {
    const s = (situacao || "").trim();

    if (s === "Pendente") return "#EF4444";
    if (s === "Pago") return "#10B981";
    if (s === "Faturado") return "#F59E0B";
    return "white";
  };

  return (
    <div style={{ marginTop: 25 }}>
      <h2 style={{ marginBottom: 15 }}>
        Todas as Movimentações
      </h2>

      {/* =============================
         FILTRO
      ============================= */}
      <div style={{ marginBottom: 15 }}>
        <label>Situação: </label>
        <select
          value={filtroSituacao}
          onChange={(e) =>
            setFiltroSituacao(e.target.value)
          }
        >
          {situacoesDisponiveis.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {/* =============================
         TABELA
      ============================= */}
      <div
        style={{
          maxHeight: 500,
          overflowY: "auto",
          border: "1px solid #1f2937",
        }}
      >
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 12,
          }}
        >
          <thead>
            <tr
              style={{
                backgroundColor: "#111827",
                position: "sticky",
                top: 0,
                zIndex: 1,
              }}
            >
              <th style={thLeft}>ID</th>
              <th style={thLeft}>
                Data da Movimentação
              </th>
              <th style={thLeft}>
                Data do Pagamento
              </th>
              <th style={thLeft}>Tipo</th>
              <th style={thLeft}>Categoria</th>
              <th style={thLeft}>Descrição</th>
              <th style={thRight}>Valor</th>
              <th style={thLeft}>Método</th>
              <th style={thLeft}>Situação</th>
            </tr>
          </thead>

          <tbody>
            {movimentacoesFiltradas.map((m) => {
              const pendente =
                (m.Situação || "").trim() ===
                "Pendente";

              return (
                <tr
                  key={m.ID_Movimentacao}
                  style={{
                    backgroundColor: pendente
                      ? "rgba(239, 68, 68, 0.08)"
                      : "transparent",
                  }}
                >
                  <td style={tdLeft}>
                    {m.ID_Movimentacao}
                  </td>

                  <td style={tdLeft}>
                    {formatarData(
                      m["Data da Movimentação"]
                    )}
                  </td>

                  <td style={tdLeft}>
                    {formatarData(
                      m["Data do Pagamento"]
                    )}
                  </td>

                  <td style={tdLeft}>
                    {m.Tipo}
                  </td>

                  <td style={tdLeft}>
                    {m.Categoria}
                  </td>

                  <td style={tdLeft}>
                    {m.Descrição}
                  </td>

                  <td
                    style={{
                      ...tdRight,
                      color:
                        m.Tipo === "Despesa"
                          ? "#EF4444"
                          : "#10B981",
                      fontWeight: 600,
                    }}
                  >
                    {formatarMoeda(m.Valor)}
                  </td>

                  <td style={tdLeft}>
                    {m["Método de Pagamento"]}
                  </td>

                  <td
                    style={{
                      ...tdLeft,
                      fontWeight: 600,
                      color: corSituacao(
                        m.Situação
                      ),
                    }}
                  >
                    {m.Situação}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* =============================
   PADRÃO VISUAL
============================= */

const thLeft: React.CSSProperties = {
  textAlign: "left",
  padding: "6px 8px",
};

const thRight: React.CSSProperties = {
  textAlign: "right",
  padding: "6px 8px",
};

const tdLeft: React.CSSProperties = {
  padding: "6px 8px",
  borderBottom: "1px solid #1f2937",
};

const tdRight: React.CSSProperties = {
  padding: "6px 8px",
  textAlign: "right",
  borderBottom: "1px solid #1f2937",
};