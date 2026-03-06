import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
} from "recharts";
import type { Movimentacao } from "../types";

type Props = {
  dados: Movimentacao[];
};

const CORES = [
  "#4F46E5",
  "#06B6D4",
  "#10B981",
  "#F59E0B",
  "#EF4444",
  "#8B5CF6",
  "#14B8A6",
  "#F97316",
];

export default function GraficoCategoria({ dados }: Props) {
  // 1. Processamento (Agrupamento e Soma)
  const agrupado: Record<string, number> = {};
  let totalGeral = 0;

  dados.forEach((mov) => {
    if (!mov.Categoria) return;
    const valor = Number(mov.Valor) || 0;

    // Apenas valores positivos
    if (valor <= 0) return;

    if (!agrupado[mov.Categoria]) {
      agrupado[mov.Categoria] = 0;
    }
    agrupado[mov.Categoria] += valor;
    totalGeral += valor;
  });

  const dadosGrafico = Object.entries(agrupado)
    .map(([categoria, total]) => ({
      categoria,
      total,
      percentual: totalGeral > 0 ? (total / totalGeral) * 100 : 0,
    }))
    .sort((a, b) => b.total - a.total);

  const formatarMoeda = (valor: number) =>
    valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const formatarPercentual = (valor: number) =>
    `${valor.toFixed(1).replace(".", ",")}%`;

  if (!dadosGrafico.length) {
    return <p className="text-gray-400 p-4">Nenhum dado para exibir.</p>;
  }

  // Altura baseada na quantidade de itens
  const alturaGrafico = Math.max(dadosGrafico.length * 50, 300);

  return (
    // w-full garante que ele use 100% da largura disponível na tela
    <div style={{ width: "100%", height: alturaGrafico }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={dadosGrafico}
          layout="vertical"
          // AJUSTE CRÍTICO AQUI:
          // Reduzi right para 110 (espaço mínimo para o texto)
          // Reduzi left para 10 (apenas respiro)
          margin={{ top: 10, right: 110, left: 10, bottom: 10 }}
          barCategoryGap={10}
        >
          {/* 
             domain={[0, 'dataMax']} -> Força a maior barra a ir até o fim
             allowDataOverflow -> Permite desenhar até o pixel final
          */}
          <XAxis type="number" domain={[0, 'dataMax']} hide />

          <YAxis
            dataKey="categoria"
            type="category"
            // Reduzi a largura reservada para o nome da categoria
            width={140}
            tick={{ fill: "#e5e7eb", fontSize: 12, fontWeight: 500 }}
            tickLine={false}
            axisLine={false}
            // Se o nome for muito longo, ele quebra ou corta, dando espaço pra barra
            interval={0} 
          />

          <Tooltip
            cursor={{ fill: "rgba(255, 255, 255, 0.05)" }}
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                const data = payload[0].payload;
                return (
                  <div className="bg-gray-800 border border-gray-700 rounded p-2 shadow-lg z-50">
                    <p className="text-white font-bold text-sm">{data.categoria}</p>
                    <p className="text-emerald-400 text-xs">
                      {formatarMoeda(data.total)}
                    </p>
                    <p className="text-gray-400 text-xs">
                       {formatarPercentual(data.percentual)} do total
                    </p>
                  </div>
                );
              }
              return null;
            }}
          />

          <Bar
            dataKey="total"
            radius={[0, 4, 4, 0]}
            barSize={20} // Altura da barra fina para ficar elegante
          >
            <LabelList
              dataKey="total"
              position="right"
              content={(props: any) => {
                const { x, y, width, height, value, index } = props;
                const item = dadosGrafico[index];
                const yPos = y + height / 2 + 4;

                return (
                  <text
                    x={x + width + 8} // Cola texto 8px depois da barra
                    y={yPos}
                    fill="#fff"
                    fontSize="11" // Fonte levemente menor para caber melhor
                    fontWeight="500"
                    textAnchor="start"
                  >
                    {`${formatarMoeda(value)} (${formatarPercentual(item.percentual)})`}
                  </text>
                );
              }}
            />

            {dadosGrafico.map((_, index) => (
              <Cell
                key={`cell-${index}`}
                fill={CORES[index % CORES.length]}
                strokeWidth={0}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}