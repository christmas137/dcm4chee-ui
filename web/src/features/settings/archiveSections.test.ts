import { describe, expect, it } from 'vitest'
import { extraSections, itemLabel, sectionItems, SECTIONS, sectionSchema } from './archiveSections'
import { getSchema } from './schema/model'

const device = {
  dicomDeviceName: 'dcm4chee-arc',
  dcmDevice: {
    dcmWebApp: [{ dcmWebAppName: 'DCM4CHEE' }],
    dcmSomethingNew: [{ cn: 'из будущей версии' }],
    dcmArchiveDevice: {
      dcmFuzzyAlgorithmClass: 'org.dcm4che3.soundex.ESoundex',
      dcmPurgeStoragePollingInterval: 'PT5M',
      dcmHideSPSWithStatusFromMWL: ['COMPLETED'],
      dcmStorage: [{ dcmStorageID: 'fs1', dcmURI: 'file:///storage/fs1/' }],
      dcmExporter: [],
    },
  },
}

describe('разделы', () => {
  const storage = SECTIONS.find((section) => section.label === 'Хранилища')!

  it('достаёт элементы раздела', () => {
    expect(sectionItems(device, storage)).toHaveLength(1)
  })

  it('пустой или отсутствующий раздел — пустой список', () => {
    const exporters = SECTIONS.find((section) => section.label === 'Экспортёры')!
    expect(sectionItems(device, exporters)).toEqual([])
    expect(sectionItems({}, storage)).toEqual([])
  })

  it('подписывает элемент по идентификатору', () => {
    expect(itemLabel({ dcmStorageID: 'fs1' }, storage)).toBe('fs1')
    expect(itemLabel({ dicomDescription: 'описание' }, storage)).toBe('описание')
    expect(itemLabel({}, storage)).toBe('(без названия)')
  })

  it('находит разделы, которых нет в реестре', () => {
    const extra = extraSections(device)
    expect(extra.map((section) => section.label)).toContain('dcmSomethingNew')
    // Списки строк разделами не считаются.
    expect(extra.map((section) => section.label)).not.toContain('dcmHideSPSWithStatusFromMWL')
  })

  it('у каждого раздела из реестра есть схема записей', () => {
    const without = SECTIONS.filter((section) => !sectionSchema(section)).map((section) => section.path.join('/'))
    expect(without).toEqual([])
    expect(sectionSchema(storage)).toEqual({ ref: 'storage.schema.json', titleKey: '{dcmStorageID}' })
  })

  it('каждый список из схем архива и устройства есть в реестре — ничего не спрятано', () => {
    const known = new Set(SECTIONS.map((section) => section.path.join('/')))
    const missing: string[] = []
    for (const [schema, base] of [['archiveDevice.schema.json', 'dcmDevice/dcmArchiveDevice'], ['dcmDevice.schema.json', 'dcmDevice']]) {
      for (const [key, prop] of Object.entries(getSchema(schema).properties)) {
        const nested = prop.items?.$ref ?? prop.$ref
        if (nested && nested !== 'archiveDevice.schema.json' && !known.has(`${base}/${key}`)) missing.push(`${base}/${key}`)
      }
    }
    expect(missing).toEqual([])
  })
})
