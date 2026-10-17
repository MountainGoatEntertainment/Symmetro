"""Level designer: draw a shape with the game controls and save it to levels.json."""

from __future__ import annotations

import pygame

from .app import (
    CONFIRM_KEYS, FOOTER_H, GREEN, HILITE, HUD_H, MUTED, PAD, PAPER, PINK, TEXT, WIDTH, HEIGHT,
    App, Board, Scene, key_action,
)
from .geometry import MODE_DESCRIPTIONS, MODE_NAMES, MODES, Point, Shape, build_layout, step
from .levels import load_levels, save_level

CANVAS_W, CANVAS_H = 14, 9
NAME_MAX = 30


def trimmed_moves(start: Point, moves: list[int]) -> str:
    """The moves as a string, without trailing steps that only retrace lines."""
    moves = list(moves)
    full = Shape.from_moves("".join(map(str, moves)), start).segments
    while moves and Shape.from_moves("".join(map(str, moves[:-1])), start).segments == full:
        moves.pop()
    return "".join(map(str, moves))


class Designer(Scene):
    def __init__(self, app: App, message: str = "") -> None:
        super().__init__(app)
        area = pygame.Rect(PAD, HUD_H, WIDTH - 2 * PAD, HEIGHT - HUD_H - FOOTER_H)
        self.board = Board(CANVAS_W, CANVAS_H, area)
        self.cursor: Point = (CANVAS_W // 2, CANVAS_H // 2)
        self.path: list[Point] = []  # pen positions; empty while the pen is up
        self.moves: list[int] = []
        self.message = message
        self.confirm_quit = False

    @property
    def shape(self) -> Shape | None:
        if not self.path:
            return None
        return Shape.from_moves("".join(map(str, self.moves)), self.path[0])

    def key(self, event):
        quitting, self.confirm_quit = self.confirm_quit, False
        if event.key == pygame.K_ESCAPE:
            if not self.moves or quitting:
                return None
            self.confirm_quit = True
            self.message = "Unsaved drawing! Press Esc again to quit."
            return self
        self.message = ""
        if event.key in (pygame.K_DELETE, pygame.K_n):
            self.path, self.moves = [], []
            return self
        if event.key in (pygame.K_RETURN, pygame.K_KP_ENTER):
            shape = self.shape
            if not shape or not shape.segments:
                self.message = "Draw something first."
                return self
            return SaveDialog(self.app, self, trimmed_moves(self.path[0], self.moves))
        if event.key == pygame.K_SPACE:
            if not self.path:
                self.path = [self.cursor]
            elif not self.moves:
                self.path = []
            else:
                self.message = "Undo back to the start (or N for new) to move the start point."
            return self

        action = key_action(event)
        if action == "undo":
            if self.moves:
                self.moves.pop()
                self.path.pop()
                self.cursor = self.path[-1]
            elif self.path:
                self.path = []
        elif isinstance(action, int):
            nxt = step(self.cursor, action)
            if 0 <= nxt[0] <= CANVAS_W and 0 <= nxt[1] <= CANVAS_H:
                self.cursor = nxt
                if self.path:
                    self.path.append(nxt)
                    self.moves.append(action)
        return self

    def draw(self) -> None:
        app, screen, board = self.app, self.app.screen, self.board
        board.draw_paper(screen)
        shape = self.shape
        if shape:
            board.draw_segments(screen, shape.segments, GREEN)
            board.draw_dot(screen, shape.start, PINK)
            board.draw_dot(screen, self.cursor, GREEN, pen=True)
        else:
            pygame.draw.circle(screen, GREEN, board.px(self.cursor), board.dot_r * 1.15, 3)

        app.text("Level designer", 38, topleft=(PAD, 18))
        if not shape:
            status = "Move to the start point and press Space to put the pen down"
        else:
            status = f"Drawing: {len(shape.segments)} lines.  Enter: save as a level"
        app.text(self.message or status, 30, PINK if self.message else MUTED, topleft=(PAD, 54))
        app.text(
            "1-9 / QWE AD ZXC: move/draw   5/S: undo   Space: pen down/up   "
            "N: new   Enter: save   Esc: quit",
            24, MUTED, midbottom=(WIDTH // 2, HEIGHT - 14),
        )


class SaveDialog(Scene):
    def __init__(self, app: App, designer: Designer, moves: str) -> None:
        super().__init__(app)
        self.designer = designer
        self.moves = moves
        self.shape = Shape.from_moves(moves, designer.path[0])
        self.name = ""
        self.mode_index = 0
        self.message = ""
        pygame.key.start_text_input()

    def key(self, event):
        if event.key == pygame.K_ESCAPE:
            return self.designer
        if event.key in CONFIRM_KEYS - {pygame.K_SPACE}:
            return self.save()
        if event.key == pygame.K_BACKSPACE:
            self.name = self.name[:-1]
        elif event.key in (pygame.K_LEFT, pygame.K_UP):
            self.mode_index = (self.mode_index - 1) % len(MODES)
        elif event.key in (pygame.K_RIGHT, pygame.K_DOWN):
            self.mode_index = (self.mode_index + 1) % len(MODES)
        return self

    def text_input(self, text):
        if len(self.name) < NAME_MAX:
            self.name = (self.name + text)[:NAME_MAX]
        return self

    def save(self) -> Scene:
        name = self.name.strip()
        if not name:
            self.message = "Type a name first."
            return self
        mode = MODES[self.mode_index]
        save_level(name, mode, self.moves)
        number = len(load_levels())
        return Designer(self.app, f"Saved \"{name}\" ({MODE_NAMES[mode]}) as level {number}.")

    def draw(self) -> None:
        app = self.app
        mode = MODES[self.mode_index]
        app.text("Save level", 38, topleft=(PAD, 18))
        app.text(self.message or MODE_DESCRIPTIONS[mode], 30, PINK if self.message else MUTED,
                 topleft=(PAD, 54))

        field = pygame.Rect(PAD, HUD_H + 4, 480, 44)
        pygame.draw.rect(app.screen, PAPER, field, border_radius=8)
        pygame.draw.rect(app.screen, HILITE, field, 2, border_radius=8)
        caret = "|" if pygame.time.get_ticks() // 500 % 2 else ""
        if self.name:
            app.text(self.name + caret, 38, TEXT, midleft=(field.left + 12, field.centery))
        else:
            app.text("Type a name" + caret, 38, MUTED, midleft=(field.left + 12, field.centery))
        app.text(f"<  {MODE_NAMES[mode]}  >", 38, HILITE, midleft=(field.right + 30, field.centery))

        area = pygame.Rect(PAD, field.bottom + 16, WIDTH - 2 * PAD, HEIGHT - field.bottom - 16 - FOOTER_H)
        layout = build_layout(mode, self.shape)
        Board(layout.grid_w, layout.grid_h, area).draw_layout(app.screen, layout)
        app.text("Type the name     Left/Right: mode     Enter: save     Esc: back to drawing",
                 24, MUTED, midbottom=(WIDTH // 2, HEIGHT - 14))


def main() -> None:
    App("Symmetro level designer", Designer).run()


if __name__ == "__main__":
    main()
