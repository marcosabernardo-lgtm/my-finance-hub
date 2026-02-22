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

  constructor(
    movimentacoes: Movimentacao[],
    despesasConfig: DespesaConfig[]
  ) {
    this.movimentacoes = movimentacoes;
    this.despesasConfig = despesasConfig;
  }

  // ===============================
  // MÉTODO CENTRALIZADO DE DATA
  // ===============================
  private getMesEAnoAtual() {
    const hoje = new Date();
    return {
      mesAtual: hoje.getMonth(),
      anoAtual: hoje.getFullYear(),
    };
  }

  // ===============================
  // RESUMO DO MÊS ATUAL (OTIMIZADO)
  // ===============================
  public getResumoMesAtual() {
    const { mesAtual, anoAtual } = this.getMesEAnoAtual();

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
    const { mesAtual, anoAtual } = this.getMesEAnoAtual();

    const movFiltradas = this.movimentacoes.filter((m) => {
      const data = m["Data da Movimentação"];
      if (!data) return false;

      const ehMesAtual =
        data.getMonth() === mesAtual &&
        data.getFullYear() === anoAtual;

      return (
        ehMesAtual &&
        m["Tipo"] === "Despesa" &&
        m["Forma de Pagamento"] === "À Vista"
      );
    });

    return this.despesasConfig.map((cat) => {
      const movCategoria = movFiltradas.filter(
        (m) => m["Categoria"] === cat.Categoria
      );

      const totalReal = movCategoria.reduce(
        (acc, m) => acc + m["Valor"],
        0
      );

      const limiteSemanal = cat.Limite_Gastos / 4.3;
      const divergencia = cat.Limite_Gastos - totalReal;

      const semanas: Record<number, number> = {
        1: 0,
        2: 0,
        3: 0,
        4: 0,
        5: 0,
      };

      movCategoria.forEach((m) => {
        const data = m["Data da Movimentação"];
        if (!data) return;

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
          semanas[semana] += m["Valor"];
        }
      });

      return {
        categoria: cat.Categoria,
        limiteMensal: cat.Limite_Gastos,
        totalReal,
        limiteSemanal,
        divergencia,
        semanas,
      };
    });
  }

  // ===============================
  // FATURA CARTÃO
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