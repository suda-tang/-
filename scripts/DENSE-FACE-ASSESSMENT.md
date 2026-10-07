# Dense reconstruction assessment — 2026-10-03

The previous MediaPipe + generic-head surface fitting is not an acceptable likeness. Its functionality (rotation, skin mapping and audio) does not establish identity fidelity.

3DDFA_V2 official code https://github.com/cleardusk/3DDFA_V2 was downloaded privately. MobileNet 120x120 weights were exported to ONNX and successfully evaluated with CPUExecutionProvider. The candidate contains 38,365 face vertices. No dense candidate has been published or substituted for the current viewer because visual inspection failed the quality requirement.

Pipeline: scripts/reconstruct-mentor-dense.py --export (avatar-env), then the same script for side-view reconstruction; extract-mentor-frontal.py (face-env), then reconstruct-mentor-dense.py --frontal. preview-dense-face.cjs and preview-dense-frontal.cjs render actual WebGL front/side views. All candidate outputs remain under .sites-runtime/avatar-source. The baseline scripts/fit-mentor-face.py output is separate.

Evidence: the named, authorized frontal video 1a25e89d017f79ff971997a8df699e41.mp4 supplies 60 matching frames. The selected frame at 22 seconds has only 59.1 x 64.6 face pixels. The 12 highest scored frames span roughly 56–59 x 63–68 pixels. Its frontal candidate is blurry and lacks skin detail. The larger interview f922ad0fa273a637876ad1b4d9ddbef3.mp4 provides a side-biased view; projecting this into a frontal dense mesh contaminates the hidden cheek with neighbouring image content. This is visible in dense-front.png and is a rejected result.

Further work requires suitable reference input: original, sharp frontal and left/right 45-degree/side views, consistent diffuse light, no beautification, full forehead/jaw visible. Do not invent unseen facial details, inflate or upsample low-resolution footage and claim fidelity, or upload the person's private footage to an external avatar service without authorization for that transfer. CPU inference itself is working; input quality and complete head/hair reconstruction remain unresolved.
