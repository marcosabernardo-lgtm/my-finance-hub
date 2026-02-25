import type { Movimentacao } from "../types/movimentacao";

type DespesaConfig = {
  Categoria: string;
  Classificação: string;
  Limite_Gastos: number;
  Exemplos: string;
};

type Cartao = {
  "Nome do Cartão": string;
  "Data do Fechamento da Fatura": number;
  "Data do Vencimento da Fatura": number;
  "Limite Total do Cartão": number;
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
  private cartoes: Cartao[];
  private mesSelecionado: number;
  private anoSelecionado: number;

  constructor(
    movimentacoes: Movimentacao[],
    despesasConfig: DespesaConfig[],
    cartoes: Cartao[],
    mes?: number,
    ano?: number
  ) {
    const hoje = new Date();

    this.movimentacoes = movimentacoes;
    this.despesasConfig = despesasConfig;
    this.cartoes = cartoes;
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
  // CONTROLE SEMANAL
  // ============================================================

  public getControleSemanal(): ControleItem[] {
    const { mesAtual, anoAtual } = this.getMesEAnoSelecionado();

    const mapaCategorias: Record<string, ControleItem> = {};

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
  // DRE ANUAL
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

    const somaReceitas = totalReceitas.reduce((a, b) => a + b, 0);
    const somaDespesas = totalDespesas.reduce((a, b) => a + b, 0);

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

  // ============================================================
  // RESUMO MÊS
  // ============================================================

  public getResumoMesAtual() {
    const { mesAtual, anoAtual } = this.getMesEAnoSelecionado();

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

  // ============================================================
  // MOVIMENTAÇÕES
  // ============================================================

  public getMovimentacoesOrdenadas() {
    const { mesAtual, anoAtual } = this.getMesEAnoSelecionado();

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

  // ============================================================
  // RESUMO CLASSIFICAÇÃO
  // ============================================================

  public getResumoClassificacao(): ResumoClassificacaoItem[] {
    const { mesAtual, anoAtual } = this.getMesEAnoSelecionado();

    const mapa: Record<string, ResumoClassificacaoItem> = {};

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
      )
        continue;

      const despConfig = this.despesasConfig.find(
        (d) => d.Categoria === m["Categoria"]
      );

      if (!despConfig) continue;

      mapa[despConfig.Classificação].real += m["Valor"];
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

  // ============================================================
  // FATURA MENSAL
  // ============================================================

  public getFaturaCartao(cartao: string) {
    const { mesAtual, anoAtual } = this.getMesEAnoSelecionado();

    const mesNumero = String(mesAtual + 1).padStart(2, "0");
    const refPagamento = `${anoAtual}-${mesNumero}`;

    return this.movimentacoes
      .filter(
        (m) =>
          m["Método de Pagamento"] === cartao &&
          m["Ref. Pagamento"] === refPagamento
      )
      .sort((a, b) => {
        const dataA =
          a["Data da Movimentação"]?.getTime() || 0;
        const dataB =
          b["Data da Movimentação"]?.getTime() || 0;

        return dataB - dataA;
      });
  }

  // ============================================================
  // CARTÕES - VISÃO ANUAL (POR DATA DO PAGAMENTO)
  // ============================================================

  public getCartoesAnual() {
    const ano = this.anoSelecionado;
    const nomesValidos = this.cartoes.map(
      (c) => c["Nome do Cartão"]
    );

    const cartoesMap = new Map<
      string,
      {
        meses: { pago: number; pendente: number; total: number }[];
        totalPago: number;
        totalPendente: number;
        totalAnual: number;
      }
    >();

    const totaisPorMes = Array.from({ length: 12 }, () => ({
      pago: 0,
      pendente: 0,
      total: 0,
    }));

    let totalGeral = 0;
    let totalGeralPago = 0;
    let totalGeralPendente = 0;

    for (const mov of this.movimentacoes) {
      const dataPagamento = mov["Data do Pagamento"];
      if (!dataPagamento) continue;
      if (dataPagamento.getFullYear() !== ano) continue;

      const nomeCartao = mov["Método de Pagamento"];
      if (!nomesValidos.includes(nomeCartao)) continue;

      const status = (mov["Situação"] || "")
        .trim()
        .toLowerCase();

      if (status !== "faturado" && status !== "pendente")
        continue;

      const valor = mov["Valor"] || 0;
      const mesIndex = dataPagamento.getMonth();

      if (!cartoesMap.has(nomeCartao)) {
        cartoesMap.set(nomeCartao, {
          meses: Array.from({ length: 12 }, () => ({
            pago: 0,
            pendente: 0,
            total: 0,
          })),
          totalPago: 0,
          totalPendente: 0,
          totalAnual: 0,
        });
      }

      const cartao = cartoesMap.get(nomeCartao)!;

      if (status === "pago") {
        cartao.meses[mesIndex].pago += valor;
        cartao.totalPago += valor;
        totalGeralPago += valor;
      }

      if (status === "pendente") {
        cartao.meses[mesIndex].pendente += valor;
        cartao.totalPendente += valor;
        totalGeralPendente += valor;
      }

      cartao.meses[mesIndex].total += valor;
      cartao.totalAnual += valor;

      totaisPorMes[mesIndex].total += valor;
      totalGeral += valor;
    }

    const cartoes = Array.from(cartoesMap.entries()).map(
      ([nomeCartao, dados]) => ({
        nomeCartao,
        ...dados,
      })
    );

    return {
      cartoes,
      totaisPorMes,
      totalGeral,
      totalGeralPago,
      totalGeralPendente,
    };
  }
}