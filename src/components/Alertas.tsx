import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Movimentacao {
  id: number
  tipo: string
  situacao: string
  descricao: string
  valor: number
  data_movimentacao: string
  data_pagamento: string | null
  metodo_pagamento: string | null
  cartao_id: number | null
  categoria_id: number | null
  numero_parcela: string | null
}

interface Categoria {
  id: number
  nome: string
  classificacao: string
  limite_gastos: number | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const hoje = new Date()
hoje.setHours(0, 0, 0, 0)

function diasAte(dataStr: string): number {
  const d = new Date(dataStr + 'T00:00:00')
  return Math.round((d.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24))
}

function formatarData(dataStr: string): string {
  const [ano, mes, dia] = dataStr.split('-')
  return `${dia}/${mes}/${ano}`
}

function labelMetodo(m: Movimentacao): string {
  if (m.cartao_id) return '💳 Cartão'
  const mp = m.metodo_pagamento?.toLowerCase() || ''
  if (mp.includes('pix')) return '⚡ PIX'
  if (mp.includes('débito') || mp.includes('debito')) return '🏦 Débito'
  if (mp.includes('boleto')) return '📄 Boleto'
  return '💰 Outro'
}

// ─── Card de Alerta ───────────────────────────────────────────────────────────

function AlertaCard({
  icone, titulo, subtitulo, valor, tag, tagCor, borda, fundo, badge
}: {
  icone: string
  titulo: string
  subtitulo: string
  valor?: number
  tag?: string
  tagCor?: string
  borda: string
  fundo: string
  badge?: string
}) {
  return (
    <div style={{
      background: fundo,
      border: `1px solid ${borda}`,
      borderLeft: `4px solid ${borda}`,
      borderRadius: '10px',
      padding: '12px 16px',
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
    }}>
      <span style={{ fontSize: '22px', flexShrink: 0 }}>{icone}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '13px', fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{titulo}</span>
          {tag && (
            <span style={{ fontSize: '10px', fontWeight: 700, background: tagCor || '#e5e7eb', color: '#fff', borderRadius: '99px', padding: '1px 8px', flexShrink: 0 }}>
              {tag}
            </span>
          )}
          {badge && (
            <span style={{ fontSize: '10px', color: '#6b7280', flexShrink: 0 }}>{badge}</span>
          )}
        </div>
        <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>{subtitulo}</div>
      </div>
      {valor !== undefined && (
        <div style={{ fontSize: '14px', fontWeight: 700, color: '#111827', whiteSpace: 'nowrap', flexShrink: 0 }}>
          {fmt(valor)}
        </div>
      )}
    </div>
  )
}

// ─── Seção com título e contagem ──────────────────────────────────────────────

function Secao({ titulo, icone, cor, count, children }: {
  titulo: string
  icone: string
  cor: string
  count: number
  children: React.ReactNode
}) {
  const [aberto, setAberto] = useState(true)
  return (
    <div style={{ marginBottom: '24px' }}>
      <div
        onClick={() => setAberto(a => !a)}
        style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px', cursor: 'pointer', userSelect: 'none' }}
      >
        <span style={{ fontSize: '18px' }}>{icone}</span>
        <span style={{ fontSize: '15px', fontWeight: 700, color: '#111827', flex: 1 }}>{titulo}</span>
        {count > 0 && (
          <span style={{ fontSize: '11px', fontWeight: 700, background: cor, color: '#fff', borderRadius: '99px', padding: '2px 10px' }}>
            {count}
          </span>
        )}
        <span style={{ fontSize: '12px', color: '#9ca3af' }}>{aberto ? '▲' : '▼'}</span>
      </div>
      {aberto && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {count === 0
            ? <div style={{ fontSize: '13px', color: '#9ca3af', padding: '12px 16px', background: '#f9fafb', borderRadius: '8px', textAlign: 'center' }}>✅ Nenhum alerta nesta categoria</div>
            : children
          }
        </div>
      )}
    </div>
  )
}

// ─── Component Principal ──────────────────────────────────────────────────────

