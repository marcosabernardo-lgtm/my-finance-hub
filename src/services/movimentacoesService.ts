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
        const dataPagamento = m["Data do Pagamento"];
        if (!dataPagamento) return false;

        const data = new Date(dataPagamento);

        const mes = data.getMonth();
        const ano = data.getFullYear();

        return (
          mes === this.mesSelecionado &&
          ano === this.anoSelecionado
        );
      })
      .sort(
        (a, b) =>
          Number(b.ID_Movimentacao) -
          Number(a.ID_Movimentacao)
      );
  }
}