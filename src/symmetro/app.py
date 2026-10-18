"""Pygame front end: menus, the board and the results screen."""

from __future__ import annotations

import time
from collections.abc import Callable
from pathlib import Path

import pygame

from . import scores
from .game import Event, Round
from .geometry import MODE_DESCRIPTIONS, MODE_NAMES, MODES, Layout, build_layout
from .levels import DIFFICULTIES, Level, load_levels, random_shape
from .music import Jukebox, music_dir

WIDTH, HEIGHT = 1000, 780
HUD_H, FOOTER_H, PAD = 96, 44, 24
SPLASH_PATH = Path(__file__).with_name("assets") / "splash.png"
SPLASH_SECONDS = 4.0

BG = (232, 234, 240)
PAPER = (255, 255, 255)
BORDER = (0, 0, 0)
GRID = (190, 180, 186)
AXIS = (90, 120, 250)
GREEN = (30, 200, 60)
PINK = (240, 80, 150)
INK = (20, 105, 45)  # dark green: the copy being drawn
TEXT = (30, 30, 40)
MUTED = (110, 110, 125)
HILITE = (90, 120, 250)

# Direction keys: numpad and arrows by key code, the letter block by physical
# position (scancode) so it works on QWERTZ/AZERTY keyboards too.
DIR_KEYS = {
    pygame.K_KP7: 7, pygame.K_KP8: 8, pygame.K_KP9: 9,
    pygame.K_KP4: 4, pygame.K_KP6: 6,
    pygame.K_KP1: 1, pygame.K_KP2: 2, pygame.K_KP3: 3,
    pygame.K_UP: 8, pygame.K_DOWN: 2, pygame.K_LEFT: 4, pygame.K_RIGHT: 6,
}
DIR_SCANCODES = {
    pygame.KSCAN_Q: 7, pygame.KSCAN_W: 8, pygame.KSCAN_E: 9,
    pygame.KSCAN_A: 4, pygame.KSCAN_D: 6,
    pygame.KSCAN_Z: 1, pygame.KSCAN_X: 2, pygame.KSCAN_C: 3,
}
UNDO_KEYS = {pygame.K_KP5, pygame.K_BACKSPACE}
UNDO_SCANCODES = {pygame.KSCAN_S}
CONFIRM_KEYS = {pygame.K_RETURN, pygame.K_KP_ENTER, pygame.K_SPACE}
MUSIC_KEY = pygame.K_m


def key_action(event: pygame.event.Event) -> int | str | None:
    """Map a KEYDOWN to a direction (1-9), 'undo' or None."""
    if event.key in UNDO_KEYS or event.scancode in UNDO_SCANCODES:
        return "undo"
    if event.key in DIR_KEYS:
        return DIR_KEYS[event.key]
    return DIR_SCANCODES.get(event.scancode)


def menu_delta(event: pygame.event.Event) -> tuple[int, int]:
    """(dx, dy) for menu navigation, accepting arrows, numpad and the letter block."""
    d = key_action(event)
    if isinstance(d, int):
        return {8: (0, -1), 2: (0, 1), 4: (-1, 0), 6: (1, 0)}.get(d, (0, 0))
    return (0, 0)


class App:
    def __init__(
        self,
        caption: str = "Symmetro",
        first_scene: Callable[[App], Scene] | None = None,
        music: bool = False,
    ) -> None:
        pygame.init()
        pygame.display.set_caption(caption)
        self.screen = pygame.display.set_mode((WIDTH, HEIGHT))
        self.clock = pygame.time.Clock()
        self.fonts = {size: pygame.font.Font(None, size) for size in (24, 30, 38, 56, 96)}
        self.levels = load_levels()
        self.jukebox = Jukebox(music_dir()) if music else None
        if self.jukebox:
            self.jukebox.start()
        self.scene: Scene | None = (first_scene or Splash)(self)

    def text(self, s: str, size: int, color=TEXT, **pos) -> pygame.Rect:
        surf = self.fonts[size].render(s, True, color)
        rect = surf.get_rect(**pos)
        self.screen.blit(surf, rect)
        return rect

    def run(self) -> None:
        while self.scene is not None:
            for event in pygame.event.get():
                if event.type == pygame.QUIT:
                    self.scene = None
                    break
                if self.jukebox and self.jukebox.handle(event):
                    continue
                if event.type == pygame.KEYDOWN and event.key == MUSIC_KEY and self.jukebox:
                    self.jukebox.toggle()
                    continue
                if event.type == pygame.KEYDOWN:
                    self.scene = self.scene.key(event)
                elif event.type == pygame.TEXTINPUT:
                    self.scene = self.scene.text_input(event.text)
                if self.scene is None:
                    break
            if self.scene is not None:
                self.scene = self.scene.update()
            if self.scene is None:
                break
            self.screen.fill(BG)
            self.scene.draw()
            pygame.display.flip()
            self.clock.tick(60)
        pygame.quit()


