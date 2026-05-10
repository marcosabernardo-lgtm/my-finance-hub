import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

type Previsto = {
  id: number
  data_movimentacao: string
  data_pagamento: string
  descricao: string
  valor: number
  metodo_pagamento: string
  numero_parcela: string
  forma_pagamento: string
  situacao: string
  conta_origem_destino: string
  categoria_id: number
  cartao_id: number | null
  categoria_nome?: string
  cartao_nome?: string
}

type CartaoComTotal = {
  id: number
  nome: string
  total: number
  quantidade: number
}

const formatarValor = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const formatarData = (iso: string) => {
  const d = new Date(iso + 'T12:00:00')
  return d.toLocaleDateString('pt-BR')
}

const nomesMeses = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'
]

export default function ConfirmarDebito() {
  const [modo, setModo] = useState<'debito' | 'credito' | null>(null)
  const [cartaoSelecionado, setCartaoSelecionado] = useState<number | null>(null)
  const [cartoesComPrevisto, setCartoesComPrevisto] = useState<CartaoComTotal[]>([])
  const [previstos, setPrevistos] = useState<Previsto[]>([])
  const [loading, setLoading] = useState(false)
  const [mensagem, setMensagem] = useState('')
  const [filtroMes, setFiltroMes] = useState(mesAtual())
  const [editandoId, setEditandoId] = useState<number | null>(null)
  const [valorEditado, setValorEditado] = useState<string>('')

  function mesAtual() {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }

  const getDateRange = useCallback(() => {
    const [ano, mes] = filtroMes.split('-')
    const dataInicio = `${ano}-${mes}-01`
    const ultimoDia = new Date(parseInt(ano), parseInt(mes), 0).getDate()
    const dataFim = `${ano}-${mes}-${String(ultimoDia).padStart(2, '0')}`
    return { dataInicio, dataFim }
  }, [filtroMes])

  // Carregar cartões com lançamentos previstos no mês
  const carregarCartoes = useCallback(async () => {
    const { dataInicio, dataFim } = getDateRange()
    const { data } = await supabase
      .from('movimentacoes')
      .select('cartao_id, valor, cartoes(nome)')
      .eq('situacao', 'Previsto')
      .not('cartao_id', 'is', null)
      .gte('data_pagamento', dataInicio)
      .lte('data_pagamento', dataFim)

    if (data) {
      const mapa: Record<number, CartaoComTotal> = {}
      for (const m of data as any[]) {
        if (!m.cartao_id) continue
        if (!mapa[m.cartao_id]) {
          mapa[m.cartao_id] = { id: m.cartao_id, nome: m.cartoes?.nome ?? '—', total: 0, quantidade: 0 }
        }
        mapa[m.cartao_id].total += Number(m.valor)
        mapa[m.cartao_id].quantidade++
      }
      setCartoesComPrevisto(Object.values(mapa).sort((a, b) => b.total - a.total))
    }
  }, [getDateRange])

  // Carregar lançamentos previstos conforme modo/cartão
  const carregarPrevistos = useCallback(async () => {
    if (!modo) return
    const { dataInicio, dataFim } = getDateRange()

    let query = supabase
      .from('movimentacoes')
      .select('*, categorias(nome), cartoes(nome)')
      .eq('situacao', 'Previsto')
      .gte('data_pagamento', dataInicio)
      .lte('data_pagamento', dataFim)
      .order('data_pagamento')

    if (modo === 'debito') {
      query = query.in('metodo_pagamento', ['Débito', 'PIX', 'Dinheiro', 'Boleto', 'Transferência'])
    } else if (modo === 'credito' && cartaoSelecionado) {
      query = query.eq('cartao_id', cartaoSelecionado)
    } else if (modo === 'credito' && !cartaoSelecionado) {
      setPrevistos([])
      return
    }

    const { data } = await query
    if (data) {
      setPrevistos(data.map((m: any) => ({
        ...m,
        categoria_nome: m.categorias?.nome ?? '',
        cartao_nome: m.cartoes?.nome ?? '',
      })))
    }
  }, [modo, cartaoSelecionado, getDateRange])

  useEffect(() => { carregarCartoes() }, [carregarCartoes])
  useEffect(() => { carregarPrevistos() }, [carregarPrevistos])

  const confirmarDebito = async (p: Previsto, valorFinal?: number) => {
    setLoading(true)
    setMensagem('')
    const isCartao = !!p.cartao_id
    const novaSituacao = isCartao ? 'Pendente' : 'Pago'
    const updatePayload: any = { situacao: novaSituacao }
    if (valorFinal !== undefined && valorFinal !== p.valor) {
      updatePayload.valor = valorFinal
    }
    const { error } = await supabase.from('movimentacoes').update(updatePayload).eq('id', p.id)
    if (error) setMensagem('Erro: ' + error.message)
    else {
      setMensagem(`"${p.descricao}" confirmado como ${novaSituacao}!`)
      setEditandoId(null)
      carregarPrevistos()
      carregarCartoes()
    }
    setLoading(false)
  }

  const iniciarEdicao = (p: Previsto) => {
    setEditandoId(p.id)
    setValorEditado(String(p.valor).replace('.', ','))
  }

  const cancelarEdicao = () => {
    setEditandoId(null)
    setValorEditado('')
  }

  const confirmarComValor = (p: Previsto) => {
    const valorLimpo = valorEditado.replace(',', '.')
    const valorFinal = parseFloat(valorLimpo)
    if (isNaN(valorFinal) || valorFinal <= 0) {
      setMensagem('Valor inválido!')
      return
    }
    confirmarDebito(p, valorFinal)
  }

  const confirmarTodos = async () => {
    if (!confirm(`Confirmar todos os ${previstos.length} lançamentos previstos?`)) return
    setLoading(true)
    setMensagem('')
    for (const p of previstos) {
      const isCartao = !!p.cartao_id
      await supabase.from('movimentacoes').update({ situacao: isCartao ? 'Pendente' : 'Pago' }).eq('id', p.id)
    }
    setMensagem(`${previstos.length} lançamentos confirmados!`)
    carregarPrevistos()
    carregarCartoes()
    setLoading(false)
  }

  const totalPrevistos = previstos.reduce((acc, p) => acc + p.valor, 0)

  const getMetodoInfo = (p: Previsto) => {
    if (p.cartao_nome) return { label: p.cartao_nome, bg: 'var(--badge-faturado-bg)', color: 'var(--badge-faturado-fg)' }
    if (p.metodo_pagamento === 'Débito') return { label: `Débito — ${p.conta_origem_destino || ''}`, bg: 'var(--badge-pendente-bg)', color: 'var(--badge-pendente-fg)' }
    if (p.metodo_pagamento === 'PIX') return { label: `PIX — ${p.conta_origem_destino || ''}`, bg: 'var(--badge-pago-bg)', color: 'var(--badge-pago-fg)' }
    return { label: p.metodo_pagamento, bg: 'var(--badge-neutral-bg)', color: 'var(--badge-neutral-fg)' }
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--text-1)', margin: 0 }}>Confirmar Débitos</h1>
        <p style={{ color: 'var(--text-2)', fontSize: 13, marginTop: 4 }}>
          Confirme lançamentos previstos para incluí-los no controle financeiro.
        </p>
      </div>

      {/* Filtro mês/ano */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        <select
          value={filtroMes.split('-')[1]}
          onChange={e => { setFiltroMes(`${filtroMes.split('-')[0]}-${e.target.value}`); setModo(null); setCartaoSelecionado(null) }}
          style={{ padding: '7px 12px', background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-1)', borderRadius: 6, fontSize: 13 }}>
          {nomesMeses.map((m, i) => (
            <option key={i} value={String(i + 1).padStart(2, '0')}>{m}</option>
          ))}
        </select>
        <input
          type="number" value={filtroMes.split('-')[0]}
          onChange={e => { setFiltroMes(`${e.target.value}-${filtroMes.split('-')[1]}`); setModo(null); setCartaoSelecionado(null) }}
          style={{ width: 80, padding: '7px 12px', background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-1)', borderRadius: 6, fontSize: 13 }}
        />
      </div>

      {/* Seletor de modo */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
        <div
          onClick={() => { setModo('debito'); setCartaoSelecionado(null) }}
          style={{
            padding: '20px 24px', borderRadius: 12, cursor: 'pointer', textAlign: 'center',
            border: `2px solid ${modo === 'debito' ? 'var(--border-warning)' : 'var(--border)'}`,
            background: modo === 'debito' ? 'var(--bg-warning-soft)' : 'var(--bg-row2)',
            transition: 'all 0.15s',
          }}
        >
          <div style={{ fontSize: 28, marginBottom: 8 }}>💳</div>
          <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-warning)' }}>Débito / PIX</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>Lançamentos de conta bancária</div>
        </div>

        <div
          onClick={() => { setModo('credito'); setCartaoSelecionado(null) }}
          style={{
            padding: '20px 24px', borderRadius: 12, cursor: 'pointer', textAlign: 'center',
            border: `2px solid ${modo === 'credito' ? 'var(--border-info)' : 'var(--border)'}`,
            background: modo === 'credito' ? 'var(--bg-info-soft)' : 'var(--bg-row2)',
            transition: 'all 0.15s',
          }}
        >
          <div style={{ fontSize: 28, marginBottom: 8 }}>💰</div>
          <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-info)' }}>Cartão de Crédito</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>Selecione o cartão para confirmar</div>
        </div>
      </div>

      {/* Seletor de cartão */}
      {modo === 'credito' && (
        <div style={{ marginBottom: 24 }}>
          {cartoesComPrevisto.length === 0 ? (
            <div style={{ background: 'var(--bg-row)', padding: 20, borderRadius: 10, border: '1px solid var(--border)', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
              Nenhum cartão com lançamentos previstos neste mês.
            </div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {cartoesComPrevisto.map(c => (
                <div
                  key={c.id}
                  onClick={() => setCartaoSelecionado(c.id)}
                  style={{
                    padding: '12px 18px', borderRadius: 10, cursor: 'pointer',
                    border: `2px solid ${cartaoSelecionado === c.id ? 'var(--border-info)' : 'var(--border)'}`,
                    background: cartaoSelecionado === c.id ? 'var(--bg-info-soft)' : 'var(--bg-card)',
                    transition: 'all 0.15s',
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-1)' }}>{c.nome}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>
                    {c.quantidade} lançamento{c.quantidade !== 1 ? 's' : ''} · {formatarValor(c.total)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {mensagem && (
        <div style={{
          color: mensagem.startsWith('Erro') ? 'var(--text-danger)' : 'var(--text-success)',
          background: mensagem.startsWith('Erro') ? 'var(--bg-danger-soft)' : 'var(--bg-success-soft)',
          border: `1px solid ${mensagem.startsWith('Erro') ? 'var(--border-danger)' : 'var(--border-success)'}`,
          marginBottom: 16, padding: '10px 14px', borderRadius: 6, fontSize: 13
        }}>{mensagem}</div>
      )}

      {/* Lista de previstos */}
      {modo && (modo === 'debito' || cartaoSelecionado) && (
        <>
          {previstos.length === 0 ? (
            <div style={{ background: 'var(--bg-row)', padding: 40, borderRadius: 12, textAlign: 'center', border: '1px solid var(--border)' }}>
              <p style={{ color: 'var(--text-3)', fontSize: 15 }}>Nenhum lançamento previsto para este filtro.</p>
            </div>
          ) : (
            <>
              <div style={{ background: 'var(--bg-purple-soft)', padding: '12px 16px', borderRadius: 8, marginBottom: 16, border: '1px solid var(--border-purple)', display: 'flex', gap: 16, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-2)', fontSize: 13 }}>Total previsto:</span>
                  <span style={{ color: 'var(--text-purple)', fontWeight: 700, fontSize: 16 }}>{formatarValor(totalPrevistos)}</span>
                  <span style={{ color: 'var(--text-3)', fontSize: 13 }}>{previstos.length} lançamento(s)</span>
                </div>
                <button onClick={confirmarTodos} disabled={loading} style={{
                  padding: '8px 16px', backgroundColor: '#7c3aed', color: 'white',
                  border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13
                }}>
                  Confirmar Todos ({previstos.length})
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {previstos.map(p => {
                  const metodo = getMetodoInfo(p)
                  return (
                    <div key={p.id} style={{
                      background: 'var(--bg-card)', padding: '14px 16px', borderRadius: 8,
                      border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between',
                      alignItems: 'center', gap: 12
                    }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
                          <span style={{ color: 'var(--text-1)', fontWeight: 600, fontSize: 14 }}>{p.descricao}</span>
                          {p.categoria_nome && (
                            <span style={{ color: 'var(--text-2)', fontSize: 11, background: 'var(--bg-row2)', padding: '2px 6px', borderRadius: 4 }}>
                              {p.categoria_nome}
                            </span>
                          )}
                          <span style={{ color: 'var(--text-purple)', fontSize: 11, background: 'var(--bg-purple-soft)', padding: '2px 6px', borderRadius: 4 }}>
                            {p.numero_parcela}
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                          <span style={{ color: 'var(--text-2)', fontSize: 12 }}>
                            Vence: <strong>{formatarData(p.data_pagamento)}</strong>
                          </span>
                          <span style={{ fontSize: 12, color: metodo.color, background: metodo.bg, padding: '2px 8px', borderRadius: 4 }}>
                            {metodo.label}
                          </span>
                          <span style={{ color: 'var(--text-warning)', fontWeight: 700, fontSize: 14 }}>
                            {formatarValor(p.valor)}
                          </span>
                        </div>
                      </div>
                      {editandoId === p.id ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end', flexShrink: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 12, color: 'var(--text-2)' }}>R$</span>
                            <input
                              type="text"
                              value={valorEditado}
                              onChange={e => setValorEditado(e.target.value.replace(/[^0-9,]/g, ''))}
                              autoFocus
                              style={{
                                width: 90, padding: '6px 8px', border: '2px solid #22c55e',
                                borderRadius: 6, fontSize: 14, fontWeight: 700,
                                color: 'var(--text-1)', outline: 'none', textAlign: 'right',
                              }}
                            />
                          </div>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button
                              onClick={cancelarEdicao}
                              style={{
                                padding: '5px 10px', backgroundColor: 'var(--bg-row2)', color: 'var(--text-2)',
                                border: '1px solid var(--border-input)', borderRadius: 6, cursor: 'pointer',
                                fontWeight: 600, fontSize: 12,
                              }}>
                              Cancelar
                            </button>
                            <button
                              onClick={() => confirmarComValor(p)}
                              disabled={loading}
                              style={{
                                padding: '5px 10px', backgroundColor: '#22c55e', color: 'white',
                                border: 'none', borderRadius: 6, cursor: 'pointer',
                                fontWeight: 600, fontSize: 12,
                              }}>
                              ✓ OK
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => iniciarEdicao(p)}
                          disabled={loading}
                          style={{
                            padding: '7px 14px', backgroundColor: '#22c55e', color: 'white',
                            border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600,
                            whiteSpace: 'nowrap', fontSize: 13, flexShrink: 0
                          }}>
                          Confirmar
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
