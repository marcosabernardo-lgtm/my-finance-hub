import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type { Movimentacao } from "../types/movimentacao";

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
  const agrupado: Record<string, number> = {};

  dados.forEach((mov) => {
    if (!mov.Categoria) return;

    if (!agrupado[mov.Categoria]) {
      agrupado[mov.Categoria] = 0;
    }

    agrupado[mov.Categoria] += mov.Valor || 0;
  });

  const dadosGrafico = Object.entries(agrupado)
    .map(([categoria, total]) => ({
      categoria,
      total,
    }))
    .sort((a, b) => b.total - a.total);

  const formatarMoeda = (valor: number) =>
    valor.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });

  if (!dadosGrafico.length) {
    return <p>Nenhum dado para exibir.</p>;
  }

  const alturaGrafico = dadosGrafico.length * 55;

  return (
    <div style={{ width: "100%", height: alturaGrafico }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={dadosGrafico}
          layout="vertical"
          margin={{ top: 10, right: 30, left: 60, bottom: 10 }}
          barCategoryGap={18}
        >
          <XAxis type="number" hide />

          <YAxis
            dataKey="categoria"
            type="category"
            width={220}
            tick={{ fill: "#ffffff", fontSize: 13 }}
          />

          <Tooltip
            formatter={(value: number) =>
              formatarMoeda(value)
            }
            contentStyle={{
              backgroundColor: "#1f1f1f",
              border: "1px solid #333",
              borderRadius: 8,
              color: "#ffffff",
            }}
            labelStyle={{ color: "#ffffff" }}
            itemStyle={{ color: "#ffffff" }}
          />

          <Bar
            dataKey="total"
            radius={[6, 6, 6, 6]}
            barSize={26}
          >
            {dadosGrafico.map((_, index) => (
              <Cell
                key={`cell-${index}`}
                fill={CORES[index % CORES.length]}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}