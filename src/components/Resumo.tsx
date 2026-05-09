import { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'

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
    case 'Pago':     return { background: 'var(--badge-pago-bg)',     color: 'var(--badge-pago-fg)' }
    case 'Pendente': return { background: 'var(--badge-pendente-bg)', color: 'var(--badge-pendente-fg)' }
    case 'Faturado': return { background: 'var(--badge-faturado-bg)', color: 'var(--badge-faturado-fg)' }
    case 'Previsto': return { background: 'var(--badge-previsto-bg)', color: 'var(--badge-previsto-fg)' }
    default:         return { background: 'var(--bg-row2)',           color: 'var(--text-4)' }
  }
}

// ── entraNoReal ────────────────────────────────────────────────────────────────
// Objetivo: identificar o que foi GASTO no mês, independente de forma de pagamento
// Crédito (à vista ou parcelado): Pendente ou Faturado → compra realizada no mês
// Débito / PIX / Dinheiro / Boleto: Pago → saiu do caixa no mês
// Nunca entra: Previsto
const entraNoReal = (m: {
  tipo: string
  situacao: string
  numero_parcela: string | null
  metodo_pagamento?: string | null
  data_movimentacao?: string
  data_pagamento?: string | null
}) => {
  if (m.tipo !== 'Despesa') return false
  if (m.situacao === 'Previsto') return false

  const isCredito = m.metodo_pagamento?.startsWith('Crédito') ?? false

  if (isCredito) return m.situacao === 'Pendente'

  return m.situacao === 'Pago'
}

