import React from "react";

type Props = {
  dados: {
    receitas: Record<string, number[]>;
    despesas: Record<string, number[]>;
    totalReceitas: number[];
    totalDespesas: number[];
    saldoMensal: number[];
    saldoTotal: number;
  };
};

const nomesMeses = [
  "Jan","Fev","Mar","Abr","Mai","Jun",
  "Jul","Ago","Set","Out","Nov","Dez",
];

export default function DRE({ dados }: Props) {

  const formatarMoeda = (valor: number) =>
    valor.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const totalLinha = (valores: number[]) =>
    valores.reduce((a, b) => a + b, 0);

  const mediaLinha = (valores: number[]) =>
    totalLinha(valores) / 12;

  const renderLinha = (
    nome: string,
    valores: number[],
    destaque?: boolean
  ) => {

    const total = totalLinha(valores);
    const media = mediaLinha(valores);

    return (
      <tr
        style={{
          fontWeight: destaque ? 700 : 400,
          backgroundColor: destaque ? "#1f2937" : "transparent",
        }}
      >
        <td style={tdCategoria}>{nome}</td>

        {valores.map((v, i) => (
          <td key={i} style={tdMes}>
            {v !== 0 ? formatarMoeda(v) : "–"}
          </td>
        ))}

        <td style={tdResumo}>{formatarMoeda(media)}</td>
        <td style={tdResumoTotal}>{formatarMoeda(total)}</td>
      </tr>
    );
  };

  return (
    <div style={{ marginTop: 25 }}>
      <h2 style={{ marginBottom: 15 }}>DRE Anual</h2>

      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: 12,
        }}
      >
        <thead>
          <tr style={{ backgroundColor: "#111827" }}>
            <th style={thCategoria}>Categoria</th>

            {nomesMeses.map((m) => (
              <th key={m} style={thMes}>{m}</th>
            ))}

            <th style={thResumo}>Média</th>
            <th style={thResumoTotal}>Total</th>
          </tr>
        </thead>

        <tbody>

          {/* RECEITAS */}
          <tr>
            <td colSpan={15} style={secaoReceita}>
              RECEITAS
            </td>
          </tr>

          {Object.entries(dados.receitas).map(
            ([categoria, valores]) =>
              renderLinha(categoria, valores)
          )}

          {renderLinha("Total Receitas", dados.totalReceitas, true)}

          {/* DESPESAS */}
          <tr>
            <td colSpan={15} style={secaoDespesa}>
              DESPESAS
            </td>
          </tr>

          {Object.entries(dados.despesas).map(
            ([categoria, valores]) =>
              renderLinha(categoria, valores)
          )}

          {renderLinha("Total Despesas", dados.totalDespesas, true)}

          {/* RESULTADO */}
          <tr>
            <td colSpan={15} style={secaoResultado}>
              RESULTADO
            </td>
          </tr>

          {renderLinha("Saldo Mensal", dados.saldoMensal, true)}

          <tr style={{ backgroundColor: "#111827", fontWeight: 700 }}>
            <td style={{ padding: 6 }}>Saldo Total</td>
            <td colSpan={13}></td>
            <td
              style={{
                ...tdResumoTotal,
                color: dados.saldoTotal < 0 ? "#EF4444" : "#10B981",
              }}
            >
              {formatarMoeda(dados.saldoTotal)}
            </td>
          </tr>

        </tbody>
      </table>
    </div>
  );
}

/* ===== ESTILOS ===== */

const thCategoria: React.CSSProperties = {
  textAlign: "left",
  padding: "6px 8px",
};

const thMes: React.CSSProperties = {
  textAlign: "right",
  padding: "6px 8px",
};

const thResumo: React.CSSProperties = {
  textAlign: "right",
  padding: "6px 12px",
  borderLeft: "2px solid #374151",
};

const thResumoTotal: React.CSSProperties = {
  textAlign: "right",
  padding: "6px 14px",
  borderLeft: "1px solid #374151",
};

const tdCategoria: React.CSSProperties = {
  padding: "6px 8px",
  borderBottom: "1px solid #1f2937",
};

const tdMes: React.CSSProperties = {
  padding: "6px 8px",
  textAlign: "right",
  borderBottom: "1px solid #1f2937",
};

const tdResumo: React.CSSProperties = {
  padding: "6px 12px",
  textAlign: "right",
  borderBottom: "1px solid #1f2937",
  background: "#161b22",
};

const tdResumoTotal: React.CSSProperties = {
  padding: "6px 14px",
  textAlign: "right",
  borderBottom: "1px solid #1f2937",
  background: "#1c2128",
  fontWeight: 700,
};

const secaoReceita: React.CSSProperties = {
  paddingTop: 15,
  fontWeight: 700,
  color: "#10B981",
};

const secaoDespesa: React.CSSProperties = {
  paddingTop: 20,
  fontWeight: 700,
  color: "#EF4444",
};

const secaoResultado: React.CSSProperties = {
  paddingTop: 20,
  fontWeight: 700,
};