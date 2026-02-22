export interface Movimentacao {
  "ID_Movimentacao": string;
  "Data da Movimentação": Date | null;
  "Data do Pagamento": Date | null;
  "Tipo": string;
  "Categoria": string;
  "Descrição": string;
  "Valor": number;
  "Método de Pagamento": string;
  "Conta de Origem/Destino": string | null;
  "Forma de Pagamento": string;
  "Nº da Parcela": string;
  "Situação": string;
  "Ref. Pagamento": string;
  "Ref. Movimentação": string;
  "Classificação.1": string;
  "Semana_do_Mês": string;
}

