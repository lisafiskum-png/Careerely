// Stand-in for the Claude Messages API during end-to-end tests.
// Returns a fixed structured resume for any request and remembers the last
// request so tests can check what was sent.
import http from 'node:http'

const PORT = Number(process.env.MOCK_ANTHROPIC_PORT || 4010)
let lastRequest = null

const PARSED = {
  resume: {
    full_name: 'Lisa Fiskum',
    headline: 'AML compliance professional',
    email: 'lisa@example.com',
    phone: '+47 000 00 000',
    location: 'Oslo, Norway',
    links: ['https://linkedin.com/in/example'],
    summary: 'AML professional with a business development background, moving into sales in fintech and crypto.',
    experience: [
      {
        title: 'AML Analyst',
        company: 'Nordic Bank',
        location: 'Oslo',
        start: '2021',
        end: '',
        current: true,
        highlights: ['Led due diligence on complex crypto cases', 'Worked with sales on onboarding enterprise clients'],
      },
      {
        title: 'Business Development Associate',
        company: 'Fintech Startup',
        location: 'Oslo',
        start: '2018',
        end: '2021',
        current: false,
        highlights: ['Built a pipeline of 40 partner banks'],
      },
    ],
    education: [{ institution: 'BI Norwegian Business School', degree: 'MSc', field: 'Finance', start: '2016', end: '2018' }],
    skills: ['AML', 'KYC', 'Business development'],
    languages: ['Norwegian', 'English'],
    certifications: ['CAMS'],
  },
  suggestions: {
    roles: ['Business Development Manager', 'Account Executive'],
    industries: ['Fintech', 'Blockchain & Crypto', 'RegTech'],
    highlights: ['Sales & BD experience found', 'Fintech & compliance background', 'Crypto due diligence exposure'],
  },
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/__last') {
    res.writeHead(200, { 'content-type': 'application/json' })
    return res.end(JSON.stringify(lastRequest))
  }
  if (req.method === 'POST' && req.url?.startsWith('/v1/messages')) {
    let body = ''
    req.on('data', chunk => (body += chunk))
    req.on('end', () => {
      lastRequest = JSON.parse(body)
      res.writeHead(200, { 'content-type': 'application/json', 'request-id': 'req_mock' })
      res.end(
        JSON.stringify({
          id: 'msg_mock',
          type: 'message',
          role: 'assistant',
          model: lastRequest.model,
          content: [{ type: 'text', text: JSON.stringify(PARSED) }],
          stop_reason: 'end_turn',
          stop_sequence: null,
          usage: { input_tokens: 1000, output_tokens: 500 },
        }),
      )
    })
    return
  }
  res.writeHead(404).end()
})

server.listen(PORT, () => console.log(`mock anthropic listening on ${PORT}`))
