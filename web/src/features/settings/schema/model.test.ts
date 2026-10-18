import { describe, expect, it } from 'vitest'
import { collectFields, enumOptions, fieldKind, formatTitleKey, getSchema, hasSchema, unknownKeys } from './model'
import type { PropSchema } from './model'

const prop = (extra: Partial<PropSchema>): PropSchema => ({ title: 't', description: 'd', ...extra })

describe('схемы', () => {
  it('загружены все схемы штатного UI, ссылки между ними не битые', () => {
    const archive = getSchema('archiveDevice.schema.json')
    expect(Object.keys(archive.properties).length).toBeGreaterThan(300)
    for (const name of ['device', 'networkAE', 'storage', 'exporter', 'hl7Application']) {
      expect(hasSchema(`${name}.schema.json`)).toBe(true)
    }
    const broken: string[] = []
    for (const ref of ['device.schema.json']) {
      const visit = (name: string, seen: Set<string>) => {
        if (seen.has(name)) return
        seen.add(name)
        if (!hasSchema(name)) return void broken.push(name)
        for (const item of Object.values(getSchema(name).properties)) {
          const next = item.$ref ?? item.items?.$ref
          if (next) visit(next, seen)
        }
      }
      visit(ref, new Set())
    }
    expect(broken).toEqual([])
  })
})

describe('вид поля', () => {
  it('выбирает виджет по типу, вариантам и ссылкам', () => {
    expect(fieldKind(prop({ type: 'boolean' }))).toEqual({ kind: 'boolean' })
    expect(fieldKind(prop({ type: 'integer' }))).toEqual({ kind: 'number', integer: true })
    expect(fieldKind(prop({ type: 'string', format: 'dcmDuration' }))).toEqual({ kind: 'text', format: 'dcmDuration' })
    expect(fieldKind(prop({ type: 'string', enum: ['A|первый', 'B'] }))).toEqual({
      kind: 'enum', options: [{ value: 'A', description: 'первый' }, { value: 'B' }],
    })
    expect(fieldKind(prop({ type: 'array', items: { type: 'string' }, format: 'dcmAETitle' })))
      .toEqual({ kind: 'texts', format: 'dcmAETitle' })
    expect(fieldKind(prop({ type: 'array', items: { type: 'string', format: 'dcmTag' } })))
      .toEqual({ kind: 'texts', format: 'dcmTag' })
    expect(fieldKind(prop({ type: 'array', items: { type: 'string', enum: ['X'] } })).kind).toBe('enums')
    expect(fieldKind(prop({ type: 'array', items: { $ref: 'storage.schema.json' }, titleKey: '{dcmStorageID}' })))
      .toEqual({ kind: 'list', ref: 'storage.schema.json', titleKey: '{dcmStorageID}' })
    expect(fieldKind(prop({ $ref: 'dcmNetworkAE.schema.json' }))).toEqual({ kind: 'object', ref: 'dcmNetworkAE.schema.json' })
  })

  it('числовые варианты остаются числами', () => {
    expect(enumOptions([0, 1, '-1|ошибка'])).toEqual([{ value: 0 }, { value: 1 }, { value: '-1', description: 'ошибка' }])
  })
})

describe('поля объекта', () => {
  it('AE: свои поля, затем расширения dcm4chee и архива — одной формой; списки отдельно', () => {
    const { fields, lists } = collectFields('networkAE.schema.json')
    const paths = fields.map((field) => field.path.join('.'))
    expect(paths).toContain('dicomAETitle')
    expect(paths).toContain('dcmNetworkAE.dcmAcceptedCallingAETitle')
    expect(paths).toContain('dcmNetworkAE.dcmArchiveNetworkAE.dcmOverwritePolicy')
    // Собственные поля идут раньше полей расширений.
    expect(paths.indexOf('dicomAETitle')).toBeLessThan(paths.indexOf('dcmNetworkAE.dcmAcceptedCallingAETitle'))
    expect(lists.map((field) => field.path.join('.'))).toEqual(expect.arrayContaining([
      'dicomTransferCapability', 'dcmNetworkAE.dcmArchiveNetworkAE.dcmExportRule',
    ]))
    const overwrite = fields.find((field) => field.key === 'dcmOverwritePolicy')!
    expect(overwrite.via).toEqual(['dcmNetworkAE.schema.json', 'archiveNetworkAE.schema.json'])
    expect(overwrite.schema).toBe('archiveNetworkAE.schema.json')
  })

  it('обязательные поля отмечены, порядок — по order', () => {
    const { fields } = collectFields('device.schema.json', { skip: ['dcmDevice.schema.json'] })
    expect(fields[0].key).toBe('dicomDeviceName')
    expect(fields[0].required).toBe(true)
    expect(fields.some((field) => field.path[0] === 'dcmDevice')).toBe(false)
  })
})

describe('подпись записи', () => {
  it('подставляет поля в шаблон, пустые части убирает', () => {
    expect(formatTitleKey('{dicomHostname}:{dicomPort} {cn}', { dicomHostname: 'arc', dicomPort: 104, cn: 'dicom' }))
      .toBe('arc:104 dicom')
    expect(formatTitleKey('{dcmuiFilterTemplateGroupName} ( {dcmuiFilterTemplateID} )', { dcmuiFilterTemplateGroupName: 'g' }))
      .toBe('g')
    expect(formatTitleKey('{cn}', {})).toBe('')
    expect(formatTitleKey(undefined, { cn: 'x' })).toBe('')
  })
})

describe('ключи вне схемы', () => {
  it('находит неизвестные ключи на всех уровнях расширений, кроме пропущенных', () => {
    const ae = {
      dicomAETitle: 'A',
      dcmFromTheFuture: 1,
      dcmNetworkAE: { dcmArchiveNetworkAE: { dcmOverwritePolicy: 'NEVER', dcmNewFlag: true } },
    }
    expect(unknownKeys('networkAE.schema.json', ae)).toEqual([
      ['dcmFromTheFuture'], ['dcmNetworkAE', 'dcmArchiveNetworkAE', 'dcmNewFlag'],
    ])
    expect(unknownKeys('networkAE.schema.json', ae, { skip: ['archiveNetworkAE.schema.json'] }))
      .toEqual([['dcmFromTheFuture']])
  })
})
