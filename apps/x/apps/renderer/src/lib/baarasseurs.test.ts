import { describe, expect, it } from 'vitest'
import { TEMPLATES, TOOLS, describeSystem, idFor, parseDescribed } from './baarasseurs'

describe('the baarasseurs, app side (06/10/2026)', () => {
  it('makes a readable, unique id from the name', () => {
    expect(idFor('Aminata', [])).toBe('aminata')
    expect(idFor('Aminata', ['aminata', 'aminata-2'])).toBe('aminata-3')
    expect(idFor('  Kouadio Désiré ', [])).toBe('kouadio-desire')
    expect(idFor('★', [])).toBe('baarasseur')
  })

  it('reads the form the model filled, keeping only known tools and sane hours', () => {
    const filled = parseDescribed('Voici : {"name":"Moussa","role":"Logistique","mission":"Planifie.","tools":["WhatsApp","Fax"],"schedule":{"every":"day","hour":31}}')
    expect(filled).toEqual({ name: 'Moussa', role: 'Logistique', mission: 'Planifie.', tools: ['WhatsApp'], schedule: { every: 'day', hour: 23 } })
    expect(parseDescribed('{"schedule":null}')).toEqual({ schedule: null })
    expect(parseDescribed('no json here')).toBeNull()
  })

  it('asks for the form in the app language, with the tools it can give', () => {
    expect(describeSystem('fr')).toContain('French, with « tu »')
    expect(describeSystem('en')).toContain(JSON.stringify(TOOLS))
    expect(describeSystem('en')).not.toContain('$TOOLS')
  })

  it('offers the site carousel as templates, each with both languages and known tools', () => {
    expect(TEMPLATES.map((t) => t.name)).toEqual(['Mariama', 'Ibrahim', 'Adjoua', 'Aminata', 'Fatou', 'Moussa', 'Zara', 'Kofi'])
    for (const t of TEMPLATES) {
      expect(t.role.fr && t.role.en && t.mission.fr && t.mission.en).toBeTruthy()
      expect(t.tools.every((x) => (TOOLS as readonly string[]).includes(x))).toBe(true)
    }
  })
})

describe('the shared save, desktop and phone alike (06/10/2026)', () => {
  it('keeps a rule learned meanwhile, drops a forgotten one, and resets its hours', async () => {
    const { saveTeam, upsertChange } = await import('@x/shared/dist/baarasseur.js')
    const stored = { id: 'mariama', name: 'Mariama', role: '', mission: '', color: 'clay', tools: [], memory: ['old rule', 'learned meanwhile'], createdAt: 'x', schedule: null }
    const calls: Array<[string, unknown]> = []
    let file = JSON.stringify({ baarasseurs: [stored] })
    const invoke = async (channel: string, args: unknown) => {
      calls.push([channel, args])
      if (channel === 'workspace:readFile') return { data: file }
      if (channel === 'workspace:writeFile') file = (args as { data: string }).data
      return { success: true }
    }
    const edited = { ...stored, mission: 'Relance', memory: [], schedule: { every: 'week' as const, day: 1, hour: 8 } }
    const team = await saveTeam(invoke, upsertChange(edited, ['old rule']), { id: 'mariama' }, 'fr')
    expect(team[0].memory).toEqual(['learned meanwhile'])
    expect(calls.map(([c]) => c)).toEqual(['workspace:readFile', 'workspace:writeFile', 'agent-schedule:deleteAgent', 'agent-schedule:updateAgent'])
    expect(calls[3][1]).toMatchObject({ agentName: 'baarasseur-mariama', entry: { schedule: { type: 'cron', expression: '0 8 * * 1' } } })
    expect((calls[3][1] as { entry: { startingMessage: string } }).entry.startingMessage).toMatch(/^C’est l’heure/)
  })
})
