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

  public getResumoMesAtual() {
    let receitas = 0;
    let despesas = 0;

    for (const m of this.movimentacoes) {
      const data = m["Data do Pagamento"];
      if (!data) continue;

      if (
        data.getMonth() === this.mesSelecionado &&
        data.getFullYear() === this.anoSelecionado
      ) {
        if (m["Tipo"] === "Receita") {
          receitas += m["Valor"];
        }

        if (m["Tipo"] === "Despesa") {
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
}