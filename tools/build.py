#!/usr/bin/env python3
"""Сборка сайта SimpleGames из описаний игр.

Источник правды — папки игр:
    games/catalog.json      порядок игр на главной
    games/<id>/meta.json    название, описания, категория, карточка, рекорд, «Игра дня», правила, подключаемые файлы
    games/<id>/stage.html   разметка игрового поля
    games/<id>/thumb.svg    картинка для карточки на главной

Скрипт генерирует:
    games/<id>/index.html   страница игры (шаблон tools/templates/game.html)
    index.html              главная с карточками (шаблон tools/templates/index.html)
    sg/js/site.js           список игр и задания «Игры дня» (между метками @build)
    games/tournament/game.js  игры для турнира (между метками @build:duo)
    README.md               таблица игр (между метками games:start / games:end)
    sw.js                   service worker для офлайн-режима

Запуск:
    python3 tools/build.py          собрать всё
    python3 tools/build.py --fmt    заодно привести meta.json к единому виду
    python3 tools/build.py --new <id> "Название"   заготовка новой игры (и сразу сборка)
    python3 tools/build.py --check  только проверить, что сгенерированные файлы актуальны (код выхода 1, если нет)
"""
import hashlib
import html
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GAMES = os.path.join(ROOT, 'games')
TPL = os.path.join(ROOT, 'tools', 'templates')

CATEGORIES = {'arcade', 'puzzle', 'board'}


def read(path):
    with open(path, encoding='utf-8') as fh:
        return fh.read()


def indent(text, n):
    pad = ' ' * n
    return '\n'.join(pad + line if line.strip() else line for line in text.rstrip('\n').split('\n'))


def plural(n, one, few, many):
    if n % 10 == 1 and n % 100 != 11:
        return one
    if 2 <= n % 10 <= 4 and not 12 <= n % 100 <= 14:
        return few
    return many


def fill(template, values):
    def sub(m):
        key = m.group(1)
        if key not in values:
            raise KeyError('нет значения для {{%s}}' % key)
        return values[key]
    return re.sub(r'\{\{(\w+)\}\}', sub, template)


# ---------- загрузка и проверка описаний ----------

def load():
    order = json.loads(read(os.path.join(GAMES, 'catalog.json')))
    games = []
    errors = []
    dirs = sorted(d for d in os.listdir(GAMES) if os.path.isdir(os.path.join(GAMES, d)))
    for d in dirs:
        if d not in order:
            errors.append('игра %s не указана в games/catalog.json' % d)
    for gid in order:
        base = os.path.join(GAMES, gid)
        for f in ('meta.json', 'stage.html', 'thumb.svg', 'game.js'):
            if not os.path.exists(os.path.join(base, f)):
                errors.append('%s: нет файла %s' % (gid, f))
        if errors:
            continue
        meta = json.loads(read(os.path.join(base, 'meta.json')))
        meta['id'] = gid
        meta['stageHtml'] = read(os.path.join(base, 'stage.html'))
        meta['thumbSvg'] = read(os.path.join(base, 'thumb.svg'))
        for key in ('title', 'description', 'category', 'tag', 'card', 'rules'):
            if key not in meta:
                errors.append('%s: в meta.json нет поля %s' % (gid, key))
        if meta.get('category') not in CATEGORIES:
            errors.append('%s: неизвестная категория %r' % (gid, meta.get('category')))
        games.append(meta)
    if errors:
        sys.exit('Ошибки в описаниях игр:\n  ' + '\n  '.join(errors))
    return games


# ---------- страницы ----------

def game_page(g):
    stats = ''
    if g.get('stats'):
        stats = '      <div class="stats">\n' + indent('\n'.join(g['stats']), 8) + '\n      </div>\n'
    return fill(read(os.path.join(TPL, 'game.html')), {
        'pageTitle': g.get('pageTitle', g['title']),
        'title': g['title'],
        'description': g['description'],
        'head': ''.join('  <link rel="stylesheet" href="%s">\n' % href for href in g.get('styles', [])),
        'stats': stats,
        'stage': indent(g['stageHtml'], 8),
        'rules': '\n'.join('            <li>%s</li>' % r for r in g['rules']),
        'scripts': ''.join('  <script src="%s"></script>\n' % s for s in ['../../sg/js/common.js'] + g.get('scripts', []) + ['game.js']),
    })


def card(g):
    attrs = ''
    if g.get('online'):
        attrs += ' data-online="1"'
    if g.get('party'):
        attrs += ' data-party="1"'
    tags = '<span class="tag">%s</span>' % g['tag']
    if g.get('party'):
        tags += '<span class="tag tag-party">👥 Компанией</span>'
    elif g.get('online') and g.get('onlineTag', True):
        tags += '<span class="tag tag-online">🌐 По сети</span>'
    best = g.get('best')
    if best:
        extra = ''.join(' data-best-%s="%s"' % (k, html.escape(v, quote=True)) for k, v in best.items() if k != 'key')
        tags += '<span class="best" data-best="%s"%s></span>' % (best['key'], extra)
    g1, g2 = g['card']['colors']
    return (
        '        <a class="game-card" href="games/%s/index.html"%s data-cat="%s" style="--g1:%s;--g2:%s">\n' % (g['id'], attrs, g['category'], g1, g2)
        + '          <div class="thumb">\n'
        + indent(g['thumbSvg'], 12) + '\n'
        + '          </div>\n'
        + '          <div class="card-body">\n'
        + '            <h3>%s</h3>\n' % g.get('cardTitle', g['title'])
        + '            <p>%s</p>\n' % g['card']['text']
        + '            <div class="card-meta">%s</div>\n' % tags
        + '          </div>\n'
        + '        </a>\n'
    )


