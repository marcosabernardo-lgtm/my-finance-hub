import React from "react";

type ResumoData = {
  receitas: number;
  despesas: number;
  saldo: number;
};

type Props = {
  resumoData: ResumoData;
};

export default function Resumo({ resumoData }: Props) {
  const { receitas, despesas, saldo } = resumoData;

  const formatarMoeda = (valor: number) =>
    valor.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });

  const cardStyle = (
    background: string
  ): React.CSSProperties => ({
    background,
    padding: "20px",
    borderRadius: "12px",
    minWidth: "250px",
    boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
  });

  return (
    <>
      <h2 style={{ marginBottom: 20 }}>
        Resumo do Mês Atual
      </h2>

      <div
        style={{
          display: "flex",
          gap: "20px",
          flexWrap: "wrap",
        }}
      >
        <div style={cardStyle("#1f2937")}>
          <p style={{ opacity: 0.7 }}>Receitas</p>
          <h2 style={{ color: "#22c55e" }}>
            {formatarMoeda(receitas)}
          </h2>
        </div>

        <div style={cardStyle("#1f2937")}>
          <p style={{ opacity: 0.7 }}>Despesas</p>
          <h2 style={{ color: "#ef4444" }}>
            {formatarMoeda(despesas)}
          </h2>
        </div>

        <div
          style={cardStyle(
            saldo >= 0 ? "#064e3b" : "#7f1d1d"
          )}
        >
          <p style={{ opacity: 0.8 }}>Saldo</p>
          <h2
            style={{
              color: "#ffffff",
              fontWeight: "bold",
            }}
          >
            {formatarMoeda(saldo)}
          </h2>
        </div>
      </div>
    </>
  );
}