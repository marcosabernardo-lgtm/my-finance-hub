import { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

interface Movimentacao {
  id: number
  tipo: string
  situacao: string
  descricao: string
  valor: number
  data_movimentacao: string
  metodo_pagamento: string | null
  cartao_id: number | null
  categoria_id: number | null
  categorias?: { nome: string }
}

// Calcula semana do mês (1 a 6)
function semanaDomes(data: Date): number {
  const primeiroDia = new Date(data.getFullYear(), data.getMonth(), 1)
  return Math.ceil((data.getDate() + primeiroDia.getDay()) / 7)
}

function corTipo(tipo: string): string {
  if (tipo === 'Receita')      return '#16a34a'
  if (tipo === 'Despesa')      return '#e05252'
  if (tipo === 'Transferência') return '#6b7280'
  return '#6b7280'
}

function corSituacao(sit: string): { bg: string; color: string } {
  if (sit === 'Pago')     return { bg: '#dcfce7', color: '#16a34a' }
  if (sit === 'Faturado') return { bg: '#dbeafe', color: '#1d4ed8' }
  if (sit === 'Pendente') return { bg: '#fef3c7', color: '#d97706' }
  if (sit === 'Previsto') return { bg: '#f3e8ff', color: '#7c3aed' }
  return { bg: '#f3f4f6', color: '#6b7280' }
}

// ─── Card de movimentação ─────────────────────────────────────────────────────
function CardMov({ m }: { m: Movimentacao }) {
  const sit = corSituacao(m.situacao)
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '9px 12px',
      background: '#fff',
      borderRadius: 8,
      border: '1px solid #e2e8f0',
      borderLeft: `3px solid ${corTipo(m.tipo)}`,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#1a2332', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {m.descricao}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
          {m.categorias?.nome && (
            <span style={{ fontSize: 10, color: '#6b7a8d', background: '#f1f5f9', borderRadius: 4, padding: '1px 6px' }}>
              {m.categorias.nome}
            </span>
          )}
          <span style={{ fontSize: 10, fontWeight: 700, background: sit.bg, color: sit.color, borderRadius: 4, padding: '1px 6px' }}>
            {m.situacao}
          </span>
          {m.metodo_pagamento && (
            <span style={{ fontSize: 10, color: '#9ca3af' }}>{m.metodo_pagamento}</span>
          )}
        </div>
      </div>
      <div style={{
        fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap',
        color: m.tipo === 'Receita' ? '#16a34a' : m.tipo === 'Despesa' ? '#e05252' : '#6b7280'
      }}>
        {m.tipo === 'Despesa' ? '-' : m.tipo === 'Receita' ? '+' : ''}{fmt(Number(m.valor))}
      </div>
    </div>
  )
}

