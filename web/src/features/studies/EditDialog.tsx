import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchStudyAttributes, patientPathId, patientUpdateBody, setExpiration, studyUpdateBody, updatePatient, updateStudy,
} from '../../api/iocm'
import type { DicomJson } from '../../api/dicom'
import { Dialog } from '../../components/Dialog'
import { Button, Field, Select, TextInput } from '../../components/form'
import { ErrorBox, Spinner } from '../../components/ui'
import { countLabel } from '../../lib/plural'
import { planChanges, readForm } from './editAttributes'
import type { EditForm, EditPlan } from './editAttributes'

/** Через год от сегодня — разумная дата по умолчанию, когда срок впервые ставят вручную. */
function nextYear(): string {
  const date = new Date()
  date.setFullYear(date.getFullYear() + 1)
  return date.toISOString().slice(0, 10)
}

/** Правка атрибутов пациента и исследования и срока хранения — тем, что реально поменялось. */
export function EditDialog({ aet, studyUID, onClose }: { aet: string; studyUID: string; onClose(): void }) {
  const attributes = useQuery({
    queryKey: ['study-attributes', aet, studyUID],
    queryFn: () => fetchStudyAttributes(aet, studyUID),
    staleTime: 0,
  })

  return (
    <Dialog title="Изменить данные исследования" onClose={onClose} width="w-[620px]">
      {attributes.isPending ? (
        <div className="p-6 text-center"><Spinner /></div>
      ) : attributes.error ? (
        <ErrorBox error={attributes.error as Error} retry={() => void attributes.refetch()} />
      ) : (
        <EditForms aet={aet} studyUID={studyUID} ds={attributes.data} onClose={onClose} />
      )}
    </Dialog>
  )
}

function EditForms({ aet, studyUID, ds, onClose }: { aet: string; studyUID: string; ds: DicomJson; onClose(): void }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<EditForm>(() => readForm(ds))
  const plan = planChanges(ds, form)
  const otherStudies = Number(ds['00201200']?.Value?.[0] ?? 1) - 1
  const nothing = !plan.patient && !plan.study && plan.expiration === undefined

  const save = useMutation({
    mutationFn: async (changes: EditPlan) => {
      // Сначала исследование: в его теле лежат и атрибуты пациента (архив без них не примет
      // правку), так что правка пациента должна прийти последней, чтобы не откатиться.
      if (changes.study) await updateStudy(aet, studyUID, studyUpdateBody(ds, changes.study))
      if (changes.patient) await updatePatient(aet, patientPathId(ds), patientUpdateBody(ds, changes.patient))
      if (changes.expiration !== undefined) await setExpiration(aet, studyUID, changes.expiration)
    },
    onSuccess: () => {
      for (const key of ['studies', 'study', 'studies-totals', 'study-attributes']) {
        void queryClient.invalidateQueries({ queryKey: [key] })
      }
      onClose()
    },
  })

  const set = (patch: Partial<EditForm>) => setForm((previous) => ({ ...previous, ...patch }))
  const initialExpiration = readForm(ds).expiration
  const datePart = form.expiration === 'never' ? '' : form.expiration
  const input = (key: keyof EditForm, label: string, extra: Partial<Parameters<typeof TextInput>[0]> = {}) => (
    <Field label={label}>
      <TextInput aria-label={label} value={form[key]} onChange={(event) => set({ [key]: event.target.value })} {...extra} />
    </Field>
  )

  return (
    <>
      <div className="space-y-4 p-4">
        <section className="space-y-2">
          <h3 className="text-[12px] font-semibold">
            Пациент
            <span className="ml-2 font-mono text-[11px] font-normal text-muted">{patientPathId(ds).replace(/\^\^\^/, ' · ')}</span>
          </h3>
          <div className="grid grid-cols-3 gap-2">
            {input('family', 'Фамилия')}
            {input('given', 'Имя')}
            {input('middle', 'Отчество')}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {input('birthDate', 'Дата рождения', { type: 'date' })}
            <Field label="Пол">
              <Select aria-label="Пол" value={form.sex} onChange={(event) => set({ sex: event.target.value })}>
                <option value="">не указан</option>
                <option value="M">мужской</option>
                <option value="F">женский</option>
                <option value="O">другой</option>
              </Select>
            </Field>
          </div>
          {plan.patient && otherStudies > 0 && (
            <p className="text-[11px] text-warn">
              Данные пациента общие: изменятся и в {countLabel(otherStudies, 'другом исследовании', 'других исследованиях', 'других исследованиях')}.
            </p>
          )}
        </section>

        <section className="space-y-2">
          <h3 className="text-[12px] font-semibold">Исследование</h3>
          {input('description', 'Описание')}
          <div className="grid grid-cols-3 gap-2">
            {input('accession', '№ назначения')}
            {input('studyDate', 'Дата', { type: 'date' })}
            {input('studyTime', 'Время', { type: 'time' })}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">{input('referrer', 'Направивший врач', { placeholder: 'Фамилия Имя Отчество' })}</div>
            {input('studyID', 'ID исследования')}
          </div>
        </section>

        <section className="space-y-2">
          <h3 className="text-[12px] font-semibold">Срок хранения</h3>
          <div role="radiogroup" aria-label="Срок хранения" className="space-y-1.5 text-[12px]">
            {initialExpiration === '' && (
              <label className="flex items-center gap-2">
                <input type="radio" name="expiration" checked={form.expiration === ''} onChange={() => set({ expiration: '' })} />
                По правилам архива <span className="text-muted">— срок определят настроенные политики хранения</span>
              </label>
            )}
            <label className="flex items-center gap-2">
              <input type="radio" name="expiration" checked={form.expiration === 'never'} onChange={() => set({ expiration: 'never' })} />
              Бессрочно <span className="text-muted">— хранить всегда, правила сроков не действуют</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="expiration"
                aria-label="До даты"
                checked={form.expiration !== '' && form.expiration !== 'never'}
                onChange={() => set({ expiration: datePart || nextYear() })}
              />
              <span className="whitespace-nowrap">Хранить до</span>
              <span className="w-40">
                <TextInput
                  aria-label="Хранить до"
                  type="date"
                  value={datePart}
                  onChange={(event) => set({ expiration: event.target.value || initialExpiration })}
                />
              </span>
            </label>
          </div>
        </section>
      </div>

      {save.error && (
        <p className="border-t border-line px-4 py-2 text-[12px] break-words text-danger" role="alert">
          Не удалось сохранить: {(save.error as Error).message}
        </p>
      )}
      <footer className="flex items-center gap-2 border-t border-line px-4 py-3">
        <p className="min-w-0 flex-1 text-[11.5px] text-muted">
          {nothing ? 'Изменений нет' : `Изменится: ${[
            plan.patient && 'пациент',
            plan.study && 'исследование',
            plan.expiration !== undefined && 'срок хранения',
          ].filter(Boolean).join(', ')}`}
        </p>
        <Button onClick={onClose} disabled={save.isPending}>Отмена</Button>
        <Button tone="primary" disabled={nothing || save.isPending} onClick={() => save.mutate(plan)}>
          {save.isPending ? 'Сохраняем…' : 'Сохранить'}
        </Button>
      </footer>
    </>
  )
}
