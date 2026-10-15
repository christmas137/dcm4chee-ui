/**
 * Тестовые данные в формате, в каком их отдаёт dcm4chee (DICOM JSON), и «стандартный» фейковый
 * архив с QIDO, который понимает маски, диапазоны дат и мультизначные модальности — как настоящий.
 */
import type { DicomJson } from '../api/dicom'
import { FakeArchive, json } from './fakeArchive'

export interface StudyFixture {
  uid: string
  name: string
  pid: string
  birth?: string
  sex?: string
  date: string
  time?: string
  acc?: string
  desc?: string
  modalities: string[]
  series?: SeriesFixture[]
  sizeKB?: number
}

export interface SeriesFixture {
  uid: string
  number: number
  desc?: string
  modality: string
  instances: InstanceFixture[]
}

export interface InstanceFixture {
  sop: string
  number: number
  sopClass?: string
  frames?: number
}

const el = (vr: string, ...values: unknown[]) => ({ vr, Value: values })
const pn = (name: string) => ({ vr: 'PN', Value: [{ Alphabetic: name }] })

export function studyJson(study: StudyFixture): DicomJson {
  const instances = (study.series ?? []).reduce((sum, series) => sum + series.instances.length, 0)
  const ds: DicomJson = {
    '00080020': el('DA', study.date),
    '00080061': el('CS', ...study.modalities),
    '00100010': pn(study.name),
    '00100020': el('LO', study.pid),
    '0020000D': el('UI', study.uid),
    '00201206': el('IS', study.series?.length ?? 0),
    '00201208': el('IS', instances),
  }
  if (study.time) ds['00080030'] = el('TM', study.time)
  if (study.acc) ds['00080050'] = el('SH', study.acc)
  if (study.desc) ds['00081030'] = el('LO', study.desc)
  if (study.birth) ds['00100030'] = el('DA', study.birth)
  if (study.sex) ds['00100040'] = el('CS', study.sex)
  if (study.sizeKB !== undefined) ds['77771029'] = el('UL', study.sizeKB)
  return ds
}

export function seriesJson(study: StudyFixture, series: SeriesFixture): DicomJson {
  const ds: DicomJson = {
    '0020000D': el('UI', study.uid),
    '0020000E': el('UI', series.uid),
    '00080060': el('CS', series.modality),
    '00200011': el('IS', String(series.number)),
    '00201209': el('IS', String(series.instances.length)),
  }
  if (series.desc) ds['0008103E'] = el('LO', series.desc)
  return ds
}

export function instanceJson(study: StudyFixture, series: SeriesFixture, instance: InstanceFixture): DicomJson {
  const ds: DicomJson = {
    '00080016': el('UI', instance.sopClass ?? '1.2.840.10008.5.1.4.1.1.2'),
    '00080018': el('UI', instance.sop),
    '0020000D': el('UI', study.uid),
    '0020000E': el('UI', series.uid),
    '00200013': el('IS', String(instance.number)),
    '00280010': el('US', 128),
    '00280011': el('US', 128),
  }
  if (instance.frames) ds['00280008'] = el('IS', String(instance.frames))
  return ds
}

/** Метаданные снимка — с вложенной последовательностью и bulk data, как у реальных КТ. */
export function metadataJson(study: StudyFixture, series: SeriesFixture, instance: InstanceFixture): DicomJson {
  return {
    ...studyJson(study),
    ...seriesJson(study, series),
    ...instanceJson(study, series, instance),
    '00081032': {
      vr: 'SQ',
      Value: [
        {
          '00080100': el('SH', 'CTCHEST'),
          '00080104': el('LO', 'КТ грудной клетки'),
        },
      ],
    },
    '00280030': el('DS', 0.6, 0.6),
    '7FE00010': { vr: 'OW', BulkDataURI: `http://arc/studies/${study.uid}/bulk/7FE00010` },
  }
}

const series = (uid: string, number: number, desc: string, modality: string, count: number): SeriesFixture => ({
  uid,
  number,
  desc,
  modality,
  instances: Array.from({ length: count }, (_, index) => ({ sop: `${uid}.${index + 1}`, number: index + 1 })),
})

export const IVANOV_CHEST: StudyFixture = {
  uid: '1.2.3.100',
  name: 'Иванов^Иван^Иванович',
  pid: 'P-1001',
  birth: '19640312',
  sex: 'M',
  date: '20260912',
  time: '084717',
  acc: 'ACC20000',
  desc: 'КТ органов грудной клетки',
  modalities: ['CT'],
  sizeKB: 1669,
  series: [
    series('1.2.3.100.1', 1, 'Topogram', 'CT', 1),
    series('1.2.3.100.2', 2, 'Chest 1.0mm', 'CT', 24),
    series('1.2.3.100.3', 3, 'Chest 5.0mm', 'CT', 24),
  ],
}

