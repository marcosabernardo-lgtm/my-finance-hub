import { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Cartao {
  id: number
  nome: string
  data_fechamento: number
  data_vencimento: number
  limite_total: number
}

interface Lancamento {
  id: number
  data_movimentacao: string
  data_pagamento: string | null
  categoria_id: number | null
  descricao: string
  valor: number
  forma_pagamento: string | null
  numero_parcela: string | null
  situacao: string
}

interface Categoria {
  id: number
  nome: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const fmtDate = (d: string | null) => {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

const MESES = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'
]

// ─── Component ────────────────────────────────────────────────────────────────

export default function FaturaCartao() {
  const { user } = useAuth()
  const [householdId, setHouseholdId] = useState<string | null>(null)

  const hoje = new Date()
  const [cartoes, setCartoes] = useState<Cartao[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])

  // Filtros
  const [cartaoId, setCartaoId] = useState<string>('')
  const [filtroMes, setFiltroMes] = useState(hoje.getMonth() + 1)
  const [filtroAno, setFiltroAno] = useState(hoje.getFullYear())
  const [filtroSituacao, setFiltroSituacao] = useState<'Pendente' | 'Previsto' | ''>('')

  // Dados da tabela (filtrados por mês/ano selecionado)
  const [lancamentosMes, setLancamentosMes] = useState<Lancamento[]>([])

  // Totais globais do cartão (sem filtro de mês — limite real comprometido)
  const [totalPendenteGlobal, setTotalPendenteGlobal] = useState(0)
  const [atualizandoSituacao, setAtualizandoSituacao] = useState<number | null>(null)
  const [editandoValor, setEditandoValor] = useState<number | null>(null)
  const [valorTemp, setValorTemp] = useState('')
  const [totalPrevistoGlobal, setTotalPrevistoGlobal] = useState(0)

  const [loading, setLoading] = useState(false)

  const anos = Array.from({ length: 5 }, (_, i) => hoje.getFullYear() - 2 + i)

  const cartaoAtual = useMemo(
    () => cartoes.find(c => String(c.id) === cartaoId) || null,
    [cartoes, cartaoId]
  )

  // ── Household ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return
    supabase
      .from('households').select('id').eq('owner_id', user.id).single()
      .then(({ data }) => { if (data) setHouseholdId(data.id) })
  }, [user])

  // ── Cartões + Categorias ────────────────────────────────────────────────────
  useEffect(() => {
    if (!householdId) return
    supabase
      .from('cartoes')
      .select('id, nome, data_fechamento, data_vencimento, limite_total')
      .eq('household_id', householdId)
      .eq('ativo', true)
      .order('nome')
      .then(({ data }) => {
        const lista = data || []
        setCartoes(lista)
        if (lista.length > 0) setCartaoId(String(lista[0].id))
      })
    supabase
      .from('categorias').select('id, nome')
      .eq('household_id', householdId).order('nome')
      .then(({ data }) => setCategorias(data || []))
  }, [householdId])

  // ── Busca dados ─────────────────────────────────────────────────────────────
  const fetchFatura = useCallback(async () => {
    if (!householdId || !cartaoId) return
    setLoading(true)

    const mesStr = String(filtroMes).padStart(2, '0')
    const dataInicio = `${filtroAno}-${mesStr}-01`
    const ultimoDia = new Date(filtroAno, filtroMes, 0).getDate()
    const dataFim = `${filtroAno}-${mesStr}-${ultimoDia}`

    // Query 1 — tabela: lançamentos do mês/ano selecionado (pelo data_pagamento)
    const hoje2 = new Date()
    const isMesPassado = filtroAno < hoje2.getFullYear() ||
      (filtroAno === hoje2.getFullYear() && filtroMes < hoje2.getMonth() + 1)
    const situacoesBusca = isMesPassado
      ? ['Pendente', 'Previsto', 'Faturado']
      : ['Pendente', 'Previsto']

    const { data: dadosMes } = await supabase
      .from('movimentacoes')
      .select('id, data_movimentacao, data_pagamento, categoria_id, descricao, valor, forma_pagamento, numero_parcela, situacao')
      .eq('household_id', householdId)
      .eq('cartao_id', cartaoId)
      .in('situacao', situacoesBusca)
      .gte('data_pagamento', dataInicio)
      .lte('data_pagamento', dataFim)
      .order('data_movimentacao', { ascending: true })
      .order('id', { ascending: true })

    setLancamentosMes(dadosMes || [])

    // Query 2 — cards: TODOS os Pendentes/Previstos do cartão, sem filtro de mês
    // O Total Pendente representa o limite real já comprometido (todas as parcelas futuras)
    const { data: globais } = await supabase
      .from('movimentacoes')
      .select('valor, situacao')
      .eq('household_id', householdId)
      .eq('cartao_id', cartaoId)
      .in('situacao', ['Pendente', 'Previsto'])

    const lista = globais || []
    setTotalPendenteGlobal(
      lista.filter(m => m.situacao === 'Pendente').reduce((s, m) => s + Number(m.valor), 0)
    )
    setTotalPrevistoGlobal(
      lista.filter(m => m.situacao === 'Previsto').reduce((s, m) => s + Number(m.valor), 0)
    )

    setLoading(false)
  }, [householdId, cartaoId, filtroMes, filtroAno])

  useEffect(() => { fetchFatura() }, [fetchFatura])

  // ── Filtragem local por situação (apenas na tabela) ─────────────────────────
  const lancamentosFiltrados = useMemo(() => {
    if (!filtroSituacao) return lancamentosMes
    return lancamentosMes.filter(l => l.situacao === filtroSituacao)
  }, [lancamentosMes, filtroSituacao])

  // Total exibido no rodapé da tabela (respeita filtro de situação)
  const totalTabelaFiltrada = useMemo(() =>
    lancamentosFiltrados.reduce((s, l) => s + Number(l.valor), 0),
    [lancamentosFiltrados]
  )

  // Total da fatura do mês
  const totalFaturaMes = useMemo(() =>
    lancamentosMes.reduce((s, l) => s + Number(l.valor), 0),
    [lancamentosMes]
  )

  // Total apenas Previsto do mês selecionado
  const totalPrevistMes = useMemo(() =>
    lancamentosMes.filter(l => l.situacao === 'Previsto').reduce((s, l) => s + Number(l.valor), 0),
    [lancamentosMes]
  )

  const atualizarSituacao = async (id: number, novaSituacao: string) => {
    setAtualizandoSituacao(id)
    await supabase.from('movimentacoes').update({ situacao: novaSituacao }).eq('id', id)
    setLancamentosMes(prev => prev.map(l => l.id === id ? { ...l, situacao: novaSituacao } : l))
    setAtualizandoSituacao(null)
  }

  const salvarValor = async (id: number) => {
    const novoValor = parseFloat(valorTemp.replace(',', '.'))
    if (isNaN(novoValor) || novoValor <= 0) { setEditandoValor(null); return }
    await supabase.from('movimentacoes').update({ valor: novoValor }).eq('id', id)
    setLancamentosMes(prev => prev.map(l => l.id === id ? { ...l, valor: novoValor } : l))
    setEditandoValor(null)
  }

  // ── Cálculos dos cards (sempre globais, sem filtro de mês) ──────────────────
  const limite = cartaoAtual?.limite_total || 0
  const saldoReal = limite - totalPendenteGlobal
  const saldoSimulado = limite - totalPendenteGlobal - totalPrevistoGlobal

  // ── Helpers visuais ─────────────────────────────────────────────────────────
  const catNome = (id: number | null) =>
    id ? (categorias.find(c => c.id === id)?.nome || '—') : '—'

  const corSituacao = (s: string) =>
    s === 'Pendente'
      ? { bg: '#fef3c7', color: '#92400e' }
      : { bg: '#f3e8ff', color: '#6b21a8' }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ fontFamily: "'Segoe UI', system-ui, sans-serif", padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>

      {/* Header */}
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#111827', margin: 0 }}>Fatura do Cartão</h1>
        <p style={{ color: '#6b7280', marginTop: '4px', fontSize: '13px' }}>
          Limite comprometido considera <strong>todas as parcelas futuras</strong>, independente do mês selecionado
        </p>
      </div>

      {/* ── Filtros ─────────────────────────────────────────────────────────── */}
      <div style={{
        background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '12px',
        padding: '16px 20px', marginBottom: '20px',
        display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-end'
      }}>

        <div style={{ flex: '1 1 200px' }}>
          <label style={labelStyle}>Cartão</label>
          <select value={cartaoId} onChange={e => setCartaoId(e.target.value)} style={{ ...selectStyle, width: '100%' }}>
            {cartoes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </div>

        <div>
          <label style={labelStyle}>Mês Pagamento</label>
          <select value={filtroMes} onChange={e => setFiltroMes(Number(e.target.value))} style={selectStyle}>
            {MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
        </div>

        <div>
          <label style={labelStyle}>Ano</label>
          <select value={filtroAno} onChange={e => setFiltroAno(Number(e.target.value))} style={selectStyle}>
            {anos.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>

        <div>
          <label style={labelStyle}>Situação</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            {(['', 'Pendente', 'Previsto'] as const).map(s => (
              <button
                key={s}
                onClick={() => setFiltroSituacao(s)}
                style={{
                  padding: '7px 14px', borderRadius: '8px', fontSize: '12px',
                  fontWeight: 600, cursor: 'pointer', height: '38px',
                  border: filtroSituacao === s ? 'none' : '1px solid #d1d5db',
                  background: filtroSituacao === s
                    ? s === '' ? '#2563eb' : s === 'Pendente' ? '#92400e' : '#6b21a8'
                    : '#fff',
                  color: filtroSituacao === s ? '#fff' : '#374151',
                }}
              >
                {s === '' ? 'Todos' : s}
              </button>
            ))}
          </div>
        </div>

      </div>

      {/* ── Cards (totais globais do cartão) ─────────────────────────────────── */}
      {cartaoAtual && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '14px', marginBottom: '20px' }}>

          <CardInfo
            label={`Total Fatura — ${MESES[filtroMes - 1]}`}
            valor={fmt(totalFaturaMes)}
            sub={`${lancamentosMes.length} lançamento${lancamentosMes.length !== 1 ? 's' : ''} no mês`}
            corValor='#1d4ed8'
            bg='#eff6ff'
          />
          <CardInfo
            label='Total Pendente'
            valor={fmt(totalPendenteGlobal)}
            sub='Todas as parcelas futuras'
            corValor='#92400e'
            bg='#fef3c7'
          />

          <CardInfo
            label='Total Previsto'
            valor={fmt(totalPrevistMes)}
            sub={`Mês ${MESES[filtroMes - 1]} — não consome limite`}
            corValor='#6b21a8'
            bg='#f3e8ff'
          />

          <CardInfo
            label='Limite do Cartão'
            valor={fmt(limite)}
            sub={`Vence dia ${cartaoAtual.data_vencimento} · Fecha dia ${cartaoAtual.data_fechamento}`}
            corValor='#1e40af'
            bg='#dbeafe'
          />

          <CardInfo
            label='Saldo Disponível'
            valor={fmt(saldoReal)}
            sub='Limite − Pendente (global)'
            corValor={saldoReal >= 0 ? '#065f46' : '#991b1b'}
            bg={saldoReal >= 0 ? '#d1fae5' : '#fee2e2'}
          />

          {totalPrevistoGlobal > 0 && (
            <CardInfo
              label='Saldo Simulado'
              valor={fmt(saldoSimulado)}
              sub='Limite − Pendente − Previsto'
              corValor={saldoSimulado >= 0 ? '#065f46' : '#991b1b'}
              bg={saldoSimulado >= 0 ? '#d1fae5' : '#fee2e2'}
              destaque
            />
          )}

        </div>
      )}

      {/* ── Tabela (lançamentos do mês selecionado) ──────────────────────────── */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden' }}>

        {/* Cabeçalho da tabela com contexto do mês */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #f3f4f6', background: '#f9fafb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '13px', fontWeight: 600, color: '#374151' }}>
            Lançamentos — {MESES[filtroMes - 1]} {filtroAno}
          </span>
          <span style={{ fontSize: '12px', color: '#9ca3af' }}>
            Filtrado por data de pagamento
          </span>
        </div>

        {loading ? (
          <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af' }}>Carregando...</div>
        ) : lancamentosFiltrados.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af' }}>
            {!cartaoId
              ? 'Selecione um cartão para ver a fatura.'
              : `Nenhum lançamento encontrado para ${MESES[filtroMes - 1]} ${filtroAno}.`}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                  {['Dt. Movimentação','Dt. Pagamento','Categoria','Descrição','Valor','Forma de Pgto','Nº Parcela','Situação'].map(h => (
                    <th key={h} style={{
                      padding: '10px 12px', textAlign: h === 'Valor' ? 'right' : 'left',
                      fontWeight: 600, color: '#374151', whiteSpace: 'nowrap', fontSize: '12px'
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lancamentosFiltrados.map((l, idx) => (
                  <tr key={l.id} style={{ borderBottom: '1px solid #f3f4f6', background: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                    <td style={tdStyle}>{fmtDate(l.data_movimentacao)}</td>
                    <td style={tdStyle}>{fmtDate(l.data_pagamento)}</td>
                    <td style={{ ...tdStyle, color: '#6b7280' }}>{catNome(l.categoria_id)}</td>
                    <td style={{ ...tdStyle, maxWidth: '220px' }}>
                      <div style={{ fontWeight: 500, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {l.descricao}
                      </div>
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: '#991b1b', whiteSpace: 'nowrap' }}>
                      {editandoValor === l.id ? (
                        <input
                          type="number" step="0.01" autoFocus
                          value={valorTemp}
                          onChange={e => setValorTemp(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') salvarValor(l.id); if (e.key === 'Escape') setEditandoValor(null) }}
                          onBlur={() => salvarValor(l.id)}
                          style={{ width: 90, padding: '2px 6px', borderRadius: 4, border: '1px solid #2563eb', fontSize: 12, textAlign: 'right' }}
                        />
                      ) : (
                        <span
                          onClick={() => { setEditandoValor(l.id); setValorTemp(String(Number(l.valor))) }}
                          title="Clique para editar o valor"
                          style={{ cursor: 'pointer', borderBottom: '1px dotted #991b1b' }}
                        >
                          − {fmt(Number(l.valor))}
                        </span>
                      )}
                    </td>
                    <td style={{ ...tdStyle, color: '#6b7280' }}>{l.forma_pagamento || '—'}</td>
                    <td style={{ ...tdStyle, color: '#6b7280' }}>{l.numero_parcela || '—'}</td>
                    <td style={tdStyle}>
                      <select
                        value={l.situacao}
                        disabled={atualizandoSituacao === l.id}
                        onChange={e => atualizarSituacao(l.id, e.target.value)}
                        style={{
                          ...corSituacao(l.situacao),
                          padding: '2px 8px', borderRadius: '99px',
                          fontSize: '11px', fontWeight: 600,
                          border: 'none', cursor: 'pointer', outline: 'none',
                        }}
                      >
                        <option value="Pendente">Pendente</option>
                        <option value="Previsto">Previsto</option>
                        <option value="Pago">Pago</option>
                        <option value="Faturado">Faturado</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: '#f9fafb', borderTop: '2px solid #e5e7eb' }}>
                  <td colSpan={4} style={{ padding: '10px 12px', fontWeight: 700, color: '#374151', fontSize: '13px' }}>
                    Total {filtroSituacao ? `(${filtroSituacao})` : '(Todos)'}
                    <span style={{ fontWeight: 400, color: '#9ca3af', marginLeft: '8px', fontSize: '12px' }}>
                      {lancamentosFiltrados.length} lançamento{lancamentosFiltrados.length !== 1 ? 's' : ''}
                    </span>
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: '#991b1b', fontSize: '14px', whiteSpace: 'nowrap' }}>
                    − {fmt(totalTabelaFiltrada)}
                  </td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function CardInfo({ label, valor, sub, corValor, bg, destaque }: {
  label: string
  valor: string
  sub: string
  corValor: string
  bg: string
  destaque?: boolean
}) {
  return (
    <div style={{
      background: bg, borderRadius: '12px', padding: '14px 16px',
      border: destaque ? `2px dashed ${corValor}` : 'none',
      position: 'relative'
    }}>
      {destaque && (
        <span style={{
          position: 'absolute', top: '8px', right: '8px',
          background: '#6b21a8', color: '#fff', fontSize: '9px',
          fontWeight: 700, padding: '2px 6px', borderRadius: '99px'
        }}>
          SIMULAÇÃO
        </span>
      )}
      <div style={{ fontSize: '11px', fontWeight: 600, color: corValor, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </div>
      <div style={{ fontSize: '20px', fontWeight: 700, color: corValor, marginTop: '4px', marginBottom: '4px' }}>
        {valor}
      </div>
      <div style={{ fontSize: '11px', color: corValor, opacity: 0.7 }}>{sub}</div>
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '11px', fontWeight: 600, color: '#6b7280',
  textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px'
}

const selectStyle: React.CSSProperties = {
  border: '1px solid #d1d5db', borderRadius: '8px', padding: '7px 10px',
  fontSize: '13px', background: '#fff', color: '#111827', cursor: 'pointer', height: '38px'
}

const tdStyle: React.CSSProperties = {
  padding: '10px 12px', color: '#374151', verticalAlign: 'middle'
}
