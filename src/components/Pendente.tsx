import React, { useMemo } from "react";
import { FinancialService } from "../services/financialService";

type Props = {
  financialService: FinancialService;
};

const mesesAbreviados = [
  "Jan","Fev","Mar","Abr","Mai","Jun",
  "Jul","Ago","Set","Out","Nov","Dez"
];

const Pendente: React.FC<Props> = ({ financialService }) => {
  const dados = useMemo(() => {
    return financialService.getPendenciasAnuais();
  }, [financialService]);

  const totalAtual = useMemo(() => {
    return financialService.getTotalPendenteAtual();
  }, [financialService]);

  const formatar = (valor: number) =>
    valor.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });

  const formatarCelula = (valor: number) => {
    if (!valor) return <span style={{ color: "#555" }}>–</span>;
    return formatar(valor);
  };

  return (
    <div style={{ marginTop: 25 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 15,
        }}
      >
        <h2 style={{ margin: 0, fontSize: 18 }}>
          Despesas Pendentes - {dados.ano}
        </h2>

        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: "#fff",
            background: "#1a1a1a",
            padding: "6px 12px",
            borderRadius: 6,
          }}
        >
          Total Pendente Atual: {formatar(totalAtual)}
        </div>
      </div>

      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: 12.5,
          background: "#111",
        }}
      >
        <thead>
          <tr style={{ background: "#1a1a1a" }}>
            <th style={thLeft}>Categoria</th>

            {mesesAbreviados.map((mes) => (
              <th key={mes} style={th}>
                {mes}
              </th>
            ))}

            <th style={th}>Total</th>
          </tr>
        </thead>

        <tbody>
          {dados.categorias.map((categoria, index) => (
            <tr
              key={categoria}
              style={{
                background: index % 2 === 0 ? "#141414" : "#101010",
              }}
            >
              <td style={tdCategoria}>{categoria}</td>

              {dados.meses.map((mes) => (
                <td key={mes} style={tdValor}>
                  {formatarCelula(dados.valores[categoria]?.[mes] || 0)}
                </td>
              ))}

              <td style={tdTotalCategoria}>
                {formatar(dados.totalPorCategoria[categoria] || 0)}
              </td>
            </tr>
          ))}

          <tr style={{ background: "#1a1a1a", fontWeight: 700 }}>
            <td style={tdTotalLabel}>Total Mês</td>

            {dados.meses.map((mes) => (
              <td key={mes} style={tdTotalValor}>
                {formatarCelula(dados.totalPorMes[mes] || 0)}
              </td>
            ))}

            <td style={tdTotalValor}>
              {formatar(dados.totalGeral)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};

const th: React.CSSProperties = {
  padding: "8px 10px",
  textAlign: "right",
  borderBottom: "1px solid #2a2a2a",
};

const thLeft: React.CSSProperties = {
  ...th,
  textAlign: "left",
};

const tdCategoria: React.CSSProperties = {
  padding: "6px 10px",
  borderBottom: "1px solid #1f1f1f",
};

const tdValor: React.CSSProperties = {
  padding: "6px 10px",
  borderBottom: "1px solid #1f1f1f",
  textAlign: "right",
};

const tdTotalCategoria: React.CSSProperties = {
  padding: "6px 10px",
  borderBottom: "1px solid #1f1f1f",
  textAlign: "right",
  fontWeight: 700,
};

const tdTotalLabel: React.CSSProperties = {
  padding: "8px 10px",
  borderTop: "2px solid #333",
};

const tdTotalValor: React.CSSProperties = {
  padding: "8px 10px",
  borderTop: "2px solid #333",
  textAlign: "right",
  fontWeight: 700,
};

export default Pendente;