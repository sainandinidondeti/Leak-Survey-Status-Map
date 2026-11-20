"""Builds ONE self-contained file (no server, no other files needed) from the project sources:
   python3 build_standalone.py   ->  leak-survey-status-map-standalone.html
Nothing is duplicated by hand: it inlines config.json, the GeoJSON, style.css and every js/ file."""
import json, os, re
os.chdir(os.path.dirname(os.path.abspath(__file__)))
read = lambda p: open(p, encoding='utf-8').read()
html = read('index.html')
html = re.sub(r'<link rel="stylesheet" href="style\.css[^"]*">', lambda m: '<style>\n' + read('style.css') + '\n</style>', html)
embedded = 'window.EMBEDDED_DATA = ' + json.dumps({'config': json.loads(read('config.json')),
            'geojson': json.loads(read('maple_falls_segments.geojson'))}) + ';'
def inline(m):
    return '<script>\n' + read(m.group(1)) + '\n</script>'
html = re.sub(r'<script src="(js/[A-Za-z]+\.js)[^"]*"></script>', inline, html, count=0)
html = html.replace('<script>\n/* Survey date', '<script>' + embedded + '</script>\n<script>\n/* Survey date', 1)
html = re.sub(r'(build \d+)', r'\1 (standalone)', html, count=1)   # label follows index.html's build number
open('leak-survey-status-map-standalone.html', 'w', encoding='utf-8').write(html)
print('Wrote leak-survey-status-map-standalone.html (%d KB)' % (len(html) // 1024))
