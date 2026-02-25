import type { Movimentacao } from "../types/movimentacao";

type DespesaConfig = {
  Categoria: string;
  Classificação: string;
  Limite_Gastos: number;
  Exemplos: string;
};

type ResumoClassificacaoItem = {
  classificacao: string;
  previsto: number;
  real: number;
  divergencia: number;
  percentual: number;
};

export class ResumoClassificacaoService {
  private movimentacoes: Movimentacao[];
  private despesasConfig: DespesaConfig[];
  private mesSelecionado: number;
  private anoSelecionado: number;

  constructor(
    movimentacoes: Movimentacao[],
    despesasConfig: DespesaConfig[],
    mesSelecionado: number,
    anoSelecionado: number
  ) {
    this.movimentacoes = movimentacoes;
    this.despesasConfig = despesasConfig;
    this.mesSelecionado = mesSelecionado;
    this.anoSelecionado = anoSelecionado;
  }

  public getResumoClassificacao(): ResumoClassificacaoItem[] {
    const mapa: Record<string, ResumoClassificacaoItem> = {};

    // 1️⃣ Carrega previsto
    for (const desp of this.despesasConfig) {
      const classificacao = desp.Classificação;

      if (!mapa[classificacao]) {
        mapa[classificacao] = {
          classificacao,
          previsto: 0,
          real: 0,
          divergencia: 0,
          percentual: 0,
        };
      }

      mapa[classificacao].previsto +=
        desp.Limite_Gastos;
    }

    // 2️⃣ Calcula realizado
    for (const m of this.movimentacoes) {
      const data = m["Data da Movimentação"];
      if (!data) continue;

      if (
        data.getMonth() !== this.mesSelecionado ||
        data.getFullYear() !== this.anoSelecionado ||
        m["Tipo"] !== "Despesa" ||
        m["Forma de Pagamento"] !== "À Vista"
      )
        continue;

      const despConfig =
        this.despesasConfig.find(
          (d) =>
            d.Categoria === m["Categoria"]
        );

      if (!despConfig) continue;

      mapa[despConfig.Classificação].real +=
        m["Valor"];
    }

    const totalPrevisto = Object.values(mapa).reduce(
      (acc, item) => acc + item.previsto,
      0
    );

    // 3️⃣ Finaliza cálculo
    for (const item of Object.values(mapa)) {
      item.divergencia =
        item.previsto - item.real;

      item.percentual =
        totalPrevisto > 0
          ? (item.previsto /
              totalPrevisto) *
            100
          : 0;
    }

    return Object.values(mapa);
  }
}