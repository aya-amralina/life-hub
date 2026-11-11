import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Download, Upload } from 'lucide-react'
import { useToast } from '@/app/toastContext'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { Chip } from '@/components/ui/Chip'
import { BACKUP_TABLES, TABLE_LABEL, parseBackup, restorePlan, toCsv, type Backup, type BackupTable, type RestoreLine } from '@/lib/backup'
import { todayBerlin } from '@/lib/dates'
import { existingIds, exportAll, exportTable, restore, saveFile } from './backupApi'

/** Настройки → Данные: export JSON (everything) and CSV (a table), restore from JSON with a preview. */
export function BackupCard() {
  const toast = useToast()
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [csvTable, setCsvTable] = useState<BackupTable>('transactions')
  const [preview, setPreview] = useState<{ backup: Backup; lines: RestoreLine[] } | null>(null)
  const [problem, setProblem] = useState<string | null>(null)

  const run = async (label: string, job: () => Promise<void>) => {
    setBusy(label)
    setProblem(null)
    try {
      await job()
    } catch {
      setProblem('Не получилось — проверь сеть и попробуй ещё раз.')
    } finally {
      setBusy(null)
    }
  }

  const exportJson = () =>
    run('json', async () => {
      const backup = await exportAll()
      const rows = Object.values(backup.tables).reduce((s, r) => s + (r?.length ?? 0), 0)
      await saveFile(`lifehub-export-${todayBerlin()}.json`, 'application/json', JSON.stringify(backup))
      toast({ text: `Экспорт готов · ${rows} строк` })
    })

  const exportCsv = () =>
    run('csv', async () => {
      const rows = await exportTable(csvTable)
      await saveFile(`lifehub-${csvTable}-${todayBerlin()}.csv`, 'text/csv', toCsv(rows))
      toast({ text: `${TABLE_LABEL[csvTable]} · ${rows.length} строк в CSV` })
    })

  const pick = (file: File | undefined) => {
    if (!file) return
    void run('read', async () => {
      const parsed = parseBackup(await file.text())
      if (!parsed.ok) {
        setProblem(parsed.reason)
        return
      }
      const tables = BACKUP_TABLES.filter((t) => parsed.backup.tables[t]?.length)
      setPreview({ backup: parsed.backup, lines: restorePlan(parsed.backup, await existingIds(tables)) })
    })
  }

  const confirmRestore = () => {
    if (!preview) return
    void run('restore', async () => {
      const n = await restore(preview.backup)
      await qc.invalidateQueries()
      setPreview(null)
      toast({ text: `Восстановлено ${n} строк` })
    })
  }

  return (
    <Card>
      <CardHeader title="Данные" />
      <p className="m-0 text-cap text-ink2">Экспорт — всё в одном JSON-файле. Из него же можно восстановить базу: строки обновятся по id, новые добавятся, ничего не удалится.</p>
      <Button variant="secondary" icon={<Download size={20} strokeWidth={1.75} aria-hidden="true" />} onClick={() => void exportJson()} disabled={busy !== null}>
        {busy === 'json' ? 'Собираю…' : 'Экспорт JSON'}
      </Button>
      <div className="text-cap text-ink2">Таблица в CSV</div>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
        {BACKUP_TABLES.filter((t) => t !== 'import_baseline').map((t) => (
          <Chip key={t} selected={csvTable === t} onClick={() => setCsvTable(t)} className="flex-none">
            {TABLE_LABEL[t]}
          </Chip>
        ))}
      </div>
      <Button variant="secondary" icon={<Download size={20} strokeWidth={1.75} aria-hidden="true" />} onClick={() => void exportCsv()} disabled={busy !== null}>
        {busy === 'csv' ? 'Собираю…' : `CSV: ${TABLE_LABEL[csvTable]}`}
      </Button>
      <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" aria-label="Файл экспорта" onChange={(e) => pick(e.target.files?.[0])} />
      <Button variant="quiet" className="-ml-3 self-start" icon={<Upload size={20} strokeWidth={1.75} aria-hidden="true" />} onClick={() => fileRef.current?.click()} disabled={busy !== null}>
        Восстановить из JSON
      </Button>
      {problem && <p className="m-0 text-cap font-semibold text-ink">{problem}</p>}
      <BottomSheet open={preview !== null} onClose={() => setPreview(null)} label="Восстановление">
        {preview && (
          <div className="flex flex-col gap-4">
            <p className="m-0 text-cap text-ink2">
              Файл от {new Date(preview.backup.exported_at).toLocaleString('ru-RU', { timeZone: 'Europe/Berlin', dateStyle: 'short', timeStyle: 'short' })}. Строки
              с тем же id обновятся, остальные добавятся. Строки базы, которых нет в файле, останутся.
            </p>
            <table className="w-full border-collapse text-cap tabular-nums">
              <thead>
                <tr className="text-ink2">
                  <th className="py-1 text-left font-normal">Таблица</th>
                  <th className="py-1 text-right font-normal">В файле</th>
                  <th className="py-1 text-right font-normal">Обновится</th>
                  <th className="py-1 text-right font-normal">Новых</th>
                </tr>
              </thead>
              <tbody>
                {preview.lines.map((l) => (
                  <tr key={l.table} className="border-t border-line">
                    <td className="py-2">{TABLE_LABEL[l.table]}</td>
                    <td className="py-2 text-right">{l.inFile}</td>
                    <td className="py-2 text-right">{l.update}</td>
                    <td className="py-2 text-right">{l.insert}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Button onClick={confirmRestore} disabled={busy !== null}>
              {busy === 'restore' ? 'Восстанавливаю…' : 'Восстановить'}
            </Button>
            <Button variant="quiet" onClick={() => setPreview(null)}>
              Отмена
            </Button>
          </div>
        )}
      </BottomSheet>
    </Card>
  )
}
