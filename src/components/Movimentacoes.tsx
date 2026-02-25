import React, { useMemo } from "react";
import type { Movimentacao } from "../types/movimentacao";

type Props = {
  movimentacoes: Movimentacao[];
};

export default function Movimentacoes({ movimentacoes }: Props) {

  const movimentacoesOrdenadas = useMemo(() => {
    return [...movimentacoes].sort((a, b) =>
      Number(b.ID_Movimentacao) - Number(a.ID_Movimentacao)
    );
  }, [movimentacoes]);

  const formatar = (valor: number) =>
    Number(valor || 0).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const formatarData = (data: Date | null) =>
    data ? new Date(data).toLocaleDateString("pt-BR") : "-";

  return (
    <div style={{ marginTop: 25 }}>
      <h2 style={{ marginBottom: 15 }}>Todas as Movimentações</h2>

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr style={{ backgroundColor: "#111827" }}>
            <th style={thLeft}>ID</th>
            <th style={thLeft}>Data da Movimentação</th>
            <th style={thLeft}>Data do Pagamento</th>
            <th style={thLeft}>Tipo</th>
            <th style={thLeft}>Categoria</th>
            <th style={thLeft}>Descrição</th>
            <th style={thRight}>Valor</th>
            <th style={thLeft}>Método</th>
          </tr>
        </thead>

        <tbody>
          {movimentacoesOrdenadas.map((m) => (
            <tr key={m.ID_Movimentacao}>
              <td style={tdLeft}>{m.ID_Movimentacao}</td>

              <td style={tdLeft}>
                {formatarData(m["Data da Movimentação"])}
              </td>

              <td style={tdLeft}>
                {formatarData(m["Data do Pagamento"])}
              </td>

              <td style={tdLeft}>{m.Tipo}</td>

              <td style={tdLeft}>{m.Categoria}</td>

              <td style={tdLeft}>{m.Descrição}</td>

              <td
                style={{
                  ...tdRight,
                  color: m.Tipo === "Despesa" ? "#EF4444" : "#10B981",
                  fontWeight: 600,
                }}
              >
                {formatar(m.Valor)}
              </td>

              <td style={tdLeft}>{m["Método de Pagamento"]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ===== PADRÃO VISUAL ===== */

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