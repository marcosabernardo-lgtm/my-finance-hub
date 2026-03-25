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
  padding: '10px 20px', backgroundColor: '#ef4444', color: 'white',
  border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600,
  width: '100%', marginTop: 8, fontSize: 13,
}

type Props = { householdId: string; categorias: Categoria[]; cartoes: Cartao[]; contas: Conta[] }

export default function LancamentoDespesa({ householdId, categorias, cartoes, contas }: Props) {
  const [dataMov, setDataMov] = useState(hoje())
  const [categoriaId, setCategoriaId] = useState('')
  const [descricao, setDescricao] = useState('')
  const [valor, setValor] = useState('')
  const [metodoPagamento, setMetodoPagamento] = useState('Débito')
  const [cartaoId, setCartaoId] = useState('')
  const [contaId, setContaId] = useState('')
  const [formaPagamento, setFormaPagamento] = useState('À Vista')
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

  async function salvarDespesa() {
    if (!categoriaId || !descricao || !valor || !dataMov)
      return setMensagem('Preencha todos os campos obrigatórios.')
    if ((metodoPagamento === 'Débito' || metodoPagamento === 'PIX') && !contaId)
      return setMensagem('Selecione a conta de origem.')
    if (metodoPagamento === 'Cartão de Crédito' && !cartaoId)
      return setMensagem('Selecione o cartão.')

    setLoading(true); setMensagem('')

    const valorTotal = parseFloat(valor)
    const cartao = cartoes.find(c => c.id === Number(cartaoId))
    const conta = contas.find(c => c.id === Number(contaId))
    const categoria = categorias.find(c => c.id === Number(categoriaId))
    const classificacao = categoria?.classificacao ?? ''
    const isParcelado = formaPagamento === 'Parcelado'
    const parcelas = isParcelado ? parseInt(numParcelas) : 1
    let registros: any[] = []

    if (metodoPagamento === 'Cartão de Crédito' && cartao) {
      const primeiroVenc = calcularVencimentoCartao(dataMov, cartao)
      if (isParcelado) {
        const valorParcela = Math.floor((valorTotal / parcelas) * 100) / 100
        for (let i = 0; i < parcelas; i++) {
          const isUltima = i === parcelas - 1
          registros.push({
            household_id: householdId, data_movimentacao: dataMov,
            data_pagamento: toISO(adicionarMeses(primeiroVenc, i)),
            tipo: 'Despesa', categoria_id: Number(categoriaId), classificacao, descricao,
            valor: isUltima ? Math.round((valorTotal - valorParcela * (parcelas - 1)) * 100) / 100 : valorParcela,
            metodo_pagamento: cartao.nome, cartao_id: cartao.id,
            forma_pagamento: `Parcelado ${parcelas}x`,
            numero_parcela: `Parcela ${i + 1}/${parcelas}`, situacao: 'Pendente',
          })
        }
      } else {
        registros.push({
          household_id: householdId, data_movimentacao: dataMov,
          data_pagamento: toISO(primeiroVenc), tipo: 'Despesa',
          categoria_id: Number(categoriaId), classificacao, descricao, valor: valorTotal,
          metodo_pagamento: cartao.nome, cartao_id: cartao.id,
          forma_pagamento: 'À Vista', numero_parcela: 'Parcela 1/1', situacao: 'Pendente',
        })
      }
    } else if (metodoPagamento === 'Boleto') {
      const dataPgto = new Date(dataMov + 'T12:00:00')
      dataPgto.setMonth(dataPgto.getMonth() + 1)
      if (isParcelado) {
        const valorParcela = Math.floor((valorTotal / parcelas) * 100) / 100
        for (let i = 0; i < parcelas; i++) {
          const isUltima = i === parcelas - 1
          registros.push({
            household_id: householdId, data_movimentacao: dataMov,
            data_pagamento: toISO(adicionarMeses(dataPgto, i)),
            tipo: 'Despesa', categoria_id: Number(categoriaId), classificacao, descricao,
            valor: isUltima ? Math.round((valorTotal - valorParcela * (parcelas - 1)) * 100) / 100 : valorParcela,
            metodo_pagamento: 'Boleto', forma_pagamento: `Parcelado ${parcelas}x`,
            numero_parcela: `Parcela ${i + 1}/${parcelas}`, situacao: 'Pendente',
          })
        }
      } else {
        registros.push({
          household_id: householdId, data_movimentacao: dataMov,
          data_pagamento: toISO(dataPgto), tipo: 'Despesa',
          categoria_id: Number(categoriaId), classificacao, descricao, valor: valorTotal,
          metodo_pagamento: 'Boleto', forma_pagamento: 'À Vista',
          numero_parcela: 'Parcela 1/1', situacao: 'Pendente',
        })
      }
    } else {
      registros.push({
        household_id: householdId, data_movimentacao: dataMov, data_pagamento: dataMov,
        tipo: 'Despesa', categoria_id: Number(categoriaId), classificacao, descricao, valor: valorTotal,
        metodo_pagamento: metodoPagamento,
        conta_origem_destino: metodoPagamento === 'Dinheiro' ? 'Carteira' : conta?.nome ?? '',
        forma_pagamento: 'À Vista', numero_parcela: 'Parcela 1/1', situacao: 'Pago',
      })
    }

    const { error } = await supabase.from('movimentacoes').insert(registros)
    if (error) {
      setMensagem('Erro: ' + error.message)
    } else {
      setMensagem(registros.length > 1 ? `${registros.length} parcelas lançadas!` : 'Despesa lançada com sucesso!')
      setDescricao(''); setValor(''); setCategoriaId('')
      setFormaPagamento('À Vista'); setNumParcelas('2')
    }
    setLoading(false)
  }

  const isParcelavel = metodoPagamento === 'Cartão de Crédito' || metodoPagamento === 'Boleto'
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

      <label style={labelStyle}>Data *</label>
      <input style={inputStyle} type="date" value={dataMov} onChange={e => setDataMov(e.target.value)} />

      <label style={labelStyle}>Categoria *</label>
      <select style={inputStyle} value={categoriaId} onChange={e => { setCategoriaId(e.target.value); setDescricao('') }}>
        <option value="">Selecione...</option>
        {categoriasDespesa.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
      </select>

      <label style={labelStyle}>Descrição *</label>
      <input style={inputStyle} value={descricao} onChange={e => setDescricao(e.target.value)}
        placeholder="Ex: Supermercado Extra" list="sugestoes-despesa" />
      <datalist id="sugestoes-despesa">
        {descricoesCategoria.map((d, i) => <option key={i} value={d} />)}
      </datalist>

      <label style={labelStyle}>Valor (R$) *</label>
      <input style={inputStyle} type="number" step="0.01" value={valor}
        onChange={e => setValor(e.target.value)} placeholder="0,00" />

      <label style={labelStyle}>Método de Pagamento *</label>
      <select style={inputStyle} value={metodoPagamento}
        onChange={e => { setMetodoPagamento(e.target.value); setFormaPagamento('À Vista') }}>
        <option>Débito</option>
        <option>PIX</option>
        <option>Cartão de Crédito</option>
        <option>Dinheiro</option>
        <option>Boleto</option>
      </select>

      {(metodoPagamento === 'Débito' || metodoPagamento === 'PIX') && (
        <>
          <label style={labelStyle}>Conta de Origem *</label>
          <select style={inputStyle} value={contaId} onChange={e => setContaId(e.target.value)}>
            <option value="">Selecione...</option>
            {contas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </>
      )}

      {metodoPagamento === 'Cartão de Crédito' && (
        <>
          <label style={labelStyle}>Cartão *</label>
          <select style={inputStyle} value={cartaoId} onChange={e => setCartaoId(e.target.value)}>
            <option value="">Selecione...</option>
            {cartoes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </>
      )}

      {isParcelavel && (
        <>
          <label style={labelStyle}>Forma de Pagamento</label>
          <select style={inputStyle} value={formaPagamento} onChange={e => setFormaPagamento(e.target.value)}>
            <option value="À Vista">À Vista</option>
            <option value="Parcelado">Parcelado</option>
          </select>
        </>
      )}

      {isParcelavel && formaPagamento === 'Parcelado' && (
        <>
          <label style={labelStyle}>Número de Parcelas</label>
          <input style={inputStyle} type="number" min="2" max="48"
            value={numParcelas} onChange={e => setNumParcelas(e.target.value)} />
        </>
      )}

      <button style={btnPrimary} onClick={salvarDespesa} disabled={loading}>
        {loading ? 'Salvando...' : 'Salvar Despesa'}
      </button>
    </div>
  )
}
