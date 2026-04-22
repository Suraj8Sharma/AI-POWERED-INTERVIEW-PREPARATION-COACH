"""
Webcam body-language analysis using MediaPipe Pose (Tasks API).

MediaPipe 0.10.31+ for Python no longer ships ``mp.solutions``; this module uses
``PoseLandmarker`` (image + video modes) with a bundled ``.task`` model file.

Public API
----------
    analyze_webcam_session(...) -> dict
    analyze_camera_snapshot_rgb(...) -> dict
    BodyLanguageAnalyzer.analyze_pose_landmarks(landmark_list) -> dict
"""

from __future__ import annotations

import os
import time
import urllib.request
from collections import deque
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Any, Callable, Optional

import cv2
import numpy as np

from mediapipe.tasks.python.core import base_options as base_options_lib
from mediapipe.tasks.python.vision import (
    PoseLandmarker,
    PoseLandmarkerOptions,
    PoseLandmarksConnections,
    RunningMode,
    drawing_utils,
)
from mediapipe.tasks.python.vision.core.image import Image as MPImage
from mediapipe.tasks.python.vision.core.image import ImageFormat
from mediapipe.tasks.python.vision.pose_landmarker import PoseLandmark


# Google-hosted full pose model (downloaded once into video_capture/models/).
POSE_MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/"
    "pose_landmarker_full/float16/latest/pose_landmarker_full.task"
)


def _model_dir() -> Path:
    d = Path(__file__).resolve().parent / "models"
    d.mkdir(parents=True, exist_ok=True)
    return d


def ensure_pose_model_path() -> Path:
    """
    Return path to ``pose_landmarker_full.task``, downloading if missing.
    Override with env ``MEDIAPIPE_POSE_MODEL`` (absolute path to a .task file).
    """
    override = os.getenv("MEDIAPIPE_POSE_MODEL")
    if override:
        p = Path(override)
        if not p.is_file():
            raise FileNotFoundError(f"MEDIAPIPE_POSE_MODEL not found: {p}")
        return p

    dest = _model_dir() / "pose_landmarker_full.task"
    if dest.is_file() and dest.stat().st_size > 1_000_000:
        return dest

    print(f"[video_analysis] Downloading pose model to {dest} ...")
    try:
        urllib.request.urlretrieve(POSE_MODEL_URL, dest)
    except Exception as e:
        raise RuntimeError(
            f"Could not download pose model. Place the file manually at {dest} "
            f"or set MEDIAPIPE_POSE_MODEL. Error: {e}"
        ) from e
    return dest


@lru_cache(maxsize=1)
def _pose_landmarker_image(model_path: str) -> PoseLandmarker:
    opts = PoseLandmarkerOptions(
        base_options=base_options_lib.BaseOptions(model_asset_path=model_path),
        running_mode=RunningMode.IMAGE,
        num_poses=1,
        min_pose_detection_confidence=0.65,
        min_pose_presence_confidence=0.65,
        min_tracking_confidence=0.65,
    )
    return PoseLandmarker.create_from_options(opts)


def _np_rgb_to_mp_image(rgb: np.ndarray) -> MPImage:
    data = np.ascontiguousarray(rgb, dtype=np.uint8)
    return MPImage(image_format=ImageFormat.SRGB, data=data)


# -----------------------------------------------------------------------------
# Geometry helpers
# -----------------------------------------------------------------------------


def _angle_deg_2d(a: np.ndarray, b: np.ndarray, c: np.ndarray) -> float:
    ba = a[:2] - b[:2]
    bc = c[:2] - b[:2]
    denom = (np.linalg.norm(ba) * np.linalg.norm(bc)) + 1e-9
    cos_v = float(np.clip(np.dot(ba, bc) / denom, -1.0, 1.0))
    return float(np.degrees(np.arccos(cos_v)))


def _lm_xyv_list(lm_list: list, idx: int) -> tuple[np.ndarray, float]:
    p = lm_list[idx]
    x = float(p.x) if p.x is not None else 0.0
    y = float(p.y) if p.y is not None else 0.0
    vis = float(p.visibility) if p.visibility is not None else 1.0
    return np.array([x, y], dtype=np.float64), vis


def _body_scale(ls: np.ndarray, rs: np.ndarray) -> float:
    return max(float(np.linalg.norm(ls[:2] - rs[:2])), 1e-4)


# -----------------------------------------------------------------------------
# Analyzer (single frame + rolling state)
# -----------------------------------------------------------------------------


