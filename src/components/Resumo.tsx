import { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Movimentacao {
  id: number
  tipo: string
  situacao: string
  categoria_id: number | null
  descricao: string
  valor: number
  metodo_pagamento: string | null
  numero_parcela: string | null
  data_movimentacao: string
  data_pagamento: string | null
}

interface Categoria {
  id: number
  nome: string
  classificacao: string
  limite_gastos: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtPct = (v: number) => v.toFixed(1) + '%'

const fmtDate = (d: string | null) => {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

const MESES = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'
]

const CLASSIFICACOES = ['Despesas Essenciais', 'Despesas Não Essenciais', 'Metas / Investimentos']

const corSituacaoStyle = (s: string): React.CSSProperties => {
  switch (s) {
    case 'Pago':     return { background: '#d1fae5', color: '#065f46' }
    case 'Pendente': return { background: '#fef3c7', color: '#92400e' }
    case 'Faturado': return { background: '#dbeafe', color: '#1e40af' }
    case 'Previsto': return { background: '#f3e8ff', color: '#6b21a8' }
    default:         return { background: '#f3f4f6', color: '#374151' }
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Resumo() {
  const { user } = useAuth()
  const [householdId, setHouseholdId] = useState<string | null>(null)

  const hoje = new Date()
  const [filtroMes, setFiltroMes] = useState(hoje.getMonth() + 1)
  const [filtroAno, setFiltroAno] = useState(hoje.getFullYear())

  const [movimentacoes, setMovimentacoes] = useState<Movimentacao[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [loading, setLoading] = useState(false)

  // Drill-down: qual classificação está expandida
  const [expandida, setExpandida] = useState<string | null>(null)

  const anos = Array.from({ length: 5 }, (_, i) => hoje.getFullYear() - 2 + i)

  // ── Household ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return
    supabase.from('households').select('id').eq('owner_id', user.id).single()
      .then(({ data }) => { if (data) setHouseholdId(data.id) })
  }, [user])

  // ── Categorias ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!householdId) return
    supabase.from('categorias').select('id,nome,classificacao,limite_gastos')
      .eq('household_id', householdId)
      .not('classificacao', 'in', '("Renda Ativa","Renda Passiva")')
      .order('nome')
      .then(({ data }) => setCategorias(data || []))
  }, [householdId])

  // ── Busca movimentações do mês ───────────────────────────────────────────────
  const fetchDados = useCallback(async () => {
    if (!householdId) return
    setLoading(true)
    const mesStr = String(filtroMes).padStart(2, '0')
    const dataInicio = `${filtroAno}-${mesStr}-01`
    const ultimoDia = new Date(filtroAno, filtroMes, 0).getDate()
    const dataFim = `${filtroAno}-${mesStr}-${ultimoDia}`

    const { data } = await supabase
      .from('movimentacoes')
      .select('id,tipo,situacao,categoria_id,descricao,valor,metodo_pagamento,numero_parcela,data_movimentacao,data_pagamento')
      .eq('household_id', householdId)
      .gte('data_movimentacao', dataInicio)
      .lte('data_movimentacao', dataFim)
      .order('data_movimentacao', { ascending: false })

    setMovimentacoes(data || [])
    setLoading(false)
  }, [householdId, filtroMes, filtroAno])

  useEffect(() => { fetchDados() }, [fetchDados])

  // ── Cálculos dos cards ───────────────────────────────────────────────────────
  const totalReceitas = useMemo(() =>
    movimentacoes.filter(m => m.tipo === 'Receita' && m.situacao === 'Pago')
      .reduce((s, m) => s + Number(m.valor), 0),
    [movimentacoes]
  )

  const totalDespesas = useMemo(() =>
    movimentacoes.filter(m => entraNoReal(m))
      .reduce((s, m) => s + Number(m.valor), 0),
    [movimentacoes]
  )

  const totalPendente = useMemo(() =>
    movimentacoes.filter(m => m.tipo === 'Despesa' && m.situacao === 'Pendente' && m.numero_parcela !== 'Parcela 1/1')
      .reduce((s, m) => s + Number(m.valor), 0),
    [movimentacoes]
  )

  const saldo = totalReceitas - totalDespesas

  // Helper: despesa entra no "Real" se Pago, ou Pendente com Parcela 1/1 (à vista no cartão)
  // Faturado NÃO entra — são compras de meses anteriores
  const entraNoReal = (m: Movimentacao) => {
    if (m.tipo !== 'Despesa') return false
    if (m.situacao === 'Pago') return true
    if (m.situacao === 'Pendente' && m.numero_parcela === 'Parcela 1/1') return true
    return false
  }

  // ── Tabela de classificação ──────────────────────────────────────────────────
  // Previsto = soma dos limites das categorias de despesa daquela classificação
  // Real     = Pago + Faturado das movimentações do mês naquela classificação

  const linhasClassificacao = useMemo(() => {
    const catMap = Object.fromEntries(categorias.map(c => [c.id, c]))

    return CLASSIFICACOES.map(classif => {
      // Somente categorias de despesa — exclui Renda Ativa/Passiva por garantia
      const catsClassif = categorias.filter(c =>
        c.classificacao === classif &&
        !['Renda Ativa', 'Renda Passiva'].includes(c.classificacao)
      )

      // Previsto = soma dos limites mensais das categorias
      const previsto = catsClassif.reduce((s, c) => s + (Number(c.limite_gastos) || 0), 0)

      // Real = Pago + Faturado + Pendente Parcela 1/1 do mês nessa classificação
      const real = movimentacoes
        .filter(m => {
          if (!entraNoReal(m)) return false
          if (!m.categoria_id) return false
          const cat = catMap[m.categoria_id]
          return cat?.classificacao === classif
        })
        .reduce((s, m) => s + Number(m.valor), 0)

      const divergencia = previsto - real

      // Categorias detalhadas para drill-down
      const categoriasDrill = catsClassif.map(cat => {
        const realCat = movimentacoes
          .filter(m => entraNoReal(m) && m.categoria_id === cat.id)
          .reduce((s, m) => s + Number(m.valor), 0)
        return {
          cat,
          real: realCat,
          previsto: Number(cat.limite_gastos) || 0,
          divergencia: (Number(cat.limite_gastos) || 0) - realCat,
          movs: movimentacoes.filter(m => entraNoReal(m) && m.categoria_id === cat.id)
        }
      }).filter(d => d.real > 0 || d.previsto > 0)

      return { classif, previsto, real, divergencia, categoriasDrill }
    })
  }, [categorias, movimentacoes])

  const totalPrevisto = linhasClassificacao.reduce((s, l) => s + l.previsto, 0)
  const totalReal = linhasClassificacao.reduce((s, l) => s + l.real, 0)
  const totalDivergencia = totalPrevisto - totalReal

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: "'Segoe UI', system-ui, sans-serif", padding: '24px', maxWidth: '1100px', margin: '0 auto' }}>

      {/* Header */}
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#111827', margin: 0 }}>Resumo Financeiro</h1>
        <p style={{ color: '#6b7280', marginTop: '4px', fontSize: '13px' }}>
          Visão consolidada por classificação de despesa
        </p>
      </div>

      {/* ── Filtros ─────────────────────────────────────────────────────────── */}
      <div style={{
        background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '12px',
        padding: '14px 20px', marginBottom: '20px',
        display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap'
      }}>
        <div>
          <label style={labelStyle}>Mês</label>
          <select value={filtroMes} onChange={e => setFiltroMes(Number(e.target.value))} style={selectStyle}>
            {MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Ano</label>
          <select value={filtroAno} onChange={e => setFiltroAno(Number(e.target.value))} style={selectStyle}>
            {anos.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
      </div>

      {/* ── Cards ─────────────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px', marginBottom: '24px' }}>

        <CardInfo
          label='Receitas'
          valor={fmt(totalReceitas)}
          sub='Pago + Faturado no mês'
          cor='#065f46' bg='#d1fae5' borda='#6ee7b7'
        />
        <CardInfo
          label='Despesas'
          valor={fmt(totalDespesas)}
          sub='Pago + Faturado no mês'
          cor='#991b1b' bg='#fee2e2' borda='#fca5a5'
        />
        <CardInfo
          label='Saldo'
          valor={fmt(saldo)}
          sub='Receitas − Despesas'
          cor={saldo >= 0 ? '#065f46' : '#991b1b'}
          bg={saldo >= 0 ? '#d1fae5' : '#fee2e2'}
          borda={saldo >= 0 ? '#6ee7b7' : '#fca5a5'}
        />
        <CardInfo
          label='Pendente'
          valor={fmt(totalPendente)}
          sub='Despesas ainda não pagas'
          cor='#92400e' bg='#fef3c7' borda='#fcd34d'
        />

      </div>

      {/* ── Tabela de classificação ──────────────────────────────────────────── */}
      {loading ? (
        <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af' }}>Carregando...</div>
      ) : (
        <div style={{ border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: '#111827' }}>
                <th style={{ ...thStyle, textAlign: 'left', width: '30%' }}>Classificação</th>
                <th style={thStyle}>Previsto</th>
                <th style={{ ...thStyle, width: '60px' }}>%</th>
                <th style={thStyle}>Real</th>
                <th style={{ ...thStyle, width: '60px' }}>%</th>
                <th style={thStyle}>Divergência</th>
              </tr>
            </thead>
            <tbody>
              {linhasClassificacao.map((linha, idx) => {
                const pctPrevisto = totalPrevisto > 0 ? (linha.previsto / totalPrevisto) * 100 : 0
                const pctReal = totalReal > 0 ? (linha.real / totalReal) * 100 : 0
                const ultrapassou = linha.real > linha.previsto && linha.previsto > 0
                const aberta = expandida === linha.classif

                return (
                  <>
                    {/* Linha da classificação */}
                    <tr
                      key={linha.classif}
                      onClick={() => setExpandida(aberta ? null : linha.classif)}
                      style={{
                        background: aberta ? '#fffbeb' : idx % 2 === 0 ? '#fff' : '#fafafa',
                        borderBottom: '1px solid #f3f4f6',
                        cursor: 'pointer',
                        transition: 'background 0.1s',
                      }}
                    >
                      {/* Classificação */}
                      <td style={{ ...tdStyle, fontWeight: 500, color: '#111827' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{
                            display: 'inline-block', fontSize: '10px', color: '#9ca3af',
                            transition: 'transform 0.2s',
                            transform: aberta ? 'rotate(90deg)' : 'rotate(0deg)'
                          }}>▶</span>
                          {linha.classif}
                        </div>
                        {/* Barra de progresso */}
                        <div style={{ background: '#f3f4f6', borderRadius: '99px', height: '4px', marginTop: '5px', width: '100%' }}>
                          <div style={{
                            background: ultrapassou ? '#ef4444' : '#10b981',
                            borderRadius: '99px', height: '4px',
                            width: `${Math.min(linha.previsto > 0 ? (linha.real / linha.previsto) * 100 : 0, 100)}%`,
                            transition: 'width 0.3s'
                          }} />
                        </div>
                      </td>

                      {/* Previsto */}
                      <td style={{ ...tdStyle, textAlign: 'right', color: '#374151' }}>
                        {fmt(linha.previsto)}
                      </td>

                      {/* % Previsto */}
                      <td style={{ ...tdStyle, textAlign: 'right', color: '#9ca3af', fontSize: '12px' }}>
                        {fmtPct(pctPrevisto)}
                      </td>

                      {/* Real */}
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700 }}>
                        <span style={{
                          background: ultrapassou ? '#fee2e2' : linha.real > 0 ? '#d1fae5' : 'transparent',
                          color: ultrapassou ? '#991b1b' : linha.real > 0 ? '#065f46' : '#9ca3af',
                          padding: linha.real > 0 ? '2px 8px' : '0',
                          borderRadius: '6px',
                          display: 'inline-block',
                        }}>
                          {fmt(linha.real)}
                        </span>
                      </td>

                      {/* % Real */}
                      <td style={{ ...tdStyle, textAlign: 'right', color: '#9ca3af', fontSize: '12px' }}>
                        {fmtPct(pctReal)}
                      </td>

                      {/* Divergência */}
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600, color: linha.divergencia >= 0 ? '#065f46' : '#991b1b' }}>
                        {fmt(linha.divergencia)}
                      </td>
                    </tr>

                    {/* ── Drill-down: categorias ── */}
                    {aberta && (
                      <tr key={`drill-${linha.classif}`}>
                        <td colSpan={6} style={{ padding: 0, background: '#fffbeb', borderBottom: '2px solid #f59e0b' }}>
                          <div style={{ padding: '0 0 8px' }}>

                            {/* Sub-cabeçalho */}
                            <div style={{ background: '#fef3c7', padding: '8px 16px', borderBottom: '1px solid #fde68a', display: 'flex', gap: '8px', alignItems: 'center' }}>
                              <span style={{ fontSize: '12px', fontWeight: 700, color: '#92400e' }}>
                                📂 {linha.classif}
                              </span>
                              <span style={{ fontSize: '11px', color: '#9ca3af' }}>
                                {linha.categoriasDrill.length} categoria{linha.categoriasDrill.length !== 1 ? 's' : ''}
                              </span>
                            </div>

                            {linha.categoriasDrill.length === 0 ? (
                              <div style={{ padding: '12px 16px', color: '#9ca3af', fontSize: '12px' }}>
                                Nenhuma categoria com lançamentos neste mês.
                              </div>
                            ) : (
                              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                                <thead>
                                  <tr style={{ background: '#fef9e7' }}>
                                    <th style={{ padding: '6px 16px', textAlign: 'left', fontWeight: 600, color: '#92400e', width: '30%' }}>Categoria</th>
                                    <th style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 600, color: '#92400e' }}>Previsto</th>
                                    <th style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 600, color: '#92400e' }}>Real</th>
                                    <th style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 600, color: '#92400e' }}>%</th>
                                    <th style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 600, color: '#92400e' }}>Divergência</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {linha.categoriasDrill.map((d, ci) => {
                                    const pctLimite = d.previsto > 0 ? (d.real / d.previsto) * 100 : null
                                    const ultrapassouCat = d.real > d.previsto && d.previsto > 0

                                    return (
                                      <>
                                        <tr key={d.cat.id} style={{ background: ci % 2 === 0 ? '#fffdf5' : '#fffbeb', borderBottom: '1px solid #fef3c7' }}>
                                          <td style={{ padding: '7px 16px', color: '#374151', fontWeight: 500 }}>
                                            {d.cat.nome}
                                            {pctLimite !== null && (
                                              <div style={{ background: '#f3f4f6', borderRadius: '99px', height: '3px', marginTop: '4px', width: '120px' }}>
                                                <div style={{
                                                  background: ultrapassouCat ? '#ef4444' : pctLimite >= 80 ? '#f59e0b' : '#10b981',
                                                  borderRadius: '99px', height: '3px',
                                                  width: `${Math.min(pctLimite, 100)}%`
                                                }} />
                                              </div>
                                            )}
                                          </td>
                                          <td style={{ padding: '7px 10px', textAlign: 'right', color: '#6b7280' }}>
                                            {d.previsto > 0 ? fmt(d.previsto) : '—'}
                                          </td>
                                          <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 600, color: ultrapassouCat ? '#991b1b' : '#065f46' }}>
                                            {fmt(d.real)}
                                          </td>
                                          <td style={{ padding: '7px 10px', textAlign: 'right', color: '#9ca3af' }}>
                                            {pctLimite !== null ? fmtPct(pctLimite) : '—'}
                                          </td>
                                          <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 600, color: d.divergencia >= 0 ? '#065f46' : '#991b1b' }}>
                                            {fmt(d.divergencia)}
                                          </td>
                                        </tr>

                                        {/* Lançamentos da categoria */}
                                        {d.movs.length > 0 && (
                                          <tr key={`movs-${d.cat.id}`}>
                                            <td colSpan={5} style={{ padding: '0 0 0 32px', background: '#fffdf0' }}>
                                              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                                                <tbody>
                                                  {d.movs.map(m => (
                                                    <tr key={m.id} style={{ borderBottom: '1px solid #fef9e7' }}>
                                                      <td style={{ padding: '4px 10px', color: '#6b7280', whiteSpace: 'nowrap' }}>{fmtDate(m.data_movimentacao)}</td>
                                                      <td style={{ padding: '4px 10px', color: '#374151', fontWeight: 500 }}>{m.descricao}</td>
                                                      <td style={{ padding: '4px 10px', textAlign: 'right', color: '#991b1b', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                                        − {fmt(Number(m.valor))}
                                                      </td>
                                                      <td style={{ padding: '4px 10px', whiteSpace: 'nowrap' }}>
                                                        <span style={{ ...corSituacaoStyle(m.situacao), padding: '1px 6px', borderRadius: '99px', fontSize: '10px', fontWeight: 600 }}>
                                                          {m.situacao}
                                                        </span>
                                                      </td>
                                                    </tr>
                                                  ))}
                                                </tbody>
                                              </table>
                                            </td>
                                          </tr>
                                        )}
                                      </>
                                    )
                                  })}
                                </tbody>

                                {/* Subtotal da classificação */}
                                <tfoot>
                                  <tr style={{ background: '#fef3c7', borderTop: '1px solid #fde68a' }}>
                                    <td style={{ padding: '7px 16px', fontWeight: 700, color: '#92400e' }}>Subtotal</td>
                                    <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700, color: '#92400e' }}>{fmt(linha.previsto)}</td>
                                    <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700, color: '#92400e' }}>{fmt(linha.real)}</td>
                                    <td style={{ padding: '7px 10px', textAlign: 'right', color: '#9ca3af' }}>
                                      {totalReal > 0 ? fmtPct((linha.real / totalReal) * 100) : '—'}
                                    </td>
                                    <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700, color: linha.divergencia >= 0 ? '#065f46' : '#991b1b' }}>
                                      {fmt(linha.divergencia)}
                                    </td>
                                  </tr>
                                </tfoot>
                              </table>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}

              {/* ── Linha TOTAL ── */}
              <tr style={{ background: '#111827', borderTop: '2px solid #374151' }}>
                <td style={{ padding: '10px 14px', fontWeight: 700, color: '#f9fafb', fontSize: '13px' }}>TOTAL</td>
                <td style={{ padding: '10px 10px', textAlign: 'right', fontWeight: 700, color: '#d1d5db' }}>{fmt(totalPrevisto)}</td>
                <td style={{ padding: '10px 10px', textAlign: 'right', color: '#6b7280', fontSize: '12px' }}>100%</td>
                <td style={{ padding: '10px 10px', textAlign: 'right', fontWeight: 700, color: '#f9fafb' }}>{fmt(totalReal)}</td>
                <td style={{ padding: '10px 10px', textAlign: 'right', color: '#6b7280', fontSize: '12px' }}>100%</td>
                <td style={{ padding: '10px 10px', textAlign: 'right', fontWeight: 700, color: totalDivergencia >= 0 ? '#34d399' : '#f87171' }}>
                  {fmt(totalDivergencia)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Legenda */}
      {!loading && (
        <div style={{ marginTop: '10px', fontSize: '11px', color: '#9ca3af', display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
          <span>💡 Clique em uma classificação para ver as categorias e lançamentos</span>
          <span>* Real = Pago + Pendente À Vista (Parcela 1/1) · Faturado não entra (compras de meses anteriores) · Previsto = soma dos limites mensais</span>
        </div>
      )}

    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function CardInfo({ label, valor, sub, cor, bg, borda }: {
  label: string; valor: string; sub: string; cor: string; bg: string; borda: string
}) {
  return (
    <div style={{ background: bg, borderRadius: '12px', padding: '14px 16px', borderLeft: `4px solid ${borda}` }}>
      <div style={{ fontSize: '11px', fontWeight: 700, color: cor, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: '22px', fontWeight: 700, color: cor, margin: '6px 0 2px' }}>{valor}</div>
      <div style={{ fontSize: '11px', color: cor, opacity: 0.7 }}>{sub}</div>
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '11px', fontWeight: 600, color: '#6b7280',
  textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px'
}
const selectStyle: React.CSSProperties = {
  border: '1px solid #d1d5db', borderRadius: '8px', padding: '7px 10px',
  fontSize: '13px', background: '#fff', color: '#111827', cursor: 'pointer', height: '38px'
}
const thStyle: React.CSSProperties = {
  padding: '10px 10px', textAlign: 'right', fontWeight: 600,
  color: '#f9fafb', fontSize: '12px', borderBottom: '2px solid #374151', whiteSpace: 'nowrap'
}
const tdStyle: React.CSSProperties = {
  padding: '10px 10px', verticalAlign: 'middle'
}
