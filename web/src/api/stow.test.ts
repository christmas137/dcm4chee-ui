import { describe, expect, it } from 'vitest'
import { buildMultipart, parseStowResponse, stow, stowReasonText } from './stow'
import { FakeArchive, json } from '../test/fakeArchive'

/** Ответ архива на «один новый, один повтор, один мусор» — снят со стенда 5.35.1. */
const PARTIAL = {
  '00081190': { vr: 'UR', Value: ['http://arc/dcm4chee-arc/aets/DCM4CHEE/rs/studies/1.2.3'] },
  '00081198': { vr: 'SQ', Value: [{
    '00081150': { vr: 'UI', Value: ['1.2.40.0.13.1.15.110.3.165.2'] },
    '00081155': { vr: 'UI', Value: ['2.25.231914399308456200009898476724701482051'] },
    '00081197': { vr: 'US', Value: [50329] },
  }] },
  '00081199': { vr: 'SQ', Value: [
    { '00081150': { vr: 'UI', Value: ['1.2.840.10008.5.1.4.1.1.2'] }, '00081155': { vr: 'UI', Value: ['1.2.3.1'] } },
    { '00081155': { vr: 'UI', Value: ['1.2.3.2'] }, '00081196': { vr: 'US', Value: [0xb000] } },
  ] },
}

describe('тело multipart/related', () => {
  it('каждый файл — своя часть application/dicom, в конце закрывающая граница', async () => {
    const body = buildMultipart([new Blob(['AAA']), new Blob(['BB'])], 'xyz')
    expect(await body.text()).toBe(
      '--xyz\r\nContent-Type: application/dicom\r\n\r\nAAA\r\n'
      + '--xyz\r\nContent-Type: application/dicom\r\n\r\nBB\r\n'
      + '--xyz--\r\n',
    )
  })
})

describe('ответ STOW', () => {
  it('принятые, с предупреждением и отказы — с кодами', () => {
    expect(parseStowResponse(PARTIAL)).toEqual({
      stored: [{ sopUID: '1.2.3.1', warning: undefined }, { sopUID: '1.2.3.2', warning: 0xb000 }],
      failed: [{ sopUID: '2.25.231914399308456200009898476724701482051', reason: 50329 }],
    })
  })

  it('409 (ничего не принято) — не ошибка запроса, а отчёт с причинами', async () => {
    const archive = new FakeArchive().install()
    archive.on('POST', '/aets/DCM4CHEE/rs/studies', () => json({ '00081198': PARTIAL['00081198'] }, { status: 409 }))
    const result = await stow('DCM4CHEE', [new Blob(['x'])])
    expect(result).toEqual({ stored: [], failed: [{ sopUID: '2.25.231914399308456200009898476724701482051', reason: 50329 }] })
  })

  it('другие ошибки пробрасываются', async () => {
    const archive = new FakeArchive().install()
    archive.on('POST', '/aets/DCM4CHEE/rs/studies', () => new Response('нет места', { status: 500 }))
    await expect(stow('DCM4CHEE', [new Blob(['x'])])).rejects.toThrow(/HTTP 500/)
  })

  it('причины отказа по-русски, с кодом', () => {
    expect(stowReasonText(0xa700)).toBe('у архива закончилось место (A700H)')
    expect(stowReasonText(0xa7ff)).toBe('у архива не хватает ресурсов (A7FFH)')
    expect(stowReasonText(50329)).toBe('архив не смог обработать файл (C499H)')
    expect(stowReasonText(undefined)).toBe('причина не указана')
  })
})
