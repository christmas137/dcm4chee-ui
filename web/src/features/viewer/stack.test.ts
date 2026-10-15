import { describe, expect, it } from 'vitest'
import { classifySeries, frameAccept, sortStack, toStackInstance, wadorsImageIds } from './stack'
import type { StackInstance } from './stack'

const axial = [1, 0, 0, 0, 1, 0]
const at = (sopUID: string, z: number, number?: number): StackInstance =>
  ({ sopUID, number, frames: 1, position: [-120, -120, z], orientation: axial })

describe('снимок стека из метаданных', () => {
  it('читает номер, кадры и геометрию', () => {
    expect(toStackInstance({
      '00080018': { vr: 'UI', Value: ['1.2.3'] },
      '00200013': { vr: 'IS', Value: ['7'] },
      '00280008': { vr: 'IS', Value: ['30'] },
      '00200032': { vr: 'DS', Value: [-120, -120.5, '35'] },
      '00200037': { vr: 'DS', Value: [1, 0, 0, 0, 1, 0] },
    })).toEqual({
      sopUID: '1.2.3', sopClassUID: undefined, number: 7, frames: 30,
      position: [-120, -120.5, 35], orientation: [1, 0, 0, 0, 1, 0],
    })
  })

  it('без NumberOfFrames — один кадр, битая геометрия игнорируется', () => {
    const instance = toStackInstance({
      '00080018': { vr: 'UI', Value: ['1'] },
      '00200032': { vr: 'DS', Value: ['abc', 1, 2] },
    })
    expect(instance.frames).toBe(1)
    expect(instance.position).toBeUndefined()
  })
})

describe('порядок срезов', () => {
  it('по положению в пространстве, даже если номера перепутаны', () => {
    const sorted = sortStack([at('c', 10, 1), at('a', -10, 3), at('b', 0, 2)])
    expect(sorted.map((s) => s.sopUID)).toEqual(['a', 'b', 'c'])
  })

  it('сагиттальная серия сортируется вдоль своей нормали, а не по z', () => {
    const sagittal = [0, 1, 0, 0, 0, -1] // нормаль — (−1, 0, 0)
    const make = (sopUID: string, x: number): StackInstance =>
      ({ sopUID, frames: 1, position: [x, 0, 0], orientation: sagittal })
    expect(sortStack([make('a', -5), make('b', 5), make('c', 0)]).map((s) => s.sopUID)).toEqual(['b', 'c', 'a'])
  })

  it('без геометрии хоть у одного снимка — по InstanceNumber', () => {
    const sorted = sortStack([at('c', 10, 3), { sopUID: 'a', number: 1, frames: 1 }, at('b', 0, 2)])
    expect(sorted.map((s) => s.sopUID)).toEqual(['a', 'b', 'c'])
  })

  it('без номеров — сохраняет порядок прихода', () => {
    const plain = (sopUID: string): StackInstance => ({ sopUID, frames: 1 })
    expect(sortStack([plain('x'), plain('y'), plain('z')]).map((s) => s.sopUID)).toEqual(['x', 'y', 'z'])
  })
})

describe('адреса кадров', () => {
  it('по кадру на снимок, многокадровые разворачиваются', () => {
    const ids = wadorsImageIds('http://h/dcm4chee-arc', 'DCM4CHEE', 'S', 'SE', [
      { sopUID: 'I1', frames: 1 },
      { sopUID: 'I2', frames: 3 },
    ])
    expect(ids).toEqual([
      'wadors:http://h/dcm4chee-arc/aets/DCM4CHEE/rs/studies/S/series/SE/instances/I1/frames/1',
      'wadors:http://h/dcm4chee-arc/aets/DCM4CHEE/rs/studies/S/series/SE/instances/I2/frames/1',
      'wadors:http://h/dcm4chee-arc/aets/DCM4CHEE/rs/studies/S/series/SE/instances/I2/frames/2',
      'wadors:http://h/dcm4chee-arc/aets/DCM4CHEE/rs/studies/S/series/SE/instances/I2/frames/3',
    ])
  })
})

describe('тип серии', () => {
  it.each([
    ['CT', '1.2.840.10008.5.1.4.1.1.2', 'image'],
    ['MR', undefined, 'image'],
    ['DOC', '1.2.840.10008.5.1.4.1.1.104.1', 'pdf'],
    ['OT', '1.2.840.10008.5.1.4.1.1.104.1', 'pdf'],
    ['SR', '1.2.840.10008.5.1.4.1.1.88.33', 'report'],
    ['KO', '1.2.840.10008.5.1.4.1.1.88.59', 'report'],
    ['PR', '1.2.840.10008.5.1.4.1.1.11.1', 'other'],
  ] as const)('%s / %s → %s', (modality, sop, kind) => {
    expect(classifySeries(modality, sop)).toBe(kind)
  })
})

describe('формат кадров по синтаксису хранения', () => {
  const fallback = 'multipart/related; type=application/octet-stream; transfer-syntax=*'

  it.each([
    ['1.2.840.10008.1.2.4.90', 'image/jp2'],
    ['1.2.840.10008.1.2.4.80', 'image/jls'],
    ['1.2.840.10008.1.2.4.70', 'image/jll'],
    ['1.2.840.10008.1.2.4.50', 'image/jpeg'],
    ['1.2.840.10008.1.2.4.201', 'image/jphc'],
  ])('%s → родной %s, несжатый запасным', (ts, type) => {
    expect(frameAccept(ts)).toBe(`multipart/related; type="${type}"; transfer-syntax=${ts}, ${fallback}`)
  })

  it('несжатые, RLE и неизвестные — как есть, без родного типа', () => {
    expect(frameAccept('1.2.840.10008.1.2.1')).toBe(fallback)
    // RLE: dcm4chee отвечает image/dicom-rle без transfer-syntax, cornerstone такого не разберёт.
    expect(frameAccept('1.2.840.10008.1.2.5')).toBe(fallback)
    expect(frameAccept(undefined)).toBe(fallback)
  })
})
