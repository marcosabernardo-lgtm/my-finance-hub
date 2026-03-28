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
  grupo_id: string | null
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

type FiltroSituacao = 'realizado' | 'pendente' | 'so_pendente' | 'previsto' | 'todos' | 'conservadora' | 'inteligente'

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
  const [editandoDrill, setEditandoDrill] = useState<Movimentacao | null>(null)
  const [editDrillForm, setEditDrillForm] = useState<Partial<Movimentacao>>({})
  const [salvandoDrill, setSalvandoDrill] = useState(false)
  const [modalParcelasDrill, setModalParcelasDrill] = useState(false)

  useEffect(() => {
    if (editandoDrill) setEditDrillForm({ ...editandoDrill })
  }, [editandoDrill])

  const salvarEditDrill = async (escopo: 'esta' | 'proximas') => {
    if (!editandoDrill) return
    setSalvandoDrill(true)
    setModalParcelasDrill(false)
    const payload = {
      descricao: editDrillForm.descricao,
      valor: Number(editDrillForm.valor),
      situacao: editDrillForm.situacao,
      categoria_id: editDrillForm.categoria_id,
    }
    if (escopo === 'proximas' && editandoDrill.grupo_id) {
      const { error: errP, count } = await supabase.from('movimentacoes').update(payload)
        .eq('grupo_id', editandoDrill.grupo_id)
        .gte('data_movimentacao', editandoDrill.data_movimentacao)
        .select('id', { count: 'exact' })
      console.log('[DRE] proximas - grupo_id:', editandoDrill.grupo_id, 'data:', editandoDrill.data_movimentacao, 'count:', count, 'error:', errP)
    } else {
      await supabase.from('movimentacoes').update({
        ...payload,
        data_movimentacao: editDrillForm.data_movimentacao,
        data_pagamento: editDrillForm.data_pagamento,
      }).eq('id', editandoDrill.id)
    }
    setEditandoDrill(null)
    fetchDados()
    setSalvandoDrill(false)
  }

  const handleSalvarDrill = () => {
    if (editandoDrill?.grupo_id) {
      setModalParcelasDrill(true)
    } else {
      salvarEditDrill('esta')
    }
  }

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
      .select('id,tipo,situacao,categoria_id,descricao,valor,metodo_pagamento,cartao_id,forma_pagamento,numero_parcela,data_movimentacao,data_pagamento,grupo_id')
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
      case 'realizado':    return ['Pago', 'Faturado']
      case 'pendente':     return ['Pago', 'Faturado', 'Pendente']
      case 'so_pendente':  return ['Pendente']
      case 'previsto':     return ['Pago', 'Faturado', 'Previsto']
      case 'todos':        return ['Pago', 'Faturado', 'Pendente', 'Previsto']
      case 'conservadora': return ['Pago', 'Faturado', 'Pendente', 'Previsto']
      case 'inteligente':  return ['Pago', 'Faturado', 'Pendente', 'Previsto']
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

  // ── Médias por linha para modo Inteligente ───────────────────────────────────
  // Para cada linha, calcula a média dos meses passados (para preencher meses futuros sem lançamento)
  const mediasPorLinha = useMemo(() => {
    if (filtroSituacao !== 'inteligente' || mesesCorrente === 0) return {}
    const result: Record<string, number> = {}
    for (const linha of linhasDRE) {
      if (linha.tipo === 'receita') continue  // projecao inteligente apenas para despesas
      const soma = Array.from({ length: mesesCorrente }, (_, i) => linha.meses[i + 1] || 0).reduce((s, v) => s + v, 0)
      const media = soma / mesesCorrente
      // Se tem limite e a media supera o limite, usa o limite como teto
      console.log(`[DRE] ${linha.nome} | limite: ${linha.limite} | media: ${media.toFixed(2)} | resultado: ${(linha.limite > 0 && media > linha.limite) ? linha.limite : media}`)
      result[linha.id] = (linha.limite > 0 && media > linha.limite) ? linha.limite : media
    }
    return result
  }, [linhasDRE, filtroSituacao, mesesCorrente])

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
    // Agrupar por categoria e somar totais
    const totaisPorCategoria: Record<string, { categoria_id: number | null; total: number }> = {}
    for (const m of despMes) {
      const key = String(m.categoria_id ?? 'sem_cat')
      if (!totaisPorCategoria[key]) totaisPorCategoria[key] = { categoria_id: m.categoria_id, total: 0 }
      totaisPorCategoria[key].total += Number(m.valor)
    }
    // Encontrar categoria com maior total
    const maior = Object.values(totaisPorCategoria).reduce((max, c) => c.total > max.total ? c : max)
    return { categoria_id: maior.categoria_id, valor: maior.total, descricao: '' }
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
        } else if (mesesCorrente > 0 && linha.tipo === 'despesa') {
          // Usa a média histórica apenas para despesas — receitas sem lançamento ficam zeradas
          const somaHistorica = Array.from({ length: mesesCorrente }, (_, i) => linha.meses[i + 1] || 0).reduce((s, v) => s + v, 0)
          const mediaHist = somaHistorica / mesesCorrente
          // Se tem limite e a media supera o limite, usa o limite como teto
          valorMesFut = (linha.limite > 0 && mediaHist > linha.limite) ? linha.limite : mediaHist
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
        <div
          onClick={() => { setFiltroSituacao(filtroSituacao === 'so_pendente' ? 'todos' : 'so_pendente'); setDrillAberto(null) }}
          style={{ background: '#fef3c7', borderRadius: '12px', padding: '14px 16px', borderLeft: `4px solid ${filtroSituacao === 'so_pendente' ? '#ef4444' : '#f59e0b'}`, cursor: 'pointer', outline: filtroSituacao === 'so_pendente' ? '2px solid #f59e0b' : 'none' }}
          title="Clique para filtrar apenas pendentes na tabela"
        >
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Pendentes — {MESES_CURTOS[mesAtual - 1]}
          </div>
          <div style={{ fontSize: '22px', fontWeight: 700, color: '#92400e', margin: '6px 0 2px' }}>
            {fmt(totalPendentesMesAtual)}
          </div>
          <div style={{ fontSize: '11px', color: '#92400e', opacity: 0.7 }}>
            {filtroSituacao === 'so_pendente' ? '✓ Filtrando pendentes — clique para limpar' : 'Clique para filtrar na tabela ↓'}
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
            {maiorDespesaMes
              ? (categorias.find(c => c.id === maiorDespesaMes.categoria_id)?.nome ?? maiorDespesaMes.descricao)
              : 'Nenhuma despesa'}
          </div>
        </div>

        {/* Projeção 1 — Conservadora */}
        {projecaoConservadora !== null && (
          <div
            onClick={() => { setFiltroSituacao('conservadora'); setDrillAberto(null) }}
            style={{
              background: projecaoConservadora >= 0 ? '#d1fae5' : '#fee2e2',
              borderRadius: '12px', padding: '14px 16px',
              borderLeft: `4px solid ${projecaoConservadora >= 0 ? '#10b981' : '#ef4444'}`,
              cursor: 'pointer',
              outline: filtroSituacao === 'conservadora' ? '2px solid #10b981' : 'none',
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
              Clique para ver na tabela ↓
            </div>
          </div>
        )}

        {/* Projeção 2 — Inteligente */}
        {projecaoInteligente !== null && (
          <div
            onClick={() => { setFiltroSituacao('inteligente'); setDrillAberto(null) }}
            style={{
              background: projecaoInteligente >= 0 ? '#d1fae5' : '#fee2e2',
              borderRadius: '12px', padding: '14px 16px',
              borderLeft: `4px solid ${projecaoInteligente >= 0 ? '#10b981' : '#ef4444'}`,
              position: 'relative', cursor: 'pointer',
              outline: filtroSituacao === 'inteligente' ? '2px solid #2563eb' : 'none',
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
              Clique para ver na tabela ↓
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

      {/* ── Legenda de cores ─────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'center',
        background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px',
        padding: '10px 16px', marginBottom: '12px', fontSize: '12px'
      }}>
        <span style={{ color: '#6b7280', fontWeight: 600, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Legenda:</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#374151', display: 'inline-block' }} />
          <span style={{ color: '#374151' }}>Dentro do limite</span>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#f59e0b', display: 'inline-block' }} />
          <span style={{ color: '#92400e' }}>Acima de 80% do limite</span>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ef4444', display: 'inline-block' }} />
          <span style={{ color: '#991b1b' }}>Acima do limite</span>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: 12, height: 12, borderRadius: '2px', background: '#eff6ff', border: '1px solid #bfdbfe', display: 'inline-block' }} />
          <span style={{ color: '#1e40af' }}>Mês atual</span>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: 12, height: 12, borderRadius: '2px', background: '#faf5ff', border: '1px solid #e9d5ff', display: 'inline-block' }} />
          <span style={{ color: '#6b21a8' }}>Meses futuros</span>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: 12, height: 12, borderRadius: '2px', background: '#fffbeb', border: '1px solid #fde68a', display: 'inline-block' }} />
          <span style={{ color: '#92400e' }}>Célula expandida / Média</span>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ padding: '1px 6px', borderRadius: '4px', background: '#faf5ff', color: '#9333ea', fontSize: '10px', fontWeight: 600, fontStyle: 'italic' }}>valor itálico</span>
          <span style={{ color: '#6b7280' }}>Média projetada (modo Inteligente)</span>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ padding: '1px 6px', borderRadius: '4px', background: '#fef3c7', color: '#92400e', fontSize: '10px', fontWeight: 600 }}>valor sublinhado</span>
          <span style={{ color: '#6b7280' }}>Clique para ver lançamentos</span>
        </span>
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
                  <LinhaComDrill key={linha.id} linha={linha} meses={meses} mesAtual={mesAtual} anoAtual={hoje.getFullYear()} ano={ano} isReceita mesesCorrente={mesesCorrente} drillAberto={drillAberto} lancamentosDrill={lancamentosDrill} onToggle={toggleDrill} mediaProjecao={filtroSituacao === 'inteligente' ? (mediasPorLinha[linha.id] || 0) : 0} onEditLancamento={setEditandoDrill} />
                ))}
                <SubtotalRow label='Total Receitas' meses={meses} mesAtual={mesAtual} anoSel={ano} anoAtual={hoje.getFullYear()} valorMes={m => totalMes('receita', m)} total={totalGeral('receita')} cor='#065f46' bg='#d1fae5' mesesCorrente={mesesCorrente} />

                {/* ── DESPESAS ── */}
                <GrupoHeader label='DESPESAS' colspan={16} cor='#991b1b' bg='#fee2e2' />
                {despesasLinhas.map(linha => (
                  <LinhaComDrill key={linha.id} linha={linha} meses={meses} mesAtual={mesAtual} anoAtual={hoje.getFullYear()} ano={ano} isReceita={false} mesesCorrente={mesesCorrente} drillAberto={drillAberto} lancamentosDrill={lancamentosDrill} onToggle={toggleDrill} mediaProjecao={filtroSituacao === 'inteligente' ? (mediasPorLinha[linha.id] || 0) : 0} onEditLancamento={setEditandoDrill} />
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

      {/* Modal Edição Drill-down */}
      {editandoDrill && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 24, width: 400, maxWidth: '90vw', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#111827' }}>Editar Lançamento</h3>
              <button onClick={() => setEditandoDrill(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#9ca3af' }}>×</button>
            </div>
            {([
              { label: 'Descrição', field: 'descricao', type: 'text' },
              { label: 'Valor (R$)', field: 'valor', type: 'number' },
              { label: 'Dt. Movimentação', field: 'data_movimentacao', type: 'date' },
              { label: 'Dt. Pagamento', field: 'data_pagamento', type: 'date' },
            ] as { label: string; field: keyof Movimentacao; type: string }[]).map(({ label, field, type }) => (
              <div key={field} style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</label>
                <input
                  type={type}
                  value={String(editDrillForm[field] ?? '')}
                  onChange={e => setEditDrillForm(f => ({ ...f, [field]: e.target.value }))}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13, boxSizing: 'border-box' as const }}
                />
              </div>
            ))}
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Situação</label>
              <select
                value={editDrillForm.situacao ?? ''}
                onChange={e => setEditDrillForm(f => ({ ...f, situacao: e.target.value }))}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }}
              >
                {['Pago', 'Pendente', 'Previsto', 'Faturado'].map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Categoria</label>
              <select
                value={editDrillForm.categoria_id ?? ''}
                onChange={e => setEditDrillForm(f => ({ ...f, categoria_id: Number(e.target.value) || null }))}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }}
              >
                <option value="">— Selecione —</option>
                {categorias
                  .filter(c => editDrillForm.tipo === 'Receita'
                    ? ['Renda Ativa', 'Renda Passiva'].includes(c.classificacao)
                    : !['Renda Ativa', 'Renda Passiva'].includes(c.classificacao))
                  .map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button onClick={() => setEditandoDrill(null)} style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#f9fafb', cursor: 'pointer', fontSize: 13 }}>Cancelar</button>
              <button onClick={handleSalvarDrill} disabled={salvandoDrill} style={{ padding: '8px 16px', borderRadius: 6, border: 'none', background: '#2563eb', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
                {salvandoDrill ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Parcelas Drill */}
      {modalParcelasDrill && editandoDrill && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 24, width: 360, maxWidth: '90vw', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 700, color: '#111827' }}>Lançamento Parcelado</h3>
            <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 20 }}>Este lançamento faz parte de um grupo. O que deseja fazer?</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button onClick={() => salvarEditDrill('esta')} style={{ padding: '10px 16px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#2563eb', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13, textAlign: 'left' }}>
                ✏️ Editar somente esta parcela
              </button>
              <button onClick={() => salvarEditDrill('proximas')} style={{ padding: '10px 16px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#f9fafb', color: '#374151', cursor: 'pointer', fontSize: 13, textAlign: 'left' }}>
                ⏩ Editar esta e todas as próximas
              </button>
              <button onClick={() => setModalParcelasDrill(false)} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', padding: '8px', textAlign: 'center', fontSize: 13 }}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── LinhaComDrill ─────────────────────────────────────────────────────────────
// Linha da tabela com capacidade de expandir drill-down ao clicar numa célula

function LinhaComDrill({ linha, meses, mesAtual, anoAtual, ano, isReceita, mesesCorrente, drillAberto, lancamentosDrill, onToggle, mediaProjecao = 0, onEditLancamento }: {
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
  mediaProjecao?: number
  onEditLancamento: (m: Movimentacao) => void
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
          // No modo inteligente, usa média para meses futuros sem lançamento
          const vExibir = (isFuturo && !isAtual && v === 0 && mediaProjecao > 0) ? mediaProjecao : v
          const isMedia = isFuturo && !isAtual && v === 0 && mediaProjecao > 0
          const pct = linha.limite > 0 ? vExibir / linha.limite : null
          const aberto = drillEstaAberto(m)

          let corValor = '#d1d5db'
          if (vExibir > 0) {
            if (isMedia) {
              corValor = '#9333ea' // roxo para médias projetadas
            } else if (!isReceita && pct !== null) {
              if (pct > 1) corValor = '#ef4444'
              else if (pct >= 0.8) corValor = '#f59e0b'
              else corValor = '#374151'
            } else corValor = cor
          }

          return (
            <td
              key={m}
              onClick={() => !isMedia && onToggle(linha.id, m, v)}
              title={isMedia ? `Média projetada: ${fmt(mediaProjecao)}` : v > 0 ? 'Clique para ver lançamentos' : ''}
              style={{
                ...tdNum,
                color: corValor,
                fontWeight: vExibir > 0 ? 600 : 400,
                background: aberto ? '#fffbeb' : isAtual ? '#eff6ff' : isFuturo ? '#faf5ff' : 'transparent',
                opacity: isFuturo && !isAtual ? 0.85 : 1,
                cursor: isMedia ? 'default' : v > 0 ? 'pointer' : 'default',
                borderBottom: aberto ? '2px solid #f59e0b' : 'none',
                transition: 'background 0.1s',
              }}
            >
              {vExibir > 0
                ? <span style={{
                    textDecoration: !isMedia ? 'underline dotted' : 'none',
                    textUnderlineOffset: '3px',
                    fontStyle: isMedia ? 'italic' : 'normal',
                  }}>{fmt(vExibir)}</span>
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
                      {['Dt. Movimentação','Dt. Pagamento','Descrição','Valor','Método','Parcela','Situação',''].map(h => (
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
                        <td style={{ ...tdDrill }}>
                          <button
                            onClick={e => { e.stopPropagation(); onEditLancamento(l) }}
                            style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontSize: 11, color: '#1d4ed8', fontWeight: 600 }}
                          >✏️ Editar</button>
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