@dataclass
class BodyLanguageAnalyzer:
    history: int = 24
    _nose_hist: deque = field(init=False)
    _lw_hist: deque = field(init=False)
    _rw_hist: deque = field(init=False)

    def __post_init__(self) -> None:
        self._nose_hist = deque(maxlen=self.history)
        self._lw_hist = deque(maxlen=self.history)
        self._rw_hist = deque(maxlen=self.history)

    def reset(self) -> None:
        self._nose_hist.clear()
        self._lw_hist.clear()
        self._rw_hist.clear()

    def analyze_pose_landmarks(self, landmark_list: list) -> dict[str, float]:
        """
        ``landmark_list``: 33 ``NormalizedLandmark`` from MediaPipe Tasks.
        """
        PL = PoseLandmark
        nose, v_n = _lm_xyv_list(landmark_list, PL.NOSE)
        ls, v_ls = _lm_xyv_list(landmark_list, PL.LEFT_SHOULDER)
        rs, v_rs = _lm_xyv_list(landmark_list, PL.RIGHT_SHOULDER)
        le, v_le = _lm_xyv_list(landmark_list, PL.LEFT_ELBOW)
        re, v_re = _lm_xyv_list(landmark_list, PL.RIGHT_ELBOW)
        lw, v_lw = _lm_xyv_list(landmark_list, PL.LEFT_WRIST)
        rw, v_rw = _lm_xyv_list(landmark_list, PL.RIGHT_WRIST)
        lh, v_lh = _lm_xyv_list(landmark_list, PL.LEFT_HIP)
        rh, v_rh = _lm_xyv_list(landmark_list, PL.RIGHT_HIP)

        vis = min(v_n, v_ls, v_rs, v_le, v_re, v_lw, v_rw)
        if vis < 0.5:
            return {
                "visibility": float(vis),
                "openness": 0.5,
                "fidgeting": 0.5,
                "engagement": 0.5,
                "posture": 0.5,
            }


        scale = _body_scale(ls, rs)
        mid_sh = (ls + rs) / 2.0
        mid_hip = (lh + rh) / 2.0

        ang_l = _angle_deg_2d(ls, le, lw)
        ang_r = _angle_deg_2d(rs, re, rw)
        elbow_open = (
            np.clip((ang_l - 60.0) / 120.0, 0.0, 1.0)
            + np.clip((ang_r - 60.0) / 120.0, 0.0, 1.0)
        ) / 2.0

        wrist_sep = float(np.linalg.norm(lw[:2] - rw[:2])) / scale
        spread = float(np.clip((wrist_sep - 0.3) / 1.2, 0.0, 1.0))


        cx = 0.5 * (min(ls[0], rs[0]) + max(ls[0], rs[0]))
        wrists_center_x = 0.5 * (lw[0] + rw[0])
        crossed_x = abs(wrists_center_x - cx) < 0.08 * scale * 10.0
        wrists_high = lw[1] < mid_sh[1] + 0.12 and rw[1] < mid_sh[1] + 0.12
        tight_sep = wrist_sep < 0.55
        cross_penalty = 0.45 if (crossed_x and tight_sep and wrists_high) else 0.0

        openness = float(
            np.clip(0.55 * elbow_open + 0.45 * spread - cross_penalty, 0.0, 1.0)
        )

        self._lw_hist.append(lw.copy())
        self._rw_hist.append(rw.copy())
        self._nose_hist.append(nose.copy())

        fidget = 0.35
        if len(self._lw_hist) >= 2:
            d_l = float(np.linalg.norm(self._lw_hist[-1] - self._lw_hist[-2]))
            d_r = float(np.linalg.norm(self._rw_hist[-1] - self._rw_hist[-2]))
            inst = (d_l + d_r) / (2.0 * scale + 1e-6)
            fidget = float(np.clip((inst - 0.008) / 0.12, 0.0, 1.0))


        if len(self._lw_hist) >= 4:
            buf_l = list(self._lw_hist)[-8:]
            buf_r = list(self._rw_hist)[-8:]
            vars_ = []
            for buf in (buf_l, buf_r):
                arr = np.stack(buf, axis=0)
                vars_.append(float(np.var(arr, axis=0).mean()))
            var_m = float(np.mean(vars_)) / (scale**2 + 1e-6)
            fidget = max(fidget, float(np.clip(1.0 * var_m / 0.02, 0.0, 1.0)))


        shoulder_mid_x = mid_sh[0]
        off = abs(nose[0] - shoulder_mid_x) / (scale + 1e-6)
        facing = float(np.clip(1.0 - 2.8 * off, 0.0, 1.0))

        stability = 0.75
        if len(self._nose_hist) >= 3:
            arr = np.stack(list(self._nose_hist)[-10:], axis=0)
            nvar = float(np.var(arr, axis=0).mean()) / (scale**2 + 1e-6)
            stability = float(np.clip(1.0 - 30.0 * nvar, 0.0, 1.0))

        lean_fwd = float(
            np.clip((mid_sh[1] - nose[1]) / (scale * 3.0 + 1e-6), -0.3, 0.5)
        )
        lean_bonus = float(np.clip(0.25 + lean_fwd, 0.0, 1.0))
        engagement = float(
            np.clip(0.55 * facing + 0.35 * stability + 0.10 * lean_bonus, 0.0, 1.0)
        )

        shoulder_tilt = abs(ls[1] - rs[1]) / (scale + 1e-6)
        level = float(np.clip(1.0 - 12.0 * shoulder_tilt, 0.0, 1.0))

        upright = float(mid_sh[1] - nose[1])
        upright_score = float(np.clip((upright - 0.01) / 0.12, 0.0, 1.0))

        spine_tilt = float(
            np.arctan2(mid_hip[1] - mid_sh[1], abs(mid_hip[0] - mid_sh[0]) + 1e-6)
        )
        lean_side = float(np.clip(1.0 - abs(spine_tilt) / 0.35, 0.0, 1.0))

        posture = float(
            np.clip(0.45 * level + 0.40 * upright_score + 0.15 * lean_side, 0.0, 1.0)
        )

        return {
            "visibility": vis,
            "openness": openness,
            "fidgeting": fidget,
            "engagement": engagement,
            "posture": posture,
        }


