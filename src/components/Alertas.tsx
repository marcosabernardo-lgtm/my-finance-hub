import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'

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
  categoria_id: number | null
  numero_parcela: string | null
}

interface Categoria {
  id: number
  nome: string
  classificacao: string
  limite_gastos: number | null
}

interface Cartao {
  id: number
  nome: string
}

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const hoje = new Date()
hoje.setHours(0, 0, 0, 0)

function diasAte(dataStr: string): number {
  const d = new Date(dataStr + 'T00:00:00')
  return Math.round((d.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24))
}

function formatarData(dataStr: string): string {
  const [ano, mes, dia] = dataStr.split('-')
  return `${dia}/${mes}/${ano}`
}

function getMetodo(m: Movimentacao): 'cartao' | 'pix' | 'debito' | 'boleto' | 'outro' {
  if (m.cartao_id) return 'cartao'
  const mp = (m.metodo_pagamento || '').toLowerCase()
  if (mp.includes('pix')) return 'pix'
  if (mp.includes('débito') || mp.includes('debito')) return 'debito'
  if (mp.includes('boleto')) return 'boleto'
  return 'outro'
}

// ─── LinhaItem com botão de pagamento ────────────────────────────────────────
function LinhaItem({ descricao, data, valor, parcela, diasRestantes, movId, isCartao, onPago }: {
  descricao: string
  data: string
  valor: number
  parcela?: string | null
  diasRestantes?: number
  movId?: number
  isCartao?: boolean
  onPago?: (id: number) => void
}) {
  const [salvando, setSalvando] = useState(false)
  const atrasado = diasRestantes !== undefined && diasRestantes < 0

  async function handlePagar() {
    if (!movId || !onPago) return
    setSalvando(true)
    const novaSituacao = isCartao ? 'Faturado' : 'Pago'
    const { error } = await supabase
      .from('movimentacoes')
      .update({ situacao: novaSituacao })
      .eq('id', movId)
    if (!error) onPago(movId)
    setSalvando(false)
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '10px',
      padding: '10px 12px',
      background: atrasado ? '#fff5f5' : '#ede8df',
      borderRadius: '8px',
      borderLeft: `3px solid ${atrasado ? '#ef4444' : '#d6cfc4'}`
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '13px', color: '#111827', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {descricao}
          {parcela && parcela !== 'Parcela 1/1' && (
            <span style={{ fontSize: '10px', color: '#9ca3af', marginLeft: '6px' }}>{parcela}</span>
          )}
        </div>
        <div style={{ fontSize: '11px', color: '#9ca3af' }}>{formatarData(data)}</div>
      </div>
      <div style={{ fontSize: '13px', fontWeight: 700, color: atrasado ? '#ef4444' : '#111827', whiteSpace: 'nowrap' }}>
        {fmt(valor)}
      </div>
      {movId && onPago && (
        <button
          onClick={handlePagar}
          disabled={salvando}
          title={isCartao ? 'Marcar como Faturado' : 'Marcar como Pago'}
          style={{
            flexShrink: 0,
            padding: '4px 10px',
            borderRadius: 6,
            border: 'none',
            background: salvando ? '#d1d5db' : '#16a34a',
            color: '#fff',
            fontSize: 11,
            fontWeight: 700,
            cursor: salvando ? 'wait' : 'pointer',
            whiteSpace: 'nowrap' as const,
            transition: 'background 0.15s',
          }}
        >
          {salvando ? '...' : isCartao ? '✓ Faturado' : '✓ Pago'}
        </button>
      )}
    </div>
  )
}

