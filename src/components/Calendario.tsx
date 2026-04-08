import { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
               'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

const CORES = {
  fundo:    '#f5f0e8',
  sidebar:  '#0d7280',
  texto:    '#1a2332',
  sub:      '#6b7a8d',
  borda:    '#e2e8f0',
  card:     '#ffffff',
  sepia:    '#ede8df',
  receita:  '#16a34a',
  debito:   '#e05252',
  credito:  '#ea580c',
  hoje:     '#0d7280',
}

interface Movimentacao {
  id: number
  tipo: string
  situacao: string
  descricao: string
  valor: number
  data_movimentacao: string
  data_pagamento: string | null
  metodo_pagamento: string | null
  cartao_id: number | null
  numero_parcela: string | null
  categorias?: { nome: string } | null
  cartoes?: { nome: string } | null
}

function semanaDomes(data: Date): number {
  const primeiroDia = new Date(data.getFullYear(), data.getMonth(), 1)
  return Math.ceil((data.getDate() + primeiroDia.getDay()) / 7)
}

function parseNumeroParcela(np: string | null): { atual: number; total: number } | null {
  if (!np) return null
  const m = np.match(/Parcela (\d+)\/(\d+)/i)
  return m ? { atual: +m[1], total: +m[2] } : null
}

function isCredito(m: Movimentacao): boolean {
  return m.cartao_id !== null || (m.metodo_pagamento || '').toLowerCase().includes('créd')
}

// ─── Regras de exibição ───────────────────────────────────────────────────────
// Débito/PIX/Dinheiro: só Pago
// Crédito: aparece se data_movimentacao !== data_pagamento (não recorrente)
//          e só aparece a Parcela 1 (para não duplicar parcelamentos)
// Receita: Pago
// Transferência: não aparece
function deveExibir(m: Movimentacao): boolean {
  if (m.tipo === 'Transferência') return false
  if (m.situacao === 'Previsto')  return false

  if (m.tipo === 'Receita') return m.situacao === 'Pago'

  if (isCredito(m)) {
    // Recorrente = data_movimentacao igual à data_pagamento → não exibe
    if (m.data_movimentacao && m.data_pagamento &&
        m.data_movimentacao === m.data_pagamento) return false
    // Para parcelados, só exibe Parcela 1
    const parc = parseNumeroParcela(m.numero_parcela)
    if (parc && parc.total > 1 && parc.atual !== 1) return false
    return true
  }

  // Débito / PIX / Dinheiro — só Pago
  return m.situacao === 'Pago'
}

// Valor a exibir: crédito parcelado mostra valor total (parcela × total)
function valorExibir(m: Movimentacao): number {
  if (isCredito(m)) {
    const parc = parseNumeroParcela(m.numero_parcela)
    if (parc && parc.total > 1) return Number(m.valor) * parc.total
  }
  return Number(m.valor)
}

// Label do modo de pagamento do crédito
function labelCredito(m: Movimentacao): string {
  const parc = parseNumeroParcela(m.numero_parcela)
  if (!parc) return 'À vista'
  if (parc.total === 1) return 'À vista'
  return `${parc.total}x de ${fmt(Number(m.valor))}`
}

function corSituacao(sit: string) {
  if (sit === 'Pago')     return { bg: '#dcfce7', color: '#16a34a' }
  if (sit === 'Faturado') return { bg: '#dbeafe', color: '#1d4ed8' }
  if (sit === 'Pendente') return { bg: '#fef3c7', color: '#d97706' }
  if (sit === 'Previsto') return { bg: '#f3e8ff', color: '#7c3aed' }
  return { bg: '#f3f4f6', color: '#6b7280' }
}

// ─── Card de movimentação ─────────────────────────────────────────────────────
function CardMov({ m }: { m: Movimentacao }) {
  const cred   = isCredito(m)
  const valor  = valorExibir(m)
  const sit    = corSituacao(m.situacao)
  const corVal = m.tipo === 'Receita' ? CORES.receita : cred ? CORES.credito : CORES.debito
  const corBorda = m.tipo === 'Receita' ? CORES.receita : cred ? CORES.credito : CORES.debito

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '10px 12px',
      background: CORES.card,
      borderRadius: 8,
      border: `1px solid ${CORES.borda}`,
      borderLeft: `3px solid ${corBorda}`,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: CORES.texto, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {m.descricao}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 3, flexWrap: 'wrap' as const }}>
          {m.categorias?.nome && (
            <span style={{ fontSize: 10, color: CORES.sub, background: CORES.sepia, borderRadius: 4, padding: '1px 6px' }}>
              {m.categorias.nome}
            </span>
          )}
          <span style={{ fontSize: 10, fontWeight: 700, background: sit.bg, color: sit.color, borderRadius: 4, padding: '1px 6px' }}>
            {m.situacao}
          </span>
          {cred && (
            <span style={{ fontSize: 10, fontWeight: 700, color: CORES.credito, background: '#fff7ed', borderRadius: 4, padding: '1px 6px' }}>
              💳 {m.cartoes?.nome || m.metodo_pagamento || 'Crédito'}
            </span>
          )}
          {cred && (
            <span style={{ fontSize: 10, color: CORES.sub }}>
              {labelCredito(m)}
            </span>
          )}
          {!cred && m.metodo_pagamento && (
            <span style={{ fontSize: 10, color: CORES.sub }}>{m.metodo_pagamento}</span>
          )}
        </div>
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap', color: corVal }}>
        {m.tipo === 'Receita' ? '+' : '-'}{fmt(valor)}
      </div>
    </div>
  )
}

