import { useState, useEffect } from 'react'
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
  categoria_nome?: string
  cartao_nome?: string
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
  const [previstos, setPrevistos] = useState<Previsto[]>([])
  const [loading, setLoading] = useState(false)
  const [mensagem, setMensagem] = useState('')
  const [filtroMes, setFiltroMes] = useState(mesAtual())

  function mesAtual() {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }

  useEffect(() => { carregarPrevistos() }, [filtroMes])

  const carregarPrevistos = async () => {
    const [ano, mes] = filtroMes.split('-')
    const dataInicio = `${ano}-${mes}-01`
    const ultimoDia = new Date(parseInt(ano), parseInt(mes), 0).getDate()
    const dataFim = `${ano}-${mes}-${String(ultimoDia).padStart(2, '0')}`

    const { data } = await supabase
      .from('movimentacoes')
      .select('*, categorias(nome), cartoes(nome)')
      .eq('situacao', 'Previsto')
      .gte('data_pagamento', dataInicio)
      .lte('data_pagamento', dataFim)
      .order('data_pagamento')

    if (data) {
      setPrevistos(data.map((m: any) => ({
        ...m,
        categoria_nome: m.categorias?.nome ?? '',
        cartao_nome: m.cartoes?.nome ?? '',
      })))
    }
  }

  const confirmarDebito = async (p: Previsto) => {
    setLoading(true)
    setMensagem('')
    const isCartao = !['Débito', 'PIX', 'Dinheiro'].includes(p.metodo_pagamento)
    const novaSituacao = isCartao ? 'Pendente' : 'Pago'
    const { error } = await supabase.from('movimentacoes').update({ situacao: novaSituacao }).eq('id', p.id)
    if (error) setMensagem('Erro: ' + error.message)
    else { setMensagem(`"${p.descricao}" confirmado como ${novaSituacao}!`); carregarPrevistos() }
    setLoading(false)
  }

  const confirmarTodos = async () => {
    if (!confirm(`Confirmar todos os ${previstos.length} lançamentos previstos?`)) return
    setLoading(true)
    setMensagem('')
    for (const p of previstos) {
      const isCartao = !['Débito', 'PIX', 'Dinheiro'].includes(p.metodo_pagamento)
      await supabase.from('movimentacoes').update({ situacao: isCartao ? 'Pendente' : 'Pago' }).eq('id', p.id)
    }
    setMensagem(`${previstos.length} lançamentos confirmados!`)
    carregarPrevistos()
    setLoading(false)
  }

  const totalPrevistos = previstos.reduce((acc, p) => acc + p.valor, 0)

  const getMetodoInfo = (p: Previsto) => {
    if (p.cartao_nome) return { label: p.cartao_nome, bg: '#dbeafe', color: '#1e40af' }
    if (p.metodo_pagamento === 'Débito') return { label: `Débito — ${p.conta_origem_destino || p.metodo_pagamento}`, bg: '#fef3c7', color: '#92400e' }
    if (p.metodo_pagamento === 'PIX') return { label: `PIX — ${p.conta_origem_destino || p.metodo_pagamento}`, bg: '#dcfce7', color: '#166534' }
    return { label: p.metodo_pagamento, bg: '#f3f4f6', color: '#374151' }
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: '#111827', margin: 0 }}>Confirmar Débitos</h1>
        <p style={{ color: '#6b7280', fontSize: 13, marginTop: 4 }}>
          Confirme lançamentos previstos para incluí-los no controle financeiro.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 24, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <select
            value={filtroMes.split('-')[1]}
            onChange={e => setFiltroMes(`${filtroMes.split('-')[0]}-${e.target.value}`)}
            style={{ padding: '7px 12px', background: '#fff', border: '1px solid #d1d5db', color: '#111827', borderRadius: 6, fontSize: 13 }}>
            {nomesMeses.map((m, i) => (
              <option key={i} value={String(i + 1).padStart(2, '0')}>{m}</option>
            ))}
          </select>
          <input
            type="number" value={filtroMes.split('-')[0]}
            onChange={e => setFiltroMes(`${e.target.value}-${filtroMes.split('-')[1]}`)}
            style={{ width: 80, padding: '7px 12px', background: '#fff', border: '1px solid #d1d5db', color: '#111827', borderRadius: 6, fontSize: 13 }}
          />
        </div>

        {previstos.length > 0 && (
          <button onClick={confirmarTodos} disabled={loading} style={{
            padding: '8px 16px', backgroundColor: '#7c3aed', color: 'white',
            border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13
          }}>
            Confirmar Todos ({previstos.length})
          </button>
        )}
      </div>

      {mensagem && (
        <div style={{
          color: mensagem.startsWith('Erro') ? '#991b1b' : '#166534',
          background: mensagem.startsWith('Erro') ? '#fee2e2' : '#dcfce7',
          border: `1px solid ${mensagem.startsWith('Erro') ? '#fca5a5' : '#86efac'}`,
          marginBottom: 16, padding: '10px 14px', borderRadius: 6, fontSize: 13
        }}>{mensagem}</div>
      )}

      {previstos.length === 0 ? (
        <div style={{ background: '#f9fafb', padding: 40, borderRadius: 12, textAlign: 'center', border: '1px solid #e5e7eb' }}>
          <p style={{ color: '#9ca3af', fontSize: 15 }}>Nenhum lançamento previsto para este mês.</p>
        </div>
      ) : (
        <>
          <div style={{ background: '#f5f3ff', padding: '12px 16px', borderRadius: 8, marginBottom: 16, border: '1px solid #ddd6fe', display: 'flex', gap: 16, alignItems: 'center' }}>
            <span style={{ color: '#6b7280', fontSize: 13 }}>Total previsto:</span>
            <span style={{ color: '#7c3aed', fontWeight: 700, fontSize: 16 }}>{formatarValor(totalPrevistos)}</span>
            <span style={{ color: '#9ca3af', fontSize: 13 }}>{previstos.length} lançamento(s)</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {previstos.map(p => {
              const metodo = getMetodoInfo(p)
              return (
                <div key={p.id} style={{
                  background: '#fff', padding: '14px 16px', borderRadius: 8,
                  border: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between',
                  alignItems: 'center', gap: 12
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
                      <span style={{ color: '#111827', fontWeight: 600, fontSize: 14 }}>{p.descricao}</span>
                      {p.categoria_nome && (
                        <span style={{ color: '#6b7280', fontSize: 11, background: '#f3f4f6', padding: '2px 6px', borderRadius: 4 }}>
                          {p.categoria_nome}
                        </span>
                      )}
                      <span style={{ color: '#7c3aed', fontSize: 11, background: '#f5f3ff', padding: '2px 6px', borderRadius: 4 }}>
                        {p.numero_parcela}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{ color: '#6b7280', fontSize: 12 }}>
                        Vence: <strong>{formatarData(p.data_pagamento)}</strong>
                      </span>
                      <span style={{ fontSize: 12, color: metodo.color, background: metodo.bg, padding: '2px 8px', borderRadius: 4 }}>
                        {metodo.label}
                      </span>
                      <span style={{ color: '#d97706', fontWeight: 700, fontSize: 14 }}>
                        {formatarValor(p.valor)}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => confirmarDebito(p)}
                    disabled={loading}
                    style={{
                      padding: '7px 14px', backgroundColor: '#22c55e', color: 'white',
                      border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600,
                      whiteSpace: 'nowrap', fontSize: 13, flexShrink: 0
                    }}>
                    Confirmar
                  </button>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
