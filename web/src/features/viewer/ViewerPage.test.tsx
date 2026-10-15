import { describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import { DOCUMENTS, IVANOV_CHEST, PETROVA_MR, standardArchive, STUDIES } from '../../test/fixtures'
import type { StudyFixture } from '../../test/fixtures'
import { json } from '../../test/fakeArchive'
import { fakeEngines } from '../../test/fakeEngine'
import { renderApp } from '../../test/renderApp'

const CHEST = IVANOV_CHEST.series![1] // «Chest 1.0mm», 24 среза
const viewUrl = (extra = '') => `/view?study=${IVANOV_CHEST.uid}&series=${CHEST.uid}${extra}`
const view = () => screen.findByRole('region', { name: 'Просмотр' })

async function openViewer(url = viewUrl(), studies: StudyFixture[] = STUDIES) {
  const archive = standardArchive(studies).install()
  const engines = fakeEngines()
  const app = renderApp(url, { engine: engines.factory })
  await waitFor(() => expect(engines.current?.stack).toBeTruthy(), { timeout: 3000 })
  return { archive, engines, ...app }
}

describe('вьюер: что грузится', () => {
  it('стек серии: кадры по адресам WADO-RS, в порядке срезов, с метаданными каждого кадра', async () => {
    // Архив отдаёт снимки вразнобой, а номера не совпадают с геометрией — порядок должен быть по z.
    const shuffled: StudyFixture = {
      ...IVANOV_CHEST,
      series: IVANOV_CHEST.series!.map((s) => s.uid !== CHEST.uid ? s : {
        ...s,
        instances: [
          { sop: 'c', number: 1, z: 30 },
          { sop: 'a', number: 3, z: 10 },
          { sop: 'b', number: 2, z: 20 },
        ],
      }),
    }
    const { engines } = await openViewer(viewUrl(), [shuffled])
    const { imageIds, metadata } = engines.current.stack!
    expect(imageIds.map((id) => id.split('/instances/')[1])).toEqual(['a/frames/1', 'b/frames/1', 'c/frames/1'])
    expect(imageIds[0]).toMatch(new RegExp(`^wadors:http://[^/]+/dcm4chee-arc/aets/DCM4CHEE/rs/studies/${IVANOV_CHEST.uid}/series/${CHEST.uid}/instances/a/frames/1$`))
    expect((metadata[imageIds[0]] as Record<string, { Value: string[] }>)['00080018'].Value[0]).toBe('a')
  })

  it('метаданные всей серии — одним запросом', async () => {
    const { archive } = await openViewer()
    expect(archive.calls('GET', /\/series\/[^/]+\/metadata$/).map((r) => r.path))
      .toEqual([`/aets/DCM4CHEE/rs/studies/${IVANOV_CHEST.uid}/series/${CHEST.uid}/metadata`])
  })

  it('сжатые снимки просит в родном формате, несжатые — как есть', async () => {
    const mixed: StudyFixture = {
      ...IVANOV_CHEST,
      series: IVANOV_CHEST.series!.map((s) => s.uid !== CHEST.uid ? s : {
        ...s,
        instances: [
          { sop: 'j2k', number: 1, transferSyntax: '1.2.840.10008.1.2.4.90' },
          { sop: 'raw', number: 2 },
        ],
      }),
    }
    const { engines } = await openViewer(viewUrl(), [mixed])
    const { imageIds, accept } = engines.current.stack!
    expect(accept![imageIds[0]]).toMatch(/^multipart\/related; type="image\/jp2"; transfer-syntax=1\.2\.840\.10008\.1\.2\.4\.90, /)
    expect(accept![imageIds[1]]).toBe('multipart/related; type=application/octet-stream; transfer-syntax=*')
  })

  it('многокадровый снимок разворачивается в кадры', async () => {
    const cine: StudyFixture = {
      ...IVANOV_CHEST,
      series: IVANOV_CHEST.series!.map((s) => s.uid !== CHEST.uid ? s : { ...s, instances: [{ sop: 'cine', number: 1, frames: 3 }] }),
    }
    const { engines } = await openViewer(viewUrl(), [cine])
    expect(engines.current.stack!.imageIds.map((id) => id.split('/').slice(-1)[0])).toEqual(['1', '2', '3'])
  })

  it('без серии в ссылке открывает первую серию со снимками', async () => {
    const { engines, search } = await openViewer(`/view?study=${IVANOV_CHEST.uid}`)
    expect(engines.current.stack!.imageIds).toHaveLength(1) // #1 Topogram
    expect(search().series).toBeUndefined()
    expect(within(await view()).getByText('Серия 1 Topogram')).toBeInTheDocument()
  })

  it('срез из ссылки — стартовый (с единицы)', async () => {
    const { engines } = await openViewer(viewUrl('&slice=5'))
    expect(engines.current.stack!.initialIndex).toBe(4)
  })
})

describe('вьюер: что видно', () => {
  it('угловые подписи: пациент, исследование, серия, срез, окно', async () => {
    await openViewer()
    const area = await view()
    for (const text of ['Иванов Иван Иванович', 'ID P-1001', '12.03.1964, М', 'КТ органов грудной клетки',
      '12.09.2026 08:47', 'Серия 2 Chest 1.0mm', 'Срез 1 из 24']) {
      expect(within(area).getByText(text)).toBeInTheDocument()
    }
    expect(within(area).getByText(/Окно 400\s+Уровень 40/)).toBeInTheDocument()
  })

  it('лента серий: все серии, текущая отмечена', async () => {
    await openViewer()
    const strip = screen.getByRole('navigation', { name: 'Серии' })
    const buttons = within(strip).getAllByRole('button')
    expect(buttons).toHaveLength(3)
    expect(buttons[1]).toHaveAttribute('aria-current', 'true')
    expect(buttons[1]).toHaveTextContent('Chest 1.0mm')
  })

  it('для КТ есть пресеты окна, текущий подсвечен', async () => {
    await openViewer()
    const presets = screen.getByRole('group', { name: 'Окна КТ' })
    expect(within(presets).getAllByRole('button').map((b) => b.textContent))
      .toEqual(['Мягкие ткани', 'Лёгкие', 'Кости', 'Мозг', 'Печень'])
    expect(within(presets).getByRole('button', { name: 'Мягкие ткани' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('для МР пресетов нет — шкала не абсолютная', async () => {
    await openViewer(`/view?study=${PETROVA_MR.uid}`)
    expect(screen.queryByRole('group', { name: 'Окна КТ' })).not.toBeInTheDocument()
  })
})

describe('вьюер: управление', () => {
  it('инструменты кнопками и клавишами', async () => {
    const { engines, user } = await openViewer()
    expect(engines.current.callsOf('setTool')).toEqual([])

    await user.click(screen.getByRole('button', { name: 'Сдвиг' }))
    await user.keyboard('l')
    await user.keyboard('a')
    await user.keyboard('z')
    await user.keyboard('w')
    expect(engines.current.callsOf('setTool').flat()).toEqual(['pan', 'length', 'angle', 'zoom', 'windowLevel'])
    expect(screen.getByRole('button', { name: 'Окно' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('пресеты кнопкой и цифрой', async () => {
    const { engines, user } = await openViewer()
    await user.click(screen.getByRole('button', { name: 'Кости' }))
    await user.keyboard('2')
    expect(engines.current.callsOf('setVOI')).toEqual([[2000, 300], [1500, -600]])
    expect(within(await view()).getByText(/Окно 1500\s+Уровень -600/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Лёгкие' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('инверсия и сброс', async () => {
    const { engines, user } = await openViewer()
    await user.keyboard('i')
    expect(engines.current.callsOf('setInvert')).toEqual([[true]])
    expect(within(await view()).getByText(/инверсия/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Инверсия' })).toHaveAttribute('aria-pressed', 'true')

    await user.click(screen.getByRole('button', { name: 'Сброс' }))
    expect(engines.current.callsOf('reset')).toHaveLength(1)
    expect(within(await view()).queryByText(/инверсия/)).not.toBeInTheDocument()
  })

  it('листание: стрелки, PageDown, End, Home и ползунок', async () => {
    const { engines, user } = await openViewer()
    await user.keyboard('{ArrowDown}{ArrowDown}')
    await user.keyboard('{PageDown}')
    expect(within(await view()).getByText('Срез 13 из 24')).toBeInTheDocument()
    await user.keyboard('{End}')
    expect(within(await view()).getByText('Срез 24 из 24')).toBeInTheDocument()
    await user.keyboard('{Home}')
    expect(engines.current.callsOf('scrollTo').flat()).toEqual([1, 2, 12, 23, 0])

    const slider = screen.getByRole('slider', { name: 'Срез' })
    expect(slider).toHaveAttribute('max', '24')
  })

  it('срез запоминается в адресе (без засорения истории)', async () => {
    const { user, search } = await openViewer()
    await user.keyboard('{End}')
    await waitFor(() => expect(search().slice).toBe(24), { timeout: 2000 })
  })

  it('смена серии: прежний движок разобран, новый получил новую серию', async () => {
    const { engines, user, search } = await openViewer()
    const first = engines.current
    await user.click(within(screen.getByRole('navigation', { name: 'Серии' })).getByRole('button', { name: /Chest 5\.0mm/ }))
    await waitFor(() => expect(engines.engines).toHaveLength(2))
    await waitFor(() => expect(engines.current.stack).toBeTruthy())
    expect(first.destroyed).toBe(true)
    expect(engines.current.stack!.imageIds[0]).toContain(IVANOV_CHEST.series![2].uid)
    expect(search()).toMatchObject({ series: IVANOV_CHEST.series![2].uid })
    expect(search().slice).toBeUndefined()
  })
})

describe('вьюер: запасной путь и не-картинки', () => {
  it('если движок не справился — рендер архива с причиной, листание работает', async () => {
    const { engines, user } = await openViewer()
    engines.current.fail('Unsupported transfer syntax 1.2.840.10008.1.2.4.100')

    expect(await screen.findByText(/Браузер не смог раскодировать эти снимки/)).toBeInTheDocument()
    expect(screen.getByText(/Причина: Unsupported transfer syntax/)).toBeInTheDocument()
    const image = screen.getByRole('img', { name: 'Срез 1' })
    expect(image).toHaveAttribute('src', `/dcm4chee-arc/aets/DCM4CHEE/rs/studies/${IVANOV_CHEST.uid}/series/${CHEST.uid}/instances/${CHEST.uid}.1/rendered`)

    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('img', { name: 'Срез 2' })).toHaveAttribute('src', expect.stringContaining(`${CHEST.uid}.2/rendered`))
  })

  it('PDF показывается документом, движок не создаётся', async () => {
    standardArchive([DOCUMENTS]).install()
    const engines = fakeEngines()
    renderApp(`/view?study=${DOCUMENTS.uid}&series=1.2.3.900.2`, { engine: engines.factory })
    const frame = await screen.findByTitle('Документ PDF')
    expect(frame).toHaveAttribute('src', '/dcm4chee-arc/aets/DCM4CHEE/rs/studies/1.2.3.900/series/1.2.3.900.2/instances/1.2.3.900.2.1/rendered')
    expect(engines.engines).toHaveLength(0)
  })

  it('SR показывается как метаданные с поиском', async () => {
    standardArchive([DOCUMENTS]).install()
    renderApp(`/view?study=${DOCUMENTS.uid}&series=1.2.3.900.3`)
    expect(await screen.findByText(/Структурированный отчёт/)).toBeInTheDocument()
    expect(screen.getByLabelText('Поиск по метаданным')).toBeInTheDocument()
  })

  it('по умолчанию открывается серия со снимками, а не документ', async () => {
    standardArchive([{ ...DOCUMENTS, series: [...DOCUMENTS.series!].reverse() }]).install()
    const engines = fakeEngines()
    renderApp(`/view?study=${DOCUMENTS.uid}`, { engine: engines.factory })
    await waitFor(() => expect(engines.current?.stack).toBeTruthy())
    expect(engines.current.stack!.imageIds[0]).toContain('1.2.3.900.1')
  })

  it('ошибка загрузки метаданных показывается', async () => {
    standardArchive().on('GET', /\/series\/[^/]+\/metadata$/, json('boom', { status: 500 })).install()
    renderApp(viewUrl())
    expect(await screen.findByText('Запрос к архиву не прошёл')).toBeInTheDocument()
  })

  it('без исследования в ссылке — подсказка, как открыть', async () => {
    standardArchive().install()
    renderApp('/view')
    expect(await screen.findByText('Не указано исследование')).toBeInTheDocument()
  })
})

describe('вьюер: входы и выход', () => {
  it('V в списке открывает выбранное исследование', async () => {
    standardArchive().install()
    const { user, router } = renderApp('/studies')
    await screen.findByText('Иванов Иван Иванович')
    await user.keyboard('j')
    await user.keyboard('v')
    await waitFor(() => expect(router.state.location.pathname).toBe('/view'))
    expect(router.state.location.search).toMatchObject({ study: '1.2.3.200' })
  })

  it('V при открытой панели берёт выбранную в ней серию', async () => {
    standardArchive().install()
    const { user, router } = renderApp(`/studies?study=${IVANOV_CHEST.uid}&series=${CHEST.uid}`)
    await screen.findByRole('complementary', { name: 'Исследование' })
    await waitFor(() => expect(screen.getAllByRole('row').find((r) => r.getAttribute('aria-selected') === 'true')).toBeTruthy())
    await user.keyboard('v')
    await waitFor(() => expect(router.state.location.search).toMatchObject({ study: IVANOV_CHEST.uid, series: CHEST.uid }))
  })

  it('из панели: «Смотреть снимки» и «Смотреть» у серии — ссылки во вьюер', async () => {
    standardArchive().install()
    renderApp(`/studies?study=${IVANOV_CHEST.uid}&series=${CHEST.uid}`)
    const aside = await screen.findByRole('complementary', { name: 'Исследование' })
    expect(within(aside).getByRole('link', { name: 'Смотреть снимки' }))
      .toHaveAttribute('href', `/view?study=${IVANOV_CHEST.uid}&series=${CHEST.uid}`)
    expect(await within(aside).findByRole('link', { name: 'Смотреть серию 3 Chest 5.0mm' }))
      .toHaveAttribute('href', `/view?study=${IVANOV_CHEST.uid}&series=${IVANOV_CHEST.series![2].uid}`)
  })

  it('«К списку» возвращает туда, откуда пришли, с фильтрами', async () => {
    standardArchive().install()
    const engines = fakeEngines()
    const { user, router } = renderApp('/studies?q=Иванов', { engine: engines.factory })
    await screen.findByText('Иванов Иван Иванович')
    await user.keyboard('v')
    await waitFor(() => expect(engines.current?.stack).toBeTruthy())

    await user.click(screen.getByRole('button', { name: /К списку/ }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/studies'))
    expect(router.state.location.search).toMatchObject({ q: 'Иванов' })
    expect(engines.current.destroyed).toBe(true)
  })

  it('если вьюер открыт по ссылке — Esc ведёт к исследованию в списке', async () => {
    const { user, router } = await openViewer()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(router.state.location.pathname).toBe('/studies'))
    expect(router.state.location.search).toMatchObject({ study: IVANOV_CHEST.uid, series: CHEST.uid })
  })
})
