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

interface LinhaConsumo {
  catId: number
  nome: string
  classificacao: string
  limite: number
  meses: Record<number, number>
  total: number
  movsPorMes: Record<number, Movimentacao[]>
}

interface DrillKey { catId: number; mes: number }

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt     = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtDate = (d: string | null) => { if (!d) return '—'; const [y,m,day] = d.split('-'); return `${day}/${m}/${y}` }
const getMes  = (d: string) => Number(d.split('-')[1])
const getAno  = (d: string) => Number(d.split('-')[0])

const MESES_CURTOS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
const CLASSIFICACOES = ['Despesas Essenciais','Despesas Não Essenciais','Metas / Investimentos']

const corSituacao = (s: string): React.CSSProperties => {
  switch (s) {
    case 'Pago':     return { background: 'var(--badge-pago-bg)', color: 'var(--badge-pago-fg)' }
    case 'Pendente': return { background: 'var(--badge-pendente-bg)', color: 'var(--badge-pendente-fg)' }
    case 'Faturado': return { background: 'var(--badge-faturado-bg)', color: 'var(--badge-faturado-fg)' }
    default:         return { background: 'var(--bg-row2)', color: 'var(--text-4)' }
  }
}

// Regra: o que foi comprado/gasto no mês (pela data_movimentacao)
// Crédito: Pendente (compra recente, fatura não paga) + Faturado (histórico, fatura já paga)
// Não-crédito: Pago
const deveEntrar = (m: Movimentacao) => {
  if (m.tipo !== 'Despesa') return false
  if (m.situacao === 'Previsto') return false
  const isCredito = m.metodo_pagamento?.startsWith('Crédito') ?? false
  if (isCredito) return ['Pendente', 'Faturado'].includes(m.situacao)
  return m.situacao === 'Pago'
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ConsumoMensal() {
  const { user } = useAuth()
  const [householdId, setHouseholdId] = useState<string | null>(null)

  const hoje = new Date()
  const mesAtual = hoje.getMonth() + 1
  const [ano, setAno] = useState(hoje.getFullYear())

  const [movimentacoes, setMovimentacoes] = useState<Movimentacao[]>([])
  const [categorias, setCategorias]       = useState<Categoria[]>([])
  const [loading, setLoading]             = useState(false)
  const [drill, setDrill]                 = useState<DrillKey | null>(null)

  const anos = Array.from({ length: 5 }, (_, i) => hoje.getFullYear() - 2 + i)

  useEffect(() => {
    if (!user) return
    supabase.from('households').select('id').eq('owner_id', user.id).single()
      .then(({ data }) => { if (data) setHouseholdId(data.id) })
  }, [user])

  useEffect(() => {
    if (!householdId) return
    supabase.from('categorias')
      .select('id,nome,classificacao,limite_gastos')
      .eq('household_id', householdId)
      .not('classificacao', 'in', '("Renda Ativa","Renda Passiva")')
      .order('nome')
      .then(({ data }) => setCategorias(data || []))
  }, [householdId])

  const fetchDados = useCallback(async () => {
    if (!householdId) return
    setLoading(true)

    // Busca por data_movimentacao — mantém a compra no mês em que ocorreu
    // independente de quando a fatura foi paga (Faturado)
    const { data } = await supabase
      .from('movimentacoes')
      .select('id,tipo,situacao,categoria_id,descricao,valor,metodo_pagamento,numero_parcela,data_movimentacao,data_pagamento')
      .eq('household_id', householdId)
      .eq('tipo', 'Despesa')
      .in('situacao', ['Pago', 'Pendente', 'Faturado'])
      .gte('data_movimentacao', `${ano}-01-01`)
      .lte('data_movimentacao', `${ano}-12-31`)

    setMovimentacoes(data || [])
    setDrill(null)
    setLoading(false)
  }, [householdId, ano])

  useEffect(() => { fetchDados() }, [fetchDados])

  // ── Linhas por categoria ──────────────────────────────────────────────────────

  const linhas = useMemo((): LinhaConsumo[] => {
    const catMap  = Object.fromEntries(categorias.map(c => [c.id, c]))
    const accVal:  Record<number, Record<number, number>>      = {}
    const accMovs: Record<number, Record<number, Movimentacao[]>> = {}

    for (const m of movimentacoes) {
      if (!deveEntrar(m)) continue
      if (!m.categoria_id) continue
      const mes = getMes(m.data_movimentacao)
      if (getAno(m.data_movimentacao) !== ano) continue

      if (!accVal[m.categoria_id])  accVal[m.categoria_id]  = {}
      if (!accMovs[m.categoria_id]) accMovs[m.categoria_id] = {}
      if (!accMovs[m.categoria_id][mes]) accMovs[m.categoria_id][mes] = []

      accVal[m.categoria_id][mes]  = (accVal[m.categoria_id][mes] || 0) + Number(m.valor)
      accMovs[m.categoria_id][mes].push(m)
    }

    return Object.entries(accVal)
      .map(([catIdStr, mesesVal]): LinhaConsumo | null => {
        const catId = Number(catIdStr)
        const cat   = catMap[catId]
        if (!cat) return null
        const total = Object.values(mesesVal).reduce((s, v) => s + v, 0)
        return {
          catId, nome: cat.nome, classificacao: cat.classificacao,
          limite: Number(cat.limite_gastos) || 0,
          meses: mesesVal, total,
          movsPorMes: accMovs[catId] || {},
        }
      })
      .filter((l): l is LinhaConsumo => l !== null)
      .sort((a, b) => {
        const ia = CLASSIFICACOES.indexOf(a.classificacao)
        const ib = CLASSIFICACOES.indexOf(b.classificacao)
        if (ia !== ib) return ia - ib
        return a.nome.localeCompare(b.nome)
      })
  }, [movimentacoes, categorias, ano])

  // ── Totais ────────────────────────────────────────────────────────────────────

  const mesesCorrente = ano < hoje.getFullYear() ? 12 : ano > hoje.getFullYear() ? 0 : mesAtual
  const meses12       = Array.from({ length: 12 }, (_, i) => i + 1)

  const totalMes   = (m: number) => linhas.reduce((s, l) => s + (l.meses[m] || 0), 0)
  const totalGeral = linhas.reduce((s, l) => s + l.total, 0)
  const mediaGeral = mesesCorrente > 0
    ? Array.from({ length: mesesCorrente }, (_, i) => totalMes(i + 1)).reduce((s, v) => s + v, 0) / mesesCorrente
    : 0

  // ── Drill ─────────────────────────────────────────────────────────────────────

  const toggleDrill = (catId: number, mes: number, valor: number) => {
    if (valor === 0) return
    setDrill(prev => prev?.catId === catId && prev?.mes === mes ? null : { catId, mes })
  }

  const drillMovs = useMemo(() => {
    if (!drill) return []
    const linha = linhas.find(l => l.catId === drill.catId)
    return (linha?.movsPorMes[drill.mes] || []).sort((a, b) => a.data_movimentacao.localeCompare(b.data_movimentacao))
  }, [drill, linhas])

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div style={{ fontFamily: "'Segoe UI', system-ui, sans-serif", padding: '24px', maxWidth: '100%' }}>

      {/* Cabeçalho */}
      <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>Consumo Mensal</h1>
          <p style={{ color: 'var(--text-2)', marginTop: '4px', fontSize: '13px' }}>
            O que foi comprado/gasto por mês — crédito pelo mês da compra, não do pagamento da fatura
          </p>
        </div>
        <div>
          <label style={labelStyle}>Ano</label>
          <select value={ano} onChange={e => { setAno(Number(e.target.value)); setDrill(null) }} style={selectStyle}>
            {anos.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
      </div>

      {/* Cards resumo */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '20px' }}>
        <div style={{ background: '#fee2e2', borderRadius: '12px', padding: '14px 16px', borderLeft: '4px solid #ef4444' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#991b1b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total {ano}</div>
          <div style={{ fontSize: '22px', fontWeight: 700, color: '#991b1b', margin: '6px 0 2px' }}>{fmt(totalGeral)}</div>
        </div>
        <div style={{ background: '#fef3c7', borderRadius: '12px', padding: '14px 16px', borderLeft: '4px solid #f59e0b' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Média Mensal</div>
          <div style={{ fontSize: '22px', fontWeight: 700, color: '#92400e', margin: '6px 0 2px' }}>{mesesCorrente > 0 ? fmt(mediaGeral) : '—'}</div>
          <div style={{ fontSize: '11px', color: '#92400e', opacity: 0.7 }}>Baseada em {mesesCorrente} meses</div>
        </div>
        <div style={{ background: '#eff6ff', borderRadius: '12px', padding: '14px 16px', borderLeft: '4px solid #3b82f6' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#1e40af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{MESES_CURTOS[mesAtual - 1]} {ano}</div>
          <div style={{ fontSize: '22px', fontWeight: 700, color: '#1e40af', margin: '6px 0 2px' }}>{fmt(totalMes(mesAtual))}</div>
          <div style={{ fontSize: '11px', color: '#1e40af', opacity: 0.7 }}>Mês atual</div>
        </div>
      </div>

      {/* Legenda */}
      <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'center', background: 'var(--bg-row)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 16px', marginBottom: '12px', fontSize: '12px', color: 'var(--text-4)' }}>
        <span style={{ color: 'var(--text-2)', fontWeight: 600, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Legenda:</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: '#374151', display: 'inline-block' }} />Dentro do limite</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: '#f59e0b', display: 'inline-block' }} /><span style={{ color: '#92400e' }}>Acima de 80%</span></span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ef4444', display: 'inline-block' }} /><span style={{ color: '#991b1b' }}>Acima do limite</span></span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><span style={{ width: 12, height: 12, borderRadius: '2px', background: '#eff6ff', border: '1px solid #bfdbfe', display: 'inline-block' }} /><span style={{ color: '#1e40af' }}>Mês atual</span></span>
      </div>

      {/* Tabela */}
      {loading ? (
        <div style={{ padding: '64px', textAlign: 'center', color: 'var(--text-3)' }}>Carregando...</div>
      ) : (
        <div style={{ border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ background: '#111827' }}>
                  <th style={{ ...thBase, textAlign: 'left', minWidth: '170px', position: 'sticky', left: 0, background: '#111827', zIndex: 11 }}>Categoria</th>
                  <th style={{ ...thBase, minWidth: '85px', background: '#1f2937' }}>Limite/mês</th>
                  {meses12.map(m => {
                    const isAtual = ano === hoje.getFullYear() && m === mesAtual
                    return (
                      <th key={m} style={{ ...thBase, minWidth: '80px', background: isAtual ? '#1e3a5f' : '#111827', color: isAtual ? '#fbbf24' : '#f9fafb', borderBottom: isAtual ? '2px solid #fbbf24' : '2px solid #374151' }}>
                        {MESES_CURTOS[m - 1]}
                      </th>
                    )
                  })}
                  <th style={{ ...thBase, minWidth: '90px', background: '#1f2937' }}>Total</th>
                  <th style={{ ...thBase, minWidth: '80px', background: '#1f2937', color: '#fbbf24' }}>Média/mês</th>
                </tr>
              </thead>

              <tbody>
                {CLASSIFICACOES.map(classif => {
                  const linhasClassif = linhas.filter(l => l.classificacao === classif)
                  if (linhasClassif.length === 0) return null
                  const totalClassifMes = (m: number) => linhasClassif.reduce((s, l) => s + (l.meses[m] || 0), 0)
                  const totalClassif    = linhasClassif.reduce((s, l) => s + l.total, 0)
                  const mediaClassif    = mesesCorrente > 0
                    ? Array.from({ length: mesesCorrente }, (_, i) => totalClassifMes(i + 1)).reduce((s, v) => s + v, 0) / mesesCorrente
                    : 0

                  return (
                    <>
                      {/* Header classificação */}
                      <tr key={`head-${classif}`}>
                        <td colSpan={16} style={{ padding: '6px 12px', background: 'var(--bg-row2)', fontSize: '11px', fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.06em', borderTop: '2px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
                          {classif}
                        </td>
                      </tr>

                      {/* Linhas de categoria */}
                      {linhasClassif.map(linha => {
                        const mediaMes = mesesCorrente > 0
                          ? Array.from({ length: mesesCorrente }, (_, i) => linha.meses[i + 1] || 0).reduce((s, v) => s + v, 0) / mesesCorrente
                          : 0
                        return (
                          <>
                            <tr key={linha.catId} style={{ borderBottom: '1px solid var(--border)' }}>
                              <td style={{ ...tdFixo, color: '#374151', fontWeight: 500 }}>{linha.nome}</td>
                              <td style={{ ...tdNum, background: 'var(--bg-row)', color: 'var(--text-3)', fontSize: '11px' }}>
                                {linha.limite > 0 ? fmt(linha.limite) : '—'}
                              </td>
                              {meses12.map(m => {
                                const v = linha.meses[m] || 0
                                const isAtual = ano === hoje.getFullYear() && m === mesAtual
                                const aberto  = drill?.catId === linha.catId && drill?.mes === m
                                const pct     = linha.limite > 0 ? v / linha.limite : null
                                let corValor  = 'var(--border-input)'
                                if (v > 0) {
                                  if (pct !== null) corValor = pct > 1 ? '#ef4444' : pct >= 0.8 ? '#f59e0b' : 'var(--text-4)'
                                  else corValor = 'var(--text-4)'
                                }
                                return (
                                  <td key={m}
                                    onClick={() => toggleDrill(linha.catId, m, v)}
                                    title={v > 0 ? 'Clique para ver lançamentos' : ''}
                                    style={{ ...tdNum, color: corValor, fontWeight: v > 0 ? 600 : 400, background: aberto ? '#fffbeb' : isAtual ? '#eff6ff' : 'transparent', cursor: v > 0 ? 'pointer' : 'default', borderBottom: aberto ? '2px solid #f59e0b' : 'none', transition: 'background 0.1s' }}>
                                    {v > 0
                                      ? <span style={{ textDecoration: 'underline dotted', textUnderlineOffset: '3px' }}>{fmt(v)}</span>
                                      : <span style={{ color: 'var(--border)' }}>—</span>
                                    }
                                  </td>
                                )
                              })}
                              <td style={{ ...tdNum, background: 'var(--bg-row)', fontWeight: 700, color: '#991b1b' }}>
                                <div>{fmt(linha.total)}</div>
                                {linha.limite > 0 && (
                                  <div style={{ fontSize: '10px', color: linha.total > linha.limite * 12 ? '#ef4444' : '#9ca3af', fontWeight: 400 }}>
                                    {((linha.total / (linha.limite * 12)) * 100).toFixed(0)}% do limite anual
                                  </div>
                                )}
                              </td>
                              <td style={{ ...tdNum, background: 'var(--bg-warning-soft)', fontWeight: 600, color: '#92400e', fontSize: '12px' }}>
                                <div>{mesesCorrente > 0 ? fmt(mediaMes) : '—'}</div>
                                {linha.limite > 0 && mesesCorrente > 0 && (
                                  <div style={{ fontSize: '10px', color: mediaMes > linha.limite ? '#ef4444' : '#9ca3af', fontWeight: 400 }}>
                                    {((mediaMes / linha.limite) * 100).toFixed(0)}% do limite
                                  </div>
                                )}
                              </td>
                            </tr>

                            {/* Drill-down */}
                            {drill?.catId === linha.catId && drill !== null && (
                              <tr key={`drill-${linha.catId}-${drill.mes}`}>
                                <td colSpan={16} style={{ padding: 0, background: '#fffbeb', borderBottom: '2px solid #f59e0b' }}>
                                  <div style={{ padding: '12px 16px 16px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                      <div style={{ fontSize: '13px', fontWeight: 700, color: '#92400e' }}>
                                        📋 {linha.nome} — {MESES_CURTOS[drill.mes - 1]}/{ano}
                                        <span style={{ fontWeight: 400, color: '#9ca3af', marginLeft: '8px', fontSize: '12px' }}>
                                          {drillMovs.length} lançamento{drillMovs.length !== 1 ? 's' : ''}
                                        </span>
                                      </div>
                                      <button onClick={() => setDrill(null)} style={{ background: 'none', border: 'none', fontSize: '16px', cursor: 'pointer', color: '#9ca3af' }}>×</button>
                                    </div>
                                    {drillMovs.length === 0 ? (
                                      <div style={{ color: '#9ca3af', fontSize: '13px' }}>Nenhum lançamento.</div>
                                    ) : (
                                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                                        <thead>
                                          <tr style={{ background: '#fef3c7', borderBottom: '1px solid #fde68a' }}>
                                            {['Data','Descrição','Valor','Método','Parcela','Situação'].map(h => (
                                              <th key={h} style={{ padding: '6px 10px', textAlign: h === 'Valor' ? 'right' : 'left', fontWeight: 600, color: '#92400e', whiteSpace: 'nowrap' }}>{h}</th>
                                            ))}
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {drillMovs.map((m, idx) => (
                                            <tr key={m.id} style={{ background: idx % 2 === 0 ? '#fffdf0' : '#fffbeb', borderBottom: '1px solid #fef3c7' }}>
                                              <td style={tdDrill}>{fmtDate(m.data_movimentacao)}</td>
                                              <td style={{ ...tdDrill, fontWeight: 500, maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.descricao}</td>
                                              <td style={{ ...tdDrill, textAlign: 'right', fontWeight: 700, color: '#991b1b' }}>{fmt(Number(m.valor))}</td>
                                              <td style={tdDrill}>{m.metodo_pagamento || '—'}</td>
                                              <td style={tdDrill}>{m.numero_parcela || '—'}</td>
                                              <td style={tdDrill}>
                                                <span style={{ ...corSituacao(m.situacao), padding: '2px 8px', borderRadius: '99px', fontSize: '11px', fontWeight: 600 }}>{m.situacao}</span>
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                        <tfoot>
                                          <tr style={{ background: '#fef3c7', borderTop: '1px solid #fde68a' }}>
                                            <td colSpan={2} style={{ padding: '6px 10px', fontWeight: 700, color: '#92400e' }}>Total</td>
                                            <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700, color: '#991b1b' }}>
                                              {fmt(drillMovs.reduce((s, m) => s + Number(m.valor), 0))}
                                            </td>
                                            <td colSpan={3} />
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

                      {/* Subtotal classificação */}
                      <tr key={`sub-${classif}`} style={{ background: 'var(--bg-row2)', borderTop: '1px solid var(--border)', borderBottom: '2px solid var(--border)' }}>
                        <td style={{ ...tdFixo, fontWeight: 700, color: 'var(--text-4)', background: 'var(--bg-row2)', fontSize: '11px' }}>Subtotal {classif.replace('Despesas ', '')}</td>
                        <td style={{ ...tdNum, color: 'var(--text-3)', background: 'var(--bg-row2)' }}>—</td>
                        {meses12.map(m => {
                          const v = totalClassifMes(m)
                          const isAtual = ano === hoje.getFullYear() && m === mesAtual
                          return <td key={m} style={{ ...tdNum, fontWeight: 700, color: 'var(--text-4)', background: isAtual ? '#eff6ff' : 'transparent' }}>{v > 0 ? fmt(v) : <span style={{ color: 'var(--border)' }}>—</span>}</td>
                        })}
                        <td style={{ ...tdNum, fontWeight: 700, color: 'var(--text-4)', background: 'var(--bg-row2)' }}>{fmt(totalClassif)}</td>
                        <td style={{ ...tdNum, fontWeight: 700, color: '#92400e', background: 'var(--bg-warning-soft)', fontSize: '12px' }}>{mesesCorrente > 0 ? fmt(mediaClassif) : '—'}</td>
                      </tr>
                    </>
                  )
                })}

                {/* Total geral */}
                <tr style={{ background: '#111827', borderTop: '2px solid #374151' }}>
                  <td style={{ ...tdFixo, fontWeight: 700, color: '#f9fafb', fontSize: '13px', background: '#111827' }}>TOTAL DESPESAS</td>
                  <td style={{ ...tdNum, background: '#1f2937', color: '#6b7280' }}>—</td>
                  {meses12.map(m => {
                    const v = totalMes(m)
                    const isAtual = ano === hoje.getFullYear() && m === mesAtual
                    return (
                      <td key={m} style={{ ...tdNum, fontWeight: 700, fontSize: '13px', color: '#f87171', background: isAtual ? '#1e3a5f' : 'transparent' }}>
                        {v > 0 ? fmt(v) : <span style={{ color: '#374151' }}>—</span>}
                      </td>
                    )
                  })}
                  <td style={{ ...tdNum, background: '#1f2937', fontWeight: 700, fontSize: '13px', color: '#f87171' }}>{fmt(totalGeral)}</td>
                  <td style={{ ...tdNum, background: '#1f2937', fontWeight: 700, fontSize: '12px', color: '#fbbf24' }}>{mesesCorrente > 0 ? fmt(mediaGeral) : '—'}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && (
        <div style={{ marginTop: '10px', fontSize: '11px', color: 'var(--text-3)', display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
          <span>💡 Clique em qualquer célula com valor para ver os lançamentos</span>
          <span>* Crédito: entra no mês da compra (Pendente = fatura a pagar · Faturado = fatura já paga)</span>
          <span>* Débito/PIX/Dinheiro: entra quando Pago</span>
        </div>
      )}
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = { display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }
const selectStyle: React.CSSProperties = { border: '1px solid var(--border-input)', borderRadius: '8px', padding: '7px 10px', fontSize: '13px', background: 'var(--bg-input)', color: 'var(--text-1)', cursor: 'pointer', height: '38px' }
const thBase: React.CSSProperties = { padding: '10px 10px', textAlign: 'right', fontWeight: 600, color: '#f9fafb', fontSize: '12px', borderBottom: '2px solid #374151', whiteSpace: 'nowrap' }
const tdFixo: React.CSSProperties = { padding: '8px 12px', verticalAlign: 'middle', position: 'sticky', left: 0, background: 'var(--bg-card)', borderRight: '1px solid var(--border)', whiteSpace: 'nowrap', zIndex: 1 }
const tdNum: React.CSSProperties  = { padding: '8px 10px', textAlign: 'right', verticalAlign: 'middle', whiteSpace: 'nowrap' }
const tdDrill: React.CSSProperties = { padding: '6px 10px', color: 'var(--text-4)', verticalAlign: 'middle' }
