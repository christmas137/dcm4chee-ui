import { useState } from 'react'
import type { TransferCapability } from '../../api/devices'
import { Button, Select, TextInput } from '../../components/form'
import { DEFAULT_TRANSFER_SYNTAXES, isStorageSOPClass, transferSyntaxName, VERIFICATION_SOP_CLASS } from './dicomUids'

/** Что AE умеет принимать и отправлять: SOP-классы и транспортные синтаксисы. */
export function TransferCapabilities({
  items, onChange,
}: {
  items: TransferCapability[]
  onChange(items: TransferCapability[]): void
}) {
  const [open, setOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState<TransferCapability>({
    cn: '',
    dicomSOPClass: VERIFICATION_SOP_CLASS,
    dicomTransferRole: 'SCP',
    dicomTransferSyntax: DEFAULT_TRANSFER_SYNTAXES,
  })

  const scu = items.filter((item) => item.dicomTransferRole === 'SCU').length
  const scp = items.length - scu
  // Проверено на стенде: архив предлагает узлу только перечисленное. Узел, у которого есть
  // возможности, но нет ни одного класса хранения в роли SCP, отвечает на C-ECHO, а снимки
  // от архива не получает («no Presentation Context offered»).
  const cannotReceive = items.length > 0
    && !items.some((item) => item.dicomTransferRole === 'SCP' && isStorageSOPClass(item.dicomSOPClass))

  return (
    <section className="space-y-1.5">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="text-[11px] text-accent hover:underline"
      >
        {open ? 'Скрыть' : 'Показать'} транспортные возможности ({items.length}: SCP {scp}, SCU {scu})
      </button>
      {items.length === 0 && (
        <p className="text-[11px] text-muted">
          Не заданы — архив предлагает узлу всё, что умеет сам. Обычно так и нужно.
        </p>
      )}
      {cannotReceive && (
        <p className="text-[11px] text-warn">
          Среди возможностей нет приёма снимков (Storage SCP) — архив не сможет отправлять сюда
          исследования. Добавьте нужные классы хранения или удалите все возможности: тогда архив
          будет предлагать всё, что умеет.
        </p>
      )}

      {open && (
        <div className="space-y-1 rounded border border-line">
          <div className="max-h-72 divide-y divide-line/60 overflow-auto">
            {items.map((item, index) => (
              <div key={`${item.dicomSOPClass}-${item.dicomTransferRole}-${index}`} className="group flex items-start gap-2 px-2 py-1.5">
                <span className="mt-0.5 w-8 shrink-0 rounded bg-panel-2 text-center text-[10px] text-muted">
                  {item.dicomTransferRole}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px]">{item.cn ?? item.dicomSOPClass}</p>
                  <p className="truncate text-[10px] text-muted" title={item.dicomTransferSyntax?.join('\n')}>
                    {(item.dicomTransferSyntax ?? []).map(transferSyntaxName).join(', ') || 'синтаксисы не заданы'}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Удалить"
                  onClick={() => onChange(items.filter((_, i) => i !== index))}
                  className="text-muted opacity-0 group-hover:opacity-100 hover:text-danger"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          <div className="border-t border-line p-2">
            {adding ? (
              <div className="space-y-2">
                <div className="grid grid-cols-[1fr_90px] gap-2">
                  <TextInput
                    placeholder="Название (например, CT Image Storage SCP)"
                    value={draft.cn ?? ''}
                    onChange={(event) => setDraft({ ...draft, cn: event.target.value })}
                  />
                  <Select
                    value={draft.dicomTransferRole}
                    onChange={(event) =>
                      setDraft({ ...draft, dicomTransferRole: event.target.value as 'SCU' | 'SCP' })}
                  >
                    <option value="SCP">SCP</option>
                    <option value="SCU">SCU</option>
                  </Select>
                </div>
                <TextInput
                  placeholder="SOP Class UID"
                  value={draft.dicomSOPClass ?? ''}
                  onChange={(event) => setDraft({ ...draft, dicomSOPClass: event.target.value.trim() })}
                />
                <TextInput
                  placeholder="Transfer Syntax UID через запятую"
                  value={(draft.dicomTransferSyntax ?? []).join(', ')}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      dicomTransferSyntax: event.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                    })}
                />
                <div className="flex gap-2">
                  <Button
                    tone="primary"
                    disabled={!draft.dicomSOPClass}
                    onClick={() => {
                      onChange([...items, { ...draft, cn: draft.cn || undefined }])
                      setAdding(false)
                    }}
                  >
                    Добавить
                  </Button>
                  <Button onClick={() => setAdding(false)}>Отмена</Button>
                </div>
              </div>
            ) : (
              <Button onClick={() => setAdding(true)}>+ Добавить возможность</Button>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
