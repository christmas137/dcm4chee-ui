import { useQuery } from '@tanstack/react-query'
import { getJson } from '../../api/client'
import { useArchive } from '../../app/ArchiveContext'
import { ErrorBox, Spinner } from '../../components/ui'

/** Временный экран фазы 1: подтверждает, что фронт реально ходит в архив. */
export function StudiesPage() {
  const { aet } = useArchive()
  const counts = useQuery({
    queryKey: ['studies-count', aet],
    queryFn: async () => {
      const [count, size] = await Promise.all([
        getJson<{ count: number }>(`/aets/${aet}/rs/studies/count`),
        getJson<{ size: number }>(`/aets/${aet}/rs/studies/size`),
      ])
      return { count: count.count, size: size.size }
    },
  })

  if (counts.error) return <ErrorBox error={counts.error as Error} retry={() => void counts.refetch()} />

  return (
    <div className="p-4">
      <div className="max-w-md rounded-md border border-line bg-panel p-4">
        <h1 className="text-sm font-medium">Связь с архивом установлена</h1>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[12px]">
          <dt className="text-muted">AET</dt>
          <dd className="font-mono">{aet}</dd>
          <dt className="text-muted">Исследований</dt>
          <dd>{counts.isLoading ? <Spinner /> : counts.data?.count}</dd>
          <dt className="text-muted">Объём</dt>
          <dd>{counts.isLoading ? <Spinner /> : `${((counts.data?.size ?? 0) / 1024 ** 2).toFixed(1)} МБ`}</dd>
        </dl>
        <p className="mt-3 text-[11px] text-muted">
          Поиск и список исследований — фаза 2.
        </p>
      </div>
    </div>
  )
}
