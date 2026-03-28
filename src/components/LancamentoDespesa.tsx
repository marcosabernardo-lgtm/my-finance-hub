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
  const [metodoPagamento, setMetodoPagamento] = useState('Debito')
  const [cartaoId, setCartaoId] = useState('')
  const [contaId, setContaId] = useState('')
  const [formaPagamento, setFormaPagamento] = useState('A Vista')
  const [numParcelas, setNumParcelas] = useState('2')
  const [isPrevisto, setIsPrevisto] = useState(false)
  const [dataInicio, setDataInicio] = useState('')
  const [numMeses, setNumMeses] = useState('2')
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
    if (isPrevisto && metodoPagamento === 'Cartao de Credito' && cartaoId && dataMov) {
      const cartao = cartoes.find(c => c.id === Number(cartaoId))
      if (cartao) {
        const venc = calcularVencimentoCartao(dataMov, cartao)
        setDataInicio(toISO(venc))
      }
    }
  }, [cartaoId, isPrevisto, dataMov, metodoPagamento])

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
      return setMensagem('Preencha todos os campos obrigatorios.')
    if ((metodoPagamento === 'Debito' || metodoPagamento === 'PIX') && !contaId)
      return setMensagem('Selecione a conta de origem.')
    if (metodoPagamento === 'Cartao de Credito' && !cartaoId)
      return setMensagem('Selecione o cartao.')
    if (isPrevisto && !dataInicio)
      return setMensagem('Informe a data do 1o vencimento.')

    setLoading(true); setMensagem('')

    const valorTotal = parseFloat(valor)
    const cartao = cartoes.find(c => c.id === Number(cartaoId))
    const conta = contas.find(c => c.id === Number(contaId))
    const categoria = categorias.find(c => c.id === Number(categoriaId))
    const classificacao = categoria?.classificacao ?? ''
    const grupoId = crypto.randomUUID()
    let registros: any[] = []

    if (isPrevisto) {
      // Modo Previsao Futura — todos como Previsto
      const meses = parseInt(numMeses) || 2
      const dataBase = new Date(dataInicio + 'T12:00:00')
      const isParcelado = formaPagamento === 'Parcelado' && metodoPagamento === 'Cartao de Credito'
      const parcelas = isParcelado ? parseInt(numParcelas) : meses

      if (isParcelado) {
        for (let i = 0; i < parcelas; i++) {
          const dataParcela = adicionarMeses(dataBase, i)
          registros.push({
            household_id: householdId, data_movimentacao: toISO(dataParcela),
            data_pagamento: toISO(dataParcela), tipo: 'Despesa',
            categoria_id: Number(categoriaId), classificacao, descricao,
            valor: valorTotal,
            metodo_pagamento: cartao?.nome ?? metodoPagamento,
            cartao_id: cartao?.id ?? null,
            forma_pagamento: `Parcelado ${parcelas}x`,
            numero_parcela: `Parcela ${i + 1}/${parcelas}`,
            situacao: 'Previsto', grupo_id: grupoId,
          })
        }
      } else {
        for (let i = 0; i < meses; i++) {
          const dataParcela = adicionarMeses(dataBase, i)
          registros.push({
            household_id: householdId, data_movimentacao: toISO(dataParcela),
            data_pagamento: toISO(dataParcela), tipo: 'Despesa',
            categoria_id: Number(categoriaId), classificacao, descricao, valor: valorTotal,
            metodo_pagamento: metodoPagamento,
            cartao_id: cartao?.id ?? null,
            conta_origem_destino: metodoPagamento === 'Dinheiro' ? 'Carteira' : conta?.nome ?? '',
            forma_pagamento: 'A Vista', numero_parcela: `Parcela ${i + 1}/${meses}`,
            situacao: 'Previsto', grupo_id: grupoId,
          })
        }
      }
    } else {
      // Modo Lancamento Unico — comportamento original
      const isParcelado = formaPagamento === 'Parcelado'
      const parcelas = isParcelado ? parseInt(numParcelas) : 1

      if (metodoPagamento === 'Cartao de Credito' && cartao) {
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
              grupo_id: grupoId,
            })
          }
        } else {
          registros.push({
            household_id: householdId, data_movimentacao: dataMov,
            data_pagamento: toISO(primeiroVenc), tipo: 'Despesa',
            categoria_id: Number(categoriaId), classificacao, descricao, valor: valorTotal,
            metodo_pagamento: cartao.nome, cartao_id: cartao.id,
            forma_pagamento: 'A Vista', numero_parcela: 'Parcela 1/1', situacao: 'Pendente',
            grupo_id: grupoId,
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
              grupo_id: grupoId,
            })
          }
        } else {
          registros.push({
            household_id: householdId, data_movimentacao: dataMov,
            data_pagamento: toISO(dataPgto), tipo: 'Despesa',
            categoria_id: Number(categoriaId), classificacao, descricao, valor: valorTotal,
            metodo_pagamento: 'Boleto', forma_pagamento: 'A Vista',
            numero_parcela: 'Parcela 1/1', situacao: 'Pendente', grupo_id: grupoId,
          })
        }
      } else {
        registros.push({
          household_id: householdId, data_movimentacao: dataMov, data_pagamento: dataMov,
          tipo: 'Despesa', categoria_id: Number(categoriaId), classificacao, descricao, valor: valorTotal,
          metodo_pagamento: metodoPagamento,
          conta_origem_destino: metodoPagamento === 'Dinheiro' ? 'Carteira' : conta?.nome ?? '',
          forma_pagamento: 'A Vista', numero_parcela: 'Parcela 1/1', situacao: 'Pago',
          grupo_id: grupoId,
        })
      }
    }

    const { error } = await supabase.from('movimentacoes').insert(registros)
    if (error) {
      setMensagem('Erro: ' + error.message)
    } else {
      setMensagem(registros.length > 1 ? `${registros.length} lancamentos salvos!` : 'Despesa lancada com sucesso!')
      setDescricao(''); setValor(''); setCategoriaId('')
      setFormaPagamento('A Vista'); setNumParcelas('2')
      setDataInicio(''); setNumMeses('2'); setIsPrevisto(false)
    }
    setLoading(false)
  }

  const isCartao = metodoPagamento === 'Cartao de Credito'
  const isDebitoOuPix = metodoPagamento === 'Debito' || metodoPagamento === 'PIX'
  const isParcelavel = isCartao || metodoPagamento === 'Boleto'
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

      {/* Toggle Previsto */}
      <div
        onClick={() => { setIsPrevisto(p => !p); setDataInicio('') }}
        style={{
          display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16,
          cursor: 'pointer', userSelect: 'none',
          background: isPrevisto ? '#fdf4ff' : '#f9fafb',
          border: `1px solid ${isPrevisto ? '#e9d5ff' : '#e5e7eb'}`,
          borderRadius: 8, padding: '10px 14px',
        }}
      >
        <div style={{
          width: 36, height: 20, borderRadius: 10,
          background: isPrevisto ? '#8b5cf6' : '#d1d5db',
          position: 'relative', transition: 'background 0.2s', flexShrink: 0,
        }}>
          <div style={{
            width: 16, height: 16, borderRadius: '50%', background: '#fff',
            position: 'absolute', top: 2,
            left: isPrevisto ? 18 : 2, transition: 'left 0.2s',
          }} />
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>
            {isPrevisto ? 'Previsao Futura' : 'Lancamento Unico'}
          </div>
          <div style={{ fontSize: 11, color: '#6b7280' }}>
            {isPrevisto ? 'Lancamentos futuros como Previsto' : 'Despesa realizada ou a vencer'}
          </div>
        </div>
      </div>

      <label style={labelStyle}>Data *</label>
      <input style={inputStyle} type="date" value={dataMov} onChange={e => setDataMov(e.target.value)} />

      <label style={labelStyle}>Categoria *</label>
      <select style={inputStyle} value={categoriaId} onChange={e => { setCategoriaId(e.target.value); setDescricao('') }}>
        <option value="">Selecione...</option>
        {categoriasDespesa.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
      </select>

      <label style={labelStyle}>Descricao *</label>
      <input style={inputStyle} value={descricao} onChange={e => setDescricao(e.target.value)}
        placeholder="Ex: Supermercado Extra" list="sugestoes-despesa" />
      <datalist id="sugestoes-despesa">
        {descricoesCategoria.map((d, i) => <option key={i} value={d} />)}
      </datalist>

      <label style={labelStyle}>{isPrevisto ? 'Valor da Parcela (R$) *' : 'Valor (R$) *'}</label>
      <input style={inputStyle} type="number" step="0.01" value={valor}
        onChange={e => setValor(e.target.value)} placeholder="0,00" />

      <label style={labelStyle}>Metodo de Pagamento *</label>
      <select style={inputStyle} value={metodoPagamento}
        onChange={e => { setMetodoPagamento(e.target.value); setFormaPagamento('A Vista'); if (e.target.value !== 'Cartao de Credito') setDataInicio('') }}>
        <option value="Debito">Debito</option>
        <option value="PIX">PIX</option>
        <option value="Cartao de Credito">Cartao de Credito</option>
        <option value="Dinheiro">Dinheiro</option>
        <option value="Boleto">Boleto</option>
      </select>

      {isDebitoOuPix && !isPrevisto && (
        <>
          <label style={labelStyle}>Conta de Origem *</label>
          <select style={inputStyle} value={contaId} onChange={e => setContaId(e.target.value)}>
            <option value="">Selecione...</option>
            {contas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </>
      )}

      {isDebitoOuPix && isPrevisto && (
        <>
          <label style={labelStyle}>Conta de Origem *</label>
          <select style={inputStyle} value={contaId} onChange={e => setContaId(e.target.value)}>
            <option value="">Selecione...</option>
            {contas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </>
      )}

      {isCartao && (
        <>
          <label style={labelStyle}>Cartao *</label>
          <select style={inputStyle} value={cartaoId} onChange={e => setCartaoId(e.target.value)}>
            <option value="">Selecione...</option>
            {cartoes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </>
      )}

      {/* Modo lancamento unico — parcelamento normal */}
      {!isPrevisto && isParcelavel && (
        <>
          <label style={labelStyle}>Forma de Pagamento</label>
          <select style={inputStyle} value={formaPagamento} onChange={e => setFormaPagamento(e.target.value)}>
            <option value="A Vista">A Vista</option>
            <option value="Parcelado">Parcelado</option>
          </select>
        </>
      )}
      {!isPrevisto && isParcelavel && formaPagamento === 'Parcelado' && (
        <>
          <label style={labelStyle}>Numero de Parcelas</label>
          <input style={inputStyle} type="number" min="2" max="48"
            value={numParcelas} onChange={e => setNumParcelas(e.target.value)} />
        </>
      )}

      {/* Modo previsao futura */}
      {isPrevisto && (
        <>
          <label style={labelStyle}>Data do 1o Vencimento *</label>
          <input style={inputStyle} type="date" value={dataInicio}
            onChange={e => setDataInicio(e.target.value)} />
          {isCartao && dataInicio && (
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, padding: '8px 12px', marginBottom: 10, color: '#15803d', fontSize: 13 }}>
              1o vencimento calculado: <strong>{new Date(dataInicio + 'T12:00:00').toLocaleDateString('pt-BR')}</strong>
            </div>
          )}

          {isCartao && (
            <>
              <label style={labelStyle}>Forma de Pagamento</label>
              <select style={inputStyle} value={formaPagamento} onChange={e => setFormaPagamento(e.target.value)}>
                <option value="A Vista">A Vista</option>
                <option value="Parcelado">Parcelado</option>
              </select>
            </>
          )}

          {isCartao && formaPagamento === 'Parcelado' ? (
            <>
              <label style={labelStyle}>Numero de Parcelas</label>
              <input style={inputStyle} type="number" min="2" max="48"
                value={numParcelas} onChange={e => setNumParcelas(e.target.value)} />
            </>
          ) : (
            <>
              <label style={labelStyle}>Repetir por quantos meses</label>
              <input style={inputStyle} type="number" min="2" max="60"
                value={numMeses} onChange={e => setNumMeses(e.target.value)} />
            </>
          )}

          {dataInicio && valor && (
            <div style={{ background: '#fdf4ff', border: '1px solid #e9d5ff', borderRadius: 8, padding: '10px 14px', marginBottom: 10, fontSize: 12, color: '#6d28d9' }}>
              {isCartao && formaPagamento === 'Parcelado'
                ? `${numParcelas}x de ${parseFloat(valor || '0').toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} = ${(parseFloat(valor || '0') * parseInt(numParcelas || '0')).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} total — todos como Previsto`
                : `${numMeses}x de ${parseFloat(valor || '0').toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} = ${(parseFloat(valor || '0') * parseInt(numMeses || '0')).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} total — todos como Previsto`
              }
            </div>
          )}
        </>
      )}

      <button style={btnPrimary} onClick={salvarDespesa} disabled={loading}>
        {loading ? 'Salvando...' : isPrevisto ? 'Salvar Previsao' : 'Salvar Despesa'}
      </button>
    </div>
  )
}