export const PETROVA_MR: StudyFixture = {
  uid: '1.2.3.200',
  name: 'Петрова^Мария^Сергеевна',
  pid: 'P-1002',
  birth: '19780925',
  sex: 'F',
  date: '20260911',
  time: '190643',
  acc: 'ACC20001',
  desc: 'МРТ поясничного отдела позвоночника',
  modalities: ['MR'],
  sizeKB: 2448,
  series: [series('1.2.3.200.1', 1, 'T2 sag', 'MR', 3)],
}

export const SMITH_US: StudyFixture = {
  uid: '1.2.3.300',
  name: 'Smith^John^A',
  pid: 'P-2001',
  date: '20260316',
  acc: 'ACC20003',
  desc: 'УЗИ брюшной полости',
  modalities: ['US'],
  sizeKB: 83,
  series: [series('1.2.3.300.1', 1, 'Abdomen', 'US', 2)],
}

export const STUDIES = [IVANOV_CHEST, PETROVA_MR, SMITH_US]

export const AETS = [
  { dicomAETitle: 'DCM4CHEE', dicomDescription: 'Hide instances rejected for Quality Reasons' },
  { dicomAETitle: 'AS_RECEIVED', dicomDescription: 'Retrieve instances as received' },
]

/** QIDO-маска (`*`, `?`) → RegExp. PN сравниваем без учёта регистра, как сервер. */
function wildcard(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')
  return new RegExp(`^${escaped}$`, 'i')
}

function inDateRange(date: string, range: string): boolean {
  if (!range.includes('-')) return date === range
  const [from, to] = range.split('-')
  return (!from || date >= from) && (!to || date <= to)
}

export function matchStudy(study: StudyFixture, params: URLSearchParams): boolean {
  const checks: Array<[string, (value: string) => boolean]> = [
    ['PatientName', (v) => wildcard(v).test(study.name)],
    ['PatientID', (v) => wildcard(v).test(study.pid)],
    ['AccessionNumber', (v) => wildcard(v).test(study.acc ?? '')],
    ['StudyDescription', (v) => wildcard(v).test(study.desc ?? '')],
    ['StudyInstanceUID', (v) => v === study.uid],
    ['StudyDate', (v) => inDateRange(study.date, v)],
    ['ModalitiesInStudy', (v) => v.split('\\').some((m) => study.modalities.includes(m))],
  ]
  return checks.every(([key, check]) => {
    const value = params.get(key)
    return value === null || check(value)
  })
}

/** Архив с тремя исследованиями, их сериями, снимками, метаданными и превью. */
export function standardArchive(studies: StudyFixture[] = STUDIES): FakeArchive {
  const archive = new FakeArchive()
  const find = (uid: string) => studies.find((study) => study.uid === uid)

  archive.on('GET', '/aets', AETS)
  archive.on('GET', /^\/aets\/[^/]+\/rs\/studies$/, ({ params }) => {
    const offset = Number(params.get('offset') ?? 0)
    const limit = Number(params.get('limit') ?? 1000)
    const found = studies.filter((study) => matchStudy(study, params)).slice(offset, offset + limit)
    return found.length ? found.map(studyJson) : undefined // пустой результат — 204, как у dcm4chee
  })
  archive.on('GET', /^\/aets\/[^/]+\/rs\/studies\/count$/, ({ params }) =>
    ({ count: studies.filter((study) => matchStudy(study, params)).length }))
  archive.on('GET', /^\/aets\/[^/]+\/rs\/studies\/size$/, ({ params }) =>
    ({ size: studies.filter((study) => matchStudy(study, params)).reduce((sum, s) => sum + (s.sizeKB ?? 0) * 1024, 0) }))

  archive.on('GET', /^\/aets\/[^/]+\/rs\/studies\/[^/]+\/series$/, ({ path }) => {
    const study = find(path.split('/')[5])
    return study ? (study.series ?? []).map((item) => seriesJson(study, item)) : undefined
  })

  archive.on('GET', /^\/aets\/[^/]+\/rs\/studies\/[^/]+\/series\/[^/]+\/instances$/, ({ path, params }) => {
    const parts = path.split('/')
    const study = find(parts[5])
    const item = study?.series?.find((s) => s.uid === parts[7])
    if (!study || !item) return undefined
    const offset = Number(params.get('offset') ?? 0)
    const limit = Number(params.get('limit') ?? 1000)
    const page = item.instances.slice(offset, offset + limit)
    return page.length ? page.map((instance) => instanceJson(study, item, instance)) : undefined
  })

  archive.on('GET', /^\/aets\/[^/]+\/rs\/studies\/[^/]+\/series\/[^/]+\/instances\/[^/]+\/metadata$/, ({ path }) => {
    const parts = path.split('/')
    const study = find(parts[5])
    const item = study?.series?.find((s) => s.uid === parts[7])
    const instance = item?.instances.find((i) => i.sop === parts[9])
    if (!study || !item || !instance) return json('нет такого снимка', { status: 404 })
    return [metadataJson(study, item, instance)]
  })

  return archive
}
