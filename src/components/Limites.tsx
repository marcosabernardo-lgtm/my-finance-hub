import React from "react";

type DespesaConfig = {
  Categoria: string;
  Classificação: string;
  Limite_Gastos: number;
  Exemplos: string;
};

type Props = {
  despesasConfig: DespesaConfig[];
};

export default function Limites({ despesasConfig }: Props) {
  const formatarMoeda = (valor: number) =>
    valor.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });

  return (
    <div style={{ marginTop: 30 }}>
      <h2 style={{ marginBottom: 15 }}>Limites de Gastos</h2>

      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: "14px",
        }}
      >
        <thead style={{ backgroundColor: "#111827" }}>
          <tr>
            <th style={thStyle}>Categoria</th>
            <th style={thStyle}>Classificação</th>
            <th style={thStyle}>Limite</th>
            <th style={thStyle}>Exemplos</th>
          </tr>
        </thead>

        <tbody>
          {despesasConfig.map((item, index) => (
            <tr key={index}>
              <td style={tdStyle}>{item.Categoria}</td>
              <td style={tdStyle}>{item.Classificação}</td>
              <td style={{ ...tdStyle, textAlign: "right" }}>
                {formatarMoeda(item.Limite_Gastos)}
              </td>
              <td style={tdStyle}>{item.Exemplos}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: "10px",
  textAlign: "left",
  borderBottom: "1px solid #1f2937",
  fontWeight: 600,
};

const tdStyle: React.CSSProperties = {
  padding: "8px",
  borderBottom: "1px solid #1f2937",
};