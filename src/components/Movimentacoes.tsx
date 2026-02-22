import type { Movimentacao } from "../types/movimentacao";

type Props = {
  movimentacoes: Movimentacao[];
};

export default function Movimentacoes({ movimentacoes }: Props) {
  const movimentacoesOrdenadas = [...movimentacoes].sort(
    (a, b) => Number(b.ID_Movimentacao) - Number(a.ID_Movimentacao)
  );

  return (
    <>
      <h2>Todas as Movimentações</h2>

      {movimentacoesOrdenadas.length === 0 ? (
        <p>Nenhuma movimentação carregada.</p>
      ) : (
        <table style={{ width: "100%", marginTop: 20 }}>
          <thead>
            <tr>
              <th>Data_Pagamento</th>
              <th>Tipo</th>
              <th>Categoria</th>
              <th>Descrição</th>
              <th>Valor</th>
              <th>Método</th>
            </tr>
          </thead>
          <tbody>
            {movimentacoesOrdenadas.map((m) => (
              <tr key={m.ID_Movimentacao}>
                <td>
                  {m["Data do Pagamento"]
                    ? m["Data do Pagamento"].toLocaleDateString()
                    : ""}
                </td>
                <td>{m.Tipo}</td>
                <td>{m.Categoria}</td>
                <td>{m.Descrição}</td>
                <td>R$ {m.Valor.toFixed(2)}</td>
                <td>{m["Método de Pagamento"]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}