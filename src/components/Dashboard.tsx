import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Conta {
  id: number
  nome: string
  saldo_inicial: number
  data_inicial: string
  tipo: 'corrente' | 'investimento'
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

interface Categoria {
  id: number
  nome: string
  classificacao: string
  limite_gastos: number | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
               'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
const MESES_CURTOS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

// ─── Logo dos bancos ──────────────────────────────────────────────────────────

function logoBanco(nome: string): { bg: string; color: string; sigla: string } {
  const n = nome.toLowerCase()
  if (n.includes('nubank'))       return { bg: '#8A05BE', color: '#fff', sigla: 'NU' }
  if (n.includes('itaú') || n.includes('itau')) return { bg: '#EC7000', color: '#fff', sigla: 'ITÁ' }
  if (n.includes('bradesco'))     return { bg: '#CC092F', color: '#fff', sigla: 'BRA' }
  if (n.includes('santander'))    return { bg: '#EC0000', color: '#fff', sigla: 'SAN' }
  if (n.includes('caixa'))        return { bg: '#006CA8', color: '#fff', sigla: 'CEF' }
  if (n.includes('bb') || n.includes('brasil')) return { bg: '#F8D100', color: '#003087', sigla: 'BB' }
  if (n.includes('sicredi'))      return { bg: '#00813D', color: '#fff', sigla: 'SIC' }
  if (n.includes('sicoob'))       return { bg: '#006937', color: '#fff', sigla: 'SCB' }
  if (n.includes('inter'))        return { bg: '#FF7A00', color: '#fff', sigla: 'INT' }
  if (n.includes('c6'))           return { bg: '#242424', color: '#fff', sigla: 'C6' }
  if (n.includes('neon'))         return { bg: '#00E5FF', color: '#000', sigla: 'NEO' }
  if (n.includes('mercado') || n.includes('pago')) return { bg: '#00AEEF', color: '#fff', sigla: 'MP' }
  if (n.includes('picpay'))       return { bg: '#21C25E', color: '#fff', sigla: 'PIC' }
  if (n.includes('swile') || n.includes('swi')) return { bg: '#FF6B6B', color: '#fff', sigla: 'SWI' }
  if (n.includes('pernambucanas') || n.includes('perna')) return { bg: '#E30613', color: '#fff', sigla: 'PER' }
  if (n.includes('havan'))        return { bg: '#003087', color: '#fff', sigla: 'HAV' }
  if (n.includes('cactus'))       return { bg: '#2D7A3A', color: '#fff', sigla: 'CAC' }
  const sigla = nome.replace(/[^a-zA-Z]/g, '').slice(0, 3).toUpperCase()
  return { bg: '#e5e7eb', color: '#374151', sigla }
}


// ─── Gráfico de barras mensal com linha de meta ───────────────────────────────

function GraficoBarrasMensal({
  dados, meta, corMeta, titulo, altura = 240
}: {
  dados: { mes: number; ano: number; valor: number; label: string }[]
  meta: number
  corMeta: string
  titulo: string
  altura?: number
}) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; valor: number; label: string } | null>(null)
  const PADDING_TOP = 28
  const PADDING_BOTTOM = 32
  const PADDING_LEFT = 12
  const PADDING_RIGHT = meta > 0 ? 90 : 12
  const areaAltura = altura

  const maiorValor = Math.max(...dados.map(d => d.valor), meta, 1)
  const maxValor = maiorValor * 1.15

  const yBarra = (valor: number) => {
    if (valor <= 0) return areaAltura
    return areaAltura - (valor / maxValor) * areaAltura
  }

  const yMeta = meta > 0 ? areaAltura - (meta / maxValor) * areaAltura : null
  const svgHeight = altura + PADDING_TOP + PADDING_BOTTOM

  return (
    <div>
      {titulo && <div style={{ fontSize: '14px', fontWeight: 700, color: '#111827', marginBottom: '12px' }}>{titulo}</div>}
      <svg
        width="100%"
        height={svgHeight}
        viewBox={`0 0 1000 ${svgHeight}`}
        preserveAspectRatio="none"
        style={{ display: 'block' }}
      >
        <g transform={`translate(${PADDING_LEFT}, ${PADDING_TOP})`}>
          {(() => {
            const areaWidth = 1000 - PADDING_LEFT - PADDING_RIGHT
            const slotWidth = areaWidth / dados.length
            const larguraBarra = Math.min(slotWidth * 0.6, 80)
            const offsetX = (slotWidth - larguraBarra) / 2

            return (
              <>
                {yMeta !== null && (
                  <g>
                    <line x1={0} y1={yMeta} x2={areaWidth + 4} y2={yMeta} stroke={corMeta} strokeWidth={2} strokeDasharray="8,5" />
                    <rect x={areaWidth + 6} y={yMeta - 11} width={86} height={18} fill="#fff" rx={3} />
                    <text x={areaWidth + 8} y={yMeta + 4} fontSize={11} fontWeight={700} fill={corMeta}>
                      {fmt(meta)}
                    </text>
                  </g>
                )}

                {dados.map((d, i) => {
                  const x = i * slotWidth + offsetX
                  const cx = i * slotWidth + slotWidth / 2
                  const acimaMeta = meta > 0 && d.valor > meta
                  const corBarra = meta === 0 ? '#2563eb' : acimaMeta ? '#ef4444' : '#16a34a'
                  const corTexto = meta === 0 ? '#2563eb' : acimaMeta ? '#ef4444' : '#16a34a'
                  const yTopo = yBarra(d.valor)
                  const hBarra = Math.max(areaAltura - yTopo, d.valor > 0 ? 4 : 0)

                  return (
                    <g key={i}>
                      {d.valor > 0 && (
                        <rect
                          x={x} y={yTopo} width={larguraBarra} height={hBarra}
                          fill={corBarra} rx={4}
                          style={{ cursor: 'pointer' }}
                          onMouseEnter={() => setTooltip({ x: cx, y: yTopo, valor: d.valor, label: d.label })}
                          onMouseLeave={() => setTooltip(null)}
                        />
                      )}
                      {d.valor > 0 && (
                        <text x={cx} y={yTopo - 6} textAnchor="middle" fontSize={11} fontWeight={700} fill={corTexto}>
                          {(d.valor / 1000).toFixed(1)}k
                        </text>
                      )}
                      <text x={cx} y={areaAltura + 20} textAnchor="middle" fontSize={11} fill="#9ca3af">
                        {d.label}
                      </text>
                    </g>
                  )
                })}

                {tooltip && (
                  <g>
                    <rect
                      x={Math.min(tooltip.x - 55, 1000 - PADDING_LEFT - PADDING_RIGHT - 110)}
                      y={Math.max(tooltip.y - 44, 0)}
                      width={110} height={36}
                      fill="#111827" rx={6} opacity={0.92}
                    />
                    <text
                      x={Math.min(tooltip.x, 1000 - PADDING_LEFT - PADDING_RIGHT - 55)}
                      y={Math.max(tooltip.y - 28, 14)}
                      textAnchor="middle" fontSize={10} fill="#9ca3af"
                    >
                      {tooltip.label}
                    </text>
                    <text
                      x={Math.min(tooltip.x, 1000 - PADDING_LEFT - PADDING_RIGHT - 55)}
                      y={Math.max(tooltip.y - 14, 28)}
                      textAnchor="middle" fontSize={12} fontWeight={700} fill="#fff"
                    >
                      {fmt(tooltip.valor)}
                    </text>
                  </g>
                )}

                <line x1={0} y1={areaAltura} x2={areaWidth + 4} y2={areaAltura} stroke="#e5e7eb" strokeWidth={1} />
              </>
            )
          })()}
        </g>
      </svg>

      <div style={{ display: 'flex', gap: '16px', marginTop: '8px', flexWrap: 'wrap' }}>
        {meta > 0 && <>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#6b7280' }}>
            <div style={{ width: '12px', height: '12px', background: '#16a34a', borderRadius: '2px' }} />
            <span>Abaixo da meta</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#6b7280' }}>
            <div style={{ width: '12px', height: '12px', background: '#ef4444', borderRadius: '2px' }} />
            <span>Acima da meta</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#6b7280' }}>
            <svg width="20" height="10"><line x1="0" y1="5" x2="20" y2="5" stroke={corMeta} strokeWidth={2} strokeDasharray="4,3"/></svg>
            <span>Meta {fmt(meta)}/mês</span>
          </div>
        </>}
        {meta === 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#6b7280' }}>
            <div style={{ width: '12px', height: '12px', background: '#2563eb', borderRadius: '2px' }} />
            <span>Valor mensal</span>
          </div>
        )}
      </div>
    </div>
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
  const [movsAno, setMovsAno] = useState<Movimentacao[]>([])
  const [movsCartaoAno, setMovsCartaoAno] = useState<Movimentacao[]>([])
  const [saldosContas, setSaldosContas] = useState<Record<number, number>>({})
  const [comprometidoCartoes, setComprometidoCartoes] = useState<Record<number, number>>({})
  const [loading, setLoading] = useState(false)
  const [cartaoSelecionado, setCartaoSelecionado] = useState<number | null>(null)

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
    supabase.from('contas').select('id,nome,saldo_inicial,data_inicial,tipo').eq('household_id', householdId).eq('ativo', true).order('nome')
      .then(({ data }) => setContas(data || []))
    supabase.from('cartoes').select('id,nome,limite_total,data_vencimento').eq('household_id', householdId).eq('ativo', true).order('nome')
      .then(({ data }) => setCartoes(data || []))
    supabase.from('categorias').select('id,nome,classificacao,limite_gastos')
      .eq('household_id', householdId).order('nome')
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

    const { data: mes } = await supabase
      .from('movimentacoes')
      .select('id,tipo,situacao,categoria_id,descricao,valor,metodo_pagamento,numero_parcela,data_movimentacao,data_pagamento,cartao_id,conta_origem_destino')
      .eq('household_id', householdId)
      .gte('data_movimentacao', dataInicio)
      .lte('data_movimentacao', dataFim)
    setMovsMes(mes || [])

    const { data: ano } = await supabase
      .from('movimentacoes')
      .select('id,tipo,situacao,categoria_id,descricao,valor,metodo_pagamento,numero_parcela,data_movimentacao,data_pagamento,cartao_id,conta_origem_destino')
      .eq('household_id', householdId)
      .gte('data_movimentacao', `${filtroAno}-01-01`)
      .lte('data_movimentacao', `${filtroAno}-12-31`)
    setMovsAno(ano || [])

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

    const { data: cartaoAno } = await supabase
      .from('movimentacoes')
      .select('id,tipo,situacao,categoria_id,valor,metodo_pagamento,numero_parcela,data_movimentacao,data_pagamento,cartao_id,conta_origem_destino,descricao')
      .eq('household_id', householdId)
      .eq('tipo', 'Despesa')
      .not('cartao_id', 'is', null)
      .gte('data_pagamento', `${filtroAno}-01-01`)
      .lte('data_pagamento', `${filtroAno}-12-31`)
    setMovsCartaoAno(cartaoAno || [])

    setLoading(false)
  }, [householdId, filtroMes, filtroAno, contas])

  useEffect(() => { fetchDados() }, [fetchDados])

  // ── Cálculos do mês ─────────────────────────────────────────────────────────
  const totalReceitas = useMemo(() =>
    movsmes.filter(m =>
      m.tipo === 'Receita' &&
      ['Pago', 'Pendente'].includes(m.situacao) &&
      m.metodo_pagamento !== 'Transferência entre Contas'
    ).reduce((s, m) => s + Number(m.valor), 0), [movsmes])

  const totalDespesas = useMemo(() =>
    movsmes.filter(m =>
      m.tipo === 'Despesa' &&
      ['Pago', 'Pendente'].includes(m.situacao) &&
      !m.cartao_id
    ).reduce((s, m) => s + Number(m.valor), 0), [movsmes])

  const totalCartaoCredito = useMemo(() =>
    movsmes.filter(m =>
      m.tipo === 'Despesa' &&
      ['Pago', 'Pendente'].includes(m.situacao) &&
      m.cartao_id !== null
    ).reduce((s, m) => s + Number(m.valor), 0), [movsmes])

  const totalSaldoContas = contas.filter(c => c.tipo === 'corrente').reduce((s, c) => s + (saldosContas[c.id] ?? 0), 0)
  const totalSaldoInvestimentos = contas.filter(c => c.tipo === 'investimento').reduce((s, c) => s + (saldosContas[c.id] ?? 0), 0)

  const entraNoReal = (m: Movimentacao) =>
    m.tipo === 'Despesa' && (
      m.situacao === 'Pago' ||
      (m.situacao === 'Pendente' && m.numero_parcela === 'Parcela 1/1')
    )

  const porCategoria = useMemo(() => {
    const map: Record<number, number> = {}
    for (const m of movsmes) {
      if (!entraNoReal(m) || !m.categoria_id) continue
      map[m.categoria_id] = (map[m.categoria_id] || 0) + Number(m.valor)
    }
    return Object.entries(map)
      .map(([id, valor]) => ({
        id: Number(id),
        nome: categorias.find(c => c.id === Number(id))?.nome || 'Sem categoria',
        valor,
      }))
      .sort((a, b) => b.valor - a.valor)
  }, [movsmes, categorias])

  // ── Gráficos mês a mês ──────────────────────────────────────────────────────
  const dadosReceitasMensal = useMemo(() =>
    Array.from({ length: 12 }, (_, i) => {
      const mes = i + 1
      const valor = movsAno
        .filter(m => {
          const mMov = m.data_movimentacao ? parseInt(m.data_movimentacao.substring(5, 7), 10) : 0
          return m.tipo === 'Receita' && m.situacao === 'Pago' && mMov === mes
            && m.metodo_pagamento !== 'Transferência entre Contas'
        })
        .reduce((s, m) => s + Number(m.valor), 0)
      return { mes, ano: filtroAno, valor, label: MESES_CURTOS[i] }
    }), [movsAno, filtroAno])

  const dadosDespesasMensal = useMemo(() =>
    Array.from({ length: 12 }, (_, i) => {
      const mes = i + 1
      const valor = movsAno
        .filter(m => {
          const mMov = m.data_movimentacao ? parseInt(m.data_movimentacao.substring(5, 7), 10) : 0
          return m.tipo === 'Despesa' && mMov === mes &&
            (m.situacao === 'Pago' || (m.situacao === 'Pendente' && m.numero_parcela === 'Parcela 1/1'))
        })
        .reduce((s, m) => s + Number(m.valor), 0)
      return { mes, ano: filtroAno, valor, label: MESES_CURTOS[i] }
    }), [movsAno, filtroAno])

  const metaDespesas = useMemo(() =>
    categorias
      .filter(c => !['Renda Ativa', 'Renda Passiva'].includes(c.classificacao) && c.limite_gastos && c.limite_gastos > 0)
      .reduce((s, c) => s + (c.limite_gastos || 0), 0),
    [categorias])

  const dadosCartaoMensal = useMemo(() => {
    const cartaoId = cartaoSelecionado ?? (cartoes[0]?.id ?? null)
    return Array.from({ length: 12 }, (_, i) => {
      const mes = i + 1
      const valor = movsCartaoAno
        .filter(m => {
          if (!m.data_pagamento) return false
          const anoFatura = parseInt(m.data_pagamento.substring(0, 4), 10)
          const mesFatura = parseInt(m.data_pagamento.substring(5, 7), 10)
          return m.cartao_id === cartaoId && mesFatura === mes && anoFatura === filtroAno
            && ['Faturado', 'Pendente', 'Previsto'].includes(m.situacao)
        })
        .reduce((s, m) => s + Number(m.valor), 0)
      return { mes, ano: filtroAno, valor, label: MESES_CURTOS[i] }
    })
  }, [movsCartaoAno, filtroAno, cartaoSelecionado, cartoes])

  const cartaoAtivo = cartoes.find(c => c.id === (cartaoSelecionado ?? cartoes[0]?.id))

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: "'Segoe UI', system-ui, sans-serif", padding: '24px', maxWidth: '1400px', margin: '0 auto', background: '#f8fafc', minHeight: '100vh' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '26px', fontWeight: 700, color: '#111827', margin: 0 }}>Dashboard</h1>
          <p style={{ color: '#6b7280', marginTop: '4px', fontSize: '13px' }}>Visão geral financeira — {MESES[filtroMes - 1]} {filtroAno}</p>
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
            <CardResumo label="Saldo em Contas"          valor={fmt(totalSaldoContas)}    sub="Contas correntes ativas"    borda="#6ee7b7" icone="🏦" corValor={totalSaldoContas >= 0 ? '#065f46' : '#991b1b'} />
            <CardResumo label="Receitas do Mês"          valor={fmt(totalReceitas)}        sub="Pagamentos recebidos"       borda="#93c5fd" icone="📈" />
            <CardResumo label="Despesas do Mês"          valor={fmt(totalDespesas)}        sub="Pago + Pendente à vista"    borda="#fca5a5" icone="📉" />
            <CardResumo label="Despesas Cartão Crédito"  valor={fmt(totalCartaoCredito)}   sub="Todas as compras no crédito" borda="#c4b5fd" icone="💳" />
          </div>

          {/* ── Linha 2: Contas Correntes (grid largura total) ────────────── */}
          <div style={{ marginBottom: '20px' }}>
            <div style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#111827' }}>🏦 Contas Correntes</div>
                <div style={{ fontSize: '15px', fontWeight: 700, color: totalSaldoContas >= 0 ? '#065f46' : '#991b1b' }}>{fmt(totalSaldoContas)}</div>
              </div>
              {contas.filter(c => c.tipo === 'corrente').length === 0 ? <Vazio /> : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '12px' }}>
                  {contas.filter(c => c.tipo === 'corrente').map(c => {
                    const saldo = saldosContas[c.id] ?? 0
                    const logo = logoBanco(c.nome)
                    return (
                      <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', background: '#f9fafb', borderRadius: '10px', padding: '12px 14px', border: '1px solid #e5e7eb' }}>
                        <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: logo.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '12px', fontWeight: 700, color: logo.color, letterSpacing: '-0.5px' }}>
                          {logo.sigla}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '13px', fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nome}</div>
                          <div style={{ fontSize: '11px', color: '#9ca3af' }}>Conta corrente</div>
                        </div>
                        <div style={{ fontSize: '16px', fontWeight: 700, color: saldo >= 0 ? '#065f46' : '#991b1b', whiteSpace: 'nowrap' }}>{fmt(saldo)}</div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* ── Linha 2b: Investimentos (grid largura total) ──────────────── */}
          {contas.filter(c => c.tipo === 'investimento').length > 0 && (
            <div style={{ marginBottom: '20px' }}>
              <div style={cardStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#111827' }}>📈 Investimentos</div>
                  <div style={{ fontSize: '15px', fontWeight: 700, color: '#065f46' }}>{fmt(totalSaldoInvestimentos)}</div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '12px' }}>
                  {contas.filter(c => c.tipo === 'investimento').map(c => {
                    const saldo = saldosContas[c.id] ?? 0
                    const logo = logoBanco(c.nome)
                    return (
                      <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', background: '#f0fdf4', borderRadius: '10px', padding: '12px 14px', border: '1px solid #bbf7d0' }}>
                        <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: logo.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '12px', fontWeight: 700, color: logo.color }}>
                          {logo.sigla}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '13px', fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nome}</div>
                          <div style={{ fontSize: '11px', color: '#16a34a' }}>Investimento</div>
                        </div>
                        <div style={{ fontSize: '16px', fontWeight: 700, color: '#065f46', whiteSpace: 'nowrap' }}>{fmt(saldo)}</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ── Linha 2c: Cartões de Crédito (grid largura total) ─────────── */}
          {cartoes.length > 0 && (
            <div style={{ marginBottom: '20px' }}>
              <div style={cardStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#111827' }}>💳 Cartões de Crédito</div>
                  <div style={{ fontSize: '12px', color: '#6b7280' }}>{cartoes.length} cartão(ões)</div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '12px' }}>
                  {cartoes.map(c => {
                    const usado = comprometidoCartoes[c.id] || 0
                    const disponivel = c.limite_total - usado
                    const pct = c.limite_total > 0 ? (usado / c.limite_total) * 100 : 0
                    const corBarra = pct > 80 ? '#ef4444' : pct > 50 ? '#f59e0b' : '#10b981'
                    const logo = logoBanco(c.nome)
                    return (
                      <div key={c.id} style={{ background: '#f9fafb', borderRadius: '10px', padding: '12px 14px', border: '1px solid #e5e7eb' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                          <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: logo.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '11px', fontWeight: 700, color: logo.color }}>
                            {logo.sigla}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '13px', fontWeight: 600, color: '#111827' }}>{c.nome}</div>
                            <div style={{ fontSize: '11px', color: '#6b7280' }}>Vence dia {c.data_vencimento} · Limite {fmt(c.limite_total)}</div>
                          </div>
                          <div style={{ textAlign: 'right' as const }}>
                            <div style={{ fontSize: '15px', fontWeight: 700, color: disponivel >= 0 ? '#065f46' : '#991b1b' }}>{fmt(disponivel)}</div>
                            <div style={{ fontSize: '10px', color: '#9ca3af' }}>disponível</div>
                          </div>
                        </div>
                        <div style={{ background: '#e5e7eb', borderRadius: '99px', height: '7px' }}>
                          <div style={{ background: corBarra, borderRadius: '99px', height: '7px', width: `${Math.min(pct, 100)}%`, transition: 'width 0.4s' }} />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '5px' }}>
                          <span style={{ fontSize: '11px', color: corBarra, fontWeight: 700 }}>{pct.toFixed(0)}% usado</span>
                          <span style={{ fontSize: '11px', color: '#6b7280' }}>
                            Usado: <strong style={{ color: '#374151' }}>{fmt(usado)}</strong>
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ── Linha 3: Limites por Categoria (largura total) ────────────── */}
          <div style={{ marginBottom: '20px' }}>
            <div style={cardStyle}>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#111827', marginBottom: '16px' }}>
                🏷️ Limites por Categoria — {MESES[filtroMes - 1]}
              </div>
              {porCategoria.filter(c => {
                const cat = categorias.find(x => x.id === c.id)
                return cat?.limite_gastos && cat.limite_gastos > 0
              }).length === 0 ? (
                <Vazio />
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '14px' }}>
                  {porCategoria
                    .filter(c => {
                      const cat = categorias.find(x => x.id === c.id)
                      return cat?.limite_gastos && cat.limite_gastos > 0
                    })
                    .map((cat) => {
                      const limite = categorias.find(x => x.id === cat.id)?.limite_gastos || 0
                      const pct = limite > 0 ? (cat.valor / limite) * 100 : 0
                      const cor = pct > 100 ? '#ef4444' : pct > 80 ? '#f59e0b' : '#10b981'
                      return (
                        <div key={cat.id} style={{ background: '#f9fafb', borderRadius: '10px', padding: '12px 14px', border: '1px solid #e5e7eb' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                            <span style={{ fontSize: '13px', color: '#374151', fontWeight: 600 }}>{cat.nome}</span>
                            <span style={{ fontSize: '12px', color: cor, fontWeight: 700, whiteSpace: 'nowrap', marginLeft: '8px' }}>
                              {fmt(cat.valor)} / {fmt(limite)}
                            </span>
                          </div>
                          <div style={{ background: '#e5e7eb', borderRadius: '99px', height: '7px' }}>
                            <div style={{ background: cor, borderRadius: '99px', height: '7px', width: `${Math.min(pct, 100)}%`, transition: 'width 0.4s' }} />
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '5px' }}>
                            <span style={{ fontSize: '10px', color: cor, fontWeight: 700 }}>{pct.toFixed(0)}% do limite</span>
                            <span style={{ fontSize: '10px', color: '#9ca3af' }}>
                              {pct > 100 ? `⚠️ ${fmt(cat.valor - limite)} acima` : `${fmt(limite - cat.valor)} restante`}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                </div>
              )}
            </div>
          </div>

          {/* ── Linha 4: Gráficos mês a mês ───────────────────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={cardStyle}>
              <GraficoBarrasMensal
                titulo={`📈 Receitas Mês a Mês — ${filtroAno}`}
                dados={dadosReceitasMensal}
                meta={0}
                corMeta="#10b981"
                altura={200}
              />
            </div>

            <div style={cardStyle}>
              <GraficoBarrasMensal
                titulo={`📉 Despesas Mês a Mês — ${filtroAno}`}
                dados={dadosDespesasMensal}
                meta={metaDespesas}
                corMeta="#f59e0b"
                altura={200}
              />
            </div>

            {cartoes.length > 0 && (
              <div style={cardStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#111827' }}>💳 Cartão de Crédito Mês a Mês — {filtroAno}</div>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {cartoes.map(c => (
                      <button
                        key={c.id}
                        onClick={() => setCartaoSelecionado(c.id)}
                        style={{
                          padding: '4px 12px', borderRadius: '99px', fontSize: '12px', fontWeight: 600,
                          cursor: 'pointer', border: 'none',
                          background: (cartaoSelecionado ?? cartoes[0]?.id) === c.id ? '#7c3aed' : '#f3f4f6',
                          color: (cartaoSelecionado ?? cartoes[0]?.id) === c.id ? '#fff' : '#374151',
                        }}
                      >{c.nome}</button>
                    ))}
                  </div>
                  {cartaoAtivo && (
                    <span style={{ fontSize: '11px', color: '#9ca3af', marginLeft: 'auto' }}>
                      Limite: {fmt(cartaoAtivo.limite_total)} · Vence dia {cartaoAtivo.data_vencimento}
                    </span>
                  )}
                </div>
                <GraficoBarrasMensal
                  titulo=""
                  dados={dadosCartaoMensal}
                  meta={0}
                  corMeta="#7c3aed"
                  altura={200}
                />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function CardResumo({ label, valor, sub, borda, icone, corValor }: {
  label: string; valor: string; sub: string; borda: string; icone: string; corValor?: string
}) {
  return (
    <div style={{ background: '#fff', borderRadius: '14px', padding: '16px 18px', border: '1px solid #e5e7eb', borderLeft: `4px solid ${borda}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
        <span style={{ fontSize: '20px' }}>{icone}</span>
      </div>
      <div style={{ fontSize: '22px', fontWeight: 700, color: corValor || '#111827', margin: '8px 0 2px' }}>{valor}</div>
      <div style={{ fontSize: '11px', color: '#6b7280', opacity: 0.7 }}>{sub}</div>
    </div>
  )
}

function Vazio() {
  return <div style={{ color: '#9ca3af', fontSize: '13px', padding: '20px 0', textAlign: 'center' }}>Sem dados para o período</div>
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
  background: '#fff',
  borderRadius: '14px',
  padding: '20px',
  border: '1px solid #e5e7eb',
  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
}

const selectStyle: React.CSSProperties = {
  border: '1px solid #d1d5db', borderRadius: '8px', padding: '7px 10px',
  fontSize: '13px', background: '#fff', color: '#111827', cursor: 'pointer', height: '38px'
}
