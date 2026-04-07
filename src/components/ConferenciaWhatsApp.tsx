import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const HOUSEHOLD_ID = 'fdfc5a94-c5e4-42d1-b1c2-015dfa492556'

type Rascunho = {
  id: string
  estabelecimento: string
  descricao_final?: string
  valor_total: number
  data_compra: string
  categoria_id: number | null
  categoria_sugerida: string | null
  metodo_pagamento: string
  conta_origem_destino: string | null
  cartao_id: number | null
  cartao_nome: string | null
  parcelas: number
  numero_whatsapp: string
  nome_remetente: string
  situacao: string
  created_at: string
}

type Categoria = { id: number; nome: string }
type Conta = { nome: string }
type Cartao = { id: number; nome: string; data_fechamento: number; data_vencimento: number }

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtData = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('pt-BR')

function calcularDataPagamento(dataCompra: string, cartao: Cartao): string {
  const d = new Date(dataCompra + 'T12:00:00')
  const fechMesCompra = new Date(d.getFullYear(), d.getMonth(), cartao.data_fechamento)
  const dataFechReal = d <= fechMesCompra
    ? fechMesCompra
    : new Date(d.getFullYear(), d.getMonth() + 1, cartao.data_fechamento)
  let venc: Date
  if (cartao.data_vencimento < cartao.data_fechamento)
    venc = new Date(dataFechReal.getFullYear(), dataFechReal.getMonth() + 1, cartao.data_vencimento)
  else
    venc = new Date(dataFechReal.getFullYear(), dataFechReal.getMonth(), cartao.data_vencimento)
  return venc.toISOString().split('T')[0]
}

const cor = {
  bg: '#f5f0e8',
  card: '#ffffff',
  texto: '#1a202c',
  sub: '#64748b',
  borda: '#e2e8f0',
  input: '#f7fafc',
}

