# RoboPose project page

The project page lives at `/robopose/`. Serve the site root over HTTP during local development so the trajectory module can fetch its data.

- `teaser.png` is the original full-resolution overview figure. `media/overview.webp` is its smaller web rendition.
- `media/trajectory.json` and the trajectory comparison video use one 21.85 s robot-mounted recording with 438 synchronized, aligned position samples per track. The position differences are Euclidean distances to the same-timestamp Flexiv end-effector sample.
- The results figures summarize tracker accuracy and pose noise. The two RoboTwin clips are selected successful simulation reruns.
- The pose noise animation shows the six-task mean of per-task progress relative to each task's no-noise baseline. Applications videos play complete released UMI wrist-camera episodes (moving cup 192, stack cups 200, toss 211) at an encoded rate of 30 fps.
- Dataset counts and gallery come from the [public RoboPose dataset](https://huggingface.co/datasets/lihong-cs/robopose) under CC BY 4.0.
