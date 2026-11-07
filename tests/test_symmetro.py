import random

import pytest

from symmetro.game import Event, Round
from symmetro import scores
from symmetro.geometry import MODES, Shape, build_layout, crossing_diagonal, min_moves
from symmetro.levels import DIFFICULTIES, load_levels, random_shape

ARCH = Shape.from_moves("88963224884224")


def test_arch_matches_picture():
    assert len(ARCH.segments) == 14
    assert ARCH.bbox() == (0, -3, 3, 0)


def test_mirror_v_start_matches_picture():
    # symmetro2.png: original start at x=2, axis at x=6, green dot at x=10
    lay = build_layout("mirror_v", ARCH)
    assert lay.axes[0][0][0] == 5  # margin 1 here, so axis sits at x=5
    assert lay.copies[0].start[0] == 2 * 5 - lay.original.start[0]


@pytest.mark.parametrize("mode", MODES)
def test_layouts_fit_and_do_not_touch_guides(mode):
    lay = build_layout(mode, ARCH)
    for shape in (lay.original, *lay.copies):
        x0, y0, x1, y1 = shape.bbox()
        assert 0 <= x0 and x1 <= lay.grid_w and 0 <= y0 and y1 <= lay.grid_h
        assert len(shape.segments) == len(ARCH.segments)
    # copies never overlap the original or each other
    all_pts = [s.points() for s in (lay.original, *lay.copies)]
    for i in range(len(all_pts)):
        for j in range(i + 1, len(all_pts)):
            assert not all_pts[i] & all_pts[j]


def play(round_: Round, moves: str) -> Event:
    result = Event.NONE
    for ch in moves:
        result = round_.move(int(ch))
    return result


def test_mirror_round_and_retracing():
    r = Round(build_layout("mirror_v", ARCH))
    # mirrored arch: left<->right swapped (7<->9, 4<->6, 1<->3)
    assert play(r, "88741226886226") is Event.ROUND_DONE
    assert r.finished


def test_any_route_counts():
    r = Round(build_layout("copy", Shape.from_moves("66")))
    assert play(r, "6") is Event.MOVED
    assert play(r, "4") is Event.MOVED  # retrace only moves the pen
    assert len(r.drawn[0]) == 1


def test_undo_and_wrong_lines():
    r = Round(build_layout("copy", Shape.from_moves("66")))
    play(r, "6")
    play(r, "8")  # wrong, drawn silently
    assert r.undo() is Event.MOVED
    assert r.undos == 1
    assert play(r, "6") is Event.ROUND_DONE
    assert (r.moves, r.minimum) == (4, 2)  # the undo counts as a move
    assert r.ratio == 0.5


def test_quad_advances_through_three_copies():
    r = Round(build_layout("quad", Shape.from_moves("6")))
    assert play(r, "4") is Event.COPY_DONE
    assert play(r, "4") is Event.COPY_DONE
    assert r.undo() is Event.NONE  # history resets per copy
    assert play(r, "6") is Event.ROUND_DONE


def test_cannot_leave_grid():
    lay = build_layout("copy", Shape.from_moves("6"))
    r = Round(lay)
    r.pen = (0, 0)
    assert r.move(7) is Event.NONE


def test_levels_load():
    levels = load_levels()
    assert len({lv.id for lv in levels}) == len(levels)
    for lv in levels:
        build_layout(lv.mode, lv.shape)


@pytest.mark.parametrize("difficulty", DIFFICULTIES)
def test_random_shapes(difficulty):
    rng = random.Random(1)
    for _ in range(50):
        shape = random_shape(difficulty, rng)
        assert len(shape.segments) >= DIFFICULTIES[difficulty][2]
        assert not any(crossing_diagonal(s) in shape.segments for s in shape.segments)


def test_save_level_appends_and_reloads(tmp_path):
    import shutil

    from symmetro.levels import LEVELS_PATH, save_level

    path = tmp_path / "levels.json"
    shutil.copy(LEVELS_PATH, path)
    before = load_levels(path)
    assert save_level("Arch", "rot90", "8896", path) == "arch"
    assert save_level("Arch", "copy", "66", path) == "arch-2"
    after = load_levels(path)
    assert len(after) == len(before) + 2
    assert after[-1].mode == "copy" and after[-1].shape == Shape.from_moves("66")


def test_trimmed_moves_drops_trailing_retrace():
    from symmetro.editor import trimmed_moves

    assert trimmed_moves((0, 0), [6, 6, 4, 4]) == "66"
    assert trimmed_moves((0, 0), [6, 4, 8]) == "648"


def test_music_tracks_sorted_and_wrap(tmp_path):
    from symmetro.music import find_tracks, next_track

    for name in ("b.mp3", "A.MP3", "c.mp3", "notes.txt"):
        (tmp_path / name).write_bytes(b"")
    (tmp_path / "sub.mp3").mkdir()
    tracks = find_tracks(tmp_path)
    assert [p.name for p in tracks] == ["A.MP3", "b.mp3", "c.mp3"]
    assert next_track(tracks, None).name == "A.MP3"
    assert next_track(tracks, tracks[0]).name == "b.mp3"
    assert next_track(tracks, tracks[-1]).name == "A.MP3"
    # a track that was removed meanwhile: continue with the one after it
    assert next_track(tracks, tmp_path / "bb.mp3").name == "c.mp3"
    assert next_track([], None) is None
    assert find_tracks(tmp_path / "missing") == []


@pytest.mark.parametrize(
    ("moves", "expected"),
    [
        ("66", 2),        # a straight line from one end
        ("64", 1),        # walking back over a line adds nothing to the shape
        ("6262", 4),      # a closed square
        ("6448", 4),      # start in the middle of a path: one side has to be walked back
        ("6446822", 7),   # a plus sign from its centre: three arms out and back, then one
    ],
)
def test_min_moves(moves, expected):
    assert min_moves(Shape.from_moves(moves)) == expected


def test_round_minimum_covers_every_copy():
    r = Round(build_layout("quad", Shape.from_moves("66")))
    assert r.minimum == 6
    assert play(r, "44") is Event.COPY_DONE


def test_scores_rank_by_ratio_then_time(tmp_path, monkeypatch):
    monkeypatch.setenv("SYMMETRO_SCORES", str(tmp_path / "scores.json"))
    assert scores.record("k", moves=25, minimum=20, seconds=5.0, undos=0) == 1
    assert scores.record("k", moves=20, minimum=20, seconds=9.0, undos=0) == 1
    assert scores.record("k", moves=20, minimum=20, seconds=7.0, undos=0) == 1
    assert scores.record("k", moves=40, minimum=20, seconds=1.0, undos=0) == 4
    assert [e["percent"] for e in scores.load()["k"]] == [100, 100, 80, 50]
    assert scores.percent(250, 251) == 99


def test_old_time_scores_are_moved_aside(tmp_path, monkeypatch):
    path = tmp_path / "scores.json"
    monkeypatch.setenv("SYMMETRO_SCORES", str(path))
    path.write_text('{"k": [{"time": 3.2, "undos": 0, "date": "2026-01-01"}]}')
    assert scores.load() == {}
    assert (tmp_path / "scores-times.json").exists()
    assert not path.exists()
