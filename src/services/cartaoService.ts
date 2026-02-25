import type { Movimentacao } from "../types/movimentacao";

type Cartao = {
  "Nome do Cartão": string;
  "Data do Fechamento da Fatura": number;
  "Data do Vencimento da Fatura": number;
  "Limite Total do Cartão": number;
};

export class CartaoService {
  private movimentacoes: Movimentacao[];
  private cartoes: Cartao[];
  private anoSelecionado: number;

  constructor(
    movimentacoes: Movimentacao[],
    cartoes: Cartao[],
    anoSelecionado: number
  ) {
    this.movimentacoes = movimentacoes;
    this.cartoes = cartoes;
    this.anoSelecionado = anoSelecionado;
  }

  public getCartoesAnual() {
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
      if (dataPagamento.getFullYear() !== this.anoSelecionado)
        continue;

      const nomeCartao = mov["Método de Pagamento"];
      if (!nomesValidos.includes(nomeCartao)) continue;

      const status = (mov["Situação"] || "")
        .trim()
        .toLowerCase();

      // Regra atual do seu sistema:
      // Faturado = pago
      // Pendente = pendente
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

      if (status === "faturado") {
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