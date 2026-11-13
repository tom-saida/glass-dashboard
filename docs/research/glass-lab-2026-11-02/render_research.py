"""Build research.html (the findings section of the lab page) from the workflow journal."""
import json, sys, os, html, re

J = sys.argv[1]
S = os.path.dirname(os.path.abspath(__file__))
syn = audit = None
verified = []
for line in open(J, encoding='utf-8'):
    try:
        r = json.loads(line)
    except Exception:
        continue
    if r.get('type') != 'result':
        continue
    v = r.get('result')
    if not isinstance(v, dict):
        continue
    if 'diagnosis' in v:
        syn = v
    elif 'wrong' in v:
        audit = v
    elif 'kept' in v:
        verified.append(v)
if syn is None:
    sys.exit('no synthesis in the journal yet')

def e(s):
    return html.escape(str(s or ''))

def paras(text):
    chunks = [c.strip() for c in re.split(r'\n\s*\n|\n', str(text or '')) if c.strip()]
    return ''.join('<p>%s</p>' % e(c) for c in chunks)

def host(u):
    m = re.match(r'https?://([^/]+)', u or '')
    return (m.group(1) if m else u).replace('www.', '')

confirmed = sum(1 for v in verified for k in v.get('kept', []) if str(k.get('verdict', '')).lower().startswith('confirmed'))
total = sum(len(v.get('kept', [])) for v in verified)

out = []
out.append('<h2>What the research found</h2>')
out.append('<div class="read">%s</div>' % paras(syn.get('summary')))
out.append('<p class="note-under">Four research angles (Apple\'s Liquid Glass and its web copies, glassmorphism fundamentals, the property stacks working designers use, typography and text rendering), each re-checked by a skeptic who reopened every source: %d of %d cited claims confirmed. A fifth agent audited the dashboard\'s own stylesheet and screenshots against the recipe. Only confirmed claims are used below.</p>' % (confirmed, total))

out.append('<h2 style="margin-top:34px">What is wrong, in order of how much it matters</h2>')
items = sorted(syn.get('diagnosis', []), key=lambda d: d.get('rank', 99))
for d in items:
    srcs = d.get('sources') or []
    links = ' · '.join('<a href="%s" target="_blank" rel="noopener">%s</a>' % (e(u), e(host(u))) for u in srcs if str(u).startswith('http'))
    out.append('<div class="rank"><div class="no">%s</div><div>' % e(d.get('rank')))
    out.append('<h3>%s</h3>' % e(d.get('title')))
    out.append(paras(d.get('why')))
    if d.get('fix'):
        out.append('<div class="fix"><b>What to change.</b> %s</div>' % e(d.get('fix')))
    if links:
        out.append('<div class="src" style="margin-top:8px">Sources: %s</div>' % links)
    out.append('</div></div>')

out.append('<div class="cols" style="margin-top:34px">')
out.append('<div><h2>What has to be behind the glass</h2><div class="read">%s</div></div>' % paras(syn.get('backdrop')))
out.append('<div><h2>The type</h2><div class="read">%s</div></div>' % paras(syn.get('type_scale')))
out.append('</div>')

out.append('<h2 style="margin-top:34px">The recipe</h2>')
out.append('<pre>%s</pre>' % e(syn.get('recipe_css')))

if audit and audit.get('wrong'):
    out.append('<h2 style="margin-top:34px">The audit of our own stylesheet</h2>')
    out.append('<div class="read">%s</div>' % paras(audit.get('summary')))
    rows = sorted(audit['wrong'], key=lambda w: {'high': 0, 'medium': 1, 'low': 2}.get(str(w.get('impact', '')).lower(), 3))
    out.append('<div style="overflow-x:auto"><table style="border-collapse:collapse;width:100%;font-size:14px"><thead><tr><th style="text-align:left;padding:8px 10px;border-bottom:1px solid var(--line)">Impact</th><th style="text-align:left;padding:8px 10px;border-bottom:1px solid var(--line)">Issue</th><th style="text-align:left;padding:8px 10px;border-bottom:1px solid var(--line)">Where</th><th style="text-align:left;padding:8px 10px;border-bottom:1px solid var(--line)">Fix</th></tr></thead><tbody>')
    for w in rows:
        out.append('<tr><td style="padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:top;white-space:nowrap">%s</td><td style="padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:top">%s</td><td style="padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:top;color:var(--muted);font-size:13px">%s</td><td style="padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:top">%s</td></tr>' % (e(w.get('impact')), e(w.get('issue')), e(w.get('evidence')), e(w.get('fix'))))
    out.append('</tbody></table></div>')

disputed = syn.get('disputed') or []
if disputed:
    out.append('<details style="margin-top:34px"><summary style="cursor:pointer;font-weight:700;font-size:18px">Claims the skeptics could not confirm (%d), left out of the list above</summary><ul class="read" style="padding-left:22px;font-size:15px">%s</ul></details>' % (len(disputed), ''.join('<li>%s</li>' % e(d) for d in disputed)))
if syn.get('risks'):
    out.append('<h2 style="margin-top:34px">Risks</h2><div class="read">%s</div>' % paras(syn.get('risks')))

open(os.path.join(S, 'research.html'), 'w', encoding='utf-8').write('\n'.join(out))
json.dump({'synthesis': syn, 'audit': audit, 'verified': verified}, open(os.path.join(S, 'research.json'), 'w'), indent=1)
print('research.html written: %d diagnosis items, %d/%d claims confirmed' % (len(items), confirmed, total))
