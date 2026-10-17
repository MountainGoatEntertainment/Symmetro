import random

import pytest

from symmetro.game import Event, Round
from symmetro.geometry import MODES, Shape, build_layout, crossing_diagonal
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