def index_page(games):
    n = len(games)
    more = n - 10
    return fill(read(os.path.join(TPL, 'index.html')), {
        'cards': '\n'.join(card(g) for g in games),
        'count': '%d %s' % (n, plural(n, 'игра', 'игры', 'игр')),
        'count_more': '%d %s' % (more, plural(more, 'игра', 'игры', 'игр')),
    })


# ---------- site.js и README ----------

def js_str(s):
    return "'" + str(s).replace('\\', '\\\\').replace("'", "\\'") + "'"


def js_key(k):
    return k if re.match(r'^[A-Za-z_$][\w$]*$', k) else js_str(k)


def site_js(games, current):
    names = '\n'.join('    %s: %s,' % (js_key(g['id']), js_str(g.get('shortTitle', g['title']))) for g in games)
    daily = []
    for g in games:
        for row in g.get('daily', []):
            daily.append('    [' + ', '.join([js_str(g['id'])] + [js_str(x) if isinstance(x, str) else str(x) for x in row]) + '],')
    out = replace_between(current, '    // @build:games\n', '    // @end\n', names + '\n', 'sg/js/site.js')
    return replace_between(out, '    // @build:daily\n', '    // @end\n', '\n'.join(daily) + '\n', 'sg/js/site.js')


def readme(games, current):
    rows = '\n'.join('| %s | `games/%s/` | %s |' % (g.get('readmeTitle', g['title']), g['id'], g['readme']) for g in games if g.get('readme'))
    table = '| Игра | Папка | Управление |\n| --- | --- | --- |\n' + rows + '\n'
    return replace_between(current, '<!-- games:start -->\n', '<!-- games:end -->\n', table, 'README.md')


def tournament_js(games, current):
    """Игры для турнира: всё, во что можно сыграть вдвоём по сети (кроме отмеченных \"tournament\": false)."""
    duo = sorted(([g['id'], g['title']] for g in games if g.get('online') and not g.get('party') and g.get('tournament', True)), key=lambda x: x[1].lower())
    return replace_between(current, '/* @build:duo */', '/* @end */', json.dumps(duo, ensure_ascii=False), 'games/tournament/game.js')


def replace_between(text, start, end, body, name):
    i = text.find(start)
    j = text.find(end, i + len(start)) if i >= 0 else -1
    if i < 0 or j < 0:
        sys.exit('%s: не найдены метки %r … %r' % (name, start.strip(), end.strip()))
    return text[: i + len(start)] + body + text[j:]


# ---------- service worker ----------

SW_SKIP_DIRS = {'.git', 'tools', 'deploy', 'node_modules', '.github'}
SW_SKIP_FILES = {'sw.js', 'README.md', '.htaccess', 'robots.txt', '.gitignore', '404.html', 'meta.json', 'stage.html', 'thumb.svg', 'catalog.json'}
SW_EXTS = {'.html', '.css', '.js', '.svg', '.png', '.webmanifest', '.json'}


def service_worker(outputs):
    """outputs — уже сгенерированные файлы (путь → содержимое), чтобы версия считалась по новому содержимому."""
    files = []
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = sorted(d for d in dirnames if d not in SW_SKIP_DIRS)
        for name in sorted(filenames):
            rel = os.path.relpath(os.path.join(dirpath, name), ROOT).replace(os.sep, '/')
            if name in SW_SKIP_FILES or os.path.splitext(name)[1] not in SW_EXTS:
                continue
            files.append(rel)
    for rel in outputs:
        if rel not in files and rel != 'sw.js' and os.path.splitext(rel)[1] in SW_EXTS and os.path.basename(rel) not in SW_SKIP_FILES:
            files.append(rel)
    digest = hashlib.sha256()
    for rel in files:
        digest.update(rel.encode())
        if rel in outputs:
            digest.update(outputs[rel].encode('utf-8'))
        else:
            with open(os.path.join(ROOT, rel), 'rb') as fh:
                digest.update(fh.read())
    version = digest.hexdigest()[:12]
    template = read(os.path.join(TPL, 'sw.js'))
    return template.replace('%VERSION%', version).replace('%PRECACHE%', json.dumps(['./'] + files, ensure_ascii=False, indent=2)), len(files), version


# ---------- заготовка новой игры (python3 tools/build.py --new <id> "Название") ----------

