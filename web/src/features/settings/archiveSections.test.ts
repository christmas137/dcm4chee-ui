import { describe, expect, it } from 'vitest'
import {
  extraSections, getAtPath, itemLabel, scalarSettings, sectionItems, SECTIONS, setAtPath,
} from './archiveSections'

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

describe('путь в конфигурации', () => {
  it('читает значение', () => {
    expect(getAtPath(device, ['dcmDevice', 'dcmArchiveDevice', 'dcmFuzzyAlgorithmClass']))
      .toBe('org.dcm4che3.soundex.ESoundex')
    expect(getAtPath(device, ['нет', 'такого'])).toBeUndefined()
  })

  it('пишет значение, не меняя исходный объект', () => {
    const next = setAtPath(device, ['dcmDevice', 'dcmArchiveDevice', 'dcmFuzzyAlgorithmClass'], 'x')
    expect(getAtPath(next, ['dcmDevice', 'dcmArchiveDevice', 'dcmFuzzyAlgorithmClass'])).toBe('x')
    expect(device.dcmDevice.dcmArchiveDevice.dcmFuzzyAlgorithmClass).toBe('org.dcm4che3.soundex.ESoundex')
    // Соседние ветки остаются на месте.
    expect(getAtPath(next, ['dcmDevice', 'dcmWebApp'])).toEqual([{ dcmWebAppName: 'DCM4CHEE' }])
  })

  it('создаёт недостающие узлы', () => {
    const next = setAtPath({}, ['a', 'b', 'c'], 1)
    expect(next).toEqual({ a: { b: { c: 1 } } })
  })
})

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

  it('собирает скалярные настройки архива', () => {
    const scalars = scalarSettings(device)
    expect(scalars).toContainEqual(['dcmFuzzyAlgorithmClass', 'org.dcm4che3.soundex.ESoundex'])
    expect(scalars.map(([key]) => key)).not.toContain('dcmStorage')
  })
})
