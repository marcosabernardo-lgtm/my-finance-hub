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
  cartao_id: number | null
  forma_pagamento: string | null
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

interface LinhaDRE {
  id: string
  catId: number | null
  nome: string
  classificacao: string
  tipo: 'receita' | 'despesa'
  limite: number
  meses: Record<number, number>
  total: number
}

interface PagamentoFatura {
  cartao_id: number
  mes: number
  valor: number
}

// Drill-down: categoria + mês selecionados para expandir
interface DrillKey { linhaId: string; mes: number }

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const fmtDate = (d: string | null) => {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

const MESES_CURTOS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

const getMes = (d: string) => Number(d.split('-')[1])
const getAno = (d: string) => Number(d.split('-')[0])

const isAvista = (fp: string | null) => {
  const s = (fp || '').toLowerCase().trim()
  return s.includes('vista') || s === 'a vista' || s === 'à vista'
}

type FiltroSituacao = 'realizado' | 'pendente' | 'previsto' | 'todos'

const corSituacao = (s: string): React.CSSProperties => {
  switch (s) {
    case 'Pago':     return { background: '#d1fae5', color: '#065f46' }
    case 'Pendente': return { background: '#fef3c7', color: '#92400e' }
    case 'Faturado': return { background: '#dbeafe', color: '#1e40af' }
    case 'Previsto': return { background: '#f3e8ff', color: '#6b21a8' }
    default:         return { background: '#f3f4f6', color: '#374151' }
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function DRE() {
  const { user } = useAuth()
  const [householdId, setHouseholdId] = useState<string | null>(null)

  const hoje = new Date()
  const mesAtual = hoje.getMonth() + 1
  const [ano, setAno] = useState(hoje.getFullYear())
  const [filtroSituacao, setFiltroSituacao] = useState<FiltroSituacao>('todos')

  const [movimentacoes, setMovimentacoes] = useState<Movimentacao[]>([])
  const [pagamentosFatura, setPagamentosFatura] = useState<PagamentoFatura[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [loading, setLoading] = useState(false)

  // Drill-down: qual linha+mês está expandido (null = nenhum)
  const [drillAberto, setDrillAberto] = useState<DrillKey | null>(null)

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
      .eq('household_id', householdId).order('nome')
      .then(({ data }) => setCategorias(data || []))
  }, [householdId])

  // ── Busca dados do ano ───────────────────────────────────────────────────────
  const fetchDados = useCallback(async () => {
    if (!householdId) return
    setLoading(true)
    const dataInicio = `${ano}-01-01`
    const dataFim = `${ano}-12-31`

    const { data: movs } = await supabase
      .from('movimentacoes')
      .select('id,tipo,situacao,categoria_id,descricao,valor,metodo_pagamento,cartao_id,forma_pagamento,numero_parcela,data_movimentacao,data_pagamento')
      .eq('household_id', householdId)
      .in('tipo', ['Despesa', 'Receita'])
      .gte('data_movimentacao', dataInicio)
      .lte('data_movimentacao', dataFim)

    setMovimentacoes(movs || [])

    const { data: faturas } = await supabase
      .from('movimentacoes')
      .select('cartao_id,valor,data_pagamento')
      .eq('household_id', householdId)
      .eq('tipo', 'Transferência')
      .eq('situacao', 'Pago')
      .not('cartao_id', 'is', null)
      .gte('data_pagamento', dataInicio)
      .lte('data_pagamento', dataFim)

    setPagamentosFatura(
      (faturas || []).filter(f => f.data_pagamento && f.cartao_id).map(f => ({
        cartao_id: f.cartao_id,
        mes: getMes(f.data_pagamento!),
        valor: Number(f.valor),
      }))
    )
    setLoading(false)
  }, [householdId, ano])

  useEffect(() => { fetchDados() }, [fetchDados])

  // ── Situações incluídas ──────────────────────────────────────────────────────
  const situacoesIncluidas = useMemo((): string[] => {
    switch (filtroSituacao) {
      case 'realizado': return ['Pago', 'Faturado']
      case 'pendente':  return ['Pago', 'Faturado', 'Pendente']
      case 'previsto':  return ['Pago', 'Faturado', 'Previsto']
      case 'todos':     return ['Pago', 'Faturado', 'Pendente', 'Previsto']
    }
  }, [filtroSituacao])

  // ── Processamento DRE ────────────────────────────────────────────────────────
  const linhasDRE = useMemo(() => {
    const acumulador: Record<string, Record<number, number>> = {}

    const adicionar = (catId: number | null, tipo: string, mes: number, valor: number) => {
      const key = catId ? String(catId) : `sem_cat_${tipo}`
      if (!acumulador[key]) acumulador[key] = {}
      acumulador[key][mes] = (acumulador[key][mes] || 0) + valor
    }

    const getMesRef = (m: Movimentacao): number | null => {
      if (!m.data_pagamento) return null
      if (getAno(m.data_pagamento) !== ano) return null
      return getMes(m.data_pagamento)
    }

    for (const m of movimentacoes) {
      if (!situacoesIncluidas.includes(m.situacao)) continue

      if (m.tipo === 'Receita') {
        const mr = getMesRef(m); if (!mr) continue
        adicionar(m.categoria_id, 'Receita', mr, Number(m.valor)); continue
      }

      if (m.metodo_pagamento === 'Cartão de Crédito' && m.situacao === 'Faturado') {
        if (!m.data_pagamento) continue
        const mr = getMes(m.data_pagamento)
        if (getAno(m.data_pagamento) !== ano) continue
        const pgto = pagamentosFatura.filter(p => p.cartao_id === m.cartao_id && p.mes === mr).reduce((s, p) => s + p.valor, 0)
        const totalFat = movimentacoes.filter(x => x.metodo_pagamento === 'Cartão de Crédito' && x.situacao === 'Faturado' && x.cartao_id === m.cartao_id && x.data_pagamento && getMes(x.data_pagamento) === mr && getAno(x.data_pagamento) === ano).reduce((s, x) => s + Number(x.valor), 0)
        const pct = totalFat > 0 ? Math.min(pgto / totalFat, 1) : 0
        const vr = Number(m.valor) * pct
        if (vr > 0) adicionar(m.categoria_id, 'Despesa', mr, vr); continue
      }

      if (m.metodo_pagamento === 'Cartão de Crédito' && m.situacao === 'Pendente' && isAvista(m.forma_pagamento)) {
        const mr = getMesRef(m); if (!mr) continue
        adicionar(m.categoria_id, 'Despesa', mr, Number(m.valor)); continue
      }

      const mr = getMesRef(m); if (!mr) continue
      adicionar(m.categoria_id, 'Despesa', mr, Number(m.valor))
    }

    const catMap = Object.fromEntries(categorias.map(c => [String(c.id), c]))
    const linhas: LinhaDRE[] = []

    for (const [key, mesesValores] of Object.entries(acumulador)) {
      const cat = catMap[key]
      const total = Object.values(mesesValores).reduce((s, v) => s + v, 0)
      if (total === 0) continue
      let nome = 'Sem categoria', classificacao = '', limite = 0
      let tipo: LinhaDRE['tipo'] = 'despesa'
      let catId: number | null = null
      if (cat) {
        nome = cat.nome; classificacao = cat.classificacao
        limite = Number(cat.limite_gastos) || 0
        tipo = ['Renda Ativa', 'Renda Passiva'].includes(cat.classificacao) ? 'receita' : 'despesa'
        catId = cat.id
      } else if (key.includes('Receita')) { tipo = 'receita'; nome = 'Receita sem categoria' }
      linhas.push({ id: key, catId, nome, classificacao, tipo, limite, meses: mesesValores, total })
    }

    return linhas.sort((a, b) => {
      if (a.tipo !== b.tipo) return a.tipo === 'receita' ? -1 : 1
      if (a.classificacao !== b.classificacao) return a.classificacao.localeCompare(b.classificacao)
      return a.nome.localeCompare(b.nome)
    })
  }, [movimentacoes, pagamentosFatura, categorias, situacoesIncluidas, ano])

  // ── Totais ──────────────────────────────────────────────────────────────────
  const receitasLinhas = linhasDRE.filter(l => l.tipo === 'receita')
  const despesasLinhas = linhasDRE.filter(l => l.tipo === 'despesa')
  const totalMes = (tipo: 'receita' | 'despesa', m: number) => linhasDRE.filter(l => l.tipo === tipo).reduce((s, l) => s + (l.meses[m] || 0), 0)
  const totalGeral = (tipo: 'receita' | 'despesa') => linhasDRE.filter(l => l.tipo === tipo).reduce((s, l) => s + l.total, 0)
  const resultadoMes = (m: number) => totalMes('receita', m) - totalMes('despesa', m)
  const resultadoTotal = totalGeral('receita') - totalGeral('despesa')
  const meses = Array.from({ length: 12 }, (_, i) => i + 1)

  // ── Meses correntes (para média) ─────────────────────────────────────────────
  const mesesCorrente = useMemo(() => {
    if (ano < hoje.getFullYear()) return 12
    if (ano > hoje.getFullYear()) return 0
    return mesAtual
  }, [ano, mesAtual])

  // ── Cards: dados calculados sempre sobre TODOS os dados (sem filtro situação) ─
  const totalPendentesMesAtual = useMemo(() =>
    movimentacoes.filter(m =>
      m.situacao === 'Pendente' && m.tipo === 'Despesa' &&
      m.data_pagamento && getMes(m.data_pagamento) === mesAtual && getAno(m.data_pagamento) === ano
    ).reduce((s, m) => s + Number(m.valor), 0),
    [movimentacoes, mesAtual, ano]
  )

  const totalPrevistosFuturos = useMemo(() =>
    movimentacoes.filter(m =>
      m.situacao === 'Previsto' && m.tipo === 'Despesa' &&
      m.data_pagamento && (
        getAno(m.data_pagamento) > ano ||
        (getAno(m.data_pagamento) === ano && getMes(m.data_pagamento) > mesAtual)
      )
    ).reduce((s, m) => s + Number(m.valor), 0),
    [movimentacoes, mesAtual, ano]
  )

  const maiorDespesaMes = useMemo(() => {
    const despMes = movimentacoes.filter(m =>
      m.tipo === 'Despesa' && ['Pago', 'Faturado', 'Pendente'].includes(m.situacao) &&
      m.data_pagamento && getMes(m.data_pagamento) === mesAtual && getAno(m.data_pagamento) === ano
    )
    if (!despMes.length) return null
    return despMes.reduce((max, m) => Number(m.valor) > Number(max.valor) ? m : max)
  }, [movimentacoes, mesAtual, ano])

  // ── Projeção 1: Conservadora ────────────────────────────────────────────────
  // Soma o realizado até agora + tudo que já está lançado como Pendente ou Previsto nos meses futuros
  // Não assume nada além do que já foi lançado
  const projecaoConservadora = useMemo(() => {
    if (ano !== hoje.getFullYear()) return null
    const mesesFuturos = Array.from({ length: 12 - mesAtual }, (_, i) => mesAtual + i + 1)

    // Realizado até o mês atual (Pago + Faturado, todos os meses até o atual)
    const realizadoReceita = Array.from({ length: mesesCorrente }, (_, i) => {
      return linhasDRE.filter(l => l.tipo === 'receita').reduce((s, l) => s + (l.meses[i + 1] || 0), 0)
    }).reduce((s, v) => s + v, 0)

    const realizadoDespesa = Array.from({ length: mesesCorrente }, (_, i) => {
      return linhasDRE.filter(l => l.tipo === 'despesa').reduce((s, l) => s + (l.meses[i + 1] || 0), 0)
    }).reduce((s, v) => s + v, 0)

    // Futuros: só Pendente + Previsto já lançados
    const futurosReceita = movimentacoes.filter(m =>
      m.tipo === 'Receita' && ['Pendente', 'Previsto'].includes(m.situacao) &&
      m.data_pagamento && getAno(m.data_pagamento) === ano &&
      mesesFuturos.includes(getMes(m.data_pagamento))
    ).reduce((s, m) => s + Number(m.valor), 0)

    const futurosDespesa = movimentacoes.filter(m =>
      m.tipo === 'Despesa' && ['Pendente', 'Previsto'].includes(m.situacao) &&
      m.data_pagamento && getAno(m.data_pagamento) === ano &&
      mesesFuturos.includes(getMes(m.data_pagamento))
    ).reduce((s, m) => s + Number(m.valor), 0)

    return (realizadoReceita + futurosReceita) - (realizadoDespesa + futurosDespesa)
  }, [linhasDRE, movimentacoes, mesesCorrente, mesAtual, ano])

  // ── Projeção 2: Inteligente ──────────────────────────────────────────────────
  // Para cada categoria nos meses futuros:
  //   - Se já tem Pendente ou Previsto lançado → usa esse valor
  //   - Se não tem nada lançado → usa a média histórica daquela categoria (meses correntes)
  // Para receitas: mesma lógica
  const projecaoInteligente = useMemo(() => {
    if (ano !== hoje.getFullYear()) return null
    const mesesFuturos = Array.from({ length: 12 - mesAtual }, (_, i) => mesAtual + i + 1)

    // Realizado até agora (igual ao conservador)
    const realizadoAteAgora = Array.from({ length: mesesCorrente }, (_, i) => resultadoMes(i + 1)).reduce((s, v) => s + v, 0)

    let projecaoFutura = 0

    for (const mesFut of mesesFuturos) {
      // Para cada linha do DRE (receita ou despesa)
      for (const linha of linhasDRE) {
        // Verifica se há lançamento Pendente ou Previsto nessa categoria nesse mês
        const temFuturoLancado = movimentacoes.some(m => {
          const catKey = m.categoria_id ? String(m.categoria_id) : `sem_cat_${m.tipo}`
          return catKey === linha.id &&
            ['Pendente', 'Previsto'].includes(m.situacao) &&
            m.data_pagamento &&
            getMes(m.data_pagamento) === mesFut &&
            getAno(m.data_pagamento) === ano
        })

        let valorMesFut = 0

        if (temFuturoLancado) {
          // Usa o que já foi lançado
          valorMesFut = movimentacoes
            .filter(m => {
              const catKey = m.categoria_id ? String(m.categoria_id) : `sem_cat_${m.tipo}`
              return catKey === linha.id &&
                ['Pendente', 'Previsto'].includes(m.situacao) &&
                m.data_pagamento &&
                getMes(m.data_pagamento) === mesFut &&
                getAno(m.data_pagamento) === ano
            })
            .reduce((s, m) => s + Number(m.valor), 0)
        } else if (mesesCorrente > 0) {
          // Usa a média histórica dos meses correntes para essa categoria
          const somaHistorica = Array.from({ length: mesesCorrente }, (_, i) => linha.meses[i + 1] || 0).reduce((s, v) => s + v, 0)
          valorMesFut = somaHistorica / mesesCorrente
        }

        // Receita soma, despesa subtrai
        projecaoFutura += linha.tipo === 'receita' ? valorMesFut : -valorMesFut
      }
    }

    return realizadoAteAgora + projecaoFutura
  }, [linhasDRE, movimentacoes, mesesCorrente, mesAtual, ano, resultadoMes])

  // ── Drill-down: lançamentos da célula clicada ─────────────────────────────────
  const lancamentosDrill = useMemo(() => {
    if (!drillAberto) return []
    const linha = linhasDRE.find(l => l.id === drillAberto.linhaId)
    if (!linha) return []

    return movimentacoes.filter(m => {
      // Mesma categoria
      const catKey = m.categoria_id ? String(m.categoria_id) : `sem_cat_${m.tipo}`
      if (catKey !== linha.id) return false
      // Mesmo mês pelo data_pagamento
      if (!m.data_pagamento) return false
      if (getMes(m.data_pagamento) !== drillAberto.mes) return false
      if (getAno(m.data_pagamento) !== ano) return false
      // Filtro de situação ativo
      return situacoesIncluidas.includes(m.situacao)
    }).sort((a, b) => a.data_movimentacao.localeCompare(b.data_movimentacao))
  }, [drillAberto, linhasDRE, movimentacoes, situacoesIncluidas, ano])

  const toggleDrill = (linhaId: string, mes: number, valor: number) => {
    if (valor === 0) return
    setDrillAberto(prev =>
      prev?.linhaId === linhaId && prev?.mes === mes ? null : { linhaId, mes }
    )
  }

  // ── Filtros labels ───────────────────────────────────────────────────────────
  const filtros: { key: FiltroSituacao; label: string; desc: string; cor: string }[] = [
    { key: 'realizado', label: 'Realizado',  desc: 'Pago + Faturado',                       cor: '#065f46' },
    { key: 'pendente',  label: '+ Pendente', desc: 'Realizado + Pendente',                  cor: '#92400e' },
    { key: 'previsto',  label: '+ Previsto', desc: 'Realizado + Previsto',                  cor: '#6b21a8' },
    { key: 'todos',     label: 'Tudo',       desc: 'Pago + Faturado + Pendente + Previsto',  cor: '#1e40af' },
  ]

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: "'Segoe UI', system-ui, sans-serif", padding: '24px', maxWidth: '100%', margin: '0 auto' }}>

      {/* Header */}
      <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#111827', margin: 0 }}>DRE — Demonstrativo de Resultado</h1>
          <p style={{ color: '#6b7280', marginTop: '4px', fontSize: '13px' }}>
            Regime de Caixa · <code style={{ fontSize: '12px', background: '#f3f4f6', padding: '1px 5px', borderRadius: '4px' }}>data_pagamento</code> · clique em qualquer célula para ver os lançamentos
          </p>
        </div>
        <div>
          <label style={labelStyle}>Ano</label>
          <select value={ano} onChange={e => { setAno(Number(e.target.value)); setDrillAberto(null) }} style={selectStyle}>
            {anos.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
      </div>

      {/* ── Cards ─────────────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '20px' }}>

        {/* Pendentes do mês atual */}
        <div style={{ background: '#fef3c7', borderRadius: '12px', padding: '14px 16px', borderLeft: '4px solid #f59e0b' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Pendentes — {MESES_CURTOS[mesAtual - 1]}
          </div>
          <div style={{ fontSize: '22px', fontWeight: 700, color: '#92400e', margin: '6px 0 2px' }}>
            {fmt(totalPendentesMesAtual)}
          </div>
          <div style={{ fontSize: '11px', color: '#92400e', opacity: 0.7 }}>
            Despesas pendentes no mês atual
          </div>
        </div>

        {/* Previstos futuros */}
        <div style={{ background: '#f3e8ff', borderRadius: '12px', padding: '14px 16px', borderLeft: '4px solid #8b5cf6' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#6b21a8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Previstos Futuros
          </div>
          <div style={{ fontSize: '22px', fontWeight: 700, color: '#6b21a8', margin: '6px 0 2px' }}>
            {fmt(totalPrevistosFuturos)}
          </div>
          <div style={{ fontSize: '11px', color: '#6b21a8', opacity: 0.7 }}>
            Despesas previstas após {MESES_CURTOS[mesAtual - 1]}
          </div>
        </div>

        {/* Maior despesa do mês */}
        <div style={{ background: '#fee2e2', borderRadius: '12px', padding: '14px 16px', borderLeft: '4px solid #ef4444' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#991b1b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Maior Despesa — {MESES_CURTOS[mesAtual - 1]}
          </div>
          <div style={{ fontSize: '22px', fontWeight: 700, color: '#991b1b', margin: '6px 0 2px' }}>
            {maiorDespesaMes ? fmt(Number(maiorDespesaMes.valor)) : '—'}
          </div>
          <div style={{ fontSize: '11px', color: '#991b1b', opacity: 0.7, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {maiorDespesaMes ? maiorDespesaMes.descricao : 'Nenhuma despesa'}
          </div>
        </div>

        {/* Projeção 1 — Conservadora */}
        {projecaoConservadora !== null && (
          <div style={{
            background: projecaoConservadora >= 0 ? '#d1fae5' : '#fee2e2',
            borderRadius: '12px', padding: '14px 16px',
            borderLeft: `4px solid ${projecaoConservadora >= 0 ? '#10b981' : '#ef4444'}`
          }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: projecaoConservadora >= 0 ? '#065f46' : '#991b1b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Projeção Conservadora
            </div>
            <div style={{ fontSize: '22px', fontWeight: 700, color: projecaoConservadora >= 0 ? '#065f46' : '#991b1b', margin: '6px 0 2px' }}>
              {fmt(projecaoConservadora)}
            </div>
            <div style={{ fontSize: '11px', color: projecaoConservadora >= 0 ? '#065f46' : '#991b1b', opacity: 0.8 }}>
              Realizado + Pendente + Previsto já lançados
            </div>
            <div style={{ fontSize: '10px', color: projecaoConservadora >= 0 ? '#065f46' : '#991b1b', opacity: 0.6, marginTop: '2px' }}>
              Não assume nada além do que está lançado
            </div>
          </div>
        )}

        {/* Projeção 2 — Inteligente */}
        {projecaoInteligente !== null && (
          <div style={{
            background: projecaoInteligente >= 0 ? '#d1fae5' : '#fee2e2',
            borderRadius: '12px', padding: '14px 16px',
            borderLeft: `4px solid ${projecaoInteligente >= 0 ? '#10b981' : '#ef4444'}`,
            position: 'relative'
          }}>
            <span style={{ position: 'absolute', top: '8px', right: '8px', background: '#2563eb', color: '#fff', fontSize: '9px', fontWeight: 700, padding: '2px 6px', borderRadius: '99px' }}>
              SMART
            </span>
            <div style={{ fontSize: '11px', fontWeight: 700, color: projecaoInteligente >= 0 ? '#065f46' : '#991b1b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Projeção Inteligente
            </div>
            <div style={{ fontSize: '22px', fontWeight: 700, color: projecaoInteligente >= 0 ? '#065f46' : '#991b1b', margin: '6px 0 2px' }}>
              {fmt(projecaoInteligente)}
            </div>
            <div style={{ fontSize: '11px', color: projecaoInteligente >= 0 ? '#065f46' : '#991b1b', opacity: 0.8 }}>
              Pendente/Previsto + média histórica onde não há lançamento
            </div>
            <div style={{ fontSize: '10px', color: projecaoInteligente >= 0 ? '#065f46' : '#991b1b', opacity: 0.6, marginTop: '2px' }}>
              Ex: Mercado sem previstos → usa média dos últimos {mesAtual} meses
            </div>
          </div>
        )}

      </div>

      {/* Filtros situação */}
      <div style={{ marginBottom: '20px' }}>
        <label style={{ ...labelStyle, marginBottom: '8px' }}>O que incluir no DRE</label>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {filtros.map(f => (
            <button key={f.key} onClick={() => { setFiltroSituacao(f.key); setDrillAberto(null) }} style={{
              padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
              border: filtroSituacao === f.key ? 'none' : '1px solid #e5e7eb',
              background: filtroSituacao === f.key ? f.cor : '#fff',
              color: filtroSituacao === f.key ? '#fff' : '#374151',
            }}>
              {f.label}
              <span style={{ display: 'block', fontSize: '10px', fontWeight: 400, opacity: 0.8, marginTop: '1px' }}>{f.desc}</span>
            </button>
          ))}
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
                {/* Linha indicadora passado/futuro */}
                <tr style={{ background: '#1f2937' }}>
                  <td style={{ ...thBase, textAlign: 'left', position: 'sticky', left: 0, background: '#1f2937', zIndex: 11, padding: '4px 12px', fontSize: '10px', color: '#6b7280' }}>
                    ◀ passado · presente · futuro ▶
                  </td>
                  <td style={{ ...thBase, background: '#1f2937', padding: '4px' }} />
                  {meses.map(m => {
                    const isFuturo = ano > hoje.getFullYear() || (ano === hoje.getFullYear() && m > mesAtual)
                    const isAtual = ano === hoje.getFullYear() && m === mesAtual
                    return (
                      <td key={m} style={{ padding: '3px 4px', textAlign: 'center', fontSize: '9px', fontWeight: 600, color: isAtual ? '#fbbf24' : isFuturo ? '#7c3aed' : '#4b5563', letterSpacing: '0.05em' }}>
                        {isAtual ? '● ATUAL' : isFuturo ? '◆' : ''}
                      </td>
                    )
                  })}
                  <td style={{ ...thBase, background: '#1f2937', padding: '4px' }} />
                  <td style={{ ...thBase, background: '#1f2937', padding: '4px' }} />
                </tr>
                {/* Cabeçalho meses */}
                <tr style={{ background: '#111827' }}>
                  <th style={{ ...thBase, textAlign: 'left', minWidth: '170px', position: 'sticky', left: 0, background: '#111827', zIndex: 11 }}>Categoria</th>
                  <th style={{ ...thBase, minWidth: '85px', background: '#1f2937' }}>Limite/mês</th>
                  {meses.map(m => {
                    const isFuturo = ano > hoje.getFullYear() || (ano === hoje.getFullYear() && m > mesAtual)
                    const isAtual = ano === hoje.getFullYear() && m === mesAtual
                    return (
                      <th key={m} style={{ ...thBase, minWidth: '80px', background: isAtual ? '#1e3a5f' : isFuturo ? '#2d1b4e' : '#111827', color: isAtual ? '#fbbf24' : isFuturo ? '#c4b5fd' : '#f9fafb', borderBottom: isAtual ? '2px solid #fbbf24' : isFuturo ? '2px solid #7c3aed' : '2px solid #374151' }}>
                        {MESES_CURTOS[m - 1]}
                      </th>
                    )
                  })}
                  <th style={{ ...thBase, minWidth: '90px', background: '#1f2937' }}>Total</th>
                  <th style={{ ...thBase, minWidth: '80px', background: '#1f2937', color: '#fbbf24' }}>Média/mês</th>
                </tr>
              </thead>

              <tbody>
                {/* ── RECEITAS ── */}
                <GrupoHeader label='RECEITAS' colspan={16} cor='#065f46' bg='#d1fae5' />
                {receitasLinhas.map(linha => (
                  <LinhaComDrill key={linha.id} linha={linha} meses={meses} mesAtual={mesAtual} anoAtual={hoje.getFullYear()} ano={ano} isReceita mesesCorrente={mesesCorrente} drillAberto={drillAberto} lancamentosDrill={lancamentosDrill} onToggle={toggleDrill} />
                ))}
                <SubtotalRow label='Total Receitas' meses={meses} mesAtual={mesAtual} anoSel={ano} anoAtual={hoje.getFullYear()} valorMes={m => totalMes('receita', m)} total={totalGeral('receita')} cor='#065f46' bg='#d1fae5' mesesCorrente={mesesCorrente} />

                {/* ── DESPESAS ── */}
                <GrupoHeader label='DESPESAS' colspan={16} cor='#991b1b' bg='#fee2e2' />
                {despesasLinhas.map(linha => (
                  <LinhaComDrill key={linha.id} linha={linha} meses={meses} mesAtual={mesAtual} anoAtual={hoje.getFullYear()} ano={ano} isReceita={false} mesesCorrente={mesesCorrente} drillAberto={drillAberto} lancamentosDrill={lancamentosDrill} onToggle={toggleDrill} />
                ))}
                <SubtotalRow label='Total Despesas' meses={meses} mesAtual={mesAtual} anoSel={ano} anoAtual={hoje.getFullYear()} valorMes={m => totalMes('despesa', m)} total={totalGeral('despesa')} cor='#991b1b' bg='#fee2e2' mesesCorrente={mesesCorrente} />

                {/* ── RESULTADO ── */}
                <tr style={{ background: '#111827', borderTop: '2px solid #374151' }}>
                  <td style={{ ...tdFixo, fontWeight: 700, color: '#f9fafb', fontSize: '13px', background: '#111827' }}>RESULTADO</td>
                  <td style={{ ...tdNum, background: '#1f2937', color: '#6b7280' }}>—</td>
                  {meses.map(m => {
                    const v = resultadoMes(m)
                    const isFuturo = ano > hoje.getFullYear() || (ano === hoje.getFullYear() && m > mesAtual)
                    const isAtual = ano === hoje.getFullYear() && m === mesAtual
                    return (
                      <td key={m} style={{ ...tdNum, fontWeight: 700, fontSize: '13px', color: v >= 0 ? '#34d399' : '#f87171', background: isAtual ? '#1e3a5f' : isFuturo ? '#1a1035' : 'transparent', opacity: isFuturo && !isAtual ? 0.75 : 1 }}>
                        {v !== 0 ? fmt(v) : <span style={{ color: '#374151' }}>—</span>}
                      </td>
                    )
                  })}
                  <td style={{ ...tdNum, background: '#1f2937', fontWeight: 700, fontSize: '13px', color: resultadoTotal >= 0 ? '#34d399' : '#f87171' }}>{fmt(resultadoTotal)}</td>
                  <td style={{ ...tdNum, background: '#1f2937', fontWeight: 700, fontSize: '12px', color: (() => { const v = mesesCorrente > 0 ? (Array.from({ length: mesesCorrente }, (_, i) => resultadoMes(i + 1)).reduce((s, v) => s + v, 0) / mesesCorrente) : 0; return v >= 0 ? '#34d399' : '#f87171' })() }}>
                    {mesesCorrente > 0 ? fmt(Array.from({ length: mesesCorrente }, (_, i) => resultadoMes(i + 1)).reduce((s, v) => s + v, 0) / mesesCorrente) : '—'}
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
          <span>💡 Clique em qualquer célula com valor para ver os lançamentos detalhados</span>
          <span style={{ color: '#7c3aed' }}>◆ Meses futuros</span>
          <span>* Cartão parcelado: rateio proporcional pelo % pago da fatura</span>
        </div>
      )}
    </div>
  )
}

// ─── LinhaComDrill ─────────────────────────────────────────────────────────────
// Linha da tabela com capacidade de expandir drill-down ao clicar numa célula

function LinhaComDrill({ linha, meses, mesAtual, anoAtual, ano, isReceita, mesesCorrente, drillAberto, lancamentosDrill, onToggle }: {
  linha: LinhaDRE
  meses: number[]
  mesAtual: number
  anoAtual: number
  ano: number
  isReceita: boolean
  mesesCorrente: number
  drillAberto: DrillKey | null
  lancamentosDrill: Movimentacao[]
  onToggle: (linhaId: string, mes: number, valor: number) => void
}) {
  const cor = isReceita ? '#065f46' : '#991b1b'
  const drillEstaAberto = (mes: number) => drillAberto?.linhaId === linha.id && drillAberto?.mes === mes

  return (
    <>
      <tr style={{ borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }}>
        <td style={{ ...tdFixo, color: '#374151' }}>
          <div style={{ fontWeight: 500 }}>{linha.nome}</div>
          {linha.classificacao && <div style={{ fontSize: '10px', color: '#9ca3af' }}>{linha.classificacao}</div>}
        </td>
        <td style={{ ...tdNum, background: '#f9fafb', color: '#9ca3af', fontSize: '11px' }}>
          {linha.limite > 0 ? fmt(linha.limite) : '—'}
        </td>

        {meses.map(m => {
          const v = linha.meses[m] || 0
          const isFuturo = ano > anoAtual || (ano === anoAtual && m > mesAtual)
          const isAtual = ano === anoAtual && m === mesAtual
          const pct = linha.limite > 0 ? v / linha.limite : null
          const aberto = drillEstaAberto(m)

          // Detecta situações presentes nessa célula para badge
          const temPendente = v > 0 && lancamentosDrill.some(l => l.situacao === 'Pendente') && aberto
          const temPrevisto = v > 0 && lancamentosDrill.some(l => l.situacao === 'Previsto') && aberto

          let corValor = '#d1d5db'
          if (v > 0) {
            if (!isReceita && pct !== null) {
              if (pct > 1) corValor = '#ef4444'
              else if (pct >= 0.8) corValor = '#f59e0b'
              else corValor = '#374151'
            } else corValor = cor
          }

          return (
            <td
              key={m}
              onClick={() => onToggle(linha.id, m, v)}
              title={v > 0 ? 'Clique para ver lançamentos' : ''}
              style={{
                ...tdNum,
                color: corValor,
                fontWeight: v > 0 ? 600 : 400,
                background: aberto ? '#fffbeb' : isAtual ? '#eff6ff' : isFuturo ? '#faf5ff' : 'transparent',
                opacity: isFuturo && !isAtual ? 0.85 : 1,
                cursor: v > 0 ? 'pointer' : 'default',
                borderBottom: aberto ? '2px solid #f59e0b' : 'none',
                transition: 'background 0.1s',
              }}
            >
              {v > 0
                ? <span style={{ textDecoration: v > 0 ? 'underline dotted' : 'none', textUnderlineOffset: '3px' }}>{fmt(v)}</span>
                : <span style={{ color: '#e5e7eb' }}>—</span>
              }
            </td>
          )
        })}

        {/* Total */}
        <td style={{ ...tdNum, background: '#f9fafb', fontWeight: 700, color: cor }}>
          <div>{fmt(linha.total)}</div>
          {linha.limite > 0 && (
            <div style={{ fontSize: '10px', color: linha.total > linha.limite * 12 ? '#ef4444' : '#9ca3af', fontWeight: 400 }}>
              {((linha.total / (linha.limite * 12)) * 100).toFixed(0)}% do limite anual
            </div>
          )}
        </td>

        {/* Média */}
        <td style={{ ...tdNum, background: '#fffbeb', fontWeight: 600, color: '#92400e', fontSize: '12px' }}>
          {mesesCorrente > 0 ? (() => {
            const somaAteAtual = Array.from({ length: mesesCorrente }, (_, i) => linha.meses[i + 1] || 0).reduce((s, v) => s + v, 0)
            const med = somaAteAtual / mesesCorrente
            return (
              <>
                <div>{fmt(med)}</div>
                {linha.limite > 0 && (
                  <div style={{ fontSize: '10px', color: med > linha.limite ? '#ef4444' : '#9ca3af', fontWeight: 400 }}>
                    {((med / linha.limite) * 100).toFixed(0)}% do limite
                  </div>
                )}
              </>
            )
          })() : '—'}
        </td>
      </tr>

      {/* ── Drill-down expandido ── */}
      {drillAberto?.linhaId === linha.id && (
        <tr>
          <td colSpan={16} style={{ padding: 0, background: '#fffbeb', borderBottom: '2px solid #f59e0b' }}>
            <div style={{ padding: '12px 16px 16px' }}>

              {/* Header do drill */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#92400e' }}>
                  📋 {linha.nome} — {MESES_CURTOS[drillAberto.mes - 1]}/{ano}
                  <span style={{ fontWeight: 400, color: '#9ca3af', marginLeft: '8px', fontSize: '12px' }}>
                    {lancamentosDrill.length} lançamento{lancamentosDrill.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <button onClick={() => onToggle(linha.id, drillAberto.mes, 1)} style={{ background: 'none', border: 'none', fontSize: '16px', cursor: 'pointer', color: '#9ca3af' }}>×</button>
              </div>

              {lancamentosDrill.length === 0 ? (
                <div style={{ color: '#9ca3af', fontSize: '13px' }}>Nenhum lançamento encontrado com os filtros ativos.</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ background: '#fef3c7', borderBottom: '1px solid #fde68a' }}>
                      {['Dt. Movimentação','Dt. Pagamento','Descrição','Valor','Método','Parcela','Situação'].map(h => (
                        <th key={h} style={{ padding: '6px 10px', textAlign: h === 'Valor' ? 'right' : 'left', fontWeight: 600, color: '#92400e', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {lancamentosDrill.map((l, idx) => (
                      <tr key={l.id} style={{ background: idx % 2 === 0 ? '#fffdf0' : '#fffbeb', borderBottom: '1px solid #fef3c7' }}>
                        <td style={tdDrill}>{fmtDate(l.data_movimentacao)}</td>
                        <td style={tdDrill}>{fmtDate(l.data_pagamento)}</td>
                        <td style={{ ...tdDrill, fontWeight: 500, maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.descricao}</td>
                        <td style={{ ...tdDrill, textAlign: 'right', fontWeight: 700, color: '#991b1b' }}>{fmt(Number(l.valor))}</td>
                        <td style={tdDrill}>{l.metodo_pagamento || '—'}</td>
                        <td style={tdDrill}>{l.numero_parcela || '—'}</td>
                        <td style={tdDrill}>
                          <span style={{ ...corSituacao(l.situacao), padding: '2px 8px', borderRadius: '99px', fontSize: '11px', fontWeight: 600 }}>
                            {l.situacao}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: '#fef3c7', borderTop: '1px solid #fde68a' }}>
                      <td colSpan={3} style={{ padding: '6px 10px', fontWeight: 700, color: '#92400e', fontSize: '12px' }}>Total</td>
                      <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700, color: '#991b1b' }}>
                        {fmt(lancamentosDrill.reduce((s, l) => s + Number(l.valor), 0))}
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
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function GrupoHeader({ label, colspan, cor, bg }: { label: string; colspan: number; cor: string; bg: string }) {
  return (
    <tr>
      <td colSpan={colspan} style={{ padding: '6px 12px', background: bg, fontSize: '11px', fontWeight: 700, color: cor, textTransform: 'uppercase', letterSpacing: '0.06em', borderTop: '2px solid #e5e7eb', borderBottom: '1px solid #e5e7eb' }}>
        {label}
      </td>
    </tr>
  )
}

function SubtotalRow({ label, meses, mesAtual, anoSel, anoAtual, valorMes, total, cor, bg, mesesCorrente }: {
  label: string; meses: number[]; mesAtual: number; anoSel: number; anoAtual: number
  valorMes: (m: number) => number; total: number; cor: string; bg: string; mesesCorrente: number
}) {
  return (
    <tr style={{ background: bg, borderTop: '1px solid #e5e7eb', borderBottom: '2px solid #e5e7eb' }}>
      <td style={{ ...tdFixo, fontWeight: 700, color: cor, background: bg }}>{label}</td>
      <td style={{ ...tdNum, color: '#9ca3af', background: bg }}>—</td>
      {meses.map(m => {
        const v = valorMes(m)
        const isFuturo = anoSel > anoAtual || (anoSel === anoAtual && m > mesAtual)
        const isAtual = anoSel === anoAtual && m === mesAtual
        return <td key={m} style={{ ...tdNum, fontWeight: 700, color: cor, opacity: isFuturo && !isAtual ? 0.7 : 1 }}>{fmt(v)}</td>
      })}
      <td style={{ ...tdNum, fontWeight: 700, color: cor, background: bg }}>{fmt(total)}</td>
      <td style={{ ...tdNum, fontWeight: 700, color: cor, background: '#fffbeb', fontSize: '12px' }}>
        {mesesCorrente > 0 ? fmt(Array.from({ length: mesesCorrente }, (_, i) => valorMes(i + 1)).reduce((s, v) => s + v, 0) / mesesCorrente) : '—'}
      </td>
    </tr>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = { display: 'block', fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }
const selectStyle: React.CSSProperties = { border: '1px solid #d1d5db', borderRadius: '8px', padding: '7px 10px', fontSize: '13px', background: '#fff', color: '#111827', cursor: 'pointer', height: '38px' }
const thBase: React.CSSProperties = { padding: '10px 10px', textAlign: 'right', fontWeight: 600, color: '#f9fafb', fontSize: '12px', borderBottom: '2px solid #374151', whiteSpace: 'nowrap' }
const tdFixo: React.CSSProperties = { padding: '8px 12px', verticalAlign: 'middle', position: 'sticky', left: 0, background: '#fff', borderRight: '1px solid #f3f4f6', whiteSpace: 'nowrap', zIndex: 1 }
const tdNum: React.CSSProperties = { padding: '8px 10px', textAlign: 'right', verticalAlign: 'middle', whiteSpace: 'nowrap' }
const tdDrill: React.CSSProperties = { padding: '6px 10px', color: '#374151', verticalAlign: 'middle' }
