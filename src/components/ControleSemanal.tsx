import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'

// ─── Types ────────────────────────────────────────────────────────────────────

interface LinhaControle {
  categoria: string
  classificacao: string
  limiteMensal: number
  limiteSemanal: number
  totalReal: number
  divergencia: number
  semanas: Record<number, number>
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const MESES = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'
]

// Regra: entra no cálculo se...
// - tipo = Despesa
// - situacao != Previsto
// - metodo != Cartão de Crédito  OU  (metodo = Cartão de Crédito AND forma_pagamento contém 'vista' ou 'Vista')
const deveEntrar = (m: {
  tipo: string
  situacao: string
  metodo_pagamento: string | null
  forma_pagamento: string | null
}) => {
  if (m.tipo !== 'Despesa') return false
  if (m.situacao === 'Previsto') return false

  if (m.metodo_pagamento === 'Cartão de Crédito') {
    // só entra se for à vista
    const fp = (m.forma_pagamento || '').toLowerCase()
    return fp.includes('vista') || fp === 'a vista' || fp === 'à vista'
  }

  return true
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ControleSemanal() {
  const { user } = useAuth()
  const [householdId, setHouseholdId] = useState<string | null>(null)

  const hoje = new Date()
  const [filtroMes, setFiltroMes] = useState(hoje.getMonth() + 1)
  const [filtroAno, setFiltroAno] = useState(hoje.getFullYear())

  const [linhas, setLinhas] = useState<LinhaControle[]>([])
  const [loading, setLoading] = useState(false)

  // ── Household ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return
    supabase
      .from('households').select('id').eq('owner_id', user.id).single()
      .then(({ data }) => { if (data) setHouseholdId(data.id) })
  }, [user])

  // ── Busca e processa dados ──────────────────────────────────────────────────
  const fetchDados = useCallback(async () => {
    if (!householdId) return
    setLoading(true)

    const mesStr = String(filtroMes).padStart(2, '0')
    const dataInicio = `${filtroAno}-${mesStr}-01`
    const ultimoDia = new Date(filtroAno, filtroMes, 0).getDate()
    const dataFim = `${filtroAno}-${mesStr}-${ultimoDia}`

    // Busca categorias de despesa com limite
    const { data: cats } = await supabase
      .from('categorias')
      .select('id, nome, classificacao, limite_gastos')
      .eq('household_id', householdId)
      .eq('classificacao', 'Despesas Essenciais')
      .order('nome')

    // Busca também não essenciais e metas
    const { data: cats2 } = await supabase
      .from('categorias')
      .select('id, nome, classificacao, limite_gastos')
      .eq('household_id', householdId)
      .neq('classificacao', 'Renda Ativa')
      .neq('classificacao', 'Renda Passiva')
      .order('nome')

    // Busca movimentações do período (todas despesas)
    const { data: movs } = await supabase
      .from('movimentacoes')
      .select('id, tipo, situacao, metodo_pagamento, forma_pagamento, valor, categoria_id, semana_do_mes')
      .eq('household_id', householdId)
      .eq('tipo', 'Despesa')
      .gte('data_movimentacao', dataInicio)
      .lte('data_movimentacao', dataFim)

    const todasCats = cats2 || cats || []
    const todasMovs = movs || []

    // Filtra movimentações que entram no cálculo
    const movsValidas = todasMovs.filter(m => deveEntrar({
      tipo: m.tipo,
      situacao: m.situacao,
      metodo_pagamento: m.metodo_pagamento,
      forma_pagamento: m.forma_pagamento,
    }))

    // Agrupa por categoria_id → semana
    const mapCatSemana: Record<number, Record<number, number>> = {}
    const mapCatTotal: Record<number, number> = {}

    for (const m of movsValidas) {
      const catId = m.categoria_id
      if (!catId) continue
      const semana = Number(m.semana_do_mes) || 0
      const valor = Number(m.valor)

      if (!mapCatSemana[catId]) mapCatSemana[catId] = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
      if (!mapCatTotal[catId]) mapCatTotal[catId] = 0

      if (semana >= 1 && semana <= 5) mapCatSemana[catId][semana] += valor
      mapCatTotal[catId] += valor
    }

    // Monta linhas — só categorias que têm lançamentos no mês
    const linhasComLancamentos: LinhaControle[] = []

    for (const cat of todasCats) {
      const total = mapCatTotal[cat.id] || 0
      // Só inclui se tiver lançamento no mês
      if (total === 0 && !mapCatSemana[cat.id]) continue

      const limite = Number(cat.limite_gastos) || 0
      const limiteSemanal = limite > 0 ? limite / 4 : 0
      const semanas = mapCatSemana[cat.id] || { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }

      linhasComLancamentos.push({
        categoria: cat.nome,
        classificacao: cat.classificacao,
        limiteMensal: limite,
        limiteSemanal,
        totalReal: total,
        divergencia: limite - total,
        semanas,
      })
    }

    // Ordena por classificação e depois nome
    linhasComLancamentos.sort((a, b) => {
      if (a.classificacao !== b.classificacao) return a.classificacao.localeCompare(b.classificacao)
      return a.categoria.localeCompare(b.categoria)
    })

    // Linha TOTAL
    const total: LinhaControle = {
      categoria: 'TOTAL',
      classificacao: '',
      limiteMensal: linhasComLancamentos.reduce((s, l) => s + l.limiteMensal, 0),
      limiteSemanal: linhasComLancamentos.reduce((s, l) => s + l.limiteSemanal, 0),
      totalReal: linhasComLancamentos.reduce((s, l) => s + l.totalReal, 0),
      divergencia: 0,
      semanas: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    }
    total.divergencia = total.limiteMensal - total.totalReal
    for (let s = 1; s <= 5; s++) {
      total.semanas[s] = linhasComLancamentos.reduce((sum, l) => sum + (l.semanas[s] || 0), 0)
    }

    setLinhas([...linhasComLancamentos, total])
    setLoading(false)
  }, [householdId, filtroMes, filtroAno])

  useEffect(() => { fetchDados() }, [fetchDados])

  // ── Cores ───────────────────────────────────────────────────────────────────
  const corReal = (real: number, limite: number) => {
    if (limite === 0) return real > 0 ? '#EF4444' : '#9CA3AF'
    return real > limite ? '#EF4444' : '#10B981'
  }

  const corDivergencia = (div: number) => div >= 0 ? '#10B981' : '#EF4444'

  const corSemana = (valor: number, limiteSemanal: number) => {
    if (valor === 0) return { color: '#9CA3AF', bg: 'transparent' }
    if (limiteSemanal === 0) return { color: '#F59E0B', bg: 'transparent' }
    const pct = valor / limiteSemanal
    if (pct > 1)   return { color: '#fff', bg: '#EF4444' }   // vermelho — ultrapassou
    if (pct >= 0.8) return { color: '#fff', bg: '#F59E0B' }  // amarelo — perto do limite
    return { color: '#fff', bg: '#10B981' }                   // verde — ok
  }

  const anos = Array.from({ length: 5 }, (_, i) => hoje.getFullYear() - 2 + i)

  // ── Agrupa por classificação para separadores ────────────────────────────────
  const classificacaoAtual = { value: '' }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ fontFamily: "'Segoe UI', system-ui, sans-serif", padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>

      {/* Header */}
      <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#111827', margin: 0 }}>Controle Semanal</h1>
          <p style={{ color: '#6b7280', marginTop: '4px', fontSize: '13px' }}>
            Despesas reais por categoria e semana — débito, PIX, dinheiro, boleto e cartão à vista
          </p>
        </div>

        {/* Seletor mês/ano */}
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <select
            value={filtroMes}
            onChange={e => setFiltroMes(Number(e.target.value))}
            style={selectStyle}
          >
            {MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
          <select
            value={filtroAno}
            onChange={e => setFiltroAno(Number(e.target.value))}
            style={selectStyle}
          >
            {anos.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
      </div>

      {/* Legenda */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '16px', flexWrap: 'wrap' }}>
        {[
          { cor: '#10B981', label: 'Dentro do limite (< 80%)' },
          { cor: '#F59E0B', label: 'Atenção (80–100%)' },
          { cor: '#EF4444', label: 'Ultrapassou (> 100%)' },
          { cor: '#9CA3AF', label: 'Sem gasto' },
        ].map(l => (
          <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#6b7280' }}>
            <span style={{ width: '12px', height: '12px', borderRadius: '3px', background: l.cor, display: 'inline-block' }} />
            {l.label}
          </div>
        ))}
      </div>

      {/* Tabela */}
      <div style={{ border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af' }}>Carregando...</div>
        ) : linhas.length <= 1 ? (
          <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af' }}>
            Nenhuma despesa encontrada para {MESES[filtroMes - 1]} {filtroAno}.
          </div>
        ) : (
          <div style={{ overflowX: 'auto', maxHeight: '70vh', overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>

              {/* Cabeçalho fixo */}
              <thead>
                <tr style={{ background: '#111827', position: 'sticky', top: 0, zIndex: 10 }}>
                  {['Categoria', 'Limite Mensal', 'Real', 'Divergência', 'Limite Semanal', 'Semana 1', 'Semana 2', 'Semana 3', 'Semana 4', 'Semana 5'].map(col => (
                    <th key={col} style={{
                      padding: '10px 10px', textAlign: col === 'Categoria' ? 'left' : 'right',
                      fontWeight: 600, color: '#f9fafb', fontSize: '12px',
                      borderBottom: '2px solid #374151', whiteSpace: 'nowrap'
                    }}>
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {linhas.map((linha, idx) => {
                  const isTotal = linha.categoria === 'TOTAL'

                  // Separador de classificação
                  let separador = null
                  if (!isTotal && linha.classificacao !== classificacaoAtual.value) {
                    classificacaoAtual.value = linha.classificacao
                    separador = (
                      <tr key={`sep-${linha.classificacao}`}>
                        <td colSpan={10} style={{
                          padding: '6px 10px', background: '#f3f4f6',
                          fontSize: '11px', fontWeight: 700, color: '#6b7280',
                          textTransform: 'uppercase', letterSpacing: '0.06em',
                          borderTop: idx > 0 ? '2px solid #e5e7eb' : 'none',
                          borderBottom: '1px solid #e5e7eb'
                        }}>
                          {linha.classificacao}
                        </td>
                      </tr>
                    )
                  }

                  const rowBg = isTotal ? '#111827' : idx % 2 === 0 ? '#fff' : '#fafafa'
                  const textColor = isTotal ? '#f9fafb' : '#374151'

                  return (
                    <>
                      {separador}
                      <tr key={linha.categoria} style={{ background: rowBg, borderBottom: '1px solid #f3f4f6' }}>

                        {/* Categoria */}
                        <td style={{ ...tdBase, color: textColor, fontWeight: isTotal ? 700 : 500, whiteSpace: 'nowrap' }}>
                          {linha.categoria}
                        </td>

                        {/* Limite Mensal */}
                        <td style={{ ...tdNum, color: isTotal ? '#d1d5db' : '#6b7280', fontWeight: isTotal ? 700 : 400 }}>
                          {fmt(linha.limiteMensal)}
                        </td>

                        {/* Real */}
                        <td style={{ ...tdNum, color: isTotal ? corReal(linha.totalReal, linha.limiteMensal) : corReal(linha.totalReal, linha.limiteMensal), fontWeight: 700 }}>
                          {fmt(linha.totalReal)}
                        </td>

                        {/* Divergência */}
                        <td style={{ ...tdNum, color: corDivergencia(linha.divergencia), fontWeight: 600 }}>
                          {linha.divergencia >= 0 ? '' : ''}{fmt(linha.divergencia)}
                        </td>

                        {/* Limite Semanal */}
                        <td style={{ ...tdNum, color: isTotal ? '#d1d5db' : '#6b7280' }}>
                          {fmt(linha.limiteSemanal)}
                        </td>

                        {/* Semanas 1–5 */}
                        {[1, 2, 3, 4, 5].map(s => {
                          const val = linha.semanas[s] || 0
                          const { color, bg } = isTotal
                            ? { color: val > 0 ? corReal(val, linha.limiteSemanal) : '#6b7280', bg: 'transparent' }
                            : corSemana(val, linha.limiteSemanal)

                          return (
                            <td key={s} style={{
                              ...tdNum,
                              color: isTotal ? color : color,
                              fontWeight: 600,
                            }}>
                              {val === 0
                                ? <span style={{ color: isTotal ? '#4b5563' : '#d1d5db' }}>{fmt(0)}</span>
                                : (
                                  <span style={{
                                    display: 'inline-block',
                                    background: bg,
                                    borderRadius: '6px',
                                    padding: bg !== 'transparent' ? '2px 6px' : '0',
                                    color,
                                  }}>
                                    {fmt(val)}
                                  </span>
                                )
                              }
                            </td>
                          )
                        })}

                      </tr>
                    </>
                  )
                })}
              </tbody>

            </table>
          </div>
        )}
      </div>

      {/* Nota de rodapé */}
      {!loading && linhas.length > 1 && (
        <div style={{ marginTop: '10px', fontSize: '11px', color: '#9ca3af', textAlign: 'right' }}>
          * Inclui: Débito · PIX · Dinheiro · Boleto · Cartão de Crédito à vista &nbsp;|&nbsp; Exclui: Cartão parcelado · Situação Previsto
        </div>
      )}

    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const tdBase: React.CSSProperties = {
  padding: '8px 10px',
  verticalAlign: 'middle',
}

const tdNum: React.CSSProperties = {
  padding: '8px 10px',
  textAlign: 'right',
  verticalAlign: 'middle',
  whiteSpace: 'nowrap',
}

const selectStyle: React.CSSProperties = {
  border: '1px solid #d1d5db', borderRadius: '8px', padding: '7px 10px',
  fontSize: '13px', background: '#fff', color: '#111827', cursor: 'pointer', height: '38px'
}
