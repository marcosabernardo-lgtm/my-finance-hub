import React from "react";

type MesData = {
  pago: number;
  pendente: number;
  total: number;
};

type CartaoAnual = {
  nomeCartao: string;
  meses: MesData[];
  totalPago: number;
  totalPendente: number;
  totalAnual: number;
};

type Props = {
  dados: {
    cartoes: CartaoAnual[];
    totaisPorMes: MesData[];
    totalGeral: number;
    totalGeralPago: number;
    totalGeralPendente: number;
  };
};

const nomesMeses = [
  "Jan","Fev","Mar","Abr","Mai","Jun",
  "Jul","Ago","Set","Out","Nov","Dez"
];

function formatar(valor: number) {
  return valor.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export default function Cartoes({ dados }: Props) {
  const {
    cartoes,
    totaisPorMes,
    totalGeral,
    totalGeralPendente
  } = dados;

  const mesAtual = new Date().getMonth();

  return (
    <>
      {/* HEADER SUPERIOR */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 20,
        }}
      >
        <h2 style={{ margin: 0 }}>Cartões - Visão Anual</h2>

        <div
          style={{
            background: "linear-gradient(135deg,#1f1f1f,#2b2b2b)",
            padding: "12px 24px",
            borderRadius: 12,
            fontWeight: 600,
            fontSize: 18,
            color: "#ffcc00",
            boxShadow: "0 4px 12px rgba(0,0,0,0.4)"
          }}
        >
          Pendente Total: {formatar(totalGeralPendente)}
        </div>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "separate",
            borderSpacing: 0,
            fontSize: 14,
          }}
        >
          <thead>
            <tr>
              <th style={thStyleLeft}>Cartão</th>
              {nomesMeses.map((mes, index) => (
                <th
                  key={mes}
                  style={{
                    ...thStyle,
                    background:
                      index === mesAtual
                        ? "#2c2c2c"
                        : "#1e1e1e",
                  }}
                >
                  {mes}
                </th>
              ))}
              <th style={thStyle}>Total</th>
            </tr>
          </thead>

          <tbody>
            {cartoes.map((cartao, rowIndex) => (
              <tr
                key={cartao.nomeCartao}
                style={{
                  background:
                    rowIndex % 2 === 0
                      ? "#1a1a1a"
                      : "#161616",
                  transition: "0.2s",
                }}
              >
                <td style={tdLeft}>
                  {cartao.nomeCartao}
                </td>

                {cartao.meses.map((mes, index) => {
                  const somentePago =
                    mes.total > 0 && mes.pendente === 0;

                  return (
                    <td
                      key={index}
                      style={{
                        ...tdStyle,
                        opacity: somentePago ? 0.35 : 1,
                        color:
                          mes.pendente > 0
                            ? "#ffffff"
                            : "#cfcfcf",
                      }}
                    >
                      {mes.total > 0
                        ? formatar(mes.total)
                        : "-"}
                    </td>
                  );
                })}

                <td style={tdTotal}>
                  {formatar(cartao.totalAnual)}
                </td>
              </tr>
            ))}

            {/* TOTAL MÊS */}
            <tr
              style={{
                background: "#101010",
                borderTop: "2px solid #333",
                fontWeight: 600,
              }}
            >
              <td style={tdLeft}>Total Mês</td>

              {totaisPorMes.map((mes, index) => (
                <td key={index} style={tdStyle}>
                  {mes.total > 0
                    ? formatar(mes.total)
                    : "-"}
                </td>
              ))}

              <td style={tdTotal}>
                {formatar(totalGeral)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}

const thStyle: React.CSSProperties = {
  padding: "12px 10px",
  textAlign: "right",
  background: "#1e1e1e",
  fontWeight: 600,
  borderBottom: "1px solid #333",
};

const thStyleLeft: React.CSSProperties = {
  ...thStyle,
  textAlign: "left",
};

const tdStyle: React.CSSProperties = {
  padding: "10px",
  textAlign: "right",
};

const tdLeft: React.CSSProperties = {
  ...tdStyle,
  textAlign: "left",
  fontWeight: 500,
};

const tdTotal: React.CSSProperties = {
  ...tdStyle,
  fontWeight: 600,
  color: "#ffffff",
};