import { describe, expect, it } from 'vitest'
import { parseLocationSuggestions } from './locations'

describe('parseLocationSuggestions', () => {
  it('keeps useful worldwide administrative places and normalizes labels', () => {
    expect(
      parseLocationSuggestions([
        { name: 'Moraira', canonical_name: 'Moraira,Alicante,Valencian Community,Spain', target_type: 'City' },
        { name: 'Huddinge', canonical_name: 'Huddinge,Stockholm County,Sweden', target_type: 'Municipality' },
        { name: 'Norway', canonical_name: 'Norway', target_type: 'Country' },
      ]),
    ).toEqual([
      'Moraira, Alicante, Valencian Community, Spain',
      'Huddinge, Stockholm County, Sweden',
      'Norway',
    ])
  })

  it('drops irrelevant or malformed results and deduplicates case-insensitively', () => {
    expect(
      parseLocationSuggestions([
        { name: 'Oslo Airport', canonical_name: 'Oslo Airport,Norway', target_type: 'Airport' },
        { name: 'Oslo', canonical_name: 'Oslo,Norway', target_type: 'City' },
        { name: 'OSLO', canonical_name: 'OSLO,NORWAY', target_type: 'City' },
        { canonical_name: 123, target_type: 'City' },
        null,
      ]),
    ).toEqual(['Oslo, Norway'])
  })

  it('honors the requested limit', () => {
    expect(
      parseLocationSuggestions(
        [
          { canonical_name: 'Madrid,Spain', target_type: 'City' },
          { canonical_name: 'Barcelona,Spain', target_type: 'City' },
        ],
        1,
      ),
    ).toEqual(['Madrid, Spain'])
  })
})