class Scene:
    def __init__(self, app: App) -> None:
        self.app = app

    def key(self, event: pygame.event.Event) -> Scene | None:
        return self

    def text_input(self, text: str) -> Scene | None:
        return self

    def update(self) -> Scene | None:
        """Called once per frame, for time-based scene changes."""
        return self

    def draw(self) -> None:
        pass


class Board:
    """A grid fitted into a screen rectangle, with helpers to draw on it."""

    def __init__(self, grid_w: int, grid_h: int, area: pygame.Rect, max_cell: float = 72) -> None:
        self.grid_w, self.grid_h = grid_w, grid_h
        self.cell = min(area.w / grid_w, area.h / grid_h, max_cell)
        gw, gh = self.cell * grid_w, self.cell * grid_h
        self.ox = area.centerx - gw / 2
        self.oy = area.centery - gh / 2
        self.rect = pygame.Rect(round(self.ox), round(self.oy), round(gw), round(gh))
        self.line_w = max(3, round(self.cell / 12))
        self.dot_r = max(6, self.cell / 7)

    def px(self, p: tuple[float, float]) -> tuple[float, float]:
        return (self.ox + p[0] * self.cell, self.oy + p[1] * self.cell)

    def draw_paper(self, screen: pygame.Surface, axes=(), centre=None, paper=PAPER) -> None:
        pygame.draw.rect(screen, paper, self.rect)
        for x in range(self.grid_w + 1):
            pygame.draw.line(screen, GRID, self.px((x, 0)), self.px((x, self.grid_h)))
        for y in range(self.grid_h + 1):
            pygame.draw.line(screen, GRID, self.px((0, y)), self.px((self.grid_w, y)))
        for a, b in axes:
            pygame.draw.line(screen, AXIS, self.px(a), self.px(b), max(4, round(self.cell / 7)))
        if centre:
            pygame.draw.circle(screen, AXIS, self.px(centre), max(6, self.cell / 6))
        pygame.draw.rect(screen, BORDER, self.rect.inflate(4, 4), 3)

    def draw_segments(self, screen: pygame.Surface, segments, color) -> None:
        w = self.line_w
        for a, b in segments:
            pa, pb = self.px(a), self.px(b)
            pygame.draw.line(screen, color, pa, pb, w)
            pygame.draw.circle(screen, color, pa, w / 2)
            pygame.draw.circle(screen, color, pb, w / 2)

    def draw_dot(self, screen: pygame.Surface, p, color, pen: bool = False) -> None:
        if pen:
            pygame.draw.circle(screen, color, self.px(p), self.dot_r * 1.15)
            pygame.draw.circle(screen, INK, self.px(p), self.dot_r * 1.15, 2)
        else:
            pygame.draw.circle(screen, color, self.px(p), self.dot_r)

    def draw_layout(self, screen: pygame.Surface, layout: Layout, paper=PAPER) -> None:
        """Original plus all copies, as a finished picture."""
        self.draw_paper(screen, layout.axes, layout.centre, paper)
        self.draw_segments(screen, layout.original.segments, GREEN)
        for c in layout.copies:
            self.draw_segments(screen, c.segments, GREEN)
        self.draw_dot(screen, layout.original.start, PINK)