// ─── Célula do dia ────────────────────────────────────────────────────────────
function CelulaDia({ dia, movs, semana, isHoje, isMesAtual }: {
  dia: number; movs: Movimentacao[]; semana: number; isHoje: boolean; isMesAtual: boolean
}) {
  const [aberto, setAberto] = useState(false)

  const movsExibir = useMemo(() => movs.filter(deveExibir), [movs])

  const totalReceitas = movsExibir.filter(m => m.tipo === 'Receita').reduce((s, m) => s + Number(m.valor), 0)
  const totalDebito   = movsExibir.filter(m => m.tipo === 'Despesa' && !isCredito(m)).reduce((s, m) => s + Number(m.valor), 0)
  const totalCredito  = movsExibir.filter(m => m.tipo === 'Despesa' && isCredito(m)).reduce((s, m) => s + valorExibir(m), 0)

  const temMovs = movsExibir.length > 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column' as const }}>
      {/* Célula principal */}
      <div
        onClick={() => temMovs && setAberto(a => !a)}
        style={{
          minHeight: 92,
          padding: '7px 8px',
          background: isHoje ? CORES.hoje : aberto ? '#f0f9ff' : isMesAtual ? CORES.card : '#f9f7f4',
          border: isHoje
            ? `2px solid ${CORES.hoje}`
            : aberto
            ? `2px solid ${CORES.hoje}`
            : `1px solid ${CORES.borda}`,
          borderRadius: aberto ? '10px 10px 0 0' : 10,
          cursor: temMovs ? 'pointer' : 'default',
          transition: 'background 0.12s',
          position: 'relative' as const,
        }}
      >
        {/* Número do dia + semana */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 5 }}>
          <div style={{
            width: 26, height: 26, borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 700,
            background: isHoje ? 'rgba(255,255,255,0.2)' : 'transparent',
            color: isHoje ? '#fff' : isMesAtual ? CORES.texto : '#c0c4cc',
          }}>
            {dia}
          </div>
          {isMesAtual && (
            <span style={{
              fontSize: 9, fontWeight: 700,
              color: isHoje ? 'rgba(255,255,255,0.65)' : '#b0b8c4',
              background: isHoje ? 'rgba(255,255,255,0.12)' : CORES.sepia,
              borderRadius: 4, padding: '1px 5px',
            }}>
              S{semana}
            </span>
          )}
        </div>

        {/* Valores resumidos */}
        {temMovs && (
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 2 }}>
            {totalReceitas > 0 && (
              <div style={{ fontSize: 10, fontWeight: 700, color: isHoje ? '#a7f3d0' : CORES.receita }}>
                +{fmt(totalReceitas)}
              </div>
            )}
            {totalDebito > 0 && (
              <div style={{ fontSize: 10, fontWeight: 700, color: isHoje ? '#fca5a5' : CORES.debito }}>
                -{fmt(totalDebito)}
              </div>
            )}
            {totalCredito > 0 && (
              <div style={{ fontSize: 10, fontWeight: 700, color: isHoje ? '#fed7aa' : CORES.credito }}>
                -{fmt(totalCredito)} <span style={{ fontSize: 9, fontWeight: 400, opacity: 0.8 }}>cred</span>
              </div>
            )}
            <div style={{ fontSize: 9, color: isHoje ? 'rgba(255,255,255,0.5)' : '#b0b8c4', marginTop: 1 }}>
              {movsExibir.length} mov.
            </div>
          </div>
        )}

        {temMovs && (
          <div style={{ position: 'absolute' as const, bottom: 4, right: 6, fontSize: 9, color: isHoje ? 'rgba(255,255,255,0.4)' : '#c0c4cc' }}>
            {aberto ? '▲' : '▼'}
          </div>
        )}
      </div>

      {/* Painel expandido */}
      {aberto && (
        <div style={{
          background: CORES.sepia,
          border: `2px solid ${CORES.hoje}`,
          borderTop: 'none',
          borderRadius: '0 0 10px 10px',
          padding: '12px 10px 14px',
          display: 'flex', flexDirection: 'column' as const, gap: 10,
          boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
        }}>
          {/* Totais do dia */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6 }}>
            {[
              { label: 'Receitas',      valor: totalReceitas, cor: CORES.receita, sinal: '+' },
              { label: 'Déb / PIX',     valor: totalDebito,   cor: CORES.debito,  sinal: '-' },
              { label: 'Crédito',       valor: totalCredito,  cor: CORES.credito, sinal: '-' },
              { label: 'Total Desp.',   valor: totalDebito + totalCredito, cor: CORES.texto, sinal: '-' },
            ].map(c => (
              <div key={c.label} style={{ background: CORES.card, borderRadius: 8, padding: '6px 8px', borderLeft: `3px solid ${c.cor}`, textAlign: 'center' as const }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: CORES.sub, textTransform: 'uppercase' as const }}>{c.label}</div>
                <div style={{ fontSize: 12, fontWeight: 800, color: c.cor }}>{c.sinal}{fmt(c.valor)}</div>
              </div>
            ))}
          </div>

          {/* Receitas */}
          {movsExibir.filter(m => m.tipo === 'Receita').length > 0 && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: CORES.receita, textTransform: 'uppercase' as const, letterSpacing: '0.5px', marginBottom: 5, paddingLeft: 4 }}>
                📈 Receitas ({movsExibir.filter(m => m.tipo === 'Receita').length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 5 }}>
                {movsExibir.filter(m => m.tipo === 'Receita').map(m => <CardMov key={m.id} m={m} />)}
              </div>
            </div>
          )}

          {/* Débito / PIX */}
          {movsExibir.filter(m => m.tipo === 'Despesa' && !isCredito(m)).length > 0 && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: CORES.debito, textTransform: 'uppercase' as const, letterSpacing: '0.5px', marginBottom: 5, paddingLeft: 4 }}>
                🏦 Débito / PIX ({movsExibir.filter(m => m.tipo === 'Despesa' && !isCredito(m)).length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 5 }}>
                {movsExibir.filter(m => m.tipo === 'Despesa' && !isCredito(m)).map(m => <CardMov key={m.id} m={m} />)}
              </div>
            </div>
          )}

          {/* Crédito */}
          {movsExibir.filter(m => m.tipo === 'Despesa' && isCredito(m)).length > 0 && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: CORES.credito, textTransform: 'uppercase' as const, letterSpacing: '0.5px', marginBottom: 5, paddingLeft: 4 }}>
                💳 Crédito ({movsExibir.filter(m => m.tipo === 'Despesa' && isCredito(m)).length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 5 }}>
                {movsExibir.filter(m => m.tipo === 'Despesa' && isCredito(m)).map(m => <CardMov key={m.id} m={m} />)}
              </div>
            </div>
          )}
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
    const mesStr    = String(mes + 1).padStart(2, '0')
    const ultimoDia = new Date(ano, mes + 1, 0).getDate()
    const { data }  = await supabase
      .from('movimentacoes')
      .select('id,tipo,situacao,descricao,valor,data_movimentacao,data_pagamento,metodo_pagamento,cartao_id,numero_parcela,categorias(nome),cartoes(nome)')
      .eq('household_id', householdId)
      .gte('data_movimentacao', `${ano}-${mesStr}-01`)
      .lte('data_movimentacao', `${ano}-${mesStr}-${ultimoDia}`)
      .order('data_movimentacao', { ascending: true })

    const normalizado: Movimentacao[] = (data || []).map((item: any) => ({
      ...item,
      categorias: Array.isArray(item.categorias) ? item.categorias[0] ?? null : item.categorias ?? null,
      cartoes:    Array.isArray(item.cartoes)    ? item.cartoes[0]    ?? null : item.cartoes    ?? null,
    }))
    setMovs(normalizado)
    setLoading(false)
  }, [householdId, mes, ano])

  useEffect(() => { fetchDados() }, [fetchDados])

  const movsPorDia = useMemo(() => {
    const map: Record<number, Movimentacao[]> = {}
    for (const m of movs) {
      const dia = parseInt(m.data_movimentacao.substring(8, 10))
      if (!map[dia]) map[dia] = []
      map[dia].push(m)
    }
    return map
  }, [movs])

  // Totais do mês (só movimentos válidos)
  const movsValidas    = useMemo(() => movs.filter(deveExibir), [movs])
  const totalReceitas  = movsValidas.filter(m => m.tipo === 'Receita').reduce((s, m) => s + Number(m.valor), 0)
  const totalDebito    = movsValidas.filter(m => m.tipo === 'Despesa' && !isCredito(m)).reduce((s, m) => s + Number(m.valor), 0)
  const totalCredito   = movsValidas.filter(m => m.tipo === 'Despesa' && isCredito(m)).reduce((s, m) => s + valorExibir(m), 0)
  const saldo          = totalReceitas - totalDebito - totalCredito

  // Montagem da grade
  const primeiroDia    = new Date(ano, mes, 1).getDay()
  const ultimoDiaNum   = new Date(ano, mes + 1, 0).getDate()
  const diasMesAnt     = new Date(ano, mes, 0).getDate()
  const celulas: { dia: number; mes: 'atual' | 'ant' | 'prox' }[] = []
  for (let i = primeiroDia - 1; i >= 0; i--) celulas.push({ dia: diasMesAnt - i, mes: 'ant' })
  for (let d = 1; d <= ultimoDiaNum; d++)     celulas.push({ dia: d, mes: 'atual' })
  const restante = 7 - (celulas.length % 7)
  if (restante < 7) for (let d = 1; d <= restante; d++) celulas.push({ dia: d, mes: 'prox' })
  const semanas: typeof celulas[] = []
  for (let i = 0; i < celulas.length; i += 7) semanas.push(celulas.slice(i, i + 7))

  function navMes(dir: number) {
    const novoMes = mes + dir
    if (novoMes < 0)       { setMes(11); setAno(a => a - 1) }
    else if (novoMes > 11) { setMes(0);  setAno(a => a + 1) }
    else setMes(novoMes)
  }

  return (
    <div style={{ background: CORES.fundo, minHeight: '100vh', fontFamily: "'Segoe UI', system-ui, sans-serif", padding: '28px 32px' }}>

      {/* Cabeçalho */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: CORES.texto, margin: 0 }}>📅 Calendário</h1>
          <p style={{ color: CORES.sub, fontSize: 13, margin: '4px 0 0' }}>
            Movimentações por dia — Débito/PIX: Pago · Crédito: data diferente da data de pagamento
          </p>
        </div>
        <button onClick={fetchDados} style={{ fontSize: 13, color: CORES.sidebar, background: 'none', border: `1px solid ${CORES.sidebar}`, borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontWeight: 600 }}>
          ↻ Atualizar
        </button>
      </div>

      {/* Navegação + totais */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap' as const, gap: 12 }}>

        {/* Navegação mês */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => navMes(-1)} style={{ width: 36, height: 36, borderRadius: '50%', border: `1px solid ${CORES.borda}`, background: CORES.card, fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: CORES.sidebar, fontWeight: 700 }}>‹</button>
          <div style={{ fontSize: 20, fontWeight: 800, color: CORES.texto, minWidth: 200, textAlign: 'center' as const }}>
            {MESES[mes]} {ano}
          </div>
          <button onClick={() => navMes(1)} style={{ width: 36, height: 36, borderRadius: '50%', border: `1px solid ${CORES.borda}`, background: CORES.card, fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: CORES.sidebar, fontWeight: 700 }}>›</button>
          <button onClick={() => { setMes(hoje.getMonth()); setAno(hoje.getFullYear()) }} style={{ fontSize: 12, color: CORES.sidebar, background: 'none', border: `1px solid ${CORES.sidebar}`, borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontWeight: 600 }}>
            Hoje
          </button>
        </div>

        {/* Cards de totais */}
        <div style={{ display: 'flex', gap: 10 }}>
          {[
            { label: 'Receitas',    valor: totalReceitas, cor: CORES.receita, sinal: '+' },
            { label: 'Déb / PIX',  valor: totalDebito,   cor: CORES.debito,  sinal: '-' },
            { label: 'Crédito',    valor: totalCredito,  cor: CORES.credito, sinal: '-' },
            { label: 'Saldo',      valor: saldo,         cor: saldo >= 0 ? CORES.sidebar : CORES.debito, sinal: '' },
            { label: 'Movs',       valor: -1,            cor: CORES.texto,   sinal: '' },
          ].map((c) => (
            <div key={c.label} style={{ background: CORES.card, border: `1px solid ${CORES.borda}`, borderLeft: `3px solid ${c.cor}`, borderRadius: 10, padding: '8px 14px', textAlign: 'center' as const }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: CORES.sub, textTransform: 'uppercase' as const, letterSpacing: '0.4px' }}>{c.label}</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: c.cor, marginTop: 2 }}>
                {c.label === 'Movs'
                  ? movsValidas.length
                  : `${c.sinal}${fmt(Math.abs(c.valor))}`
                }
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Grade do calendário */}
      <div style={{ background: CORES.card, borderRadius: 16, border: `1px solid ${CORES.borda}`, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>

        {/* Cabeçalho dias da semana */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: `2px solid ${CORES.borda}` }}>
          {DIAS_SEMANA.map((d, i) => (
            <div key={d} style={{
              padding: '12px 0', textAlign: 'center' as const,
              fontSize: 12, fontWeight: 700,
              color: i === 0 || i === 6 ? CORES.debito : CORES.sub,
              background: CORES.sepia,
              textTransform: 'uppercase' as const, letterSpacing: '0.5px',
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
            <div key={si} style={{
              display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)',
              borderBottom: si < semanas.length - 1 ? `1px solid ${CORES.borda}` : 'none',
            }}>
              {semana.map((cel, di) => {
                const isMesAtual = cel.mes === 'atual'
                const isHoje     = isMesAtual && cel.dia === hoje.getDate() && mes === hoje.getMonth() && ano === hoje.getFullYear()
                const isWeekend  = di === 0 || di === 6
                return (
                  <div key={di} style={{
                    borderRight: di < 6 ? `1px solid ${CORES.borda}` : 'none',
                    padding: 5,
                    background: isWeekend && isMesAtual ? '#faf8f5' : 'transparent',
                  }}>
                    <CelulaDia
                      dia={cel.dia}
                      movs={isMesAtual ? (movsPorDia[cel.dia] || []) : []}
                      semana={isMesAtual ? semanaDomes(new Date(ano, mes, cel.dia)) : 0}
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
          { cor: CORES.receita, label: 'Receita (Pago)' },
          { cor: CORES.debito,  label: 'Débito/PIX (Pago)' },
          { cor: CORES.credito, label: 'Crédito (valor total)' },
          { cor: CORES.hoje,    label: 'Hoje' },
        ].map(({ cor, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: CORES.sub }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: cor }} />
            {label}
          </div>
        ))}
        <div style={{ fontSize: 12, color: '#b0b8c4' }}>S = semana do mês</div>
      </div>
    </div>
  )
}