def _draw_pose_on_rgb(rgb: np.ndarray, lm_list: list) -> np.ndarray:
    """Draw pose skeleton; ``drawing_utils`` expects BGR."""
    bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    pt_spec = drawing_utils.DrawingSpec(
        color=(60, 220, 80), thickness=2, circle_radius=3
    )
    ln_spec = drawing_utils.DrawingSpec(color=(80, 200, 255), thickness=2)
    drawing_utils.draw_landmarks(
        bgr,
        lm_list,
        PoseLandmarksConnections.POSE_LANDMARKS,
        landmark_drawing_spec=pt_spec,
        connection_drawing_spec=ln_spec,
    )
    return cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)


# -----------------------------------------------------------------------------
# Streamlit / single-frame snapshot
# -----------------------------------------------------------------------------


def analyze_camera_snapshot_rgb(
    rgb: np.ndarray,
    *,
    draw_skeleton: bool = True,
) -> dict[str, Any]:
    empty = {
        "openness": 0.5,
        "fidgeting": 0.5,
        "engagement": 0.5,
        "posture": 0.5,
        "probabilities": {
            "openness": 0.5,
            "fidgeting": 0.5,
            "engagement": 0.5,
            "posture": 0.5,
        },
        "pose_visible_fraction": 0.0,
        "frames_processed": 0,
        "duration_seconds": 0.0,
        "summary": "No image.",
        "error": None,
        "annotated_rgb": None,
        "_source": "snapshot",
    }

    if rgb is None or rgb.size == 0:
        empty["summary"] = "Empty camera image."
        return empty

    if rgb.ndim != 3 or rgb.shape[2] < 3:
        empty["summary"] = "Expected an RGB image."
        return empty

    rgb_u8 = np.ascontiguousarray(rgb[:, :, :3], dtype=np.uint8)
    h, w = rgb_u8.shape[:2]
    if h < 64 or w < 64:
        empty["summary"] = "Image too small for pose detection."
        return empty

    model_path = str(ensure_pose_model_path())
    landmarker = _pose_landmarker_image(model_path)
    result = landmarker.detect(_np_rgb_to_mp_image(rgb_u8))

    if not result.pose_landmarks:
        out = {**empty}
        out["summary"] = (
            "No pose detected — sit centred, face the camera, keep shoulders and "
            "upper chest in frame."
        )
        out["annotated_rgb"] = rgb_u8.copy()
        out["frames_processed"] = 1
        return out

    lm_list = result.pose_landmarks[0]
    analyzer = BodyLanguageAnalyzer(history=20)

    m = analyzer.analyze_pose_landmarks(lm_list)

    annotated = (
        _draw_pose_on_rgb(rgb_u8, lm_list) if draw_skeleton else rgb_u8.copy()
    )

    vis_ok = m.get("visibility", 0) >= 0.35
    o = round(float(m["openness"]), 3)
    f = round(float(m["fidgeting"]), 3)
    e = round(float(m["engagement"]), 3)
    p_ = round(float(m["posture"]), 3)

    summary = (
        f"Snapshot — openness {o:.0%}, fidgeting {f:.0%}, engagement {e:.0%}, "
        f"posture {p_:.0%}. "
        + (
            "(Fidgeting is more reliable in the multi-second sample.)"
            if vis_ok
            else ""
        )
    )

    return {
        "openness": o,
        "fidgeting": f,
        "engagement": e,
        "posture": p_,
        "probabilities": {
            "openness": o,
            "fidgeting": f,
            "engagement": e,
            "posture": p_,
        },
        "pose_visible_fraction": 1.0 if vis_ok else 0.0,
        "frames_processed": 1,
        "duration_seconds": 0.0,
        "summary": summary.strip(),
        "error": None,
        "annotated_rgb": annotated,
        "_source": "snapshot",
    }


