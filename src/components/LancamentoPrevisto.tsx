import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

type Categoria = { id: number; nome: string; classificacao: string }
type Cartao = { id: number; nome: string; data_fechamento: number; data_vencimento: number }
type Conta = { id: number; nome: string }

const inputStyle = {
  width: '100%', padding: '8px 10px', borderRadius: 6,
  backgroundColor: '#fff', border: '1px solid #d1d5db',
  color: '#111827', boxSizing: 'border-box' as const, marginBottom: 10, fontSize: 13,
}
const labelStyle: React.CSSProperties = {
  color: '#374151', fontSize: 12, fontWeight: 600, display: 'block',
  marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em'
}
const btnPrimary: React.CSSProperties = {
  padding: '10px 20px', backgroundColor: '#8b5cf6', color: 'white',
  border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600,
  width: '100%', marginTop: 8, fontSize: 13,
}

type Props = { householdId: string; categorias: Categoria[]; cartoes: Cartao[]; contas: Conta[] }

export default function LancamentoPrevisto({ householdId, categorias, cartoes, contas }: Props) {
  const [dataMov, setDataMov] = useState(hoje())
  const [dataPrimeiraParcela, setDataPrimeiraParcela] = useState('')
  const [categoriaId, setCategoriaId] = useState('')
  const [descricao, setDescricao] = useState('')
  const [valorParcela, setValorParcela] = useState('')
  const [metodoPagamento, setMetodoPagamento] = useState('Cartão de Crédito')
  const [cartaoId, setCartaoId] = useState('')
  const [contaId, setContaId] = useState('')
  const [numParcelas, setNumParcelas] = useState('2')
  const [descricoesCategoria, setDescricoesCategoria] = useState<string[]>([])
  const [mensagem, setMensagem] = useState('')
  const [loading, setLoading] = useState(false)

  function hoje() { return new Date().toISOString().split('T')[0] }

  useEffect(() => {
    if (!categoriaId) { setDescricoesCategoria([]); return }
    supabase.from('movimentacoes').select('descricao').eq('categoria_id', Number(categoriaId))
      .then(({ data }) => {
        if (data) {
          const unicas = [...new Set(data.map((d: any) => d.descricao).filter(Boolean))]
          setDescricoesCategoria(unicas as string[])
        }
      })
  }, [categoriaId])

  useEffect(() => {
    if (metodoPagamento === 'Cartão de Crédito' && cartaoId && dataMov) {
      const cartao = cartoes.find(c => c.id === Number(cartaoId))
      if (cartao) {
        const venc = calcularVencimentoCartao(dataMov, cartao)
        setDataPrimeiraParcela(toISO(venc))
      }
    }
  }, [cartaoId, dataMov, metodoPagamento])

  function calcularVencimentoCartao(dataMov: string, cartao: Cartao): Date {
    const d = new Date(dataMov + 'T12:00:00')
    const fechMesCompra = new Date(d.getFullYear(), d.getMonth(), cartao.data_fechamento)
    const dataFechReal = d <= fechMesCompra
      ? fechMesCompra
      : new Date(d.getFullYear(), d.getMonth() + 1, cartao.data_fechamento)
    if (cartao.data_vencimento < cartao.data_fechamento)
      return new Date(dataFechReal.getFullYear(), dataFechReal.getMonth() + 1, cartao.data_vencimento)
    return new Date(dataFechReal.getFullYear(), dataFechReal.getMonth(), cartao.data_vencimento)
  }

  function adicionarMeses(data: Date, meses: number): Date {
    return new Date(data.getFullYear(), data.getMonth() + meses, data.getDate())
  }
  function toISO(data: Date): string { return data.toISOString().split('T')[0] }

  async function salvarPrevisto() {
    if (!categoriaId || !descricao || !valorParcela || !dataMov)
      return setMensagem('Preencha todos os campos obrigatórios.')
    if ((metodoPagamento === 'Débito' || metodoPagamento === 'PIX') && !contaId)
      return setMensagem('Selecione a conta de origem.')
    if ((metodoPagamento === 'Débito' || metodoPagamento === 'PIX') && !dataPrimeiraParcela)
      return setMensagem('Informe a data do vencimento da 1ª parcela.')
    if (metodoPagamento === 'Cartão de Crédito' && !cartaoId)
      return setMensagem('Selecione o cartão.')

    setLoading(true); setMensagem('')

    const valorUnitario = parseFloat(valorParcela)
    const valorTotal = valorUnitario * parseInt(numParcelas)
    const cartao = cartoes.find(c => c.id === Number(cartaoId))
    const conta = contas.find(c => c.id === Number(contaId))
    const categoria = categorias.find(c => c.id === Number(categoriaId))
    const classificacao = categoria?.classificacao ?? ''
    const parcelas = parseInt(numParcelas)
    const primeiraParcelaDate = new Date(dataPrimeiraParcela + 'T12:00:00')
    let registros: any[] = []

    for (let i = 0; i < parcelas; i++) {
      const dataParcela = adicionarMeses(primeiraParcelaDate, i)
      if (metodoPagamento === 'Cartão de Crédito' && cartao) {
        registros.push({
          household_id: householdId, data_movimentacao: toISO(dataParcela),
          data_pagamento: toISO(dataParcela), tipo: 'Despesa',
          categoria_id: Number(categoriaId), classificacao, descricao, valor: valorUnitario,
          metodo_pagamento: cartao.nome, cartao_id: cartao.id,
          forma_pagamento: parcelas > 1 ? `Parcelado ${parcelas}x` : 'À Vista',
          numero_parcela: parcelas > 1 ? `Parcela ${i + 1}/${parcelas}` : 'Parcela 1/1',
          situacao: 'Previsto',
        })
      } else {
        registros.push({
          household_id: householdId, data_movimentacao: toISO(dataParcela),
          data_pagamento: toISO(dataParcela), tipo: 'Despesa',
          categoria_id: Number(categoriaId), classificacao, descricao, valor: valorUnitario,
          metodo_pagamento: metodoPagamento, conta_origem_destino: conta?.nome ?? '',
          forma_pagamento: parcelas > 1 ? `Parcelado ${parcelas}x` : 'À Vista',
          numero_parcela: parcelas > 1 ? `Parcela ${i + 1}/${parcelas}` : 'Parcela 1/1',
          situacao: 'Previsto',
        })
      }
    }

    const { error } = await supabase.from('movimentacoes').insert(registros)
    if (error) {
      setMensagem('Erro: ' + error.message)
    } else {
      const valorTotalFormatado = valorTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
      setMensagem(`${parcelas} lançamento(s) previsto(s) — Total: ${valorTotalFormatado}`)
      setDescricao(''); setValorParcela(''); setCategoriaId('')
      setNumParcelas('2'); setDataPrimeiraParcela('')
    }
    setLoading(false)
  }

  const isCartao = metodoPagamento === 'Cartão de Crédito'
  const isDebitoOuPix = metodoPagamento === 'Débito' || metodoPagamento === 'PIX'
  const categoriasDespesa = categorias.filter(c =>
    c.classificacao !== 'Renda Ativa' && c.classificacao !== 'Renda Passiva'
  )

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

      <div style={{ background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 6, padding: '10px 14px', marginBottom: 16, color: '#6d28d9', fontSize: 13 }}>
        Lançamentos <strong>Previstos</strong> não contam como limite utilizado do cartão — apenas como previsão futura.
      </div>

      <label style={labelStyle}>Data de Referência *</label>
      <input style={inputStyle} type="date" value={dataMov} onChange={e => setDataMov(e.target.value)} />

      <label style={labelStyle}>Categoria *</label>
      <select style={inputStyle} value={categoriaId} onChange={e => { setCategoriaId(e.target.value); setDescricao('') }}>
        <option value="">Selecione...</option>
        {categoriasDespesa.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
      </select>

      <label style={labelStyle}>Descrição *</label>
      <input style={inputStyle} value={descricao} onChange={e => setDescricao(e.target.value)}
        placeholder="Ex: IPTU, Seguro Carro, Academia..." list="sugestoes-previsto" />
      <datalist id="sugestoes-previsto">
        {descricoesCategoria.map((d, i) => <option key={i} value={d} />)}
      </datalist>

      <label style={labelStyle}>Valor da Parcela (R$) *</label>
      <input style={inputStyle} type="number" step="0.01" value={valorParcela}
        onChange={e => setValorParcela(e.target.value)} placeholder="Ex: 100,00" />

      <label style={labelStyle}>Método de Pagamento *</label>
      <select style={inputStyle} value={metodoPagamento}
        onChange={e => { setMetodoPagamento(e.target.value); setDataPrimeiraParcela('') }}>
        <option>Cartão de Crédito</option>
        <option>Débito</option>
        <option>PIX</option>
      </select>

      {isDebitoOuPix && (
        <>
          <label style={labelStyle}>Conta de Origem *</label>
          <select style={inputStyle} value={contaId} onChange={e => setContaId(e.target.value)}>
            <option value="">Selecione...</option>
            {contas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
          <label style={labelStyle}>Data de Vencimento da 1ª Parcela *</label>
          <input style={inputStyle} type="date" value={dataPrimeiraParcela}
            onChange={e => setDataPrimeiraParcela(e.target.value)} />
        </>
      )}

      {isCartao && (
        <>
          <label style={labelStyle}>Cartão *</label>
          <select style={inputStyle} value={cartaoId} onChange={e => setCartaoId(e.target.value)}>
            <option value="">Selecione...</option>
            {cartoes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
          {dataPrimeiraParcela && (
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, padding: '8px 12px', marginBottom: 10, color: '#15803d', fontSize: 13 }}>
              1ª parcela calculada: <strong>{new Date(dataPrimeiraParcela + 'T12:00:00').toLocaleDateString('pt-BR')}</strong>
            </div>
          )}
        </>
      )}

      <label style={labelStyle}>{isCartao ? 'Número de Parcelas' : 'Repetir por quantos meses'}</label>
      <input style={inputStyle} type="number" min="1" max="60"
        value={numParcelas} onChange={e => setNumParcelas(e.target.value)} />

      {parseInt(numParcelas) > 1 && valorParcela && (
        <p style={{ color: '#6b7280', fontSize: 12, marginBottom: 10 }}>
          Total: <strong style={{ color: '#7c3aed' }}>
            {(parseFloat(valorParcela) * parseInt(numParcelas)).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </strong> ({numParcelas}x de {parseFloat(valorParcela).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})
        </p>
      )}

      <button style={btnPrimary} onClick={salvarPrevisto} disabled={loading}>
        {loading ? 'Salvando...' : 'Salvar Previsto'}
      </button>
    </div>
  )
}
