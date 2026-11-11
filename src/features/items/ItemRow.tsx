import { useNavigate } from 'react-router'
import { CheckItem } from '@/components/ui/CheckItem'
import { MetaChips } from '@/components/ui/MetaChip'
import { Swipeable } from '@/components/ui/Swipeable'
import { SPHERE_CLASS, SPHERE_LABEL, type Sphere } from '@/lib/constants'
import type { ISODate } from '@/lib/dates'
import { deadlineChip, historyChips, isItemDone, type Chip } from '@/lib/rules/items'
import type { Item } from './api'

/**
 * Item row for mixed lists (Сегодня, Тело → задачи): sphere dot and name, deadline chip; tap on the text
 * or a long press opens the card, swipe right marks done.
 */
export function ItemRow({
  item,
  today,
  onToggle,
  meta,
  showSphere = true,
  extraChips = [],
}: {
  item: Item
  today: ISODate
  onToggle: () => void
  meta?: string
  showSphere?: boolean
  extraChips?: Chip[]
}) {
  const navigate = useNavigate()
  const sphere = (item.sphere in SPHERE_LABEL ? item.sphere : 'personal') as Sphere
  const done = isItemDone(item)
  const open = () => navigate(`/item/${item.id}`)
  return (
    <Swipeable onRight={done ? undefined : onToggle} onLongPress={open}>
      <CheckItem
        title={item.title}
        lang={sphere === 'work' || sphere === 'study' ? 'de' : undefined}
        checked={done}
        dotClass={showSphere ? SPHERE_CLASS[sphere].dot : undefined}
        onToggle={onToggle}
        onOpen={open}
        meta={
          <>
            {showSphere && <span>{SPHERE_LABEL[sphere]}</span>}
            {meta && <span>{meta}</span>}
            <MetaChips chips={[deadlineChip(item, today), ...extraChips, ...historyChips(item)]} />
          </>
        }
      />
    </Swipeable>
  )
}
