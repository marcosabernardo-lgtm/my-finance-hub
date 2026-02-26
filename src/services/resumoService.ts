import type { Movimentacao } from "../types/movimentacao";

export class ResumoService {
  private movimentacoes: Movimentacao[];
  private mesSelecionado: number;
  private anoSelecionado: number;

  constructor(
    movimentacoes: Movimentacao[],
    mesSelecionado: number,
    anoSelecionado: number
  ) {
    this.movimentacoes = movimentacoes;
    this.mesSelecionado = mesSelecionado;
    this.anoSelecionado = anoSelecionado;
  }

  private converterParaData(valor: any): Date | null {
    if (!valor) return null;

    if (valor instanceof Date) return valor;

    if (typeof valor === "string") {
      const dataConvertida = new Date(valor);
      return isNaN(dataConvertida.getTime()) ? null : dataConvertida;
    }

    return null;
  }

  public getResumoMesAtual() {
    let receitas = 0;
    let despesas = 0;

    for (const m of this.movimentacoes) {
      const data = this.converterParaData(m["Data do Pagamento"]);
      if (!data) continue;

      if (
        data.getMonth() === this.mesSelecionado &&
        data.getFullYear() === this.anoSelecionado
      ) {
        if (m["Tipo"] === "Receita") {
          receitas += m["Valor"] || 0;
        }

        if (m["Tipo"] === "Despesa") {
          despesas += m["Valor"] || 0;
        }
      }
    }

    return {
      receitas,
      despesas,
      saldo: receitas - despesas,
    };
  }
}