import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Cartao {
  id: number
  nome: string
  limite_total: number
  data_fechamento: number
  data_vencimento: number
  ativo: boolean
}

interface Movimentacao {
  id: number
  cartao_id: number | null
  categoria_id: number | null
  descricao: string
  valor: number
  situacao: string
  metodo_pagamento: string | null
  numero_parcela: string | null
  data_movimentacao: string
  data_pagamento: string | null
}

interface Categoria {
  id: number
  nome: string
}

interface LinhaCartao {
  cartao: Cartao
  meses: Record<number, number>
  totalFaturado: number
  totalPendente: number
  totalPrevisto: number
  limiteDisponivel: number  // limite − só Pendente (Previsto não compromete)
}

interface DrillKey { cartaoId: number; mes: number }

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtDate = (d: string | null) => {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}
const getMes = (d: string) => Number(d.split('-')[1])
const getAno = (d: string) => Number(d.split('-')[0])

const MESES_CURTOS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

type FiltroSituacao = 'tudo' | 'Faturado' | 'Pendente' | 'Previsto'

// Filtros independentes — cada botão mostra APENAS aquela situação
const FILTROS: { key: FiltroSituacao; label: string; desc: string; cor: string; situacoes: string[] }[] = [
  { key: 'tudo',     label: 'Tudo',     desc: 'Faturado + Pendente + Previsto', cor: '#1e40af', situacoes: ['Faturado', 'Pendente', 'Previsto'] },
  { key: 'Faturado', label: 'Faturado', desc: 'Apenas faturado',               cor: '#1e40af', situacoes: ['Faturado'] },
  { key: 'Pendente', label: 'Pendente', desc: 'Apenas pendente',               cor: '#92400e', situacoes: ['Pendente'] },
  { key: 'Previsto', label: 'Previsto', desc: 'Apenas previsto',               cor: '#6b21a8', situacoes: ['Previsto'] },
]

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

