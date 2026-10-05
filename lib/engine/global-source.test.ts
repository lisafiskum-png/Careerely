import { describe, expect, it } from 'vitest'
import { buildGlobalJobQuery, parseGoogleJobs } from './global-source'

describe('global job discovery', () => {
  it('builds one compact query from roles and industries', () => {
    expect(
      buildGlobalJobQuery({
        target_roles: ['Registered Nurse', 'Nurse Practitioner'],
        industries: ['Healthcare'],
      }),
    ).toBe('(\"Registered Nurse\" OR \"Nurse Practitioner\") Healthcare')
  })

  it('normalizes valid Google Jobs results without guessing compensation', () => {
    const [job] = parseGoogleJobs({
      jobs_results: [
        {
          job_id: 'abc123',
          title: 'Registered Nurse',
          company_name: 'City Hospital',
          location: 'Madrid, Spain',
          description: 'Requirements\n• Registered nursing qualification\n• Two years of acute care experience',
          apply_options: [{ title: 'Employer', link: 'https://example.com/jobs/abc123' }],
          detected_extensions: {},
        },
      ],
    })

    expect(job).toMatchObject({
      source: 'serpapi',
      source_job_id: 'abc123',
      title: 'Registered Nurse',
      company: 'City Hospital',
      company_slug: 'city-hospital',
      location: 'Madrid, Spain',
      url: 'https://example.com/jobs/abc123',
      salary_min: null,
      salary_max: null,
      salary_currency: null,
    })
    expect(job.requirements).toContain('Registered nursing qualification')
  })

  it('recognizes remote results and drops unsafe or unusable posting links', () => {
    const jobs = parseGoogleJobs({
      jobs_results: [
        {
          job_id: 'remote-1',
          title: 'Accountant',
          company_name: 'Global Co',
          location: 'United Kingdom',
          description: 'Work from anywhere.',
          apply_options: [{ link: 'https://example.com/apply' }],
          detected_extensions: { work_from_home: true },
        },
        {
          job_id: 'bad-url',
          title: 'Teacher',
          company_name: 'School',
          apply_options: [{ link: 'javascript:alert(1)' }],
        },
      ],
    })

    expect(jobs).toHaveLength(1)
    expect(jobs[0].work_style).toBe('remote')
  })
})
