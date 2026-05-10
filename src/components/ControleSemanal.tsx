import React, { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useMobile } from '../hooks/useMobile'

interface MovimentacaoDetalhe {
  id: number
  descricao: string
  valor: number
  situacao: string
  metodo_pagamento: string | null
  numero_parcela: string | null
  data_movimentacao: string
  semana_do_mes: number | null
}

interface LinhaControle {
  categoriaId: number
  categoria: string
  classificacao: string
  limiteMensal: number
  limiteSemanal: number
  totalReal: number
  divergencia: number
  semanas: Record<number, number>
  movsPorSemana: Record<number, MovimentacaoDetalhe[]>
  movsTotal: MovimentacaoDetalhe[]
}

interface DrillKey { categoriaId: number; semana: number }

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const fmtDate = (d: string | null) => {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

const MESES = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'
]

const corSituacao = (s: string): React.CSSProperties => {
  switch (s) {
    case 'Pago':     return { background: 'var(--badge-pago-bg)',     color: 'var(--badge-pago-fg)' }
    case 'Pendente': return { background: 'var(--badge-pendente-bg)', color: 'var(--badge-pendente-fg)' }
    case 'Faturado': return { background: 'var(--badge-faturado-bg)', color: 'var(--badge-faturado-fg)' }
    case 'Previsto': return { background: 'var(--badge-previsto-bg)', color: 'var(--badge-previsto-fg)' }
    default:         return { background: 'var(--bg-row2)',           color: 'var(--text-4)' }
  }
}

// ─── Regra ────────────────────────────────────────────────────────────────────
// Objetivo: identificar o que foi GASTO no mês, independente de forma de pagamento
// Crédito (à vista ou parcelado): Pendente ou Faturado → compra realizada no mês
// Débito / PIX / Dinheiro / Boleto: Pago → saiu do caixa no mês
// Nunca entra: Previsto
const deveEntrar = (m: {
  tipo: string
  situacao: string
  metodo_pagamento: string | null
  numero_parcela: string | null
}) => {
  if (m.tipo !== 'Despesa') return false
  if (m.situacao === 'Previsto') return false

  const metodo = (m.metodo_pagamento || '').toLowerCase()
  const isCredito = metodo.startsWith('crédito') || metodo.startsWith('credito')

  if (isCredito) return m.situacao === 'Pendente'

  return m.situacao === 'Pago'
}

