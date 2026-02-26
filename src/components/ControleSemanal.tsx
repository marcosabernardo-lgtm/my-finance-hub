import React from "react";

type ControleItem = {
  categoria: string;
  limiteMensal: number;
  totalReal: number;
  limiteSemanal: number;
  divergencia: number;
  semanas: Record<number, number>;
};

type Props = {
  controleData: ControleItem[];
};

export default function ControleSemanal({ controleData }: Props) {
  const formatarMoeda = (valor: number) =>
    valor.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });

  return (
    <div style={{ marginTop: 30 }}>
      <h2 style={{ marginBottom: 15 }}>Controle Semanal</h2>

      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          marginTop: 10,
          fontSize: "13px", // 👈 Fonte reduzida
        }}
      >
        <thead style={{ backgroundColor: "#111827" }}>
          <tr>
            {[
              "Categoria",
              "Limite Mensal",
              "Real",
              "Divergência",
              "Limite Semanal",
              "Semana 1",
              "Semana 2",
              "Semana 3",
              "Semana 4",
              "Semana 5",
            ].map((col) => (
              <th
                key={col}
                style={{
                  padding: "8px 6px",
                  textAlign: "left",
                  borderBottom: "1px solid #1f2937",
                  fontWeight: 600,
                }}
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {controleData.map((item, index) => {
            const isTotal = item.categoria === "TOTAL";

            return (
              <tr
                key={index}
                style={{
                  backgroundColor: isTotal ? "#1f2937" : "transparent",
                  fontWeight: isTotal ? "bold" : "normal",
                }}
              >
                <td style={{ padding: "6px", borderBottom: "1px solid #1f2937" }}>
                  {item.categoria}
                </td>

                <td style={{ padding: "6px", borderBottom: "1px solid #1f2937" }}>
                  {formatarMoeda(item.limiteMensal)}
                </td>

                <td
                  style={{
                    padding: "6px",
                    borderBottom: "1px solid #1f2937",
                    color: item.totalReal > 0 ? "#EF4444" : "#10B981",
                  }}
                >
                  {formatarMoeda(item.totalReal)}
                </td>

                <td
                  style={{
                    padding: "6px",
                    borderBottom: "1px solid #1f2937",
                    color:
                      item.divergencia >= 0 ? "#10B981" : "#EF4444",
                  }}
                >
                  {formatarMoeda(item.divergencia)}
                </td>

                <td style={{ padding: "6px", borderBottom: "1px solid #1f2937" }}>
                  {formatarMoeda(item.limiteSemanal)}
                </td>

                {[1, 2, 3, 4, 5].map((semana) => {
                  const valor = item.semanas[semana];

                  return (
                    <td
                      key={semana}
                      style={{
                        padding: "6px",
                        borderBottom: "1px solid #1f2937",
                        color: valor > 0 ? "#EF4444" : "inherit",
                      }}
                    >
                      {formatarMoeda(valor)}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}