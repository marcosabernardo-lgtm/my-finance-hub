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
    const hoje = new Date();
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

      const item = mapaCategorias[m["Categoria"]];
      if (!item) continue;

      const valor = m["Valor"] || 0;

      // Soma no Real
      item.totalReal += valor;

      // Usa semana da planilha
      const semanaTexto = m["Semana_do_Mês"];
      if (typeof semanaTexto === "string") {
        const numeroSemana = Number(
          semanaTexto.replace("Semana", "").trim()
        );

        if (numeroSemana >= 1 && numeroSemana <= 5) {
          item.semanas[numeroSemana] += valor;
        }
      }
    }

    // ==============================
    // 3️⃣ Calcula divergência
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