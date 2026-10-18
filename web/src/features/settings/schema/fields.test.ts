import { describe, expect, it } from 'vitest'
import { fieldProblem, fieldState, groupOf, matchesQuery, missingRequired } from './fields'
import { collectFields } from './model'
import type { FieldInfo } from './model'
import { THEMES, themeOf } from './themes'

const archive = collectFields('archiveDevice.schema.json').fields
const field = (key: string, fields: FieldInfo[] = archive) => fields.find((item) => item.key === key)!

describe('темы параметров архива', () => {
  it('почти все параметры разложены по темам, в «Общем» — единицы', () => {
    const general = archive.filter((item) => themeOf(item.key) === 'general').map((item) => item.key)
    expect(general.length).toBeLessThanOrEqual(6)
    // Ни одна тема не пустует — иначе пункт в навигаторе был бы мёртвым.
    for (const theme of THEMES) {
      expect(archive.some((item) => themeOf(item.key) === theme.id), theme.id).toBe(true)
    }
  })

  it.each([
    ['dcmOverwritePolicy', 'store'],
    ['dcmQidoMaxNumberOfResults', 'query'],
    ['dcmFallbackCMoveSCP', 'retrieve'],
    ['dcmDeleteStudyBatchSize', 'deletion'],
    ['dcmStorageVerificationPolicy', 'verification'],
    ['dcmAcceptMissingPatientID', 'patient'],
    ['hl7PSUAction', 'hl7'],
    ['dcmMWLPollingInterval', 'worklist'],
    ['dcmAuditSpoolDirectory', 'audit'],
  ])('%s → %s', (key, theme) => {
    expect(themeOf(key)).toBe(theme)
  })
})

describe('группы полей', () => {
  it('параметры архива — по темам; у AE — свои, расширение, затем темы архива с пометкой', () => {
    expect(groupOf(field('dcmOverwritePolicy')).label).toBe('Приём объектов')
    const ae = collectFields('networkAE.schema.json').fields
    const own = groupOf(field('dicomAETitle', ae))
    const ext = groupOf(field('dcmAcceptedCallingAETitle', ae))
    const arc = groupOf(field('dcmOverwritePolicy', ae))
    expect(own.label).toBe('Основное')
    expect(ext.label).toBe('Расширение AE')
    expect(arc.label).toBe('Архив: настройки AE · Приём объектов')
    expect(own.order).toBeLessThan(ext.order)
    expect(ext.order).toBeLessThan(arc.order)
  })
})

describe('поиск параметра', () => {
  it('ищет по русскому и английскому названию, ключу и словам описания', () => {
    const overwrite = field('dcmOverwritePolicy')
    expect(matchesQuery(overwrite, 'перезапис')).toBe(true)
    expect(matchesQuery(overwrite, 'Overwrite Policy')).toBe(true)
    expect(matchesQuery(overwrite, 'dcmoverwrite')).toBe(true)
    expect(matchesQuery(overwrite, 'SOP Instance UID')).toBe(true)
    expect(matchesQuery(overwrite, 'политика сжатие')).toBe(false)
    expect(matchesQuery(overwrite, '  ')).toBe(true)
  })
})

describe('состояние поля', () => {
  const overwrite = field('dcmOverwritePolicy')

  it('не задано / задано / изменено относительно сохранённого', () => {
    expect(fieldState(overwrite, {}, {})).toBe('default')
    expect(fieldState(overwrite, { dcmOverwritePolicy: 'NEVER' }, { dcmOverwritePolicy: 'NEVER' })).toBe('set')
    expect(fieldState(overwrite, { dcmOverwritePolicy: 'ALWAYS' }, { dcmOverwritePolicy: 'NEVER' })).toBe('changed')
    expect(fieldState(overwrite, {}, { dcmOverwritePolicy: 'NEVER' })).toBe('changed')
  })

  it('обязательное поле без умолчания и без значения — проблема; с умолчанием — нет', () => {
    const storage = collectFields('storage.schema.json').fields
    expect(fieldProblem(field('dcmStorageID', storage), undefined)).toBe('обязательное поле')
    expect(fieldProblem(field('dcmStorageID', storage), 'fs1')).toBeNull()
    expect(missingRequired(storage, { dcmStorageID: 'fs1' }).map((item) => item.key)).toEqual(['dcmURI'])
    const connection = collectFields('networkConnection.schema.json').fields
    // dcmTCPBacklog обязателен по схеме, но у него есть умолчание — архив подставит сам.
    expect(fieldProblem(field('dcmTCPBacklog', connection), undefined)).toBeNull()
  })
})
