import * as Y from 'yjs'
import type { ComputedRef, Ref } from 'vue'
import type { ColumnItem } from './types'

/** min fits a 220px note plus column padding; max is a generous bound that
 * still keeps a hostile peer from blowing up everyone's layout */
export const COLUMN_MIN_WIDTH = 300
export const COLUMN_MAX_WIDTH = 2400

export function clampColumnWidth(width: number) {
  return Math.round(Math.min(COLUMN_MAX_WIDTH, Math.max(COLUMN_MIN_WIDTH, width)))
}

export function seedDefaultColumns(columnsMap: Y.Map<Y.Map<any>>) {
  for (const [i, title] of ['To discuss', 'Discussing', 'Discussed'].entries()) {
    const id = genId()
    const col = new Y.Map()
    col.set('id', id)
    col.set('title', title)
    col.set('order', i + 1)
    columnsMap.set(id, col)
  }
}

export function createRoomColumns(opts: {
  doc: Y.Doc
  columnsMap: Y.Map<Y.Map<any>>
  cardsMap: Y.Map<Y.Map<any>>
  columns: Ref<ColumnItem[]>
  isOwner: ComputedRef<boolean>
}) {
  const { doc, columnsMap, cardsMap, columns, isOwner } = opts

  function addColumn(title: string) {
    if (!isOwner.value) return
    const clean = title.trim() || 'Untitled'
    const maxOrder = columns.value.reduce((m, c) => Math.max(m, c.order), 0)
    const id = genId()
    const col = new Y.Map()
    col.set('id', id)
    col.set('title', clean)
    col.set('order', maxOrder + 1)
    columnsMap.set(id, col)
  }

  function renameColumn(id: string, title: string) {
    if (!isOwner.value) return
    const clean = title.trim()
    if (!clean) return
    columnsMap.get(id)?.set('title', clean)
  }

  function resizeColumn(id: string, width: number) {
    if (!isOwner.value) return
    const w = clampColumnWidth(width)
    const col = columnsMap.get(id)
    if (col && col.get('width') !== w) col.set('width', w)
  }

  function removeColumn(id: string) {
    if (!isOwner.value) return
    doc.transact(() => {
      columnsMap.delete(id)
      const doomed: string[] = []
      cardsMap.forEach((card, cardId) => {
        if (card.get('columnId') === id) doomed.push(cardId)
      })
      doomed.forEach(cardId => cardsMap.delete(cardId))
    })
  }

  return { addColumn, renameColumn, resizeColumn, removeColumn }
}
