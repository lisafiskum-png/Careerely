import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  COVER_LETTER_SEGMENT_TYPES,
  EVIDENCE_SIGNAL_TYPES,
  EVIDENCE_SOURCE_TYPES,
  RESUME_CHANGE_TYPES,
  RESUME_SECTIONS,
  STAGE_NUMBER,
} from '../../lib/engine/schema'

// Guards lib/engine/schema.ts against drifting from the locked root schema.
const root = readFileSync(path.resolve(import.meta.dirname, '../../OPPORTUNITY_ENGINE_SCHEMA.ts'), 'utf8')
const engine = readFileSync(path.resolve(import.meta.dirname, '../../lib/engine/schema.ts'), 'utf8')

// Reads the literal members of `type Name = 'a' | 'b' ...` (single or multi-line,
// with or without a trailing semicolon or comments).
function unionMembers(source: string, name: string): string[] {
  const start = source.search(new RegExp(`type ${name}\\s*=`))
  if (start < 0) throw new Error(`type ${name} not found`)
  const lines = source.slice(start).split('\n')
  const body: string[] = [lines[0].slice(lines[0].indexOf('=') + 1)]
  for (const line of lines.slice(1)) {
    if (!/^\s*\|/.test(line)) break
    body.push(line)
  }
  return body
    .map(l => l.replace(/\/\/.*$/, '').split(';')[0])
    .join(' ')
    .match(/["'][a-z0-9_]+["']/g)!
    .map(m => m.slice(1, -1))
    .sort()
}

const UNIONS = [
  'EvidenceOutcome',
  'WorkStyle',
  'HardFilterCriterionType',
  'ScoreDimensionType',
  'EvidenceSignalType',
  'EvidenceSourceType',
  'RejectionReason',
  'OpportunityPipelineStage',
  'PreparationDecisionReason',
  'ResumeSection',
  'ResumeChangeType',
  'CoverLetterSegmentType',
  'OpportunityState',
]

describe('engine schema matches OPPORTUNITY_ENGINE_SCHEMA.ts', () => {
  it.each(UNIONS)('%s has the same members', name => {
    expect(unionMembers(engine, name)).toEqual(unionMembers(root, name))
  })

  it('never allows a negative evidence outcome', () => {
    expect(unionMembers(root, 'EvidenceOutcome')).not.toContain('negative')
  })

  it('runtime lists match their unions', () => {
    expect([...EVIDENCE_SIGNAL_TYPES].sort()).toEqual(unionMembers(root, 'EvidenceSignalType'))
    expect([...EVIDENCE_SOURCE_TYPES].sort()).toEqual(unionMembers(root, 'EvidenceSourceType'))
    expect([...RESUME_SECTIONS].sort()).toEqual(unionMembers(root, 'ResumeSection'))
    expect([...RESUME_CHANGE_TYPES].sort()).toEqual(unionMembers(root, 'ResumeChangeType'))
    expect([...COVER_LETTER_SEGMENT_TYPES].sort()).toEqual(unionMembers(root, 'CoverLetterSegmentType'))
    expect(Object.keys(STAGE_NUMBER).sort()).toEqual(unionMembers(root, 'OpportunityPipelineStage'))
  })
})
