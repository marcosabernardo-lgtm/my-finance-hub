import type { Movimentacao } from "../types/movimentacao";

type DespesaConfig = {
  Categoria: string;
  Classificação: string;
  Limite_Gastos: number;
  Exemplos: string;
};

type ControleItem = {
  categoria: string;
  limiteMensal: number;
  totalReal: number;
  limiteSemanal: number;
  divergencia: number;
  semanas: Record<number, number>;
};

type ResumoClassificacaoItem = {
  classificacao: string;
  previsto: number;
  real: number;
  divergencia: number;
  percentual: number;
};

export class FinancialService {
  private movimentacoes: Movimentacao[];
  private despesasConfig: DespesaConfig[];
  private mesSelecionado: number;
  private anoSelecionado: number;

  constructor(
    movimentacoes: Movimentacao[],
    despesasConfig: DespesaConfig[],
    mes?: number,
    ano?: number
  ) {
    const hoje = new Date();

    this.movimentacoes = movimentacoes;
    this.despesasConfig = despesasConfig;
    this.mesSelecionado =
      mes !== undefined ? mes : hoje.getMonth();
    this.anoSelecionado =
      ano !== undefined ? ano : hoje.getFullYear();
  }

  private getMesEAnoSelecionado() {
    return {
      mesAtual: this.mesSelecionado,
      anoAtual: this.anoSelecionado,
    };
  }

  // ===============================
  // RESUMO DO MÊS
  // ===============================
  public getResumoMesAtual() {
    const { mesAtual, anoAtual } =
      this.getMesEAnoSelecionado();

    let receitas = 0;
    let despesas = 0;

    for (const m of this.movimentacoes) {
      const data = m["Data do Pagamento"];
      if (!data) continue;

      if (
        data.getMonth() === mesAtual &&
        data.getFullYear() === anoAtual
      ) {
        if (m["Tipo"] === "Receita") {
          receitas += m["Valor"];
        } else if (m["Tipo"] === "Despesa") {
          despesas += m["Valor"];
        }
      }
    }

    return {
      receitas,
      despesas,
      saldo: receitas - despesas,
    };
  }

  // ===============================
  // MOVIMENTAÇÕES FILTRADAS POR MÊS
  // ===============================
  public getMovimentacoesOrdenadas() {
    const { mesAtual, anoAtual } =
      this.getMesEAnoSelecionado();

    return this.movimentacoes
      .filter((m) => {
        const data = m["Data da Movimentação"];
        if (!data) return false;

        return (
          data.getMonth() === mesAtual &&
          data.getFullYear() === anoAtual
        );
      })
      .sort(
        (a, b) =>
          Number(b.ID_Movimentacao) -
          Number(a.ID_Movimentacao)
      );
  }

  // ===============================
  // CONTROLE SEMANAL
  // ===============================
  public getControleSemanal(): ControleItem[] {
    const { mesAtual, anoAtual } =
      this.getMesEAnoSelecionado();

    const mapaCategorias: Record<string, ControleItem> =
      {};

    for (const cat of this.despesasConfig) {
      mapaCategorias[cat.Categoria] = {
        categoria: cat.Categoria,
        limiteMensal: cat.Limite_Gastos,
        totalReal: 0,
        limiteSemanal: cat.Limite_Gastos / 4.3,
        divergencia: 0,
        semanas: {
          1: 0,
          2: 0,
          3: 0,
          4: 0,
          5: 0,
        },
      };
    }

    for (const m of this.movimentacoes) {
      const data = m["Data da Movimentação"];
      if (!data) continue;

      if (
        data.getMonth() !== mesAtual ||
        data.getFullYear() !== anoAtual ||
        m["Tipo"] !== "Despesa" ||
        m["Forma de Pagamento"] !== "À Vista"
      ) {
        continue;
      }

      const item = mapaCategorias[m["Categoria"]];
      if (!item) continue;

      item.totalReal += m["Valor"];

      const primeiroDia = new Date(
        data.getFullYear(),
        data.getMonth(),
        1
      );

      const offset = primeiroDia.getDay();
      const dia = data.getDate();
      const semana =
        Math.floor((dia + offset - 1) / 7) + 1;

      if (semana >= 1 && semana <= 5) {
        item.semanas[semana] += m["Valor"];
      }
    }

    for (const categoria in mapaCategorias) {
      const item = mapaCategorias[categoria];
      item.divergencia =
        item.limiteMensal - item.totalReal;
    }

    return Object.values(mapaCategorias);
  }

  // ===============================
  // RESUMO GERENCIAL
  // ===============================
  public getResumoClassificacao(): ResumoClassificacaoItem[] {
    const { mesAtual, anoAtual } =
      this.getMesEAnoSelecionado();

    const mapa: Record<string, ResumoClassificacaoItem> =
      {};

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

    for (const m of this.movimentacoes) {
      const data = m["Data da Movimentação"];
      if (!data) continue;

      if (
        data.getMonth() !== mesAtual ||
        data.getFullYear() !== anoAtual ||
        m["Tipo"] !== "Despesa" ||
        m["Forma de Pagamento"] !== "À Vista"
      ) {
        continue;
      }

      const despConfig = this.despesasConfig.find(
        (d) => d.Categoria === m["Categoria"]
      );

      if (!despConfig) continue;

      const classificacao = despConfig.Classificação;
      mapa[classificacao].real += m["Valor"];
    }

    const totalPrevisto = Object.values(mapa).reduce(
      (acc, item) => acc + item.previsto,
      0
    );

    for (const item of Object.values(mapa)) {
      item.divergencia = item.previsto - item.real;
      item.percentual =
        totalPrevisto > 0
          ? (item.previsto / totalPrevisto) * 100
          : 0;
    }

    return Object.values(mapa);
  }

  // ===============================
  // FATURA CARTÃO (UNIFICADA COM MÊS GLOBAL)
  // ===============================
  public getFaturaCartao(cartao: string) {
    const { mesAtual, anoAtual } =
      this.getMesEAnoSelecionado();

    const mesNumero = String(mesAtual + 1).padStart(2, "0");
    const refPagamento = `${anoAtual}-${mesNumero}`;

    const resultado = this.movimentacoes.filter(
      (m) =>
        m["Método de Pagamento"] === cartao &&
        m["Ref. Pagamento"] === refPagamento
    );

    return resultado.sort((a, b) => {
      const dataA = a["Data da Movimentação"]
        ? a["Data da Movimentação"].getTime()
        : 0;
      const dataB = b["Data da Movimentação"]
        ? b["Data da Movimentação"].getTime()
        : 0;

      return dataB - dataA;
    });
  }
}