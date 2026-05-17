import { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { BarChart, PieChart, Pie, Cell, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts'

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

interface Cartao {
  id: number
  nome: string
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

const corSituacao = (s: string): React.CSSProperties => {
  switch (s) {
    case 'Pago':     return { background: 'var(--badge-pago-bg)',     color: 'var(--badge-pago-fg)' }
    case 'Pendente': return { background: 'var(--badge-pendente-bg)', color: 'var(--badge-pendente-fg)' }
    case 'Faturado': return { background: 'var(--badge-faturado-bg)', color: 'var(--badge-faturado-fg)' }
    case 'Previsto': return { background: 'var(--badge-previsto-bg)', color: 'var(--badge-previsto-fg)' }
    default:         return { background: 'var(--bg-row2)',           color: 'var(--text-4)' }
  }
}

type Aba = 'caixa' | 'mensal' | 'graficos'
type FiltroSituacaoCaixa = 'realizado' | 'pendente'
type FiltroSituacaoMensal = 'realizado' | 'pendente' | 'previsto' | 'todos' | 'conservadora' | 'inteligente'

function buildLinha(key: string, mesesValores: Record<number, number>, catMap: Record<string, Categoria>): LinhaDRE | null {
  const total = Object.values(mesesValores).reduce((s, v) => s + v, 0)
  if (total === 0) return null
  const cat = catMap[key]
  const isSemCat = key.startsWith('sem_cat')
  if (!cat && !isSemCat) return null
  return {
    id: key,
    catId: cat?.id ?? null,
    nome: cat?.nome ?? (key.includes('Receita') ? 'Receita sem categoria' : 'Despesa sem categoria'),
    classificacao: cat?.classificacao ?? '',
    tipo: cat
      ? (['Renda Ativa', 'Renda Passiva'].includes(cat.classificacao) ? 'receita' : 'despesa')
      : (key.includes('Receita') ? 'receita' : 'despesa'),
    limite: Number(cat?.limite_gastos) || 0,
    meses: mesesValores,
    total,
  }
}

function sortLinhas(linhas: LinhaDRE[]): LinhaDRE[] {
  return linhas.sort((a, b) => {
    if (a.tipo !== b.tipo) return a.tipo === 'receita' ? -1 : 1
    if (a.classificacao !== b.classificacao) return a.classificacao.localeCompare(b.classificacao)
    return a.nome.localeCompare(b.nome)
  })
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function DRE() {
  const { user } = useAuth()
  const [householdId, setHouseholdId] = useState<string | null>(null)

  const hoje = new Date()
  const mesAtual = hoje.getMonth() + 1
  const [ano, setAno] = useState(hoje.getFullYear())
  const [aba, setAba] = useState<Aba>('caixa')
  const [filtroCaixa, setFiltroCaixa] = useState<FiltroSituacaoCaixa>('realizado')
  const [filtroMensal, setFiltroMensal]           = useState<FiltroSituacaoMensal>('todos')
  const [mesFiltroGrafico, setMesFiltroGrafico]   = useState(0)

  const [movimentacoes, setMovimentacoes] = useState<Movimentacao[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [cartoes, setCartoes] = useState<Cartao[]>([])
  const [loading, setLoading] = useState(false)

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
      await supabase.from('movimentacoes').update(payload)
        .eq('grupo_id', editandoDrill.grupo_id)
        .gte('data_movimentacao', editandoDrill.data_movimentacao)
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
    if (editandoDrill?.grupo_id) setModalParcelasDrill(true)
    else salvarEditDrill('esta')
  }

  const anos = Array.from({ length: 5 }, (_, i) => hoje.getFullYear() - 2 + i)

  useEffect(() => {
    if (!user) return
    supabase.from('households').select('id').eq('owner_id', user.id).single()
      .then(({ data }) => { if (data) setHouseholdId(data.id) })
  }, [user])

  useEffect(() => {
    if (!householdId) return
    supabase.from('categorias').select('id,nome,classificacao,limite_gastos')
      .eq('household_id', householdId).order('nome')
      .then(({ data }) => setCategorias(data || []))
    supabase.from('cartoes').select('id,nome')
      .eq('household_id', householdId)
      .then(({ data }) => setCartoes(data || []))
  }, [householdId])

  const fetchDados = useCallback(async () => {
    if (!householdId) return
    setLoading(true)
    const dataInicio = `${ano}-01-01`
    const dataFim    = `${ano}-12-31`
    const sel = 'id,tipo,situacao,categoria_id,descricao,valor,metodo_pagamento,cartao_id,forma_pagamento,numero_parcela,data_movimentacao,data_pagamento,grupo_id'

    // 1. Receitas e Despesas não-crédito com data_movimentacao no ano
    const { data: a } = await supabase.from('movimentacoes').select(sel)
      .eq('household_id', householdId)
      .in('tipo', ['Despesa', 'Receita'])
      .gte('data_movimentacao', dataInicio)
      .lte('data_movimentacao', dataFim)

    // 2. Despesas crédito com data_pagamento no ano (compras de meses anteriores)
    const { data: b } = await supabase.from('movimentacoes').select(sel)
      .eq('household_id', householdId)
      .eq('tipo', 'Despesa')
      .in('situacao', ['Faturado', 'Pendente', 'Previsto'])
      .ilike('metodo_pagamento', 'Crédito%')
      .gte('data_pagamento', dataInicio)
      .lte('data_pagamento', dataFim)

    // 3. Transferências (pagamentos de fatura) com data_pagamento no ano
    const { data: c } = await supabase.from('movimentacoes').select(sel)
      .eq('household_id', householdId)
      .eq('tipo', 'Transferência')
      .not('cartao_id', 'is', null)
      .gte('data_pagamento', dataInicio)
      .lte('data_pagamento', dataFim)

    const seen = new Set<number>()
    const merged: Movimentacao[] = []
    for (const m of [...(a || []), ...(b || []), ...(c || [])]) {
      if (!seen.has(m.id)) { seen.add(m.id); merged.push(m) }
    }
    setMovimentacoes(merged)
    setLoading(false)
  }, [householdId, ano])

  useEffect(() => { fetchDados() }, [fetchDados])

  // ── Meses exibidos ────────────────────────────────────────────────────────────

  const mesesCaixa = useMemo(() => {
    const fim = ano < hoje.getFullYear() ? 12 : ano > hoje.getFullYear() ? 0 : mesAtual
    return Array.from({ length: fim }, (_, i) => i + 1)
  }, [ano, mesAtual])

  const meses12 = useMemo(() => Array.from({ length: 12 }, (_, i) => i + 1), [])

  const mesesCorrente = useMemo(() => {
    if (ano < hoje.getFullYear()) return 12
    if (ano > hoje.getFullYear()) return 0
    return mesAtual
  }, [ano, mesAtual])

  // ── DRE Caixa ─────────────────────────────────────────────────────────────────

  const linhasDRECaixa = useMemo(() => {
    const acc: Record<string, Record<number, number>> = {}
    const add = (key: string, mes: number, valor: number) => {
      if (!acc[key]) acc[key] = {}
      acc[key][mes] = (acc[key][mes] || 0) + valor
    }
    const situOk = filtroCaixa === 'pendente' ? ['Pago', 'Pendente'] : ['Pago']

    for (const m of movimentacoes) {
      // Pagamentos de fatura (Transferência Pago com cartao_id) — sempre incluídos
      if (m.tipo === 'Transferência' && m.cartao_id && m.situacao === 'Pago') {
        if (!m.data_pagamento || getAno(m.data_pagamento) !== ano) continue
        add(`fatura_${m.cartao_id}`, getMes(m.data_pagamento), Number(m.valor))
        continue
      }

      if (!situOk.includes(m.situacao)) continue

      if (m.tipo === 'Receita') {
        if (m.metodo_pagamento === 'Transferência entre Contas') continue
        if (!m.data_pagamento || getAno(m.data_pagamento) !== ano) continue
        add(m.categoria_id ? String(m.categoria_id) : 'sem_cat_Receita', getMes(m.data_pagamento), Number(m.valor))
        continue
      }

      if (m.tipo === 'Despesa') {
        // Crédito não entra individualmente — entra como pagamento de fatura
        if (m.metodo_pagamento?.startsWith('Crédito')) continue
        if (!m.data_pagamento || getAno(m.data_pagamento) !== ano) continue
        add(m.categoria_id ? String(m.categoria_id) : 'sem_cat_Despesa', getMes(m.data_pagamento), Number(m.valor))
      }
    }

    const catMap = Object.fromEntries(categorias.map(c => [String(c.id), c]))
    const cartaoMap = Object.fromEntries(cartoes.map(c => [String(c.id), c]))
    const linhas: LinhaDRE[] = []

    for (const [key, mesesValores] of Object.entries(acc)) {
      const total = Object.values(mesesValores).reduce((s, v) => s + v, 0)
      if (total === 0) continue

      if (key.startsWith('fatura_')) {
        const cId = key.replace('fatura_', '')
        linhas.push({
          id: key, catId: null,
          nome: `Pag. Fatura ${cartaoMap[cId]?.nome ?? `Cartão ${cId}`}`,
          classificacao: 'Pagamento de Fatura',
          tipo: 'despesa', limite: 0,
          meses: mesesValores, total,
        })
        continue
      }

      const linha = buildLinha(key, mesesValores, catMap)
      if (linha) linhas.push(linha)
    }

    return sortLinhas(linhas)
  }, [movimentacoes, categorias, cartoes, filtroCaixa, ano])

  // ── Controle Mensal ───────────────────────────────────────────────────────────

  const situacoesIncluidasMensal = useMemo((): string[] => {
    switch (filtroMensal) {
      case 'realizado':    return ['Pago', 'Faturado']
      case 'pendente':     return ['Pago', 'Faturado', 'Pendente']
      case 'previsto':     return ['Pago', 'Faturado', 'Previsto']
      case 'todos':        return ['Pago', 'Faturado', 'Pendente', 'Previsto']
      case 'conservadora': return ['Pago', 'Faturado', 'Pendente', 'Previsto']
      case 'inteligente':  return ['Pago', 'Faturado', 'Pendente', 'Previsto']
    }
  }, [filtroMensal])

  const linhasControleMensal = useMemo(() => {
    const acc: Record<string, Record<number, number>> = {}
    const add = (key: string, mes: number, valor: number) => {
      if (!acc[key]) acc[key] = {}
      acc[key][mes] = (acc[key][mes] || 0) + valor
    }

    for (const m of movimentacoes) {
      if (m.tipo === 'Transferência') continue
      if (!situacoesIncluidasMensal.includes(m.situacao)) continue

      if (m.tipo === 'Receita') {
        if (m.metodo_pagamento === 'Transferência entre Contas') continue
        if (!m.data_pagamento || getAno(m.data_pagamento) !== ano) continue
        add(m.categoria_id ? String(m.categoria_id) : 'sem_cat_Receita', getMes(m.data_pagamento), Number(m.valor))
        continue
      }

      if (m.tipo === 'Despesa') {
        const isCredito = m.metodo_pagamento?.startsWith('Crédito') ?? false
        if (isCredito) {
          // crédito: usa data_pagamento (vencimento de cada parcela)
          if (!m.data_pagamento || getAno(m.data_pagamento) !== ano) continue
          add(m.categoria_id ? String(m.categoria_id) : 'sem_cat_Despesa', getMes(m.data_pagamento), Number(m.valor))
        } else {
          // débito/pix/dinheiro: usa data_movimentacao
          if (!m.data_movimentacao || getAno(m.data_movimentacao) !== ano) continue
          add(m.categoria_id ? String(m.categoria_id) : 'sem_cat_Despesa', getMes(m.data_movimentacao), Number(m.valor))
        }
      }
    }

    const catMap = Object.fromEntries(categorias.map(c => [String(c.id), c]))
    const linhas: LinhaDRE[] = []
    for (const [key, mesesValores] of Object.entries(acc)) {
      const linha = buildLinha(key, mesesValores, catMap)
      if (linha) linhas.push(linha)
    }
    return sortLinhas(linhas)
  }, [movimentacoes, categorias, situacoesIncluidasMensal, ano])

  // ── Totalizadores ─────────────────────────────────────────────────────────────

  const totalMesCaixa   = (tipo: 'receita' | 'despesa', m: number) => linhasDRECaixa.filter(l => l.tipo === tipo).reduce((s, l) => s + (l.meses[m] || 0), 0)
  const totalGeralCaixa = (tipo: 'receita' | 'despesa') => linhasDRECaixa.filter(l => l.tipo === tipo).reduce((s, l) => s + l.total, 0)
  const resultadoMesCaixa   = (m: number) => totalMesCaixa('receita', m) - totalMesCaixa('despesa', m)
  const resultadoTotalCaixa = totalGeralCaixa('receita') - totalGeralCaixa('despesa')

  const totalMesMensal   = (tipo: 'receita' | 'despesa', m: number) => linhasControleMensal.filter(l => l.tipo === tipo).reduce((s, l) => s + (l.meses[m] || 0), 0)
  const totalGeralMensal = (tipo: 'receita' | 'despesa') => linhasControleMensal.filter(l => l.tipo === tipo).reduce((s, l) => s + l.total, 0)
  const resultadoMesMensal   = (m: number) => totalMesMensal('receita', m) - totalMesMensal('despesa', m)
  const resultadoTotalMensal = totalGeralMensal('receita') - totalGeralMensal('despesa')

  // ── Projeção (Controle Mensal) ────────────────────────────────────────────────

  const mediasPorLinhaMensal = useMemo(() => {
    if (filtroMensal !== 'inteligente' || mesesCorrente === 0) return {}
    const result: Record<string, number> = {}
    for (const linha of linhasControleMensal) {
      if (linha.tipo === 'receita') continue
      const soma = Array.from({ length: mesesCorrente }, (_, i) => linha.meses[i + 1] || 0).reduce((s, v) => s + v, 0)
      const media = soma / mesesCorrente
      result[linha.id] = (linha.limite > 0 && media > linha.limite) ? linha.limite : media
    }
    return result
  }, [linhasControleMensal, filtroMensal, mesesCorrente])

  const projecaoConservadora = useMemo(() => {
    if (ano !== hoje.getFullYear()) return null
    const futuros = Array.from({ length: 12 - mesAtual }, (_, i) => mesAtual + i + 1)
    const realRec  = Array.from({ length: mesesCorrente }, (_, i) => totalMesMensal('receita',  i + 1)).reduce((s, v) => s + v, 0)
    const realDesp = Array.from({ length: mesesCorrente }, (_, i) => totalMesMensal('despesa', i + 1)).reduce((s, v) => s + v, 0)
    const futRec  = movimentacoes.filter(m => m.tipo === 'Receita'  && ['Pendente','Previsto'].includes(m.situacao) && m.data_pagamento && getAno(m.data_pagamento) === ano && futuros.includes(getMes(m.data_pagamento))).reduce((s, m) => s + Number(m.valor), 0)
    const futDesp = movimentacoes.filter(m => m.tipo === 'Despesa'  && ['Pendente','Previsto'].includes(m.situacao) && m.data_pagamento && getAno(m.data_pagamento) === ano && futuros.includes(getMes(m.data_pagamento))).reduce((s, m) => s + Number(m.valor), 0)
    return (realRec + futRec) - (realDesp + futDesp)
  }, [linhasControleMensal, movimentacoes, mesesCorrente, mesAtual, ano])

  const projecaoInteligente = useMemo(() => {
    if (ano !== hoje.getFullYear()) return null
    const futuros = Array.from({ length: 12 - mesAtual }, (_, i) => mesAtual + i + 1)
    const realizado = Array.from({ length: mesesCorrente }, (_, i) => resultadoMesMensal(i + 1)).reduce((s, v) => s + v, 0)
    let projecaoFutura = 0
    for (const mesFut of futuros) {
      for (const linha of linhasControleMensal) {
        const temLancado = movimentacoes.some(m => {
          const ck = m.categoria_id ? String(m.categoria_id) : `sem_cat_${m.tipo}`
          return ck === linha.id && ['Pendente','Previsto'].includes(m.situacao) &&
            m.data_pagamento && getMes(m.data_pagamento) === mesFut && getAno(m.data_pagamento) === ano
        })
        let val = 0
        if (temLancado) {
          val = movimentacoes.filter(m => {
            const ck = m.categoria_id ? String(m.categoria_id) : `sem_cat_${m.tipo}`
            return ck === linha.id && ['Pendente','Previsto'].includes(m.situacao) &&
              m.data_pagamento && getMes(m.data_pagamento) === mesFut && getAno(m.data_pagamento) === ano
          }).reduce((s, m) => s + Number(m.valor), 0)
        } else if (mesesCorrente > 0 && linha.tipo === 'despesa') {
          const soma = Array.from({ length: mesesCorrente }, (_, i) => linha.meses[i + 1] || 0).reduce((s, v) => s + v, 0)
          const media = soma / mesesCorrente
          val = (linha.limite > 0 && media > linha.limite) ? linha.limite : media
        }
        projecaoFutura += linha.tipo === 'receita' ? val : -val
      }
    }
    return realizado + projecaoFutura
  }, [linhasControleMensal, movimentacoes, mesesCorrente, mesAtual, ano, resultadoMesMensal])

  // ── Dados para Gráficos ───────────────────────────────────────────────────────

  const PIE_COLORS = ['#667eea','#22c55e','#f59e0b','#ef4444','#06b6d4','#8b5cf6','#ec4899','#14b8a6','#f97316','#84cc16','#a78bfa','#fb923c']

  const pieReceitas = useMemo(() =>
    linhasControleMensal
      .filter(l => l.tipo === 'receita')
      .map(l => ({ name: l.nome, value: +(mesFiltroGrafico === 0 ? l.total : (l.meses[mesFiltroGrafico] || 0)).toFixed(2) }))
      .filter(l => l.value > 0)
      .sort((a, b) => b.value - a.value),
    [linhasControleMensal, mesFiltroGrafico]
  )

  const pieDespesas = useMemo(() =>
    linhasControleMensal
      .filter(l => l.tipo === 'despesa')
      .map(l => ({ name: l.nome, value: +(mesFiltroGrafico === 0 ? l.total : (l.meses[mesFiltroGrafico] || 0)).toFixed(2) }))
      .filter(l => l.value > 0)
      .sort((a, b) => b.value - a.value),
    [linhasControleMensal, mesFiltroGrafico]
  )

  const comboData = useMemo(() => {
    let acum = 0
    return Array.from({ length: 12 }, (_, i) => {
      const m    = i + 1
      const rec  = linhasControleMensal.filter(l => l.tipo === 'receita').reduce((s, l) => s + (l.meses[m] || 0), 0)
      const desp = linhasControleMensal.filter(l => l.tipo === 'despesa').reduce((s, l) => s + (l.meses[m] || 0), 0)
      acum += rec - desp
      return { nome: MESES_CURTOS[i], receitas: +rec.toFixed(2), despesas: +desp.toFixed(2), acumulado: +acum.toFixed(2) }
    })
  }, [linhasControleMensal])

  // ── Cards ─────────────────────────────────────────────────────────────────────

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
      m.tipo === 'Despesa' && ['Pago','Faturado','Pendente'].includes(m.situacao) &&
      m.data_pagamento && getMes(m.data_pagamento) === mesAtual && getAno(m.data_pagamento) === ano
    )
    if (!despMes.length) return null
    const totais: Record<string, { categoria_id: number | null; total: number }> = {}
    for (const m of despMes) {
      const k = String(m.categoria_id ?? 'sem_cat')
      if (!totais[k]) totais[k] = { categoria_id: m.categoria_id, total: 0 }
      totais[k].total += Number(m.valor)
    }
    const maior = Object.values(totais).reduce((max, c) => c.total > max.total ? c : max)
    return { categoria_id: maior.categoria_id, valor: maior.total }
  }, [movimentacoes, mesAtual, ano])

  // ── Drill ─────────────────────────────────────────────────────────────────────

  const toggleDrill = (linhaId: string, mes: number, valor: number) => {
    if (valor === 0) return
    setDrillAberto(prev => prev?.linhaId === linhaId && prev?.mes === mes ? null : { linhaId, mes })
  }

  const lancamentosDrillCaixa = useMemo(() => {
    if (!drillAberto || aba !== 'caixa') return []
    const { linhaId, mes } = drillAberto
    const situOk = filtroCaixa === 'pendente' ? ['Pago', 'Pendente'] : ['Pago']

    if (linhaId.startsWith('fatura_')) {
      const cartaoId = Number(linhaId.replace('fatura_', ''))
      return movimentacoes.filter(m =>
        m.tipo === 'Transferência' && m.cartao_id === cartaoId && m.situacao === 'Pago' &&
        m.data_pagamento && getMes(m.data_pagamento) === mes && getAno(m.data_pagamento) === ano
      )
    }

    return movimentacoes.filter(m => {
      if (m.tipo === 'Transferência') return false
      if (m.metodo_pagamento?.startsWith('Crédito')) return false
      const ck = m.categoria_id ? String(m.categoria_id) : `sem_cat_${m.tipo}`
      if (ck !== linhaId) return false
      if (!m.data_pagamento || getMes(m.data_pagamento) !== mes || getAno(m.data_pagamento) !== ano) return false
      return situOk.includes(m.situacao)
    }).sort((a, b) => a.data_movimentacao.localeCompare(b.data_movimentacao))
  }, [drillAberto, aba, movimentacoes, filtroCaixa, ano])

  const lancamentosDrillMensal = useMemo(() => {
    if (!drillAberto || aba !== 'mensal') return []
    const { linhaId, mes } = drillAberto

    return movimentacoes.filter(m => {
      if (m.tipo === 'Transferência') return false
      if (!situacoesIncluidasMensal.includes(m.situacao)) return false
      const ck = m.categoria_id ? String(m.categoria_id) : `sem_cat_${m.tipo}`
      if (ck !== linhaId) return false
      const isCredito = m.metodo_pagamento?.startsWith('Crédito') ?? false
      if (isCredito) {
        return m.data_pagamento && getMes(m.data_pagamento) === mes && getAno(m.data_pagamento) === ano
      } else {
        return m.data_movimentacao && getMes(m.data_movimentacao) === mes && getAno(m.data_movimentacao) === ano
      }
    }).sort((a, b) => a.data_movimentacao.localeCompare(b.data_movimentacao))
  }, [drillAberto, aba, movimentacoes, situacoesIncluidasMensal, ano])

  const lancamentosDrill = aba === 'caixa' ? lancamentosDrillCaixa : lancamentosDrillMensal

  // ── Render ────────────────────────────────────────────────────────────────────

  const mesesTabela   = aba === 'caixa' ? mesesCaixa : meses12
  const linhasAtivas  = aba === 'caixa' ? linhasDRECaixa : linhasControleMensal
  const receitasLin   = linhasAtivas.filter(l => l.tipo === 'receita')
  const despesasLin   = linhasAtivas.filter(l => l.tipo === 'despesa')
  const totalMes      = aba === 'caixa' ? totalMesCaixa   : totalMesMensal
  const totalGeral    = aba === 'caixa' ? totalGeralCaixa : totalGeralMensal
  const resultadoMes  = aba === 'caixa' ? resultadoMesCaixa   : resultadoMesMensal
  const resultadoTotal = aba === 'caixa' ? resultadoTotalCaixa : resultadoTotalMensal
  const showLimite    = aba === 'mensal'
  const colspan       = mesesTabela.length + (showLimite ? 4 : 3)

  return (
    <div style={{ fontFamily: "'Segoe UI', system-ui, sans-serif", padding: '24px', maxWidth: '100%' }}>

      {/* Cabeçalho */}
      <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>DRE — Demonstrativo de Resultado</h1>
        <div>
          <label style={labelStyle}>Ano</label>
          <select value={ano} onChange={e => { setAno(Number(e.target.value)); setDrillAberto(null) }} style={selectStyle}>
            {anos.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
      </div>

      {/* Abas */}
      <div style={{ display: 'flex', gap: 0, marginBottom: '20px', borderBottom: '2px solid var(--border)' }}>
        {([
          { key: 'caixa'    as Aba, label: 'DRE — Fluxo de Caixa',   desc: 'O que entrou e saiu da conta' },
          { key: 'mensal'   as Aba, label: 'Controle Mensal',          desc: 'O que você consumiu por categoria' },
          { key: 'graficos' as Aba, label: 'Gráficos',                 desc: 'Distribuição por categoria' },
        ]).map(tab => (
          <button key={tab.key} onClick={() => { setAba(tab.key); setDrillAberto(null) }} style={{
            padding: '10px 20px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left',
            borderBottom: aba === tab.key ? '3px solid #0d7280' : '3px solid transparent',
            marginBottom: '-2px',
          }}>
            <div style={{ fontSize: '14px', fontWeight: 700, color: aba === tab.key ? '#0d7280' : '#6b7280' }}>{tab.label}</div>
            <div style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: '2px' }}>{tab.desc}</div>
          </button>
        ))}
      </div>

      {/* Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '20px' }}>
        {aba === 'caixa' && (() => {
          const rec  = totalGeralCaixa('receita')
          const desp = totalGeralCaixa('despesa')
          const res  = rec - desp
          return (<>
            <div style={{ background: 'var(--bg-success-soft)', borderRadius: '12px', padding: '14px 16px', borderLeft: '4px solid var(--text-success)' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-success)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Receitas</div>
              <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-success)', margin: '6px 0 2px' }}>{fmt(rec)}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-success)', opacity: 0.7 }}>Recebido no ano</div>
            </div>
            <div style={{ background: 'var(--bg-danger-soft)', borderRadius: '12px', padding: '14px 16px', borderLeft: '4px solid var(--text-danger)' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-danger)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Despesas</div>
              <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-danger)', margin: '6px 0 2px' }}>{fmt(desp)}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-danger)', opacity: 0.7 }}>Pago no ano</div>
            </div>
            <div style={{ background: res >= 0 ? 'var(--bg-success-soft)' : 'var(--bg-danger-soft)', borderRadius: '12px', padding: '14px 16px', borderLeft: `4px solid ${res >= 0 ? 'var(--text-success)' : 'var(--text-danger)'}` }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: res >= 0 ? 'var(--text-success)' : 'var(--text-danger)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Resultado</div>
              <div style={{ fontSize: '22px', fontWeight: 700, color: res >= 0 ? 'var(--text-success)' : 'var(--text-danger)', margin: '6px 0 2px' }}>{fmt(res)}</div>
              <div style={{ fontSize: '11px', color: res >= 0 ? 'var(--text-success)' : 'var(--text-danger)', opacity: 0.7 }}>Receitas − Despesas</div>
            </div>
          </>)
        })()}
        <div style={{ background: 'var(--bg-warning-soft)', borderRadius: '12px', padding: '14px 16px', borderLeft: '4px solid var(--text-warning)' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-warning)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Pendentes — {MESES_CURTOS[mesAtual - 1]}
          </div>
          <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-warning)', margin: '6px 0 2px' }}>{fmt(totalPendentesMesAtual)}</div>
        </div>

        {aba === 'mensal' && (
          <div style={{ background: 'var(--bg-purple-soft)', borderRadius: '12px', padding: '14px 16px', borderLeft: '4px solid var(--text-purple)' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-purple)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Previstos Futuros</div>
            <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-purple)', margin: '6px 0 2px' }}>{fmt(totalPrevistosFuturos)}</div>
            <div style={{ fontSize: '11px', color: 'var(--text-purple)', opacity: 0.7 }}>Despesas previstas após {MESES_CURTOS[mesAtual - 1]}</div>
          </div>
        )}

        <div style={{ background: 'var(--bg-danger-soft)', borderRadius: '12px', padding: '14px 16px', borderLeft: '4px solid var(--text-danger)' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-danger)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Maior Despesa — {MESES_CURTOS[mesAtual - 1]}</div>
          <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-danger)', margin: '6px 0 2px' }}>
            {maiorDespesaMes ? fmt(maiorDespesaMes.valor) : '—'}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-danger)', opacity: 0.7 }}>
            {maiorDespesaMes ? (categorias.find(c => c.id === maiorDespesaMes.categoria_id)?.nome ?? 'Sem categoria') : 'Nenhuma despesa'}
          </div>
        </div>

        {aba === 'mensal' && projecaoConservadora !== null && (
          <div onClick={() => { setFiltroMensal('conservadora'); setDrillAberto(null) }}
            style={{ background: projecaoConservadora >= 0 ? 'var(--bg-success-soft)' : 'var(--bg-danger-soft)', borderRadius: '12px', padding: '14px 16px', borderLeft: `4px solid ${projecaoConservadora >= 0 ? 'var(--text-success)' : 'var(--text-danger)'}`, cursor: 'pointer', outline: filtroMensal === 'conservadora' ? '2px solid #10b981' : 'none' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: projecaoConservadora >= 0 ? 'var(--text-success)' : 'var(--text-danger)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Projeção Conservadora</div>
            <div style={{ fontSize: '22px', fontWeight: 700, color: projecaoConservadora >= 0 ? 'var(--text-success)' : 'var(--text-danger)', margin: '6px 0 2px' }}>{fmt(projecaoConservadora)}</div>
            <div style={{ fontSize: '11px', color: projecaoConservadora >= 0 ? 'var(--text-success)' : 'var(--text-danger)', opacity: 0.8 }}>Realizado + Pendente + Previsto já lançados</div>
            <div style={{ fontSize: '10px', color: projecaoConservadora >= 0 ? 'var(--text-success)' : 'var(--text-danger)', opacity: 0.6, marginTop: '2px' }}>Clique para ver na tabela ↓</div>
          </div>
        )}

        {aba === 'mensal' && projecaoInteligente !== null && (
          <div onClick={() => { setFiltroMensal('inteligente'); setDrillAberto(null) }}
            style={{ background: projecaoInteligente >= 0 ? 'var(--bg-success-soft)' : 'var(--bg-danger-soft)', borderRadius: '12px', padding: '14px 16px', borderLeft: `4px solid ${projecaoInteligente >= 0 ? 'var(--text-success)' : 'var(--text-danger)'}`, position: 'relative', cursor: 'pointer', outline: filtroMensal === 'inteligente' ? '2px solid #10b981' : 'none' }}>
            <span style={{ position: 'absolute', top: '8px', right: '8px', background: '#2563eb', color: '#fff', fontSize: '9px', fontWeight: 700, padding: '2px 6px', borderRadius: '99px' }}>SMART</span>
            <div style={{ fontSize: '11px', fontWeight: 700, color: projecaoInteligente >= 0 ? 'var(--text-success)' : 'var(--text-danger)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Projeção Inteligente</div>
            <div style={{ fontSize: '22px', fontWeight: 700, color: projecaoInteligente >= 0 ? 'var(--text-success)' : 'var(--text-danger)', margin: '6px 0 2px' }}>{fmt(projecaoInteligente)}</div>
            <div style={{ fontSize: '11px', color: projecaoInteligente >= 0 ? 'var(--text-success)' : 'var(--text-danger)', opacity: 0.8 }}>Pendente/Previsto + média histórica onde não há lançamento</div>
            <div style={{ fontSize: '10px', color: projecaoInteligente >= 0 ? 'var(--text-success)' : 'var(--text-danger)', opacity: 0.6, marginTop: '2px' }}>Clique para ver na tabela ↓</div>
          </div>
        )}
      </div>

      {/* Filtros */}
      <div style={{ marginBottom: '20px' }}>
        <label style={{ ...labelStyle, marginBottom: '8px' }}>
          {aba === 'caixa' ? 'O que incluir no DRE' : aba === 'mensal' ? 'O que incluir no Controle Mensal' : 'Filtrar dados dos gráficos'}
        </label>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {aba === 'caixa' ? (
            ([
              { key: 'realizado' as FiltroSituacaoCaixa, label: 'Realizado', desc: 'Apenas Pago',      cor: '#065f46' },
              { key: 'pendente'  as FiltroSituacaoCaixa, label: '+ Pendente', desc: 'Pago + Pendente', cor: '#92400e' },
            ]).map(f => (
              <button key={f.key} onClick={() => { setFiltroCaixa(f.key); setDrillAberto(null) }} style={{
                padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                border: filtroCaixa === f.key ? 'none' : '1px solid var(--border)',
                background: filtroCaixa === f.key ? f.cor : 'var(--bg-card)',
                color: filtroCaixa === f.key ? '#fff' : 'var(--text-4)',
              }}>
                {f.label}
                <span style={{ display: 'block', fontSize: '10px', fontWeight: 400, opacity: 0.8, marginTop: '1px' }}>{f.desc}</span>
              </button>
            ))
          ) : (
            ([
              { key: 'realizado'   as FiltroSituacaoMensal, label: 'Realizado',   desc: 'Pago + Faturado',                      cor: '#065f46' },
              { key: 'pendente'    as FiltroSituacaoMensal, label: '+ Pendente',  desc: 'Realizado + Pendente',                  cor: '#92400e' },
              { key: 'previsto'    as FiltroSituacaoMensal, label: '+ Previsto',  desc: 'Realizado + Previsto',                  cor: '#6b21a8' },
              { key: 'todos'       as FiltroSituacaoMensal, label: 'Tudo',        desc: 'Pago + Faturado + Pendente + Previsto', cor: '#1e40af' },
            ]).map(f => (
              <button key={f.key} onClick={() => { setFiltroMensal(f.key); setDrillAberto(null) }} style={{
                padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                border: filtroMensal === f.key ? 'none' : '1px solid var(--border)',
                background: filtroMensal === f.key ? f.cor : 'var(--bg-card)',
                color: filtroMensal === f.key ? '#fff' : 'var(--text-4)',
              }}>
                {f.label}
                <span style={{ display: 'block', fontSize: '10px', fontWeight: 400, opacity: 0.8, marginTop: '1px' }}>{f.desc}</span>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Gráficos */}
      {aba === 'graficos' && (() => {
        const fmtK = (v: number) => { const a = Math.abs(v); return a >= 1000 ? `${v < 0 ? '-' : ''}R$ ${(a/1000).toFixed(1)}k` : fmt(v) }
        const BarTooltip = ({ active, payload }: any) => {
          if (!active || !payload?.length) return null
          const total = payload[0]?.payload?.total ?? 0
          const pct   = total > 0 ? ((payload[0].value / total) * 100).toFixed(1) : '0'
          return (
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
              <div style={{ fontWeight: 700, color: 'var(--text-1)', marginBottom: 2 }}>{payload[0].payload.name}</div>
              <div style={{ color: payload[0].fill }}>{fmt(payload[0].value)}</div>
              <div style={{ color: 'var(--text-3)', fontSize: 11 }}>{pct}% do total</div>
            </div>
          )
        }
        const CustomTooltip = ({ active, payload, label }: any) => {
          if (!active || !payload?.length) return null
          const nomes: Record<string, string> = { receitas: 'Receitas', despesas: 'Despesas', acumulado: 'Acumulado' }
          return (
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', fontSize: 12 }}>
              <div style={{ fontWeight: 700, marginBottom: 6, color: 'var(--text-1)' }}>{label}</div>
              {payload.map((p: any) => <div key={p.dataKey} style={{ color: p.color, marginBottom: 2 }}>{nomes[p.dataKey] ?? p.dataKey}: {fmt(p.value)}</div>)}
            </div>
          )
        }
        const totalRec  = pieReceitas.reduce((s, d) => s + d.value, 0)
        const totalDesp = pieDespesas.reduce((s, d) => s + d.value, 0)
        const barRec  = pieReceitas.map((d, i) => ({ ...d, fill: PIE_COLORS[i % PIE_COLORS.length], total: totalRec  }))
        const barDesp = pieDespesas.map((d, i) => ({ ...d, fill: PIE_COLORS[i % PIE_COLORS.length], total: totalDesp }))
        const labelMes = mesFiltroGrafico === 0 ? 'Ano todo' : MESES_CURTOS[mesFiltroGrafico - 1]
        return (
          <div>
            {/* Filtro de mês */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 }}>
              {[{ v: 0, l: 'Ano todo' }, ...MESES_CURTOS.map((m, i) => ({ v: i + 1, l: m }))].map(({ v, l }) => (
                <button key={v} onClick={() => setMesFiltroGrafico(v)} style={{
                  padding: '5px 12px', borderRadius: 7, fontSize: 12, cursor: 'pointer',
                  border: '1px solid var(--border)',
                  background: mesFiltroGrafico === v ? '#667eea' : 'var(--bg-card)',
                  color:      mesFiltroGrafico === v ? '#fff'    : 'var(--text-2)',
                  fontWeight: mesFiltroGrafico === v ? 700       : 400,
                }}>
                  {l}
                </button>
              ))}
            </div>

            {/* Barras lado a lado */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
              {([
                { titulo: 'Receitas por Categoria', data: barRec,  total: totalRec,  cor: '#22c55e' },
                { titulo: 'Despesas por Categoria', data: barDesp, total: totalDesp, cor: '#ef4444' },
              ] as { titulo: string; data: typeof barRec; total: number; cor: string }[]).map(({ titulo, data, total, cor }) => (
                <div key={titulo} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px' }}>
                  <div style={{ fontWeight: 700, color: 'var(--text-1)', marginBottom: 2 }}>{titulo}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 16 }}>
                    {labelMes} · Total: <span style={{ color: cor, fontWeight: 600 }}>{fmt(total)}</span>
                  </div>
                  {data.length === 0 ? (
                    <div style={{ textAlign: 'center', color: 'var(--text-3)', padding: 40 }}>Sem dados</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={Math.max(180, data.length * 34)}>
                      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 60, left: 0, bottom: 0 }}>
                        <XAxis type="number" tickFormatter={fmtK} tick={{ fontSize: 10, fill: 'var(--text-2)' }} axisLine={false} tickLine={false} />
                        <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11, fill: 'var(--text-2)' }} axisLine={false} tickLine={false} />
                        <Tooltip content={<BarTooltip />} cursor={{ fill: 'var(--bg-row)' }} />
                        <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={22} label={{ position: 'right', formatter: (v: number) => fmtK(v), fontSize: 11, fill: 'var(--text-2)' }}>
                          {data.map((d, idx) => <Cell key={idx} fill={d.fill} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              ))}
            </div>

            {/* Combo mensal */}
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px 16px 10px' }}>
              <div style={{ fontWeight: 700, color: 'var(--text-1)', marginBottom: 16 }}>Receitas × Despesas × Acumulado</div>
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={comboData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="nome" tick={{ fontSize: 11, fill: 'var(--text-2)' }} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="bars"  tickFormatter={fmtK} tick={{ fontSize: 10, fill: 'var(--text-2)' }} width={72} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="linha" orientation="right" tickFormatter={fmtK} tick={{ fontSize: 10, fill: 'var(--text-2)' }} width={72} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
                    formatter={(v: string) => ({ receitas: 'Receitas', despesas: 'Despesas', acumulado: 'Acumulado' }[v] ?? v)} />
                  <ReferenceLine yAxisId="linha" y={0} stroke="var(--border)" strokeDasharray="4 4" />
                  <Bar yAxisId="bars" dataKey="receitas" fill="#22c55e" opacity={0.85} radius={[3,3,0,0]} maxBarSize={36} />
                  <Bar yAxisId="bars" dataKey="despesas" fill="#ef4444" opacity={0.85} radius={[3,3,0,0]} maxBarSize={36} />
                  <Line yAxisId="linha" type="monotone" dataKey="acumulado" stroke="#667eea" strokeWidth={2.5} dot={{ r: 3, fill: '#667eea' }} activeDot={{ r: 5 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        )
      })()}

      {/* Legenda (apenas Controle Mensal) */}
      {aba === 'mensal' && (
        <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'center', background: 'var(--bg-row)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 16px', marginBottom: '12px', fontSize: '12px' }}>
          <span style={{ color: 'var(--text-2)', fontWeight: 600, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Legenda:</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--text-4)', display: 'inline-block' }} />Dentro do limite</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: '#f59e0b', display: 'inline-block' }} /><span style={{ color: 'var(--text-warning)' }}>Acima de 80% do limite</span></span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ef4444', display: 'inline-block' }} /><span style={{ color: 'var(--text-danger)' }}>Acima do limite</span></span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><span style={{ width: 12, height: 12, borderRadius: '2px', background: 'var(--bg-info-soft)', border: '1px solid var(--border-info)', display: 'inline-block' }} /><span style={{ color: 'var(--text-info)' }}>Mês atual</span></span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><span style={{ width: 12, height: 12, borderRadius: '2px', background: 'var(--bg-purple-soft)', border: '1px solid var(--border-purple)', display: 'inline-block' }} /><span style={{ color: 'var(--text-purple)' }}>Meses futuros</span></span>
          {filtroMensal === 'inteligente' && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ padding: '1px 6px', borderRadius: '4px', background: 'var(--bg-purple-soft)', color: 'var(--text-purple)', fontSize: '10px', fontWeight: 600, fontStyle: 'italic' }}>valor itálico</span>
              <span style={{ color: 'var(--text-2)' }}>Média projetada (modo Inteligente)</span>
            </span>
          )}
        </div>
      )}

      {/* Tabela */}
      {aba !== 'graficos' && (loading ? (
        <div style={{ padding: '64px', textAlign: 'center', color: 'var(--text-3)' }}>Carregando...</div>
      ) : (
        <div style={{ border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                {aba === 'mensal' && (
                  <tr style={{ background: '#1f2937' }}>
                    <td style={{ ...thBase, textAlign: 'left', position: 'sticky', left: 0, background: '#1f2937', zIndex: 11, padding: '4px 12px', fontSize: '10px', color: '#6b7280' }}>
                      ◀ passado · presente · futuro ▶
                    </td>
                    <td style={{ ...thBase, background: '#1f2937', padding: '4px' }} />
                    {meses12.map(m => {
                      const isFuturo = ano > hoje.getFullYear() || (ano === hoje.getFullYear() && m > mesAtual)
                      const isAtual  = ano === hoje.getFullYear() && m === mesAtual
                      return (
                        <td key={m} style={{ padding: '3px 4px', textAlign: 'center', fontSize: '9px', fontWeight: 600, color: isAtual ? '#fbbf24' : isFuturo ? '#7c3aed' : '#4b5563' }}>
                          {isAtual ? '● ATUAL' : isFuturo ? '◆' : ''}
                        </td>
                      )
                    })}
                    <td style={{ ...thBase, background: '#1f2937', padding: '4px' }} />
                    <td style={{ ...thBase, background: '#1f2937', padding: '4px' }} />
                  </tr>
                )}
                <tr style={{ background: '#111827' }}>
                  <th style={{ ...thBase, textAlign: 'left', minWidth: '170px', position: 'sticky', left: 0, background: '#111827', zIndex: 11 }}>Categoria</th>
                  {showLimite && <th style={{ ...thBase, minWidth: '85px', background: '#1f2937' }}>Limite/mês</th>}
                  {mesesTabela.map(m => {
                    const isFuturo = aba === 'mensal' && (ano > hoje.getFullYear() || (ano === hoje.getFullYear() && m > mesAtual))
                    const isAtual  = ano === hoje.getFullYear() && m === mesAtual
                    return (
                      <th key={m} style={{ ...thBase, minWidth: '80px', background: isAtual ? '#1e3a5f' : isFuturo ? '#2d1b4e' : '#111827', color: isAtual ? '#fbbf24' : isFuturo ? '#c4b5fd' : '#f9fafb', borderBottom: isAtual ? '2px solid #fbbf24' : isFuturo ? '2px solid #7c3aed' : '2px solid #374151' }}>
                        {MESES_CURTOS[m - 1]}
                      </th>
                    )
                  })}
                  <th style={{ ...thBase, minWidth: '90px', background: '#1f2937' }}>Total</th>
                  <th style={{ ...thBase, minWidth: '80px', background: '#1f2937' }}>Média/mês</th>
                </tr>
              </thead>

              <tbody>
                <GrupoHeader label='RECEITAS' colspan={colspan} cor='var(--text-success)' bg='var(--bg-success-soft)' />
                {receitasLin.map(linha => (
                  <LinhaComDrill key={linha.id} linha={linha} meses={mesesTabela} mesAtual={mesAtual} anoAtual={hoje.getFullYear()} ano={ano} isReceita showLimite={showLimite} mesesCorrente={mesesCorrente} drillAberto={drillAberto} lancamentosDrill={lancamentosDrill} onToggle={toggleDrill} mediaProjecao={aba === 'mensal' && filtroMensal === 'inteligente' ? (mediasPorLinhaMensal[linha.id] || 0) : 0} onEditLancamento={setEditandoDrill} />
                ))}
                <SubtotalRow label='Total Receitas' meses={mesesTabela} mesAtual={mesAtual} anoSel={ano} anoAtual={hoje.getFullYear()} valorMes={m => totalMes('receita', m)} total={totalGeral('receita')} cor='var(--text-success)' bg='var(--bg-success-soft)' mesesCorrente={mesesCorrente} showLimite={showLimite} />

                <GrupoHeader label='DESPESAS' colspan={colspan} cor='var(--text-danger)' bg='var(--bg-danger-soft)' />
                {despesasLin.map(linha => (
                  <LinhaComDrill key={linha.id} linha={linha} meses={mesesTabela} mesAtual={mesAtual} anoAtual={hoje.getFullYear()} ano={ano} isReceita={false} showLimite={showLimite} mesesCorrente={mesesCorrente} drillAberto={drillAberto} lancamentosDrill={lancamentosDrill} onToggle={toggleDrill} mediaProjecao={aba === 'mensal' && filtroMensal === 'inteligente' ? (mediasPorLinhaMensal[linha.id] || 0) : 0} onEditLancamento={setEditandoDrill} />
                ))}
                <SubtotalRow label='Total Despesas' meses={mesesTabela} mesAtual={mesAtual} anoSel={ano} anoAtual={hoje.getFullYear()} valorMes={m => totalMes('despesa', m)} total={totalGeral('despesa')} cor='var(--text-danger)' bg='var(--bg-danger-soft)' mesesCorrente={mesesCorrente} showLimite={showLimite} />

                <tr style={{ background: '#111827', borderTop: '2px solid #374151' }}>
                  <td style={{ ...tdFixo, fontWeight: 700, color: '#f9fafb', fontSize: '13px', background: '#111827' }}>RESULTADO</td>
                  {showLimite && <td style={{ ...tdNum, background: '#1f2937', color: '#6b7280' }}>—</td>}
                  {mesesTabela.map(m => {
                    const v = resultadoMes(m)
                    const isFuturo = aba === 'mensal' && (ano > hoje.getFullYear() || (ano === hoje.getFullYear() && m > mesAtual))
                    const isAtual  = ano === hoje.getFullYear() && m === mesAtual
                    return (
                      <td key={m} style={{ ...tdNum, fontWeight: 700, fontSize: '13px', color: v >= 0 ? '#34d399' : '#f87171', background: isAtual ? '#1e3a5f' : isFuturo ? '#1a1035' : 'transparent', opacity: isFuturo && !isAtual ? 0.75 : 1 }}>
                        {v !== 0 ? fmt(v) : <span style={{ color: '#374151' }}>—</span>}
                      </td>
                    )
                  })}
                  <td style={{ ...tdNum, background: '#1f2937', fontWeight: 700, fontSize: '13px', color: resultadoTotal >= 0 ? '#34d399' : '#f87171' }}>{fmt(resultadoTotal)}</td>
                  <td style={{ ...tdNum, background: '#1f2937', fontWeight: 700, fontSize: '12px', color: (() => { const v = mesesCorrente > 0 ? (Array.from({ length: Math.min(mesesCorrente, mesesTabela.length) }, (_, i) => resultadoMes(i + 1)).reduce((s, v) => s + v, 0) / Math.min(mesesCorrente, mesesTabela.length)) : 0; return v >= 0 ? '#34d399' : '#f87171' })() }}>
                    {mesesCorrente > 0 ? fmt(Array.from({ length: Math.min(mesesCorrente, mesesTabela.length) }, (_, i) => resultadoMes(i + 1)).reduce((s, v) => s + v, 0) / Math.min(mesesCorrente, mesesTabela.length)) : '—'}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {!loading && (
        <div style={{ marginTop: '10px', display: 'flex', gap: '20px', flexWrap: 'wrap', fontSize: '11px', color: 'var(--text-3)' }}>
          <span>💡 Clique em qualquer célula com valor para ver os lançamentos detalhados</span>
          {aba === 'caixa'  && <span>* Crédito aparece como pagamento de fatura (não por categoria)</span>}
          {aba === 'mensal' && <span>* Crédito: cada parcela distribuída no mês do seu vencimento</span>}
        </div>
      )}

      {/* Modal Edição */}
      {editandoDrill && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--bg-card)', borderRadius: 12, padding: 24, width: 400, maxWidth: '90vw', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-1)' }}>Editar Lançamento</h3>
              <button onClick={() => setEditandoDrill(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text-3)' }}>×</button>
            </div>
            {([
              { label: 'Descrição',       field: 'descricao',        type: 'text'   },
              { label: 'Valor (R$)',      field: 'valor',            type: 'number' },
              { label: 'Dt. Movimentação', field: 'data_movimentacao', type: 'date' },
              { label: 'Dt. Pagamento',   field: 'data_pagamento',   type: 'date'   },
            ] as { label: string; field: keyof Movimentacao; type: string }[]).map(({ label, field, type }) => (
              <div key={field} style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-4)', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</label>
                <input type={type} value={String(editDrillForm[field] ?? '')} onChange={e => setEditDrillForm(f => ({ ...f, [field]: e.target.value }))}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border-input)', background: 'var(--bg-input)', color: 'var(--text-1)', fontSize: 13, boxSizing: 'border-box' as const }} />
              </div>
            ))}
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-4)', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Situação</label>
              <select value={editDrillForm.situacao ?? ''} onChange={e => setEditDrillForm(f => ({ ...f, situacao: e.target.value }))} style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border-input)', background: 'var(--bg-input)', color: 'var(--text-1)', fontSize: 13 }}>
                {['Pago','Pendente','Previsto','Faturado'].map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-4)', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Categoria</label>
              <select value={editDrillForm.categoria_id ?? ''} onChange={e => setEditDrillForm(f => ({ ...f, categoria_id: Number(e.target.value) || null }))} style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border-input)', background: 'var(--bg-input)', color: 'var(--text-1)', fontSize: 13 }}>
                <option value="">— Selecione —</option>
                {categorias
                  .filter(c => editDrillForm.tipo === 'Receita'
                    ? ['Renda Ativa','Renda Passiva'].includes(c.classificacao)
                    : !['Renda Ativa','Renda Passiva'].includes(c.classificacao))
                  .map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button onClick={() => setEditandoDrill(null)} style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-row)', cursor: 'pointer', fontSize: 13, color: 'var(--text-4)' }}>Cancelar</button>
              <button onClick={handleSalvarDrill} disabled={salvandoDrill} style={{ padding: '8px 16px', borderRadius: 6, border: 'none', background: '#2563eb', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
                {salvandoDrill ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Parcelas */}
      {modalParcelasDrill && editandoDrill && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--bg-card)', borderRadius: 12, padding: 24, width: 360, maxWidth: '90vw', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>Lançamento Parcelado</h3>
            <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 20 }}>Este lançamento faz parte de um grupo. O que deseja fazer?</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button onClick={() => salvarEditDrill('esta')} style={{ padding: '10px 16px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#2563eb', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13, textAlign: 'left' }}>✏️ Editar somente esta parcela</button>
              <button onClick={() => salvarEditDrill('proximas')} style={{ padding: '10px 16px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-row)', color: 'var(--text-4)', cursor: 'pointer', fontSize: 13, textAlign: 'left' }}>⏩ Editar esta e todas as próximas</button>
              <button onClick={() => setModalParcelasDrill(false)} style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', padding: '8px', textAlign: 'center', fontSize: 13 }}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── LinhaComDrill ─────────────────────────────────────────────────────────────

function LinhaComDrill({ linha, meses, mesAtual, anoAtual, ano, isReceita, showLimite, mesesCorrente, drillAberto, lancamentosDrill, onToggle, mediaProjecao = 0, onEditLancamento }: {
  linha: LinhaDRE
  meses: number[]
  mesAtual: number
  anoAtual: number
  ano: number
  isReceita: boolean
  showLimite: boolean
  mesesCorrente: number
  drillAberto: DrillKey | null
  lancamentosDrill: Movimentacao[]
  onToggle: (linhaId: string, mes: number, valor: number) => void
  mediaProjecao?: number
  onEditLancamento: (m: Movimentacao) => void
}) {
  const cor = isReceita ? 'var(--text-success)' : 'var(--text-danger)'
  const drillEstaAberto = (mes: number) => drillAberto?.linhaId === linha.id && drillAberto?.mes === mes

  return (
    <>
      <tr style={{ borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }}>
        <td style={{ ...tdFixo, color: 'var(--text-4)' }}>
          <div style={{ fontWeight: 500 }}>{linha.nome}</div>
          {linha.classificacao && <div style={{ fontSize: '10px', color: 'var(--text-3)' }}>{linha.classificacao}</div>}
        </td>
        {showLimite && (
          <td style={{ ...tdNum, background: 'var(--bg-row)', color: 'var(--text-3)', fontSize: '11px' }}>
            {linha.limite > 0 ? fmt(linha.limite) : '—'}
          </td>
        )}

        {meses.map(m => {
          const v = linha.meses[m] || 0
          const isFuturo = ano > anoAtual || (ano === anoAtual && m > mesAtual)
          const isAtual  = ano === anoAtual && m === mesAtual
          const vExibir  = (isFuturo && !isAtual && v === 0 && mediaProjecao > 0) ? mediaProjecao : v
          const isMedia  = isFuturo && !isAtual && v === 0 && mediaProjecao > 0
          const pct = linha.limite > 0 ? vExibir / linha.limite : null
          const aberto = drillEstaAberto(m)

          let corValor = '#d1d5db'
          if (vExibir > 0) {
            if (isMedia) corValor = '#9333ea'
            else if (!isReceita && pct !== null) {
              corValor = pct > 1 ? '#ef4444' : pct >= 0.8 ? '#f59e0b' : '#374151'
            } else corValor = cor
          }

          return (
            <td key={m}
              onClick={() => !isMedia && onToggle(linha.id, m, v)}
              title={isMedia ? `Média projetada: ${fmt(mediaProjecao)}` : v > 0 ? 'Clique para ver lançamentos' : ''}
              style={{ ...tdNum, color: corValor, fontWeight: vExibir > 0 ? 600 : 400, background: aberto ? 'var(--bg-warning-soft)' : isAtual ? 'var(--bg-info-soft)' : isFuturo ? 'var(--bg-purple-soft)' : 'transparent', opacity: isFuturo && !isAtual ? 0.85 : 1, cursor: isMedia ? 'default' : v > 0 ? 'pointer' : 'default', borderBottom: aberto ? '2px solid var(--border-warning)' : 'none', transition: 'background 0.1s' }}>
              {vExibir > 0
                ? <span style={{ textDecoration: !isMedia ? 'underline dotted' : 'none', textUnderlineOffset: '3px', fontStyle: isMedia ? 'italic' : 'normal' }}>{fmt(vExibir)}</span>
                : <span style={{ color: '#e5e7eb' }}>—</span>
              }
            </td>
          )
        })}

        <td style={{ ...tdNum, background: 'var(--bg-row)', fontWeight: 700, color: cor }}>
          <div>{fmt(linha.total)}</div>
          {showLimite && linha.limite > 0 && (
            <div style={{ fontSize: '10px', color: linha.total > linha.limite * 12 ? '#ef4444' : 'var(--text-3)', fontWeight: 400 }}>
              {((linha.total / (linha.limite * 12)) * 100).toFixed(0)}% do limite anual
            </div>
          )}
        </td>

        <td style={{ ...tdNum, background: 'var(--bg-row)', fontWeight: 700, color: cor, fontSize: '12px' }}>
          {mesesCorrente > 0 ? (() => {
            const soma = Array.from({ length: Math.min(mesesCorrente, meses.length) }, (_, i) => linha.meses[meses[i]] || 0).reduce((s, v) => s + v, 0)
            const med = soma / Math.min(mesesCorrente, meses.length)
            return (
              <>
                <div>{fmt(med)}</div>
                {showLimite && linha.limite > 0 && (
                  <div style={{ fontSize: '10px', color: med > linha.limite ? '#ef4444' : 'var(--text-3)', fontWeight: 400 }}>
                    {((med / linha.limite) * 100).toFixed(0)}% do limite
                  </div>
                )}
              </>
            )
          })() : '—'}
        </td>
      </tr>

      {drillAberto?.linhaId === linha.id && (
        <tr>
          <td colSpan={meses.length + (showLimite ? 4 : 3)} style={{ padding: 0, background: 'var(--bg-warning-soft)', borderBottom: '2px solid var(--border-warning)' }}>
            <div style={{ padding: '12px 16px 16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-warning)' }}>
                  📋 {linha.nome} — {MESES_CURTOS[drillAberto.mes - 1]}/{ano}
                  <span style={{ fontWeight: 400, color: 'var(--text-3)', marginLeft: '8px', fontSize: '12px' }}>
                    {lancamentosDrill.length} lançamento{lancamentosDrill.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <button onClick={() => onToggle(linha.id, drillAberto.mes, 1)} style={{ background: 'none', border: 'none', fontSize: '16px', cursor: 'pointer', color: 'var(--text-3)' }}>×</button>
              </div>

              {lancamentosDrill.length === 0 ? (
                <div style={{ color: 'var(--text-3)', fontSize: '13px' }}>Nenhum lançamento encontrado com os filtros ativos.</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-warning-soft)', borderBottom: '1px solid var(--border-warning)' }}>
                      {['Dt. Movimentação','Dt. Pagamento','Descrição','Valor','Método','Parcela','Situação',''].map(h => (
                        <th key={h} style={{ padding: '6px 10px', textAlign: h === 'Valor' ? 'right' : 'left', fontWeight: 600, color: 'var(--text-warning)', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {lancamentosDrill.map((l, idx) => (
                      <tr key={l.id} style={{ background: idx % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-warning-soft)', borderBottom: '1px solid var(--border-warning)' }}>
                        <td style={tdDrill}>{fmtDate(l.data_movimentacao)}</td>
                        <td style={tdDrill}>{fmtDate(l.data_pagamento)}</td>
                        <td style={{ ...tdDrill, fontWeight: 500, maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.descricao}</td>
                        <td style={{ ...tdDrill, textAlign: 'right', fontWeight: 700, color: 'var(--text-danger)' }}>{fmt(Number(l.valor))}</td>
                        <td style={tdDrill}>{l.metodo_pagamento || '—'}</td>
                        <td style={tdDrill}>{l.numero_parcela || '—'}</td>
                        <td style={tdDrill}>
                          <span style={{ ...corSituacao(l.situacao), padding: '2px 8px', borderRadius: '99px', fontSize: '11px', fontWeight: 600 }}>{l.situacao}</span>
                        </td>
                        <td style={tdDrill}>
                          <button onClick={e => { e.stopPropagation(); onEditLancamento(l) }} style={{ background: 'var(--bg-info-soft)', border: '1px solid var(--border-info)', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontSize: 11, color: 'var(--text-info)', fontWeight: 600 }}>✏️ Editar</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: 'var(--bg-warning-soft)', borderTop: '1px solid var(--border-warning)' }}>
                      <td colSpan={3} style={{ padding: '6px 10px', fontWeight: 700, color: 'var(--text-warning)', fontSize: '12px' }}>Total</td>
                      <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700, color: 'var(--text-danger)' }}>
                        {fmt(lancamentosDrill.reduce((s, l) => s + Number(l.valor), 0))}
                      </td>
                      <td colSpan={4} />
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
      <td colSpan={colspan} style={{ padding: '6px 12px', background: bg, fontSize: '11px', fontWeight: 700, color: cor, textTransform: 'uppercase', letterSpacing: '0.06em', borderTop: '2px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
        {label}
      </td>
    </tr>
  )
}

function SubtotalRow({ label, meses, mesAtual, anoSel, anoAtual, valorMes, total, cor, bg, mesesCorrente, showLimite }: {
  label: string; meses: number[]; mesAtual: number; anoSel: number; anoAtual: number
  valorMes: (m: number) => number; total: number; cor: string; bg: string; mesesCorrente: number; showLimite: boolean
}) {
  return (
    <tr style={{ background: bg, borderTop: '1px solid var(--border)', borderBottom: '2px solid var(--border)' }}>
      <td style={{ ...tdFixo, fontWeight: 700, color: cor, background: bg }}>{label}</td>
      {showLimite && <td style={{ ...tdNum, color: 'var(--text-3)', background: bg }}>—</td>}
      {meses.map(m => {
        const v = valorMes(m)
        const isFuturo = anoSel > anoAtual || (anoSel === anoAtual && m > mesAtual)
        const isAtual  = anoSel === anoAtual && m === mesAtual
        return <td key={m} style={{ ...tdNum, fontWeight: 700, color: cor, opacity: isFuturo && !isAtual ? 0.7 : 1 }}>{fmt(v)}</td>
      })}
      <td style={{ ...tdNum, fontWeight: 700, color: cor, background: bg }}>{fmt(total)}</td>
      <td style={{ ...tdNum, fontWeight: 700, color: cor, background: bg, fontSize: '12px' }}>
        {mesesCorrente > 0 ? fmt(Array.from({ length: Math.min(mesesCorrente, meses.length) }, (_, i) => valorMes(meses[i])).reduce((s, v) => s + v, 0) / Math.min(mesesCorrente, meses.length)) : '—'}
      </td>
    </tr>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = { display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }
const selectStyle: React.CSSProperties = { border: '1px solid var(--border-input)', borderRadius: '8px', padding: '7px 10px', fontSize: '13px', background: 'var(--bg-input)', color: 'var(--text-1)', cursor: 'pointer', height: '38px' }
const thBase: React.CSSProperties = { padding: '10px 10px', textAlign: 'right', fontWeight: 600, color: '#f9fafb', fontSize: '12px', borderBottom: '2px solid #374151', whiteSpace: 'nowrap' }
const tdFixo: React.CSSProperties = { padding: '8px 12px', verticalAlign: 'middle', position: 'sticky', left: 0, background: 'var(--bg-card)', borderRight: '1px solid var(--border)', whiteSpace: 'nowrap', zIndex: 1 }
const tdNum: React.CSSProperties = { padding: '8px 10px', textAlign: 'right', verticalAlign: 'middle', whiteSpace: 'nowrap' }
const tdDrill: React.CSSProperties = { padding: '6px 10px', color: 'var(--text-4)', verticalAlign: 'middle' }
