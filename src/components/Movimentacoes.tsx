import { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Movimentacao {
  id: number
  data_movimentacao: string
  data_pagamento: string | null
  tipo: string
  categoria_id: number | null
  classificacao: string | null
  descricao: string
  valor: number
  metodo_pagamento: string | null
  cartao_id: number | null
  conta_origem_destino: string | null
  forma_pagamento: string | null
  numero_parcela: string | null
  situacao: string
  grupo_id: string | null
}

interface Categoria {
  id: number
  nome: string
  classificacao: string
}

interface Cartao {
  id: number
  nome: string
  data_fechamento: number
  data_vencimento: number
}

interface Conta {
  id: number
  nome: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MESES = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'
]

const SITUACOES = ['Pago', 'Pendente', 'Faturado', 'Previsto']
const METODOS_TODOS = ['Débito', 'PIX', 'Dinheiro', 'Cartão de Crédito', 'Boleto', 'Transferência']

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatCurrency = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const formatDate = (d: string | null) => {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Movimentacoes() {
  const { user } = useAuth()
  const [householdId, setHouseholdId] = useState<string | null>(null)

  const [todasMovimentacoes, setTodasMovimentacoes] = useState<Movimentacao[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [cartoes, setCartoes] = useState<Cartao[]>([])
  const [contas, setContas] = useState<Conta[]>([])

  // Filtros — todos persistem ao trocar mês/ano
  const hoje = new Date()
  const [filtroMes, setFiltroMes] = useState(hoje.getMonth() + 1)
  const [filtroAno, setFiltroAno] = useState(hoje.getFullYear())
  const [filtroTipo, setFiltroTipo] = useState('')
  const [filtroSituacao, setFiltroSituacao] = useState('')
  const [filtroCategoria, setFiltroCategoria] = useState('')
  const [filtroMetodo, setFiltroMetodo] = useState('')
  const [filtroBusca, setFiltroBusca] = useState('')   // ✅ busca por descrição — persiste entre meses

  // UI State
  const [loading, setLoading] = useState(false)
  const [editando, setEditando] = useState<Movimentacao | null>(null)
  const [excluindo, setExcluindo] = useState<Movimentacao | null>(null)
  const [modalParcelas, setModalParcelas] = useState<{ mov: Movimentacao; form: Partial<Movimentacao> } | null>(null)
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState('')
  const [sucesso, setSucesso] = useState('')
  const [editForm, setEditForm] = useState<Partial<Movimentacao>>({})

  // ── Load household ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return
    supabase
      .from('households')
      .select('id')
      .eq('owner_id', user.id)
      .single()
      .then(({ data }) => { if (data) setHouseholdId(data.id) })
  }, [user])

  // ── Load reference data ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!householdId) return
    supabase.from('categorias').select('id,nome,classificacao').eq('household_id', householdId).order('nome')
      .then(({ data }) => setCategorias(data || []))
    supabase.from('cartoes').select('id,nome,data_fechamento,data_vencimento').eq('household_id', householdId).eq('ativo', true).order('nome')
      .then(({ data }) => setCartoes(data || []))
    supabase.from('contas').select('id,nome').eq('household_id', householdId).eq('ativo', true).order('nome')
      .then(({ data }) => setContas(data || []))
  }, [householdId])

  // ── Carrega lançamentos por data_movimentacao ────────────────────────────────
  // ✅ Filtro por data_movimentacao — mostra o que foi comprado/feito no mês,
  //    não quando foi pago
  const fetchMovimentacoes = useCallback(async () => {
    if (!householdId) return
    setLoading(true)
    const mesStr = String(filtroMes).padStart(2, '0')
    const dataInicio = `${filtroAno}-${mesStr}-01`
    const ultimoDia = new Date(filtroAno, filtroMes, 0).getDate()
    const dataFim = `${filtroAno}-${mesStr}-${ultimoDia}`

    const { data, error } = await supabase
      .from('movimentacoes')
      .select('*')
      .eq('household_id', householdId)
      .gte('data_movimentacao', dataInicio)   // ✅ era data_pagamento
      .lte('data_movimentacao', dataFim)       // ✅ era data_pagamento
      .order('data_movimentacao', { ascending: false })
      .order('id', { ascending: false })

    if (!error) setTodasMovimentacoes(data || [])
    setLoading(false)
  }, [householdId, filtroMes, filtroAno])

  useEffect(() => { fetchMovimentacoes() }, [fetchMovimentacoes])

  // ── Filtros dinâmicos ────────────────────────────────────────────────────────
  const aplicarFiltros = (
    lista: Movimentacao[],
    opts: { tipo?: string; situacao?: string; categoria?: string; metodo?: string; busca?: string }
  ) => lista.filter(m => {
    if (opts.tipo && m.tipo !== opts.tipo) return false
    if (opts.situacao && m.situacao !== opts.situacao) return false
    if (opts.categoria && String(m.categoria_id) !== opts.categoria) return false
    if (opts.metodo && m.metodo_pagamento !== opts.metodo) return false
    if (opts.busca && !m.descricao.toLowerCase().includes(opts.busca.toLowerCase())) return false
    return true
  })

  // Resultado final da tabela (todos os filtros ativos)
  const movimentacoesFiltradas = useMemo(() =>
    aplicarFiltros(todasMovimentacoes, {
      tipo: filtroTipo,
      situacao: filtroSituacao,
      categoria: filtroCategoria,
      metodo: filtroMetodo,
      busca: filtroBusca,
    }),
    [todasMovimentacoes, filtroTipo, filtroSituacao, filtroCategoria, filtroMetodo, filtroBusca]
  )

  // Opções disponíveis por filtro (excluindo o próprio filtro do cálculo)
  const tiposDisponiveis = useMemo(() => {
    const base = aplicarFiltros(todasMovimentacoes, { situacao: filtroSituacao, categoria: filtroCategoria, metodo: filtroMetodo, busca: filtroBusca })
    return [...new Set(base.map(m => m.tipo))].sort()
  }, [todasMovimentacoes, filtroSituacao, filtroCategoria, filtroMetodo, filtroBusca])

  const situacoesDisponiveis = useMemo(() => {
    const base = aplicarFiltros(todasMovimentacoes, { tipo: filtroTipo, categoria: filtroCategoria, metodo: filtroMetodo, busca: filtroBusca })
    return [...new Set(base.map(m => m.situacao))].sort()
  }, [todasMovimentacoes, filtroTipo, filtroCategoria, filtroMetodo, filtroBusca])

  const categoriasDisponiveis = useMemo(() => {
    const base = aplicarFiltros(todasMovimentacoes, { tipo: filtroTipo, situacao: filtroSituacao, metodo: filtroMetodo, busca: filtroBusca })
    const ids = [...new Set(base.map(m => m.categoria_id).filter(Boolean))]
    return categorias.filter(c => ids.includes(c.id))
  }, [todasMovimentacoes, filtroTipo, filtroSituacao, filtroMetodo, categorias, filtroBusca])

  const metodosDisponiveis = useMemo(() => {
    const base = aplicarFiltros(todasMovimentacoes, { tipo: filtroTipo, situacao: filtroSituacao, categoria: filtroCategoria, busca: filtroBusca })
    return [...new Set(base.map(m => m.metodo_pagamento).filter(Boolean) as string[])].sort()
  }, [todasMovimentacoes, filtroTipo, filtroSituacao, filtroCategoria, filtroBusca])

  // ✅ Trocar mês/ano NÃO limpa filtros — eles persistem
  const handleMesAno = (mes: number, ano: number) => {
    setFiltroMes(mes)
    setFiltroAno(ano)
    // filtros de tipo/situacao/categoria/metodo/busca permanecem
  }

  // ✅ Limpar todos os filtros (exceto mês/ano) — via botão explícito
  const limparFiltros = () => {
    setFiltroTipo('')
    setFiltroSituacao('')
    setFiltroCategoria('')
    setFiltroMetodo('')
    setFiltroBusca('')
  }

  const handleFiltroTipo = (v: string) => {
    setFiltroTipo(v)
    if (filtroCategoria) {
      const base = aplicarFiltros(todasMovimentacoes, { tipo: v, situacao: filtroSituacao, metodo: filtroMetodo, busca: filtroBusca })
      if (!base.some(m => String(m.categoria_id) === filtroCategoria)) setFiltroCategoria('')
    }
  }

  const handleFiltroSituacao = (v: string) => {
    setFiltroSituacao(v)
    if (filtroCategoria) {
      const base = aplicarFiltros(todasMovimentacoes, { tipo: filtroTipo, situacao: v, metodo: filtroMetodo, busca: filtroBusca })
      if (!base.some(m => String(m.categoria_id) === filtroCategoria)) setFiltroCategoria('')
    }
  }

  const handleFiltroMetodo = (v: string) => {
    setFiltroMetodo(v)
    if (filtroCategoria) {
      const base = aplicarFiltros(todasMovimentacoes, { tipo: filtroTipo, situacao: filtroSituacao, metodo: v, busca: filtroBusca })
      if (!base.some(m => String(m.categoria_id) === filtroCategoria)) setFiltroCategoria('')
    }
  }

  // ── Totais (sobre dados filtrados) ──────────────────────────────────────────
  const totalReceitas = movimentacoesFiltradas
    .filter(m => m.tipo === 'Receita' && m.situacao !== 'Previsto')
    .reduce((s, m) => s + Number(m.valor), 0)

  const totalDespesasDebito = movimentacoesFiltradas
    .filter(m => m.tipo === 'Despesa' && m.situacao !== 'Previsto' && !m.cartao_id)
    .reduce((s, m) => s + Number(m.valor), 0)

  const totalDespesasCredito = movimentacoesFiltradas
    .filter(m => m.tipo === 'Despesa' && m.situacao !== 'Previsto' && !!m.cartao_id)
    .reduce((s, m) => s + Number(m.valor), 0)

  const totalPagamentoFatura = movimentacoesFiltradas
    .filter(m => m.tipo === 'Transferência')
    .reduce((s, m) => s + Number(m.valor), 0)

  // ── Edit ────────────────────────────────────────────────────────────────────
  const abrirEdicao = (mov: Movimentacao) => {
    setEditForm({ ...mov })
    setEditando(mov)
    setErro('')
  }

  const fecharEdicao = () => {
    setEditando(null)
    setEditForm({})
    setErro('')
  }

  const salvarEdicao = async () => {
    if (!editando || !editForm) return
    setSaving(true)
    setErro('')
    if (editando.grupo_id) {
      setModalParcelas({ mov: editando, form: editForm })
      setSaving(false)
      return
    }
    await salvarMovimentacao(editando.id, editForm, null)
  }

  const salvarMovimentacao = async (
    id: number,
    form: Partial<Movimentacao>,
    escopo: 'esta' | 'proximas' | null,
    grupoId?: string | null,
    dataMov?: string
  ) => {
    setSaving(true)
    try {
      const payload: Partial<Movimentacao> = {
        data_movimentacao: form.data_movimentacao,
        data_pagamento: form.data_pagamento,
        tipo: form.tipo,
        categoria_id: form.categoria_id,
        descricao: form.descricao,
        valor: Number(form.valor),
        metodo_pagamento: form.metodo_pagamento,
        cartao_id: form.cartao_id || null,
        conta_origem_destino: form.conta_origem_destino,
        forma_pagamento: form.forma_pagamento,
        situacao: form.situacao,
      }

      if (escopo === 'proximas' && grupoId && dataMov) {
        const payloadProximas = {
          tipo: form.tipo,
          categoria_id: form.categoria_id,
          descricao: form.descricao,
          valor: Number(form.valor),
          metodo_pagamento: form.metodo_pagamento,
          cartao_id: form.cartao_id || null,
          conta_origem_destino: form.conta_origem_destino,
          forma_pagamento: form.forma_pagamento,
          situacao: form.situacao,
        }
        const { data: parcelas, error: errBusca } = await supabase
          .from('movimentacoes')
          .select('id')
          .eq('grupo_id', grupoId)
          .gte('data_movimentacao', dataMov)
        console.log('proximas - grupo_id:', grupoId, 'dataMov:', dataMov, 'parcelas:', parcelas, 'erro:', errBusca)
        if (parcelas && parcelas.length > 0) {
          const { error: errUpdate } = await supabase
            .from('movimentacoes')
            .update(payloadProximas)
            .eq('grupo_id', grupoId)
            .gte('data_movimentacao', dataMov)
          console.log('update erro:', errUpdate)
        }
      } else {
        await supabase.from('movimentacoes').update(payload).eq('id', id)
      }

      setSucesso('Lançamento atualizado com sucesso!')
      setTimeout(() => setSucesso(''), 3000)
      fecharEdicao()
      setModalParcelas(null)
      fetchMovimentacoes()
    } catch {
      setErro('Erro ao salvar. Tente novamente.')
    } finally {
      setSaving(false)
    }
  }

  // ── Delete ──────────────────────────────────────────────────────────────────
  const confirmarExclusao = async (modo: 'esta' | 'todas') => {
    if (!excluindo) return
    setSaving(true)
    let deleteError = null

    if (modo === 'todas' && excluindo.grupo_id) {
      const { error } = await supabase
        .from('movimentacoes')
        .delete()
        .eq('grupo_id', excluindo.grupo_id)
        .in('situacao', ['Pendente', 'Previsto'])
      deleteError = error
    } else {
      const { error } = await supabase.from('movimentacoes').delete().eq('id', excluindo.id)
      deleteError = error
    }

    if (!deleteError) {
      setSucesso(modo === 'todas' ? 'Parcelas pendentes excluídas.' : 'Lançamento excluído.')
      setTimeout(() => setSucesso(''), 3000)
      fetchMovimentacoes()
    } else {
      setErro('Erro ao excluir.')
    }
    setExcluindo(null)
    setSaving(false)
  }

  // ── Helpers visuais ─────────────────────────────────────────────────────────
  const corSituacao = (s: string) => {
    switch (s) {
      case 'Pago':     return { bg: '#d1fae5', color: '#065f46' }
      case 'Pendente': return { bg: '#fef3c7', color: '#92400e' }
      case 'Faturado': return { bg: '#dbeafe', color: '#1e40af' }
      case 'Previsto': return { bg: '#f3e8ff', color: '#6b21a8' }
      default:         return { bg: '#f3f4f6', color: '#374151' }
    }
  }

  const corTipo = (t: string) => {
    if (t === 'Receita') return '#065f46'
    if (t === 'Despesa') return '#991b1b'
    return '#1e40af'
  }

  const catNome = (id: number | null) =>
    id ? (categorias.find(c => c.id === id)?.nome || '—') : '—'

  const cartaoNome = (id: number | null) =>
    id ? (cartoes.find(c => c.id === id)?.nome || null) : null

  const anos = Array.from({ length: 5 }, (_, i) => hoje.getFullYear() - 2 + i)
  const temFiltroAtivo = !!(filtroTipo || filtroSituacao || filtroCategoria || filtroMetodo || filtroBusca)

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ fontFamily: "'Segoe UI', system-ui, sans-serif", padding: '24px', maxWidth: '1500px', margin: '0 auto' }}>

      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#111827', margin: 0 }}>Movimentações</h1>
        <p style={{ color: '#6b7280', marginTop: '4px', fontSize: '14px' }}>Visualize, edite e gerencie todos os lançamentos</p>
      </div>

      {/* Feedback */}
      {sucesso && (
        <div style={{ background: '#d1fae5', border: '1px solid #6ee7b7', color: '#065f46', padding: '10px 16px', borderRadius: '8px', marginBottom: '16px', fontSize: '14px' }}>
          ✓ {sucesso}
        </div>
      )}
      {erro && (
        <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', color: '#991b1b', padding: '10px 16px', borderRadius: '8px', marginBottom: '16px', fontSize: '14px' }}>
          ✗ {erro}
        </div>
      )}

      {/* ── Filtros ─────────────────────────────────────────────────────────── */}
      <div style={{
        background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '12px',
        padding: '16px 20px', marginBottom: '20px',
        display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-end'
      }}>

        {/* Mês */}
        <div>
          <label style={labelStyle}>Mês</label>
          <select value={filtroMes} onChange={e => handleMesAno(Number(e.target.value), filtroAno)} style={selectStyle}>
            {MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
        </div>

        {/* Ano */}
        <div>
          <label style={labelStyle}>Ano</label>
          <select value={filtroAno} onChange={e => handleMesAno(filtroMes, Number(e.target.value))} style={selectStyle}>
            {anos.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>

        {/* Tipo */}
        <div>
          <label style={labelStyle}>
            Tipo {filtroTipo && <span style={badgeFiltro}>✓</span>}
          </label>
          <select value={filtroTipo} onChange={e => handleFiltroTipo(e.target.value)} style={selectStyle}
            disabled={tiposDisponiveis.length === 0}>
            <option value=''>Todos {tiposDisponiveis.length > 0 ? `(${tiposDisponiveis.length})` : ''}</option>
            {tiposDisponiveis.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        {/* Situação */}
        <div>
          <label style={labelStyle}>
            Situação {filtroSituacao && <span style={badgeFiltro}>✓</span>}
          </label>
          <select value={filtroSituacao} onChange={e => handleFiltroSituacao(e.target.value)} style={selectStyle}
            disabled={situacoesDisponiveis.length === 0}>
            <option value=''>Todas {situacoesDisponiveis.length > 0 ? `(${situacoesDisponiveis.length})` : ''}</option>
            {situacoesDisponiveis.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {/* Categoria */}
        <div>
          <label style={labelStyle}>
            Categoria {filtroCategoria && <span style={badgeFiltro}>✓</span>}
          </label>
          <select value={filtroCategoria} onChange={e => setFiltroCategoria(e.target.value)}
            style={{ ...selectStyle, maxWidth: '200px' }}
            disabled={categoriasDisponiveis.length === 0}>
            <option value=''>Todas {categoriasDisponiveis.length > 0 ? `(${categoriasDisponiveis.length})` : ''}</option>
            {categoriasDisponiveis.map(c => <option key={c.id} value={String(c.id)}>{c.nome}</option>)}
          </select>
        </div>

        {/* Método */}
        <div>
          <label style={labelStyle}>
            Método {filtroMetodo && <span style={badgeFiltro}>✓</span>}
          </label>
          <select value={filtroMetodo} onChange={e => handleFiltroMetodo(e.target.value)} style={selectStyle}
            disabled={metodosDisponiveis.length === 0}>
            <option value=''>Todos {metodosDisponiveis.length > 0 ? `(${metodosDisponiveis.length})` : ''}</option>
            {metodosDisponiveis.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>

        {/* ✅ Busca por descrição — persiste ao trocar mês */}
        <div>
          <label style={labelStyle}>
            Descrição {filtroBusca && <span style={badgeFiltro}>✓</span>}
          </label>
          <input
            type='text'
            placeholder='Buscar...'
            value={filtroBusca}
            onChange={e => setFiltroBusca(e.target.value)}
            style={{ ...selectStyle, width: '160px' }}
          />
        </div>

        {/* ✅ Botão Limpar — aparece só quando há filtro ativo */}
        {temFiltroAtivo && (
          <button
            onClick={limparFiltros}
            style={{ ...btnSecundario, height: '38px', color: '#dc2626', borderColor: '#fca5a5' }}
          >
            ✕ Limpar filtros
          </button>
        )}
      </div>

      {/* ── Totais ──────────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '20px' }}>
        <CardTotal label='Receitas' valor={totalReceitas} cor='#065f46' bg='#d1fae5' />
        <CardTotal label='Despesas (Débito/PIX)' valor={totalDespesasDebito} cor='#991b1b' bg='#fee2e2' />
        <CardTotal label='Despesas (Crédito)' valor={totalDespesasCredito} cor='#b45309' bg='#fef3c7' />
        <CardTotal label='Pag. Fatura' valor={totalPagamentoFatura} cor='#6b21a8' bg='#f3e8ff' />
      </div>

      {/* ── Tabela ──────────────────────────────────────────────────────────── */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af' }}>Carregando...</div>
        ) : movimentacoesFiltradas.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af' }}>
            {temFiltroAtivo
              ? 'Nenhum lançamento encontrado com os filtros selecionados.'
              : 'Nenhum lançamento encontrado para o período.'}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                  {['Dt. Movimentação','Dt. Pagamento','Descrição','Tipo','Categoria','Valor','Método','Cartão / Conta','Parcela','Situação','Ações'].map(h => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#374151', whiteSpace: 'nowrap', fontSize: '12px' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {movimentacoesFiltradas.map((m, idx) => (
                  <tr key={m.id} style={{ borderBottom: '1px solid #f3f4f6', background: idx % 2 === 0 ? '#fff' : '#fafafa' }}>

                    {/* Data Movimentação */}
                    <td style={tdStyle}>
                      <span style={{ whiteSpace: 'nowrap' }}>{formatDate(m.data_movimentacao)}</span>
                    </td>

                    {/* Data Pagamento */}
                    <td style={tdStyle}>
                      <span style={{ whiteSpace: 'nowrap', color: m.data_pagamento ? '#374151' : '#d1d5db' }}>
                        {formatDate(m.data_pagamento)}
                      </span>
                    </td>

                    {/* Descrição */}
                    <td style={{ ...tdStyle, maxWidth: '200px' }}>
                      <div style={{ fontWeight: 500, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {/* Destaca o texto buscado */}
                        {filtroBusca
                          ? (() => {
                              const idx2 = m.descricao.toLowerCase().indexOf(filtroBusca.toLowerCase())
                              if (idx2 === -1) return m.descricao
                              return <>
                                {m.descricao.slice(0, idx2)}
                                <mark style={{ background: '#fef08a', borderRadius: '2px', padding: '0 1px' }}>
                                  {m.descricao.slice(idx2, idx2 + filtroBusca.length)}
                                </mark>
                                {m.descricao.slice(idx2 + filtroBusca.length)}
                              </>
                            })()
                          : m.descricao
                        }
                      </div>
                    </td>

                    {/* Tipo */}
                    <td style={tdStyle}>
                      <span style={{ color: corTipo(m.tipo), fontWeight: 600, whiteSpace: 'nowrap' }}>{m.tipo}</span>
                    </td>

                    {/* Categoria */}
                    <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{catNome(m.categoria_id)}</td>

                    {/* Valor */}
                    <td style={{ ...tdStyle, fontWeight: 700, color: corTipo(m.tipo), whiteSpace: 'nowrap' }}>
                      {m.tipo === 'Despesa' ? '− ' : m.tipo === 'Receita' ? '+ ' : ''}{formatCurrency(Number(m.valor))}
                    </td>

                    {/* Método */}
                    <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                      {m.cartao_id
                        ? <span style={{ color: '#f59e0b', fontWeight: 500 }}>Crédito</span>
                        : m.metodo_pagamento || '—'
                      }
                    </td>

                    {/* Cartão / Conta */}
                    <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                      {m.cartao_id
                        ? <span>{cartaoNome(m.cartao_id) || '—'}</span>
                        : <span style={{ color: '#0891b2', fontSize: '12px' }}>{m.conta_origem_destino || m.metodo_pagamento || '—'}</span>
                      }
                    </td>

                    {/* Parcela */}
                    <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{m.numero_parcela || '—'}</td>

                    {/* Situação */}
                    <td style={tdStyle}>
                      <span style={{
                        background: corSituacao(m.situacao).bg,
                        color: corSituacao(m.situacao).color,
                        padding: '2px 8px', borderRadius: '99px', fontSize: '11px', fontWeight: 600, whiteSpace: 'nowrap'
                      }}>
                        {m.situacao}
                      </span>
                    </td>

                    {/* Ações */}
                    <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                      <button onClick={() => abrirEdicao(m)} style={btnIcone} title='Editar'>✏️</button>
                      <button onClick={() => setExcluindo(m)} style={{ ...btnIcone, marginLeft: '4px' }} title='Excluir'>🗑️</button>
                    </td>

                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Rodapé da tabela */}
        {!loading && movimentacoesFiltradas.length > 0 && (
          <div style={{ padding: '10px 16px', borderTop: '1px solid #f3f4f6', color: '#9ca3af', fontSize: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>{movimentacoesFiltradas.length} lançamento{movimentacoesFiltradas.length !== 1 ? 's' : ''}</span>
            {movimentacoesFiltradas.length < todasMovimentacoes.length && (
              <span style={{ color: '#f59e0b', fontWeight: 500 }}>
                ⚡ {todasMovimentacoes.length - movimentacoesFiltradas.length} oculto{todasMovimentacoes.length - movimentacoesFiltradas.length !== 1 ? 's' : ''} pelos filtros
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── Modal Edição ───────────────────────────────────────────────────────── */}
      {editando && (
        <Modal titulo='Editar Lançamento' onClose={fecharEdicao}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>

            <Campo label='Descrição' style={{ gridColumn: '1 / -1' }}>
              <input style={inputStyle} value={editForm.descricao || ''} onChange={e => setEditForm(f => ({ ...f, descricao: e.target.value }))} />
            </Campo>

            <Campo label='Data Movimentação'>
              <input type='date' style={inputStyle} value={editForm.data_movimentacao || ''} onChange={e => setEditForm(f => ({ ...f, data_movimentacao: e.target.value }))} />
            </Campo>

            <Campo label='Data Pagamento'>
              <input type='date' style={inputStyle} value={editForm.data_pagamento || ''} onChange={e => setEditForm(f => ({ ...f, data_pagamento: e.target.value }))} />
            </Campo>

            <Campo label='Valor'>
              <input type='number' step='0.01' style={inputStyle} value={editForm.valor || ''} onChange={e => setEditForm(f => ({ ...f, valor: Number(e.target.value) }))} />
            </Campo>

            <Campo label='Tipo'>
              <select style={inputStyle} value={editForm.tipo || ''} onChange={e => setEditForm(f => ({ ...f, tipo: e.target.value }))}>
                {['Despesa','Receita','Transferência'].map(t => <option key={t}>{t}</option>)}
              </select>
            </Campo>

            <Campo label='Categoria'>
              <select style={inputStyle} value={editForm.categoria_id || ''} onChange={e => setEditForm(f => ({ ...f, categoria_id: Number(e.target.value) || null }))}>
                <option value=''>— Selecione —</option>
                {categorias.filter(c => !editForm.tipo || (editForm.tipo === 'Receita' ? ['Renda Ativa', 'Renda Passiva'].includes(c.classificacao) : !['Renda Ativa', 'Renda Passiva'].includes(c.classificacao))).map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </Campo>

            <Campo label='Situação'>
              <select style={inputStyle} value={editForm.situacao || ''} onChange={e => setEditForm(f => ({ ...f, situacao: e.target.value }))}>
                {SITUACOES.map(s => <option key={s}>{s}</option>)}
              </select>
            </Campo>

            <Campo label='Método de Pagamento'>
              <select style={inputStyle} value={editForm.metodo_pagamento || ''} onChange={e => setEditForm(f => ({ ...f, metodo_pagamento: e.target.value }))}>
                <option value=''>— Selecione —</option>
                {METODOS_TODOS.map(m => <option key={m}>{m}</option>)}
              </select>
            </Campo>

            {editForm.metodo_pagamento === 'Cartão de Crédito' && (
              <Campo label='Cartão'>
                <select style={inputStyle} value={editForm.cartao_id || ''} onChange={e => setEditForm(f => ({ ...f, cartao_id: Number(e.target.value) || null }))}>
                  <option value=''>— Selecione —</option>
                  {cartoes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </Campo>
            )}

            <Campo label='Conta / Origem-Destino'>
              <select style={inputStyle} value={editForm.conta_origem_destino || ''} onChange={e => setEditForm(f => ({ ...f, conta_origem_destino: e.target.value }))}>
                <option value=''>— Selecione —</option>
                {contas.map(c => <option key={c.id} value={c.nome}>{c.nome}</option>)}
              </select>
            </Campo>

          </div>

          {erro && <p style={{ color: '#991b1b', fontSize: '13px', marginTop: '8px' }}>{erro}</p>}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
            <button onClick={fecharEdicao} style={btnSecundario}>Cancelar</button>
            <button onClick={salvarEdicao} disabled={saving} style={btnPrimario}>
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </Modal>
      )}

      {/* ── Modal Parcelas ────────────────────────────────────────────────────── */}
      {modalParcelas && (
        <Modal titulo='Lançamento Parcelado' onClose={() => setModalParcelas(null)}>
          <p style={{ color: '#374151', fontSize: '14px', marginBottom: '20px' }}>
            Este lançamento faz parte de um grupo de parcelas.<br />
            O que você deseja fazer?
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <button
              onClick={() => salvarMovimentacao(modalParcelas.mov.id, modalParcelas.form, 'esta', modalParcelas.mov.grupo_id, modalParcelas.mov.data_movimentacao)}
              disabled={saving}
              style={{ ...btnPrimario, justifyContent: 'flex-start', padding: '12px 16px' }}
            >
              ✏️ Editar somente esta parcela
            </button>
            <button
              onClick={() => salvarMovimentacao(modalParcelas.mov.id, modalParcelas.form, 'proximas', modalParcelas.mov.grupo_id, modalParcelas.mov.data_movimentacao)}
              disabled={saving}
              style={{ ...btnSecundario, justifyContent: 'flex-start', padding: '12px 16px' }}
            >
              ⏩ Editar esta e todas as próximas parcelas
            </button>
            <button
              onClick={() => setModalParcelas(null)}
              style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', padding: '8px', textAlign: 'center', fontSize: '13px' }}
            >
              Cancelar
            </button>
          </div>
        </Modal>
      )}

      {/* ── Modal Confirmar Exclusão ──────────────────────────────────────────── */}
      {excluindo && (
        <Modal titulo='Confirmar Exclusão' onClose={() => setExcluindo(null)}>
          <p style={{ color: '#374151', fontSize: '14px' }}>
            Tem certeza que deseja excluir o lançamento:
          </p>
          <div style={{ background: '#fee2e2', borderRadius: '8px', padding: '12px', margin: '12px 0' }}>
            <strong style={{ color: '#991b1b' }}>{excluindo.descricao}</strong>
            <div style={{ color: '#9ca3af', fontSize: '13px', marginTop: '4px' }}>
              {formatDate(excluindo.data_movimentacao)} · {formatCurrency(Number(excluindo.valor))}
            </div>
          </div>
          <p style={{ color: '#9ca3af', fontSize: '12px' }}>Esta ação não pode ser desfeita.</p>
          {excluindo.grupo_id && (
            <p style={{ color: '#92400e', fontSize: '12px', background: '#fef3c7', padding: '8px', borderRadius: '6px' }}>
              ⚠️ Este lançamento faz parte de um grupo parcelado. Escolha abaixo excluir só esta parcela ou todas as pendentes do grupo.
            </p>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px', flexWrap: 'wrap' }}>
            <button onClick={() => setExcluindo(null)} style={btnSecundario}>Cancelar</button>
            <button onClick={() => confirmarExclusao('esta')} disabled={saving} style={{ ...btnPrimario, background: '#dc2626' }}>
              {saving ? 'Excluindo...' : 'Excluir só esta'}
            </button>
            {excluindo.grupo_id && (
              <button onClick={() => confirmarExclusao('todas')} disabled={saving} style={{ ...btnPrimario, background: '#7f1d1d' }}>
                {saving ? 'Excluindo...' : 'Excluir todas pendentes'}
              </button>
            )}
          </div>
        </Modal>
      )}

    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function CardTotal({ label, valor, cor, bg }: { label: string; valor: number; cor: string; bg: string }) {
  return (
    <div style={{ background: bg, borderRadius: '12px', padding: '16px 20px' }}>
      <div style={{ fontSize: '12px', fontWeight: 600, color: cor, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: '22px', fontWeight: 700, color: cor, marginTop: '4px' }}>
        {valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
      </div>
    </div>
  )
}

function Modal({ titulo, onClose, children }: { titulo: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: '16px'
    }}>
      <div style={{
        background: '#fff', borderRadius: '16px', padding: '24px',
        width: '100%', maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#111827' }}>{titulo}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#9ca3af', lineHeight: 1 }}>×</button>
        </div>
        {children}
      </div>
    </div>
  )
}

function Campo({ label, children, style }: { label: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={style}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  )
}

// ─── Shared styles ────────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '11px', fontWeight: 600, color: '#6b7280',
  textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px'
}

const selectStyle: React.CSSProperties = {
  border: '1px solid #d1d5db', borderRadius: '8px', padding: '7px 10px',
  fontSize: '13px', background: '#fff', color: '#111827', cursor: 'pointer', height: '38px'
}

const inputStyle: React.CSSProperties = {
  width: '100%', border: '1px solid #d1d5db', borderRadius: '8px',
  padding: '8px 10px', fontSize: '13px', color: '#111827', background: '#fff',
  boxSizing: 'border-box'
}

const tdStyle: React.CSSProperties = {
  padding: '10px 12px', color: '#374151', verticalAlign: 'middle'
}

const btnPrimario: React.CSSProperties = {
  background: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px',
  padding: '9px 18px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
  display: 'flex', alignItems: 'center', gap: '6px'
}

const btnSecundario: React.CSSProperties = {
  background: '#fff', color: '#374151', border: '1px solid #d1d5db',
  borderRadius: '8px', padding: '9px 18px', fontSize: '13px', fontWeight: 600,
  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'
}

const btnIcone: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer', fontSize: '15px',
  padding: '4px', borderRadius: '4px', opacity: 0.7
}

const badgeFiltro: React.CSSProperties = {
  display: 'inline-block', background: '#2563eb', color: '#fff',
  borderRadius: '99px', fontSize: '9px', fontWeight: 700,
  padding: '1px 5px', marginLeft: '4px', verticalAlign: 'middle'
}