export default function ControleSemanal() {
  const { user } = useAuth()
  const isMobile = useMobile()
  const [householdId, setHouseholdId] = useState<string | null>(null)

  const hoje = new Date()
  const [filtroMes, setFiltroMes] = useState(hoje.getMonth() + 1)
  const [filtroAno, setFiltroAno] = useState(hoje.getFullYear())

  const [linhas, setLinhas] = useState<LinhaControle[]>([])
  const [loading, setLoading] = useState(false)
  const [drill, setDrill] = useState<DrillKey | null>(null)

  useEffect(() => {
    if (!user) return
    supabase
      .from('households').select('id').eq('owner_id', user.id).single()
      .then(({ data }) => { if (data) setHouseholdId(data.id) })
  }, [user])

  const fetchDados = useCallback(async () => {
    if (!householdId) return
    setLoading(true)

    const mesStr = String(filtroMes).padStart(2, '0')
    const dataInicio = `${filtroAno}-${mesStr}-01`
    const ultimoDia = new Date(filtroAno, filtroMes, 0).getDate()
    const dataFim = `${filtroAno}-${mesStr}-${ultimoDia}`

    const { data: cats2 } = await supabase
      .from('categorias')
      .select('id, nome, classificacao, limite_gastos')
      .eq('household_id', householdId)
      .neq('classificacao', 'Renda Ativa')
      .neq('classificacao', 'Renda Passiva')
      .order('nome')

    const { data: movs } = await supabase
      .from('movimentacoes')
      .select('id, tipo, situacao, metodo_pagamento, numero_parcela, valor, categoria_id, semana_do_mes, descricao, data_movimentacao')
      .eq('household_id', householdId)
      .eq('tipo', 'Despesa')
      .gte('data_movimentacao', dataInicio)
      .lte('data_movimentacao', dataFim)

    const todasCats = cats2 || []
    const todasMovs = movs || []

    const movsValidas = todasMovs.filter(m => deveEntrar({
      tipo: m.tipo,
      situacao: m.situacao,
      metodo_pagamento: m.metodo_pagamento,
      numero_parcela: m.numero_parcela,
    }))

    const mapCatSemana: Record<number, Record<number, number>> = {}
    const mapCatTotal: Record<number, number> = {}
    const mapMovsSemana: Record<number, Record<number, MovimentacaoDetalhe[]>> = {}
    const mapMovsTotal: Record<number, MovimentacaoDetalhe[]> = {}

    for (const m of movsValidas) {
      const catId = m.categoria_id
      if (!catId) continue
      const semana = Number(m.semana_do_mes) || 0
      const valor = Number(m.valor)

      if (!mapCatSemana[catId]) mapCatSemana[catId] = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
      if (!mapCatTotal[catId]) mapCatTotal[catId] = 0
      if (!mapMovsSemana[catId]) mapMovsSemana[catId] = { 1: [], 2: [], 3: [], 4: [], 5: [] }
      if (!mapMovsTotal[catId]) mapMovsTotal[catId] = []

      if (semana >= 1 && semana <= 5) {
        mapCatSemana[catId][semana] += valor
        mapMovsSemana[catId][semana].push(m as MovimentacaoDetalhe)
      }
      mapCatTotal[catId] += valor
      mapMovsTotal[catId].push(m as MovimentacaoDetalhe)
    }

    const linhasComLancamentos: LinhaControle[] = []

    for (const cat of todasCats) {
      const total = mapCatTotal[cat.id] || 0
      if (total === 0 && !mapCatSemana[cat.id]) continue

      const limite = Number(cat.limite_gastos) || 0
      const limiteSemanal = limite > 0 ? limite / 4 : 0
      const semanas = mapCatSemana[cat.id] || { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }

      linhasComLancamentos.push({
        categoriaId: cat.id,
        categoria: cat.nome,
        classificacao: cat.classificacao,
        limiteMensal: limite,
        limiteSemanal,
        totalReal: total,
        divergencia: limite - total,
        semanas,
        movsPorSemana: mapMovsSemana[cat.id] || { 1: [], 2: [], 3: [], 4: [], 5: [] },
        movsTotal: mapMovsTotal[cat.id] || [],
      })
    }

    linhasComLancamentos.sort((a, b) => {
      if (a.classificacao !== b.classificacao) return a.classificacao.localeCompare(b.classificacao)
      return a.categoria.localeCompare(b.categoria)
    })

    setLinhas(linhasComLancamentos)
    setDrill(null)
    setLoading(false)
  }, [householdId, filtroMes, filtroAno])

  useEffect(() => { fetchDados() }, [fetchDados])

  const totalLimiteMensal  = linhas.reduce((s, l) => s + l.limiteMensal, 0)
  const totalLimiteSemanal = linhas.reduce((s, l) => s + l.limiteSemanal, 0)
  const totalReal          = linhas.reduce((s, l) => s + l.totalReal, 0)
  const totalDivergencia   = totalLimiteMensal - totalReal
  const totalSemanas: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  for (const l of linhas) {
    for (let s = 1; s <= 5; s++) totalSemanas[s] += l.semanas[s] || 0
  }

  const corReal = (real: number, limite: number) => {
    if (limite === 0) return real > 0 ? '#EF4444' : '#9CA3AF'
    return real > limite ? '#EF4444' : '#10B981'
  }

  const corDivergencia = (div: number) => div >= 0 ? '#10B981' : '#EF4444'

  const corSemanaCell = (valor: number, limiteSemanal: number) => {
    if (valor === 0) return { color: '#9CA3AF', bg: 'transparent' }
    if (limiteSemanal === 0) return { color: '#F59E0B', bg: 'transparent' }
    const pct = valor / limiteSemanal
    if (pct > 1)    return { color: '#fff', bg: '#EF4444' }
    if (pct >= 0.8) return { color: '#fff', bg: '#F59E0B' }
    return { color: '#fff', bg: '#10B981' }
  }

  const anos = Array.from({ length: 5 }, (_, i) => hoje.getFullYear() - 2 + i)
  const classificacaoAtual = { value: '' }

  const toggleDrill = (categoriaId: number, semana: number, valor: number) => {
    if (valor === 0) return
    setDrill(prev =>
      prev?.categoriaId === categoriaId && prev?.semana === semana
        ? null
        : { categoriaId, semana }
    )
  }

  return (
    <div style={{ fontFamily: "'Segoe UI', system-ui, sans-serif", padding: isMobile ? '12px' : '24px', maxWidth: '1400px', margin: '0 auto' }}>

      <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>Controle Semanal</h1>
          <p style={{ color: 'var(--text-2)', marginTop: '4px', fontSize: '13px' }}>
            Clique em qualquer valor para ver os lançamentos · débito e PIX: somente Pago · cartão: à vista e parcelado
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <select value={filtroMes} onChange={e => setFiltroMes(Number(e.target.value))} style={selectStyle}>
            {MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
          <select value={filtroAno} onChange={e => setFiltroAno(Number(e.target.value))} style={selectStyle}>
            {anos.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
      </div>

      {!isMobile && (
        <div style={{ display: 'flex', gap: '16px', marginBottom: '16px', flexWrap: 'wrap' }}>
          {[
            { cor: '#10B981', label: 'Dentro do limite (< 80%)' },
            { cor: '#F59E0B', label: 'Atenção (80–100%)' },
            { cor: '#EF4444', label: 'Ultrapassou (> 100%)' },
            { cor: '#9CA3AF', label: 'Sem gasto' },
          ].map(l => (
            <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-2)' }}>
              <span style={{ width: '12px', height: '12px', borderRadius: '3px', background: l.cor, display: 'inline-block' }} />
              {l.label}
            </div>
          ))}
        </div>
      )}

      <div style={{ border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-3)' }}>Carregando...</div>
        ) : linhas.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-3)' }}>
            Nenhuma despesa encontrada para {MESES[filtroMes - 1]} {filtroAno}.
          </div>
        ) : (
          <div style={{ overflowX: 'auto', maxHeight: '75vh', overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#111827', position: 'sticky', top: 0, zIndex: 10 }}>
                  {(isMobile
                  ? ['Categoria', 'Real', 'Divergência']
                  : ['Categoria', 'Limite Mensal', 'Real', 'Divergência', 'Limite Semanal', 'Semana 1', 'Semana 2', 'Semana 3', 'Semana 4', 'Semana 5']
                ).map(col => (
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
                  let separador = null
                  if (linha.classificacao !== classificacaoAtual.value) {
                    classificacaoAtual.value = linha.classificacao
                    separador = (
                      <tr key={`sep-${linha.classificacao}`}>
                        <td colSpan={isMobile ? 3 : 10} style={{
                          padding: '6px 10px', background: 'var(--bg-row2)',
                          fontSize: '11px', fontWeight: 700, color: 'var(--text-2)',
                          textTransform: 'uppercase', letterSpacing: '0.06em',
                          borderTop: idx > 0 ? '2px solid var(--border)' : 'none',
                          borderBottom: '1px solid var(--border)'
                        }}>
                          {linha.classificacao}
                        </td>
                      </tr>
                    )
                  }

                  const drillRealAberto = drill?.categoriaId === linha.categoriaId && drill?.semana === 0
                  const rowBg = idx % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-row2)'

                  return (
                    <React.Fragment key={linha.categoriaId}>
                      {separador}
                      <tr style={{ background: drillRealAberto ? 'var(--bg-warning-soft)' : rowBg, borderBottom: '1px solid var(--border)' }}>
                        <td style={{ ...tdBase, fontWeight: 500, color: 'var(--text-1)', whiteSpace: 'nowrap' }}>
                          {linha.categoria}
                        </td>
                        {!isMobile && <td style={{ ...tdNum, color: 'var(--text-2)' }}>{fmt(linha.limiteMensal)}</td>}
                        <td
                          style={{ ...tdNum, fontWeight: 700, color: corReal(linha.totalReal, linha.limiteMensal), cursor: 'pointer', textDecoration: 'underline dotted', textUnderlineOffset: '3px' }}
                          onClick={() => toggleDrill(linha.categoriaId, 0, linha.totalReal)}
                          title="Ver lançamentos"
                        >
                          {fmt(linha.totalReal)}
                        </td>
                        <td style={{ ...tdNum, color: corDivergencia(linha.divergencia), fontWeight: 600 }}>
                          {fmt(linha.divergencia)}
                        </td>
                        {!isMobile && <td style={{ ...tdNum, color: 'var(--text-2)' }}>{fmt(linha.limiteSemanal)}</td>}
                        {!isMobile && [1, 2, 3, 4, 5].map(s => {
                          const val = linha.semanas[s] || 0
                          const { color, bg } = corSemanaCell(val, linha.limiteSemanal)
                          const aberto = drill?.categoriaId === linha.categoriaId && drill?.semana === s
                          return (
                            <td
                              key={s}
                              onClick={() => toggleDrill(linha.categoriaId, s, val)}
                              title={val > 0 ? 'Ver lançamentos da semana' : ''}
                              style={{
                                ...tdNum, fontWeight: 600,
                                cursor: val > 0 ? 'pointer' : 'default',
                                background: aberto ? 'var(--bg-warning-soft)' : 'transparent',
                                borderBottom: aberto ? '2px solid var(--border-warning)' : 'none',
                              }}
                            >
                              {val === 0
                                ? <span style={{ color: '#d1d5db' }}>{fmt(0)}</span>
                                : (
                                  <span style={{
                                    display: 'inline-block', background: bg,
                                    borderRadius: '6px',
                                    padding: bg !== 'transparent' ? '2px 8px' : '0',
                                    color, textDecoration: 'underline dotted', textUnderlineOffset: '3px',
                                  }}>
                                    {fmt(val)}
                                  </span>
                                )
                              }
                            </td>
                          )
                        })}
                        {isMobile && null}
                      </tr>

                      {(drill?.categoriaId === linha.categoriaId) && drill !== null && (() => {
                        const movsDrill = drill.semana === 0
                          ? linha.movsTotal
                          : (linha.movsPorSemana[drill.semana] || [])
                        const titulo = drill.semana === 0
                          ? `${linha.categoria} — Todos os lançamentos do mês`
                          : `${linha.categoria} — Semana ${drill.semana}`

                        return (
                          <tr>
                            <td colSpan={isMobile ? 3 : 10} style={{ padding: 0, background: 'var(--bg-warning-soft)', borderBottom: '2px solid var(--border-warning)' }}>
                              <div style={{ padding: '12px 16px 14px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                  <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-1)' }}>
                                    📋 {titulo}
                                    <span style={{ fontWeight: 400, color: 'var(--text-3)', marginLeft: '8px', fontSize: '12px' }}>
                                      {movsDrill.length} lançamento{movsDrill.length !== 1 ? 's' : ''}
                                    </span>
                                  </div>
                                  <button
                                    onClick={() => setDrill(null)}
                                    style={{ background: 'none', border: 'none', fontSize: '16px', cursor: 'pointer', color: 'var(--text-3)' }}
                                  >×</button>
                                </div>
                                {movsDrill.length === 0 ? (
                                  <div style={{ color: 'var(--text-3)', fontSize: '12px' }}>Nenhum lançamento.</div>
                                ) : (
                                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                                    <thead>
                                      <tr style={{ background: 'var(--bg-row2)', borderBottom: '1px solid var(--border)' }}>
                                        {(isMobile ? ['Data','Descrição','Valor'] : ['Data','Descrição','Valor','Situação','Método','Parcela']).map(h => (
                                          <th key={h} style={{
                                            padding: '5px 10px',
                                            textAlign: h === 'Valor' ? 'right' : 'left',
                                            fontWeight: 600, color: 'var(--text-2)', whiteSpace: 'nowrap'
                                          }}>{h}</th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {movsDrill
                                        .slice()
                                        .sort((a, b) => a.data_movimentacao.localeCompare(b.data_movimentacao))
                                        .map((m, i) => (
                                          <tr key={m.id} style={{ background: i % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-row)', borderBottom: '1px solid var(--border)' }}>
                                            <td style={tdDrill}>{fmtDate(m.data_movimentacao)}</td>
                                            <td style={{ ...tdDrill, fontWeight: 500, maxWidth: isMobile ? 120 : 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.descricao}</td>
                                            <td style={{ ...tdDrill, textAlign: 'right', fontWeight: 700, color: 'var(--text-danger)' }}>{fmt(Number(m.valor))}</td>
                                            {!isMobile && <td style={tdDrill}>
                                              <span style={{ ...corSituacao(m.situacao), padding: '2px 7px', borderRadius: '99px', fontSize: '11px', fontWeight: 600 }}>
                                                {m.situacao}
                                              </span>
                                            </td>}
                                            {!isMobile && <td style={{ ...tdDrill, color: 'var(--text-2)' }}>{m.metodo_pagamento || '—'}</td>}
                                            {!isMobile && <td style={{ ...tdDrill, color: 'var(--text-2)' }}>{m.numero_parcela || '—'}</td>}
                                          </tr>
                                        ))}
                                    </tbody>
                                    <tfoot>
                                      <tr style={{ background: 'var(--bg-row2)', borderTop: '1px solid var(--border)' }}>
                                        <td colSpan={2} style={{ padding: '5px 10px', fontWeight: 700, color: 'var(--text-2)' }}>Total</td>
                                        <td style={{ padding: '5px 10px', textAlign: 'right', fontWeight: 700, color: 'var(--text-danger)' }}>
                                          {fmt(movsDrill.reduce((s, m) => s + Number(m.valor), 0))}
                                        </td>
                                        <td colSpan={3} />
                                      </tr>
                                    </tfoot>
                                  </table>
                                )}
                              </div>
                            </td>
                          </tr>
                        )
                      })()}
                    </React.Fragment>
                  )
                })}

                <tr style={{ background: '#111827', borderTop: '2px solid #374151' }}>
                  <td style={{ ...tdBase, fontWeight: 700, color: '#f9fafb' }}>TOTAL</td>
                  {!isMobile && <td style={{ ...tdNum, color: '#d1d5db', fontWeight: 700 }}>{fmt(totalLimiteMensal)}</td>}
                  <td style={{ ...tdNum, fontWeight: 700, color: corReal(totalReal, totalLimiteMensal) }}>{fmt(totalReal)}</td>
                  <td style={{ ...tdNum, fontWeight: 700, color: totalDivergencia >= 0 ? '#34d399' : '#f87171' }}>{fmt(totalDivergencia)}</td>
                  {!isMobile && <td style={{ ...tdNum, color: 'var(--text-3)' }}>{fmt(totalLimiteSemanal)}</td>}
                  {!isMobile && [1, 2, 3, 4, 5].map(s => {
                    const val = totalSemanas[s] || 0
                    return (
                      <td key={s} style={{ ...tdNum, fontWeight: 700, color: val > 0 ? corReal(val, totalLimiteSemanal) : '#4b5563' }}>
                        {fmt(val)}
                      </td>
                    )
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {!loading && linhas.length > 0 && (
        <div style={{ marginTop: '10px', fontSize: '11px', color: 'var(--text-3)', textAlign: 'right' }}>
          * Inclui: Débito/PIX/Dinheiro (Pago) · Cartão à vista e parcelado (Pendente) &nbsp;|&nbsp; Exclui: Faturado · Previsto
        </div>
      )}
    </div>
  )
}

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

const tdDrill: React.CSSProperties = {
  padding: '5px 10px',
  color: 'var(--text-4)',
  verticalAlign: 'middle',
}

const selectStyle: React.CSSProperties = {
  border: '1px solid var(--border-input)', borderRadius: '8px', padding: '7px 10px',
  fontSize: '13px', background: 'var(--bg-input)', color: 'var(--text-1)', cursor: 'pointer', height: '38px'
}
