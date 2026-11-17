# RoboPose project page

The project page lives at `/robopose/`. Serve the site root over HTTP during local development so the trajectory module can fetch its data.

- `teaser.png` is the original full-resolution overview figure. `media/overview.webp` is its smaller web rendition.
- `media/trajectory.json` and the trajectory comparison video use one 21.85 s robot-mounted recording with 438 synchronized, aligned poses per track. Each sample stores position in metres and an active `[x, y, z, w]` unit quaternion in the aligned Flexiv frame. The position difference is Euclidean distance and the rotation difference is the shortest rotation angle to Flexiv at the same time.
- The results figures summarize tracker accuracy and pose noise. The two RoboTwin clips show successful simulation reruns with both recorded policy end-effector poses in the simulation world frame.
- The pose noise animation shows the six-task mean of per-task progress relative to each task's no-noise baseline. Applications videos play complete released UMI wrist-camera episodes (moving cup 192, stack cups 200, toss 211) with their synchronized end-effector poses at an encoded rate of 30 fps.
- Dataset counts and gallery come from the [public RoboPose dataset](https://huggingface.co/datasets/lihong-cs/robopose) under CC BY 4.0.
