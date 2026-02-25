import type { Movimentacao } from "../types/movimentacao";

type Props = {
  movimentacoes: Movimentacao[];
};

export default function Movimentacoes({ movimentacoes }: Props) {
  const movimentacoesOrdenadas = [...movimentacoes].sort(
    (a, b) =>
      Number(b.ID_Movimentacao) -
      Number(a.ID_Movimentacao)
  );

  return (
    <>
      <h2 style={{ marginBottom: 20 }}>
        Todas as Movimentações
      </h2>

      {movimentacoesOrdenadas.length === 0 ? (
        <p>Nenhuma movimentação carregada.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "separate",
              borderSpacing: 0,
              fontSize: 14,
            }}
          >
            <thead>
              <tr>
                <th style={{ ...thStyle, width: "120px" }}>
                  Data
                </th>
                <th style={{ ...thStyle, width: "90px" }}>
                  Tipo
                </th>
                <th
                  style={{
                    ...thStyle,
                    width: "220px",
                  }}
                >
                  Categoria
                </th>
                <th
                  style={{
                    ...thStyle,
                    width: "160px",
                  }}
                >
                  Descrição
                </th>
                <th
                  style={{
                    ...thStyle,
                    width: "110px",
                    textAlign: "right",
                  }}
                >
                  Valor
                </th>
                <th style={{ ...thStyle, width: "150px" }}>
                  Método
                </th>
              </tr>
            </thead>

            <tbody>
              {movimentacoesOrdenadas.map((m, index) => (
                <tr
                  key={m.ID_Movimentacao}
                  style={{
                    background:
                      index % 2 === 0
                        ? "#1a1a1a"
                        : "#161616",
                  }}
                >
                  <td style={tdStyle}>
                    {m["Data do Pagamento"]
                      ? m[
                          "Data do Pagamento"
                        ].toLocaleDateString()
                      : ""}
                  </td>

                  <td style={tdStyle}>
                    {m.Tipo}
                  </td>

                  <td
                    style={{
                      ...tdStyle,
                      fontWeight: 500,
                    }}
                  >
                    {m.Categoria}
                  </td>

                  <td
                    style={{
                      ...tdStyle,
                      color: "#cfcfcf",
                    }}
                  >
                    {m.Descrição}
                  </td>

                  <td
                    style={{
                      ...tdStyle,
                      textAlign: "right",
                      fontWeight: 600,
                    }}
                  >
                    {m.Valor.toLocaleString(
                      "pt-BR",
                      {
                        style: "currency",
                        currency: "BRL",
                      }
                    )}
                  </td>

                  <td style={tdStyle}>
                    {m["Método de Pagamento"]}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

const thStyle: React.CSSProperties = {
  padding: "12px 10px",
  textAlign: "left",
  background: "#1e1e1e",
  fontWeight: 600,
  borderBottom: "1px solid #333",
};

const tdStyle: React.CSSProperties = {
  padding: "10px",
};