import { useMemo } from "react";
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

  const proximos7 = useMemo(() => {
    return financialService.getPendentesProximosDias(7);
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

      {/* INDICADORES */}
      <div
        style={{
          marginBottom: 20,
          fontWeight: 700,
          display: "flex",
          gap: 40,
        }}
      >
        <div>🔴 Vencidas: {formatar(totalAtual)}</div>
        <div>🟡 Próximos 7 dias: {formatar(proximos7)}</div>
        <div>⚪ Total pendente do ano: {formatar(dados.totalGeral)}</div>
      </div>

      {/* SCROLL DA TABELA */}
      <div
        style={{
          maxHeight: 600,
          overflow: "auto",
          border: "1px solid #1f2937"
        }}
      >

        <table
          style={{
            borderCollapse: "collapse",
            width: "100%",
            minWidth: 1100,
            fontSize: 12
          }}
        >

          <thead>

            <tr>

              <th style={thCategoria}>Categoria</th>

              {mesesAbreviados.map((m) => (
                <th key={m} style={thMes}>{m}</th>
              ))}

              <th style={thTotal}>Total</th>

            </tr>

          </thead>

          <tbody>

            {dados.categorias?.map((categoria: string) => (

              <tr key={categoria}>

                <td style={tdCategoria}>
                  {categoria}
                </td>

                {dados.meses?.map((mes: string) => (

                  <td key={mes} style={tdValor}>

                    {dados.valores?.[categoria]?.[mes]
                      ? formatar(dados.valores[categoria][mes])
                      : "–"}

                  </td>

                ))}

                <td style={tdTotal}>

                  {formatar(dados.totalPorCategoria?.[categoria] || 0)}

                </td>

              </tr>

            ))}

            {/* TOTAL DO ANO */}

            <tr style={{ background: "#1f2937", fontWeight: 700 }}>

              <td style={tdCategoria}>Total Mês</td>

              {dados.meses?.map((mes: string) => (

                <td key={mes} style={tdValor}>

                  {formatar(dados.totalPorMes?.[mes] || 0)}

                </td>

              ))}

              <td style={tdTotal}>
                {formatar(dados.totalGeral)}
              </td>

            </tr>

          </tbody>

        </table>

      </div>

    </div>
  );
}

/* ========================= */
/* ESTILOS */
/* ========================= */

const thMes = {
  position: "sticky" as const,
  top: 0,
  background: "#111827",
  textAlign: "right" as const,
  padding: "6px 8px",
  zIndex: 5
};

const thCategoria = {
  position: "sticky" as const,
  top: 0,
  left: 0,
  background: "#111827",
  textAlign: "left" as const,
  padding: "6px 8px",
  zIndex: 10
};

const thTotal = {
  position: "sticky" as const,
  top: 0,
  background: "#111827",
  textAlign: "right" as const,
  padding: "6px 12px",
  borderLeft: "2px solid #374151",
  zIndex: 6
};

const tdValor = {
  textAlign: "right" as const,
  padding: "6px 8px",
  borderBottom: "1px solid #1f2937"
};

const tdCategoria = {
  position: "sticky" as const,
  left: 0,
  background: "#161b22",
  textAlign: "left" as const,
  padding: "6px 8px",
  borderBottom: "1px solid #1f2937",
  zIndex: 4
};

const tdTotal = {
  textAlign: "right" as const,
  padding: "6px 12px",
  borderBottom: "1px solid #1f2937",
  background: "#161b22",
  fontWeight: 700
};