export default function Alertas() {
  const { user } = useAuth()
  const [householdId, setHouseholdId] = useState<string | null>(null)
  const [movs, setMovs] = useState<Movimentacao[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [loading, setLoading] = useState(false)

  // ── Household ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return
    supabase.from('households').select('id').eq('owner_id', user.id).single()
      .then(({ data }) => { if (data) setHouseholdId(data.id) })
  }, [user])

  // ── Busca dados ─────────────────────────────────────────────────────────────
  const fetchDados = useCallback(async () => {
    if (!householdId) return
    setLoading(true)

    // Movimentações pendentes (todas, sem filtro de mês)
    const { data: movsData } = await supabase
      .from('movimentacoes')
      .select('id,tipo,situacao,descricao,valor,data_movimentacao,data_pagamento,metodo_pagamento,cartao_id,categoria_id,numero_parcela')
      .eq('household_id', householdId)
      .eq('tipo', 'Despesa')
      .in('situacao', ['Pendente', 'Pago'])

    setMovs(movsData || [])

    const { data: cats } = await supabase
      .from('categorias')
      .select('id,nome,classificacao,limite_gastos')
      .eq('household_id', householdId)
    setCategorias(cats || [])



    setLoading(false)
  }, [householdId])

  useEffect(() => { fetchDados() }, [fetchDados])

  // ── Mês atual ───────────────────────────────────────────────────────────────
  const mesAtual = hoje.getMonth() + 1
  const anoAtual = hoje.getFullYear()

  const movsMesAtual = useMemo(() =>
    movs.filter(m => {
      const d = new Date(m.data_movimentacao + 'T00:00:00')
      return d.getMonth() + 1 === mesAtual && d.getFullYear() === anoAtual
    }), [movs, mesAtual, anoAtual])

  // ── 1. Vencidos ─────────────────────────────────────────────────────────────
  const vencidos = useMemo(() =>
    movs
      .filter(m => {
        if (m.situacao !== 'Pendente') return false
        const ref = m.data_pagamento || m.data_movimentacao
        return diasAte(ref) < 0
      })
      .sort((a, b) => {
        const da = a.data_pagamento || a.data_movimentacao
        const db = b.data_pagamento || b.data_movimentacao
        return da.localeCompare(db)
      }),
    [movs])

  // ── 2. Vencem nos próximos 5 dias ────────────────────────────────────────────
  const proximosCinco = useMemo(() =>
    movs
      .filter(m => {
        if (m.situacao !== 'Pendente') return false
        const ref = m.data_pagamento || m.data_movimentacao
        const dias = diasAte(ref)
        return dias >= 0 && dias <= 5
      })
      .sort((a, b) => {
        const da = a.data_pagamento || a.data_movimentacao
        const db = b.data_pagamento || b.data_movimentacao
        return da.localeCompare(db)
      }),
    [movs])

  // ── 3. Categorias estouradas no mês ─────────────────────────────────────────
  const categoriasEstouradas = useMemo(() => {
    const gastosPorCat: Record<number, number> = {}
    for (const m of movsMesAtual) {
      if (m.situacao === 'Pendente' && m.numero_parcela !== 'Parcela 1/1') continue
      if (!m.categoria_id) continue
      gastosPorCat[m.categoria_id] = (gastosPorCat[m.categoria_id] || 0) + Number(m.valor)
    }
    return categorias
      .filter(c => c.limite_gastos && c.limite_gastos > 0 && (gastosPorCat[c.id] || 0) > c.limite_gastos)
      .map(c => ({
        ...c,
        gasto: gastosPorCat[c.id] || 0,
        excesso: (gastosPorCat[c.id] || 0) - (c.limite_gastos || 0),
        pct: Math.round(((gastosPorCat[c.id] || 0) / (c.limite_gastos || 1)) * 100),
      }))
      .sort((a, b) => b.pct - a.pct)
  }, [movsMesAtual, categorias])

  // ── 4. Maior consumo do mês ──────────────────────────────────────────────────
  const maiorConsumo = useMemo(() => {
    const gastosPorCat: Record<number, number> = {}
    for (const m of movsMesAtual) {
      if (m.situacao === 'Pendente' && m.numero_parcela !== 'Parcela 1/1') continue
      if (!m.categoria_id) continue
      gastosPorCat[m.categoria_id] = (gastosPorCat[m.categoria_id] || 0) + Number(m.valor)
    }
    const totalMes = Object.values(gastosPorCat).reduce((s, v) => s + v, 0)
    return categorias
      .filter(c => gastosPorCat[c.id] > 0)
      .map(c => ({
        ...c,
        gasto: gastosPorCat[c.id] || 0,
        pct: totalMes > 0 ? Math.round(((gastosPorCat[c.id] || 0) / totalMes) * 100) : 0,
      }))
      .sort((a, b) => b.gasto - a.gasto)
      .slice(0, 5)
  }, [movsMesAtual, categorias])

  // ── 5. Risco de estouro (entre 70% e 100% do limite) ───────────────────────
  const riscoEstouro = useMemo(() => {
    const gastosPorCat: Record<number, number> = {}
    for (const m of movsMesAtual) {
      if (m.situacao === 'Pendente' && m.numero_parcela !== 'Parcela 1/1') continue
      if (!m.categoria_id) continue
      gastosPorCat[m.categoria_id] = (gastosPorCat[m.categoria_id] || 0) + Number(m.valor)
    }

    // Pendentes futuros do mês (ainda não pagos, que vão entrar)
    const pendentesNoMes = movs.filter(m => {
      if (m.situacao !== 'Pendente') return false
      const ref = m.data_pagamento || m.data_movimentacao
      const d = new Date(ref + 'T00:00:00')
      return d.getMonth() + 1 === mesAtual && d.getFullYear() === anoAtual
    })

    const projecaoPorCat: Record<number, number> = { ...gastosPorCat }
    for (const m of pendentesNoMes) {
      if (!m.categoria_id) continue
      projecaoPorCat[m.categoria_id] = (projecaoPorCat[m.categoria_id] || 0) + Number(m.valor)
    }

    return categorias
      .filter(c => {
        if (!c.limite_gastos || c.limite_gastos <= 0) return false
        const gastoAtual = gastosPorCat[c.id] || 0
        const projecao = projecaoPorCat[c.id] || 0
        const pctAtual = (gastoAtual / c.limite_gastos) * 100
        const pctProjecao = (projecao / c.limite_gastos) * 100
        // Ainda não estourou mas vai estouro com pendentes
        return pctAtual <= 100 && pctProjecao > 100
      })
      .map(c => ({
        ...c,
        gastoAtual: gastosPorCat[c.id] || 0,
        projecao: projecaoPorCat[c.id] || 0,
        pctAtual: Math.round(((gastosPorCat[c.id] || 0) / (c.limite_gastos || 1)) * 100),
        pctProjecao: Math.round(((projecaoPorCat[c.id] || 0) / (c.limite_gastos || 1)) * 100),
        faltaParaEstourar: (c.limite_gastos || 0) - (gastosPorCat[c.id] || 0),
      }))
      .sort((a, b) => b.pctProjecao - a.pctProjecao)
  }, [movsMesAtual, movs, categorias, mesAtual, anoAtual])

  // ── Totais para resumo ───────────────────────────────────────────────────────
  const totalVencido   = vencidos.reduce((s, m) => s + Number(m.valor), 0)
  const totalProximos  = proximosCinco.reduce((s, m) => s + Number(m.valor), 0)
  const totalAlertasAtivos = vencidos.length + proximosCinco.length + categoriasEstouradas.length + riscoEstouro.length

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: "'Segoe UI', system-ui, sans-serif", padding: '24px', maxWidth: '900px', margin: '0 auto', background: '#f8fafc', minHeight: '100vh' }}>

      {/* Header */}
      <div style={{ marginBottom: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <h1 style={{ fontSize: '26px', fontWeight: 700, color: '#111827', margin: 0 }}>🔔 Alertas</h1>
          {totalAlertasAtivos > 0 && (
            <span style={{ fontSize: '13px', fontWeight: 700, background: '#ef4444', color: '#fff', borderRadius: '99px', padding: '3px 12px' }}>
              {totalAlertasAtivos} ativos
            </span>
          )}
        </div>
        <p style={{ color: '#6b7280', marginTop: '4px', fontSize: '13px' }}>
          Monitoramento financeiro em tempo real — {hoje.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
        </p>
      </div>

      {loading ? (
        <div style={{ padding: '80px', textAlign: 'center', color: '#9ca3af' }}>Carregando alertas...</div>
      ) : (
        <>

          {/* ── Resumo rápido ─────────────────────────────────────────────── */}
          {(vencidos.length > 0 || proximosCinco.length > 0) && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '28px' }}>
              <div style={{ background: '#fff', border: '1px solid #fecaca', borderLeft: '4px solid #ef4444', borderRadius: '12px', padding: '16px 20px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Vencido</div>
                <div style={{ fontSize: '24px', fontWeight: 700, color: '#111827', margin: '6px 0 2px' }}>{fmt(totalVencido)}</div>
                <div style={{ fontSize: '12px', color: '#6b7280' }}>{vencidos.length} lançamento{vencidos.length !== 1 ? 's' : ''} em atraso</div>
              </div>
              <div style={{ background: '#fff', border: '1px solid #fde68a', borderLeft: '4px solid #f59e0b', borderRadius: '12px', padding: '16px 20px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Vence em 5 dias</div>
                <div style={{ fontSize: '24px', fontWeight: 700, color: '#111827', margin: '6px 0 2px' }}>{fmt(totalProximos)}</div>
                <div style={{ fontSize: '12px', color: '#6b7280' }}>{proximosCinco.length} lançamento{proximosCinco.length !== 1 ? 's' : ''} a vencer</div>
              </div>
            </div>
          )}

          {/* ── 1. Vencidos ───────────────────────────────────────────────── */}
          <Secao titulo="Pagamentos Vencidos" icone="🚨" cor="#ef4444" count={vencidos.length}>
            {vencidos.map(m => {
              const ref = m.data_pagamento || m.data_movimentacao
              const dias = Math.abs(diasAte(ref))
              return (
                <AlertaCard
                  key={m.id}
                  icone="❌"
                  titulo={m.descricao}
                  subtitulo={`Venceu em ${formatarData(ref)} — ${labelMetodo(m)}`}
                  valor={Number(m.valor)}
                  tag={`${dias} dia${dias !== 1 ? 's' : ''} atraso`}
                  tagCor="#ef4444"
                  borda="#fca5a5"
                  fundo="#fff5f5"
                />
              )
            })}
          </Secao>

          {/* ── 2. Vencem em 5 dias ───────────────────────────────────────── */}
          <Secao titulo="Vencem nos Próximos 5 Dias" icone="⏰" cor="#f59e0b" count={proximosCinco.length}>
            {proximosCinco.map(m => {
              const ref = m.data_pagamento || m.data_movimentacao
              const dias = diasAte(ref)
              const urgencia = dias === 0 ? 'Vence hoje!' : dias === 1 ? 'Vence amanhã' : `Em ${dias} dias`
              const cor = dias === 0 ? '#ef4444' : dias <= 2 ? '#f59e0b' : '#6b7280'
              return (
                <AlertaCard
                  key={m.id}
                  icone={dias === 0 ? '🔴' : dias <= 2 ? '🟡' : '🟢'}
                  titulo={m.descricao}
                  subtitulo={`Vence em ${formatarData(ref)} — ${labelMetodo(m)}`}
                  valor={Number(m.valor)}
                  tag={urgencia}
                  tagCor={cor}
                  borda={dias === 0 ? '#fca5a5' : dias <= 2 ? '#fde68a' : '#d1fae5'}
                  fundo={dias === 0 ? '#fff5f5' : dias <= 2 ? '#fffbeb' : '#f0fdf4'}
                />
              )
            })}
          </Secao>

          {/* ── 3. Categorias estouradas ──────────────────────────────────── */}
          <Secao titulo="Limite de Gastos Estourado" icone="💸" cor="#7c3aed" count={categoriasEstouradas.length}>
            {categoriasEstouradas.map(c => (
              <div key={c.id} style={{ background: '#fdf4ff', border: '1px solid #e9d5ff', borderLeft: '4px solid #7c3aed', borderRadius: '10px', padding: '12px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <span style={{ fontSize: '16px' }}>⚠️</span>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#111827', flex: 1 }}>{c.nome}</span>
                  <span style={{ fontSize: '11px', fontWeight: 700, background: '#7c3aed', color: '#fff', borderRadius: '99px', padding: '1px 8px' }}>{c.pct}% do limite</span>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: '#7c3aed' }}>{fmt(c.gasto)}</span>
                </div>
                <div style={{ background: '#e9d5ff', borderRadius: '99px', height: '6px', marginBottom: '6px' }}>
                  <div style={{ background: '#7c3aed', width: '100%', height: '6px', borderRadius: '99px' }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#6b7280' }}>
                  <span>Limite: {fmt(c.limite_gastos || 0)}</span>
                  <span style={{ color: '#7c3aed', fontWeight: 600 }}>Excedeu {fmt(c.excesso)}</span>
                </div>
              </div>
            ))}
          </Secao>

          {/* ── 4. Maior consumo ──────────────────────────────────────────── */}
          <Secao titulo="Maior Consumo do Mês" icone="📊" cor="#0891b2" count={maiorConsumo.length}>
            {maiorConsumo.map((c, i) => {
              const cores = ['#ef4444', '#f59e0b', '#0891b2', '#7c3aed', '#16a34a']
              const cor = cores[i] || '#6b7280'
              return (
                <div key={c.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderLeft: `4px solid ${cor}`, borderRadius: '10px', padding: '12px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: '#9ca3af', width: '20px' }}>#{i + 1}</span>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#111827', flex: 1 }}>{c.nome}</span>
                    <span style={{ fontSize: '11px', color: '#6b7280' }}>{c.classificacao}</span>
                    <span style={{ fontSize: '14px', fontWeight: 700, color: '#111827' }}>{fmt(c.gasto)}</span>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: cor }}>{c.pct}%</span>
                  </div>
                  <div style={{ background: '#f3f4f6', borderRadius: '99px', height: '5px' }}>
                    <div style={{ background: cor, width: `${Math.min(c.pct, 100)}%`, height: '5px', borderRadius: '99px', transition: 'width 0.4s' }} />
                  </div>
                  {c.limite_gastos && c.limite_gastos > 0 && (
                    <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>
                      Limite: {fmt(c.limite_gastos)} — usando {Math.round((c.gasto / c.limite_gastos) * 100)}%
                    </div>
                  )}
                </div>
              )
            })}
          </Secao>

          {/* ── 5. Risco de estouro ───────────────────────────────────────── */}
          <Secao titulo="Risco de Estouro se Não Controlar" icone="🎯" cor="#ea580c" count={riscoEstouro.length}>
            {riscoEstouro.map(c => (
              <div key={c.id} style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderLeft: '4px solid #ea580c', borderRadius: '10px', padding: '12px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <span style={{ fontSize: '16px' }}>🎯</span>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#111827', flex: 1 }}>{c.nome}</span>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: '#ea580c' }}>{fmt(c.projecao)}</div>
                    <div style={{ fontSize: '10px', color: '#9ca3af' }}>projeção com pendentes</div>
                  </div>
                </div>
                <div style={{ background: '#fed7aa', borderRadius: '99px', height: '6px', marginBottom: '6px', overflow: 'hidden' }}>
                  <div style={{ background: '#ea580c', width: `${Math.min(c.pctProjecao, 100)}%`, height: '6px', borderRadius: '99px', transition: 'width 0.4s' }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#6b7280' }}>
                  <span>Hoje: {fmt(c.gastoAtual)} ({c.pctAtual}%)</span>
                  <span>Limite: {fmt(c.limite_gastos || 0)}</span>
                  <span style={{ color: '#ea580c', fontWeight: 600 }}>Projeção: {c.pctProjecao}% do limite</span>
                </div>
                <div style={{ marginTop: '6px', fontSize: '11px', color: '#ea580c', fontWeight: 600 }}>
                  ⚠️ Restam apenas {fmt(c.faltaParaEstourar)} antes de estourar o limite
                </div>
              </div>
            ))}
          </Secao>

        </>
      )}
    </div>
  )
}
