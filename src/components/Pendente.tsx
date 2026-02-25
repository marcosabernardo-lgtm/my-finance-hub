import React, { useMemo } from "react";
import { FinancialService } from "../services/financialService";

type Props = {
  financialService: FinancialService;
};

const mesesAbreviados = [
  "Jan","Fev","Mar","Abr","Mai","Jun",
  "Jul","Ago","Set","Out","Nov","Dez"
];

export default function Pendente({ financialService }: Props) {

  const dados = useMemo(() => {
    return financialService.getPendenciasAnuais();
  }, [financialService]);

  const totalAtual = useMemo(() => {
    return financialService.getTotalPendenteAtual();
  }, [financialService]);

  if (!dados) return null;

  const formatar = (valor: number) =>
    valor.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  return (
    <div style={{ marginTop: 25 }}>
      <h2 style={{ marginBottom: 10 }}>
        Despesas Pendentes - {dados.ano}
      </h2>

      <div style={{ marginBottom: 15, fontWeight: 700 }}>
        Total Pendente Atual: {formatar(totalAtual)}
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr style={{ backgroundColor: "#111827" }}>
            <th style={thLeft}>Categoria</th>

            {mesesAbreviados.map((m) => (
              <th key={m} style={th}>{m}</th>
            ))}

            <th style={thResumo}>Total</th>
          </tr>
        </thead>

        <tbody>

          {dados.categorias?.map((categoria: string) => (
            <tr key={categoria}>
              <td style={tdLeft}>{categoria}</td>

              {dados.meses?.map((mes: string) => (
                <td key={mes} style={tdValor}>
                  {dados.valores?.[categoria]?.[mes]
                    ? formatar(dados.valores[categoria][mes])
                    : "–"}
                </td>
              ))}

              <td style={tdResumo}>
                {formatar(dados.totalPorCategoria?.[categoria] || 0)}
              </td>
            </tr>
          ))}

          <tr style={{ backgroundColor: "#1f2937", fontWeight: 700 }}>
            <td style={tdLeft}>Total Mês</td>

            {dados.meses?.map((mes: string) => (
              <td key={mes} style={tdValor}>
                {formatar(dados.totalPorMes?.[mes] || 0)}
              </td>
            ))}

            <td style={tdResumo}>
              {formatar(dados.totalGeral || 0)}
            </td>
          </tr>

        </tbody>
      </table>
    </div>
  );
}

const th = { textAlign: "right" as const, padding: "6px 8px" };
const thLeft = { textAlign: "left" as const, padding: "6px 8px" };
const thResumo = {
  textAlign: "right" as const,
  padding: "6px 12px",
  borderLeft: "2px solid #374151",
};

const tdValor = {
  textAlign: "right" as const,
  padding: "6px 8px",
  borderBottom: "1px solid #1f2937",
};

const tdLeft = {
  textAlign: "left" as const,
  padding: "6px 8px",
  borderBottom: "1px solid #1f2937",
};

const tdResumo = {
  textAlign: "right" as const,
  padding: "6px 12px",
  borderBottom: "1px solid #1f2937",
  background: "#161b22",
  fontWeight: 700,
};