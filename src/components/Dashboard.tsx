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
  limite_mensal?: number | null
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

// ─── Logo dos bancos ──────────────────────────────────────────────────────────

function logoBanco(nome: string): { bg: string; color: string; sigla: string; emoji?: string } {
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

// ─── IA Analista Financeira ────────────────────────────────────────────────────

interface DadosIA {
  mes: string
  ano: number
  totalReceitas: number
  totalDespesas: number
  saldoMes: number
  topCategorias: { nome: string; valor: number; classificacao: string }[]
  comparativos: { nome: string; atual: number; anterior: number; diff: number }[]
  totalSaldoContas: number
  totalSaldoInvestimentos: number
}

function IAAnalistaFinanceira({ dados }: { dados: DadosIA }) {
  const [analise, setAnalise] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState<string>('')
  const [aberto, setAberto] = useState(false)

  const analisar = async () => {
    setLoading(true)
    setErro('')
    setAnalise('')
    setAberto(true)

    const prompt = `Você é um consultor financeiro pessoal especializado em finanças pessoais brasileiras. Analise os dados financeiros do usuário e forneça insights práticos e diretos em português brasileiro.

DADOS DO PERÍODO: ${dados.mes}/${dados.ano}

RESUMO FINANCEIRO:
- Receitas: ${fmt(dados.totalReceitas)}
- Despesas: ${fmt(dados.totalDespesas)}
- Saldo do mês: ${fmt(dados.saldoMes)} (${dados.saldoMes >= 0 ? 'positivo ✅' : 'negativo ❌'})
- Saldo total em contas correntes: ${fmt(dados.totalSaldoContas)}
- Total investido: ${fmt(dados.totalSaldoInvestimentos)}

TOP CATEGORIAS DE GASTOS:
${dados.topCategorias.map(c => `- ${c.nome} (${c.classificacao}): ${fmt(c.valor)}`).join('\n')}

${dados.comparativos.length > 0 ? `COMPARATIVO COM MÊS ANTERIOR (maiores variações):
${dados.comparativos.map(c => `- ${c.nome}: ${fmt(c.atual)} vs ${fmt(c.anterior)} (${c.diff >= 0 ? '+' : ''}${fmt(c.diff)})`).join('\n')}` : ''}

Com base nesses dados, forneça:

1. **Diagnóstico Geral** (2-3 linhas): Como está a saúde financeira deste mês.
2. **3 Pontos de Atenção**: O que está consumindo mais e por quê isso importa.
3. **3 Ações Concretas**: Sugestões práticas e específicas para o próximo mês, com valores quando possível.
4. **Mensagem Motivacional**: Uma frase curta e genuína de incentivo.

Seja direto, use emojis com moderação, evite linguagem genérica. Fale como um amigo que entende de finanças.`

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          messages: [{ role: 'user', content: prompt }],
        }),
      })

      const data = await response.json()
      if (data?.content?.[0]?.text) {
        setAnalise(data.content[0].text)
      } else {
        setErro('Não foi possível obter a análise. Tente novamente.')
      }
    } catch {
      setErro('Erro ao conectar com a IA. Verifique sua conexão.')
    } finally {
      setLoading(false)
    }
  }

  const renderAnalise = (texto: string) => {
    return texto.split('\n').map((linha, i) => {
      if (linha.startsWith('**') && linha.endsWith('**')) {
        return <p key={i} style={{ fontWeight: 700, color: '#111827', marginBottom: '4px', marginTop: i > 0 ? '14px' : 0 }}>{linha.replace(/\*\*/g, '')}</p>
      }
      if (linha.match(/^\d+\.\s\*\*/)) {
        const partes = linha.replace(/^\d+\.\s/, '').split('**')
        return (
          <p key={i} style={{ marginBottom: '6px', color: '#374151', lineHeight: 1.6 }}>
            <strong style={{ color: '#111827' }}>{partes[1]}</strong>{partes[2] || ''}
          </p>
        )
      }
      if (linha.startsWith('- ') || linha.startsWith('• ')) {
        return <p key={i} style={{ marginBottom: '4px', color: '#374151', paddingLeft: '12px', lineHeight: 1.6, borderLeft: '2px solid #e5e7eb' }}>{linha.replace(/^[-•]\s/, '')}</p>
      }
      if (linha.trim() === '') return <div key={i} style={{ height: '6px' }} />
      return <p key={i} style={{ marginBottom: '4px', color: '#374151', lineHeight: 1.6 }}>{linha}</p>
    })
  }

  return (
    <div style={{ ...cardStyle, border: '1px solid #dbeafe', background: 'linear-gradient(135deg, #eff6ff 0%, #fff 60%)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: aberto ? '16px' : 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '22px' }}>🤖</span>
          <div>
            <div style={{ fontSize: '15px', fontWeight: 700, color: '#1e3a5f' }}>IA Analista Financeira</div>
            <div style={{ fontSize: '12px', color: '#6b7280' }}>Análise personalizada do seu mês com Claude AI</div>
          </div>
        </div>
        <button
          onClick={analisar}
          disabled={loading}
          style={{
            background: loading ? '#9ca3af' : 'linear-gradient(135deg, #007d8f, #2563eb)',
            color: '#fff',
            border: 'none',
            borderRadius: '10px',
            padding: '10px 20px',
            fontSize: '13px',
            fontWeight: 700,
            cursor: loading ? 'not-allowed' : 'pointer',
            whiteSpace: 'nowrap',
            boxShadow: loading ? 'none' : '0 2px 8px rgba(0,125,143,0.3)',
          }}
        >
          {loading ? '⏳ Analisando...' : analise ? '🔄 Nova Análise' : '✨ Analisar Meu Mês'}
        </button>
      </div>

      {aberto && (
        <div style={{ borderTop: '1px solid #dbeafe', paddingTop: '16px' }}>
          {loading && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '30px', gap: '12px' }}>
              <div style={{
                width: '40px', height: '40px', borderRadius: '50%',
                border: '3px solid #dbeafe', borderTopColor: '#2563eb',
                animation: 'spin 1s linear infinite',
              }} />
              <p style={{ color: '#6b7280', fontSize: '13px', textAlign: 'center' }}>
                Processando seus dados financeiros...<br />
                <span style={{ color: '#9ca3af', fontSize: '11px' }}>Isso pode levar alguns segundos</span>
              </p>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          )}
          {erro && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '14px', color: '#991b1b', fontSize: '13px' }}>
              ⚠️ {erro}
            </div>
          )}
          {analise && !loading && (
            <div style={{ fontSize: '13px', lineHeight: 1.7 }}>
              {renderAnalise(analise)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Comparativo Mês Anterior ─────────────────────────────────────────────────

function ComparativoMes({ comparativos, totalAtual, totalAnterior }: {
  comparativos: { nome: string; atual: number; anterior: number; diff: number; classificacao: string }[]
  totalAtual: number
  totalAnterior: number
}) {
  const diffTotal = totalAtual - totalAnterior
  const corTotal = diffTotal > 0 ? '#ef4444' : '#10b981'

  return (
    <div style={cardStyle}>
      <SectionTitle>📅 Comparativo com Mês Anterior</SectionTitle>

      <div style={{ background: '#f9fafb', borderRadius: '10px', padding: '12px 14px', marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '13px', fontWeight: 600, color: '#374151' }}>Total de Despesas</span>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '15px', fontWeight: 700, color: '#111827' }}>{fmt(totalAtual)}</div>
          {totalAnterior > 0 && (
            <div style={{ fontSize: '11px', color: corTotal, fontWeight: 600 }}>
              {diffTotal >= 0 ? '▲' : '▼'} {fmt(Math.abs(diffTotal))} vs mês anterior
            </div>
          )}
        </div>
      </div>

      {comparativos.length === 0 ? (
        <div style={{ color: '#9ca3af', fontSize: '13px', textAlign: 'center', padding: '16px 0' }}>Sem dados do mês anterior para comparar</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', fontSize: '10px', color: '#9ca3af', paddingBottom: '4px', borderBottom: '1px solid #f3f4f6' }}>
            <span style={{ width: '72px', textAlign: 'right' }}>Mês ant.</span>
            <span style={{ width: '72px', textAlign: 'right' }}>Atual</span>
            <span style={{ width: '64px', textAlign: 'right' }}>Diferença</span>
          </div>
          {comparativos.slice(0, 8).map(c => {
            const cor = c.diff > 0 ? '#ef4444' : c.diff < 0 ? '#10b981' : '#9ca3af'
            const icon = c.diff > 0 ? '▲' : c.diff < 0 ? '▼' : '●'
            return (
              <div key={c.nome} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', borderBottom: '1px solid #f9fafb' }}>
                <span style={{ fontSize: '11px', color: cor, width: '12px', textAlign: 'center', flexShrink: 0 }}>{icon}</span>
                <span style={{ fontSize: '12px', color: '#374151', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nome}</span>
                <span style={{ fontSize: '12px', color: '#9ca3af', width: '72px', textAlign: 'right', flexShrink: 0 }}>{fmt(c.anterior)}</span>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#111827', width: '72px', textAlign: 'right', flexShrink: 0 }}>{fmt(c.atual)}</span>
                <span style={{ fontSize: '11px', fontWeight: 700, color: cor, width: '64px', textAlign: 'right', flexShrink: 0 }}>
                  {c.diff >= 0 ? '+' : ''}{fmt(c.diff)}
                </span>
              </div>
            )
          })}
        </div>
      )}
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
  const [movsAnterior, setMovsAnterior] = useState<Movimentacao[]>([])
  const [saldosContas, setSaldosContas] = useState<Record<number, number>>({})
  const [comprometidoCartoes, setComprometidoCartoes] = useState<Record<number, number>>({})
  const [loading, setLoading] = useState(false)

  const anos = Array.from({ length: 5 }, (_, i) => hoje.getFullYear() - 2 + i)

  useEffect(() => {
    if (!user) return
    supabase.from('households').select('id').eq('owner_id', user.id).single()
      .then(({ data }) => { if (data) setHouseholdId(data.id) })
  }, [user])

  useEffect(() => {
    if (!householdId) return
    supabase.from('contas').select('id,nome,saldo_inicial,data_inicial,tipo').eq('household_id', householdId).eq('ativo', true).order('nome')
      .then(({ data }) => setContas(data || []))
    supabase.from('cartoes').select('id,nome,limite_total,data_vencimento').eq('household_id', householdId).eq('ativo', true).order('nome')
      .then(({ data }) => setCartoes(data || []))
    supabase.from('categorias').select('id,nome,classificacao,limite_mensal').eq('household_id', householdId).order('nome')
      .then(({ data }) => setCategorias(data || []))
  }, [householdId])

  const fetchDados = useCallback(async () => {
    if (!householdId) return
    setLoading(true)

    const mesStr = String(filtroMes).padStart(2, '0')
    const dataInicio = `${filtroAno}-${mesStr}-01`
    const ultimoDia = new Date(filtroAno, filtroMes, 0).getDate()
    const dataFim = `${filtroAno}-${mesStr}-${ultimoDia}`

    const mesAnterior = filtroMes === 1 ? 12 : filtroMes - 1
    const anoAnterior = filtroMes === 1 ? filtroAno - 1 : filtroAno
    const mesAntStr = String(mesAnterior).padStart(2, '0')
    const dataInicioAnt = `${anoAnterior}-${mesAntStr}-01`
    const ultimoDiaAnt = new Date(anoAnterior, mesAnterior, 0).getDate()
    const dataFimAnt = `${anoAnterior}-${mesAntStr}-${ultimoDiaAnt}`

    const { data: mes } = await supabase
      .from('movimentacoes')
      .select('id,tipo,situacao,categoria_id,descricao,valor,metodo_pagamento,numero_parcela,data_movimentacao,data_pagamento,cartao_id,conta_origem_destino')
      .eq('household_id', householdId)
      .gte('data_movimentacao', dataInicio)
      .lte('data_movimentacao', dataFim)
    setMovsMes(mes || [])

    const { data: anterior } = await supabase
      .from('movimentacoes')
      .select('id,tipo,situacao,categoria_id,descricao,valor,metodo_pagamento,numero_parcela,data_movimentacao,data_pagamento,cartao_id,conta_origem_destino')
      .eq('household_id', householdId)
      .gte('data_movimentacao', dataInicioAnt)
      .lte('data_movimentacao', dataFimAnt)
    setMovsAnterior(anterior || [])

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

    setLoading(false)
  }, [householdId, filtroMes, filtroAno, contas])

  useEffect(() => { fetchDados() }, [fetchDados])

  // ── Cálculos ────────────────────────────────────────────────────────────────

  const totalReceitas = useMemo(() =>
    movsmes.filter(m => m.tipo === 'Receita' && m.situacao === 'Pago' && m.metodo_pagamento !== 'Transferência entre Contas')
      .reduce((s, m) => s + Number(m.valor), 0), [movsmes])

  const totalDespesas = useMemo(() =>
    movsmes.filter(m => m.tipo === 'Despesa' && (m.situacao === 'Pago' || (m.situacao === 'Pendente' && m.numero_parcela === 'Parcela 1/1')))
      .reduce((s, m) => s + Number(m.valor), 0), [movsmes])

  const totalCartaoCredito = useMemo(() =>
    movsmes.filter(m => m.tipo === 'Despesa' && m.situacao !== 'Previsto' && m.cartao_id !== null)
      .reduce((s, m) => s + Number(m.valor), 0), [movsmes])

  const totalDespesasAnterior = useMemo(() =>
    movsAnterior.filter(m => m.tipo === 'Despesa' && (m.situacao === 'Pago' || (m.situacao === 'Pendente' && m.numero_parcela === 'Parcela 1/1')))
      .reduce((s, m) => s + Number(m.valor), 0), [movsAnterior])

  const totalSaldoContas        = contas.filter(c => c.tipo === 'corrente').reduce((s, c) => s + (saldosContas[c.id] ?? 0), 0)
  const totalSaldoInvestimentos = contas.filter(c => c.tipo === 'investimento').reduce((s, c) => s + (saldosContas[c.id] ?? 0), 0)

  const porCategoria = useMemo(() => {
    const map: Record<number, number> = {}
    for (const m of movsmes) {
      if (m.tipo !== 'Despesa' || m.situacao === 'Previsto' || !m.categoria_id) continue
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

  const porCategoriaAnterior = useMemo(() => {
    const map: Record<number, number> = {}
    for (const m of movsAnterior) {
      if (m.tipo !== 'Despesa' || m.situacao === 'Previsto' || !m.categoria_id) continue
      map[m.categoria_id] = (map[m.categoria_id] || 0) + Number(m.valor)
    }
    return map
  }, [movsAnterior])

  const comparativos = useMemo(() =>
    porCategoria
      .map(c => ({
        nome: c.nome,
        classificacao: c.classificacao,
        atual: c.valor,
        anterior: porCategoriaAnterior[c.id] || 0,
        diff: c.valor - (porCategoriaAnterior[c.id] || 0),
      }))
      .filter(c => c.anterior > 0 || c.atual > 0)
      .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff)),
    [porCategoria, porCategoriaAnterior])

  const porDescricao = useMemo(() => {
    const map: Record<string, number> = {}
    for (const m of movsmes) {
      if (m.tipo !== 'Despesa' || m.situacao === 'Previsto') continue
      map[m.descricao] = (map[m.descricao] || 0) + Number(m.valor)
    }
    return Object.entries(map).map(([desc, valor]) => ({ desc, valor })).sort((a, b) => b.valor - a.valor).slice(0, 10)
  }, [movsmes])

  const maxCategoria = porCategoria[0]?.valor || 1
  const maxDescricao = porDescricao[0]?.valor || 1

  const dadosIA: DadosIA = useMemo(() => ({
    mes: MESES[filtroMes - 1],
    ano: filtroAno,
    totalReceitas,
    totalDespesas,
    saldoMes: totalReceitas - totalDespesas,
    topCategorias: porCategoria.slice(0, 6).map(c => ({ nome: c.nome, valor: c.valor, classificacao: c.classificacao })),
    comparativos: comparativos.slice(0, 5).map(c => ({ nome: c.nome, atual: c.atual, anterior: c.anterior, diff: c.diff })),
    totalSaldoContas,
    totalSaldoInvestimentos,
  }), [filtroMes, filtroAno, totalReceitas, totalDespesas, porCategoria, comparativos, totalSaldoContas, totalSaldoInvestimentos])

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
            <CardResumo label="Saldo em Contas" valor={fmt(totalSaldoContas)} sub="Contas correntes ativas" borda="#6ee7b7" icone="🏦" />
            <CardResumo label="Receitas do Mês" valor={fmt(totalReceitas)} sub="Pagamentos recebidos" borda="#93c5fd" icone="📈" />
            <CardResumo
              label="Despesas do Mês"
              valor={fmt(totalDespesas)}
              sub={totalDespesasAnterior > 0
                ? `${totalDespesas > totalDespesasAnterior ? '▲' : '▼'} ${fmt(Math.abs(totalDespesas - totalDespesasAnterior))} vs mês ant.`
                : 'Pago + Pendente à vista'
              }
              borda="#fca5a5"
              icone="📉"
              subCor={totalDespesasAnterior > 0 ? (totalDespesas > totalDespesasAnterior ? '#ef4444' : '#10b981') : undefined}
            />
            <CardResumo label="Despesas Cartão" valor={fmt(totalCartaoCredito)} sub="Todas as compras no crédito" borda="#c4b5fd" icone="💳" />
          </div>

          {/* ── IA Analista ────────────────────────────────────────────────── */}
          <div style={{ marginBottom: '20px' }}>
            <IAAnalistaFinanceira dados={dadosIA} />
          </div>

          {/* ── Contas + Cartões ───────────────────────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '20px' }}>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

              {/* Contas Correntes */}
              <div style={cardStyle}>
                <SectionTitle>🏦 Contas Correntes</SectionTitle>
                {contas.filter(c => c.tipo === 'corrente').length === 0 ? <Vazio /> : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {contas.filter(c => c.tipo === 'corrente').map(c => {
                      const saldo = saldosContas[c.id] ?? 0
                      const logo = logoBanco(c.nome)
                      return (
                        <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', background: '#f9fafb', borderRadius: '10px', padding: '10px 14px', border: '1px solid #e5e7eb' }}>
                          <div style={{ width: '38px', height: '38px', borderRadius: '8px', background: logo.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: logo.emoji ? '20px' : '11px', fontWeight: 700, color: logo.color, letterSpacing: '-0.5px' }}>
                            {logo.emoji || logo.sigla}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '13px', fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nome}</div>
                            <div style={{ fontSize: '11px', color: '#9ca3af' }}>Conta corrente</div>
                          </div>
                          <div style={{ fontSize: '15px', fontWeight: 700, color: saldo >= 0 ? '#065f46' : '#991b1b', whiteSpace: 'nowrap' }}>{fmt(saldo)}</div>
                        </div>
                      )
                    })}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #e5e7eb', paddingTop: '10px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: '#374151', textTransform: 'uppercase' }}>Total</span>
                      <span style={{ fontSize: '17px', fontWeight: 700, color: totalSaldoContas >= 0 ? '#065f46' : '#991b1b' }}>{fmt(totalSaldoContas)}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Investimentos */}
              <div style={cardStyle}>
                <SectionTitle>📈 Investimentos</SectionTitle>
                {contas.filter(c => c.tipo === 'investimento').length === 0 ? <Vazio /> : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {contas.filter(c => c.tipo === 'investimento').map(c => {
                      const saldo = saldosContas[c.id] ?? 0
                      return (
                        <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', background: '#f0fdf4', borderRadius: '10px', padding: '10px 14px', border: '1px solid #bbf7d0' }}>
                          <div style={{ width: '38px', height: '38px', borderRadius: '8px', background: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '11px', fontWeight: 700, color: '#fff' }}>
                            {c.nome.replace(/[^A-Z0-9]/gi, '').slice(0, 3).toUpperCase()}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '13px', fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nome}</div>
                            <div style={{ fontSize: '11px', color: '#16a34a' }}>Investimento</div>
                          </div>
                          <div style={{ fontSize: '15px', fontWeight: 700, color: '#065f46', whiteSpace: 'nowrap' }}>{fmt(saldo)}</div>
                        </div>
                      )
                    })}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #bbf7d0', paddingTop: '10px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: '#16a34a', textTransform: 'uppercase' }}>Total Investido</span>
                      <span style={{ fontSize: '17px', fontWeight: 700, color: '#065f46' }}>{fmt(totalSaldoInvestimentos)}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Cartões de crédito */}
            <div style={cardStyle}>
              <SectionTitle>💳 Cartões de Crédito</SectionTitle>
              {cartoes.length === 0 ? <Vazio /> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {cartoes.map(c => {
                    const usado = comprometidoCartoes[c.id] || 0
                    const disponivel = c.limite_total - usado
                    const pct = c.limite_total > 0 ? (usado / c.limite_total) * 100 : 0
                    const corBarra = pct > 80 ? '#ef4444' : pct > 50 ? '#f59e0b' : '#10b981'
                    const logo = logoBanco(c.nome)
                    return (
                      <div key={c.id} style={{ background: '#f9fafb', borderRadius: '10px', padding: '10px 14px', border: '1px solid #e5e7eb' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                          <div style={{ width: '34px', height: '34px', borderRadius: '8px', background: logo.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: logo.emoji ? '18px' : '10px', fontWeight: 700, color: logo.color }}>
                            {logo.emoji || logo.sigla}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '13px', fontWeight: 600, color: '#111827' }}>{c.nome}</div>
                            <div style={{ fontSize: '11px', color: '#6b7280' }}>Vence dia {c.data_vencimento} · Limite {fmt(c.limite_total)}</div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '14px', fontWeight: 700, color: disponivel >= 0 ? '#065f46' : '#991b1b' }}>{fmt(disponivel)}</div>
                            <div style={{ fontSize: '10px', color: '#9ca3af' }}>disponível</div>
                          </div>
                        </div>
                        <div style={{ background: '#f3f4f6', borderRadius: '99px', height: '5px' }}>
                          <div style={{ background: corBarra, borderRadius: '99px', height: '5px', width: `${Math.min(pct, 100)}%`, transition: 'width 0.4s' }} />
                        </div>
                        <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px' }}>
                          Usado: <strong style={{ color: '#374151' }}>{fmt(usado)}</strong>
                          <span style={{ color: '#6b7280', marginLeft: '6px' }}>({pct.toFixed(0)}%)</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* ── Comparativo + Top Categorias ──────────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '20px' }}>
            <ComparativoMes comparativos={comparativos} totalAtual={totalDespesas} totalAnterior={totalDespesasAnterior} />

            <div style={cardStyle}>
              <SectionTitle>📊 Top Categorias</SectionTitle>
              {porCategoria.length === 0 ? <Vazio /> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {porCategoria.slice(0, 8).map((cat, i) => {
                    const catDados = categorias.find(c => c.id === cat.id)
                    const limite = catDados?.limite_mensal
                    const pctLimite = limite && limite > 0 ? (cat.valor / limite) * 100 : null
                    return (
                      <div key={cat.id} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '11px', color: '#9ca3af', width: '14px', textAlign: 'right', flexShrink: 0 }}>{i + 1}</span>
                        <span style={{ fontSize: '12px', color: '#374151', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cat.nome}</span>
                        <BarraInline valor={cat.valor} max={maxCategoria} cor={CORES_GRAFICO[i % CORES_GRAFICO.length]} />
                        <span style={{ fontSize: '12px', fontWeight: 700, color: '#111827', width: '72px', textAlign: 'right', flexShrink: 0 }}>{fmt(cat.valor)}</span>
                        {pctLimite !== null && (
                          <span style={{ fontSize: '10px', padding: '1px 5px', borderRadius: '99px', background: pctLimite > 100 ? '#fee2e2' : '#f0fdf4', color: pctLimite > 100 ? '#ef4444' : '#16a34a', flexShrink: 0 }}>
                            {pctLimite.toFixed(0)}%
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* ── Ranking por Descrição ─────────────────────────────────────── */}
          <div style={cardStyle}>
            <SectionTitle>🏷️ Ranking por Descrição</SectionTitle>
            {porDescricao.length === 0 ? <Vazio /> : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 32px' }}>
                {porDescricao.map((d, i) => (
                  <div key={d.desc} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '13px', width: '20px', textAlign: 'center', flexShrink: 0 }}>
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : <span style={{ fontSize: '11px', color: '#9ca3af' }}>{i + 1}</span>}
                    </span>
                    <span style={{ fontSize: '12px', color: '#374151', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.desc}</span>
                    <BarraInline valor={d.valor} max={maxDescricao} cor={CORES_GRAFICO[i % CORES_GRAFICO.length]} />
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#111827', width: '72px', textAlign: 'right', flexShrink: 0 }}>{fmt(d.valor)}</span>
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

function CardResumo({ label, valor, sub, borda, icone, subCor }: {
  label: string; valor: string; sub: string; borda: string; icone: string; subCor?: string
}) {
  return (
    <div style={{ background: '#fff', borderRadius: '14px', padding: '16px 18px', border: '1px solid #e5e7eb', borderLeft: `4px solid ${borda}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
        <span style={{ fontSize: '20px' }}>{icone}</span>
      </div>
      <div style={{ fontSize: '22px', fontWeight: 700, color: '#111827', margin: '8px 0 2px' }}>{valor}</div>
      <div style={{ fontSize: '11px', color: subCor || '#6b7280', fontWeight: subCor ? 600 : 400 }}>{sub}</div>
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: '14px', fontWeight: 700, color: '#111827', marginBottom: '14px' }}>{children}</div>
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