function BlocoExpandivel({ icone, titulo, total, cor, fundo, borda, badge, badgeCor, children }: {
  icone: string; titulo: string; total: number; cor: string; fundo: string; borda: string
  badge?: string; badgeCor?: string; children: React.ReactNode
}) {
  const [aberto, setAberto] = useState(false)
  return (
    <div style={{ border: `1px solid ${borda}`, borderLeft: `4px solid ${cor}`, borderRadius: '10px', overflow: 'hidden', marginBottom: '8px' }}>
      <div onClick={() => setAberto(a => !a)} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', background: fundo, cursor: 'pointer', userSelect: 'none' }}>
        <span style={{ fontSize: '18px' }}>{icone}</span>
        <span style={{ fontSize: '13px', fontWeight: 600, color: '#111827', flex: 1 }}>{titulo}</span>
        {badge && <span style={{ fontSize: '10px', fontWeight: 700, background: badgeCor || cor, color: '#fff', borderRadius: '99px', padding: '2px 8px' }}>{badge}</span>}
        <span style={{ fontSize: '14px', fontWeight: 700, color: cor }}>{fmt(total)}</span>
        <span style={{ fontSize: '12px', color: '#9ca3af', marginLeft: '4px' }}>{aberto ? '▲' : '▼'}</span>
      </div>
      {aberto && (
        <div style={{ padding: '10px 12px', background: '#f5f0e8', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {children}
        </div>
      )}
    </div>
  )
}

function Secao({ titulo, icone, cor, count, children, defaultAberto = true }: {
  titulo: string; icone: string; cor: string; count: number; children: React.ReactNode; defaultAberto?: boolean
}) {
  const [aberto, setAberto] = useState(defaultAberto)
  return (
    <div style={{ marginBottom: '28px' }}>
      <div onClick={() => setAberto(a => !a)} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px', cursor: 'pointer', userSelect: 'none' }}>
        <span style={{ fontSize: '18px' }}>{icone}</span>
        <span style={{ fontSize: '15px', fontWeight: 700, color: '#111827', flex: 1 }}>{titulo}</span>
        {count > 0 && <span style={{ fontSize: '11px', fontWeight: 700, background: cor, color: '#fff', borderRadius: '99px', padding: '2px 10px' }}>{count}</span>}
        <span style={{ fontSize: '12px', color: '#9ca3af' }}>{aberto ? '▲' : '▼'}</span>
      </div>
      {aberto && (
        <div>
          {count === 0
            ? <div style={{ fontSize: '13px', color: '#9ca3af', padding: '12px 16px', background: '#ede8df', borderRadius: '8px', textAlign: 'center' }}>✅ Nenhum alerta nesta categoria</div>
            : children}
        </div>
      )}
    </div>
  )
}

export default function Alertas() {
  const { user } = useAuth()
  const [householdId, setHouseholdId] = useState<string | null>(null)
  const [movs, setMovs]               = useState<Movimentacao[]>([])
  const [categorias, setCategorias]   = useState<Categoria[]>([])
  const [cartoes, setCartoes]         = useState<Cartao[]>([])
  const [loading, setLoading]         = useState(false)

  useEffect(() => {
    if (!user) return
    supabase.from('households').select('id').eq('owner_id', user.id).single()
      .then(({ data }) => { if (data) setHouseholdId(data.id) })
  }, [user])

  const fetchDados = useCallback(async () => {
    if (!householdId) return
    setLoading(true)
    const { data: movsData } = await supabase
      .from('movimentacoes')
      .select('id,tipo,situacao,descricao,valor,data_movimentacao,data_pagamento,metodo_pagamento,cartao_id,categoria_id,numero_parcela')
      .eq('household_id', householdId)
      .eq('tipo', 'Despesa')
      .in('situacao', ['Pendente', 'Pago'])
    setMovs(movsData || [])
    const { data: cats } = await supabase.from('categorias').select('id,nome,classificacao,limite_gastos').eq('household_id', householdId)
    setCategorias(cats || [])
    const { data: cards } = await supabase.from('cartoes').select('id,nome').eq('household_id', householdId).eq('ativo', true)
    setCartoes(cards || [])
    setLoading(false)
  }, [householdId])

  useEffect(() => { fetchDados() }, [fetchDados])

  // Remove localmente sem recarregar tudo
  const handlePago = useCallback((id: number) => {
    setMovs(prev => prev.filter(m => m.id !== id))
  }, [])

  const mesAtual = hoje.getMonth() + 1
  const anoAtual = hoje.getFullYear()

  const movsMesAtual = useMemo(() =>
    movs.filter(m => {
      const d = new Date(m.data_movimentacao + 'T00:00:00')
      return d.getMonth() + 1 === mesAtual && d.getFullYear() === anoAtual
    }), [movs, mesAtual, anoAtual])

  const vencidos = useMemo(() =>
    movs.filter(m => {
      if (m.situacao !== 'Pendente') return false
      const ref = m.data_pagamento || m.data_movimentacao
      return diasAte(ref) < 0
    }).sort((a, b) => (a.data_pagamento || a.data_movimentacao).localeCompare(b.data_pagamento || b.data_movimentacao)),
    [movs])

  const vencendoHoje = useMemo(() =>
    movs.filter(m => {
      if (m.situacao !== 'Pendente') return false
      const ref = m.data_pagamento || m.data_movimentacao
      return diasAte(ref) === 0
    }).sort((a, b) => (a.data_pagamento || a.data_movimentacao).localeCompare(b.data_pagamento || b.data_movimentacao)),
    [movs])

  const proximos14 = useMemo(() =>
    movs.filter(m => {
      if (m.situacao !== 'Pendente') return false
      const ref = m.data_pagamento || m.data_movimentacao
      const dias = diasAte(ref)
      return dias > 0 && dias <= 14
    }).sort((a, b) => (a.data_pagamento || a.data_movimentacao).localeCompare(b.data_pagamento || b.data_movimentacao)),
    [movs])

  function agruparPorMetodo(lista: Movimentacao[]) {
    const debito     = lista.filter(m => getMetodo(m) === 'debito')
    const pix        = lista.filter(m => getMetodo(m) === 'pix')
    const boleto     = lista.filter(m => getMetodo(m) === 'boleto')
    const cartaoMovs = lista.filter(m => getMetodo(m) === 'cartao')
    const porCartao: Record<number, { cartao: Cartao; movs: Movimentacao[] }> = {}
    for (const m of cartaoMovs) {
      if (!m.cartao_id) continue
      if (!porCartao[m.cartao_id]) {
        const cartao = cartoes.find(c => c.id === m.cartao_id)
        if (!cartao) continue
        porCartao[m.cartao_id] = { cartao, movs: [] }
      }
      porCartao[m.cartao_id].movs.push(m)
    }
    return { debito, pix, boleto, cartoesGrupos: Object.values(porCartao) }
  }

  const vencidosGrupos   = useMemo(() => agruparPorMetodo(vencidos),    [vencidos, cartoes])
  const hojeGrupos       = useMemo(() => agruparPorMetodo(vencendoHoje),[vencendoHoje, cartoes])
  const proximos14Grupos = useMemo(() => agruparPorMetodo(proximos14),  [proximos14, cartoes])

  const categoriasEstouradas = useMemo(() => {
    const gastosPorCat: Record<number, { total: number; itens: Movimentacao[] }> = {}
    for (const m of movsMesAtual) {
      if (m.situacao === 'Pendente' && m.numero_parcela !== 'Parcela 1/1') continue
      if (!m.categoria_id) continue
      if (!gastosPorCat[m.categoria_id]) gastosPorCat[m.categoria_id] = { total: 0, itens: [] }
      gastosPorCat[m.categoria_id].total += Number(m.valor)
      gastosPorCat[m.categoria_id].itens.push(m)
    }
    return categorias
      .filter(c => c.limite_gastos && c.limite_gastos > 0 && (gastosPorCat[c.id]?.total || 0) > c.limite_gastos)
      .map(c => ({
        ...c,
        gasto: gastosPorCat[c.id].total,
        itens: gastosPorCat[c.id].itens.sort((a, b) => Number(b.valor) - Number(a.valor)),
        excesso: gastosPorCat[c.id].total - (c.limite_gastos || 0),
        pct: Math.round((gastosPorCat[c.id].total / (c.limite_gastos || 1)) * 100),
      }))
      .sort((a, b) => b.pct - a.pct)
  }, [movsMesAtual, categorias])

  const riscoEstouro = useMemo(() => {
    const gastosPorCat: Record<number, number> = {}
    for (const m of movsMesAtual) {
      if (!m.categoria_id) continue
      const entraNoReal = m.situacao === 'Pago' || (m.situacao === 'Pendente' && m.numero_parcela === 'Parcela 1/1')
      if (!entraNoReal) continue
      gastosPorCat[m.categoria_id] = (gastosPorCat[m.categoria_id] || 0) + Number(m.valor)
    }
    const projecaoPorCat: Record<number, number> = { ...gastosPorCat }
    for (const m of movsMesAtual) {
      if (!m.categoria_id) continue
      if (m.situacao !== 'Pendente' || m.numero_parcela === 'Parcela 1/1') continue
      projecaoPorCat[m.categoria_id] = (projecaoPorCat[m.categoria_id] || 0) + Number(m.valor)
    }
    return categorias
      .filter(c => {
        if (!c.limite_gastos || c.limite_gastos <= 0) return false
        const pctAtual = (gastosPorCat[c.id] || 0) / c.limite_gastos * 100
        const pctProj  = (projecaoPorCat[c.id] || 0) / c.limite_gastos * 100
        return pctAtual <= 100 && pctProj > 100
      })
      .map(c => ({
        ...c,
        gastoAtual: gastosPorCat[c.id] || 0,
        projecao: projecaoPorCat[c.id] || 0,
        pctAtual: Math.round((gastosPorCat[c.id] || 0) / (c.limite_gastos || 1) * 100),
        pctProjecao: Math.round((projecaoPorCat[c.id] || 0) / (c.limite_gastos || 1) * 100),
        faltaParaEstourar: (c.limite_gastos || 0) - (gastosPorCat[c.id] || 0),
      }))
      .sort((a, b) => b.pctProjecao - a.pctProjecao)
  }, [movsMesAtual, categorias])

  const maiorConsumo = useMemo(() => {
    const gastosPorCat: Record<number, { total: number; itens: Movimentacao[] }> = {}
    for (const m of movsMesAtual) {
      if (m.situacao === 'Pendente' && m.numero_parcela !== 'Parcela 1/1') continue
      if (!m.categoria_id) continue
      if (!gastosPorCat[m.categoria_id]) gastosPorCat[m.categoria_id] = { total: 0, itens: [] }
      gastosPorCat[m.categoria_id].total += Number(m.valor)
      gastosPorCat[m.categoria_id].itens.push(m)
    }
    const totalMes = Object.values(gastosPorCat).reduce((s, v) => s + v.total, 0)
    return categorias
      .filter(c => gastosPorCat[c.id]?.total > 0)
      .map(c => ({
        ...c,
        gasto: gastosPorCat[c.id].total,
        itens: gastosPorCat[c.id].itens.sort((a, b) => Number(b.valor) - Number(a.valor)),
        pct: totalMes > 0 ? Math.round((gastosPorCat[c.id].total / totalMes) * 100) : 0,
      }))
      .sort((a, b) => b.gasto - a.gasto)
      .slice(0, 6)
  }, [movsMesAtual, categorias])

  const totalAlertas = vencidos.length + vencendoHoje.length + proximos14.length + categoriasEstouradas.length + riscoEstouro.length
  const cores = ['#ef4444','#f59e0b','#0891b2','#7c3aed','#16a34a','#ea580c']

  function renderBlocos(grupos: ReturnType<typeof agruparPorMetodo>, cor: string, fundo: string, borda: string) {
    return (
      <>
        {grupos.debito.length > 0 && (
          <BlocoExpandivel icone="🏦" titulo="Débito" total={grupos.debito.reduce((s,m)=>s+Number(m.valor),0)} cor={cor} fundo={fundo} borda={borda} badge={`${grupos.debito.length}`} badgeCor={cor}>
            {grupos.debito.map(m => <LinhaItem key={m.id} movId={m.id} isCartao={false} onPago={handlePago} descricao={m.descricao} data={m.data_pagamento||m.data_movimentacao} valor={Number(m.valor)} parcela={m.numero_parcela} diasRestantes={diasAte(m.data_pagamento||m.data_movimentacao)}/>)}
          </BlocoExpandivel>
        )}
        {grupos.pix.length > 0 && (
          <BlocoExpandivel icone="⚡" titulo="PIX" total={grupos.pix.reduce((s,m)=>s+Number(m.valor),0)} cor={cor} fundo={fundo} borda={borda} badge={`${grupos.pix.length}`} badgeCor={cor}>
            {grupos.pix.map(m => <LinhaItem key={m.id} movId={m.id} isCartao={false} onPago={handlePago} descricao={m.descricao} data={m.data_pagamento||m.data_movimentacao} valor={Number(m.valor)} parcela={m.numero_parcela} diasRestantes={diasAte(m.data_pagamento||m.data_movimentacao)}/>)}
          </BlocoExpandivel>
        )}
        {grupos.boleto.length > 0 && (
          <BlocoExpandivel icone="📄" titulo="Boleto" total={grupos.boleto.reduce((s,m)=>s+Number(m.valor),0)} cor={cor} fundo={fundo} borda={borda} badge={`${grupos.boleto.length}`} badgeCor={cor}>
            {grupos.boleto.map(m => <LinhaItem key={m.id} movId={m.id} isCartao={false} onPago={handlePago} descricao={m.descricao} data={m.data_pagamento||m.data_movimentacao} valor={Number(m.valor)} parcela={m.numero_parcela} diasRestantes={diasAte(m.data_pagamento||m.data_movimentacao)}/>)}
          </BlocoExpandivel>
        )}
        {grupos.cartoesGrupos.map(({ cartao, movs: cms }) => (
          <BlocoExpandivel key={cartao.id} icone="💳" titulo={cartao.nome} total={cms.reduce((s,m)=>s+Number(m.valor),0)} cor={cor} fundo={fundo} borda={borda} badge={`${cms.length}`} badgeCor={cor}>
            {cms.map(m => <LinhaItem key={m.id} movId={m.id} isCartao={true} onPago={handlePago} descricao={m.descricao} data={m.data_pagamento||m.data_movimentacao} valor={Number(m.valor)} parcela={m.numero_parcela} diasRestantes={diasAte(m.data_pagamento||m.data_movimentacao)}/>)}
          </BlocoExpandivel>
        ))}
      </>
    )
  }

  return (
    <div style={{ fontFamily: "'Segoe UI', system-ui, sans-serif", padding: '24px', maxWidth: '960px', margin: '0 auto', background: '#f5f0e8', minHeight: '100vh' }}>

      <div style={{ marginBottom: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <h1 style={{ fontSize: '26px', fontWeight: 700, color: '#111827', margin: 0 }}>🔔 Alertas</h1>
          {totalAlertas > 0 && (
            <span style={{ fontSize: '13px', fontWeight: 700, background: '#ef4444', color: '#fff', borderRadius: '99px', padding: '3px 12px' }}>
              {totalAlertas} ativos
            </span>
          )}
        </div>
        <p style={{ color: '#6b7280', marginTop: '4px', fontSize: '13px' }}>
          Monitoramento financeiro — {hoje.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
        </p>
      </div>

      {loading ? (
        <div style={{ padding: '80px', textAlign: 'center', color: '#9ca3af' }}>Carregando alertas...</div>
      ) : (
        <>
          {/* 3 Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '14px', marginBottom: '32px' }}>
            <div style={{ background: '#ef4444', borderRadius: 12, padding: '16px 20px', color: '#fff' }}>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Vencidos <span style={{ fontSize: 12, fontWeight: 400, opacity: 0.75 }}>Pendentes em atraso</span></div>
              <div style={{ fontSize: 26, fontWeight: 800, marginBottom: 4 }}>{fmt(vencidos.reduce((s,m)=>s+Number(m.valor),0))}</div>
              <div style={{ fontSize: 12, opacity: 0.75 }}>{vencidos.length} lançamento{vencidos.length !== 1 ? 's' : ''} pendente{vencidos.length !== 1 ? 's' : ''}</div>
            </div>
            <div style={{ background: '#f59e0b', borderRadius: 12, padding: '16px 20px', color: '#fff' }}>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Vencendo <span style={{ fontSize: 12, fontWeight: 400, opacity: 0.75 }}>hoje</span></div>
              <div style={{ fontSize: 26, fontWeight: 800, marginBottom: 4 }}>{fmt(vencendoHoje.reduce((s,m)=>s+Number(m.valor),0))}</div>
              <div style={{ fontSize: 12, opacity: 0.75 }}>{vencendoHoje.length} lançamento{vencendoHoje.length !== 1 ? 's' : ''} pendente{vencendoHoje.length !== 1 ? 's' : ''}</div>
            </div>
            <div style={{ background: '#0d7280', borderRadius: 12, padding: '16px 20px', color: '#fff' }}>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Futuro <span style={{ fontSize: 12, fontWeight: 400, opacity: 0.75 }}>Próximos 14 dias</span></div>
              <div style={{ fontSize: 26, fontWeight: 800, marginBottom: 4 }}>{fmt(proximos14.reduce((s,m)=>s+Number(m.valor),0))}</div>
              <div style={{ fontSize: 12, opacity: 0.75 }}>{proximos14.length} lançamento{proximos14.length !== 1 ? 's' : ''} pendente{proximos14.length !== 1 ? 's' : ''}</div>
            </div>
          </div>

          <Secao titulo="Pagamentos Vencidos" icone="🚨" cor="#ef4444" count={vencidos.length}>
            {renderBlocos(vencidosGrupos, '#ef4444', '#fff5f5', '#fecaca')}
          </Secao>

          <Secao titulo="Vencem Hoje" icone="⚡" cor="#f59e0b" count={vencendoHoje.length}>
            {renderBlocos(hojeGrupos, '#f59e0b', '#fffbeb', '#fde68a')}
          </Secao>

          <Secao titulo="Vencem nos Próximos 14 Dias" icone="⏰" cor="#0d7280" count={proximos14.length}>
            {renderBlocos(proximos14Grupos, '#0d7280', '#f0fdfa', '#99f6e4')}
          </Secao>

          <Secao titulo="Limite de Gastos Estourado" icone="💸" cor="#7c3aed" count={categoriasEstouradas.length}>
            {categoriasEstouradas.map(c => (
              <BlocoExpandivel key={c.id} icone="⚠️" titulo={c.nome} total={c.gasto} cor="#7c3aed" fundo="#fdf4ff" borda="#e9d5ff" badge={`${c.pct}% do limite`} badgeCor="#7c3aed">
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#6b7280', padding: '4px 8px', marginBottom: '4px' }}>
                  <span>Limite: {fmt(c.limite_gastos || 0)}</span>
                  <span style={{ color: '#7c3aed', fontWeight: 600 }}>Excedeu {fmt(c.excesso)}</span>
                </div>
                <div style={{ background: '#e9d5ff', borderRadius: '99px', height: '5px', margin: '0 8px 10px' }}>
                  <div style={{ background: '#7c3aed', width: '100%', height: '5px', borderRadius: '99px' }} />
                </div>
                {c.itens.map(m => <LinhaItem key={m.id} descricao={m.descricao} data={m.data_movimentacao} valor={Number(m.valor)} parcela={m.numero_parcela}/>)}
              </BlocoExpandivel>
            ))}
          </Secao>

          <Secao titulo="Maior Consumo do Mês" icone="📊" cor="#0891b2" count={maiorConsumo.length}>
            {maiorConsumo.map((c, i) => (
              <BlocoExpandivel key={c.id} icone={`#${i+1}`} titulo={c.nome} total={c.gasto} cor={cores[i]||'#6b7280'} fundo="#f5f0e8" borda="#e2e8f0" badge={`${c.pct}% do total`} badgeCor={cores[i]||'#6b7280'}>
                <div style={{ fontSize: '11px', color: '#9ca3af', padding: '2px 8px 8px' }}>
                  {c.classificacao}{c.limite_gastos ? ` · Limite: ${fmt(c.limite_gastos)} (usando ${Math.round(c.gasto/c.limite_gastos*100)}%)` : ''}
                </div>
                {c.itens.map(m => <LinhaItem key={m.id} descricao={m.descricao} data={m.data_movimentacao} valor={Number(m.valor)} parcela={m.numero_parcela}/>)}
              </BlocoExpandivel>
            ))}
          </Secao>

          <Secao titulo="Risco de Estouro se Não Controlar" icone="🎯" cor="#ea580c" count={riscoEstouro.length}>
            {riscoEstouro.map(c => (
              <BlocoExpandivel key={c.id} icone="🎯" titulo={c.nome} total={c.projecao} cor="#ea580c" fundo="#fff7ed" borda="#fed7aa" badge={`Projeção: ${c.pctProjecao}%`} badgeCor="#ea580c">
                <div style={{ padding: '4px 8px 8px' }}>
                  <div style={{ background: '#fed7aa', borderRadius: '99px', height: '6px', marginBottom: '6px' }}>
                    <div style={{ background: '#ea580c', width: `${Math.min(c.pctProjecao,100)}%`, height: '6px', borderRadius: '99px' }}/>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#6b7280', marginBottom: '8px' }}>
                    <span>Hoje: {fmt(c.gastoAtual)} ({c.pctAtual}%)</span>
                    <span>Limite: {fmt(c.limite_gastos||0)}</span>
                  </div>
                  <div style={{ fontSize: '11px', color: '#ea580c', fontWeight: 600, marginBottom: '10px' }}>
                    ⚠️ Restam apenas {fmt(c.faltaParaEstourar)} antes de estourar
                  </div>
                </div>
                {movsMesAtual
                  .filter(m => m.categoria_id === c.id && (m.situacao === 'Pago' || m.situacao === 'Pendente'))
                  .sort((a,b) => Number(b.valor)-Number(a.valor))
                  .map(m => <LinhaItem key={m.id} descricao={m.descricao} data={m.data_movimentacao} valor={Number(m.valor)} parcela={m.numero_parcela}/>)
                }
              </BlocoExpandivel>
            ))}
          </Secao>
        </>
      )}
    </div>
  )
}
