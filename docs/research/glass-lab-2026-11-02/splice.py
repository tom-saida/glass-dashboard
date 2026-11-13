import sys, os, base64
S = os.path.dirname(os.path.abspath(__file__))
def uri(name, mime):
    with open(os.path.join(S, name), 'rb') as f:
        return 'data:%s;base64,%s' % (mime, base64.b64encode(f.read()).decode())
t = open(os.path.join(S, 'katie-glass-lab.template.html'), encoding='utf-8').read()
t = t.replace('__SCENE_URI__', 'data:image/webp;base64,' + open(os.path.join(S, 'scene.webp.b64')).read())
t = t.replace('__ROOM_URI__', uri('room.webp', 'image/webp'))
t = t.replace('__PHOTO_URI__', uri('photo.webp', 'image/webp'))
t = t.replace('__LENS_URI__', uri('lens.png', 'image/png'))
rp = os.path.join(S, 'research.html')
research = open(rp, encoding='utf-8').read() if os.path.exists(rp) else '<h2>What the research found</h2><p class="read">Being written. The research sweep is still running.</p>'
t = t.replace('__RESEARCH_HTML__', research)
open(os.path.join(S, 'katie-glass-lab.html'), 'w', encoding='utf-8').write(t)
print('page bytes', len(t.encode('utf-8')))
