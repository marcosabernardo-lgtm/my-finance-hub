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

  public getControleSemanal(): ControleItem[] {
    const mapaCategorias: Record<string, ControleItem> =
      {};

    // Inicializa categorias
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

    // Processa movimentações
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

    // Calcula divergência
    for (const categoria in mapaCategorias) {
      mapaCategorias[categoria].divergencia =
        mapaCategorias[categoria].limiteMensal -
        mapaCategorias[categoria].totalReal;
    }

    return Object.values(mapaCategorias);
  }
}