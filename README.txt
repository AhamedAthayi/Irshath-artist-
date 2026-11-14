SOURCE CODE (React + CSS + JavaScript)

src/app.jsx     React app: all pages, shop, cart, WhatsApp orders, promotions, admin page
css/style.css   Main styles (colours, buttons, shop, hero, responsive)
css/extra.css   Splash, promotion pop-up/slider, admin page, button effects, phone layout
template.html   HTML page shell that the build fills in
build.mjs       Build script: bundles React + CSS + images into one HTML file
prep.py         Converts the artwork photos to web sizes (needs Python + Pillow)

To rebuild: npm install, then npm run build (needs the art images in the web/ folder that prep.py creates).
Default admin password is Irshath@2026 - change it inside the admin page.