export default function CartoesView() {
  const { user } = useAuth()
  const [householdId, setHouseholdId] = useState<string | null>(null)

  const hoje = new Date()
  const mesAtual = hoje.getMonth() + 1
  const anoAtual = hoje.getFullYear()
  // Primeiro dia do mês atual — parcelas antes disso já foram ou não existem mais
  const dataCorte = `${anoAtual}-${String(mesAtual).padStart(2, '0')}-01`

  const [ano, setAno] = useState(anoAtual)
  const [filtro, setFiltro] = useState<FiltroSituacao>('tudo')

  const [cartoes, setCartoes] = useState<Cartao[]>([])
  const [movimentacoes, setMovimentacoes] = useState<Movimentacao[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [loading, setLoading] = useState(false)
  const [drillAberto, setDrillAberto] = useState<DrillKey | null>(null)

  const anos = Array.from({ length: 5 }, (_, i) => anoAtual - 2 + i)
  const meses = Array.from({ length: 12 }, (_, i) => i + 1)

  // Situações visíveis na tabela conforme filtro
  const situacoesVisiveis = useMemo(
    () => FILTROS.find(f => f.key === filtro)?.situacoes ?? ['Faturado', 'Pendente', 'Previsto'],
    [filtro]
  )

  // ── Household ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return
    supabase.from('households').select('id').eq('owner_id', user.id).single()
      .then(({ data }) => { if (data) setHouseholdId(data.id) })
  }, [user])

  // ── Referências ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!householdId) return
    supabase.from('cartoes').select('id,nome,limite_total,data_fechamento,data_vencimento,ativo')
      .eq('household_id', householdId).eq('ativo', true).order('nome')
      .then(({ data }) => setCartoes(data || []))
    supabase.from('categorias').select('id,nome')
      .eq('household_id', householdId).order('nome')
      .then(({ data }) => setCategorias(data || []))
  }, [householdId])

  // ── Busca movimentações ──────────────────────────────────────────────────────
  const fetchDados = useCallback(async () => {
    if (!householdId) return
    setLoading(true)

    // Query 1: todos os lançamentos do ano selecionado (tabela mensal)
    const { data: dadosAno } = await supabase
      .from('movimentacoes')
      .select('id,cartao_id,categoria_id,descricao,valor,situacao,metodo_pagamento,numero_parcela,data_movimentacao,data_pagamento')
      .eq('household_id', householdId)
      .not('cartao_id', 'is', null)
      .in('situacao', ['Faturado', 'Pendente', 'Previsto'])
      .gte('data_pagamento', `${ano}-01-01`)
      .lte('data_pagamento', `${ano}-12-31`)
      .order('data_pagamento', { ascending: true })

    // Query 2: só Pendentes a partir do mês atual (para calcular limite disponível real)
    // Previsto NÃO entra — não compromete o limite
    const { data: dadosPendentes } = await supabase
      .from('movimentacoes')
      .select('id,cartao_id,categoria_id,descricao,valor,situacao,metodo_pagamento,numero_parcela,data_movimentacao,data_pagamento')
      .eq('household_id', householdId)
      .not('cartao_id', 'is', null)
      .eq('situacao', 'Pendente')
      .gte('data_pagamento', dataCorte)

    const mapaMovs = new Map<number, Movimentacao>()
    for (const m of [...(dadosPendentes || []), ...(dadosAno || [])]) {
      mapaMovs.set(m.id, m)
    }
    setMovimentacoes(Array.from(mapaMovs.values()))
    setLoading(false)
  }, [householdId, ano, dataCorte])

  useEffect(() => { fetchDados() }, [fetchDados])

  // ── Monta linhas por cartão ──────────────────────────────────────────────────
  const linhas = useMemo((): LinhaCartao[] => {
    return cartoes.map(cartao => {
      const movsCartao = movimentacoes.filter(m => m.cartao_id === cartao.id)

      // Tabela mensal — filtra pelas situações do filtro selecionado
      const mesesMap: Record<number, number> = {}
      for (const m of movsCartao) {
        if (!situacoesVisiveis.includes(m.situacao)) continue
        if (!m.data_pagamento) continue
        if (getAno(m.data_pagamento) !== ano) continue
        const mes = getMes(m.data_pagamento)
        mesesMap[mes] = (mesesMap[mes] || 0) + Number(m.valor)
      }

      // Totais do ano selecionado (para os cards de resumo)
      const movsCartaoAno = movsCartao.filter(
        m => m.data_pagamento && getAno(m.data_pagamento) === ano
      )
      const totalFaturado = movsCartaoAno.filter(m => m.situacao === 'Faturado').reduce((s, m) => s + Number(m.valor), 0)
      const totalPendente  = movsCartaoAno.filter(m => m.situacao === 'Pendente').reduce((s, m) => s + Number(m.valor), 0)
      const totalPrevisto  = movsCartaoAno.filter(m => m.situacao === 'Previsto').reduce((s, m) => s + Number(m.valor), 0)

      // ✅ Limite disponível = limite − só Pendentes a partir do mês atual
      // Previsto NÃO compromete o limite (são lançamentos futuros ainda não autorizados)
      const comprometido = movsCartao
        .filter(m =>
          m.situacao === 'Pendente' &&
          m.data_pagamento != null &&
          m.data_pagamento >= dataCorte
        )
        .reduce((s, m) => s + Number(m.valor), 0)

      return {
        cartao,
        meses: mesesMap,
        totalFaturado,
        totalPendente,
        totalPrevisto,
        limiteDisponivel: (cartao.limite_total || 0) - comprometido,
      }
    })
  }, [cartoes, movimentacoes, situacoesVisiveis, ano, dataCorte])

  // ── Cards globais ────────────────────────────────────────────────────────────
  const cardTotalFaturado         = linhas.reduce((s, l) => s + l.totalFaturado, 0)
  const cardTotalPendente         = linhas.reduce((s, l) => s + l.totalPendente, 0)
  const cardTotalPendentePrevisto = linhas.reduce((s, l) => s + l.totalPendente + l.totalPrevisto, 0)

  const cartaoMaisComprometido = useMemo(() => {
    if (!linhas.length) return null
    return linhas.reduce((min, l) => l.limiteDisponivel < min.limiteDisponivel ? l : min)
  }, [linhas])

  // ✅ % comprometido = só Pendente (não inclui Previsto)
  const pctComprometido = (linha: LinhaCartao) => {
    if (!linha.cartao.limite_total) return 0
    const usado = linha.cartao.limite_total - linha.limiteDisponivel
    return Math.min((usado / linha.cartao.limite_total) * 100, 100)
  }

  // ── Drill-down ───────────────────────────────────────────────────────────────
  const lancamentosDrill = useMemo(() => {
    if (!drillAberto) return []
    return movimentacoes.filter(m => {
      if (m.cartao_id !== drillAberto.cartaoId) return false
      if (!m.data_pagamento) return false
      if (getMes(m.data_pagamento) !== drillAberto.mes) return false
      if (getAno(m.data_pagamento) !== ano) return false
      return situacoesVisiveis.includes(m.situacao)
    }).sort((a, b) => a.data_movimentacao.localeCompare(b.data_movimentacao))
  }, [drillAberto, movimentacoes, situacoesVisiveis, ano])

  const toggleDrill = (cartaoId: number, mes: number, valor: number) => {
    if (valor === 0) return
    setDrillAberto(prev =>
      prev?.cartaoId === cartaoId && prev?.mes === mes ? null : { cartaoId, mes }
    )
  }

  const catNome = (id: number | null) =>
    id ? (categorias.find(c => c.id === id)?.nome || '—') : '—'

  const totalColunaMes = (mes: number) => linhas.reduce((s, l) => s + (l.meses[mes] || 0), 0)

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: "'Segoe UI', system-ui, sans-serif", padding: '24px', maxWidth: '100%', margin: '0 auto' }}>

      {/* Header */}
      <div style={{ marginBottom: '16px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#111827', margin: 0 }}>Cartões de Crédito</h1>
        <p style={{ color: '#6b7280', marginTop: '4px', fontSize: '13px' }}>
          Visão anual por cartão · clique em qualquer célula para ver os lançamentos
        </p>
      </div>

      {/* ── Cards ─────────────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '20px' }}>

        <CardInfo label='Total Faturado'      valor={fmt(cardTotalFaturado)}        sub={`Despesas fechadas — ${ano}`}        cor='#1e40af' bg='#dbeafe' borda='#93c5fd' />
        <CardInfo label='Total Pendente'      valor={fmt(cardTotalPendente)}         sub={`Fatura aberta — ${ano}`}            cor='#92400e' bg='#fef3c7' borda='#fcd34d' />
        <CardInfo label='Pendente + Previsto' valor={fmt(cardTotalPendentePrevisto)} sub={`Comprometimento total — ${ano}`}    cor='#6b21a8' bg='#f3e8ff' borda='#c4b5fd' />

        {cartaoMaisComprometido && (
          <div style={{ background: '#fee2e2', borderRadius: '12px', padding: '14px 16px', borderLeft: '4px solid #ef4444', position: 'relative' }}>
            <span style={{ position: 'absolute', top: '8px', right: '8px', background: '#ef4444', color: '#fff', fontSize: '9px', fontWeight: 700, padding: '2px 6px', borderRadius: '99px' }}>
              ⚠ ALERTA
            </span>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#991b1b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Mais Comprometido</div>
            <div style={{ fontSize: '16px', fontWeight: 700, color: '#991b1b', margin: '4px 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {cartaoMaisComprometido.cartao.nome}
            </div>
            <div style={{ background: '#fecaca', borderRadius: '99px', height: '6px', margin: '6px 0' }}>
              <div style={{ background: '#ef4444', borderRadius: '99px', height: '6px', width: `${Math.min(pctComprometido(cartaoMaisComprometido), 100)}%`, transition: 'width 0.3s' }} />
            </div>
            <div style={{ fontSize: '11px', color: '#991b1b', opacity: 0.8 }}>
              {pctComprometido(cartaoMaisComprometido).toFixed(0)}% comprometido (Pendente) · Disponível: {fmt(cartaoMaisComprometido.limiteDisponivel)}
            </div>
          </div>
        )}

      </div>

      {/* ── Filtros ──────────────────────────────────────────────────────────── */}
      <div style={{ background: '#ede8df', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '16px 20px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '24px', alignItems: 'flex-end' }}>

          <div>
            <label style={labelStyle}>Ano</label>
            <select value={ano} onChange={e => { setAno(Number(e.target.value)); setDrillAberto(null) }} style={selectStyle}>
              {anos.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>

          <div>
            <label style={{ ...labelStyle, marginBottom: '8px' }}>Situação</label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {FILTROS.map(f => (
                <button key={f.key} onClick={() => { setFiltro(f.key); setDrillAberto(null) }} style={{
                  padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                  border: filtro === f.key ? 'none' : '1px solid #e5e7eb',
                  background: filtro === f.key ? f.cor : '#fff',
                  color: filtro === f.key ? '#fff' : '#374151',
                }}>
                  {f.label}
                  <span style={{ display: 'block', fontSize: '10px', fontWeight: 400, opacity: 0.8, marginTop: '1px' }}>{f.desc}</span>
                </button>
              ))}
            </div>
          </div>

        </div>
      </div>

      {/* ── Tabela ──────────────────────────────────────────────────────────── */}
      {loading ? (
        <div style={{ padding: '64px', textAlign: 'center', color: '#9ca3af' }}>Carregando...</div>
      ) : (
        <div style={{ border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ background: '#1f2937' }}>
                  <td colSpan={3} style={{ padding: '4px 12px', fontSize: '10px', color: '#6b7280', position: 'sticky', left: 0, background: '#1f2937', zIndex: 11 }}>
                    ◀ passado · presente · futuro ▶
                  </td>
                  {meses.map(m => {
                    const isFuturo = ano > anoAtual || (ano === anoAtual && m > mesAtual)
                    const isAtual  = ano === anoAtual && m === mesAtual
                    return (
                      <td key={m} style={{ padding: '3px 4px', textAlign: 'center', fontSize: '9px', fontWeight: 600, color: isAtual ? '#fbbf24' : isFuturo ? '#7c3aed' : '#4b5563' }}>
                        {isAtual ? '● ATUAL' : isFuturo ? '◆' : ''}
                      </td>
                    )
                  })}
                  <td colSpan={3} style={{ background: '#1f2937' }} />
                </tr>

                <tr style={{ background: '#111827' }}>
                  <th style={{ ...thBase, textAlign: 'left', minWidth: '160px', position: 'sticky', left: 0, background: '#111827', zIndex: 11 }}>Cartão</th>
                  <th style={{ ...thBase, minWidth: '100px', background: '#1f2937' }}>Limite</th>
                  <th style={{ ...thBase, minWidth: '85px', background: '#1f2937', color: '#fbbf24' }}>Vence/Fecha</th>
                  {meses.map(m => {
                    const isFuturo = ano > anoAtual || (ano === anoAtual && m > mesAtual)
                    const isAtual  = ano === anoAtual && m === mesAtual
                    return (
                      <th key={m} style={{
                        ...thBase, minWidth: '80px',
                        background:   isAtual ? '#1e3a5f' : isFuturo ? '#2d1b4e' : '#111827',
                        color:        isAtual ? '#fbbf24' : isFuturo ? '#c4b5fd' : '#f9fafb',
                        borderBottom: isAtual ? '2px solid #fbbf24' : isFuturo ? '2px solid #7c3aed' : '2px solid #374151',
                      }}>
                        {MESES_CURTOS[m - 1]}
                      </th>
                    )
                  })}
                  <th style={{ ...thBase, minWidth: '90px',  background: '#1f2937' }}>Total</th>
                  <th style={{ ...thBase, minWidth: '120px', background: '#1f2937', color: '#34d399' }}>Disponível</th>
                </tr>
              </thead>

              <tbody>
                {linhas.map(linha => {
                  const totalLinha   = Object.values(linha.meses).reduce((s, v) => s + v, 0)
                  const pct          = pctComprometido(linha)
                  const drillAberto_ = drillAberto?.cartaoId === linha.cartao.id

                  return (
                    <React.Fragment key={linha.cartao.id}>
                      <tr style={{ borderBottom: '1px solid #f3f4f6' }}>

                        {/* Cartão */}
                        <td style={{ ...tdFixo }}>
                          <div style={{ fontWeight: 600, color: '#111827' }}>{linha.cartao.nome}</div>
                          <div style={{ background: '#f3f4f6', borderRadius: '99px', height: '4px', marginTop: '4px', width: '120px' }}>
                            <div style={{ background: pct > 80 ? '#ef4444' : pct > 50 ? '#f59e0b' : '#10b981', borderRadius: '99px', height: '4px', width: `${Math.min(pct, 100)}%` }} />
                          </div>
                          <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '2px' }}>{pct.toFixed(0)}% comprometido (Pendente)</div>
                        </td>

                        {/* Limite */}
                        <td style={{ ...tdNum, background: '#ede8df', color: '#6b7280' }}>
                          {fmt(linha.cartao.limite_total)}
                        </td>

                        {/* Vence/Fecha */}
                        <td style={{ ...tdNum, background: '#ede8df', fontSize: '11px', color: '#9ca3af' }}>
                          <div>Vence {linha.cartao.data_vencimento}</div>
                          <div>Fecha {linha.cartao.data_fechamento}</div>
                        </td>

                        {/* Meses */}
                        {meses.map(m => {
                          const v        = linha.meses[m] || 0
                          const isFuturo = ano > anoAtual || (ano === anoAtual && m > mesAtual)
                          const isAtual  = ano === anoAtual && m === mesAtual
                          const aberto   = drillAberto?.cartaoId === linha.cartao.id && drillAberto?.mes === m
                          const pctMes   = linha.cartao.limite_total > 0 ? (v / linha.cartao.limite_total) * 100 : 0

                          return (
                            <td
                              key={m}
                              onClick={() => toggleDrill(linha.cartao.id, m, v)}
                              title={v > 0 ? 'Clique para ver lançamentos' : ''}
                              style={{
                                ...tdNum,
                                cursor:       v > 0 ? 'pointer' : 'default',
                                background:   aberto ? '#fffbeb' : isAtual ? '#eff6ff' : isFuturo ? '#faf5ff' : 'transparent',
                                fontWeight:   v > 0 ? 600 : 400,
                                color:        v === 0 ? '#e5e7eb' : pctMes > 80 ? '#ef4444' : pctMes > 50 ? '#f59e0b' : '#1e40af',
                                borderBottom: aberto ? '2px solid #f59e0b' : 'none',
                              }}
                            >
                              {v > 0
                                ? <span style={{ textDecoration: 'underline dotted', textUnderlineOffset: '3px' }}>{fmt(v)}</span>
                                : <span style={{ color: '#e5e7eb' }}>—</span>
                              }
                            </td>
                          )
                        })}

                        {/* Total */}
                        <td style={{ ...tdNum, background: '#ede8df', fontWeight: 700, color: '#1e40af' }}>
                          {fmt(totalLinha)}
                        </td>

                        {/* Disponível — só Pendente */}
                        <td style={{ ...tdNum, background: '#ede8df', fontWeight: 700, color: linha.limiteDisponivel >= 0 ? '#065f46' : '#991b1b' }}>
                          <div>{fmt(linha.limiteDisponivel)}</div>
                          <div style={{ fontSize: '10px', fontWeight: 400, color: '#9ca3af' }}>de {fmt(linha.cartao.limite_total)}</div>
                        </td>

                      </tr>

                      {/* ── Drill-down ── */}
                      {drillAberto_ && drillAberto !== null && (
                        <tr>
                          <td colSpan={17} style={{ padding: 0, background: '#fffbeb', borderBottom: '2px solid #f59e0b' }}>
                            <div style={{ padding: '12px 16px 16px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                <div style={{ fontSize: '13px', fontWeight: 700, color: '#92400e' }}>
                                  📋 {linha.cartao.nome} — {MESES_CURTOS[drillAberto.mes - 1]}/{ano}
                                  <span style={{ fontWeight: 400, color: '#9ca3af', marginLeft: '8px', fontSize: '12px' }}>
                                    {lancamentosDrill.length} lançamento{lancamentosDrill.length !== 1 ? 's' : ''}
                                  </span>
                                </div>
                                <button onClick={() => setDrillAberto(null)} style={{ background: 'none', border: 'none', fontSize: '16px', cursor: 'pointer', color: '#9ca3af' }}>×</button>
                              </div>

                              {lancamentosDrill.length === 0 ? (
                                <div style={{ color: '#9ca3af', fontSize: '13px' }}>Nenhum lançamento encontrado.</div>
                              ) : (
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                                  <thead>
                                    <tr style={{ background: '#fef3c7', borderBottom: '1px solid #fde68a' }}>
                                      {['Dt. Movimentação','Dt. Pagamento','Categoria','Descrição','Valor','Parcela','Situação'].map(h => (
                                        <th key={h} style={{ padding: '6px 10px', textAlign: h === 'Valor' ? 'right' : 'left', fontWeight: 600, color: '#92400e', whiteSpace: 'nowrap' }}>{h}</th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {lancamentosDrill.map((l, idx) => (
                                      <tr key={l.id} style={{ background: idx % 2 === 0 ? '#fffdf0' : '#fffbeb', borderBottom: '1px solid #fef3c7' }}>
                                        <td style={tdDrill}>{fmtDate(l.data_movimentacao)}</td>
                                        <td style={tdDrill}>{fmtDate(l.data_pagamento)}</td>
                                        <td style={tdDrill}>{catNome(l.categoria_id)}</td>
                                        <td style={{ ...tdDrill, fontWeight: 500, maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.descricao}</td>
                                        <td style={{ ...tdDrill, textAlign: 'right', fontWeight: 700, color: '#991b1b' }}>{fmt(Number(l.valor))}</td>
                                        <td style={tdDrill}>{l.numero_parcela || '—'}</td>
                                        <td style={tdDrill}>
                                          <span style={{ ...corSituacaoStyle(l.situacao), padding: '2px 8px', borderRadius: '99px', fontSize: '11px', fontWeight: 600 }}>
                                            {l.situacao}
                                          </span>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                  <tfoot>
                                    <tr style={{ background: '#fef3c7', borderTop: '1px solid #fde68a' }}>
                                      <td colSpan={4} style={{ padding: '6px 10px', fontWeight: 700, color: '#92400e' }}>Total</td>
                                      <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700, color: '#991b1b' }}>
                                        {fmt(lancamentosDrill.reduce((s, l) => s + Number(l.valor), 0))}
                                      </td>
                                      <td colSpan={2} />
                                    </tr>
                                  </tfoot>
                                </table>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  )
                })}

                {/* Totais das colunas */}
                <tr style={{ background: '#111827', borderTop: '2px solid #374151' }}>
                  <td style={{ ...tdFixo, fontWeight: 700, color: '#f9fafb', background: '#111827' }}>TOTAL</td>
                  <td style={{ ...tdNum, background: '#1f2937', color: '#9ca3af' }}>
                    {fmt(cartoes.reduce((s, c) => s + (c.limite_total || 0), 0))}
                  </td>
                  <td style={{ ...tdNum, background: '#1f2937' }} />
                  {meses.map(m => {
                    const v        = totalColunaMes(m)
                    const isFuturo = ano > anoAtual || (ano === anoAtual && m > mesAtual)
                    const isAtual  = ano === anoAtual && m === mesAtual
                    return (
                      <td key={m} style={{ ...tdNum, fontWeight: 700, color: '#60a5fa', background: isAtual ? '#1e3a5f' : isFuturo ? '#1a1035' : 'transparent', opacity: isFuturo && !isAtual ? 0.75 : 1 }}>
                        {v > 0 ? fmt(v) : <span style={{ color: '#374151' }}>—</span>}
                      </td>
                    )
                  })}
                  <td style={{ ...tdNum, background: '#1f2937', fontWeight: 700, color: '#60a5fa' }}>
                    {fmt(linhas.reduce((s, l) => s + Object.values(l.meses).reduce((a, b) => a + b, 0), 0))}
                  </td>
                  <td style={{ ...tdNum, background: '#1f2937', fontWeight: 700, color: '#34d399' }}>
                    {fmt(linhas.reduce((s, l) => s + l.limiteDisponivel, 0))}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Legenda */}
      {!loading && (
        <div style={{ marginTop: '10px', display: 'flex', gap: '20px', flexWrap: 'wrap', fontSize: '11px', color: '#9ca3af' }}>
          <span>💡 Clique em qualquer célula com valor para ver os lançamentos</span>
          <span style={{ color: '#7c3aed' }}>◆ Meses futuros</span>
          <span>🟢 &lt;50% · 🟡 50–80% · 🔴 &gt;80% do limite · Disponível calculado apenas sobre Pendentes</span>
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
      <div style={{ fontSize: '20px', fontWeight: 700, color: cor, margin: '6px 0 2px' }}>{valor}</div>
      <div style={{ fontSize: '11px', color: cor, opacity: 0.7 }}>{sub}</div>
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties  = { display: 'block', fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }
const selectStyle: React.CSSProperties = { border: '1px solid #d1d5db', borderRadius: '8px', padding: '7px 10px', fontSize: '13px', background: '#fff', color: '#111827', cursor: 'pointer', height: '38px' }
const thBase: React.CSSProperties      = { padding: '10px 10px', textAlign: 'right', fontWeight: 600, color: '#f9fafb', fontSize: '12px', borderBottom: '2px solid #374151', whiteSpace: 'nowrap' }
const tdFixo: React.CSSProperties      = { padding: '10px 12px', verticalAlign: 'middle', position: 'sticky', left: 0, background: '#fff', borderRight: '1px solid #f3f4f6', zIndex: 1, minWidth: '160px' }
const tdNum: React.CSSProperties       = { padding: '8px 10px', textAlign: 'right', verticalAlign: 'middle', whiteSpace: 'nowrap' }
const tdDrill: React.CSSProperties     = { padding: '6px 10px', color: '#374151', verticalAlign: 'middle' }
