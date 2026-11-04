---
description: Crea un worktree en .trees/<nombre> y ejecuta ahí las instrucciones, aislado del código principal
argument-hint: <instrucciones de la tarea>
allowed-tools: Bash(git worktree:*), Bash(git -C:*), Bash(git branch:*), Bash(ls:*)
---

Instrucciones recibidas: $ARGUMENTS

Sigue estos pasos en orden:

1. Si las instrucciones están vacías, pide al usuario que las indique y detente.

2. Deriva un `<nombre>` a partir del requerimiento:
   - kebab-case, 2 a 4 palabras, solo `a-z`, `0-9` y `-`, sin tildes ni espacios.
   - Debe resumir la tarea. Ejemplo: "agregar sonido al limpiar líneas" → `sonido-limpiar-lineas`.

3. Comprueba colisiones con `git worktree list` y `git branch --list <nombre>`. Si el directorio `.trees/<nombre>` o la rama `<nombre>` ya existen, añade el sufijo `-2`, `-3`, etc.

4. Desde la raíz del repo, crea el worktree:

       git worktree add .trees/<nombre>

   Git crea la rama `<nombre>` a partir de `HEAD`.

5. Reglas de aislamiento durante toda la tarea:
   - Lee y edita archivos solo con rutas absolutas dentro de `<raíz>/.trees/<nombre>/`.
   - Usa `git -C .trees/<nombre> ...` para comandos git.
   - Nunca modifiques archivos del árbol principal.
   - Respeta el `CLAUDE.md` del proyecto (UI en español, actualizar README si cambian controles, puntuación o constantes, llamar `updateHUD()` al cambiar score/lines/level, etc.).

6. Ejecuta las instrucciones recibidas dentro del worktree.

7. No hagas commit ni push salvo que las instrucciones lo pidan.

8. Al terminar, informa en español: ruta del worktree, rama, archivos cambiados y estos comandos:
   - Probar: `start .trees/<nombre>/index.html`
   - Integrar: `git merge <nombre>` desde la rama principal
   - Limpiar: `git worktree remove .trees/<nombre>` y `git branch -d <nombre>`
