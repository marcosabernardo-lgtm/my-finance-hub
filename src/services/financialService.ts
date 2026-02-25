import type { Movimentacao } from "../types/movimentacao";
import { CartaoService } from "./cartaoService";
import { DreService } from "./dreService";
import { ResumoService } from "./resumoService";
import { MovimentacoesService } from "./movimentacoesService";
import { ResumoClassificacaoService } from "./resumoClassificacaoService";
import { FaturaService } from "./faturaService";
import { ControleSemanalService } from "./controleSemanalService";
import { PendenteService } from "./pendenteService";

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
    this.mesSelecionado = mes !== undefined ? mes : hoje.getMonth();
    this.anoSelecionado = ano !== undefined ? ano : hoje.getFullYear();
  }

  public getPendenciasAnuais() {
    const pendenteService = new PendenteService(this.movimentacoes);
    return pendenteService.getPendenciasAnuais(this.anoSelecionado);
  }

  public getTotalPendenteAtual() {
    const pendenteService = new PendenteService(this.movimentacoes);
    return pendenteService.getTotalPendenteAtual();
  }

  public getResumoMesAtual() {
    const resumoService = new ResumoService(
      this.movimentacoes,
      this.mesSelecionado,
      this.anoSelecionado
    );
    return resumoService.getResumoMesAtual();
  }

  public getMovimentacoesOrdenadas() {
    const movimentacoesService = new MovimentacoesService(
      this.movimentacoes,
      this.mesSelecionado,
      this.anoSelecionado
    );
    return movimentacoesService.getMovimentacoesOrdenadas();
  }

  public getControleSemanal() {
    const controleSemanalService = new ControleSemanalService(
      this.movimentacoes,
      this.despesasConfig,
      this.mesSelecionado,
      this.anoSelecionado
    );
    return controleSemanalService.getControleSemanal();
  }

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

  public getFaturaCartao(cartao: string) {
    const faturaService = new FaturaService(
      this.movimentacoes,
      this.mesSelecionado,
      this.anoSelecionado
    );

    return faturaService.getFaturaCartao(cartao);
  }

  public getDREAnual() {
    const dreService = new DreService(
      this.movimentacoes,
      this.anoSelecionado
    );
    return dreService.getDREAnual();
  }

  public getCartoesAnual() {
    const cartaoService = new CartaoService(
      this.movimentacoes,
      this.cartoes,
      this.anoSelecionado
    );

    return cartaoService.getCartoesAnual();
  }
}