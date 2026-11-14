import glob, os
from PIL import Image
RAW = "/home/claude/work/raw"
WEB = "/home/claude/work/web"
os.makedirs(WEB, exist_ok=True)
files = sorted(glob.glob(os.path.join(RAW, "p-*.jpg")))
for i, f in enumerate(files, 1):
    im = Image.open(f).convert("RGB")
    im.thumbnail((640, 640))
    im.save(os.path.join(WEB, f"art-{i:02d}.jpg"), quality=70, optimize=True, progressive=True)
    if i <= 5:
        h = Image.open(f).convert("RGB")
        h.thumbnail((1200, 1200))
        h.save(os.path.join(WEB, f"hero-{i:02d}.jpg"), quality=70, optimize=True, progressive=True)
logo = Image.open("/mnt/user-data/uploads/1000123932.jpg").convert("RGB")
logo.thumbnail((420, 420))
logo.save(os.path.join(WEB, "logo.jpg"), quality=82, optimize=True)
print("images:", len(files))