export default function Resumo() {
  const { user } = useAuth()
  const [householdId, setHouseholdId] = useState<string | null>(null)

  const hoje = new Date()
  const [filtroMes, setFiltroMes] = useState(hoje.getMonth() + 1)
  const [filtroAno, setFiltroAno] = useState(hoje.getFullYear())

  const [movimentacoes, setMovimentacoes] = useState<Movimentacao[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [loading, setLoading] = useState(false)

  const [expandida, setExpandida] = useState<string | null>(null)

  const anos = Array.from({ length: 5 }, (_, i) => hoje.getFullYear() - 2 + i)

  useEffect(() => {
    if (!user) return
    supabase.from('households').select('id').eq('owner_id', user.id).single()
      .then(({ data }) => { if (data) setHouseholdId(data.id) })
  }, [user])

  useEffect(() => {
    if (!householdId) return
    supabase.from('categorias').select('id,nome,classificacao,limite_gastos')
      .eq('household_id', householdId)
      .not('classificacao', 'in', '("Renda Ativa","Renda Passiva")')
      .order('nome')
      .then(({ data }) => setCategorias(data || []))
  }, [householdId])

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

  const totalReceitas = useMemo(() =>
    movimentacoes.filter(m =>
      m.tipo === 'Receita' &&
      m.situacao === 'Pago' &&
      m.metodo_pagamento !== 'Transferência entre Contas'
    ).reduce((s, m) => s + Number(m.valor), 0),
    [movimentacoes]
  )

  // Despesas débito/PIX/Dinheiro/Boleto pagas no mês
  const totalDespesasDebito = useMemo(() =>
    movimentacoes.filter(m =>
      m.tipo === 'Despesa' &&
      m.situacao === 'Pago' &&
      !(m.metodo_pagamento?.startsWith('Crédito') ?? false)
    ).reduce((s, m) => s + Number(m.valor), 0),
    [movimentacoes]
  )

  // Despesas crédito realizadas no mês (à vista ou parcelado, situação Pendente)
  const totalDespesasCredito = useMemo(() =>
    movimentacoes.filter(m =>
      m.tipo === 'Despesa' &&
      m.situacao === 'Pendente' &&
      (m.metodo_pagamento?.startsWith('Crédito') ?? false)
    ).reduce((s, m) => s + Number(m.valor), 0),
    [movimentacoes]
  )

  const totalDespesas = totalDespesasDebito + totalDespesasCredito
  const saldo = totalReceitas - totalDespesas

  const linhasClassificacao = useMemo(() => {
    const catMap = Object.fromEntries(categorias.map(c => [c.id, c]))

    return CLASSIFICACOES.map(classif => {
      const catsClassif = categorias.filter(c =>
        c.classificacao === classif &&
        !['Renda Ativa', 'Renda Passiva'].includes(c.classificacao)
      )

      const previsto = catsClassif.reduce((s, c) => s + (Number(c.limite_gastos) || 0), 0)

      const real = movimentacoes
        .filter(m => {
          if (!entraNoReal(m)) return false
          if (!m.categoria_id) return false
          const cat = catMap[m.categoria_id]
          return cat?.classificacao === classif
        })
        .reduce((s, m) => s + Number(m.valor), 0)

      const divergencia = previsto - real

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

  return (
    <div style={{ fontFamily: "'Segoe UI', system-ui, sans-serif", padding: '24px', maxWidth: '1100px', margin: '0 auto' }}>

      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>Resumo Financeiro</h1>
        <p style={{ color: 'var(--text-2)', marginTop: '4px', fontSize: '13px' }}>
          Visão consolidada por classificação de despesa
        </p>
      </div>

      <div style={{ background: 'var(--bg-row)', border: '1px solid var(--border)', borderRadius: '12px', padding: '14px 20px', marginBottom: '20px', display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px', marginBottom: '24px' }}>
        <CardInfo label='Receitas' valor={fmt(totalReceitas)} sub='Pago no mês' cor='var(--text-success)' bg='var(--bg-success-soft)' borda='var(--text-success)'/>
        <CardInfo label='Despesas Débito / PIX' valor={fmt(totalDespesasDebito)} sub='Pago no mês' cor='var(--text-danger)' bg='var(--bg-danger-soft)' borda='var(--text-danger)'/>
        <CardInfo label='Despesas Crédito' valor={fmt(totalDespesasCredito)} sub='Compras realizadas no mês' cor='var(--text-warning)' bg='var(--bg-warning-soft)' borda='var(--text-warning)'/>
        <CardInfo label='Total Gasto' valor={fmt(totalDespesas)} sub='Débito + Crédito à Vista' cor={saldo >= 0 ? 'var(--text-success)' : 'var(--text-danger)'} bg={saldo >= 0 ? 'var(--bg-success-soft)' : 'var(--bg-danger-soft)'} borda={saldo >= 0 ? 'var(--text-success)' : 'var(--text-danger)'}/>
      </div>

      {loading ? (
        <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-3)' }}>Carregando...</div>
      ) : (
        <div style={{ border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
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
                    <tr key={linha.classif} onClick={() => setExpandida(aberta ? null : linha.classif)}
                      style={{ background: aberta ? 'var(--bg-warning-soft)' : idx % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-row2)', borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.1s' }}>
                      <td style={{ ...tdStyle, fontWeight: 500, color: 'var(--text-1)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ display: 'inline-block', fontSize: '10px', color: 'var(--text-3)', transition: 'transform 0.2s', transform: aberta ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
                          {linha.classif}
                        </div>
                        <div style={{ background: 'var(--bg-row2)', borderRadius: '99px', height: '4px', marginTop: '5px', width: '100%' }}>
                          <div style={{ background: ultrapassou ? '#ef4444' : '#10b981', borderRadius: '99px', height: '4px', width: `${Math.min(linha.previsto > 0 ? (linha.real / linha.previsto) * 100 : 0, 100)}%`, transition: 'width 0.3s' }} />
                        </div>
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right', color: 'var(--text-4)' }}>{fmt(linha.previsto)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', color: 'var(--text-3)', fontSize: '12px' }}>{fmtPct(pctPrevisto)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700 }}>
                        <span style={{ background: ultrapassou ? 'var(--bg-danger-soft)' : linha.real > 0 ? 'var(--bg-success-soft)' : 'transparent', color: ultrapassou ? 'var(--text-danger)' : linha.real > 0 ? 'var(--text-success)' : 'var(--text-3)', padding: linha.real > 0 ? '2px 8px' : '0', borderRadius: '6px', display: 'inline-block' }}>
                          {fmt(linha.real)}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right', color: 'var(--text-3)', fontSize: '12px' }}>{fmtPct(pctReal)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600, color: linha.divergencia >= 0 ? 'var(--text-success)' : 'var(--text-danger)' }}>{fmt(linha.divergencia)}</td>
                    </tr>

                    {aberta && (
                      <tr key={`drill-${linha.classif}`}>
                        <td colSpan={6} style={{ padding: 0, background: 'var(--bg-card)', borderBottom: '2px solid var(--border)' }}>
                          <div style={{ padding: '0 0 8px' }}>
                            <div style={{ background: 'var(--bg-row2)', padding: '8px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: '8px', alignItems: 'center' }}>
                              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-1)' }}>📂 {linha.classif}</span>
                              <span style={{ fontSize: '11px', color: 'var(--text-3)' }}>{linha.categoriasDrill.length} categoria{linha.categoriasDrill.length !== 1 ? 's' : ''}</span>
                            </div>
                            {linha.categoriasDrill.length === 0 ? (
                              <div style={{ padding: '12px 16px', color: 'var(--text-3)', fontSize: '12px' }}>Nenhuma categoria com lançamentos neste mês.</div>
                            ) : (
                              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                                <thead>
                                  <tr style={{ background: 'var(--bg-row2)', borderBottom: '1px solid var(--border)' }}>
                                    <th style={{ padding: '6px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--text-2)', width: '30%' }}>Categoria</th>
                                    <th style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 600, color: 'var(--text-2)' }}>Previsto</th>
                                    <th style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 600, color: 'var(--text-2)' }}>Real</th>
                                    <th style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 600, color: 'var(--text-2)' }}>%</th>
                                    <th style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 600, color: 'var(--text-2)' }}>Divergência</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {linha.categoriasDrill.map((d, ci) => {
                                    const pctLimite = d.previsto > 0 ? (d.real / d.previsto) * 100 : null
                                    const ultrapassouCat = d.real > d.previsto && d.previsto > 0
                                    return (
                                      <>
                                        <tr key={d.cat.id} style={{ background: ci % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-row)', borderBottom: '1px solid var(--border)' }}>
                                          <td style={{ padding: '7px 16px', color: 'var(--text-4)', fontWeight: 500 }}>
                                            {d.cat.nome}
                                            {pctLimite !== null && (
                                              <div style={{ background: 'var(--bg-row2)', borderRadius: '99px', height: '3px', marginTop: '4px', width: '120px' }}>
                                                <div style={{ background: ultrapassouCat ? '#ef4444' : pctLimite >= 80 ? '#f59e0b' : '#10b981', borderRadius: '99px', height: '3px', width: `${Math.min(pctLimite, 100)}%` }} />
                                              </div>
                                            )}
                                          </td>
                                          <td style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--text-2)' }}>{d.previsto > 0 ? fmt(d.previsto) : '—'}</td>
                                          <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 600, color: ultrapassouCat ? 'var(--text-danger)' : 'var(--text-success)' }}>{fmt(d.real)}</td>
                                          <td style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--text-3)' }}>{pctLimite !== null ? fmtPct(pctLimite) : '—'}</td>
                                          <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 600, color: d.divergencia >= 0 ? 'var(--text-success)' : 'var(--text-danger)' }}>{fmt(d.divergencia)}</td>
                                        </tr>
                                        {d.movs.length > 0 && (
                                          <tr key={`movs-${d.cat.id}`}>
                                            <td colSpan={5} style={{ padding: '0 0 0 32px', background: 'var(--bg-row)' }}>
                                              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                                                <tbody>
                                                  {d.movs.map(m => (
                                                    <tr key={m.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                                      <td style={{ padding: '4px 10px', color: 'var(--text-2)', whiteSpace: 'nowrap' }}>{fmtDate(m.data_movimentacao)}</td>
                                                      <td style={{ padding: '4px 10px', color: 'var(--text-4)', fontWeight: 500 }}>{m.descricao}</td>
                                                      <td style={{ padding: '4px 10px', textAlign: 'right', color: 'var(--text-danger)', fontWeight: 600, whiteSpace: 'nowrap' }}>− {fmt(Number(m.valor))}</td>
                                                      <td style={{ padding: '4px 10px', whiteSpace: 'nowrap' }}>
                                                        <span style={{ ...corSituacaoStyle(m.situacao), padding: '1px 6px', borderRadius: '99px', fontSize: '10px', fontWeight: 600 }}>{m.situacao}</span>
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
                                <tfoot>
                                  <tr style={{ background: 'var(--bg-row2)', borderTop: '1px solid var(--border)' }}>
                                    <td style={{ padding: '7px 16px', fontWeight: 700, color: 'var(--text-2)' }}>Subtotal</td>
                                    <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700, color: 'var(--text-2)' }}>{fmt(linha.previsto)}</td>
                                    <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700, color: 'var(--text-2)' }}>{fmt(linha.real)}</td>
                                    <td style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--text-3)' }}>{totalReal > 0 ? fmtPct((linha.real / totalReal) * 100) : '—'}</td>
                                    <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700, color: linha.divergencia >= 0 ? 'var(--text-success)' : 'var(--text-danger)' }}>{fmt(linha.divergencia)}</td>
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

              <tr style={{ background: '#111827', borderTop: '2px solid #374151' }}>
                <td style={{ padding: '10px 14px', fontWeight: 700, color: '#f9fafb', fontSize: '13px' }}>TOTAL</td>
                <td style={{ padding: '10px 10px', textAlign: 'right', fontWeight: 700, color: '#d1d5db' }}>{fmt(totalPrevisto)}</td>
                <td style={{ padding: '10px 10px', textAlign: 'right', color: '#6b7280', fontSize: '12px' }}>100%</td>
                <td style={{ padding: '10px 10px', textAlign: 'right', fontWeight: 700, color: '#f9fafb' }}>{fmt(totalReal)}</td>
                <td style={{ padding: '10px 10px', textAlign: 'right', color: '#6b7280', fontSize: '12px' }}>100%</td>
                <td style={{ padding: '10px 10px', textAlign: 'right', fontWeight: 700, color: totalDivergencia >= 0 ? '#34d399' : '#f87171' }}>{fmt(totalDivergencia)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {!loading && (
        <div style={{ marginTop: '10px', fontSize: '11px', color: 'var(--text-3)', display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
          <span>💡 Clique em uma classificação para ver as categorias e lançamentos</span>
          <span>* Real = Pago Débito/PIX + Crédito Pendente (compras do mês) · Previsto = soma dos limites mensais</span>
        </div>
      )}
    </div>
  )
}

function CardInfo({ label, valor, sub, cor, bg, borda }: { label: string; valor: string; sub: string; cor: string; bg: string; borda: string }) {
  return (
    <div style={{ background: bg, borderRadius: '12px', padding: '14px 16px', borderLeft: `4px solid ${borda}` }}>
      <div style={{ fontSize: '11px', fontWeight: 700, color: cor, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: '22px', fontWeight: 700, color: cor, margin: '6px 0 2px' }}>{valor}</div>
      <div style={{ fontSize: '11px', color: cor, opacity: 0.7 }}>{sub}</div>
    </div>
  )
}

const labelStyle: React.CSSProperties = { display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }
const selectStyle: React.CSSProperties = { border: '1px solid var(--border-input)', borderRadius: '8px', padding: '7px 10px', fontSize: '13px', background: 'var(--bg-input)', color: 'var(--text-1)', cursor: 'pointer', height: '38px' }
const thStyle: React.CSSProperties = { padding: '10px 10px', textAlign: 'right', fontWeight: 600, color: '#f9fafb', fontSize: '12px', borderBottom: '2px solid #374151', whiteSpace: 'nowrap' }
const tdStyle: React.CSSProperties = { padding: '10px 10px', verticalAlign: 'middle' }
