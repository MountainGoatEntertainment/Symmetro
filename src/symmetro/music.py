"""Background music: the mp3 files of a folder, in alphabetical order, on repeat."""

from __future__ import annotations

import os
from pathlib import Path

import pygame


def music_dir() -> Path:
    override = os.environ.get("SYMMETRO_MUSIC")
    return Path(override) if override else Path.cwd() / "music"


def find_tracks(directory: Path) -> list[Path]:
    """The mp3 files in the folder, sorted alphabetically (ignoring case)."""
    try:
        files = [p for p in directory.iterdir() if p.is_file() and p.suffix.lower() == ".mp3"]
    except OSError:
        return []
    return sorted(files, key=lambda p: (p.name.lower(), p.name))


def next_track(tracks: list[Path], current: Path | None) -> Path | None:
    """The track after `current`, wrapping around to the first after the last."""
    if not tracks:
        return None
    if current is not None:
        key = (current.name.lower(), current.name)
        for p in tracks:
            if (p.name.lower(), p.name) > key:
                return p
    return tracks[0]


class Jukebox:
    """Plays the folder's tracks one after another; toggle() pauses and resumes."""

    def __init__(self, directory: Path) -> None:
        self.directory = directory
        self.current: Path | None = None
        self.playing = False
        try:
            if not pygame.mixer.get_init():
                pygame.mixer.init()
        except pygame.error:
            self.end_event = None  # no audio device: stay silent
            return
        self.end_event = pygame.event.custom_type()
        pygame.mixer.music.set_endevent(self.end_event)

    def start(self) -> None:
        if self.end_event is not None:
            self.playing = self._play_next()

    def toggle(self) -> None:
        if self.end_event is None:
            return
        if self.playing:
            pygame.mixer.music.pause()
            self.playing = False
        elif self.current is not None:
            pygame.mixer.music.unpause()
            self.playing = True
        else:
            self.start()  # nothing was found at launch; look again

    def handle(self, event: pygame.event.Event) -> bool:
        """Advance on the end-of-track event; True if the event was ours."""
        if self.end_event is None or event.type != self.end_event:
            return False
        if self.playing:
            self.playing = self._play_next()
        return True

    def _play_next(self) -> bool:
        # the folder is read again each time, so added or removed files are picked up
        tracks = find_tracks(self.directory)
        for _ in tracks:  # skip files that fail to load, but don't loop forever
            self.current = next_track(tracks, self.current)
            try:
                pygame.mixer.music.load(self.current)
                pygame.mixer.music.play()
                return True
            except pygame.error:
                continue
        self.current = None
        return False
