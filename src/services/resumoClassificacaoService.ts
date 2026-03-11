import type { Movimentacao } from "../types/movimentacao";

type DespesaConfig = {
  Categoria: string;
  Classificação: string;
  Limite_Gastos: number;
  Exemplos: string;
};

type ResumoItem = {
  classificacao: string;
  previsto: number;
  percentual: number;
  real: number;
  divergencia: number;
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

  public getResumoClassificacao(): ResumoItem[] {

    const mapaClassificacao: Record<string, ResumoItem> = {};

    let totalPrevisto = 0;

    /* ======================
       PREVISTO
    ====================== */

    for (const cfg of this.despesasConfig) {

      const classe = cfg.Classificação?.trim();

      if (!classe) continue;

      if (!mapaClassificacao[classe]) {
        mapaClassificacao[classe] = {
          classificacao: classe,
          previsto: 0,
          percentual: 0,
          real: 0,
          divergencia: 0
        };
      }

      mapaClassificacao[classe].previsto += cfg.Limite_Gastos;
      totalPrevisto += cfg.Limite_Gastos;
    }

    /* ======================
       REAL
       (MESMA REGRA DO SEMANAL)
    ====================== */

    for (const mov of this.movimentacoes) {

      const data = mov["Data da Movimentação"];

      if (!data) continue;

      if (
        data.getMonth() !== this.mesSelecionado ||
        data.getFullYear() !== this.anoSelecionado
      ) continue;

      if (mov["Tipo"] !== "Despesa") continue;

      if (mov["Categoria"] === "Pagamento de Fatura") continue;

      const situacao = mov["Situação"]?.trim();

      // MESMA REGRA DO CONTROLE SEMANAL
      if (situacao === "Faturado") continue;
      if (situacao === "Previsto") continue;

      const categoria = mov["Categoria"];

      const config = this.despesasConfig.find(
        c => c.Categoria === categoria
      );

      if (!config) continue;

      const classe = config.Classificação?.trim();

      if (!classe) continue;

      const valor = Number(mov["Valor"]) || 0;

      mapaClassificacao[classe].real += valor;
    }

    /* ======================
       CALCULOS
    ====================== */

    const lista = Object.values(mapaClassificacao);

    for (const item of lista) {

      item.divergencia = item.previsto - item.real;

      item.percentual = totalPrevisto
        ? (item.previsto / totalPrevisto) * 100
        : 0;

    }

    /* ======================
       TOTAL
    ====================== */

    const totalReal = lista.reduce(
      (s, i) => s + i.real,
      0
    );

    const totalDivergencia = lista.reduce(
      (s, i) => s + i.divergencia,
      0
    );

    lista.push({
      classificacao: "TOTAL",
      previsto: totalPrevisto,
      percentual: 100,
      real: totalReal,
      divergencia: totalDivergencia
    });

    return lista;
  }
}