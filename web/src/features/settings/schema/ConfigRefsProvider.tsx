import { useMemo } from 'react'
import type { ReactNode } from 'react'
import { useAets } from '../../../api/config'
import { useAeList, useDevice, useDevices } from '../../../api/devices'
import { buildInherited, buildSuggestions, ConfigRefsContext, InheritedContext } from './refs'

/**
 * Живая конфигурация для форм: подсказки полей-ссылок (AE всех узлов, AE архива, устройства,
 * хранилища, очереди, экспортёры…) и значения уровня устройства, которые наследуют AE.
 * `archiveDraft` — несохранённая версия архива: только что добавленное хранилище
 * должно сразу появиться в подсказках.
 */
export function ConfigRefsProvider({ archiveDraft, children }: { archiveDraft?: unknown; children: ReactNode }) {
  const devices = useDevices()
  const aes = useAeList()
  const aets = useAets()
  const archiveName = devices.data?.find((item) => item.hasArcDevExt)?.dicomDeviceName
  const archive = useDevice(archiveDraft ? undefined : archiveName)
  const source = archiveDraft ?? archive.data
  const suggestions = useMemo(
    () => buildSuggestions({ archive: source, aes: aes.data, archiveAets: aets.data, devices: devices.data }),
    [source, aes.data, aets.data, devices.data],
  )
  const inherited = useMemo(() => buildInherited(source), [source])
  return (
    <ConfigRefsContext value={suggestions}>
      <InheritedContext value={inherited}>{children}</InheritedContext>
    </ConfigRefsContext>
  )
}
