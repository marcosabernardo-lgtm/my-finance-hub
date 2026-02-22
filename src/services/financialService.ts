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

  // ===============================
  // MÉTODO CENTRALIZADO DE DATA
  // ===============================
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

      const ehMesAtual =
        data.getMonth() === mesAtual &&
        data.getFullYear() === anoAtual;

      if (!ehMesAtual) continue;

      if (m["Tipo"] === "Receita") {
        receitas += m["Valor"];
      } else if (m["Tipo"] === "Despesa") {
        despesas += m["Valor"];
      }
    }

    return {
      receitas,
      despesas,
      saldo: receitas - despesas,
    };
  }

  // ===============================
  // MOVIMENTAÇÕES ORDENADAS
  // ===============================
  public getMovimentacoesOrdenadas() {
    return [...this.movimentacoes].sort(
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

      const ehMesAtual =
        data.getMonth() === mesAtual &&
        data.getFullYear() === anoAtual;

      if (
        !ehMesAtual ||
        m["Tipo"] !== "Despesa" ||
        m["Forma de Pagamento"] !== "À Vista"
      ) {
        continue;
      }

      const categoria = m["Categoria"];
      const item = mapaCategorias[categoria];
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
  // FATURA CARTÃO (mantido igual)
  // ===============================
  public getFaturaCartao(
    cartao: string,
    ano: string,
    mes: string
  ) {
    const meses: Record<string, string> = {
      Janeiro: "01",
      Fevereiro: "02",
      Março: "03",
      Abril: "04",
      Maio: "05",
      Junho: "06",
      Julho: "07",
      Agosto: "08",
      Setembro: "09",
      Outubro: "10",
      Novembro: "11",
      Dezembro: "12",
    };

    const mesNumero = meses[mes] || mes;
    const refPagamento = `${ano}-${mesNumero}`;

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