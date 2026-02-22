import type { Movimentacao } from "../types/movimentacao";
import GraficoCategoria from "./GraficoCategoria";
import React from "react";

type Cartao = {
  "Nome do Cartão": string;
  "Data do Fechamento da Fatura": number;
  "Data do Vencimento da Fatura": number;
  "Limite Total do Cartão": number;
};

type Props = {
  cartoes: Cartao[];
  cartaoFiltro: string;
  anoFiltro: string;
  mesFiltro: string;
  setCartaoFiltro: (valor: string) => void;
  setAnoFiltro: (valor: string) => void;
  setMesFiltro: (valor: string) => void;
  dados: Movimentacao[];
};

export default function FaturaCartao({
  cartoes,
  cartaoFiltro,
  anoFiltro,
  mesFiltro,
  setCartaoFiltro,
  setAnoFiltro,
  setMesFiltro,
  dados,
}: Props) {

  const formatarMoeda = (valor?: number) => {
    if (!valor) return "R$ 0,00";
    return valor.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  };

  const formatarDescricao = (texto?: string) => {
    if (!texto || typeof texto !== "string") return "";
    return texto
      .toLowerCase()
      .split(" ")
      .map(
        (palavra) =>
          palavra.charAt(0).toUpperCase() + palavra.slice(1)
      )
      .join(" ");
  };

  const totalFatura = (dados || []).reduce(
    (acc, mov) => acc + (mov.Valor || 0),
    0
  );

  const celulaStyle: React.CSSProperties = {
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  };

  return (
    <>
      <h2 style={{ marginTop: 30 }}>Fatura Cartão</h2>

      {/* FILTROS */}
      <div style={{ display: "flex", gap: 15, marginBottom: 25 }}>
        <select
          value={cartaoFiltro}
          onChange={(e) => setCartaoFiltro(e.target.value)}
          style={{ minWidth: 220 }}
        >
          <option value="">Selecione o Cartão</option>
          {cartoes.map((c) => (
            <option
              key={c["Nome do Cartão"]}
              value={c["Nome do Cartão"]}
            >
              {c["Nome do Cartão"]}
            </option>
          ))}
        </select>

        <input
          type="number"
          placeholder="Ano (ex: 2026)"
          value={anoFiltro}
          onChange={(e) => setAnoFiltro(e.target.value)}
          style={{ width: 120 }}
        />

        <select
          value={mesFiltro}
          onChange={(e) => setMesFiltro(e.target.value)}
          style={{ minWidth: 160 }}
        >
          <option value="">Selecione o Mês</option>
          <option value="01">Janeiro</option>
          <option value="02">Fevereiro</option>
          <option value="03">Março</option>
          <option value="04">Abril</option>
          <option value="05">Maio</option>
          <option value="06">Junho</option>
          <option value="07">Julho</option>
          <option value="08">Agosto</option>
          <option value="09">Setembro</option>
          <option value="10">Outubro</option>
          <option value="11">Novembro</option>
          <option value="12">Dezembro</option>
        </select>
      </div>

      <h3 style={{ marginBottom: 30 }}>
        Total Fatura: {formatarMoeda(totalFatura)}
      </h3>

      {/* CONTAINER PRINCIPAL */}
      <div
        style={{
          display: "flex",
          gap: 40,
          alignItems: "flex-start",
        }}
      >
        {/* TABELA */}
        <div style={{ flex: 2.2 }}>
          {(dados || []).length === 0 ? (
            <p>Nenhuma movimentação encontrada.</p>
          ) : (
            <table
              style={{
                width: "100%",
                tableLayout: "fixed",
                borderCollapse: "separate",
                borderSpacing: "20px 12px",
                fontSize: "13px",
              }}
            >
              <thead>
                <tr>
                  <th style={{ width: "12%", textAlign: "left" }}>
                    Data
                  </th>
                  <th style={{ width: "18%", textAlign: "left" }}>
                    Categoria
                  </th>
                  <th style={{ width: "22%", textAlign: "left" }}>
                    Descrição
                  </th>
                  <th style={{ width: "12%", textAlign: "left" }}>
                    Valor
                  </th>
                  <th style={{ width: "18%", textAlign: "left" }}>
                    Forma
                  </th>
                  <th style={{ width: "8%", textAlign: "left" }}>
                    Parcela
                  </th>
                </tr>
              </thead>

              <tbody>
                {(dados || []).map((m) => (
                  <tr key={m.ID_Movimentacao}>
                    <td style={celulaStyle}>
                      {m["Data da Movimentação"]?.toLocaleDateString()}
                    </td>

                    <td style={celulaStyle}>
                      {m.Categoria}
                    </td>

                    <td style={celulaStyle}>
                      {formatarDescricao(m.Descrição)}
                    </td>

                    <td style={celulaStyle}>
                      {formatarMoeda(m.Valor)}
                    </td>

                    <td style={celulaStyle}>
                      {m["Forma de Pagamento"]}
                    </td>

                    <td style={celulaStyle}>
                      {m["Nº da Parcela"]}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* GRÁFICO */}
        <div style={{ flex: 1 }}>
          <GraficoCategoria dados={dados || []} />
        </div>
      </div>
    </>
  );
}