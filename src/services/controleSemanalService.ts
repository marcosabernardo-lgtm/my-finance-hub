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

export class ControleSemanalService {
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

  // ==============================
  // CALCULAR SEMANA IGUAL AO EXCEL
  // ==============================
  private getWeekNumber(date: Date): number {
    const d = new Date(
      Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
    );

    const dayNum = d.getUTCDay() || 7;

    d.setUTCDate(d.getUTCDate() + 4 - dayNum);

    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));

    return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  }

  private calcularSemanaMes(data: Date): number {
    const inicioMes = new Date(data.getFullYear(), data.getMonth(), 1);

    const semanaAnoData = this.getWeekNumber(data);
    const semanaAnoInicio = this.getWeekNumber(inicioMes);

    return semanaAnoData - semanaAnoInicio + 1;
  }

  public getControleSemanal(): ControleItem[] {
    const mapaCategorias: Record<string, ControleItem> = {};

    // ==============================
    // 1️⃣ Inicializa categorias
    // ==============================
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

    // ==============================
    // 2️⃣ Processa movimentações
    // ==============================
    for (const m of this.movimentacoes) {
      const dataMov = m["Data da Movimentação"];

      if (!dataMov) continue;

      // mês selecionado
      if (
        dataMov.getMonth() !== this.mesSelecionado ||
        dataMov.getFullYear() !== this.anoSelecionado
      )
        continue;

      // só despesas
      if (m["Tipo"] !== "Despesa") continue;

      // ignora pagamento de fatura
      if (m["Categoria"] === "Pagamento de Fatura") continue;

      // ignora faturado e previsto
      if (m["Situação"] === "Faturado") continue;
      if (m["Situação"] === "Previsto") continue;

      const item = mapaCategorias[m["Categoria"]];
      if (!item) continue;

      const valor = m["Valor"] || 0;

      // soma no real
      item.totalReal += valor;

      // calcula semana automaticamente
      const semana = this.calcularSemanaMes(dataMov);

      if (semana >= 1 && semana <= 5) {
        item.semanas[semana] += valor;
      }
    }

    // ==============================
    // 3️⃣ Divergência
    // ==============================
    for (const categoria in mapaCategorias) {
      mapaCategorias[categoria].divergencia =
        mapaCategorias[categoria].limiteMensal -
        mapaCategorias[categoria].totalReal;
    }

    const lista = Object.values(mapaCategorias);

    // ==============================
    // 4️⃣ Linha TOTAL
    // ==============================
    const total: ControleItem = {
      categoria: "TOTAL",
      limiteMensal: 0,
      totalReal: 0,
      limiteSemanal: 0,
      divergencia: 0,
      semanas: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    };

    for (const item of lista) {
      total.limiteMensal += item.limiteMensal;
      total.totalReal += item.totalReal;
      total.limiteSemanal += item.limiteSemanal;
      total.divergencia += item.divergencia;

      for (let i = 1; i <= 5; i++) {
        total.semanas[i] += item.semanas[i];
      }
    }

    return [...lista, total];
  }
}