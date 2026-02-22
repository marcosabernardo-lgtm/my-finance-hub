import { useState } from "react";
import * as XLSX from "xlsx";
import type { Movimentacao } from "../types/movimentacao";

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

type Props = {
  onDataLoaded: (
    movs: Movimentacao[],
    despesas: DespesaConfig[],
    cartoes: Cartao[]
  ) => void;
};

function converterData(valor: any): Date | null {
  if (!valor) return null;

  if (typeof valor === "number") {
    const data = XLSX.SSF.parse_date_code(valor);
    if (!data) return null;
    return new Date(data.y, data.m - 1, data.d);
  }

  if (typeof valor === "string") {
    const partes = valor.split("/");
    if (partes.length === 3) {
      const dia = parseInt(partes[0]);
      const mes = parseInt(partes[1]) - 1;
      const ano = parseInt(partes[2]);
      return new Date(ano, mes, dia);
    }

    const tentativa = new Date(valor);
    return isNaN(tentativa.getTime()) ? null : tentativa;
  }

  return null;
}

function converterValor(valor: any): number {
  if (!valor) return 0;

  if (typeof valor === "number") return valor;

  if (typeof valor === "string") {
    const limpo = valor
      .replace("R$", "")
      .replace(/\./g, "")
      .replace(",", ".")
      .trim();

    const numero = Number(limpo);
    return isNaN(numero) ? 0 : numero;
  }

  return 0;
}

export default function UploadPlanilha({ onDataLoaded }: Props) {
  const [fileName, setFileName] = useState("");

  const handleFileUpload = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setFileName(file.name);

    const reader = new FileReader();

    reader.onload = (e) => {
      const data = e.target?.result;
      if (!data) return;

      const workbook = XLSX.read(data, { type: "array" });

      // ================= MOVIMENTACOES =================
      const sheetMov = workbook.Sheets["Movimentacoes"];
      if (!sheetMov) {
        alert("Aba Movimentacoes não encontrada.");
        return;
      }

      const jsonMov = XLSX.utils.sheet_to_json<Record<string, any>>(sheetMov, {
        defval: "",
      });

      const movimentacoes: Movimentacao[] = jsonMov.map((row) => ({
        "ID_Movimentacao": String(row["ID_Movimentacao"] ?? ""),

        "Data da Movimentação": converterData(
          row["Data da Movimentação"]
        ),

        "Data do Pagamento": converterData(
          row["Data do Pagamento"]
        ),

        "Tipo": String(row["Tipo"] ?? ""),
        "Categoria": String(row["Categoria"] ?? ""),
        "Descrição": String(row["Descrição"] ?? ""),
        "Valor": converterValor(row["Valor"]),

        "Método de Pagamento": String(
          row["Método de Pagamento"] ?? ""
        ),

        "Conta de Origem/Destino":
          row["Conta de Origem/Destino"] === ""
            ? null
            : String(row["Conta de Origem/Destino"] ?? null),

        "Forma de Pagamento": String(
          row["Forma de Pagamento"] ?? ""
        ),

        "Nº da Parcela": String(row["Nº da Parcela"] ?? ""),

        "Situação": String(row["Situação"] ?? ""),

        "Ref. Pagamento": String(row["Ref. Pagamento"] ?? ""),

        "Ref. Movimentação": String(
          row["Ref. Movimentação"] ?? ""
        ),

        "Classificação.1": String(
          row["Classificação.1"] ?? ""
        ),

        "Semana_do_Mês": String(
          row["Semana_do_Mês"] ?? ""
        ),
      }));

      // ================= DESPESAS =================
      const sheetDesp = workbook.Sheets["Despesas"];
      const jsonDesp = sheetDesp
        ? XLSX.utils.sheet_to_json<Record<string, any>>(sheetDesp, {
            defval: "",
          })
        : [];

      const despesasConfig: DespesaConfig[] = jsonDesp.map((row) => ({
        Categoria: String(row["Categoria"] ?? ""),
        Classificação: String(row["Classificação"] ?? ""),
        Limite_Gastos: converterValor(row["Limite_Gastos"]),
        Exemplos: String(row["Exemplos"] ?? ""),
      }));

      // ================= CARTOES =================
      const sheetCartoes = workbook.Sheets["Cartoes"];
      const jsonCartoes = sheetCartoes
        ? XLSX.utils.sheet_to_json<Record<string, any>>(sheetCartoes, {
            defval: "",
          })
        : [];

      const cartoes: Cartao[] = jsonCartoes.map((row) => ({
        "Nome do Cartão": String(row["Nome do Cartão"] ?? ""),
        "Data do Fechamento da Fatura": Number(
          row["Data do Fechamento da Fatura"] ?? 0
        ),
        "Data do Vencimento da Fatura": Number(
          row["Data do Vencimento da Fatura"] ?? 0
        ),
        "Limite Total do Cartão": converterValor(
          row["Limite Total do Cartão"]
        ),
      }));

      onDataLoaded(movimentacoes, despesasConfig, cartoes);
    };

    reader.readAsArrayBuffer(file);
  };

  return (
    <div>
      <input
        type="file"
        accept=".xls,.xlsx,.xlsb"
        onChange={handleFileUpload}
      />
      {fileName && <p>Arquivo carregado: {fileName}</p>}
    </div>
  );
}