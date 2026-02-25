import type { Movimentacao } from "../types/movimentacao"

export type PendenciaAnualDTO = {
  ano: number
  categorias: string[]
  meses: string[]
  valores: Record<string, Record<string, number>>
  totalPorMes: Record<string, number>
  totalPorCategoria: Record<string, number>
  totalGeral: number
}

export class PendenteService {
  private movimentacoes: Movimentacao[]

  constructor(movimentacoes: Movimentacao[]) {
    this.movimentacoes = movimentacoes
  }

  public getPendenciasAnuais(ano: number): PendenciaAnualDTO {
    const pendentes = this.movimentacoes.filter((m) => {
      const situacao = m["Situação"]?.toString().trim().toLowerCase()
      const tipo = m["Tipo"]?.toString().trim().toLowerCase()
      const dataPagamento = m["Data do Pagamento"]

      if (situacao !== "pendente") return false
      if (tipo !== "despesa") return false
      if (!dataPagamento) return false

      return dataPagamento.getFullYear() === ano
    })

    const meses = Array.from({ length: 12 }, (_, i) => {
      const mes = String(i + 1).padStart(2, "0")
      return `${ano}-${mes}`
    })

    const valores: Record<string, Record<string, number>> = {}
    const totalPorMes: Record<string, number> = {}
    const totalPorCategoria: Record<string, number> = {}

    let totalGeral = 0

    meses.forEach((mes) => {
      totalPorMes[mes] = 0
    })

    pendentes.forEach((m) => {
      const categoria = m["Categoria"]
      const dataPagamento = m["Data do Pagamento"]!
      const mes = `${ano}-${String(
        dataPagamento.getMonth() + 1
      ).padStart(2, "0")}`

      const valor = Number(m["Valor"]) || 0

      if (!valores[categoria]) {
        valores[categoria] = {}
        meses.forEach((mes) => {
          valores[categoria][mes] = 0
        })
        totalPorCategoria[categoria] = 0
      }

      valores[categoria][mes] += valor
      totalPorMes[mes] += valor
      totalPorCategoria[categoria] += valor
      totalGeral += valor
    })

    const categorias = Object.keys(valores).sort()

    return {
      ano,
      categorias,
      meses,
      valores,
      totalPorMes,
      totalPorCategoria,
      totalGeral,
    }
  }

  // 🔥 NOVO MÉTODO
  public getTotalPendenteAtual(): number {
    const hoje = new Date()

    return this.movimentacoes
      .filter((m) => {
        const situacao = m["Situação"]?.toString().trim().toLowerCase()
        const tipo = m["Tipo"]?.toString().trim().toLowerCase()
        const dataPagamento = m["Data do Pagamento"]

        if (situacao !== "pendente") return false
        if (tipo !== "despesa") return false
        if (!dataPagamento) return false

        return dataPagamento <= hoje
      })
      .reduce((total, m) => total + (Number(m["Valor"]) || 0), 0)
  }
}