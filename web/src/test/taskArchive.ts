/**
 * Фейковые очереди задач: задачи в памяти, `/queue/{очередь}` с фильтрами, сортировкой
 * и действиями — как у dcm4chee 5.35.1. Действия меняют задачи, следующее чтение это видит.
 */
import type { Task } from '../api/tasks'
import { FakeArchive, json } from './fakeArchive'
import type { RecordedRequest } from './fakeArchive'

export const QUEUES = [
  { name: 'Export', description: 'Export Tasks' },
  { name: 'Retrieve', description: 'Dicom Retrieve Tasks' },
  { name: 'StgVerTasks', description: 'Storage Verification Tasks' },
  { name: 'HL7Send', description: 'HL7 Forward Tasks' },
]

const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString().replace('Z', '+0000')

/** Набор задач, снятый со стенда (UID укорочены). */
export function sampleTasks(): Task[] {
  return [
    { taskID: '7', queue: 'Export', type: 'EXPORT', status: 'FAILED', createdTime: at(30), updatedTime: at(2),
      ExporterID: 'TO_DOWN', StudyInstanceUID: '1.2.3.7', NumberOfInstances: '48', Modality: ['CT'], failures: '3',
      errorMessage: 'java.net.ConnectException: Connection refused' },
    { taskID: '6', queue: 'Export', type: 'EXPORT', status: 'WARNING', createdTime: at(30), updatedTime: at(20),
      ExporterID: 'TO_AS_RECEIVED', StudyInstanceUID: '1.2.3.6',
      outcomeMessage: 'Export Study[uid=1.2.3.6] to AS_RECEIVED - completed:0, failed:49' },
    { taskID: '5', queue: 'Export', type: 'EXPORT', status: 'COMPLETED', createdTime: at(30), updatedTime: at(25), batchID: 'batch-1',
      ExporterID: 'TO_STORESCP', StudyInstanceUID: '1.2.3.5', outcomeMessage: 'Export Study[uid=1.2.3.5] to STORESCP - completed:72' },
    { taskID: '8', queue: 'Retrieve', type: 'RETRIEVE', status: 'COMPLETED', createdTime: at(15), updatedTime: at(10),
      RemoteAET: 'DCM4CHEE', DestinationAET: 'STORESCP', StudyInstanceUID: '1.2.3.8', completed: '49',
      outcomeMessage: 'Export STUDY[suid:1.2.3.8] from DCM4CHEE to STORESCP - completed:49' },
    { taskID: '152', queue: 'StgVerTasks', type: 'STGVER', status: 'SCHEDULED', createdTime: at(5), updatedTime: at(1),
      LocalAET: 'DCM4CHEE', StudyInstanceUID: '1.2.3.152', batchID: 'stgver-1' },
    { taskID: '151', queue: 'StgVerTasks', type: 'STGVER', status: 'FAILED', createdTime: at(5 * 24 * 60), updatedTime: at(5 * 24 * 60),
      LocalAET: 'DCM4CHEE', StudyInstanceUID: '1.2.3.151', batchID: 'stgver-1',
      outcomeMessage: 'Commit Storage of Study[uid=1.2.3.151] for OBJECT_CHECKSUM: - completed: 2, failed: 1' },
  ]
}

function matches(task: Task, params: URLSearchParams): boolean {
  const created = (task.createdTime ?? '').slice(0, 10).replace(/-/g, '')
  const since = params.get('createdTime')?.replace(/-$/, '')
  return (!params.get('status') || task.status === params.get('status'))
    && (!params.get('batchID') || task.batchID === params.get('batchID'))
    && (!params.get('StudyInstanceUID') || task.StudyInstanceUID === params.get('StudyInstanceUID'))
    && (!since || created >= since)
}

export function taskArchive(tasks: Task[] = sampleTasks()) {
  const store = tasks.map((task) => ({ ...task }))
  const archive = new FakeArchive()
  const queueOf = (request: RecordedRequest) => decodeURIComponent(request.path.split('/')[2])
  const inQueue = (request: RecordedRequest) =>
    store.filter((task) => task.queue === queueOf(request) && matches(task, request.params))

  archive.on('GET', '/aets', [{ dicomAETitle: 'DCM4CHEE' }])
  archive.on('GET', '/queue', QUEUES)
  archive.on('GET', /^\/queue\/[^/]+\/count$/, (request) => ({ count: inQueue(request).length }))
  archive.on('GET', /^\/queue\/[^/]+$/, (request) => {
    const order = request.params.get('orderby') === '-updatedTime' ? -1 : 1
    const limit = Number(request.params.get('limit') ?? 1000)
    return inQueue(request)
      .sort((a, b) => order * (Date.parse(a.updatedTime!) - Date.parse(b.updatedTime!)))
      .slice(0, limit)
  })
  const act = (task: Task, action: string) => {
    if (action === 'cancel') task.status = 'CANCELED'
    if (action === 'reschedule') {
      task.status = 'SCHEDULED'
      task.updatedTime = new Date().toISOString().replace('Z', '+0000')
    }
  }
  archive.on('POST', /^\/queue\/[^/]+\/[^/]+\/(cancel|reschedule)$/, ({ path }) => {
    const [, , queue, id, action] = path.split('/')
    const task = store.find((item) => item.queue === queue && item.taskID === id)
    if (!task) return json({ errorMessage: 'нет задачи' }, { status: 404 })
    act(task, action)
    return undefined
  })
  archive.on('DELETE', /^\/queue\/[^/]+\/[^/]+$/, ({ path }) => {
    const [, , queue, id] = path.split('/')
    const index = store.findIndex((item) => item.queue === queue && item.taskID === id)
    if (index >= 0) store.splice(index, 1)
    return undefined
  })
  archive.on('POST', /^\/queue\/[^/]+\/(cancel|reschedule)$/, (request) => {
    const found = inQueue(request)
    found.forEach((task) => act(task, request.path.split('/')[3]))
    return { count: found.length }
  })
  archive.on('DELETE', /^\/queue\/[^/]+$/, (request) => {
    const found = inQueue(request)
    for (const task of found) store.splice(store.indexOf(task), 1)
    return { count: found.length }
  })
  return Object.assign(archive.install(), { store })
}