# -----------------------------------------------------------------------------
# Webcam session
# -----------------------------------------------------------------------------


def analyze_webcam_session(
    seconds: float = 7.0,
    camera_index: int = 0,
    frame_callback: Optional[Callable[[np.ndarray, dict[str, float] | None], None]] = None,
) -> dict[str, Any]:
    t0 = time.perf_counter()
    out: dict[str, Any] = {
        "openness": 0.5,
        "fidgeting": 0.5,
        "engagement": 0.5,
        "posture": 0.5,
        "probabilities": {
            "openness": 0.5,
            "fidgeting": 0.5,
            "engagement": 0.5,
            "posture": 0.5,
        },
        "pose_visible_fraction": 0.0,
        "frames_processed": 0,
        "duration_seconds": 0.0,
        "summary": "No samples captured.",
        "error": None,
    }

    cap = cv2.VideoCapture(camera_index)
    if not cap.isOpened():
        out["error"] = f"Could not open camera index {camera_index}."
        out["summary"] = out["error"]
        return out

    model_path = str(ensure_pose_model_path())
    opts = PoseLandmarkerOptions(
        base_options=base_options_lib.BaseOptions(model_asset_path=model_path),
        running_mode=RunningMode.VIDEO,
        num_poses=1,
        min_pose_detection_confidence=0.65,
        min_pose_presence_confidence=0.65,
        min_tracking_confidence=0.65,
    )
    landmarker = PoseLandmarker.create_from_options(opts)

    analyzer = BodyLanguageAnalyzer(history=36)
    sums = {k: 0.0 for k in ("openness", "fidgeting", "engagement", "posture")}
    pose_frames = 0
    total_frames = 0
    frame_ms = 0

    try:
        end = time.perf_counter() + float(seconds)
        while time.perf_counter() < end:
            ok, frame = cap.read()
            if not ok or frame is None:
                continue
            total_frames += 1
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            mp_img = _np_rgb_to_mp_image(rgb)
            frame_ms += 33
            result = landmarker.detect_for_video(mp_img, frame_ms)

            metrics = None
            if result.pose_landmarks:
                lm_list = result.pose_landmarks[0]
                m = analyzer.analyze_pose_landmarks(lm_list)
                if m.get("visibility", 0) >= 0.35:
                    pose_frames += 1
                    for k in sums:
                        sums[k] += m[k]
                    metrics = {k: m[k] for k in sums}
            if frame_callback is not None:
                frame_callback(frame, metrics)
    finally:
        landmarker.close()
        cap.release()

    out["duration_seconds"] = round(time.perf_counter() - t0, 3)
    out["frames_processed"] = total_frames
    if total_frames > 0:
        out["pose_visible_fraction"] = round(pose_frames / total_frames, 3)

    if pose_frames > 0:
        for k in sums:
            v = sums[k] / pose_frames
            sums[k] = v
            out[k] = round(float(v), 3)
        out["probabilities"] = {
            "openness": out["openness"],
            "fidgeting": out["fidgeting"],
            "engagement": out["engagement"],
            "posture": out["posture"],
        }
        parts = [
            f"Openness {out['openness']:.0%}",
            f"fidgeting {out['fidgeting']:.0%}",
            f"engagement {out['engagement']:.0%}",
            f"posture {out['posture']:.0%}",
        ]
        out["summary"] = (
            f"Pose visible in {out['pose_visible_fraction']:.0%} of frames. "
            + ", ".join(parts)
            + "."
        )
    else:
        out["summary"] = (
            "Upper body not detected reliably — sit centered, brighten the room, "
            "and keep shoulders in frame."
        )

    return out


if __name__ == "__main__":
    print("Sampling 5s from default webcam (Ctrl+C to abort)...")
    print(analyze_webcam_session(seconds=5.0))