// ─── Célula do dia ────────────────────────────────────────────────────────────
function CelulaDia({
  dia, movs, semana, isHoje, isMesAtual
}: {
  dia: number
  movs: Movimentacao[]
  semana: number
  isHoje: boolean
  isMesAtual: boolean
}) {
  const [aberto, setAberto] = useState(false)

  const receitas  = movs.filter(m => m.tipo === 'Receita').reduce((s, m) => s + Number(m.valor), 0)
  const despesas  = movs.filter(m => m.tipo === 'Despesa').reduce((s, m) => s + Number(m.valor), 0)
  const temMovs   = movs.length > 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column' as const }}>
      {/* Cabeçalho do dia */}
      <div
        onClick={() => temMovs && setAberto(a => !a)}
        style={{
          minHeight: 90,
          padding: '8px 10px',
          background: isHoje
            ? '#0d7280'
            : aberto
            ? '#f0f9ff'
            : isMesAtual ? '#fff' : '#f8f9fa',
          border: isHoje
            ? '2px solid #0d7280'
            : aberto
            ? '2px solid #0d7280'
            : '1px solid #e2e8f0',
          borderRadius: aberto ? '10px 10px 0 0' : 10,
          cursor: temMovs ? 'pointer' : 'default',
          transition: 'all 0.15s',
          position: 'relative' as const,
        }}
      >
        {/* Número do dia + semana */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
          <div style={{
            width: 28, height: 28, borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 700,
            background: isHoje ? 'rgba(255,255,255,0.2)' : 'transparent',
            color: isHoje ? '#fff' : isMesAtual ? '#1a2332' : '#c0c4cc',
          }}>
            {dia}
          </div>
          {isMesAtual && (
            <span style={{
              fontSize: 9, fontWeight: 700, color: isHoje ? 'rgba(255,255,255,0.7)' : '#9ca3af',
              background: isHoje ? 'rgba(255,255,255,0.15)' : '#f1f5f9',
              borderRadius: 4, padding: '1px 5px',
            }}>
              S{semana}
            </span>
          )}
        </div>

        {/* Resumo de valores */}
        {temMovs && (
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 2 }}>
            {receitas > 0 && (
              <div style={{ fontSize: 10, fontWeight: 700, color: isHoje ? '#a7f3d0' : '#16a34a' }}>
                +{fmt(receitas)}
              </div>
            )}
            {despesas > 0 && (
              <div style={{ fontSize: 10, fontWeight: 700, color: isHoje ? '#fca5a5' : '#e05252' }}>
                -{fmt(despesas)}
              </div>
            )}
            <div style={{
              fontSize: 9, color: isHoje ? 'rgba(255,255,255,0.6)' : '#9ca3af', marginTop: 1
            }}>
              {movs.length} mov.
            </div>
          </div>
        )}

        {/* Indicador de expansão */}
        {temMovs && (
          <div style={{
            position: 'absolute' as const, bottom: 4, right: 6,
            fontSize: 10, color: isHoje ? 'rgba(255,255,255,0.5)' : '#c0c4cc'
          }}>
            {aberto ? '▲' : '▼'}
          </div>
        )}
      </div>

      {/* Painel expandido */}
      {aberto && (
        <div style={{
          background: '#f8fafc',
          border: '2px solid #0d7280',
          borderTop: 'none',
          borderRadius: '0 0 10px 10px',
          padding: '10px 10px 12px',
          display: 'flex', flexDirection: 'column' as const, gap: 6,
          zIndex: 10,
          boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7a8d', marginBottom: 4, textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>
            {movs.length} movimentação{movs.length !== 1 ? 'ões' : ''}
          </div>
          {movs
            .sort((a, b) => a.tipo.localeCompare(b.tipo))
            .map(m => <CardMov key={m.id} m={m} />)
          }
        </div>
      )}
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function Calendario() {
  const { user } = useAuth()
  const [householdId, setHouseholdId] = useState<string | null>(null)
  const [loading, setLoading]         = useState(true)
  const [movs, setMovs]               = useState<Movimentacao[]>([])

  const hoje  = new Date()
  const [mes, setMes] = useState(hoje.getMonth())
  const [ano, setAno] = useState(hoje.getFullYear())

  useEffect(() => {
    if (!user) return
    supabase.from('households').select('id').eq('owner_id', user.id).single()
      .then(({ data }) => { if (data) setHouseholdId(data.id) })
  }, [user])

  const fetchDados = useCallback(async () => {
    if (!householdId) return
    setLoading(true)
    const mesStr   = String(mes + 1).padStart(2, '0')
    const ultimoDia = new Date(ano, mes + 1, 0).getDate()
    const { data } = await supabase
      .from('movimentacoes')
      .select('id,tipo,situacao,descricao,valor,data_movimentacao,metodo_pagamento,cartao_id,categoria_id,categorias(nome)')
      .eq('household_id', householdId)
      .gte('data_movimentacao', `${ano}-${mesStr}-01`)
      .lte('data_movimentacao', `${ano}-${mesStr}-${ultimoDia}`)
      .order('data_movimentacao', { ascending: true })
    setMovs(data || [])
    setLoading(false)
  }, [householdId, mes, ano])

  useEffect(() => { fetchDados() }, [fetchDados])

  // Mapa dia → movimentações
  const movsPorDia = useMemo(() => {
    const map: Record<number, Movimentacao[]> = {}
    for (const m of movs) {
      const dia = parseInt(m.data_movimentacao.substring(8, 10))
      if (!map[dia]) map[dia] = []
      map[dia].push(m)
    }
    return map
  }, [movs])

  // Totais do mês
  const totalReceitas = movs.filter(m => m.tipo === 'Receita').reduce((s, m) => s + Number(m.valor), 0)
  const totalDespesas = movs.filter(m => m.tipo === 'Despesa').reduce((s, m) => s + Number(m.valor), 0)
  const saldo         = totalReceitas - totalDespesas

  // Grade do calendário
  const primeiroDia    = new Date(ano, mes, 1).getDay() // 0=Dom
  const ultimoDiaNum   = new Date(ano, mes + 1, 0).getDate()
  const diasMesAnterior = new Date(ano, mes, 0).getDate()

  // Células: dias do mês anterior + dias do mês + dias do mês seguinte
  const celulas: { dia: number; mes: 'atual' | 'ant' | 'prox' }[] = []
  for (let i = primeiroDia - 1; i >= 0; i--) {
    celulas.push({ dia: diasMesAnterior - i, mes: 'ant' })
  }
  for (let d = 1; d <= ultimoDiaNum; d++) {
    celulas.push({ dia: d, mes: 'atual' })
  }
  const restante = 7 - (celulas.length % 7)
  if (restante < 7) {
    for (let d = 1; d <= restante; d++) {
      celulas.push({ dia: d, mes: 'prox' })
    }
  }

  const semanas: typeof celulas[] = []
  for (let i = 0; i < celulas.length; i += 7) {
    semanas.push(celulas.slice(i, i + 7))
  }

  function navMes(dir: number) {
    const novoMes = mes + dir
    if (novoMes < 0)  { setMes(11); setAno(a => a - 1) }
    else if (novoMes > 11) { setMes(0);  setAno(a => a + 1) }
    else setMes(novoMes)
  }

  return (
    <div style={{ background: '#f5f0e8', minHeight: '100vh', fontFamily: "'Segoe UI', system-ui, sans-serif", padding: '28px 32px' }}>

      {/* Cabeçalho */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: '#1a2332', margin: 0 }}>📅 Calendário</h1>
          <p style={{ color: '#6b7280', fontSize: 13, margin: '4px 0 0' }}>Movimentações por dia — clique para expandir</p>
        </div>
        <button onClick={fetchDados} style={{ fontSize: 13, color: '#0d7280', background: 'none', border: '1px solid #0d7280', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontWeight: 600 }}>
          ↻ Atualizar
        </button>
      </div>

      {/* Navegação do mês */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button onClick={() => navMes(-1)} style={{ width: 36, height: 36, borderRadius: '50%', border: '1px solid #e2e8f0', background: '#fff', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0d7280', fontWeight: 700 }}>‹</button>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#1a2332', minWidth: 200, textAlign: 'center' as const }}>
            {MESES[mes]} {ano}
          </div>
          <button onClick={() => navMes(1)} style={{ width: 36, height: 36, borderRadius: '50%', border: '1px solid #e2e8f0', background: '#fff', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0d7280', fontWeight: 700 }}>›</button>
          <button onClick={() => { setMes(hoje.getMonth()); setAno(hoje.getFullYear()) }} style={{ fontSize: 12, color: '#0d7280', background: 'none', border: '1px solid #0d7280', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontWeight: 600 }}>
            Hoje
          </button>
        </div>

        {/* Totais do mês */}
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderLeft: '3px solid #16a34a', borderRadius: 10, padding: '8px 16px', textAlign: 'center' as const }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>Receitas</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#16a34a' }}>+{fmt(totalReceitas)}</div>
          </div>
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderLeft: '3px solid #e05252', borderRadius: 10, padding: '8px 16px', textAlign: 'center' as const }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>Despesas</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#e05252' }}>-{fmt(totalDespesas)}</div>
          </div>
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderLeft: `3px solid ${saldo >= 0 ? '#0d7280' : '#e05252'}`, borderRadius: 10, padding: '8px 16px', textAlign: 'center' as const }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>Saldo</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: saldo >= 0 ? '#0d7280' : '#e05252' }}>{fmt(saldo)}</div>
          </div>
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '8px 16px', textAlign: 'center' as const }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>Movimentações</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#1a2332' }}>{movs.length}</div>
          </div>
        </div>
      </div>

      {/* Grade do calendário */}
      <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>

        {/* Cabeçalho dias da semana */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '2px solid #e2e8f0' }}>
          {DIAS_SEMANA.map((d, i) => (
            <div key={d} style={{
              padding: '12px 0',
              textAlign: 'center' as const,
              fontSize: 12, fontWeight: 700,
              color: i === 0 || i === 6 ? '#e05252' : '#6b7a8d',
              textTransform: 'uppercase' as const,
              letterSpacing: '0.5px',
              background: '#f8fafc',
            }}>
              {d}
            </div>
          ))}
        </div>

        {/* Semanas */}
        {loading ? (
          <div style={{ padding: 60, textAlign: 'center' as const, color: '#9ca3af', fontSize: 15 }}>
            Carregando movimentações...
          </div>
        ) : (
          semanas.map((semana, si) => (
            <div key={si} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: si < semanas.length - 1 ? '1px solid #e2e8f0' : 'none', gap: 0 }}>
              {semana.map((cel, di) => {
                const isMesAtual = cel.mes === 'atual'
                const isHoje = isMesAtual && cel.dia === hoje.getDate() && mes === hoje.getMonth() && ano === hoje.getFullYear()
                const movsdia = isMesAtual ? (movsPorDia[cel.dia] || []) : []
                const data    = isMesAtual ? new Date(ano, mes, cel.dia) : new Date()
                const semNum  = isMesAtual ? semanaDomes(data) : 0
                const isWeekend = di === 0 || di === 6

                return (
                  <div key={di} style={{
                    borderRight: di < 6 ? '1px solid #e2e8f0' : 'none',
                    padding: 6,
                    background: isWeekend && isMesAtual ? '#fafafa' : 'transparent',
                  }}>
                    <CelulaDia
                      dia={cel.dia}
                      movs={movsdia}
                      semana={semNum}
                      isHoje={isHoje}
                      isMesAtual={isMesAtual}
                    />
                  </div>
                )
              })}
            </div>
          ))
        )}
      </div>

      {/* Legenda */}
      <div style={{ display: 'flex', gap: 20, marginTop: 16, justifyContent: 'center' as const, flexWrap: 'wrap' as const }}>
        {[
          { cor: '#16a34a', label: 'Receita' },
          { cor: '#e05252', label: 'Despesa' },
          { cor: '#6b7280', label: 'Transferência' },
          { cor: '#0d7280', label: 'Hoje' },
        ].map(({ cor, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#6b7280' }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: cor }} />
            {label}
          </div>
        ))}
        <div style={{ fontSize: 12, color: '#9ca3af' }}>S = semana do mês</div>
      </div>
    </div>
  )
}
