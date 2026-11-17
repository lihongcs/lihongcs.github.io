# RoboPose project page

The project page lives at `/robopose/`. Serve the site root over HTTP during local development so the trajectory module can fetch its data.

- `teaser.png` is the original full-resolution overview figure. `media/overview.webp` is its smaller web rendition.
- `media/trajectory.json` and the trajectory comparison video use one 21.85 s robot-mounted recording with 438 synchronized, aligned poses per track. Each sample stores position in metres and an active `[x, y, z, w]` unit quaternion in the aligned Flexiv frame. The position difference is Euclidean distance and the rotation difference is the shortest rotation angle to Flexiv at the same time.
- The results figures summarize tracker accuracy and pose noise. The two RoboTwin clips show successful simulation reruns with both recorded policy end-effector poses in the simulation world frame.
- The tracker accuracy animation charts the per-condition results and then their mean for each tracker and metric, with separate axes for translation and rotation. The inputs are the normal conditions in manuscript Table II and the diverse conditions in the archived tracker comparison. The summary equally averages condition means for APE, RPE (0.5 s), UMI-TRPE (H = 16) and PRCE. ROE uses the two robot-mounted conditions. Acquisition rates, latency and UMI-TRPE (H = 50) are reported separately in Table II.
- The pose noise animation replays the first 241 frames of the same recorded UMI demonstration from `trajectory_240.npz` at each level. The study's relative-motion sampler and archived seeds reconstruct the full perturbed trajectories before trimming. The synchronized curves show applied step perturbations and accumulated clean-relative trajectory errors, alongside the six-task mean of per-task policy progress relative to that task's clean result.
- Applications videos play complete released UMI wrist-camera episodes (moving cup 192, stack cups 200, toss 211) with their synchronized end-effector poses at an encoded rate of 30 fps.
- Dataset counts and gallery come from the [public RoboPose dataset](https://huggingface.co/datasets/lihong-cs/robopose) under CC BY 4.0.