export default function ConferenciaWhatsApp() {
  const [rascunhos, setRascunhos] = useState<Rascunho[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [contas, setContas] = useState<Conta[]>([])
  const [cartoes, setCartoes] = useState<Cartao[]>([])
  const [loading, setLoading] = useState(true)
  const [processando, setProcessando] = useState<string | null>(null)
  const [editando, setEditando] = useState<Record<string, Partial<Rascunho>>>({})

  const carregar = useCallback(async () => {
    setLoading(true)
    const [{ data: r }, { data: cats }, { data: conts }, { data: carts }] = await Promise.all([
      supabase.from('cupons_pendentes').select('*').eq('household_id', HOUSEHOLD_ID).eq('origem', 'whatsapp').eq('situacao', 'pendente').order('created_at', { ascending: false }),
      supabase.from('categorias').select('id, nome').eq('household_id', HOUSEHOLD_ID).eq('tipo', 'Despesa').order('nome'),
      supabase.from('contas').select('nome').eq('household_id', HOUSEHOLD_ID).eq('ativo', true).eq('tipo', 'corrente').order('nome'),
      supabase.from('cartoes').select('id, nome, data_fechamento, data_vencimento').eq('household_id', HOUSEHOLD_ID).eq('ativo', true).order('nome'),
    ])
    setRascunhos((r || []).map(item => ({
      ...item,
      metodo_pagamento: item.metodo_pagamento === 'Credito' ? 'Crédito'
        : item.metodo_pagamento === 'Debito' ? 'Débito'
        : item.metodo_pagamento
    })))
    setCategorias(cats || [])
    setContas(conts || [])
    setCartoes(carts || [])
    setLoading(false)
  }, [])

  useEffect(() => { carregar() }, [carregar])

  const getEdicao = (id: string, campo: keyof Rascunho, valorOriginal: any) => {
    return editando[id]?.[campo] ?? valorOriginal
  }

  const setEdicao = (id: string, campo: keyof Rascunho, valor: any) => {
    setEditando(prev => ({ ...prev, [id]: { ...prev[id], [campo]: valor } }))
  }

  const confirmar = async (r: Rascunho) => {
    setProcessando(r.id)
    const edicao = editando[r.id] || {}
    const descricao = (edicao.descricao_final as string) || r.estabelecimento
    const valor = Number(edicao.valor_total ?? r.valor_total)
    const categoriaId = (edicao.categoria_id as number) ?? r.categoria_id
    const metodo = (edicao.metodo_pagamento as string) ?? r.metodo_pagamento
    const conta = (edicao.conta_origem_destino as string) ?? r.conta_origem_destino
    const cartaoId = (edicao.cartao_id as number) ?? r.cartao_id
    const parcelas = Number(edicao.parcelas ?? r.parcelas ?? 1)
    const data = r.data_compra
    const isCredito = metodo === 'Crédito'
    const cartaoNome = cartoes.find(c => c.id === cartaoId)?.nome || r.cartao_nome || ''
    const metodoFinal = isCredito ? cartaoNome : metodo

    if (isCredito && parcelas > 1) {
      const valorParcela = Number((valor / parcelas).toFixed(2))
      const inserts = []
      for (let i = 0; i < parcelas; i++) {
        const cartaoObj = cartoes.find(c => c.id === cartaoId) || { id: 0, nome: '', data_fechamento: 1, data_vencimento: 10 }
        const dataPrimeiraParcela = calcularDataPagamento(data, cartaoObj)
        const dataBase = new Date(dataPrimeiraParcela + 'T12:00:00')
        dataBase.setMonth(dataBase.getMonth() + i)
        inserts.push({
          household_id: HOUSEHOLD_ID, tipo: 'Despesa', descricao,
          valor: i === parcelas - 1 ? Number((valor - valorParcela * (parcelas - 1)).toFixed(2)) : valorParcela,
          data_movimentacao: data, data_pagamento: dataBase.toISOString().split('T')[0],
          categoria_id: categoriaId || null, cartao_id: cartaoId || null,
          metodo_pagamento: metodoFinal, situacao: 'Pendente',
          numero_parcela: `Parcela ${i + 1}/${parcelas}`, forma_pagamento: 'Parcelado', classificacao: 'Variável',
        })
      }
      const { error } = await supabase.from('movimentacoes').insert(inserts)
      if (error) { setProcessando(null); return }
    } else {
      const { error } = await supabase.from('movimentacoes').insert({
        household_id: HOUSEHOLD_ID, tipo: 'Despesa', descricao, valor,
        data_movimentacao: data,
        data_pagamento: isCredito
          ? calcularDataPagamento(data, cartoes.find(c => c.id === cartaoId) || { id: 0, nome: '', data_fechamento: 1, data_vencimento: 10 })
          : data,
        categoria_id: categoriaId || null,
        cartao_id: isCredito ? (cartaoId || null) : null,
        conta_origem_destino: !isCredito ? (conta || null) : null,
        metodo_pagamento: metodoFinal,
        situacao: isCredito ? 'Pendente' : 'Pago',
        numero_parcela: 'Parcela 1/1', forma_pagamento: 'À Vista', classificacao: 'Variável',
      })
      if (error) { setProcessando(null); return }
    }

    await supabase.from('cupons_pendentes').update({ situacao: 'confirmado', descricao_final: descricao }).eq('id', r.id)
    setRascunhos(prev => prev.filter(x => x.id !== r.id))
    setEditando(prev => { const n = { ...prev }; delete n[r.id]; return n })
    setProcessando(null)
  }

  const rejeitar = async (id: string) => {
    if (!confirm('Rejeitar este lançamento?')) return
    await supabase.from('cupons_pendentes').update({ situacao: 'rejeitado' }).eq('id', id)
    setRascunhos(prev => prev.filter(x => x.id !== id))
  }

  if (loading) return (
    <div style={{ background: cor.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: cor.sub }}>Carregando...</p>
    </div>
  )

  return (
    <div style={{ background: cor.bg, minHeight: '100vh', padding: 24 }}>
      <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: cor.texto }}>📱 Conferência WhatsApp</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: cor.sub }}>Revise e confirme os lançamentos enviados pelo bot</p>
        </div>
        <button onClick={carregar} style={{ padding: '8px 16px', background: cor.card, border: `1px solid ${cor.borda}`, borderRadius: 8, color: cor.sub, fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>
          🔄 Atualizar
        </button>
      </div>

      {rascunhos.length === 0 ? (
        <div style={{ background: cor.card, border: `1px solid ${cor.borda}`, borderRadius: 16, padding: 48, textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
          <p style={{ color: cor.texto, fontWeight: 600, fontSize: 16, margin: 0 }}>Nenhum lançamento pendente!</p>
          <p style={{ color: cor.sub, fontSize: 13, marginTop: 8 }}>Envie <em>gastei [valor] [descrição]</em> no WhatsApp para criar um.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {rascunhos.map(r => {
            const metodoAtual = getEdicao(r.id, 'metodo_pagamento', r.metodo_pagamento) as string
            const isCredito = metodoAtual === 'Crédito'
            const parcelasAtual = Number(getEdicao(r.id, 'parcelas', r.parcelas) ?? 1)
            const valorAtual = Number(getEdicao(r.id, 'valor_total', r.valor_total))
            const categoriaAtual = getEdicao(r.id, 'categoria_id', r.categoria_id)
            const contaAtual = getEdicao(r.id, 'conta_origem_destino', r.conta_origem_destino)
            const cartaoAtual = getEdicao(r.id, 'cartao_id', r.cartao_id)

            const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: cor.sub, textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 4 }
            const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 12px', background: cor.input, border: `1px solid ${cor.borda}`, borderRadius: 8, color: cor.texto, fontSize: 13, outline: 'none', boxSizing: 'border-box' }

            return (
              <div key={r.id} style={{ background: cor.card, border: `1px solid ${cor.borda}`, borderRadius: 16, padding: 24, borderLeft: '3px solid #0d7280', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                  <p style={{ margin: 0, fontSize: 12, color: cor.sub }}>
                    📱 {r.nome_remetente || r.numero_whatsapp} · {new Date(r.created_at).toLocaleString('pt-BR')}
                  </p>
                  <span style={{ background: '#fef3c7', color: '#92400e', padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600 }}>Pendente</span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={labelStyle}>Descrição</label>
                    <input value={getEdicao(r.id, 'descricao_final', r.estabelecimento) as string} onChange={e => setEdicao(r.id, 'descricao_final', e.target.value)} style={{ ...inputStyle, fontSize: 14, fontWeight: 600 }} />
                  </div>

                  <div>
                    <label style={labelStyle}>Valor</label>
                    <input type="number" step="0.01" value={valorAtual} onChange={e => setEdicao(r.id, 'valor_total', e.target.value)} style={{ ...inputStyle, fontWeight: 700 }} />
                  </div>

                  <div>
                    <label style={labelStyle}>Data</label>
                    <div style={{ ...inputStyle, color: cor.sub }}>{fmtData(r.data_compra)}</div>
                  </div>

                  <div>
                    <label style={labelStyle}>Categoria</label>
                    <select value={categoriaAtual as number || ''} onChange={e => setEdicao(r.id, 'categoria_id', Number(e.target.value))} style={inputStyle}>
                      <option value="">Selecione...</option>
                      {categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                    </select>
                    {r.categoria_sugerida && !categoriaAtual && (
                      <p style={{ margin: '4px 0 0', fontSize: 11, color: '#0d7280' }}>💡 Sugerida: {r.categoria_sugerida}</p>
                    )}
                  </div>

                  <div>
                    <label style={labelStyle}>Pagamento</label>
                    <select value={metodoAtual} onChange={e => setEdicao(r.id, 'metodo_pagamento', e.target.value)} style={inputStyle}>
                      <option value="PIX">PIX</option>
                      <option value="Débito">Débito</option>
                      <option value="Crédito">Crédito</option>
                    </select>
                  </div>

                  {!isCredito && (
                    <div>
                      <label style={labelStyle}>Conta</label>
                      <select value={contaAtual as string || ''} onChange={e => setEdicao(r.id, 'conta_origem_destino', e.target.value)} style={inputStyle}>
                        <option value="">Selecione...</option>
                        {contas.map(c => <option key={c.nome} value={c.nome}>{c.nome}</option>)}
                      </select>
                    </div>
                  )}

                  {isCredito && (
                    <div>
                      <label style={labelStyle}>Cartão</label>
                      <select value={cartaoAtual as number || ''} onChange={e => setEdicao(r.id, 'cartao_id', Number(e.target.value))} style={inputStyle}>
                        <option value="">Selecione...</option>
                        {cartoes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                      </select>
                    </div>
                  )}

                  {isCredito && (
                    <div>
                      <label style={labelStyle}>Parcelas</label>
                      <select value={parcelasAtual} onChange={e => setEdicao(r.id, 'parcelas', Number(e.target.value))} style={inputStyle}>
                        {[1, 2, 3, 4, 5].map(n => (
                          <option key={n} value={n}>{n === 1 ? 'À vista' : `${n}x ${fmt(valorAtual / n)}`}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
                  <button onClick={() => rejeitar(r.id)} disabled={processando === r.id} style={{ padding: '9px 20px', background: 'transparent', border: '1px solid #ef4444', borderRadius: 8, color: '#ef4444', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                    ✕ Rejeitar
                  </button>
                  <button onClick={() => confirmar(r)} disabled={processando === r.id} style={{ padding: '9px 20px', background: '#22c55e', border: 'none', borderRadius: 8, color: 'white', fontWeight: 600, fontSize: 13, cursor: processando === r.id ? 'not-allowed' : 'pointer', opacity: processando === r.id ? 0.7 : 1 }}>
                    {processando === r.id ? 'Salvando...' : '✓ Confirmar'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
