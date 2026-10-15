import { ModalityTag } from '../../components/Modality'
import type { QidoParams } from '../../api/omnibox'
import { describeParams } from './describeQuery'

/**
 * Строка интерпретации: как архив понял запрос. Показывает то, что реально ушло в QIDO, —
 * включая фильтры из переключателей, — и заодно учит языку поиска.
 */
export function QueryTokens({ params, hint }: { params?: QidoParams; hint?: string }) {
  const tokens = params ? describeParams(params) : []

  if (!tokens.length) {
    return (
      <p className="truncate text-[12px] text-muted">
        Все исследования. Пишите, что помните: фамилию, дату, модальность или номер — <span className="text-fg">Иванов CT 7д</span>,{' '}
        <span className="text-fg">acc:12345</span>
      </p>
    )
  }

  return (
    <ul aria-label="Как понят запрос" className="flex min-w-0 flex-wrap items-baseline gap-x-5 gap-y-1">
      {tokens.map((token) => (
        <li key={token.key} className="flex items-baseline gap-1.5 text-[12px]">
          <span className="text-muted">{token.label}</span>
          {token.modalities ? (
            <span className="flex gap-2">{token.modalities.map((m) => <ModalityTag key={m} modality={m} />)}</span>
          ) : (
            <span className={`font-medium ${token.key === 'StudyInstanceUID' ? 'max-w-48 truncate font-mono' : ''}`}>
              {token.value}
            </span>
          )}
        </li>
      ))}
      {hint && <li className="text-[12px] text-warn">найдено {hint}</li>}
    </ul>
  )
}