class ListMenu(Scene):
    """A vertical list with keyboard selection."""

    title = ""
    visible_rows = 13

    def __init__(self, app: App, selected: int = 0) -> None:
        super().__init__(app)
        self.selected = selected

    def rows(self) -> list[tuple[str, str]]:
        raise NotImplementedError

    def choose(self, index: int) -> Scene | None:
        raise NotImplementedError

    def back(self) -> Scene | None:
        return MainMenu(self.app)

    def horizontal(self, dx: int) -> None:
        pass

    def key(self, event):
        if event.key == pygame.K_ESCAPE:
            return self.back()
        if event.key in CONFIRM_KEYS:
            return self.choose(self.selected)
        dx, dy = menu_delta(event)
        if dy:
            self.selected = (self.selected + dy) % len(self.rows())
        if dx:
            self.horizontal(dx)
        return self

    def footer(self) -> str:
        return "Up/Down: select    Enter: choose    Esc: back"

    def draw(self) -> None:
        app = self.app
        app.text(self.title, 56, midtop=(WIDTH // 2, 40))
        rows = self.rows()
        first = max(0, min(self.selected - self.visible_rows // 2, len(rows) - self.visible_rows))
        y = 130
        for i in range(first, min(len(rows), first + self.visible_rows)):
            left, right = rows[i]
            if i == self.selected:
                pygame.draw.rect(app.screen, PAPER, (140, y - 6, WIDTH - 280, 40), border_radius=8)
                pygame.draw.rect(app.screen, HILITE, (140, y - 6, WIDTH - 280, 40), 2, border_radius=8)
            app.text(left, 38, midleft=(165, y + 14))
            app.text(right, 30, MUTED, midright=(WIDTH - 165, y + 14))
            y += 46
        app.text(self.footer(), 24, MUTED, midbottom=(WIDTH // 2, HEIGHT - 16))


class Splash(Scene):
    """Opening picture; any key or a few seconds lead to the main menu."""

    def __init__(self, app: App) -> None:
        super().__init__(app)
        image = pygame.image.load(SPLASH_PATH).convert()
        # fill the window; any overflow is cropped from the plain grid at the top,
        # which leaves room under the artwork for the "press any key" hint
        scale = max(WIDTH / image.get_width(), HEIGHT / image.get_height())
        size = (round(image.get_width() * scale), round(image.get_height() * scale))
        self.image = pygame.transform.smoothscale(image, size)
        self.rect = self.image.get_rect(midbottom=(WIDTH // 2, HEIGHT))
        self.until = time.perf_counter() + SPLASH_SECONDS

    def key(self, event):
        return MainMenu(self.app)

    def update(self):
        return MainMenu(self.app) if time.perf_counter() >= self.until else self

    def draw(self) -> None:
        self.app.screen.blit(self.image, self.rect)
        self.app.text("Press any key", 30, TEXT, midbottom=(WIDTH // 2, HEIGHT - 12))


class MainMenu(ListMenu):
    title = "SYMMETRO"
    items = ("Play levels", "Random shape", "Best times", "Quit")

    def rows(self):
        return [(item, "") for item in self.items]

    def choose(self, index):
        return [
            lambda: LevelSelect(self.app),
            lambda: RandomSelect(self.app),
            lambda: BestTimes(self.app),
            lambda: None,
        ][index]()

    def back(self):
        return None

    def footer(self):
        return "Up/Down: select    Enter: choose    M: music on/off    Esc: quit"


def fmt_best(key: str) -> str:
    b = scores.best(key)
    return f"best {b['time']:.2f} s" if b else "-"


def level_key(level: Level) -> str:
    return f"level:{level.id}"


def random_key(mode: str, difficulty: str) -> str:
    return f"random:{mode}:{difficulty}"


class LevelSelect(ListMenu):
    title = "Levels"

    def rows(self):
        return [
            (f"{i + 1}. {lv.name}", f"{MODE_NAMES[lv.mode]}   {fmt_best(level_key(lv))}")
            for i, lv in enumerate(self.app.levels)
        ]

    def choose(self, index):
        return level_play(self.app, index)


def level_play(app: App, index: int) -> Scene:
    level = app.levels[index]

    def next_scene() -> Scene:
        if index + 1 < len(app.levels):
            return level_play(app, index + 1)
        return LevelSelect(app, index)

    return Play(
        app,
        build_layout(level.mode, level.shape),
        title=f"Level {index + 1}: {level.name}",
        score_key=level_key(level),
        next_scene=next_scene,
        retry=lambda: level_play(app, index),
        back=lambda: LevelSelect(app, index),
    )


class RandomSelect(ListMenu):
    title = "Random shape"
    difficulty_names = list(DIFFICULTIES)
    difficulty = 1

    def rows(self):
        diff = self.difficulty_names[self.difficulty]
        return [(MODE_NAMES[m], fmt_best(random_key(m, diff))) for m in MODES]

    def horizontal(self, dx):
        RandomSelect.difficulty = (self.difficulty + dx) % len(self.difficulty_names)

    def footer(self):
        return "Up/Down: mode    Left/Right: difficulty    Enter: play    Esc: back"

    def draw(self):
        super().draw()
        diff = self.difficulty_names[self.difficulty]
        self.app.text(f"<  {diff}  >", 38, HILITE, midtop=(WIDTH // 2, HEIGHT - 110))

    def choose(self, index):
        return random_play(self.app, MODES[index], self.difficulty_names[self.difficulty], index)


def random_play(app: App, mode: str, difficulty: str, menu_index: int) -> Scene:
    layout = build_layout(mode, random_shape(difficulty))
    again = lambda: random_play(app, mode, difficulty, menu_index)
    return Play(
        app,
        layout,
        title=f"Random: {MODE_NAMES[mode]} ({difficulty})",
        score_key=random_key(mode, difficulty),
        next_scene=again,
        retry=None,  # Play replays the same layout
        back=lambda: RandomSelect(app, menu_index),
    )


class BestTimes(ListMenu):
    title = "Best times"

    def rows(self):
        data = scores.load()
        names = {level_key(lv): f"{i + 1}. {lv.name}" for i, lv in enumerate(self.app.levels)}
        rows = []
        for lv in self.app.levels:
            entries = data.get(level_key(lv))
            if entries:
                rows.append((names[level_key(lv)], self._fmt(entries[0])))
        for mode in MODES:
            for diff in DIFFICULTIES:
                entries = data.get(random_key(mode, diff))
                if entries:
                    rows.append((f"Random {MODE_NAMES[mode]} ({diff})", self._fmt(entries[0])))
        return rows or [("No times yet - go play!", "")]

    @staticmethod
    def _fmt(e: dict) -> str:
        return f"{e['time']:.2f} s   {e['undos']} undos   {e['date']}"

    def choose(self, index):
        return self


class Play(Scene):
    def __init__(
        self,
        app: App,
        layout: Layout,
        title: str,
        score_key: str,
        next_scene: Callable[[], Scene],
        retry: Callable[[], Scene] | None,
        back: Callable[[], Scene],
    ) -> None:
        super().__init__(app)
        self.layout = layout
        self.round = Round(layout)
        self.title = title
        self.score_key = score_key
        self.next_scene = next_scene
        self.retry = retry or (lambda: Play(app, layout, title, score_key, next_scene, None, back))
        self.back = back
        self.started = time.perf_counter()
        self.elapsed: float | None = None
        self.rank: int | None = None
        self.flash_until = 0.0

        area = pygame.Rect(PAD, HUD_H, WIDTH - 2 * PAD, HEIGHT - HUD_H - FOOTER_H)
        self.board = Board(layout.grid_w, layout.grid_h, area)

    def key(self, event):
        if event.key == pygame.K_ESCAPE:
            return self.back()
        if self.round.finished:
            if event.key in CONFIRM_KEYS:
                return self.next_scene()
            if event.key == pygame.K_r:
                return self.retry()
            return self
        action = key_action(event)
        if action == "undo":
            self.round.undo()
        elif isinstance(action, int):
            result = self.round.move(action)
            if result is Event.COPY_DONE:
                self.flash_until = time.perf_counter() + 0.35
            elif result is Event.ROUND_DONE:
                self.elapsed = time.perf_counter() - self.started
                self.rank = scores.record(self.score_key, self.elapsed, self.round.undos)
        return self

    # --- drawing ---------------------------------------------------------

    def draw(self) -> None:
        screen, board = self.app.screen, self.board
        r, lay = self.round, self.layout

        flashing = time.perf_counter() < self.flash_until
        board.draw_paper(screen, lay.axes, lay.centre, (225, 255, 230) if flashing else PAPER)
        board.draw_segments(screen, lay.original.segments, GREEN)
        for i in range(len(lay.copies)):
            if i < r.copy_index:
                board.draw_segments(screen, r.drawn[i], GREEN)
            elif i == r.copy_index:
                board.draw_segments(screen, r.drawn[i], INK)

        board.draw_dot(screen, lay.original.start, PINK)
        for i in range(r.copy_index + 1, len(lay.copies)):
            board.draw_dot(screen, lay.copies[i].start, PINK)
        if not r.finished:
            board.draw_dot(screen, r.pen, GREEN, pen=True)

        self.draw_hud()

    def draw_hud(self) -> None:
        """Top bar and footer; the result appears here so the board stays visible."""
        app, r = self.app, self.round
        n = len(self.layout.copies)
        app.text(self.title, 38, topleft=(PAD, 18))
        if r.finished:
            if self.rank == 1:
                note, color = "Done!  New best time!", GREEN
            elif self.rank:
                note, color = f"Done!  #{self.rank} on your list", TEXT
            else:
                note, color = f"Done!  ({fmt_best(self.score_key)})", MUTED
            app.text(note, 30, color, topleft=(PAD, 54))
            app.text(f"{self.elapsed:.2f} s", 56, GREEN, topright=(WIDTH - PAD, 14))
            app.text(f"Undos {r.undos}", 30, MUTED, topright=(WIDTH - PAD, 60))
            footer = "Enter: next     R: retry     Esc: back"
        else:
            app.text(MODE_DESCRIPTIONS[self.layout.mode], 30, MUTED, topleft=(PAD, 54))
            elapsed = time.perf_counter() - self.started
            app.text(f"{elapsed:6.1f} s", 56, topright=(WIDTH - PAD, 14))
            app.text(f"Copy {r.copy_index + 1}/{n}    Undos {r.undos}", 30, MUTED,
                     topright=(WIDTH - PAD, 60))
            footer = "Numpad 1-9 or Q W E / A D / Z X C: draw     5 or S: undo     Esc: back"
        app.text(footer, 24, MUTED, midbottom=(WIDTH // 2, HEIGHT - 14))


def run() -> None:
    App(music=True).run()
