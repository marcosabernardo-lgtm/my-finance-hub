import React from "react";

type Props = {
  dados: any;
};

const mesesAbreviados = [
  "Jan","Fev","Mar","Abr","Mai","Jun",
  "Jul","Ago","Set","Out","Nov","Dez"
];

export default function Cartoes({ dados }: Props) {

  if (!dados || !dados.cartoes) return null;

  const formatar = (valor: number) =>
    Number(valor || 0).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  return (
    <div style={{ marginTop: 25 }}>
      <h2 style={{ marginBottom: 15 }}>Cartões - Visão Anual</h2>

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr style={{ backgroundColor: "#111827" }}>
            <th style={thLeft}>Cartão</th>

            {mesesAbreviados.map((m) => (
              <th key={m} style={th}>{m}</th>
            ))}

            <th style={thResumo}>Total</th>
          </tr>
        </thead>

        <tbody>

          {dados.cartoes.map((cartao: any) => (
            <tr key={cartao.nomeCartao}>
              <td style={tdLeft}>{cartao.nomeCartao}</td>

              {cartao.meses.map((mes: any, index: number) => (
                <td key={index} style={tdValor}>
                  {mes.total ? formatar(mes.total) : "–"}
                </td>
              ))}

              <td style={tdResumo}>
                {formatar(cartao.totalAnual)}
              </td>
            </tr>
          ))}

          {/* TOTAL MÊS */}
          <tr style={{ backgroundColor: "#1f2937", fontWeight: 700 }}>
            <td style={tdLeft}>Total Mês</td>

            {dados.totaisPorMes.map((mes: any, index: number) => (
              <td key={index} style={tdValor}>
                {formatar(mes.total)}
              </td>
            ))}

            <td style={tdResumo}>
              {formatar(dados.totalGeral)}
            </td>
          </tr>

        </tbody>
      </table>
    </div>
  );
}

/* ===== ESTILOS ===== */

const th = {
  textAlign: "right" as const,
  padding: "6px 8px",
};

const thLeft = {
  textAlign: "left" as const,
  padding: "6px 8px",
};

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