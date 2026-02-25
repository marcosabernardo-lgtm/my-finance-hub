import type { Movimentacao } from "../types/movimentacao";

export class MovimentacoesService {
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

  public getMovimentacoesOrdenadas() {
    return this.movimentacoes
      .filter((m) => {
        const data = m["Data da Movimentação"];
        if (!data) return false;

        return (
          data.getMonth() === this.mesSelecionado &&
          data.getFullYear() === this.anoSelecionado
        );
      })
      .sort(
        (a, b) =>
          Number(b.ID_Movimentacao) -
          Number(a.ID_Movimentacao)
      );
  }
}