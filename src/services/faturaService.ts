import type { Movimentacao } from "../types/movimentacao";

export class FaturaService {
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

  public getFaturaCartao(cartao: string) {
    const mesNumero = String(
      this.mesSelecionado + 1
    ).padStart(2, "0");

    const refPagamento = `${this.anoSelecionado}-${mesNumero}`;

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
}