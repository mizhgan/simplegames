#!/usr/bin/env python3
"""Добавить в словари «Балды» слова из extra-dict.txt и ai-extra.txt (без сторонних библиотек).

Выгрузка OpenCorpora, из которой собран общий словарь, брала только существительные в единственном
числе и без пометки «несклоняемое», поэтому в нём не было «кино», «метро», «часов», «ножниц».

    python3 tools/words/add_extra.py    дописать недостающие слова (повторный запуск ничего не меняет)
"""
import os
import re

from clean_ai import AI_RE, DATA, HERE, ai_words, stoplist

DICT_RE = re.compile(r'(window\.BALDA_DICT_PACKED = ")([^"]*)(")')
DIGITS = '0123456789abcdefghijklmnopqrstuvwxyz'


def unpack(packed):
    words, prev = [], ''
    for token in packed.split(' '):
        w = prev[: DIGITS.index(token[0])] + token[1:]
        words.append(w)
        prev = w
    return words


def pack(words):
    out, prev = [], ''
    for w in words:
        k = 0
        while k < min(len(w), len(prev), len(DIGITS) - 1) and w[k] == prev[k]:
            k += 1
        out.append(DIGITS[k] + w[k:])
        prev = w
    return ' '.join(out)


def main():
    with open(DATA, encoding='utf-8') as fh:
        text = fh.read()
    extra = stoplist('extra-dict.txt')
    ai_extra = stoplist('ai-extra.txt')
    missing = ai_extra - extra
    if missing:
        raise SystemExit('ai-extra.txt: нет в extra-dict.txt: ' + ' '.join(sorted(missing)))
    words = unpack(DICT_RE.search(text).group(2))
    new_dict = sorted(set(words) | extra)
    ai = ai_words(text)
    new_ai = sorted(set(ai) | (ai_extra - stoplist()))
    text = DICT_RE.sub(lambda m: m.group(1) + pack(new_dict) + m.group(3), text, count=1)
    text = AI_RE.sub(lambda m: m.group(1) + ' '.join(new_ai) + m.group(3), text, count=1)
    with open(DATA, 'w', encoding='utf-8') as fh:
        fh.write(text)
    print('словарь: %d → %d, компьютер: %d → %d' % (len(words), len(new_dict), len(ai), len(new_ai)))


if __name__ == '__main__':
    main()
