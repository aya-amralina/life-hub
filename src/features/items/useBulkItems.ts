import { useToast } from '@/app/toastContext'
import { plural } from '@/lib/format'
import { bulkPatches, type BulkAction, type BulkItem } from '@/lib/rules/table'
import { usePatchItems } from './api'

/** A bulk action of the table: one batch through the offline queue, one toast with one «Отменить» for all of it. */
export function useBulkItems() {
  const patch = usePatchItems()
  const toast = useToast()
  return (items: readonly BulkItem[], action: BulkAction, done?: () => void) => {
    const { apply, undo } = bulkPatches(items, action, new Date().toISOString())
    if (!apply.length) {
      toast({ text: 'Ничего не изменилось — у выбранных уже так' })
      return
    }
    patch.mutate(apply, {
      onSuccess: () => {
        toast({ text: `Изменено: ${apply.length} ${plural(apply.length, ['пункт', 'пункта', 'пунктов'])}`, actionLabel: 'Отменить', onAction: () => patch.mutate(undo) })
        done?.()
      },
    })
  }
}
