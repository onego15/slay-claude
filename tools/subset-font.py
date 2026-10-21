# Subset DotGothic16 (SIL OFL) to the characters actually used in the game.
import glob, os, subprocess, sys
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
chars = set(chr(c) for c in range(0x20, 0x7f))
chars |= set('ー・「」『』、。！？…―〜＋－×÷％（）：／　①②③←→↑↓★☆♪')
for f in glob.glob(os.path.join(root, 'src', '**', '*.*'), recursive=True):
    if f.endswith(('.js', '.css', '.html')):
        chars |= set(open(f, encoding='utf-8').read())
chars = {c for c in chars if ord(c) >= 0x20}
txt = os.path.join(root, 'tools', '.chars.txt')
open(txt, 'w', encoding='utf-8').write(''.join(sorted(chars)))
out = os.path.join(root, 'src', 'assets', 'font.woff2')
subprocess.check_call([sys.executable, '-m', 'fontTools.subset', os.path.join(root, 'tools', 'DotGothic16-Regular.ttf'),
    '--text-file=' + txt, '--flavor=woff2', '--output-file=' + out, '--layout-features=*'])
print('chars', len(chars), 'size', os.path.getsize(out))
