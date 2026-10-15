import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { standardArchive } from './fixtures'
import { renderApp } from './renderApp'

describe('тестовая обвязка', () => {
  it('поднимает приложение и тянет AET из фейкового архива', async () => {
    const archive = standardArchive().install()
    renderApp('/studies')
    expect(await screen.findByRole('option', { name: 'AS_RECEIVED' })).toBeInTheDocument()
    expect(await screen.findByText('Иванов Иван Иванович')).toBeInTheDocument()
    expect(archive.calls('GET', '/aets')).toHaveLength(1)
    expect(archive.unmatched).toEqual([])
  })
})
