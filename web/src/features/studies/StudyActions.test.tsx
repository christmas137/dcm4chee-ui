import { describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import { json } from '../../test/fakeArchive'
import { IVANOV_CHEST, standardArchive, studyJson } from '../../test/fixtures'
import { renderApp } from '../../test/renderApp'

const UID = IVANOV_CHEST.uid
const STUDY = `/aets/DCM4CHEE/rs/studies/${UID}`

const NOTES = [
  { label: 'Quality', type: 'REJECTED_FOR_QUALITY_REASONS', codeValue: '113001', codingSchemeDesignator: 'DCM' },
  { label: 'Patient Safety', type: 'REJECTED_FOR_PATIENT_SAFETY_REASONS', codeValue: '113037', codingSchemeDesignator: 'DCM' },
  { label: 'Своя причина', codeValue: 'X1', codingSchemeDesignator: '99LOCAL' },
]

/** Архив с исследованиями и всем, что нужно для правки, отклонения и удаления. */
function actionsArchive() {
  const archive = standardArchive()
  archive.on('GET', '/reject', NOTES)
  archive.on('POST', /\/reject\/[^/]+$/, () => ({ count: 49 }))
  archive.on('DELETE', STUDY, undefined)
  archive.on('PUT', STUDY, ({ body }) => json(body))
  archive.on('PUT', /^\/aets\/DCM4CHEE\/rs\/patients\/[^/]+$/, undefined)
  archive.on('PUT', /\/expire\/[^/]+$/, undefined)
  // Для правки нужны все атрибуты: у фикстуры добавим срок хранения, его состояние и издателя ID.
  archive.on('GET', '/aets/DCM4CHEE/rs/studies', ({ params }) => {
    if (params.get('includefield') !== 'all') return [studyJson(IVANOV_CHEST)]
    return [{
      ...studyJson(IVANOV_CHEST),
      '00080005': { vr: 'CS', Value: ['ISO_IR 192'] },
      '00100021': { vr: 'LO', Value: ['HOSP'] },
      '00201200': { vr: 'IS', Value: ['3'] },
      '77771023': { vr: 'DA' },
      '7777102B': { vr: 'CS', Value: ['UPDATEABLE'] },
    }]
  })
  return archive.install()
}

async function openPanel() {
  const panel = await screen.findByRole('complementary', { name: 'Исследование' })
  await within(panel).findByRole('heading', { name: 'Иванов Иван Иванович' })
  return within(panel)
}

describe('правка исследования', () => {
  it('описание и срок хранения: PUT исследования со всеми атрибутами и PUT срока с разморозкой', async () => {
    const archive = actionsArchive()
    const { user } = renderApp(`/studies?study=${UID}`)
    await user.click((await openPanel()).getByRole('button', { name: 'Изменить' }))
    const dialog = within(await screen.findByRole('dialog', { name: 'Изменить данные исследования' }))

    const description = await dialog.findByRole('textbox', { name: 'Описание' })
    await user.clear(description)
    await user.type(description, 'КТ после правки')
    // «По правилам архива» предлагается, раз срок сейчас не задан.
    expect(dialog.getByRole('radio', { name: /По правилам архива/ })).toBeChecked()
    // У поля даты в jsdom нет роли textbox — берём по подписи и типу.
    await user.type(dialog.getByLabelText('Хранить до', { selector: 'input[type=date]' }), '2031-12-31')
    expect(dialog.getByRole('radio', { name: 'До даты' })).toBeChecked()
    expect(dialog.getByText('Изменится: исследование, срок хранения')).toBeInTheDocument()
    await user.click(dialog.getByRole('button', { name: 'Сохранить' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    const writes = archive.requests.filter((request) => request.method === 'PUT')
    expect(writes.map((request) => request.path)).toEqual([STUDY, `${STUDY}/expire/20311231`])
    expect(writes[1].params.get('FreezeExpirationDate')).toBe('false')
    const body = writes[0].body as Record<string, { Value?: unknown[] }>
    expect(body['00081030'].Value).toEqual(['КТ после правки'])
    expect(body['00100020'].Value).toEqual(['P-1001'])
    expect(body['00080005'].Value).toEqual(['ISO_IR 192'])
    expect(body).not.toHaveProperty('77771023')
    expect(writes[0].headers.get('Accept')).toBe('application/dicom+json, application/json')
  })

  it('пациент: PUT по ID с издателем, только группа 0010 и UTF-8; предупреждение про другие исследования', async () => {
    const archive = actionsArchive()
    const { user } = renderApp(`/studies?study=${UID}`)
    await user.click((await openPanel()).getByRole('button', { name: 'Изменить' }))
    const dialog = within(await screen.findByRole('dialog', { name: 'Изменить данные исследования' }))
    await user.clear(await dialog.findByRole('textbox', { name: 'Отчество' }))
    expect(dialog.getByText(/изменятся и в 2 других исследованиях/)).toBeInTheDocument()
    await user.click(dialog.getByRole('radio', { name: /Бессрочно/ }))
    await user.click(dialog.getByRole('button', { name: 'Сохранить' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    const writes = archive.requests.filter((request) => request.method === 'PUT')
    expect(writes.map((request) => request.path)).toEqual([
      '/aets/DCM4CHEE/rs/patients/P-1001%5E%5E%5EHOSP',
      `${STUDY}/expire/never`,
    ])
    expect(writes[0].body).toEqual({
      '00080005': { vr: 'CS', Value: ['ISO_IR 192'] },
      '00100010': { vr: 'PN', Value: [{ Alphabetic: 'Иванов^Иван' }] },
      '00100020': { vr: 'LO', Value: ['P-1001'] },
      '00100021': { vr: 'LO', Value: ['HOSP'] },
      '00100030': { vr: 'DA', Value: ['19640312'] },
      '00100040': { vr: 'CS', Value: ['M'] },
    })
  })

  it('правка и пациента, и исследования: сначала исследование, потом пациент — иначе старое имя откатит новое', async () => {
    const archive = actionsArchive()
    const { user } = renderApp(`/studies?study=${UID}`)
    await user.click((await openPanel()).getByRole('button', { name: 'Изменить' }))
    const dialog = within(await screen.findByRole('dialog', { name: 'Изменить данные исследования' }))
    await user.type(await dialog.findByRole('textbox', { name: 'Имя' }), 'а')
    await user.type(dialog.getByRole('textbox', { name: 'Описание' }), '!')
    await user.click(dialog.getByRole('button', { name: 'Сохранить' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(archive.requests.filter((request) => request.method === 'PUT').map((request) => request.path))
      .toEqual([STUDY, '/aets/DCM4CHEE/rs/patients/P-1001%5E%5E%5EHOSP'])
  })

  it('без правок сохранить нечего; ошибка архива видна, окно не закрывается', async () => {
    const archive = actionsArchive()
    archive.on('PUT', STUDY, () => json({ errorMessage: 'нет прав' }, { status: 403 }))
    const { user } = renderApp(`/studies?study=${UID}`)
    await user.click((await openPanel()).getByRole('button', { name: 'Изменить' }))
    const dialog = within(await screen.findByRole('dialog', { name: 'Изменить данные исследования' }))
    expect(await dialog.findByText('Изменений нет')).toBeInTheDocument()
    expect(dialog.getByRole('button', { name: 'Сохранить' })).toBeDisabled()
    await user.type(dialog.getByRole('textbox', { name: '№ назначения' }), '-2')
    await user.click(dialog.getByRole('button', { name: 'Сохранить' }))
    expect(await dialog.findByRole('alert')).toHaveTextContent(/Не удалось сохранить: HTTP 403/)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})

describe('клавиши списка за открытым диалогом', () => {
  it('V не уводит во вьюер, пока открыт диалог', async () => {
    actionsArchive()
    const { user, router } = renderApp(`/studies?study=${UID}`)
    await user.click((await openPanel()).getByRole('button', { name: 'Изменить' }))
    await screen.findByRole('dialog', { name: 'Изменить данные исследования' })
    await user.keyboard('v')
    expect(router.state.location.pathname).toBe('/studies')
  })
})

describe('отклонение и удаление', () => {
  it('причины — из архива, по-русски; без причины отклонить нельзя; POST reject/код^схема', async () => {
    const archive = actionsArchive()
    const { user } = renderApp(`/studies?study=${UID}`)
    await user.click((await openPanel()).getByRole('button', { name: 'Отклонить или удалить' }))
    const dialog = within(await screen.findByRole('dialog', { name: /^Отклонить: Иванов/ }))
    expect(await dialog.findByRole('radio', { name: 'Брак: плохое качество снимков' })).toBeInTheDocument()
    expect(dialog.getByRole('radio', { name: 'Своя причина' })).toBeInTheDocument()
    expect(dialog.getByRole('button', { name: 'Отклонить 49 снимков' })).toBeDisabled()

    await user.click(dialog.getByRole('radio', { name: 'Брак: плохое качество снимков' }))
    await user.click(dialog.getByRole('button', { name: 'Отклонить 49 снимков' }))
    expect(await dialog.findByText(/Отклонено: 49 снимков/)).toBeInTheDocument()
    expect(archive.calls('POST', /\/reject\//).map((request) => request.path)).toEqual([`${STUDY}/reject/113001%5EDCM`])
    expect(archive.calls('DELETE', STUDY)).toHaveLength(0)
  })

  it('отклонение одной серии — путь серии, удаления нет', async () => {
    const archive = actionsArchive()
    const { user } = renderApp(`/studies?study=${UID}`)
    await user.click((await openPanel()).getByRole('button', { name: 'Отклонить или удалить' }))
    const dialog = within(await screen.findByRole('dialog', { name: /^Отклонить/ }))
    const series = IVANOV_CHEST.series![0]
    await user.selectOptions(dialog.getByRole('combobox', { name: 'Что отклонить' }), series.uid)
    expect(dialog.queryByRole('checkbox', { name: 'Удалить из архива безвозвратно' })).toBeNull()
    await user.click(await dialog.findByRole('radio', { name: /Угроза безопасности/ }))
    await user.click(dialog.getByRole('button', { name: /^Отклонить \d/ }))
    await dialog.findByText(/Отклонено/)
    expect(archive.calls('POST', /\/reject\//)[0].path).toBe(`${STUDY}/series/${series.uid}/reject/113037%5EDCM`)
  })

  it('удаление — только с подтверждением; отклонение, затем DELETE; панель закрывается', async () => {
    const archive = actionsArchive()
    const { user, search } = renderApp(`/studies?study=${UID}`)
    await user.click((await openPanel()).getByRole('button', { name: 'Отклонить или удалить' }))
    const dialog = within(await screen.findByRole('dialog', { name: /^Отклонить/ }))
    await user.click(await dialog.findByRole('radio', { name: 'Брак: плохое качество снимков' }))
    await user.click(dialog.getByRole('checkbox', { name: 'Удалить из архива безвозвратно' }))
    const go = screen.getByRole('button', { name: 'Отклонить и удалить навсегда' })
    expect(go).toBeDisabled()
    await user.click(dialog.getByRole('checkbox', { name: /Понимаю: 49 снимков исчезнут навсегда/ }))
    await user.click(go)

    await waitFor(() => expect(search().study).toBeUndefined())
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(archive.requests.filter((request) => request.method !== 'GET').map((request) => `${request.method} ${request.path}`))
      .toEqual([`POST ${STUDY}/reject/113001%5EDCM`, `DELETE ${STUDY}`])
  })

  it('архив запретил удаление — честно: отклонено, но не удалено', async () => {
    const archive = actionsArchive()
    archive.on('DELETE', STUDY, () => json({ errorMessage: 'Deletion of Study with Rejection State: NONE not permitted' }, { status: 403 }))
    const { user, search } = renderApp(`/studies?study=${UID}`)
    await user.click((await openPanel()).getByRole('button', { name: 'Отклонить или удалить' }))
    const dialog = within(await screen.findByRole('dialog', { name: /^Отклонить/ }))
    await user.click(await dialog.findByRole('radio', { name: 'Брак: плохое качество снимков' }))
    await user.click(dialog.getByRole('checkbox', { name: 'Удалить из архива безвозвратно' }))
    await user.click(dialog.getByRole('checkbox', { name: /Понимаю/ }))
    await user.click(screen.getByRole('button', { name: 'Отклонить и удалить навсегда' }))
    expect(await screen.findByRole('alert'))
      .toHaveTextContent('Отклонено (49 снимков), но удалить не удалось: настройки архива запрещают удаление')
    expect(search().study).toBe(UID)
  })
})
