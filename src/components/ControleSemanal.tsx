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

      {/* CONTAINER COM SCROLL */}
      <div
        style={{
          maxHeight: 550,
          overflowY: "auto",
          border: "1px solid #1f2937",
        }}
      >

        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: "13px",
          }}
        >

          <thead>
            <tr
              style={{
                backgroundColor: "#111827",
                position: "sticky",
                top: 0,
                zIndex: 10,
              }}
            >
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

              const ultrapassou = item.totalReal > item.limiteMensal;

              return (
                <tr
                  key={index}
                  style={{
                    backgroundColor: isTotal ? "#1f2937" : "transparent",
                    fontWeight: isTotal ? "bold" : "normal",
                  }}
                >

                  {/* CATEGORIA */}
                  <td style={td}>
                    {item.categoria}
                  </td>

                  {/* LIMITE MENSAL */}
                  <td style={td}>
                    {formatarMoeda(item.limiteMensal)}
                  </td>

                  {/* REAL */}
                  <td
                    style={{
                      ...td,
                      color: ultrapassou ? "#EF4444" : "#10B981",
                      fontWeight: 600,
                    }}
                  >
                    {formatarMoeda(item.totalReal)}
                  </td>

                  {/* DIVERGÊNCIA */}
                  <td
                    style={{
                      ...td,
                      color:
                        item.divergencia >= 0
                          ? "#10B981"
                          : "#EF4444",
                      fontWeight: 600,
                    }}
                  >
                    {formatarMoeda(item.divergencia)}
                  </td>

                  {/* LIMITE SEMANAL */}
                  <td style={td}>
                    {formatarMoeda(item.limiteSemanal)}
                  </td>

                  {/* SEMANAS */}
                  {[1, 2, 3, 4, 5].map((semana) => {

                    const valor = item.semanas[semana];

                    return (
                      <td
                        key={semana}
                        style={{
                          ...td,
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
    </div>
  );
}

const td: React.CSSProperties = {
  padding: "6px",
  borderBottom: "1px solid #1f2937",
};