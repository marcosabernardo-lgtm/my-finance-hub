type DespesaConfig = {
  Categoria: string;
  Classificação: string;
  Limite_Gastos: number;
  Exemplos: string;
};

type Props = {
  despesasConfig: DespesaConfig[];
};

export default function Limites({ despesasConfig }: Props) {
  return (
    <>
      <h2>Limites de Gastos</h2>

      {despesasConfig.length === 0 ? (
        <p>Nenhuma configuração carregada.</p>
      ) : (
        <table style={{ width: "100%", marginTop: 20 }}>
          <thead>
            <tr>
              <th>Categoria</th>
              <th>Classificação</th>
              <th>Limite</th>
              <th>Exemplos</th>
            </tr>
          </thead>
          <tbody>
            {despesasConfig.map((d, i) => (
              <tr key={i}>
                <td>{d.Categoria}</td>
                <td>{d.Classificação}</td>
                <td>R$ {d.Limite_Gastos.toFixed(2)}</td>
                <td>{d.Exemplos}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
