type ResumoClassificacaoItem = {
  classificacao: string;
  previsto: number;
  real: number;
  divergencia: number;
  percentual: number;
};

type Props = {
  dados: ResumoClassificacaoItem[];
};

export default function ResumoClassificacao({ dados }: Props) {
  const formatarMoeda = (valor: number) =>
    valor.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });

  const totalPrevisto = dados.reduce(
    (acc, item) => acc + item.previsto,
    0
  );

  const totalReal = dados.reduce(
    (acc, item) => acc + item.real,
    0
  );

  return (
    <div style={{ marginTop: 30 }}>
      <h2>Resumo Gerencial</h2>

      <table style={{ width: "100%", fontSize: "13px" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left" }}>Classificação</th>
            <th>Previsto</th>
            <th>%</th>
            <th>Real</th>
            <th>Divergência</th>
          </tr>
        </thead>
        <tbody>
          {dados.map((item) => (
            <tr key={item.classificacao}>
              <td>{item.classificacao}</td>
              <td>{formatarMoeda(item.previsto)}</td>
              <td>{item.percentual.toFixed(1)}%</td>
              <td>{formatarMoeda(item.real)}</td>
              <td
                style={{
                  color: item.divergencia < 0 ? "#EF4444" : "#10B981",
                  fontWeight: 600,
                }}
              >
                {formatarMoeda(item.divergencia)}
              </td>
            </tr>
          ))}

          <tr style={{ fontWeight: 700 }}>
            <td>TOTAL</td>
            <td>{formatarMoeda(totalPrevisto)}</td>
            <td>100%</td>
            <td>{formatarMoeda(totalReal)}</td>
            <td>{formatarMoeda(totalPrevisto - totalReal)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}