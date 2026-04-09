import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

type Cartao = { id: number; nome: string; data_fechamento: number; data_vencimento: number }
type FaturaAberta = {
  cartao_id: number; cartao_nome: string; data_vencimento: string; total: number; quantidade: number
}

const inputStyle = {
  width: '100%', padding: '8px 10px', borderRadius: 6,
  backgroundColor: '#fff', border: '1px solid #d1d5db',
  color: '#111827', boxSizing: 'border-box' as const, marginBottom: 10, fontSize: 13,
}
const labelStyle: React.CSSProperties = {
  color: '#374151', fontSize: 12, fontWeight: 600, display: 'block',
  marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em'
}

type Props = { householdId: string; cartoes: Cartao[]; contas: { id: number; nome: string }[] }

export default function LancamentoFatura({ householdId, cartoes, contas }: Props) {
  const [cartaoId, setCartaoId] = useState('')
  const [faturas, setFaturas] = useState<FaturaAberta[]>([])
  const [faturaSelecionada, setFaturaSelecionada] = useState<FaturaAberta | null>(null)
  const [contaId, setContaId] = useState('')
  const [dataPagamento, setDataPagamento] = useState(hoje())
  const [valorPago, setValorPago] = useState('')
  const [mensagem, setMensagem] = useState('')
  const [loading, setLoading] = useState(false)

  function hoje() { return new Date().toISOString().split('T')[0] }

  useEffect(() => {
    if (!cartaoId) { setFaturas([]); setFaturaSelecionada(null); return }
    carregarFaturas()
  }, [cartaoId])

  const carregarFaturas = async () => {
    const { data, error } = await supabase
      .from('movimentacoes').select('data_pagamento, valor, cartao_id')
      .eq('cartao_id', Number(cartaoId)).in('situacao', ['Pendente', 'Pago'])
    if (error || !data) return
    const grupos: Record<string, FaturaAberta> = {}
    const cartao = cartoes.find(c => c.id === Number(cartaoId))
    data.forEach((m: any) => {
      const key = m.data_pagamento
      if (!grupos[key]) grupos[key] = { cartao_id: Number(cartaoId), cartao_nome: cartao?.nome ?? '', data_vencimento: key, total: 0, quantidade: 0 }
      grupos[key].total += parseFloat(m.valor)
      grupos[key].quantidade += 1
    })
    setFaturas(Object.values(grupos).sort((a, b) => a.data_vencimento.localeCompare(b.data_vencimento)))
  }

  const selecionarFatura = (f: FaturaAberta) => {
    setFaturaSelecionada(f); setValorPago(f.total.toFixed(2)); setMensagem('')
  }

  const pagarFatura = async () => {
    if (!faturaSelecionada || !contaId || !valorPago || !dataPagamento)
      return setMensagem('Preencha todos os campos.')
    setLoading(true); setMensagem('')
    const conta = contas.find(c => c.id === Number(contaId))
    const dataVenc = new Date(faturaSelecionada.data_vencimento + 'T12:00:00')
    const mesAno = dataVenc.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }).toUpperCase()
    const nomeCartaoSemCredito = faturaSelecionada.cartao_nome.replace('Crédito ', '')

    // ← CORREÇÃO: incluir cartao_id no pagamento da fatura
    // O DRE usa cartao_id + data_pagamento para fazer o rateio proporcional por categoria
    const { error: errInsert } = await supabase.from('movimentacoes').insert({
      household_id: householdId,
      data_movimentacao: dataPagamento,
      data_pagamento: faturaSelecionada.data_vencimento, // ← data de vencimento da fatura (não do pagamento)
      tipo: 'Transferência',
      categoria_id: null,
      descricao: `PAGAMENTO FATURA ${nomeCartaoSemCredito} ${mesAno}`,
      valor: parseFloat(valorPago),
      metodo_pagamento: 'Transferência',
      cartao_id: faturaSelecionada.cartao_id, // ← ADICIONADO: essencial para o DRE fazer o rateio
      conta_origem_destino: conta?.nome ?? '',
      forma_pagamento: 'À Vista',
      numero_parcela: 'Parcela 1/1',
      situacao: 'Pago',
      classificacao: 'Pagamento de Fatura',
    })

    if (errInsert) { setMensagem('Erro ao registrar pagamento: ' + errInsert.message); setLoading(false); return }

    const { error: errUpdate } = await supabase.from('movimentacoes')
      .update({ situacao: 'Faturado' })
      .eq('cartao_id', faturaSelecionada.cartao_id)
      .eq('data_pagamento', faturaSelecionada.data_vencimento)
      .in('situacao', ['Pendente', 'Pago'])

    if (errUpdate) {
      setMensagem('Pagamento registrado, mas erro ao atualizar despesas: ' + errUpdate.message)
    } else {
      setMensagem(`Fatura paga! ${faturaSelecionada.quantidade} despesa(s) marcadas como Faturado.`)
      setFaturaSelecionada(null); setValorPago(''); setContaId(''); carregarFaturas()
    }
    setLoading(false)
  }

  const formatarData = (iso: string) => {
    const d = new Date(iso + 'T12:00:00')
    return d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  }
  const formatarValor = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  return (
    <div style={{ background: '#fff', padding: 24, borderRadius: 12, border: '1px solid #e5e7eb' }}>
      {mensagem && (
        <div style={{
          color: mensagem.startsWith('Erro') ? '#991b1b' : '#166534',
          background: mensagem.startsWith('Erro') ? '#fee2e2' : '#dcfce7',
          border: `1px solid ${mensagem.startsWith('Erro') ? '#fca5a5' : '#86efac'}`,
          marginBottom: 16, padding: '10px 14px', borderRadius: 6, fontSize: 13
        }}>{mensagem}</div>
      )}

      <label style={labelStyle}>Selecione o Cartão *</label>
      <select style={inputStyle} value={cartaoId} onChange={e => { setCartaoId(e.target.value); setFaturaSelecionada(null) }}>
        <option value="">Selecione...</option>
        {cartoes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
      </select>

      {cartaoId && faturas.length === 0 && (
        <p style={{ color: '#9ca3af', padding: 16, textAlign: 'center', background: '#ede8df', borderRadius: 8, border: '1px solid #e5e7eb' }}>
          Nenhuma fatura em aberto para este cartão.
        </p>
      )}

      {faturas.length > 0 && (
        <>
          <label style={labelStyle}>Faturas em Aberto — selecione para pagar</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            {faturas.map(f => (
              <div key={f.data_vencimento} onClick={() => selecionarFatura(f)} style={{
                padding: '12px 16px', borderRadius: 8, cursor: 'pointer',
                background: faturaSelecionada?.data_vencimento === f.data_vencimento ? '#eff6ff' : '#f9fafb',
                border: `2px solid ${faturaSelecionada?.data_vencimento === f.data_vencimento ? '#2563eb' : '#e5e7eb'}`,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center'
              }}>
                <div>
                  <span style={{ color: '#111827', fontWeight: 600, fontSize: 14 }}>{formatarData(f.data_vencimento)}</span>
                  <span style={{ color: '#9ca3af', fontSize: 12, marginLeft: 8 }}>{f.quantidade} lançamento(s)</span>
                </div>
                <span style={{ color: '#d97706', fontWeight: 700, fontSize: 15 }}>{formatarValor(f.total)}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {faturaSelecionada && (
        <>
          <div style={{ background: '#eff6ff', padding: 14, borderRadius: 8, marginBottom: 16, border: '1px solid #bfdbfe' }}>
            <p style={{ color: '#6b7280', fontSize: 12, margin: 0 }}>Fatura selecionada</p>
            <p style={{ color: '#1e40af', fontWeight: 600, margin: '4px 0 0', fontSize: 14 }}>
              {faturaSelecionada.cartao_nome} — {formatarData(faturaSelecionada.data_vencimento)}
            </p>
            <p style={{ color: '#d97706', fontWeight: 700, margin: '4px 0 0' }}>
              Total: {formatarValor(faturaSelecionada.total)}
            </p>
          </div>

          <label style={labelStyle}>Data do Pagamento *</label>
          <input style={inputStyle} type="date" value={dataPagamento} onChange={e => setDataPagamento(e.target.value)} />

          <label style={labelStyle}>Conta de Origem *</label>
          <select style={inputStyle} value={contaId} onChange={e => setContaId(e.target.value)}>
            <option value="">Selecione...</option>
            {contas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>

          <label style={labelStyle}>Valor Pago (R$) *</label>
          <input style={inputStyle} type="number" step="0.01" value={valorPago} onChange={e => setValorPago(e.target.value)} />

          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 12, color: '#15803d' }}>
            💡 O pagamento parcial da fatura será rateado proporcionalmente entre as categorias no DRE.
            <br/>Total da fatura: <strong>{formatarValor(faturaSelecionada.total)}</strong> · Pagando: <strong>{formatarValor(parseFloat(valorPago || '0'))}</strong>
            {parseFloat(valorPago || '0') < faturaSelecionada.total && (
              <span style={{ color: '#d97706', marginLeft: 8 }}>
                ({((parseFloat(valorPago || '0') / faturaSelecionada.total) * 100).toFixed(0)}% da fatura)
              </span>
            )}
          </div>

          <button onClick={pagarFatura} disabled={loading} style={{
            width: '100%', padding: '12px 20px', marginTop: 8,
            backgroundColor: '#22c55e', color: 'white', border: 'none',
            borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 14
          }}>
            {loading ? 'Processando...' : 'Confirmar Pagamento'}
          </button>
        </>
      )}
    </div>
  )
}
