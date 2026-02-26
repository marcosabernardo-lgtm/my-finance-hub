import React from "react";

type ResumoClassificacaoItem = {
  classificacao: string;
  previsto: number;
  real: number;
  divergencia: number;
  percentual: number;
};

type Props = {
  dados: ResumoClassificacaoItem[];
};

export default function ResumoClassificacao({ dados }: Props) {

  const formatarMoeda = (valor: number) =>
    valor.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const totalPrevisto = dados.reduce(
    (acc, item) => acc + item.previsto,
    0
  );

  const totalReal = dados.reduce(
    (acc, item) => acc + item.real,
    0
  );

  return (
    <div style={{ marginTop: 25 }}>
      <h2 style={{ marginBottom: 15 }}>Resumo Gerencial</h2>

      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: 12,
        }}
      >
        <thead>
          <tr style={{ backgroundColor: "#111827" }}>
            <th style={thCategoria}>Classificação</th>
            <th style={thValor}>Previsto</th>
            <th style={thValor}>%</th>
            <th style={thValor}>Real</th>
            <th style={thValor}>Divergência</th>
          </tr>
        </thead>

        <tbody>
          {dados.map((item) => (
            <tr key={item.classificacao}>
              <td style={tdCategoria}>
                {item.classificacao}
              </td>

              <td style={tdValor}>
                {formatarMoeda(item.previsto)}
              </td>

              <td style={tdValor}>
                {item.percentual.toFixed(1)}%
              </td>

              <td style={tdValor}>
                {formatarMoeda(item.real)}
              </td>

              <td
                style={{
                  ...tdValor,
                  color:
                    item.divergencia < 0
                      ? "#EF4444"
                      : "#10B981",
                  fontWeight: 600,
                }}
              >
                {formatarMoeda(item.divergencia)}
              </td>
            </tr>
          ))}

          {/* TOTAL */}
          <tr
            style={{
              backgroundColor: "#1f2937",
              fontWeight: 700,
            }}
          >
            <td style={tdCategoria}>TOTAL</td>
            <td style={tdValor}>
              {formatarMoeda(totalPrevisto)}
            </td>
            <td style={tdValor}>100%</td>
            <td style={tdValor}>
              {formatarMoeda(totalReal)}
            </td>
            <td style={tdValor}>
              {formatarMoeda(totalPrevisto - totalReal)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/* ===== ESTILO IGUAL AO DRE ===== */

const thCategoria: React.CSSProperties = {
  textAlign: "left",
  padding: "6px 8px",
};

const thValor: React.CSSProperties = {
  textAlign: "right",
  padding: "6px 8px",
};

const tdCategoria: React.CSSProperties = {
  padding: "6px 8px",
  borderBottom: "1px solid #1f2937",
};

const tdValor: React.CSSProperties = {
  padding: "6px 8px",
  textAlign: "right",
  borderBottom: "1px solid #1f2937",
};