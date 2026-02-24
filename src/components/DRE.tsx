import React from "react";

type Props = {
  dados: {
    receitas: Record<string, number[]>;
    despesas: Record<string, number[]>;
    totalReceitas: number[];
    totalDespesas: number[];
    saldoMensal: number[];
    mediaReceita: number;
    mediaDespesa: number;
    saldoTotal: number;
  };
};

const nomesMeses = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
];

export default function DRE({ dados }: Props) {
  const formatarMoeda = (valor: number) =>
    valor.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });

  const calcularTotalLinha = (valores: number[]) =>
    valores.reduce((a, b) => a + b, 0);

  const calcularMediaLinha = (valores: number[]) =>
    calcularTotalLinha(valores) / 12;

  const renderLinha = (
    nome: string,
    valores: number[],
    destaque?: boolean
  ) => (
    <tr
      style={{
        fontWeight: destaque ? 700 : 400,
        backgroundColor: destaque ? "#1f2937" : "transparent",
      }}
    >
      <td style={{ textAlign: "left", padding: "6px 10px" }}>
        {nome}
      </td>

      {valores.map((v, i) => (
        <td key={i} style={{ textAlign: "right" }}>
          {v !== 0 ? formatarMoeda(v) : "-"}
        </td>
      ))}

      <td style={{ textAlign: "right" }}>
        {formatarMoeda(calcularMediaLinha(valores))}
      </td>

      <td style={{ textAlign: "right" }}>
        {formatarMoeda(calcularTotalLinha(valores))}
      </td>
    </tr>
  );

  return (
    <div style={{ marginTop: 30 }}>
      <h2>DRE Anual</h2>

      <div style={{ overflowX: "auto" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 13,
          }}
        >
          <thead>
            <tr style={{ backgroundColor: "#111827" }}>
              <th style={{ textAlign: "left", padding: 10 }}>
                Categoria
              </th>
              {nomesMeses.map((m) => (
                <th key={m}>{m}</th>
              ))}
              <th>Média</th>
              <th>Total</th>
            </tr>
          </thead>

          <tbody>
            {/* RECEITAS */}
            <tr>
              <td
                colSpan={15}
                style={{
                  paddingTop: 15,
                  fontWeight: 700,
                  color: "#10B981",
                }}
              >
                RECEITAS
              </td>
            </tr>

            {Object.entries(dados.receitas).map(
              ([categoria, valores]) =>
                renderLinha(categoria, valores)
            )}

            {renderLinha(
              "Total Receitas",
              dados.totalReceitas,
              true
            )}

            {/* DESPESAS */}
            <tr>
              <td
                colSpan={15}
                style={{
                  paddingTop: 20,
                  fontWeight: 700,
                  color: "#EF4444",
                }}
              >
                DESPESAS
              </td>
            </tr>

            {Object.entries(dados.despesas).map(
              ([categoria, valores]) =>
                renderLinha(categoria, valores)
            )}

            {renderLinha(
              "Total Despesas",
              dados.totalDespesas,
              true
            )}

            {/* RESULTADO */}
            <tr>
              <td
                colSpan={15}
                style={{
                  paddingTop: 20,
                  fontWeight: 700,
                }}
              >
                RESULTADO
              </td>
            </tr>

            {renderLinha(
              "Saldo Mensal",
              dados.saldoMensal,
              true
            )}

            <tr
              style={{
                fontWeight: 700,
                backgroundColor: "#111827",
              }}
            >
              <td style={{ padding: 8 }}>Saldo Total</td>
              <td colSpan={13}></td>
              <td style={{ textAlign: "right" }}>
                {formatarMoeda(dados.saldoTotal)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}