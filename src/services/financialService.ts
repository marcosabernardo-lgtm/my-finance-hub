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

type DREAnual = {
  receitas: Record<string, number[]>;
  despesas: Record<string, number[]>;
  totalReceitas: number[];
  totalDespesas: number[];
  saldoMensal: number[];
  mediaReceita: number;
  mediaDespesa: number;
  saldoTotal: number;
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

  // ============================================================
  // CONTROLE SEMANAL (CORRIGIDO COM DISTRIBUIÇÃO POR SEMANA)
  // ============================================================

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
        semanas: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
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
      )
        continue;

      const item = mapaCategorias[m["Categoria"]];
      if (!item) continue;

      item.totalReal += m["Valor"];

      // 🔹 CÁLCULO DA SEMANA
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
      mapaCategorias[categoria].divergencia =
        mapaCategorias[categoria].limiteMensal -
        mapaCategorias[categoria].totalReal;
    }

    return Object.values(mapaCategorias);
  }

  // ============================================================
  // RESTANTE DO ARQUIVO (INALTERADO)
  // ============================================================

  public getDREAnual(): DREAnual {
    const ano = this.anoSelecionado;

    const receitas: Record<string, number[]> = {};
    const despesas: Record<string, number[]> = {};

    const totalReceitas = Array(12).fill(0);
    const totalDespesas = Array(12).fill(0);
    const saldoMensal = Array(12).fill(0);

    for (const mov of this.movimentacoes) {
      const data = mov["Data do Pagamento"];
      if (!data) continue;

      if (data.getFullYear() !== ano) continue;

      const mes = data.getMonth();
      const valor = mov["Valor"] || 0;

      if (mov["Tipo"] === "Receita") {
        if (!receitas[mov["Categoria"]]) {
          receitas[mov["Categoria"]] = Array(12).fill(0);
        }
        receitas[mov["Categoria"]][mes] += valor;
        totalReceitas[mes] += valor;
      }

      if (mov["Tipo"] === "Despesa") {
        if (!despesas[mov["Categoria"]]) {
          despesas[mov["Categoria"]] = Array(12).fill(0);
        }
        despesas[mov["Categoria"]][mes] += valor;
        totalDespesas[mes] += valor;
      }
    }

    for (let i = 0; i < 12; i++) {
      saldoMensal[i] =
        totalReceitas[i] - totalDespesas[i];
    }

    const somaReceitas = totalReceitas.reduce(
      (a, b) => a + b,
      0
    );
    const somaDespesas = totalDespesas.reduce(
      (a, b) => a + b,
      0
    );

    return {
      receitas,
      despesas,
      totalReceitas,
      totalDespesas,
      saldoMensal,
      mediaReceita: somaReceitas / 12,
      mediaDespesa: somaDespesas / 12,
      saldoTotal: somaReceitas - somaDespesas,
    };
  }

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
        if (m["Tipo"] === "Receita")
          receitas += m["Valor"];
        if (m["Tipo"] === "Despesa")
          despesas += m["Valor"];
      }
    }

    return {
      receitas,
      despesas,
      saldo: receitas - despesas,
    };
  }

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

  public getResumoClassificacao(): ResumoClassificacaoItem[] {
    const { mesAtual, anoAtual } =
      this.getMesEAnoSelecionado();

    const mapa: Record<
      string,
      ResumoClassificacaoItem
    > = {};

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

    for (const m of this.movimentacoes) {
      const data = m["Data da Movimentação"];
      if (!data) continue;

      if (
        data.getMonth() !== mesAtual ||
        data.getFullYear() !== anoAtual ||
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

  public getFaturaCartao(cartao: string) {
    const { mesAtual, anoAtual } =
      this.getMesEAnoSelecionado();

    const mesNumero = String(
      mesAtual + 1
    ).padStart(2, "0");

    const refPagamento = `${anoAtual}-${mesNumero}`;

    return this.movimentacoes
      .filter(
        (m) =>
          m["Método de Pagamento"] === cartao &&
          m["Ref. Pagamento"] ===
            refPagamento
      )
      .sort((a, b) => {
        const dataA =
          a["Data da Movimentação"]
            ? a[
                "Data da Movimentação"
              ].getTime()
            : 0;

        const dataB =
          b["Data da Movimentação"]
            ? b[
                "Data da Movimentação"
              ].getTime()
            : 0;

        return dataB - dataA;
      });
  }
}