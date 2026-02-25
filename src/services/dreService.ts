import type { Movimentacao } from "../types/movimentacao";

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

export class DreService {
  private movimentacoes: Movimentacao[];
  private anoSelecionado: number;

  constructor(
    movimentacoes: Movimentacao[],
    anoSelecionado: number
  ) {
    this.movimentacoes = movimentacoes;
    this.anoSelecionado = anoSelecionado;
  }

  public getDREAnual(): DREAnual {
    const receitas: Record<string, number[]> = {};
    const despesas: Record<string, number[]> = {};

    const totalReceitas = Array(12).fill(0);
    const totalDespesas = Array(12).fill(0);
    const saldoMensal = Array(12).fill(0);

    for (const mov of this.movimentacoes) {
      const data = mov["Data do Pagamento"];
      if (!data) continue;
      if (data.getFullYear() !== this.anoSelecionado)
        continue;

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

    const somaReceitas = totalReceitas.reduce(
      (a, b) => a + b,
      0
    );
    const somaDespesas = totalDespesas.reduce(
      (a, b) => a + b,
      0
    );

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
}