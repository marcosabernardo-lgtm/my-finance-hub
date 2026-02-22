import type { Movimentacao } from "../types/movimentacao";

type DespesaConfig = {
  Categoria: string;
  Classificação: string;
  Limite_Gastos: number | string;
  Exemplos: string;
};

type Props = {
  movimentacoes: Movimentacao[];
  despesasConfig: DespesaConfig[];
};

export default function ResumoClassificacao({
  movimentacoes,
  despesasConfig,
}: Props) {
  const hoje = new Date();
  const mesAtual = hoje.getMonth();
  const anoAtual = hoje.getFullYear();

  const formatarMoeda = (valor: number) =>
    valor.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });

  const converterLimite = (valor: number | string): number => {
    if (typeof valor === "number") return valor;

    return (
      parseFloat(
        String(valor)
          .replace("R$", "")
          .replace(/\./g, "")
          .replace(",", ".")
          .trim()
      ) || 0
    );
  };

  const dadosMes = movimentacoes.filter((mov) => {
    const dataMov = mov["Data da Movimentação"];
    if (!dataMov) return false;

    const data =
      dataMov instanceof Date ? dataMov : new Date(dataMov as any);

    return (
      mov.Tipo === "Despesa" &&
      mov["Forma de Pagamento"] === "À Vista" &&
      data.getMonth() === mesAtual &&
      data.getFullYear() === anoAtual
    );
  });

  const mapa: Record<string, { previsto: number; real: number }> = {};

  despesasConfig.forEach((config) => {
    const classificacao = config.Classificação;

    if (!mapa[classificacao]) {
      mapa[classificacao] = { previsto: 0, real: 0 };
    }

    const limiteNumerico = converterLimite(config.Limite_Gastos);
    mapa[classificacao].previsto += limiteNumerico;

    const totalRealCategoria = dadosMes
      .filter((mov) => mov.Categoria === config.Categoria)
      .reduce((acc, mov) => acc + (mov.Valor || 0), 0);

    mapa[classificacao].real += totalRealCategoria;
  });

  const totalPrevisto = Object.values(mapa).reduce(
    (acc, item) => acc + item.previsto,
    0
  );

  const totalReal = Object.values(mapa).reduce(
    (acc, item) => acc + item.real,
    0
  );

  const grupos = Object.entries(mapa).map(
    ([classificacao, valores]) => ({
      classificacao,
      previsto: valores.previsto,
      real: valores.real,
      divergencia: valores.previsto - valores.real,
      percPrevisto: totalPrevisto
        ? (valores.previsto / totalPrevisto) * 100
        : 0,
      percReal: totalReal
        ? (valores.real / totalReal) * 100
        : 0,
    })
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
            <th>%</th>
            <th>Divergência</th>
          </tr>
        </thead>
        <tbody>
          {grupos.map((item) => (
            <tr key={item.classificacao}>
              <td>{item.classificacao}</td>
              <td>{formatarMoeda(item.previsto)}</td>
              <td>{item.percPrevisto.toFixed(1)}%</td>
              <td>{formatarMoeda(item.real)}</td>
              <td>{item.percReal.toFixed(1)}%</td>
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
            <td>100%</td>
            <td>{formatarMoeda(totalPrevisto - totalReal)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}