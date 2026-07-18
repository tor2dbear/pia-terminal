---
title: paket: bc — kalkylator
status: done
tags: [packages]
updated: 2026-07-18
---

## Mål
`bc` — aritmetik utan `eval`: tokenisera + rekursiv-descent-parser för
`+ - * / % ( )` med precedens. `bc "2+3*4"` → 14. Insats: S–M. **Första omgången.**

## Levererat
`brew install bc`. Ren `evalExpr(src)` — tokenizer + rekursiv-descent för
`+ - * / % ^` (höger-associativ potens), unärt minus och parenteser, utan
`eval`. `bc "2 + 3 * 4"` (argument) eller `echo 6*7 | bc` (stdin, rad för rad).
Fel (division med noll, saknad parentes, skräptecken) → `bc: <meddelande>`.
Enhetstest (precedens, potens, fel) + med i touren. JS-flyttal, inte bc:s
godtyckliga precision — en lärleksak, inte en numerikmotor.
