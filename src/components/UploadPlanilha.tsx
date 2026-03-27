import { useState, useRef } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'

interface ImportResult {
  categorias: number
  cartoes: number
  contas: number
  movimentacoes: number
  erros: string[]
}

export default function UploadPlanilha() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(false)
  const [resultado, setResultado] = useState<ImportResult | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [etapa, setEtapa] = useState<string>('')
  const [progresso, setProgresso] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)

  // ─── Helpers ───────────────────────────────────────────────────────────────

  function excelDateToISO(value: unknown): string | null {
    if (!value) return null
    if (value instanceof Date) return value.toISOString().split('T')[0]
    if (typeof value === 'number') {
      // Excel serial date
      const date = new Date(Math.round((value - 25569) * 86400 * 1000))
      return date.toISOString().split('T')[0]
    }
    if (typeof value === 'string') {
      const d = new Date(value)
      if (!isNaN(d.getTime())) return d.toISOString().split('T')[0]
    }
    return null
  }

  function parseValor(value: unknown): number {
    if (typeof value === 'number') return Math.abs(value)
    if (typeof value === 'string') {
      const n = parseFloat(value.replace(/[^\d.,-]/g, '').replace(',', '.'))
      return isNaN(n) ? 0 : Math.abs(n)
    }
    return 0
  }

  // ─── Importação ─────────────────────────────────────────────────────────────

  async function processarPlanilha(file: File) {
    setLoading(true)
    setResultado(null)
    setErro(null)
    setProgresso(0)

    const erros: string[] = []
    const result: ImportResult = { categorias: 0, cartoes: 0, contas: 0, movimentacoes: 0, erros: [] }

    try {
      // Buscar household_id do usuário
      const { data: memberData, error: memberError } = await supabase
        .from('household_members')
        .select('household_id')
        .eq('user_id', user!.id)
        .single()

      if (memberError || !memberData) {
        throw new Error('Não foi possível encontrar o household do usuário.')
      }
      const household_id = memberData.household_id

      // Ler arquivo Excel
      setEtapa('Lendo arquivo...')
      const arrayBuffer = await file.arrayBuffer()
      const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true })

      // ── 1. CATEGORIAS ──────────────────────────────────────────────────────
      setEtapa('Importando categorias...')
      setProgresso(10)

      const wsCateg = workbook.Sheets['📂 Categorias']
      if (wsCateg) {
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wsCateg, { range: 2 })
        for (const row of rows) {
          const nome = String(row['Nome da Categoria *'] ?? '').trim()
          const classificacao = String(row['Classificação *'] ?? '').trim()
          if (!nome || !classificacao) continue

          const tipo = ['Renda Ativa', 'Renda Passiva'].includes(classificacao) ? 'Receita' : 'Despesa'
          const limite = parseValor(row['Limite Mensal (R$)']) || null

          const { error } = await supabase.from('categorias').upsert(
            { household_id, nome, classificacao, tipo, limite_mensal: limite },
            { onConflict: 'household_id,nome' }
          )
          if (error) erros.push(`Categoria "${nome}": ${error.message}`)
          else result.categorias++
        }
      }

      // ── 2. CARTÕES ─────────────────────────────────────────────────────────
      setEtapa('Importando cartões...')
      setProgresso(30)

      const wsCart = workbook.Sheets['💳 Cartões']
      if (wsCart) {
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wsCart, { range: 2 })
        for (const row of rows) {
          const nome = String(row['Nome do Cartão *'] ?? '').trim()
          const dia_fechamento = Number(row['Dia Fechamento *']) || null
          const dia_vencimento = Number(row['Dia Vencimento *']) || null
          if (!nome) continue

          const limite = parseValor(row['Limite Total (R$)']) || null

          const { error } = await supabase.from('cartoes').upsert(
            { household_id, nome, dia_fechamento, dia_vencimento, limite },
            { onConflict: 'household_id,nome' }
          )
          if (error) erros.push(`Cartão "${nome}": ${error.message}`)
          else result.cartoes++
        }
      }

      // ── 3. CONTAS ──────────────────────────────────────────────────────────
      setEtapa('Importando contas...')
      setProgresso(50)

      const wsContas = workbook.Sheets['🏦 Contas']
      if (wsContas) {
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wsContas, { range: 2 })
        for (const row of rows) {
          const nome = String(row['Nome da Conta *'] ?? '').trim()
          if (!nome) continue

          const saldo_inicial = parseValor(row['Saldo Inicial (R$)'])
          const data_inicial = excelDateToISO(row['Data Inicial *'])

          const { error } = await supabase.from('contas').upsert(
            { household_id, nome, saldo_inicial, data_inicial },
            { onConflict: 'household_id,nome' }
          )
          if (error) erros.push(`Conta "${nome}": ${error.message}`)
          else result.contas++
        }
      }

      // Recarregar categorias e cartões para resolver nomes → ids
      const { data: categsDB } = await supabase
        .from('categorias')
        .select('id, nome')
        .eq('household_id', household_id)

      const { data: cartoesDB } = await supabase
        .from('cartoes')
        .select('id, nome')
        .eq('household_id', household_id)

      const { data: contasDB } = await supabase
        .from('contas')
        .select('id, nome')
        .eq('household_id', household_id)

      const categMap = Object.fromEntries((categsDB ?? []).map(c => [c.nome.trim().toLowerCase(), c.id]))
      const cartaoMap = Object.fromEntries((cartoesDB ?? []).map(c => [c.nome.trim().toLowerCase(), c.id]))
      const contaMap = Object.fromEntries((contasDB ?? []).map(c => [c.nome.trim().toLowerCase(), c.id]))

      // ── 4. MOVIMENTAÇÕES ───────────────────────────────────────────────────
      setEtapa('Importando movimentações...')
      setProgresso(65)

      const wsMov = workbook.Sheets['💰 Movimentacoes']
      if (wsMov) {
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wsMov, { range: 2 })

        // Inserir em lotes de 50
        const lote: Record<string, unknown>[] = []
        let linha = 4 // linha humana (começa após 3 linhas de cabeçalho)

        for (const row of rows) {
          linha++
          const data_movimentacao = excelDateToISO(row['Data Movimentação *'])
          const tipo = String(row['Tipo *'] ?? '').trim()
          const descricao = String(row['Descrição *'] ?? '').trim()
          const valor = parseValor(row['Valor (R$) *'])
          const metodo = String(row['Método de Pagamento *'] ?? '').trim()
          const situacao = String(row['Situação *'] ?? '').trim()

          if (!data_movimentacao || !tipo || !descricao || !valor || !situacao) {
            erros.push(`Linha ${linha}: campos obrigatórios faltando`)
            continue
          }

          const categNome = String(row['Categoria *'] ?? '').trim()
          const categId = categMap[categNome.toLowerCase()] ?? null
          if (!categId && categNome) {
            erros.push(`Linha ${linha}: categoria "${categNome}" não encontrada`)
            continue
          }

          const data_pagamento = excelDateToISO(row['Data Pagamento']) || null
          const contaNome = String(row['Conta Origem/Destino'] ?? '').trim()
          const conta_id = contaNome ? (contaMap[contaNome.toLowerCase()] ?? null) : null
          const forma_pagamento = String(row['Forma de Pagamento'] ?? '').trim() || null
          const parcela = String(row['Nº da Parcela'] ?? '').trim() || null

          // Cartão: método é o nome do cartão
          const cartao_id = cartaoMap[metodo.toLowerCase()] ?? null

          lote.push({
            household_id,
            data_movimentacao,
            data_pagamento,
            tipo,
            categoria_id: categId,
            descricao,
            valor,
            metodo_pagamento: metodo,
            cartao_id: cartao_id || null,
            conta_id: conta_id || null,
            forma_pagamento,
            parcela,
            situacao,
          })

          if (lote.length >= 50) {
            const { error, data } = await supabase.from('movimentacoes').insert(lote).select('id')
            if (error) erros.push(`Lote movimentações: ${error.message}`)
            else result.movimentacoes += data?.length ?? 0
            lote.length = 0
            setProgresso(65 + Math.min(30, result.movimentacoes / 10))
          }
        }

        // Último lote
        if (lote.length > 0) {
          const { error, data } = await supabase.from('movimentacoes').insert(lote).select('id')
          if (error) erros.push(`Lote final movimentações: ${error.message}`)
          else result.movimentacoes += data?.length ?? 0
        }
      }

      result.erros = erros
      setResultado(result)
      setProgresso(100)
      setEtapa('Concluído!')
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Erro inesperado durante a importação.')
    } finally {
      setLoading(false)
    }
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.name.endsWith('.xlsx')) {
      setErro('Por favor, envie um arquivo .xlsx')
      return
    }
    processarPlanilha(file)
  }

  // ─── UI ─────────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-2 text-gray-800">Importar Planilha</h1>
      <p className="text-gray-500 mb-6 text-sm">
        Faça upload da planilha padrão Finance Hub (.xlsx) para importar categorias, cartões, contas e movimentações.
      </p>

      {/* Drop zone / botão */}
      <div
        className="border-2 border-dashed border-blue-300 rounded-2xl p-10 text-center cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-all"
        onClick={() => !loading && fileRef.current?.click()}
      >
        <div className="text-5xl mb-3">📊</div>
        <p className="font-semibold text-gray-700 text-lg">
          {loading ? etapa : 'Clique para selecionar a planilha'}
        </p>
        <p className="text-gray-400 text-sm mt-1">Formato aceito: .xlsx</p>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx"
          className="hidden"
          onChange={handleFile}
          disabled={loading}
        />
      </div>

      {/* Barra de progresso */}
      {loading && (
        <div className="mt-4">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>{etapa}</span>
            <span>{progresso}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all duration-500"
              style={{ width: `${progresso}%` }}
            />
          </div>
        </div>
      )}

      {/* Erro geral */}
      {erro && (
        <div className="mt-4 bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
          ❌ {erro}
        </div>
      )}

      {/* Resultado */}
      {resultado && (
        <div className="mt-6 space-y-4">
          <div className="bg-green-50 border border-green-200 rounded-xl p-5">
            <h2 className="font-bold text-green-800 text-lg mb-3">✅ Importação concluída!</h2>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Categorias', valor: resultado.categorias, icon: '📂' },
                { label: 'Cartões', valor: resultado.cartoes, icon: '💳' },
                { label: 'Contas', valor: resultado.contas, icon: '🏦' },
                { label: 'Movimentações', valor: resultado.movimentacoes, icon: '💰' },
              ].map(item => (
                <div key={item.label} className="bg-white rounded-lg p-3 flex items-center gap-3 shadow-sm">
                  <span className="text-2xl">{item.icon}</span>
                  <div>
                    <p className="text-xs text-gray-400">{item.label}</p>
                    <p className="font-bold text-gray-800 text-lg">{item.valor}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {resultado.erros.length > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
              <h3 className="font-semibold text-yellow-800 mb-2">
                ⚠️ {resultado.erros.length} avisos durante a importação:
              </h3>
              <ul className="text-xs text-yellow-700 space-y-1 max-h-40 overflow-y-auto">
                {resultado.erros.map((e, i) => (
                  <li key={i}>• {e}</li>
                ))}
              </ul>
            </div>
          )}

          <button
            className="w-full bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl py-3 text-sm font-medium transition"
            onClick={() => {
              setResultado(null)
              if (fileRef.current) fileRef.current.value = ''
            }}
          >
            Importar outra planilha
          </button>
        </div>
      )}
    </div>
  )
}
/ /   0 3 / 2 7 / 2 0 2 6   1 8 : 4 8 : 4 7 
 
 
