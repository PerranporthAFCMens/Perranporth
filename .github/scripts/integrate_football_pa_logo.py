from pathlib import Path

# Integrate the Football PA logo into the dark landing-page design.
svg = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 620" role="img" aria-labelledby="t d">
<title id="t">Football PA</title><desc id="d">Football PA logo - tactics clipboard, football and checkmark</desc>
<defs>
  <linearGradient id="navy" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#062f5e"/><stop offset="1" stop-color="#0b4b84"/></linearGradient>
  <linearGradient id="green" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#00a63c"/><stop offset="1" stop-color="#1cc75a"/></linearGradient>
</defs>
<g transform="translate(190 28)">
  <path d="M150 78c0-43 35-78 78-78s78 35 78 78h79c23 0 42 19 42 42v235c0 23-19 42-42 42H71c-23 0-42-19-42-42V120c0-23 19-42 42-42h79z" fill="none" stroke="url(#navy)" stroke-width="31" stroke-linejoin="round"/>
  <rect x="128" y="62" width="200" height="68" rx="18" fill="url(#navy)"/>
  <circle cx="228" cy="61" r="23" fill="white" stroke="url(#navy)" stroke-width="17"/>
  <g stroke="url(#green)" stroke-width="19" stroke-linecap="round">
    <path d="M174 165l44 44m0-44l-44 44"/><path d="M245 236l44 44m0-44l-44 44"/>
    <path d="M292 315c63-28 96-77 101-145" fill="none"/><path d="M373 188l25-31 20 37" fill="none" stroke-linejoin="round"/>
  </g>
  <circle cx="377" cy="315" r="24" fill="none" stroke="url(#green)" stroke-width="17"/>
  <g transform="translate(-28 260)">
    <circle cx="118" cy="118" r="112" fill="white" stroke="url(#navy)" stroke-width="17"/>
    <path d="M118 45l40 29-15 48H93L78 74zM57 104l36 18-6 45-41 17-26-33zm122 0l37 18 36 29-25 33-42-17-6-45zm-92 63h62l22 41-52 34-53-34z" fill="url(#navy)"/>
    <path d="M4 163c17 73 79 123 159 123 42 0 79-11 112-33-44 48-101 72-167 72-90 0-151-49-173-116z" fill="url(#green)"/>
  </g>
  <circle cx="425" cy="405" r="58" fill="url(#green)"/>
  <path d="M393 405l22 23 43-50" fill="none" stroke="white" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>
</g>
<text x="450" y="530" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="103" font-weight="900" fill="#073866">Football <tspan fill="#09ad46">PA</tspan></text>
<text x="450" y="588" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="40" font-weight="500" fill="#173f66">Less admin. More football.</text>
</svg>'''
Path('football-pa-logo.svg').write_text(svg, encoding='utf-8')

p = Path('football-pa.html')
s = p.read_text(encoding='utf-8')

s = s.replace('.brandMark{width:42px;height:42px;border-radius:13px;background:linear-gradient(135deg,var(--blue),var(--blue2));display:grid;place-items:center;font-size:21px;box-shadow:0 8px 20px rgba(22,135,255,.28)}\n    .brandText{display:flex;flex-direction:column;line-height:1}\n    .brandText strong{font-size:20px}\n    .brandText span{font-size:10px;color:#9eb8cf;margin-top:5px;font-weight:700;letter-spacing:.9px;text-transform:uppercase}', '.brandLogo{width:190px;height:auto;display:block}.brandText{display:none}')
s = s.replace('.hero{display:grid;grid-template-columns:1.05fr .95fr;gap:48px;align-items:center;padding:72px 0 82px}', '.hero{display:grid;grid-template-columns:1.05fr .95fr;gap:48px;align-items:center;padding:58px 0 82px}.heroLogo{display:block;width:min(650px,112%);max-width:none;margin:-18px 0 0 -42px;filter:drop-shadow(0 16px 30px rgba(0,0,0,.16))}')
s = s.replace('@media(max-width:650px){.wrap{padding:0 14px}.navLinks{display:none}.hero{padding:40px 0 54px}', '@media(max-width:650px){.wrap{padding:0 14px}.brandLogo{width:145px}.navLinks{display:none}.hero{padding:28px 0 54px}.heroLogo{width:min(520px,112%);margin:-8px 0 2px -24px}')

s = s.replace('<div class="brandMark">⚽</div>\n        <div class="brandText"><strong>Football PA</strong><span>by Grassroots HQ</span></div>', '<img class="brandLogo" src="./football-pa-logo.svg" alt="Football PA">')

old = '''<div>\n        <div class="kicker">Built for grassroots football</div>\n        <h1>Less admin.<br><span class="accent">More football.</span></h1>\n        <p>Football PA gives grassroots clubs one place to manage matchday, players, live updates, voting, subs, minutes and more — without the spreadsheet chaos.</p>'''
new = '''<div>\n        <img class="heroLogo" src="./football-pa-logo.svg" alt="Football PA — Less admin. More football.">\n        <div class="kicker">Built for grassroots football</div>\n        <h1>Everything your club needs,<br><span class="accent">in one place.</span></h1>\n        <p>Football PA gives grassroots clubs one place to manage matchday, players, live updates, voting, subs, minutes and more — without the spreadsheet chaos.</p>'''
if old not in s:
    raise SystemExit('Hero block not found')
s = s.replace(old, new)

p.write_text(s, encoding='utf-8')
