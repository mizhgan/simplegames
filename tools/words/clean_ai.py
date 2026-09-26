#!/usr/bin/env python3
"""Чистка списка слов компьютера (BALDA_AI в sg/data/balda-dict.js).

Список составлен по частотности (wordfreq), но частота считается по написанию, а не по смыслу:
«став» частый, потому что это деепричастие от «стать», «стер» — глагол «стёр». Такие слова, имена
собственные, падежные формы других слов и грубые слова перечислены в ai-stoplist.txt.

    python3 tools/words/clean_ai.py            убрать слова из стоп-листа (без сторонних библиотек)
    python3 tools/words/clean_ai.py --suggest  подсказать новых кандидатов (нужен pip install pymorphy3);
                                               проверенные вручную хорошие слова — в ai-keep.txt

Общий словарь BALDA_DICT_PACKED не меняется: игроку эти слова по-прежнему засчитываются.
"""
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
DATA = os.path.join(ROOT, 'sg', 'data', 'balda-dict.js')
AI_RE = re.compile(r'(window\.BALDA_AI = ")([^"]*)(")')


def stoplist(name='ai-stoplist.txt'):
    words = set()
    with open(os.path.join(HERE, name), encoding='utf-8') as fh:
        for line in fh:
            line = line.split('#', 1)[0]
            words.update(line.split())
    return words


def ai_words(text):
    return AI_RE.search(text).group(2).split(' ')


def suggest(words):
    import pymorphy3

    morph = pymorphy3.MorphAnalyzer()
    other_pos = {'VERB', 'GRND', 'INFN', 'PRTF', 'PRTS', 'ADJF', 'ADJS', 'COMP', 'ADVB', 'PRED', 'PREP', 'CONJ', 'PRCL', 'INTJ', 'NPRO', 'NUMR'}
    proper = {'Name', 'Surn', 'Patr', 'Geox', 'Orgn', 'Trad', 'Abbr'}
    norm = lambda s: s.replace('ё', 'е')
    groups = {'другая часть речи': [], 'имя собственное': [], 'форма другого слова': []}
    for w in words:
        ps = morph.parse(w)
        share = lambda test: sum(p.score for p in ps if test(p))
        if share(lambda p: p.tag.POS in other_pos) >= 0.5:
            groups['другая часть речи'].append(w)
        elif share(lambda p: proper & set(p.tag.grammemes)) >= 0.5:
            groups['имя собственное'].append(w)
        else:
            own = share(lambda p: p.tag.POS == 'NOUN' and norm(p.normal_form) == w)
            alien = share(lambda p: p.tag.POS == 'NOUN' and norm(p.normal_form) != w)
            if alien >= 0.5 and alien > own:
                groups['форма другого слова'].append(w)
    for name, ws in groups.items():
        print('# %s (%d) — проверьте вручную, это только подсказка:' % (name, len(ws)))
        print(' '.join(ws))


def main():
    with open(DATA, encoding='utf-8') as fh:
        text = fh.read()
    words = ai_words(text)
    stop = stoplist()
    if '--suggest' in sys.argv:
        keep = stoplist('ai-keep.txt')
        suggest([w for w in words if w not in stop and w not in keep])
        return
    kept = [w for w in words if w not in stop]
    if len(kept) == len(words):
        print('Список компьютера уже чистый: %d слов.' % len(words))
        return
    text = AI_RE.sub(lambda m: m.group(1) + ' '.join(kept) + m.group(3), text, count=1)
    with open(DATA, 'w', encoding='utf-8') as fh:
        fh.write(text)
    print('Убрано слов: %d, осталось %d. Не забудьте python3 tools/build.py (обновит sw.js).' % (len(words) - len(kept), len(kept)))


if __name__ == '__main__':
    main()
