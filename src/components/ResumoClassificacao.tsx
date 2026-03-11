import { useMemo } from "react";
import { FinancialService } from "../services/financialService";

type Props = {
  financialService?: FinancialService;
};

type ItemResumo = {
  classificacao: string;
  previsto: number;
  percentual: number;
  real: number;
  divergencia: number;
};

export default function ResumoClassificacao({ financialService }: Props) {

  const dados: ItemResumo[] = useMemo(() => {

    if (!financialService) return [];

    return financialService.getResumoClassificacao();

  }, [financialService]);

  const formatar = (valor: number) =>
    valor.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  if (!financialService) {
    return (
      <div style={{ marginTop: 20 }}>
        Serviço financeiro não carregado.
      </div>
    );
  }

  return (
    <div style={{ marginTop: 25 }}>

      <h2 style={{ marginBottom: 10 }}>
        Resumo Gerencial
      </h2>

      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: 12,
        }}
      >

        <thead>
          <tr style={{ backgroundColor: "#111827" }}>

            <th style={thLeft}>Classificação</th>
            <th style={th}>Previsto</th>
            <th style={th}>%</th>
            <th style={th}>Real</th>
            <th style={th}>Divergência</th>

          </tr>
        </thead>

        <tbody>

          {dados.map((item) => {

            const isTotal =
              item.classificacao === "TOTAL";

            return (
              <tr
                key={item.classificacao}
                style={{
                  fontWeight: isTotal ? 700 : 400,
                  backgroundColor: isTotal
                    ? "#1f2937"
                    : "transparent",
                }}
              >

                <td style={tdLeft}>
                  {item.classificacao}
                </td>

                <td style={tdValor}>
                  {formatar(item.previsto)}
                </td>

                <td style={tdValor}>
                  {item.percentual.toFixed(1)}%
                </td>

                <td style={tdValor}>
                  {formatar(item.real)}
                </td>

                <td
                  style={{
                    ...tdValor,
                    color:
                      item.divergencia < 0
                        ? "#EF4444"
                        : "#10B981",
                  }}
                >
                  {formatar(item.divergencia)}
                </td>

              </tr>
            );

          })}

        </tbody>

      </table>

    </div>
  );
}

/* ESTILOS */

const th = {
  textAlign: "right" as const,
  padding: "6px 8px",
};

const thLeft = {
  textAlign: "left" as const,
  padding: "6px 8px",
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