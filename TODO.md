# Video Analysis Precision Improvement TODO

## Plan Steps:
- [x] Tune MediaPipe confidence thresholds to 0.65
- [x] Update visibility threshold to 0.5
- [x] Adjust fidgeting: inst threshold=0.008/div=0.12, var=0.02*1.0, add EMA smoothing (alpha=0.3)
- [x] Tighten posture/engagement params (shoulder_tilt=15.0, nvar=30.0, upright=0.02/0.15)
- [x] Reduce history to 24 frames
- [x] Edit video_analysis.py with changes
- [x] Test: python AI_BACKEND/video_capture/video_analysis.py → fidgeting <0.2 for still pose
- [x] Update TODO on completion
- [x] attempt_completion
