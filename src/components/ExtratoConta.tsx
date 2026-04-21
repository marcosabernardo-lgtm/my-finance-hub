import { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Conta {
  id: number
  nome: string
  saldo_inicial: number
  data_inicial: string | null
}

interface Lancamento {
  id: number
  data_movimentacao: string
  data_pagamento: string | null
  categoria_id: number | null
  descricao: string
  valor: number
  tipo: string
  situacao: string
  metodo_pagamento: string | null
  numero_parcela: string | null
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

export default function ExtratoConta() {
  const { user } = useAuth()
  const [householdId, setHouseholdId] = useState<string | null>(null)

  const hoje = new Date()
  const [contas, setContas] = useState<Conta[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])

  const [contaId, setContaId] = useState<string>('')
  const [filtroMes, setFiltroMes] = useState(hoje.getMonth() + 1)
  const [filtroAno, setFiltroAno] = useState(hoje.getFullYear())
  const [filtroTipo, setFiltroTipo] = useState<'Receita' | 'Despesa' | 'Transferência' | ''>('')

  const [lancamentosMes, setLancamentosMes] = useState<Lancamento[]>([])
  const [saldoAnterior, setSaldoAnterior] = useState(0)
  const [loading, setLoading] = useState(false)

  // ── Conferidos — apenas estado local, sem salvar no banco ──────────────────
  const [conferidos, setConferidos] = useState<Set<number>>(new Set())

  const toggleConferido = (id: number) => {
    setConferidos(prev => {
      const novo = new Set(prev)
      if (novo.has(id)) novo.delete(id)
      else novo.add(id)
      return novo
    })
  }

  const anos = Array.from({ length: 5 }, (_, i) => hoje.getFullYear() - 2 + i)

  const contaAtual = useMemo(
    () => contas.find(c => String(c.id) === contaId) || null,
    [contas, contaId]
  )

  // ── Household ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return
    supabase.from('households').select('id').eq('owner_id', user.id).single()
      .then(({ data }) => { if (data) setHouseholdId(data.id) })
  }, [user])

  // ── Contas + Categorias ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!householdId) return
    supabase.from('contas').select('id, nome, saldo_inicial, data_inicial')
      .eq('household_id', householdId).eq('ativo', true).order('nome')
      .then(({ data }) => {
        const lista = data || []
        setContas(lista)
        if (lista.length > 0) setContaId(String(lista[0].id))
      })
    supabase.from('categorias').select('id, nome')
      .eq('household_id', householdId).order('nome')
      .then(({ data }) => setCategorias(data || []))
  }, [householdId])

  // ── Busca dados ─────────────────────────────────────────────────────────────
  const fetchExtrato = useCallback(async () => {
    if (!householdId || !contaId) return
    setLoading(true)
    // Limpa conferidos ao mudar de mês/conta
    setConferidos(new Set())

    const mesStr = String(filtroMes).padStart(2, '0')
    const dataInicio = `${filtroAno}-${mesStr}-01`
    const ultimoDia = new Date(filtroAno, filtroMes, 0).getDate()
    const dataFim = `${filtroAno}-${mesStr}-${ultimoDia}`

    // Query 1 — lançamentos do mês selecionado
    const { data: dadosMes } = await supabase
      .from('movimentacoes')
      .select('id, data_movimentacao, data_pagamento, categoria_id, descricao, valor, tipo, situacao, metodo_pagamento, numero_parcela')
      .eq('household_id', householdId)
      .eq('conta_origem_destino', contaAtual?.nome ?? '')
      .in('situacao', ['Pago', 'Pendente'])
      .gte('data_movimentacao', dataInicio)
      .lte('data_movimentacao', dataFim)
      .order('data_movimentacao', { ascending: true })
      .order('id', { ascending: true })

    setLancamentosMes(dadosMes || [])

    // Query 2 — saldo acumulado até o início do mês (lançamentos Pagos anteriores)
    const contaInfo = contas.find(c => String(c.id) === contaId)
    const dataInicialConta = contaInfo?.data_inicial ?? null
    const saldoBase = contaInfo?.saldo_inicial ?? 0

    if (dataInicialConta) {
      const { data: anteriores } = await supabase
        .from('movimentacoes')
        .select('valor, tipo')
        .eq('household_id', householdId)
        .eq('conta_origem_destino', contaInfo?.nome ?? '')
        .eq('situacao', 'Pago')
        .gte('data_movimentacao', dataInicialConta)
        .lt('data_movimentacao', dataInicio)

      const anterior = anteriores || []
      const entradas = anterior.filter(m => m.tipo === 'Receita').reduce((s, m) => s + Number(m.valor), 0)
      const saidas   = anterior.filter(m => m.tipo === 'Despesa' || m.tipo === 'Transferência').reduce((s, m) => s + Number(m.valor), 0)
      setSaldoAnterior(saldoBase + entradas - saidas)
    } else {
      setSaldoAnterior(saldoBase)
    }

    setLoading(false)
  }, [householdId, contaId, filtroMes, filtroAno, contaAtual, contas])

  useEffect(() => { fetchExtrato() }, [fetchExtrato])

  // ── Filtragem local por tipo ─────────────────────────────────────────────────
  const lancamentosFiltrados = useMemo(() => {
    if (!filtroTipo) return lancamentosMes
    return lancamentosMes.filter(l => l.tipo === filtroTipo)
  }, [lancamentosMes, filtroTipo])

  // ── Totais do mês ────────────────────────────────────────────────────────────
  const entradasMes = useMemo(() =>
    lancamentosMes.filter(l => l.tipo === 'Receita' && l.situacao === 'Pago')
      .reduce((s, l) => s + Number(l.valor), 0),
    [lancamentosMes]
  )

  const saidasMes = useMemo(() =>
    lancamentosMes.filter(l => (l.tipo === 'Despesa' || l.tipo === 'Transferência') && l.situacao === 'Pago')
      .reduce((s, l) => s + Number(l.valor), 0),
    [lancamentosMes]
  )

  const pendentesMes = useMemo(() =>
    lancamentosMes.filter(l => l.situacao === 'Pendente')
      .reduce((s, l) => s + Number(l.valor), 0),
    [lancamentosMes]
  )

  const saldoFinal = saldoAnterior + entradasMes - saidasMes

  const totalTabelaFiltrada = useMemo(() =>
    lancamentosFiltrados.reduce((s, l) => {
      const v = Number(l.valor)
      return s + (l.tipo === 'Receita' ? v : -v)
    }, 0),
    [lancamentosFiltrados]
  )

  // ── Total conferido ──────────────────────────────────────────────────────────
  const totalConferido = useMemo(() =>
    lancamentosFiltrados
      .filter(l => conferidos.has(l.id))
      .reduce((s, l) => {
        const v = Number(l.valor)
        return s + (l.tipo === 'Receita' ? v : -v)
      }, 0),
    [lancamentosFiltrados, conferidos]
  )

  const catNome = (id: number | null) =>
    id ? (categorias.find(c => c.id === id)?.nome || '—') : '—'

  const corSituacao = (s: string) =>
    s === 'Pago'
      ? { bg: '#d1fae5', color: '#065f46' }
      : { bg: '#fef3c7', color: '#92400e' }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ fontFamily: "'Segoe UI', system-ui, sans-serif", padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>

      {/* Header */}
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#111827', margin: 0 }}>Extrato da Conta</h1>
        <p style={{ color: '#6b7280', marginTop: '4px', fontSize: '13px' }}>
          Movimentações por conta bancária — entradas, saídas e saldo do período
        </p>
      </div>

      {/* ── Filtros ─────────────────────────────────────────────────────────── */}
      <div style={{
        background: '#ede8df', border: '1px solid #e5e7eb', borderRadius: '12px',
        padding: '16px 20px', marginBottom: '20px',
        display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-end'
      }}>

        <div style={{ flex: '1 1 200px' }}>
          <label style={labelStyle}>Conta</label>
          <select value={contaId} onChange={e => setContaId(e.target.value)} style={{ ...selectStyle, width: '100%' }}>
            {contas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </div>

        <div>
          <label style={labelStyle}>Mês</label>
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
          <label style={labelStyle}>Tipo</label>
          <div style={{ display: 'flex', gap: '6px' }}>
            {(['', 'Receita', 'Despesa', 'Transferência'] as const).map(t => (
              <button
                key={t}
                onClick={() => setFiltroTipo(t)}
                style={{
                  padding: '0 14px', borderRadius: '6px', fontSize: '13px',
                  fontWeight: 600, cursor: 'pointer', height: '38px',
                  border: filtroTipo === t ? 'none' : '1px solid #d1d5db',
                  background: filtroTipo === t
                    ? t === '' ? '#2563eb' : t === 'Receita' ? '#065f46' : t === 'Despesa' ? '#991b1b' : '#92400e'
                    : '#fff',
                  color: filtroTipo === t ? '#fff' : '#374151',
                }}
              >
                {t === '' ? 'Todos' : t}
              </button>
            ))}
          </div>
        </div>

      </div>

      {/* ── Cards ─────────────────────────────────────────────────────────────── */}
      {contaAtual && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '14px', marginBottom: '20px' }}>

          <CardInfo
            label='Saldo Anterior'
            valor={fmt(saldoAnterior)}
            sub={`Até ${MESES[filtroMes - 2] || 'início'} ${filtroAno}`}
            corValor={saldoAnterior >= 0 ? '#1e40af' : '#991b1b'}
            bg={saldoAnterior >= 0 ? '#dbeafe' : '#fee2e2'}
          />

          <CardInfo
            label='Entradas'
            valor={fmt(entradasMes)}
            sub={`Receitas pagas em ${MESES[filtroMes - 1]}`}
            corValor='#065f46'
            bg='#d1fae5'
          />

          <CardInfo
            label='Saídas'
            valor={fmt(saidasMes)}
            sub={`Despesas + Pagamentos pagos em ${MESES[filtroMes - 1]}`}
            corValor='#991b1b'
            bg='#fee2e2'
          />

          <CardInfo
            label='Saldo do Mês'
            valor={fmt(saldoFinal)}
            sub='Saldo anterior + entradas − saídas'
            corValor={saldoFinal >= 0 ? '#065f46' : '#991b1b'}
            bg={saldoFinal >= 0 ? '#d1fae5' : '#fee2e2'}
          />

          {pendentesMes > 0 && (
            <CardInfo
              label='Pendentes'
              valor={fmt(pendentesMes)}
              sub='Ainda não pagos no mês'
              corValor='#92400e'
              bg='#fef3c7'
              destaque
            />
          )}

        </div>
      )}

      {/* ── Tabela ──────────────────────────────────────────────────────────── */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden' }}>

        <div style={{
          padding: '12px 16px', borderBottom: '1px solid #f3f4f6', background: '#ede8df',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
          <span style={{ fontSize: '13px', fontWeight: 600, color: '#374151' }}>
            Lançamentos — {MESES[filtroMes - 1]} {filtroAno}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {conferidos.size > 0 && (
              <span style={{
                fontSize: '12px', color: '#065f46', fontWeight: 600,
                background: '#d1fae5', padding: '3px 10px', borderRadius: '99px'
              }}>
                ✅ {conferidos.size} conferido{conferidos.size !== 1 ? 's' : ''} — {fmt(Math.abs(totalConferido))}
              </span>
            )}
            <span style={{ fontSize: '12px', color: '#9ca3af' }}>
              Filtrado por data de movimentação
            </span>
          </div>
        </div>

        {loading ? (
          <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af' }}>Carregando...</div>
        ) : lancamentosFiltrados.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af' }}>
            {!contaId
              ? 'Selecione uma conta para ver o extrato.'
              : `Nenhum lançamento encontrado para ${MESES[filtroMes - 1]} ${filtroAno}.`}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#ede8df', borderBottom: '1px solid #e5e7eb' }}>
                  {/* Coluna do check */}
                  <th style={{ padding: '10px 12px', width: '40px' }}>
                    <span title="Conferir lançamentos" style={{ fontSize: '12px', color: '#9ca3af' }}>✓</span>
                  </th>
                  {['Data','Categoria','Descrição','Tipo','Valor','Situação'].map(h => (
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
                {lancamentosFiltrados.map((l, idx) => {
                  const conferido = conferidos.has(l.id)
                  return (
                    <tr
                      key={l.id}
                      style={{
                        borderBottom: '1px solid #f3f4f6',
                        background: conferido
                          ? '#f0fdf4'
                          : idx % 2 === 0 ? '#fff' : '#fafafa',
                        transition: 'background 0.2s',
                        opacity: conferido ? 0.75 : 1,
                      }}
                    >
                      {/* Checkbox de conferência */}
                      <td style={{ padding: '10px 12px', textAlign: 'center', verticalAlign: 'middle' }}>
                        <div
                          onClick={() => toggleConferido(l.id)}
                          title={conferido ? 'Desmarcar' : 'Marcar como conferido'}
                          style={{
                            width: '20px', height: '20px', borderRadius: '5px', cursor: 'pointer',
                            border: `2px solid ${conferido ? '#16a34a' : '#d1d5db'}`,
                            background: conferido ? '#16a34a' : '#fff',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            margin: '0 auto', transition: 'all 0.15s',
                          }}
                        >
                          {conferido && <span style={{ color: '#fff', fontSize: '12px', fontWeight: 700, lineHeight: 1 }}>✓</span>}
                        </div>
                      </td>

                      <td style={tdStyle}>{fmtDate(l.data_movimentacao)}</td>
                      <td style={{ ...tdStyle, color: '#6b7280' }}>{catNome(l.categoria_id)}</td>
                      <td style={{ ...tdStyle, maxWidth: '260px' }}>
                        <div style={{
                          fontWeight: 500,
                          color: conferido ? '#6b7280' : '#111827',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          textDecoration: conferido ? 'line-through' : 'none',
                        }}>
                          {l.descricao}
                        </div>
                      </td>
                      <td style={tdStyle}>
                        <span style={{
                          padding: '2px 8px', borderRadius: '99px',
                          fontSize: '11px', fontWeight: 600, whiteSpace: 'nowrap',
                          background: l.tipo === 'Receita' ? '#d1fae5' : '#fee2e2',
                          color: l.tipo === 'Receita' ? '#065f46' : '#991b1b',
                        }}>
                          {l.tipo}
                        </span>
                      </td>
                      <td style={{
                        ...tdStyle, textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap',
                        color: conferido ? '#6b7280' : l.tipo === 'Receita' ? '#065f46' : '#991b1b'
                      }}>
                        {l.tipo === 'Receita' ? '+' : '−'} {fmt(Number(l.valor))}
                      </td>
                      <td style={tdStyle}>
                        <span style={{
                          ...corSituacao(l.situacao),
                          padding: '2px 8px', borderRadius: '99px',
                          fontSize: '11px', fontWeight: 600, whiteSpace: 'nowrap'
                        }}>
                          {l.situacao}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: '#ede8df', borderTop: '2px solid #e5e7eb' }}>
                  <td />
                  <td colSpan={3} style={{ padding: '10px 12px', fontWeight: 700, color: '#374151', fontSize: '13px' }}>
                    Total {filtroTipo ? `(${filtroTipo})` : '(Todos)'}
                    <span style={{ fontWeight: 400, color: '#9ca3af', marginLeft: '8px', fontSize: '12px' }}>
                      {lancamentosFiltrados.length} lançamento{lancamentosFiltrados.length !== 1 ? 's' : ''}
                    </span>
                  </td>
                  <td />
                  <td style={{
                    padding: '10px 12px', textAlign: 'right', fontWeight: 700, fontSize: '14px', whiteSpace: 'nowrap',
                    color: totalTabelaFiltrada >= 0 ? '#065f46' : '#991b1b'
                  }}>
                    {totalTabelaFiltrada >= 0 ? '+' : ''}{fmt(totalTabelaFiltrada)}
                  </td>
                  <td />
                </tr>
                {conferidos.size > 0 && (
                  <tr style={{ background: '#f0fdf4', borderTop: '1px solid #bbf7d0' }}>
                    <td />
                    <td colSpan={3} style={{ padding: '8px 12px', fontWeight: 700, color: '#065f46', fontSize: '12px' }}>
                      ✅ Conferido ({conferidos.size} lançamento{conferidos.size !== 1 ? 's' : ''})
                    </td>
                    <td />
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: '#065f46', fontSize: '13px', whiteSpace: 'nowrap' }}>
                      {totalConferido >= 0 ? '+' : ''}{fmt(totalConferido)}
                    </td>
                    <td />
                  </tr>
                )}
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
  label: string; valor: string; sub: string
  corValor: string; bg: string; destaque?: boolean
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
          background: '#92400e', color: '#fff', fontSize: '9px',
          fontWeight: 700, padding: '2px 6px', borderRadius: '99px'
        }}>
          PENDENTE
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
