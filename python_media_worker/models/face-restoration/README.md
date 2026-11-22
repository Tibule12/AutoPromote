The ordinary Studio face restoration stage uses the official GFPGANv1.4 model.
Run `python install_face_restoration_model.py` at build time. The manifest pins
its SHA256; rendering refuses missing or different weights and never downloads.
The model is an explicit generative reconstruction, not recovered camera detail.
Architecture source, license, attribution and modifications are retained under
`third_party/gfpgan_clean`. CPU and CUDA execute the same model; the latter is
preferred. Original source/audio stay separate and the amount is editable.
