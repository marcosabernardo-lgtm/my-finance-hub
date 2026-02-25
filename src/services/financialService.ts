import type { Movimentacao } from "../types/movimentacao";
import { CartaoService } from "./cartaoService";
import { DreService } from "./dreService";
import { ResumoService } from "./resumoService";
import { MovimentacoesService } from "./movimentacoesService";
import { ResumoClassificacaoService } from "./resumoClassificacaoService";
import { FaturaService } from "./faturaService";
import { ControleSemanalService } from "./controleSemanalService";

type DespesaConfig = {
  Categoria: string;
  Classificação: string;
  Limite_Gastos: number;
  Exemplos: string;
};

type Cartao = {
  "Nome do Cartão": string;
  "Data do Fechamento da Fatura": number;
  "Data do Vencimento da Fatura": number;
  "Limite Total do Cartão": number;
};

type ControleItem = {
  categoria: string;
  limiteMensal: number;
  totalReal: number;
  limiteSemanal: number;
  divergencia: number;
  semanas: Record<number, number>;
};

type ResumoClassificacaoItem = {
  classificacao: string;
  previsto: number;
  real: number;
  divergencia: number;
  percentual: number;
};

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

export class FinancialService {
  private movimentacoes: Movimentacao[];
  private despesasConfig: DespesaConfig[];
  private cartoes: Cartao[];
  private mesSelecionado: number;
  private anoSelecionado: number;

  constructor(
    movimentacoes: Movimentacao[],
    despesasConfig: DespesaConfig[],
    cartoes: Cartao[],
    mes?: number,
    ano?: number
  ) {
    const hoje = new Date();

    this.movimentacoes = movimentacoes;
    this.despesasConfig = despesasConfig;
    this.cartoes = cartoes;
    this.mesSelecionado =
      mes !== undefined ? mes : hoje.getMonth();
    this.anoSelecionado =
      ano !== undefined ? ano : hoje.getFullYear();
  }

  private getMesEAnoSelecionado() {
    return {
      mesAtual: this.mesSelecionado,
      anoAtual: this.anoSelecionado,
    };
  }

  // ============================================================
  // CONTROLE SEMANAL
  // ============================================================

  public getControleSemanal() {
  const controleSemanalService =
    new ControleSemanalService(
      this.movimentacoes,
      this.despesasConfig,
      this.mesSelecionado,
      this.anoSelecionado
    );

  return controleSemanalService.getControleSemanal();
}

  // ============================================================
  // DRE ANUAL
  // ============================================================

 public getDREAnual() {
  const dreService = new DreService(
    this.movimentacoes,
    this.anoSelecionado
  );

  return dreService.getDREAnual();
  }

  // ============================================================
  // RESUMO MÊS ATUAL
  // ============================================================

  public getResumoMesAtual() {
  const resumoService = new ResumoService(
    this.movimentacoes,
    this.mesSelecionado,
    this.anoSelecionado
  );

  return resumoService.getResumoMesAtual();
}
  // ============================================================
  // MOVIMENTAÇÕES
  // ============================================================

  public getMovimentacoesOrdenadas() {
  const movimentacoesService = new MovimentacoesService(
    this.movimentacoes,
    this.mesSelecionado,
    this.anoSelecionado
  );

  return movimentacoesService.getMovimentacoesOrdenadas();
}

  // ============================================================
  // RESUMO CLASSIFICAÇÃO
  // ============================================================

  public getResumoClassificacao() {
  const resumoClassificacaoService =
    new ResumoClassificacaoService(
      this.movimentacoes,
      this.despesasConfig,
      this.mesSelecionado,
      this.anoSelecionado
    );

  return resumoClassificacaoService.getResumoClassificacao();
}
  // ============================================================
  // FATURA CARTÕES
  // ============================================================

 public getFaturaCartao(cartao: string) {
  const faturaService = new FaturaService(
    this.movimentacoes,
    this.mesSelecionado,
    this.anoSelecionado
  );

  return faturaService.getFaturaCartao(cartao);
}
  // ============================================================
  // CARTÕES - VISÃO ANUAL (POR DATA DO PAGAMENTO)
  // ============================================================

  public getCartoesAnual() {
  const cartaoService = new CartaoService(
    this.movimentacoes,
    this.cartoes,
    this.anoSelecionado
  );

  return cartaoService.getCartoesAnual();
}
}