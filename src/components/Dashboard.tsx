import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Conta {
  id: number
  nome: string
  saldo_inicial: number
  data_inicial: string
}

interface Cartao {
  id: number
  nome: string
  limite_total: number
  data_vencimento: number
}

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
  cartao_id: number | null
  conta_origem_destino: string | null
}

// Tipo reduzido para o gráfico de evolução (query com menos campos)
interface MovimentacaoLeve {
  id: number
  tipo: string
  situacao: string
  valor: number
  data_movimentacao: string
  numero_parcela: string | null
  metodo_pagamento: string | null
  cartao_id: number | null
}

interface Categoria {
  id: number
  nome: string
  classificacao: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
               'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

const CORES_GRAFICO = [
  '#2563eb','#7c3aed','#db2777','#ea580c','#16a34a',
  '#0891b2','#854d0e','#be123c','#4f46e5','#065f46',
  '#92400e','#1e40af',
]

// ─── Mini gráfico de barras inline ────────────────────────────────────────────

function BarraInline({ valor, max, cor }: { valor: number; max: number; cor: string }) {
  const pct = max > 0 ? Math.min((valor / max) * 100, 100) : 0
  return (
    <div style={{ background: '#f3f4f6', borderRadius: '99px', height: '6px', flex: 1 }}>
      <div style={{ background: cor, borderRadius: '99px', height: '6px', width: `${pct}%`, transition: 'width 0.4s ease' }} />
    </div>
  )
}

// ─── Gráfico Pizza SVG ────────────────────────────────────────────────────────

function GraficoPizza({ fatias }: { fatias: { label: string; valor: number; cor: string }[] }) {
  const total = fatias.reduce((s, f) => s + f.valor, 0)
  if (total === 0) return <div style={{ textAlign: 'center', color: '#9ca3af', padding: '40px' }}>Sem dados</div>

  let angulo = -90
  const raio = 70
  const cx = 90; const cy = 90

  const arcos = fatias.map(f => {
    const pct = f.valor / total
    const graus = pct * 360
    const rad1 = (angulo * Math.PI) / 180
    const rad2 = ((angulo + graus) * Math.PI) / 180
    const x1 = cx + raio * Math.cos(rad1)
    const y1 = cy + raio * Math.sin(rad1)
    const x2 = cx + raio * Math.cos(rad2)
    const y2 = cy + raio * Math.sin(rad2)
    const largeArc = graus > 180 ? 1 : 0
    const d = `M ${cx} ${cy} L ${x1} ${y1} A ${raio} ${raio} 0 ${largeArc} 1 ${x2} ${y2} Z`
    angulo += graus
    return { ...f, d, pct }
  })

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
      <svg width="180" height="180" viewBox="0 0 180 180">
        {arcos.map((a, i) => (
          <path key={i} d={a.d} fill={a.cor} stroke="#fff" strokeWidth="2">
            <title>{a.label}: {fmt(a.valor)} ({(a.pct * 100).toFixed(1)}%)</title>
          </path>
        ))}
        <circle cx={cx} cy={cy} r="35" fill="#006070" />
        <text x={cx} y={cy - 6} textAnchor="middle" fontSize="9" fill="#b2d8de" fontWeight="600">TOTAL</text>
        <text x={cx} y={cy + 8} textAnchor="middle" fontSize="8" fill="#ffffff" fontWeight="700">
          {(total / 1000).toFixed(1)}k
        </text>
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1, minWidth: '140px' }}>
        {arcos.map((a, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: a.cor, flexShrink: 0 }} />
            <span style={{ color: '#e0f2f5', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.label}</span>
            <span style={{ color: '#b2d8de', fontWeight: 600, whiteSpace: 'nowrap' }}>{(a.pct * 100).toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Gráfico de Área SVG ─────────────────────────────────────────────────────

function GraficoLinha({ series }: {
  series: { label: string; cor: string; pontos: { mes: string; valor: number }[] }[]
}) {
  const W = 520; const H = 110; const PAD = { t: 8, r: 10, b: 24, l: 48 }
  const iW = W - PAD.l - PAD.r
  const iH = H - PAD.t - PAD.b

  const todosValores = series.flatMap(s => s.pontos.map(p => p.valor))
  const maxVal = Math.max(...todosValores, 1)
  const meses = series[0]?.pontos.map(p => p.mes) || []
  const base = PAD.t + iH

  const xPos = (i: number) => PAD.l + (i / (meses.length - 1 || 1)) * iW
  const yPos = (v: number) => PAD.t + iH - (v / maxVal) * iH

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible' }}>
      <defs>
        {series.map((s, si) => (
          <linearGradient key={si} id={`grad${si}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={s.cor} stopOpacity="0.18" />
            <stop offset="100%" stopColor={s.cor} stopOpacity="0.01" />
          </linearGradient>
        ))}
      </defs>

      {/* Grade discreta */}
      {[0, 0.5, 1].map(p => {
        const y = PAD.t + iH * (1 - p)
        return (
          <g key={p}>
            <line x1={PAD.l} y1={y} x2={W - PAD.r} y2={y} stroke="#007585" strokeWidth="1" strokeDasharray="3 3" />
            <text x={PAD.l - 5} y={y + 3} textAnchor="end" fontSize="8" fill="#7bbcc5">
              {p === 0 ? '0' : `${(maxVal * p / 1000).toFixed(0)}k`}
            </text>
          </g>
        )
      })}

      {/* Áreas preenchidas (ordem reversa para sobreposição correta) */}
      {[...series].reverse().map((s, si) => {
        const pts = s.pontos.map((p, i) => `${xPos(i)},${yPos(p.valor)}`).join(' ')
        const area = `${PAD.l},${base} ` + s.pontos.map((p, i) => `${xPos(i)},${yPos(p.valor)}`).join(' ') + ` ${xPos(s.pontos.length - 1)},${base}`
        return (
          <g key={si}>
            <polygon points={area} fill={`url(#grad${series.length - 1 - si})`} />
            <polyline points={pts} fill="none" stroke={s.cor} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
            {s.pontos.map((p, i) => (
              <circle key={i} cx={xPos(i)} cy={yPos(p.valor)} r="2.5" fill={s.cor} stroke="#fff" strokeWidth="1.2">
                <title>{s.label} — {p.mes}: {fmt(p.valor)}</title>
              </circle>
            ))}
          </g>
        )
      })}

      {/* Eixo X */}
      {meses.map((m, i) => (
        <text key={i} x={xPos(i)} y={H - 4} textAnchor="middle" fontSize="8" fill="#b2d8de">{m}</text>
      ))}
    </svg>
  )
}

// ─── Component Principal ──────────────────────────────────────────────────────

export default function Dashboard() {
  const { user } = useAuth()
  const [householdId, setHouseholdId] = useState<string | null>(null)

  const hoje = new Date()
  const [filtroMes, setFiltroMes] = useState(hoje.getMonth() + 1)
  const [filtroAno, setFiltroAno] = useState(hoje.getFullYear())

  const [contas, setContas] = useState<Conta[]>([])
  const [cartoes, setCartoes] = useState<Cartao[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [movsmes, setMovsMes] = useState<Movimentacao[]>([])
  const [movs6meses, setMovs6Meses] = useState<MovimentacaoLeve[]>([])
  const [saldosContas, setSaldosContas] = useState<Record<number, number>>({})
  const [comprometidoCartoes, setComprometidoCartoes] = useState<Record<number, number>>({})
  const [loading, setLoading] = useState(false)

  const anos = Array.from({ length: 5 }, (_, i) => hoje.getFullYear() - 2 + i)

  // ── Household ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return
    supabase.from('households').select('id').eq('owner_id', user.id).single()
      .then(({ data }) => { if (data) setHouseholdId(data.id) })
  }, [user])

  // ── Referências ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!householdId) return
    supabase.from('contas').select('id,nome,saldo_inicial,data_inicial').eq('household_id', householdId).eq('ativo', true).order('nome')
      .then(({ data }) => setContas(data || []))
    supabase.from('cartoes').select('id,nome,limite_total,data_vencimento').eq('household_id', householdId).eq('ativo', true).order('nome')
      .then(({ data }) => setCartoes(data || []))
    supabase.from('categorias').select('id,nome,classificacao').eq('household_id', householdId).order('nome')
      .then(({ data }) => setCategorias(data || []))
  }, [householdId])

  // ── Busca dados ─────────────────────────────────────────────────────────────
  const fetchDados = useCallback(async () => {
    if (!householdId) return
    setLoading(true)

    const mesStr = String(filtroMes).padStart(2, '0')
    const dataInicio = `${filtroAno}-${mesStr}-01`
    const ultimoDia = new Date(filtroAno, filtroMes, 0).getDate()
    const dataFim = `${filtroAno}-${mesStr}-${ultimoDia}`

    // Movimentações do mês (por data_movimentacao)
    const { data: mes } = await supabase
      .from('movimentacoes')
      .select('id,tipo,situacao,categoria_id,descricao,valor,metodo_pagamento,numero_parcela,data_movimentacao,data_pagamento,cartao_id,conta_origem_destino')
      .eq('household_id', householdId)
      .gte('data_movimentacao', dataInicio)
      .lte('data_movimentacao', dataFim)
    setMovsMes(mes || [])

    // Últimos 6 meses para o gráfico de linha
    const d6 = new Date(filtroAno, filtroMes - 7, 1)
    const data6Inicio = `${d6.getFullYear()}-${String(d6.getMonth() + 1).padStart(2, '0')}-01`
    const { data: seis } = await supabase
      .from('movimentacoes')
      .select('id,tipo,situacao,valor,data_movimentacao,numero_parcela,metodo_pagamento,cartao_id')
      .eq('household_id', householdId)
      .gte('data_movimentacao', data6Inicio)
      .lte('data_movimentacao', dataFim)
    setMovs6Meses(seis || [])

    // Saldo de cada conta: saldo_inicial + entradas - saídas (Pago)
    const { data: todasMovsConta } = await supabase
      .from('movimentacoes')
      .select('conta_origem_destino,tipo,valor,situacao')
      .eq('household_id', householdId)
      .eq('situacao', 'Pago')
    const movsConta = todasMovsConta || []
    const saldos: Record<number, number> = {}
    for (const c of contas) {
      let saldo = Number(c.saldo_inicial) || 0
      for (const m of movsConta) {
        if (m.conta_origem_destino !== c.nome) continue
        if (m.tipo === 'Receita') saldo += Number(m.valor)
        else if (m.tipo === 'Despesa') saldo -= Number(m.valor)
        else if (m.tipo === 'Transferência') saldo -= Number(m.valor)
      }
      saldos[c.id] = saldo
    }
    setSaldosContas(saldos)

    // Comprometido por cartão: só Pendente a partir de hoje
    const dataHoje = hoje.toISOString().split('T')[0]
    const { data: pendCartao } = await supabase
      .from('movimentacoes')
      .select('cartao_id,valor,situacao')
      .eq('household_id', householdId)
      .eq('situacao', 'Pendente')
      .not('cartao_id', 'is', null)
      .gte('data_pagamento', dataHoje)
    const comp: Record<number, number> = {}
    for (const m of pendCartao || []) {
      if (!m.cartao_id) continue
      comp[m.cartao_id] = (comp[m.cartao_id] || 0) + Number(m.valor)
    }
    setComprometidoCartoes(comp)

    setLoading(false)
  }, [householdId, filtroMes, filtroAno, contas])

  useEffect(() => { fetchDados() }, [fetchDados])

  // ── Cálculos do mês ─────────────────────────────────────────────────────────
  const totalReceitas = useMemo(() =>
    movsmes.filter(m => m.tipo === 'Receita' && m.situacao === 'Pago').reduce((s, m) => s + Number(m.valor), 0),
    [movsmes])

  const totalDespesas = useMemo(() =>
    movsmes.filter(m => m.tipo === 'Despesa' && (m.situacao === 'Pago' || (m.situacao === 'Pendente' && m.numero_parcela === 'Parcela 1/1')))
      .reduce((s, m) => s + Number(m.valor), 0),
    [movsmes])

  const saldo = totalReceitas - totalDespesas
  const totalSaldoContas = Object.values(saldosContas).reduce((s, v) => s + v, 0)

  // Por categoria
  const porCategoria = useMemo(() => {
    const map: Record<number, number> = {}
    for (const m of movsmes) {
      if (m.tipo !== 'Despesa') continue
      if (m.situacao === 'Previsto') continue
      if (!m.categoria_id) continue
      map[m.categoria_id] = (map[m.categoria_id] || 0) + Number(m.valor)
    }
    return Object.entries(map)
      .map(([id, valor]) => ({
        id: Number(id),
        nome: categorias.find(c => c.id === Number(id))?.nome || 'Sem categoria',
        classificacao: categorias.find(c => c.id === Number(id))?.classificacao || '',
        valor,
      }))
      .sort((a, b) => b.valor - a.valor)
  }, [movsmes, categorias])

  // Por classificação (pizza)
  const porClassificacao = useMemo(() => {
    const map: Record<string, number> = {}
    for (const m of movsmes) {
      if (m.tipo !== 'Despesa' || m.situacao === 'Previsto') continue
      const cat = categorias.find(c => c.id === m.categoria_id)
      const classif = cat?.classificacao || 'Outros'
      if (['Renda Ativa', 'Renda Passiva'].includes(classif)) continue
      map[classif] = (map[classif] || 0) + Number(m.valor)
    }
    const cores: Record<string, string> = {
      'Despesas Essenciais': '#2563eb',
      'Despesas Não Essenciais': '#f59e0b',
      'Metas / Investimentos': '#10b981',
      'Outros': '#9ca3af',
    }
    return Object.entries(map).map(([label, valor]) => ({ label, valor, cor: cores[label] || '#6b7280' }))
  }, [movsmes, categorias])

  // Por descrição (ranking)
  const porDescricao = useMemo(() => {
    const map: Record<string, number> = {}
    for (const m of movsmes) {
      if (m.tipo !== 'Despesa' || m.situacao === 'Previsto') continue
      map[m.descricao] = (map[m.descricao] || 0) + Number(m.valor)
    }
    return Object.entries(map).map(([desc, valor]) => ({ desc, valor })).sort((a, b) => b.valor - a.valor).slice(0, 10)
  }, [movsmes])

  // Evolução 6 meses
  const evolucao6Meses = useMemo(() => {
    const mesesLabels: string[] = []
    const receitasPorMes: number[] = []
    const despesasPorMes: number[] = []

    for (let i = 5; i >= 0; i--) {
      const d = new Date(filtroAno, filtroMes - 1 - i, 1)
      const m = d.getMonth() + 1
      const a = d.getFullYear()
      const label = MESES[m - 1].slice(0, 3)
      mesesLabels.push(label)

      const mesMovs = movs6meses.filter(mv => {
        const [y, mo] = mv.data_movimentacao.split('-')
        return Number(y) === a && Number(mo) === m
      })

      receitasPorMes.push(mesMovs.filter(mv => mv.tipo === 'Receita' && mv.situacao === 'Pago').reduce((s, mv) => s + Number(mv.valor), 0))
      despesasPorMes.push(mesMovs.filter(mv => mv.tipo === 'Despesa' && mv.situacao !== 'Previsto').reduce((s, mv) => s + Number(mv.valor), 0))
    }

    return {
      series: [
        { label: 'Receitas', cor: '#10b981', pontos: mesesLabels.map((mes, i) => ({ mes, valor: receitasPorMes[i] })) },
        { label: 'Despesas', cor: '#ef4444', pontos: mesesLabels.map((mes, i) => ({ mes, valor: despesasPorMes[i] })) },
      ]
    }
  }, [movs6meses, filtroMes, filtroAno])

  const maxCategoria = porCategoria[0]?.valor || 1
  const maxDescricao = porDescricao[0]?.valor || 1

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: "'Segoe UI', system-ui, sans-serif", padding: '24px', maxWidth: '1400px', margin: '0 auto', background: '#005562', minHeight: '100vh' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '26px', fontWeight: 700, color: '#ffffff', margin: 0 }}>Dashboard</h1>
          <p style={{ color: '#b2d8de', marginTop: '4px', fontSize: '13px' }}>Visão geral financeira — {MESES[filtroMes - 1]} {filtroAno}</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <select value={filtroMes} onChange={e => setFiltroMes(Number(e.target.value))} style={selectStyle}>
            {MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
          <select value={filtroAno} onChange={e => setFiltroAno(Number(e.target.value))} style={selectStyle}>
            {anos.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '80px', textAlign: 'center', color: '#9ca3af' }}>Carregando dashboard...</div>
      ) : (
        <>

          {/* ── Linha 1: Cards resumo ─────────────────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px', marginBottom: '20px' }}>
            <CardResumo label="Saldo em Contas" valor={fmt(totalSaldoContas)} sub="Todas as contas ativas" borda="#6ee7b7" icone="🏦" />
            <CardResumo label="Receitas do Mês" valor={fmt(totalReceitas)} sub="Pagamentos recebidos" borda="#93c5fd" icone="📈" />
            <CardResumo label="Despesas do Mês" valor={fmt(totalDespesas)} sub="Pago + Pendente à vista" borda="#fca5a5" icone="📉" />
            <CardResumo
              label="Saldo do Mês"
              valor={fmt(saldo)}
              sub="Receitas − Despesas"
              borda={saldo >= 0 ? '#6ee7b7' : '#fca5a5'}
              icone={saldo >= 0 ? '✅' : '⚠️'}
            />
          </div>

          {/* ── Linha 2: Contas + Cartões ─────────────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '20px' }}>

            {/* Saldos por conta */}
            <div style={cardStyle}>
              <SectionTitle>🏦 Saldos por Conta</SectionTitle>
              {contas.length === 0 ? <Vazio /> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {contas.map(c => {
                    const saldo = saldosContas[c.id] ?? 0
                    return (
                      <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#007585', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', flexShrink: 0 }}>🏦</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '13px', fontWeight: 600, color: '#ffffff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nome}</div>
                          <div style={{ fontSize: '11px', color: '#7bbcc5' }}>Conta corrente</div>
                        </div>
                        <div style={{ fontSize: '15px', fontWeight: 700, color: saldo >= 0 ? '#065f46' : '#991b1b', whiteSpace: 'nowrap' }}>
                          {fmt(saldo)}
                        </div>
                      </div>
                    )
                  })}
                  <div style={{ borderTop: '1px solid #007585', paddingTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#ffffff' }}>Total</span>
                    <span style={{ fontSize: '16px', fontWeight: 700, color: totalSaldoContas >= 0 ? '#065f46' : '#991b1b' }}>{fmt(totalSaldoContas)}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Cartões de crédito */}
            <div style={cardStyle}>
              <SectionTitle>💳 Cartões de Crédito</SectionTitle>
              {cartoes.length === 0 ? <Vazio /> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {cartoes.map(c => {
                    const usado = comprometidoCartoes[c.id] || 0
                    const disponivel = c.limite_total - usado
                    const pct = c.limite_total > 0 ? (usado / c.limite_total) * 100 : 0
                    const cor = pct > 80 ? '#ef4444' : pct > 50 ? '#f59e0b' : '#10b981'
                    return (
                      <div key={c.id}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                          <span style={{ fontSize: '13px', fontWeight: 600, color: '#ffffff' }}>{c.nome}</span>
                          <span style={{ fontSize: '12px', color: '#6b7280' }}>Vence dia {c.data_vencimento}</span>
                        </div>
                        <div style={{ background: '#f3f4f6', borderRadius: '99px', height: '6px', marginBottom: '4px' }}>
                          <div style={{ background: cor, borderRadius: '99px', height: '6px', width: `${Math.min(pct, 100)}%`, transition: 'width 0.4s' }} />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
                          <span style={{ color: '#7bbcc5' }}>Usado: <strong style={{ color: '#ffffff' }}>{fmt(usado)}</strong></span>
                          <span style={{ color: disponivel >= 0 ? '#065f46' : '#991b1b', fontWeight: 600 }}>Disponível: {fmt(disponivel)}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* ── Linha 3: Gráficos pizza + barras categoria ────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '20px' }}>

            {/* Pizza por classificação */}
            <div style={cardStyle}>
              <SectionTitle>🍕 Despesas por Classificação</SectionTitle>
              <GraficoPizza fatias={porClassificacao} />
            </div>

            {/* Barras por categoria */}
            <div style={cardStyle}>
              <SectionTitle>📊 Top Categorias do Mês</SectionTitle>
              {porCategoria.length === 0 ? <Vazio /> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {porCategoria.slice(0, 8).map((cat, i) => (
                    <div key={cat.id} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '11px', color: '#7bbcc5', width: '14px', textAlign: 'right', flexShrink: 0 }}>{i + 1}</span>
                      <span style={{ fontSize: '12px', color: '#e0f2f5', width: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 }}>{cat.nome}</span>
                      <BarraInline valor={cat.valor} max={maxCategoria} cor={CORES_GRAFICO[i % CORES_GRAFICO.length]} />
                      <span style={{ fontSize: '12px', fontWeight: 700, color: '#ffffff', width: '80px', textAlign: 'right', flexShrink: 0 }}>{fmt(cat.valor)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── Linha 4: Evolução 6 meses ─────────────────────────────────── */}
          <div style={{ ...cardStyle, marginBottom: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <SectionTitle>📈 Evolução — Últimos 6 Meses</SectionTitle>
              <div style={{ display: 'flex', gap: '16px', fontSize: '12px' }}>
                {evolucao6Meses.series.map(s => (
                  <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ width: '12px', height: '3px', background: s.cor, display: 'inline-block', borderRadius: '99px' }} />
                    <span style={{ color: '#b2d8de' }}>{s.label}</span>
                  </div>
                ))}
              </div>
            </div>
            <GraficoLinha series={evolucao6Meses.series} />
          </div>

          {/* ── Linha 5: Ranking por descrição ───────────────────────────── */}
          <div style={cardStyle}>
            <SectionTitle>🏷️ Ranking por Descrição</SectionTitle>
            {porDescricao.length === 0 ? <Vazio /> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {porDescricao.map((d, i) => (
                  <div key={d.desc} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{
                      width: '22px', height: '22px', borderRadius: '6px',
                      background: i < 3 ? ['#fef3c7','#f3f4f6','#fef9c3'][i] : '#f9fafb',
                      color: i < 3 ? ['#92400e','#374151','#854d0e'][i] : '#9ca3af',
                      fontSize: '11px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                    }}>
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                    </span>
                    <span style={{ fontSize: '13px', color: '#e0f2f5', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.desc}</span>
                    <BarraInline valor={d.valor} max={maxDescricao} cor={CORES_GRAFICO[i % CORES_GRAFICO.length]} />
                    <span style={{ fontSize: '13px', fontWeight: 700, color: '#ffffff', width: '100px', textAlign: 'right', flexShrink: 0 }}>{fmt(d.valor)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

        </>
      )}
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function CardResumo({ label, valor, sub, borda, icone }: {
  label: string; valor: string; sub: string; borda: string; icone: string
}) {
  return (
    <div style={{ background: '#006070', borderRadius: '14px', padding: '16px 18px', borderLeft: `4px solid ${borda}`, border: `1px solid #007585`, borderLeftWidth: '4px', borderLeftColor: borda }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, color: '#EC6E21', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
        <span style={{ fontSize: '20px' }}>{icone}</span>
      </div>
      <div style={{ fontSize: '22px', fontWeight: 700, color: '#ffffff', margin: '8px 0 2px' }}>{valor}</div>
      <div style={{ fontSize: '11px', color: '#b2d8de', opacity: 0.9 }}>{sub}</div>
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: '14px', fontWeight: 700, color: '#ffffff', marginBottom: '14px' }}>{children}</div>
}

function Vazio() {
  return <div style={{ color: '#7bbcc5', fontSize: '13px', padding: '20px 0', textAlign: 'center' }}>Sem dados para o período</div>
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
  background: '#006070',
  borderRadius: '14px',
  padding: '20px',
  border: '1px solid #007585',
  boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
}

const selectStyle: React.CSSProperties = {
  border: '1px solid #007585', borderRadius: '8px', padding: '7px 10px',
  fontSize: '13px', background: '#006070', color: '#ffffff', cursor: 'pointer', height: '38px'
}
