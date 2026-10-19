import { ImageResponse } from 'next/og'

export const alt = 'Careerely — your AI career agent'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '72px 82px',
        color: '#0E0E0E',
        background: 'linear-gradient(135deg, #fafafa 0%, #f4f1ff 55%, #ebe5ff 100%)',
        fontFamily: 'Arial, sans-serif',
      }}
    >
      <div style={{ display: 'flex', fontSize: 44, fontWeight: 700, letterSpacing: '-2px' }}>
        Career<span style={{ color: '#7657d6' }}>ely</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', maxWidth: 930 }}>
        <div style={{ display: 'flex', fontSize: 82, lineHeight: 1.02, fontWeight: 700, letterSpacing: '-4px' }}>
          Stop searching for jobs.
        </div>
        <div style={{ display: 'flex', marginTop: 26, fontSize: 34, lineHeight: 1.3, color: '#57525f' }}>
          Let Careerely find the right opportunities and prepare your strongest applications.
        </div>
      </div>
    </div>,
    size,
  )
}
