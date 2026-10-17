"""Print what each key press is reported as, to debug keyboard mappings.

Run with: uv run python -m symmetro.keytest   (Esc or close the window to stop)
"""

import pygame

from .app import key_action


def main() -> None:
    pygame.init()
    pygame.display.set_mode((500, 120))
    pygame.display.set_caption("Symmetro key test - press keys, Esc quits")
    while True:
        event = pygame.event.wait()
        if event.type == pygame.QUIT:
            break
        if event.type in (pygame.KEYDOWN, pygame.KEYUP):
            kind = "DOWN" if event.type == pygame.KEYDOWN else "up  "
            print(f"{kind} key={pygame.key.name(event.key)!r:14} code={event.key:<11} "
                  f"scancode={event.scancode:<4} mod={event.mod:<6} -> {key_action(event)}", flush=True)
            if event.type == pygame.KEYDOWN and event.key == pygame.K_ESCAPE:
                break
        elif event.type == pygame.TEXTINPUT:
            print(f"text {event.text!r}", flush=True)
    pygame.quit()


if __name__ == "__main__":
    main()
