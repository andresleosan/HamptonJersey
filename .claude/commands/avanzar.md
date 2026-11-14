---
description: Avanza el checklist de Hampton App sin detenerse (elige por la ruta, construye, verifica, publica y sigue)
argument-hint: "[código o paquete opcional, p. ej. PUB-09 o PAQ-18]"
---

Encargo de Luis: $ARGUMENTS

1. Copia de avance: si existe `.worktrees/avanzar` en la raíz del repositorio (en la VPS, `/root/HamptonJersey/.worktrees/avanzar`), trabaja ahí; si no, en este clon, que debe estar en `main`.
2. En esa copia: `git pull --ff-only origin main`.
3. Lee `.agents/skills/avanzar/SKILL.md` de esa copia y síguela entera. Es la única fuente de reglas; este archivo solo lleva hasta ella.
