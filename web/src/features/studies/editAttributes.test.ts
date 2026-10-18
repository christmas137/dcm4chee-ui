import { describe, expect, it } from 'vitest'
import type { DicomJson } from '../../api/dicom'
import { patientPathId, patientUpdateBody, studyUpdateBody } from '../../api/iocm'
import { planChanges, readForm } from './editAttributes'

/** Атрибуты исследования так, как их отдаёт QIDO `includefield=all` (стенд 5.35.1). */
const STUDY: DicomJson = {
  '00080005': { vr: 'CS', Value: ['ISO_IR 192'] },
  '00080020': { vr: 'DA', Value: ['20261018'] },
  '00080030': { vr: 'TM', Value: ['101530.123'] },
  '00080050': { vr: 'SH', Value: ['ACC-1'] },
  '00080054': { vr: 'AE', Value: ['DCM4CHEE'] },
  '00080061': { vr: 'CS', Value: ['CT'] },
  '00080090': { vr: 'PN', Value: [{ Alphabetic: 'Петров^Пётр' }] },
  '00081030': { vr: 'LO', Value: ['КТ'] },
  '00081190': { vr: 'UR', Value: ['http://arc/...'] },
  '00100010': { vr: 'PN', Value: [{ Alphabetic: 'Иванов^Иван^Иванович^^мл.' }] },
  '00100020': { vr: 'LO', Value: ['P-1'] },
  '00100021': { vr: 'LO', Value: ['HOSP'] },
  '00100030': { vr: 'DA', Value: ['19700101'] },
  '00100040': { vr: 'CS', Value: ['M'] },
  '0020000D': { vr: 'UI', Value: ['1.2.3'] },
  '00201206': { vr: 'IS', Value: ['2'] },
  '77771023': { vr: 'DA', Value: ['20301231'] },
  '7777102B': { vr: 'CS', Value: ['UPDATEABLE'] },
}

describe('форма правки', () => {
  it('читает пациента по компонентам имени, даты — в формате полей ввода', () => {
    expect(readForm(STUDY)).toEqual({
      family: 'Иванов', given: 'Иван', middle: 'Иванович', birthDate: '1970-01-01', sex: 'M',
      description: 'КТ', accession: 'ACC-1', studyDate: '2026-10-18', studyTime: '10:15',
      referrer: 'Петров Пётр', studyID: '', expiration: '2030-12-31',
    })
  })

  it('срок хранения: заморожен без даты — «бессрочно», без даты — «по правилам»', () => {
    expect(readForm({ ...STUDY, '77771023': { vr: 'DA' }, '7777102B': { vr: 'CS', Value: ['FROZEN'] } }).expiration).toBe('never')
    expect(readForm({ ...STUDY, '77771023': { vr: 'DA' } }).expiration).toBe('')
  })

  it('без правок — ничего не отправляется', () => {
    expect(planChanges(STUDY, readForm(STUDY))).toEqual({ patient: null, study: null, expiration: undefined })
  })

  it('правка разделена: пациент, исследование, срок; нетронутое время не обрезается', () => {
    const form = { ...readForm(STUDY), middle: '', description: 'КТ органов грудной клетки', accession: '', expiration: 'never' }
    expect(planChanges(STUDY, form)).toEqual({
      // Суффикс «мл.» формой не правится — он сохранён.
      patient: { '00100010': { vr: 'PN', Value: [{ Alphabetic: 'Иванов^Иван^^^мл.' }] } },
      study: { '00081030': { vr: 'LO', Value: ['КТ органов грудной клетки'] }, '00080050': { vr: 'SH' } },
      expiration: null,
    })
  })

  it('дата срока — ГГГГММДД; врач — по словам в компоненты имени', () => {
    const form = { ...readForm(STUDY), expiration: '2032-01-15', referrer: 'Сидоров  Сидор Сидорович', studyTime: '09:05' }
    expect(planChanges(STUDY, form)).toEqual({
      patient: null,
      study: {
        '00080090': { vr: 'PN', Value: [{ Alphabetic: 'Сидоров^Сидор^Сидорович' }] },
        '00080030': { vr: 'TM', Value: ['0905'] },
      },
      expiration: '20320115',
    })
  })
})

describe('тела запросов правки', () => {
  it('исследование: всё как было плюс правки, без вычисляемых и приватных; кодировка — UTF-8', () => {
    const body = studyUpdateBody({ ...STUDY, '00080005': { vr: 'CS', Value: ['ISO_IR 100'] } }, { '00081030': { vr: 'LO', Value: ['новое'] } })
    expect(body['00081030']).toEqual({ vr: 'LO', Value: ['новое'] })
    expect(body['00100020']).toEqual(STUDY['00100020']) // без ID пациента архив отвечает 400
    expect(body['00080005']).toEqual({ vr: 'CS', Value: ['ISO_IR 192'] })
    for (const tag of ['00080054', '00080061', '00081190', '00201206', '77771023', '7777102B']) expect(body).not.toHaveProperty(tag)
  })

  it('пациент: только группа 0010 и кодировка — без неё кириллица сохранялась «????»', () => {
    const body = patientUpdateBody(STUDY, { '00100040': { vr: 'CS', Value: ['F'] } })
    expect(Object.keys(body).sort()).toEqual(['00080005', '00100010', '00100020', '00100021', '00100030', '00100040'])
    expect(body['00080005']).toEqual({ vr: 'CS', Value: ['ISO_IR 192'] })
    expect(body['00100040']).toEqual({ vr: 'CS', Value: ['F'] })
  })

  it('ID пациента для пути — с издателем, иначе архив считает это сменой ID', () => {
    expect(patientPathId(STUDY)).toBe('P-1^^^HOSP')
    expect(patientPathId({ '00100020': { vr: 'LO', Value: ['P-2'] } })).toBe('P-2')
  })
})
