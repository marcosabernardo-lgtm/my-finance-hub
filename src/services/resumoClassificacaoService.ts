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
    const hoje = new Date();

    const mapa: Record<string, ResumoClassificacaoItem> = {};

    // ============================
    // 1️⃣ Carrega previsto
    // ============================
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

      mapa[classificacao].previsto += desp.Limite_Gastos;
    }

    // ============================
    // 2️⃣ Calcula realizado (MESMA REGRA DO CONTROLE SEMANAL)
    // ============================
    for (const m of this.movimentacoes) {
      const dataPagamento = m["Data do Pagamento"];
      if (!dataPagamento) continue;

      // ❌ Ignora mês diferente
      if (
        dataPagamento.getMonth() !== this.mesSelecionado ||
        dataPagamento.getFullYear() !== this.anoSelecionado
      )
        continue;

      // ❌ Não traz mês futuro
      if (
        this.anoSelecionado > hoje.getFullYear() ||
        (this.anoSelecionado === hoje.getFullYear() &&
          this.mesSelecionado > hoje.getMonth())
      )
        continue;

      // ❌ Não traz pagamento futuro
      if (dataPagamento > hoje) continue;

      // ❌ Só despesas
      if (m["Tipo"] !== "Despesa") continue;

      // ❌ Ignora pagamento de fatura
      if (m["Categoria"] === "Pagamento de Fatura") continue;

      // ❌ Só pago ou faturado
      if (!(m["Situação"] === "Pago" || m["Situação"] === "Faturado"))
        continue;

      const despConfig = this.despesasConfig.find(
        (d) => d.Categoria === m["Categoria"]
      );

      if (!despConfig) continue;

      mapa[despConfig.Classificação].real += m["Valor"] || 0;
    }

    const totalPrevisto = Object.values(mapa).reduce(
      (acc, item) => acc + item.previsto,
      0
    );

    // ============================
    // 3️⃣ Finaliza cálculo
    // ============================
    for (const item of Object.values(mapa)) {
      item.divergencia = item.previsto - item.real;

      item.percentual =
        totalPrevisto > 0
          ? (item.previsto / totalPrevisto) * 100
          : 0;
    }

    return Object.values(mapa);
  }
}