import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../hooks/useAuth'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts'

const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

const fmt  = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtK = (v: number) => {
  const abs = Math.abs(v)
  const s   = v < 0 ? '-' : ''
  return abs >= 1000 ? `${s}R$ ${(abs / 1000).toFixed(1)}k` : fmt(v)
}

export default function FluxoCaixa() {
  const { user } = useAuth()
  const hoje     = new Date()
  const anoAtual = hoje.getFullYear()
  const mesAtual = hoje.getMonth() + 1

  const [householdId, setHouseholdId] = useState<string | null>(null)
  const [anoSel, setAnoSel]           = useState(anoAtual)
  const [loading, setLoading]         = useState(false)
  const [movs, setMovs]               = useState<any[]>([])

  useEffect(() => {
    if (!user) return
    supabase.from('households').select('id').eq('owner_id', user.id).single()
      .then(({ data }) => { if (data) setHouseholdId(data.id) })
  }, [user])

  const fetchDados = useCallback(async () => {
    if (!householdId) return
    setLoading(true)
    const { data } = await supabase
      .from('movimentacoes')
      .select('tipo,situacao,valor,metodo_pagamento,data_movimentacao')
      .eq('household_id', householdId)
      .gte('data_movimentacao', `${anoSel}-01-01`)
      .lte('data_movimentacao', `${anoSel}-12-31`)
    setMovs(data || [])
    setLoading(false)
  }, [householdId, anoSel])

  useEffect(() => { fetchDados() }, [fetchDados])

  const mesesData = useMemo(() => {
    let acum = 0
    return MESES.map((nome, i) => {
      const mes    = i + 1
      const mesStr = String(mes).padStart(2, '0')
      const isPast   = anoSel < anoAtual || (anoSel === anoAtual && mes < mesAtual)
      const isAtual  = anoSel === anoAtual && mes === mesAtual
      const isFuturo = anoSel > anoAtual || (anoSel === anoAtual && mes > mesAtual)

      const movsM = movs.filter(m => m.data_movimentacao?.substring(5, 7) === mesStr)

      const recPago = movsM
        .filter(m => m.tipo === 'Receita' && m.situacao === 'Pago' && m.metodo_pagamento !== 'Transferência entre Contas')
        .reduce((s, m) => s + Number(m.valor), 0)
      const recPend = movsM
        .filter(m => m.tipo === 'Receita' && m.situacao === 'Pendente' && m.metodo_pagamento !== 'Transferência entre Contas')
        .reduce((s, m) => s + Number(m.valor), 0)

      // Despesas reais: Pago para débito/PIX, Faturado para crédito
      const despPago = movsM
        .filter(m => m.tipo === 'Despesa' && (
          (m.situacao === 'Pago'      && !(m.metodo_pagamento?.startsWith('Crédito') ?? false)) ||
          (m.situacao === 'Faturado')
        ))
        .reduce((s, m) => s + Number(m.valor), 0)
      const despPend = movsM
        .filter(m => m.tipo === 'Despesa' && m.situacao === 'Pendente')
        .reduce((s, m) => s + Number(m.valor), 0)
      const despPrev = movsM
        .filter(m => m.tipo === 'Despesa' && m.situacao === 'Previsto')
        .reduce((s, m) => s + Number(m.valor), 0)

      // Total exibido: passado = só pago; atual = pago + pendente; futuro = pendente + previsto
      const recTotal  = isPast ? recPago  : recPago  + recPend
      const despTotal = isPast ? despPago : despPago + despPend + (isFuturo ? despPrev : 0)
      const resultado = recTotal - despTotal
      acum += resultado

      const temDados = recPago > 0 || despPago > 0 || recPend > 0 || despPend > 0 || despPrev > 0

      return { nome, mes, isPast, isAtual, isFuturo, recTotal, despTotal, resultado, acum, temDados }
    })
  }, [movs, anoSel, anoAtual, mesAtual])

  // KPIs: apenas o que foi confirmado (Pago/Faturado) até o mês atual
  const ytd          = mesesData.filter(m => m.isPast || m.isAtual)
  const kpiReceitas  = ytd.reduce((s, m) => s + m.recTotal, 0)
  const kpiDespesas  = ytd.reduce((s, m) => s + m.despTotal, 0)
  const kpiResultado = kpiReceitas - kpiDespesas
  const kpiAcumDez   = mesesData[11].acum

  const chartData = mesesData.map(m => ({
    nome:      m.nome,
    receitas:  +m.recTotal.toFixed(2),
    despesas:  +m.despTotal.toFixed(2),
    acumulado: +m.acum.toFixed(2),
  }))

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null
    const nomes: Record<string, string> = { receitas: 'Receitas', despesas: 'Despesas', acumulado: 'Acumulado' }
    return (
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', fontSize: 12, minWidth: 170 }}>
        <div style={{ fontWeight: 700, marginBottom: 8, color: 'var(--text)' }}>{label}</div>
        {payload.map((p: any) => (
          <div key={p.dataKey} style={{ color: p.color, marginBottom: 3 }}>
            {nomes[p.dataKey]}: {fmt(p.value)}
          </div>
        ))}
      </div>
    )
  }

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1100, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Fluxo de Caixa</h1>
        <p style={{ color: 'var(--text-2)', fontSize: 13, margin: '4px 0 0' }}>
          Evolução mensal de receitas e despesas · {anoSel}
        </p>
      </div>

      {/* Seletor de ano */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        {[anoAtual - 1, anoAtual, anoAtual + 1].map(ano => (
          <button key={ano} onClick={() => setAnoSel(ano)} style={{
            padding: '6px 18px', borderRadius: 8, fontSize: 14, cursor: 'pointer',
            border: '1px solid var(--border)', transition: 'all 0.15s',
            background: anoSel === ano ? '#667eea' : 'var(--bg-card)',
            color:      anoSel === ano ? '#fff'    : 'var(--text-2)',
            fontWeight: anoSel === ano ? 700       : 400,
          }}>
            {ano}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ color: 'var(--text-3)', padding: 60, textAlign: 'center', fontSize: 14 }}>Carregando...</div>
      ) : (<>

        {/* KPI Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
          {([
            { label: 'Receitas',      value: kpiReceitas,  sub: 'Recebido no período',   cor: '#22c55e' },
            { label: 'Despesas',      value: kpiDespesas,  sub: 'Pago no período',        cor: '#ef4444' },
            { label: 'Resultado',     value: kpiResultado, sub: 'Receitas − Despesas',    cor: kpiResultado  >= 0 ? '#22c55e' : '#ef4444' },
            { label: 'Projeção Dez',  value: kpiAcumDez,   sub: 'Acumulado projetado',    cor: '#667eea' },
          ] as { label: string; value: number; sub: string; cor: string }[]).map(({ label, value, sub, cor }) => (
            <div key={label} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderTop: `3px solid ${cor}`, borderRadius: 12, padding: '16px 20px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', color: cor, marginBottom: 8 }}>{label}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: (label === 'Resultado' || label === 'Projeção Dez') ? cor : 'var(--text)' }}>
                {fmt(value)}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>{sub}</div>
            </div>
          ))}
        </div>

        {/* Gráfico */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px 16px 10px', marginBottom: 24 }}>
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
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
              <Line yAxisId="linha" type="monotone" dataKey="acumulado" stroke="#667eea" strokeWidth={2.5}
                dot={{ r: 3, fill: '#667eea' }} activeDot={{ r: 5 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Tabela mensal */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--bg-row2)', borderBottom: '1px solid var(--border)' }}>
                {['Mês', 'Receitas', 'Despesas', 'Resultado', 'Acumulado'].map((h, i) => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: i === 0 ? 'left' : 'right', fontWeight: 600, color: 'var(--text-2)', fontSize: 12 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {mesesData.map((m, i) => (
                <tr key={m.mes} style={{
                  background:    m.isAtual ? 'var(--bg-info-soft)' : i % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-row)',
                  borderBottom:  '1px solid var(--border)',
                  opacity:       m.isFuturo && !m.temDados ? 0.4 : 1,
                }}>
                  <td style={{ padding: '10px 16px', color: m.isAtual ? 'var(--text)' : 'var(--text-2)', fontWeight: m.isAtual ? 700 : 400 }}>
                    {m.nome}
                    {m.isAtual  && <span style={{ marginLeft: 8, fontSize: 10, color: '#667eea', fontWeight: 700, background: '#667eea18', padding: '1px 7px', borderRadius: 4 }}>atual</span>}
                    {m.isFuturo && m.temDados && <span style={{ marginLeft: 8, fontSize: 10, color: 'var(--text-3)' }}>projetado</span>}
                  </td>
                  <td style={{ padding: '10px 16px', textAlign: 'right', color: '#22c55e', fontWeight: m.recTotal > 0 ? 600 : 400 }}>
                    {m.recTotal > 0 ? fmt(m.recTotal) : <span style={{ color: 'var(--text-3)' }}>—</span>}
                  </td>
                  <td style={{ padding: '10px 16px', textAlign: 'right', color: 'var(--text-danger)', fontWeight: m.despTotal > 0 ? 600 : 400 }}>
                    {m.despTotal > 0 ? fmt(m.despTotal) : <span style={{ color: 'var(--text-3)' }}>—</span>}
                  </td>
                  <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 700, color: m.resultado >= 0 ? '#22c55e' : '#ef4444' }}>
                    {m.temDados
                      ? <>{m.resultado >= 0 ? '+' : ''}{fmt(m.resultado)}</>
                      : <span style={{ color: 'var(--text-3)' }}>—</span>}
                  </td>
                  <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 600, color: m.acum >= 0 ? 'var(--text)' : '#ef4444' }}>
                    {m.temDados || m.acum !== 0 ? fmt(m.acum) : <span style={{ color: 'var(--text-3)' }}>—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: 'var(--bg-row2)', borderTop: '2px solid var(--border)' }}>
                <td style={{ padding: '10px 16px', fontWeight: 700, color: 'var(--text-2)', fontSize: 12 }}>Total {anoSel}</td>
                <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 700, color: '#22c55e' }}>{fmt(kpiReceitas)}</td>
                <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 700, color: '#ef4444' }}>{fmt(kpiDespesas)}</td>
                <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 700, color: kpiResultado >= 0 ? '#22c55e' : '#ef4444' }}>
                  {kpiResultado >= 0 ? '+' : ''}{fmt(kpiResultado)}
                </td>
                <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 700, color: kpiAcumDez >= 0 ? 'var(--text)' : '#ef4444' }}>
                  {fmt(kpiAcumDez)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

      </>)}
    </div>
  )
}
