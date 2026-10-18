/**
 * Темы для параметров архива. В штатном UI три с лишним сотни параметров `dcmArchiveDevice`
 * идут одной простынёй в порядке LDAP-схемы. Здесь они разложены по задачам: «что делать
 * с повторно присланным снимком» ищется в «Приёме», а не между настройками аудита и HL7.
 *
 * Правила — по имени ключа, первое совпадение выигрывает. Те же правила работают
 * для переопределений на уровне AE (`dcmArchiveNetworkAE`) — имена ключей там те же.
 */

export interface Theme {
  id: string
  label: string
  hint: string
}

export const THEMES: Theme[] = [
  { id: 'store', label: 'Приём объектов', hint: 'C-STORE и STOW: перезапись, проверки, кодировка, разрешения' },
  { id: 'patient', label: 'Пациенты', hint: 'Идентификация пациентов, конфликты ID, проверка демографии, FHIR' },
  { id: 'query', label: 'Поиск', hint: 'C-FIND и QIDO: лимиты, кэши, сортировка, внешние C-FIND SCP' },
  { id: 'retrieve', label: 'Выдача', hint: 'C-MOVE, C-GET, WADO: запасные узлы, внешние архивы, миниатюры' },
  { id: 'metadata', label: 'Метаданные и размеры', hint: 'Метаданные серий, подсчёт размеров, сжатие записей о снимках' },
  { id: 'deletion', label: 'Удаление и сроки', hint: 'Удаление исследований, очистка хранилищ, истечение сроков' },
  { id: 'verification', label: 'Проверка хранения', hint: 'Периодическая проверка целостности объектов на хранилищах' },
  { id: 'compression', label: 'Сжатие', hint: 'Отложенное сжатие принятых снимков' },
  { id: 'notify', label: 'Уведомления', hint: 'IAN, проброс MPPS, Storage Commitment' },
  { id: 'worklist', label: 'Рабочие списки', hint: 'MWL и UPS: импорт, генераторы номеров, очистка' },
  { id: 'hl7', label: 'HL7', hint: 'Приём и отправка HL7: шаблоны, обновления статуса процедур, журналы' },
  { id: 'audit', label: 'Аудит и журналы', hint: 'Записи аудита, что писать в системный журнал' },
  { id: 'tasks', label: 'Задачи и планировщик', hint: 'Опрос очередей задач, размеры выборок, планировщик' },
  { id: 'security', label: 'Доступ', hint: 'Проверка вызывающих узлов, аутентификация пользователей в ассоциации' },
  { id: 'general', label: 'Общее', hint: 'Всё остальное' },
]

const RULES: [string, RegExp][] = [
  ['verification', /^dcm(StorageVerification|UpdateLocationStatusOnRetrieve|QStar)/],
  ['compression', /^dcmCompression/],
  ['audit', /^dcm(Audit|ShowPatientInfoIn)/],
  ['hl7', /^hl7/],
  ['worklist', /^dcm(MWL|DeleteMWL|DeleteUPS|UPS|HideSPSWithStatus|LinkMWLEntry)/],
  ['notify', /^dcm(Ian|FwdMpps|PurgeStgCmt)/],
  ['metadata', /^dcm(SeriesMetadata|UpdateSeriesMetadata|CalculateStudySize|PurgeInstanceRecords|MetadataStorageID)/],
  ['deletion', /^dcm(DeleteStudy|DeletePatient|DeleteRejected|PreserveStudy|PurgeStorage|FailedToDelete|RejectExpired|Allow(Rejection|Delete)|MaxAccessTimeStaleness|RejectionNoteStorageAET|KeyValueRetention)/],
  ['patient', /^(fhir|dcm(AcceptMissingPatientID|AcceptConflictingPatientID|IdentifyPatient|FuzzyAlgorithm|PersonNameComponent|PatientVerification|Trusted|FilterByIssuer|SupplementIssuer|RejectConflictingPatient))/],
  ['security', /^dcm(UserIdentityNegotiation|ValidateCallingAEHostname|AcceptedUserRole|AcceptedCallingAETitle|AllowedAccessControlID|AccessControlID|GrantAccess)/],
  ['query', /^dcm(Query|Qido|CalculateQueryAttributes|SpanningCFindSCP|LeadingCFindSCP|RelationalQuery|EncodeAsJSONNumber|InExpressionCountLimit|MatchSOPClassOnInstanceLevel|QueryRetrieveView|HideNotRejectedInstances)/],
  ['retrieve', /^dcm(Wado|SendPending|Fallback|External|AltCMoveSCP|CStoreSCUOfCMoveSCP|RetrieveAET|ReturnRetrieveAET|MultipleStoreAssociations|RelationalRetrieve|RestrictRetrieve|RemapRetrieveURL|ProxyUpstreamURL|XDSi|RetrieveTaskWarning|BulkDataDescriptorID|ChangeRequesterAET)/],
  ['store', /^dcm(Store|Stow|Overwrite|RelationalMismatch|RecordAttributeModification|BulkDataSpool|ValidateUID|DefaultCharacterSet|CharsetNameMapping|MergeMWL|UnzipVendorData|ObjectStorage|AcceptedMoveDestination|PreferredTransferSyntax|CopyMoveUpdatePolicy)/],
  ['tasks', /^dcm(Task|QueueTasks|PurgeQueueMessage|DiffTask|SchedulerMinStartDelay|ChangeAccessControlID|UpdateCharset|CSVUpload)/],
]

export function themeOf(key: string): string {
  return RULES.find(([, pattern]) => pattern.test(key))?.[0] ?? 'general'
}

export function themeLabel(id: string): string {
  return THEMES.find((theme) => theme.id === id)?.label ?? id
}
