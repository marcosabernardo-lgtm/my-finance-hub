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
import type { Movimentacao } from "../types/movimentacao";

type Props = {
  dados: Movimentacao[];
};

type CategoriaTotal = {
  categoria: string;
  total: number;
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
    if (!agrupado[mov.Categoria]) {
      agrupado[mov.Categoria] = 0;
    }
    agrupado[mov.Categoria] += mov.Valor;
  });

  const dadosGrafico: CategoriaTotal[] = Object.entries(agrupado)
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

  if (dadosGrafico.length === 0) return null;

  return (
    <div style={{ width: "100%", height: 520 }}>
      <h3 style={{ marginBottom: 20 }}>Gastos por Categoria</h3>

      <ResponsiveContainer>
        <BarChart
          data={dadosGrafico}
          layout="vertical"
          margin={{ top: 10, right: 80, left: 10, bottom: 10 }}
        >
          <XAxis type="number" hide />
          <YAxis
            dataKey="categoria"
            type="category"
            width={240}
          />
          <Tooltip
            formatter={(value) =>
              formatarMoeda(Number(value))
            }
          />
          <Bar dataKey="total">
            {dadosGrafico.map((_, index) => (
              <Cell
                key={`cell-${index}`}
                fill={CORES[index % CORES.length]}
              />
            ))}

            <LabelList
              dataKey="total"
              position="right"
              formatter={(value: number) =>
                formatarMoeda(value)
              }
              style={{
                fill: "#ffffff",
                fontSize: 12,
                fontWeight: 500,
              }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}