def new_game(gid, title):
    if not re.match(r'^[a-z][a-z0-9]*$', gid):
        sys.exit('Имя папки — латиница и цифры, например: snake2')
    base = os.path.join(GAMES, gid)
    if os.path.exists(base):
        sys.exit('Папка games/%s уже есть' % gid)
    os.makedirs(base)
    meta = {
        'title': title,
        'description': title + ': короткое описание для поисковиков.',
        'category': 'arcade',
        'tag': 'Аркада',
        'online': False,
        'party': False,
        'card': {'text': 'Одна-две фразы для карточки на главной.', 'colors': ['#6366f1', '#312e81']},
        'best': {'key': gid + '-best'},
        'readme': 'управление и особенности',
        'scripts': ['../../sg/js/site.js'],
        'rules': ['Первое правило.', 'Второе правило.'],
    }
    files = {
        'meta.json': dump_json(meta) + '\n',
        'stage.html': '<div class="stage-wrap">\n  <canvas id="board" class="board-canvas" width="480" height="480" aria-label="Игровое поле"></canvas>\n</div>\n',
        'thumb.svg': '<svg viewBox="0 0 160 100" aria-hidden="true">\n  <circle cx="80" cy="50" r="30" fill="#fff"/>\n</svg>\n',
        'game.js': "/* %s */\n(() => {\n  'use strict';\n\n  const canvas = document.getElementById('board');\n  const g = canvas.getContext('2d');\n  g.fillStyle = SG.cssVar('--accent');\n  g.fillRect(0, 0, canvas.width, canvas.height);\n})();\n" % title,
    }
    for name, text in files.items():
        with open(os.path.join(base, name), 'w', encoding='utf-8') as fh:
            fh.write(text)
    order = json.loads(read(os.path.join(GAMES, 'catalog.json')))
    order.append(gid)
    with open(os.path.join(GAMES, 'catalog.json'), 'w', encoding='utf-8') as fh:
        fh.write('[\n' + ',\n'.join('  ' + json.dumps(x) for x in order) + '\n]\n')
    print('Создана заготовка games/%s/ — заполните meta.json, stage.html, thumb.svg и game.js' % gid)


# ---------- аккуратный JSON для meta.json (python3 tools/build.py --fmt) ----------

def dump_json(o, level=0):
    pad = '  ' * level
    flat = lambda v: not isinstance(v, (dict, list))
    if isinstance(o, dict):
        if not o:
            return '{}'
        one = '{ ' + ', '.join('%s: %s' % (json.dumps(k, ensure_ascii=False), json.dumps(v, ensure_ascii=False)) for k, v in o.items()) + ' }'
        if all(flat(v) for v in o.values()) and len(one) < 90:
            return one
        return '{\n' + ',\n'.join('%s  %s: %s' % (pad, json.dumps(k, ensure_ascii=False), dump_json(v, level + 1)) for k, v in o.items()) + '\n' + pad + '}'
    if isinstance(o, list):
        if not o:
            return '[]'
        one = '[' + ', '.join(dump_json(v, level + 1) for v in o) + ']'
        if len(one) < 90 and (all(flat(v) for v in o) or all(isinstance(v, list) for v in o)):
            return one
        return '[\n' + ',\n'.join('%s  %s' % (pad, dump_json(v, level + 1)) for v in o) + '\n' + pad + ']'
    return json.dumps(o, ensure_ascii=False)


def format_meta():
    for gid in json.loads(read(os.path.join(GAMES, 'catalog.json'))):
        path = os.path.join(GAMES, gid, 'meta.json')
        text = dump_json(json.loads(read(path))) + '\n'
        if text != read(path):
            with open(path, 'w', encoding='utf-8') as fh:
                fh.write(text)


# ---------- запуск ----------

def main():
    check = '--check' in sys.argv
    if '--new' in sys.argv:
        i = sys.argv.index('--new')
        if len(sys.argv) < i + 3:
            sys.exit('Использование: python3 tools/build.py --new <id> "Название"')
        new_game(sys.argv[i + 1], sys.argv[i + 2])
    if '--fmt' in sys.argv:
        format_meta()
    games = load()
    out = {}
    for g in games:
        out['games/%s/index.html' % g['id']] = game_page(g)
    out['index.html'] = index_page(games)
    out['sg/js/site.js'] = site_js(games, read(os.path.join(ROOT, 'sg/js/site.js')))
    out['README.md'] = readme(games, read(os.path.join(ROOT, 'README.md')))
    out['games/tournament/game.js'] = tournament_js(games, read(os.path.join(GAMES, 'tournament', 'game.js')))
    sw, nfiles, version = service_worker(out)
    out['sw.js'] = sw
    stale = [rel for rel, text in out.items() if not os.path.exists(os.path.join(ROOT, rel)) or read(os.path.join(ROOT, rel)) != text]
    if check:
        if stale:
            print('Устарели (запустите python3 tools/build.py):\n  ' + '\n  '.join(stale))
            sys.exit(1)
        print('Всё актуально: %d игр.' % len(games))
        return
    for rel in stale:
        with open(os.path.join(ROOT, rel), 'w', encoding='utf-8') as fh:
            fh.write(out[rel])
    print('Игр: %d. Обновлено файлов: %d. sw.js: %d файлов, версия %s' % (len(games), len(stale), nfiles, version))


if __name__ == '__main__':
    main()
