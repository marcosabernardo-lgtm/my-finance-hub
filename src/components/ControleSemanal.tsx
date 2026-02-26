import React from "react";

type ControleItem = {
  categoria: string;
  limiteMensal: number;
  totalReal: number;
  limiteSemanal: number;
  divergencia: number;
  semanas: Record<number, number>;
};

type Props = {
  controleData: ControleItem[];
};

export default function ControleSemanal({ controleData }: Props) {

  const formatarMoeda = (valor: number) =>
    valor.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  function corDivergencia(valor: number): string {
    if (valor < 0) return "#EF4444";
    if (valor > 0) return "#10B981";
    return "inherit";
  }

  function corSemana(valor: number, limiteSemanal: number): string {
    if (!valor) return "inherit";
    if (valor > limiteSemanal) return "#EF4444";
    return "#10B981";
  }

  return (
    <div style={{ marginTop: 25 }}>
      <h2 style={{ marginBottom: 15 }}>Controle Semanal</h2>

      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: 12,
        }}
      >
        <thead>
          <tr style={{ backgroundColor: "#111827" }}>
            <th style={thCategoria}>Categoria</th>
            <th style={thNumero}>Limite Mensal</th>
            <th style={thNumero}>Real</th>
            <th style={thNumero}>Divergência</th>
            <th style={thNumero}>Limite Semanal</th>
            <th style={thNumero}>Semana 1</th>
            <th style={thNumero}>Semana 2</th>
            <th style={thNumero}>Semana 3</th>
            <th style={thNumero}>Semana 4</th>
            <th style={thNumero}>Semana 5</th>
          </tr>
        </thead>

        <tbody>
          {controleData.map((item) => (
            <tr key={item.categoria}>
              <td style={tdCategoria}>{item.categoria}</td>

              <td style={tdNumero}>
                {formatarMoeda(item.limiteMensal)}
              </td>

              {/* ✅ REAL CORRIGIDO */}
              <td
                style={{
                  ...tdNumero,
                  color:
                    item.totalReal > item.limiteMensal
                      ? "#EF4444"
                      : "#10B981",
                  fontWeight: 600,
                }}
              >
                {formatarMoeda(item.totalReal)}
              </td>

              <td
                style={{
                  ...tdNumero,
                  color: corDivergencia(item.divergencia),
                  fontWeight: 700,
                }}
              >
                {formatarMoeda(item.divergencia)}
              </td>

              <td style={tdNumero}>
                {formatarMoeda(item.limiteSemanal)}
              </td>

              {[1, 2, 3, 4, 5].map((s) => {
                const valorSemana = item.semanas[s] || 0;

                return (
                  <td
                    key={s}
                    style={{
                      ...tdNumero,
                      color: corSemana(
                        valorSemana,
                        item.limiteSemanal
                      ),
                      fontWeight: 600,
                    }}
                  >
                    {formatarMoeda(valorSemana)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ===== ESTILO IDÊNTICO AO DRE ===== */

const thCategoria: React.CSSProperties = {
  textAlign: "left",
  padding: "6px 8px",
};

const thNumero: React.CSSProperties = {
  textAlign: "right",
  padding: "6px 8px",
};

const tdCategoria: React.CSSProperties = {
  padding: "6px 8px",
  borderBottom: "1px solid #1f2937",
};

const tdNumero: React.CSSProperties = {
  padding: "6px 8px",
  textAlign: "right",
  borderBottom: "1px solid #1f2937",
};