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

  function estiloDivergencia(valor: number): React.CSSProperties {
    if (valor < 0) {
      return {
        backgroundColor: "#7f1d1d",
        color: "#ffffff",
        fontWeight: "bold",
      };
    }

    if (valor > 0) {
      return {
        backgroundColor: "#064e3b",
        color: "#ffffff",
        fontWeight: "bold",
      };
    }

    return {};
  }

  function estiloSemana(
    valor: number,
    limiteSemanal: number
  ): React.CSSProperties {
    if (valor === 0) return {};

    if (valor > limiteSemanal) {
      return {
        backgroundColor: "#7f1d1d",
        color: "#ffffff",
        fontWeight: "bold",
      };
    }

    return {
      backgroundColor: "#064e3b",
      color: "#ffffff",
      fontWeight: "bold",
    };
  }

  return (
    <>
      <h2 style={{ marginBottom: 15 }}>
        Controle Semanal
      </h2>

      <table
        style={{
          width: "100%",
          borderCollapse: "separate",
          borderSpacing: "14px 6px",
          fontSize: "13px",
        }}
      >
        <thead>
          <tr>
            <th>Categoria</th>
            <th>Limite Mensal</th>
            <th>Real</th>
            <th>Divergência</th>
            <th>Limite Semanal</th>
            <th>Semana 1</th>
            <th>Semana 2</th>
            <th>Semana 3</th>
            <th>Semana 4</th>
            <th>Semana 5</th>
          </tr>
        </thead>

        <tbody>
          {controleData.map((item) => (
            <tr key={item.categoria}>
              <td>{item.categoria}</td>

              <td style={{ textAlign: "right" }}>
                {formatarMoeda(item.limiteMensal)}
              </td>

              <td
                style={{
                  textAlign: "right",
                  ...estiloSemana(
                    item.totalReal,
                    item.limiteSemanal
                  ),
                }}
              >
                {formatarMoeda(item.totalReal)}
              </td>

              <td
                style={{
                  textAlign: "right",
                  ...estiloDivergencia(
                    item.divergencia
                  ),
                }}
              >
                {formatarMoeda(item.divergencia)}
              </td>

              <td style={{ textAlign: "right" }}>
                {formatarMoeda(item.limiteSemanal)}
              </td>

              {[1, 2, 3, 4, 5].map((s) => (
                <td
                  key={s}
                  style={{
                    textAlign: "right",
                    ...estiloSemana(
                      item.semanas[s],
                      item.limiteSemanal
                    ),
                  }}
                >
                  {formatarMoeda(item.semanas[s])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}