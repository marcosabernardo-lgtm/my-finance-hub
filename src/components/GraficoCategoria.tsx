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
  quantidade: number;
  percentual: number;
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
  const agrupado: Record<
    string,
    { total: number; quantidade: number }
  > = {};

  dados.forEach((mov) => {
    if (!agrupado[mov.Categoria]) {
      agrupado[mov.Categoria] = {
        total: 0,
        quantidade: 0,
      };
    }

    agrupado[mov.Categoria].total += mov.Valor;
    agrupado[mov.Categoria].quantidade += 1;
  });

  const totalGeral = Object.values(agrupado).reduce(
    (acc, item) => acc + item.total,
    0
  );

  const dadosGrafico: CategoriaTotal[] = Object.entries(
    agrupado
  )
    .map(([categoria, dados]) => ({
      categoria,
      total: dados.total,
      quantidade: dados.quantidade,
      percentual:
        totalGeral > 0
          ? (dados.total / totalGeral) * 100
          : 0,
    }))
    .sort((a, b) => b.total - a.total);

  const formatarMoeda = (valor: number) =>
    valor.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });

  if (dadosGrafico.length === 0) return null;

  // 🔥 Controle profissional de altura
  const alturaPorItem = 55;
  const alturaMinima = 300;

  const alturaGrafico = Math.max(
    dadosGrafico.length * alturaPorItem,
    alturaMinima
  );

  return (
    <div style={{ width: "100%", height: alturaGrafico }}>
      {/* TÍTULO + TOTAL */}
      <div style={{ marginBottom: 20 }}>
        <h3>Gastos por Categoria</h3>
        <div style={{ fontSize: 14, opacity: 0.8 }}>
          Total Geral: {formatarMoeda(totalGeral)}
        </div>
      </div>

      <ResponsiveContainer>
        <BarChart
          data={dadosGrafico}
          layout="vertical"
          margin={{ top: 10, right: 130, left: 10, bottom: 10 }}
          barCategoryGap={18}
        >
          <XAxis type="number" hide />

          <YAxis
            dataKey="categoria"
            type="category"
            width={240}
            tick={{ fill: "#ffffff", fontSize: 13 }}
          />

          <Tooltip
            formatter={(value: any) =>
              formatarMoeda(Number(value))
            }
            contentStyle={{
              backgroundColor: "#1f1f1f",
              border: "1px solid #333",
              borderRadius: 8,
              color: "#ffffff",
            }}
            labelStyle={{ color: "#ffffff" }}
            itemStyle={{ color: "#ffffff" }}
            cursor={{ fill: "rgba(255,255,255,0.05)" }}
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

            <LabelList
              content={(props: any) => {
                const { x, y, width, payload } = props;

                if (!payload) return null;

                const texto = `${formatarMoeda(
                  payload.total
                )} (${payload.percentual.toFixed(1)}%)`;

                return (
                  <text
                    x={x + width + 8}
                    y={y + 12}
                    fill="#ffffff"
                    fontSize={12}
                    fontWeight={500}
                  >
                    {texto}
                  </text>
                );
              }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {/* QUANTIDADE DE COMPRAS */}
      <div
        style={{
          marginTop: 30,
          fontSize: 13,
          opacity: 0.85,
        }}
      >
        {dadosGrafico.map((item) => (
          <div key={item.categoria}>
            {item.categoria}: {item.quantidade} compras
          </div>
        ))}
      </div>
    </div>
  );
}